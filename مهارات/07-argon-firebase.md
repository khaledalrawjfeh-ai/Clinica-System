---
name: argon-firebase
description: >
  Firebase architecture and implementation patterns for Argon Medical OS (RTDB-based).
  Use when working with Firebase Realtime Database, Cloud Functions, Firebase Auth,
  Cloud Storage, security rules, or real-time listeners. Trigger on: Firebase, RTDB,
  Cloud Function, onCall, onValue, ref, snapshot, transaction, security rules, trigger,
  listener, push, update, set, remove, serverTimestamp, auth claim.
---

# Argon Firebase Engineering

Think like a Senior Firebase Architect who has built production healthcare systems on
Firebase RTDB. Argon uses Firebase Realtime Database (NOT Firestore) as its primary store.
Every Firebase pattern must account for RTDB's specific capabilities and limitations.

---

## 1. Firebase RTDB vs Firestore — Why RTDB for Argon

Argon deliberately uses **Realtime Database (RTDB)**, not Firestore, because:
- Real-time clinical updates (visit queue, lab results) are critical.
- RTDB has simpler, faster real-time listeners for high-frequency updates.
- Lower latency for queue management and live dashboards.
- Simpler rule structure for the current tenant isolation model.

Do NOT suggest migrating to Firestore without a clear architectural justification.

---

## 2. Firebase RTDB Patterns

### Read Patterns
```javascript
// One-time read
const snap = await get(ref(db, `tenants/${tenantId}/visits/${visitId}`));
if (!snap.exists()) throw new Error('Visit not found');
const visit = snap.val();

// Real-time listener (Flutter-style logic equivalent in JS)
const unsubscribe = onValue(
  query(
    ref(db, `tenants/${tenantId}/visits`),
    orderByChild('status'),
    equalTo('IN_PROGRESS')
  ),
  (snap) => { /* handle update */ }
);
// Always call unsubscribe() on component unmount

// Paginated reads (RTDB-style)
const snap = await get(
  query(ref(db, `tenants/${tenantId}/visits`), orderByChild('createdAt'),
        startAt(cursor), limitToFirst(20))
);
```

### Write Patterns — Argon Clinical Rules
```javascript
// ✅ Multi-path atomic write (the CORRECT way for clinical data)
const now = Date.now();
await update(ref(db), {
  [`tenants/${tId}/visits/${vId}/soap/assessment/${diagId}`]: {
    icdCode: 'J06.9',
    label: 'Acute upper respiratory infection',
    isPrimary: true,
    createdBy: uid,
    createdAt: now,
    visitId: vId,
  },
  [`tenants/${tId}/visits/${vId}/timeline/${now}_DIAG`]: {
    event: 'DIAGNOSIS_ADDED',
    actor: uid,
    ts: now,
    detail: { icdCode: 'J06.9' },
  },
  [`tenants/${tId}/auditLog/${push(ref(db)).key}`]: {
    action: 'DIAGNOSIS_CREATED',
    actor: uid,
    resource: diagId,
    visitId: vId,
    ts: now,
  },
});

// ✅ Transaction for counters / locks
const result = await runTransaction(
  ref(db, `tenants/${tId}/counters/invoices/${year}`),
  (current) => (current === null ? 1 : current + 1)
);
const invoiceNumber = result.snapshot.val();
```

### What NOT to Do with RTDB
```javascript
// ❌ Looping writes — causes N separate round-trips
for (const item of lineItems) {
  await set(ref(db, `invoices/${invId}/lines/${item.id}`), item);
}
// ✅ Use a single update() with all paths

// ❌ Reading an entire large collection to filter client-side
const all = await get(ref(db, `tenants/${tId}/visits`));
const filtered = Object.values(all.val()).filter(v => v.status === 'COMPLETED');
// ✅ Use orderByChild('status').equalTo('COMPLETED') with .indexOn

// ❌ Storing large binary data in RTDB (images, PDFs)
// ✅ Use Firebase Storage; store only the download URL in RTDB
```

---

## 3. Cloud Functions — Argon Patterns

### Function Organization
```
functions/
  src/
    clinical/
      completeVisit.ts        ← ArgonCheckout trigger point
      createDiagnosis.ts
    billing/
      generateInvoice.ts
      processPayment.ts
      generateCreditNote.ts
    pharmacy/
      dispensePrescription.ts
    auth/
      setCustomClaims.ts
    triggers/
      onVisitCompleted.ts     ← RTDB onCreate trigger
    utils/
      tenantGuard.ts          ← Auth + tenant validation middleware
      auditLogger.ts
```

### Callable Function Template (Argon Standard)
```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { tenantGuard } from '../utils/tenantGuard';

export const createDiagnosis = functions.https.onCall(async (data, context) => {
  // 1. Auth guard
  const { uid, tenantId, role } = tenantGuard(context, ['doctor']);

  // 2. Input validation
  const { visitId, icdCode, label, isPrimary } = data;
  if (!visitId || !icdCode || !label) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  // 3. Business rule checks (visit must be IN_PROGRESS)
  const visitRef = admin.database().ref(`tenants/${tenantId}/visits/${visitId}/meta`);
  const visitSnap = await visitRef.once('value');
  if (!visitSnap.exists()) throw new functions.https.HttpsError('not-found', 'Visit not found');
  const visit = visitSnap.val();
  if (visit.status !== 'IN_PROGRESS') {
    throw new functions.https.HttpsError('failed-precondition', 'Visit is not in progress');
  }
  if (visit.providerId !== uid && role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Not the assigned provider');
  }

  // 4. Atomic write
  const diagId = admin.database().ref().push().key!;
  const now = admin.database.ServerValue.TIMESTAMP;
  await admin.database().ref().update({
    [`tenants/${tenantId}/visits/${visitId}/soap/assessment/${diagId}`]: {
      icdCode, label, isPrimary: !!isPrimary,
      createdBy: uid, createdAt: now, visitId,
    },
    [`tenants/${tenantId}/visits/${visitId}/timeline/${diagId}`]: {
      event: 'DIAGNOSIS_ADDED', actor: uid, ts: now,
    },
  });

  return { diagId, success: true };
});
```

### RTDB Trigger Pattern (for ArgonCheckout)
```typescript
// Fires when a visit status changes to COMPLETED
export const onVisitCompleted = functions.database
  .ref('tenants/{tenantId}/visits/{visitId}/meta/status')
  .onUpdate(async (change, context) => {
    const before = change.before.val();
    const after = change.after.val();
    if (before === after || after !== 'COMPLETED') return null;

    const { tenantId, visitId } = context.params;
    // Trigger billing checkout
    await triggerArgonCheckout(tenantId, visitId);
    return null;
  });
```

---

## 4. Firebase Auth — Custom Claims Management

```typescript
// Set claims when a staff member is created/updated
export const setStaffClaims = functions.https.onCall(async (data, context) => {
  tenantGuard(context, ['admin']); // Only admins can set claims
  const { targetUid, role, deptId, tenantId } = data;

  await admin.auth().setCustomUserClaims(targetUid, {
    tenantId,
    role,
    deptId,
    permissions: ROLE_PERMISSIONS[role] || [],
    staffId: data.staffId,
    claimsVersion: Date.now(),
  });

  // Force token refresh on next request
  await admin.database().ref(`tenants/${tenantId}/staff/${targetUid}/claimsUpdated`)
    .set(admin.database.ServerValue.TIMESTAMP);
});

// Revoke session on sensitive changes
export const revokeUserSession = async (uid: string) => {
  await admin.auth().revokeRefreshTokens(uid);
};
```

---

## 5. Firebase Storage — Argon Usage

### Stored File Types
```
clinical/
  {tenantId}/{patientId}/attachments/{fileId}    ← Medical documents, images
  {tenantId}/{visitId}/radiology/{fileId}         ← Radiology images (non-DICOM)
billing/
  {tenantId}/invoices/{invoiceId}.pdf             ← Generated invoice PDFs
  {tenantId}/receipts/{paymentId}.pdf             ← Payment receipts
reports/
  {tenantId}/exports/{reportId}.xlsx              ← Financial reports
```

### Storage Security Rules
```javascript
match /clinical/{tenantId}/{patientId}/{allPaths=**} {
  allow read: if request.auth.token.tenantId == tenantId &&
                 request.auth.token.role in ['doctor', 'nurse', 'admin'];
  allow write: if request.auth.token.tenantId == tenantId &&
                  request.auth.token.role in ['doctor', 'nurse'] &&
                  request.resource.size < 20 * 1024 * 1024; // 20MB max
}
```

---

## 6. Firebase Performance Checklist

Before any RTDB integration, verify:
- [ ] `.indexOn` rules exist for every `orderByChild` query
- [ ] Listeners are unsubscribed on component unmount / function exit
- [ ] Large writes use multi-path `update()` not sequential `set()` calls
- [ ] Sensitive writes go through Cloud Functions, never direct client writes
- [ ] `ServerValue.TIMESTAMP` is used for all audit/billing timestamps (never `Date.now()` on client)
- [ ] Pagination is implemented for any collection > 100 items
- [ ] Error handling covers: network failure, permission denied, transaction abort

---

## 7. Firebase Anti-Patterns

- ❌ Using Firestore SDK instead of RTDB SDK (wrong product for Argon).
- ❌ Direct client writes to billing or clinical paths (must go through Cloud Functions).
- ❌ `once('value')` on large collections without `.limitToFirst()`.
- ❌ Using `Date.now()` from client for `createdAt` timestamps (clock skew risk).
- ❌ Forgetting to unsubscribe listeners (memory leaks, unnecessary reads).
- ❌ Putting sensitive data (patient notes) in Firebase Storage metadata instead of RTDB.
- ❌ Using Firebase emulator configs in production builds.
- ❌ Sharing a single Firebase project for dev and production Argon environments.
