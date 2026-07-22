---
name: argon-backend-development
description: >
  Backend development patterns for Argon Medical OS using Firebase Cloud Functions
  (Node.js/TypeScript). Use when building APIs, Cloud Functions, business logic,
  background jobs, queues, notifications, or integrations. Trigger on: Cloud Function,
  API, endpoint, backend, server, Node.js, TypeScript, callable, trigger, queue,
  notification, job, integration, billing engine, checkout, workflow.
---

# Argon Backend Development

Think like a Senior Backend Engineer who builds healthcare APIs with zero tolerance for
data corruption. Argon's backend runs on Firebase Cloud Functions (Node.js/TypeScript).
Every function must be: idempotent, observable, fail-safe, and auditable.

---

## 1. Function Architecture Principles

### The VALID Checklist (Every Cloud Function Must Pass)
- **V**alidate — All inputs validated before any DB operation.
- **A**uthorize — Auth + role + tenant verified before any data access.
- **L**ock — Concurrent writes use transactions or locks.
- **I**dempotent — Safe to retry without double-billing or duplicate records.
- **D**ocument — Every function has a JSDoc block with inputs, outputs, errors.

### Error Handling Contract
```typescript
// All Argon Cloud Functions throw typed errors only
import { HttpsError } from 'firebase-functions/v2/https';

// Error taxonomy for Argon:
throw new HttpsError('invalid-argument',    'Missing visitId');           // 400
throw new HttpsError('unauthenticated',     'No valid session');           // 401
throw new HttpsError('permission-denied',   'Role does not allow this');   // 403
throw new HttpsError('not-found',           'Visit does not exist');       // 404
throw new HttpsError('failed-precondition', 'Visit is already completed'); // 409
throw new HttpsError('already-exists',      'Invoice already generated');  // 409
throw new HttpsError('resource-exhausted',  'Rate limit exceeded');        // 429
throw new HttpsError('internal',            'Unexpected server error');    // 500
```

---

## 2. Billing Engine (v3.0)

### ArgonCheckout — Automated Post-Visit Billing
```typescript
// Triggered by: completeWorkspaceVisit() → RTDB status → COMPLETED
export async function triggerArgonCheckout(tenantId: string, visitId: string): Promise<void> {
  const db = admin.database();

  // 1. Deduplication guard (idempotency)
  const lockRef = db.ref(`tenants/${tenantId}/billing/checkoutLocks/${visitId}`);
  const lockResult = await runTransaction(lockRef, (current) => {
    if (current !== null) return; // Abort — already processing or processed
    return { status: 'PROCESSING', startedAt: Date.now() };
  });
  if (!lockResult.committed) return; // Another instance is handling this

  try {
    // 2. Load visit data
    const visitSnap = await db.ref(`tenants/${tenantId}/visits/${visitId}`).once('value');
    const visit = visitSnap.val();
    if (!visit) throw new Error(`Visit ${visitId} not found`);

    // 3. Load billing policy for department
    const policySnap = await db.ref(
      `tenants/${tenantId}/departments/${visit.meta.deptId}/billingPolicy`
    ).once('value');
    const policy = policySnap.val() || DEFAULT_BILLING_POLICY;

    // 4. Generate invoice lines from visit services
    const lineItems = await buildLineItems(visit, policy, tenantId);

    // 5. Generate sequential invoice ID
    const invNum = await incrementInvoiceCounter(tenantId);
    const invoiceId = `INV-${new Date().getFullYear()}-${String(invNum).padStart(5, '0')}`;

    // 6. Atomic write: invoice + lock release
    await db.ref().update({
      [`tenants/${tenantId}/billing/invoices/${invoiceId}`]: {
        invoiceId, visitId, patientId: visit.meta.patientId,
        deptId: visit.meta.deptId, providerId: visit.meta.providerId,
        status: 'PENDING', lineItems, total: calculateTotal(lineItems),
        taxRate: policy.taxRate, createdAt: Date.now(), createdBy: 'SYSTEM',
      },
      [`tenants/${tenantId}/billing/checkoutLocks/${visitId}`]: {
        status: 'COMPLETED', invoiceId, completedAt: Date.now(),
      },
      [`tenants/${tenantId}/visits/${visitId}/meta/invoiceId`]: invoiceId,
    });

  } catch (error) {
    // Release lock with FAILED status so it can be retried
    await lockRef.update({ status: 'FAILED', error: String(error), failedAt: Date.now() });
    throw error;
  }
}
```

### Per-Department Billing Policy
```typescript
interface BillingPolicy {
  deptId: string;
  taxRate: number;              // e.g., 0.16 for 16% Jordanian GST
  roundingMode: 'UP' | 'DOWN' | 'HALF_UP';
  currencyCode: 'JOD';
  defaultPaymentTerms: number;  // days
  insuranceEnabled: boolean;
  autoGenerateReceipt: boolean;
  istdEnabled: boolean;         // ISTD e-invoicing compliance
  serviceOverrides: { [serviceId: string]: { price: number; taxable: boolean } };
}
```

---

## 3. ISTD E-Invoicing (Jordan)

### ISTD Invoice Requirements
Every issued invoice in Argon must comply with Jordan's Income and Sales Tax Department
(دائرة ضريبة الدخل والمبيعات) electronic invoicing standard:

```typescript
interface ISTDInvoice {
  invoiceNumber: string;      // Sequential, no gaps allowed
  issueDate: string;          // ISO 8601
  issueTime: string;          // HH:MM:SS
  sellerTaxId: string;        // رقم التسجيل الضريبي للعيادة
  sellerName: string;         // Arabic legal name
  buyerName: string;          // Patient name
  buyerTaxId?: string;        // If patient is a company/insurer
  lineItems: ISTDLineItem[];
  subtotal: number;           // In JOD, 3 decimal places
  taxAmount: number;          // 16% sales tax (if applicable)
  total: number;
  invoiceType: 'TAX_INVOICE' | 'SIMPLIFIED_TAX_INVOICE' | 'CREDIT_NOTE';
  qrCode: string;             // Generated per ISTD spec
}
```

### Credit Note (إشعار دائن) Rules
- A credit note is always linked to an original invoice (`originalInvoiceId`).
- Cannot credit more than the original invoice total.
- Requires admin-level authorization.
- Is itself an immutable record once created.
- ISTD credit note must carry the original invoice number.

---

## 4. Background Jobs and Queues

### Job Types in Argon
```typescript
// 1. Scheduled jobs (Cloud Scheduler)
exports.dailyBillingReconciliation = functions.pubsub
  .schedule('0 2 * * *')          // 2:00 AM daily
  .timeZone('Asia/Amman')
  .onRun(reconcileUnpaidInvoices);

exports.labResultPolling = functions.pubsub
  .schedule('*/5 * * * *')        // Every 5 minutes
  .onRun(pollPendingLabOrders);

exports.expiredLockCleanup = functions.pubsub
  .schedule('*/15 * * * *')
  .onRun(cleanExpiredCheckoutLocks);

// 2. Queue-based jobs (Firebase Extensions or manual queue)
// Pattern: Write job to /queue/{jobId}, Cloud Function listens and processes
const jobRef = db.ref(`tenants/${tenantId}/queues/notifications`);
await jobRef.push({
  type: 'LAB_RESULT_READY',
  patientId, visitId, labOrderId,
  scheduledAt: Date.now(),
  status: 'PENDING',
});
```

### Retry Logic
```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      await sleep(baseDelayMs * Math.pow(2, attempt - 1)); // Exponential backoff
    }
  }
  throw new Error('Unreachable');
}
```

---

## 5. Notifications

### Notification Types
```typescript
type NotificationType =
  | 'VISIT_COMPLETED'            // To patient: "Your visit summary is ready"
  | 'LAB_RESULT_READY'           // To doctor + patient
  | 'LAB_RESULT_CRITICAL'        // To doctor (urgent, requires ack)
  | 'PRESCRIPTION_READY'         // To patient: "Your medication is ready for pickup"
  | 'INVOICE_ISSUED'             // To patient: billing notification
  | 'APPOINTMENT_REMINDER'       // To patient: 24h before appointment
  | 'INSURANCE_CLAIM_STATUS';    // To billing manager

// Critical lab results require acknowledgment tracking:
interface CriticalResultNotification {
  notificationId: string;
  type: 'LAB_RESULT_CRITICAL';
  targetDoctorId: string;
  labOrderId: string;
  patientId: string;
  sentAt: number;
  acknowledgedAt?: number;       // null until doctor acks
  acknowledgmentNote?: string;
  escalatedAt?: number;          // If not acked within 30 mins
}
```

---

## 6. Input Validation Library

```typescript
// Argon validation helpers
const Validators = {
  visitId: (v: any) => typeof v === 'string' && v.startsWith('visit_'),
  icdCode: (v: any) => /^[A-Z]\d{2}(\.\d{1,4})?$/.test(v),
  jordanianNationalId: (v: any) => /^\d{10}$/.test(v),
  phone: (v: any) => /^(\+962|00962|0)7[789]\d{7}$/.test(v),
  amount: (v: any) => Number.isInteger(v) && v >= 0,   // Integer fils/cents
  dateString: (v: any) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)),
};
```

---

## 7. Anti-Patterns

- ❌ Business logic inside RTDB security rules (rules = access gates only).
- ❌ Non-idempotent functions that can double-bill if retried.
- ❌ Using `set()` instead of `update()` for multi-field changes (races).
- ❌ Catching all errors with `catch(() => {})` — always re-throw or log.
- ❌ Storing service account keys in environment variables without Secret Manager.
- ❌ Functions longer than 300 lines — decompose into single-responsibility units.
- ❌ Making external HTTP calls (ISTD API) without timeout and retry.
- ❌ Running sequential async calls when `Promise.all()` would work.
- ❌ Hard-coded JOD tax rates in function body — read from billing policy.
