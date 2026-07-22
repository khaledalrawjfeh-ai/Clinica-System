---
name: argon-security-engineering
description: >
  Security architecture and implementation for Argon Medical OS. Use when designing or
  reviewing authentication, authorization, RBAC, audit logging, Firebase security rules,
  session management, encryption, or data privacy. Trigger on: security, auth, permission,
  role, RBAC, rule, audit, log, token, session, encrypt, privacy, access control,
  unauthorized, HIPAA, data protection.
---

# Argon Security Engineering

Think like a Cybersecurity Engineer specialized in healthcare information systems. Medical
data is among the most sensitive data types legally and ethically. Every security decision
in Argon must assume hostile actors — insider threats, compromised accounts, API abuse.
Defense in depth is not optional.

---

## 1. Authentication Architecture

### Firebase Auth in Argon
- All users authenticate via Firebase Auth (email/password + optional MFA).
- Custom claims carry critical authorization data:
  ```javascript
  // Custom claims structure
  {
    tenantId: "clinic_abc123",       // Tenant isolation
    role: "doctor",                   // Primary role
    deptId: "cardiology",            // Department assignment
    permissions: ["visit:write", "prescription:write"], // Granular permissions
    staffId: "staff_xyz789"          // Link to staff record
  }
  ```
- Claims are set by Cloud Functions only — never by client code.
- Claims are verified server-side on every sensitive operation.

### Token Validation
```javascript
// In every Cloud Function — NEVER trust client-provided tenantId
const token = await admin.auth().verifyIdToken(idToken);
const { tenantId, role, uid } = token;
// Use token.tenantId — never req.body.tenantId for path construction
```

### Session Management
- ID tokens expire after 1 hour (Firebase default) — enforce this.
- Refresh tokens should be revoked on: password change, account suspension, role change.
- Implement session lock for idle medical workstations (15-minute inactivity → re-auth).
- For clinical workstations: consider requiring re-auth before any prescription write.

### MFA for Privileged Roles
- Enforce MFA for: admin, pharmacy (for controlled substances), billing manager.
- Optional for: doctors, nurses (encourage but don't block clinical workflow).
- Firebase Auth supports TOTP MFA — implement for Argon admin panel.

---

## 2. Authorization — RBAC for Argon

### Clinical Roles and Permissions Matrix
```
Role              Read Patient  Write SOAP  Prescribe  Billing  Admin
─────────────────────────────────────────────────────────────────────
Doctor            ✓ (own dept) ✓ (own)     ✓          View     ✗
Nurse             ✓ (own dept) Vitals only ✗           ✗        ✗
Receptionist      Demographics ✗           ✗          Create   ✗
Pharmacist        Rx only      ✗           ✗          Dispense ✗
Lab Technician    Orders only  Lab results ✗           ✗        ✗
Billing Manager   Demographics ✗           ✗          Full     ✗
Clinic Admin      ✓ (tenant)   ✗           ✗          Full     ✓ (tenant)
System Admin      ✓ (all)      ✗           ✗          Full     ✓ (global)
```

### Permission Naming Convention
```
{resource}:{action}:{scope}

visit:read:own          → read visits you created
visit:read:dept         → read all visits in your department
visit:write:soap        → write SOAP notes
prescription:write      → create prescriptions
prescription:dispense   → mark prescription as dispensed
billing:read            → view invoices
billing:write           → create/edit invoices
billing:void            → void invoices (high privilege)
patient:read            → read patient demographics
patient:write           → update patient demographics
admin:staff             → manage staff accounts
admin:settings          → change tenant settings
```

### Ownership-Based Access Control
```javascript
// A doctor can only edit their own SOAP notes within the 24-hour window
const canEdit =
  note.createdBy === auth.uid &&
  (Date.now() - note.createdAt) < 24 * 60 * 60 * 1000 &&
  visit.status === 'IN_PROGRESS';
```

---

## 3. Firebase Security Rules (Production-Grade)

### Global Tenant Isolation
```json
{
  "rules": {
    "tenants": {
      "$tenantId": {
        ".read": "auth.uid !== null && auth.token.tenantId === $tenantId",
        ".write": "auth.uid !== null && auth.token.tenantId === $tenantId"
      }
    }
  }
}
```

### Immutable Medical Record Protection
```json
"visits": {
  "$visitId": {
    "soap": {
      "assessment": {
        "$diagId": {
          ".write": "!data.exists() && auth.uid !== null",
          ".validate": "newData.hasChildren(['icdCode', 'createdBy', 'createdAt', 'visitId'])"
        }
      }
    },
    "timeline": {
      "$eventId": {
        ".write": "!data.exists()",
        ".read": "auth.uid !== null && auth.token.tenantId === root.child('visits/' + $visitId + '/meta/tenantId').val()"
      }
    }
  }
}
```

### 24-Hour Edit Window Rule
```json
"soap": {
  "subjective": {
    ".write": "auth.uid !== null &&
               ((!data.exists()) ||
               (auth.uid === data.child('createdBy').val() &&
               (now - data.child('createdAt').val()) < 86400000))"
  }
}
```

---

## 4. Audit Logging

### What Must Be Logged (Non-Negotiable)
```
Category           Events
──────────────────────────────────────────────────────────────
Authentication     Login, logout, failed login, token refresh, MFA
Authorization      Permission denied attempts
Clinical           Diagnosis created/amended, prescription written, lab ordered
Billing            Invoice created, voided, payment recorded, credit note issued
Pharmacy           Controlled substance dispensed, inventory adjusted
Admin              User created, role changed, settings modified, rule bypass
Data Access        Patient record accessed (who, when, which patient)
System             Cloud Function errors, rate limit hits
```

### Audit Log Structure
```javascript
{
  logId: "log_uuid",
  tenantId: "clinic_abc",
  timestamp: 1735000000000,        // Server timestamp (not client)
  actor: {
    uid: "user_123",
    role: "doctor",
    displayName: "Dr. Khaled"
  },
  action: "DIAGNOSIS_CREATED",
  resource: {
    type: "diagnosis",
    id: "diag_456",
    visitId: "visit_789",
    patientId: "patient_012"
  },
  details: {
    icdCode: "J06.9",
    label: "Acute upper respiratory infection"
  },
  ipAddress: "192.168.x.x",        // From Cloud Function context
  userAgent: "ArgonMobile/2.1.0"
}
```

### Audit Log Rules
- Written by Cloud Functions only — never by client code.
- Use server timestamps (`admin.database.ServerValue.TIMESTAMP`).
- Audit logs are append-only: no `.write` that allows overwrites.
- Retain minimum 5 years (Jordanian medical record law).
- Audit logs for billing: minimum 10 years (tax law).

---

## 5. Data Privacy

### PII Classification in Argon
```
Level 1 — Public:      Tenant name, department names
Level 2 — Internal:    Staff names, appointment slots
Level 3 — Confidential: Patient demographics, contact info
Level 4 — Restricted:   Clinical notes, diagnoses, medications, lab results
Level 5 — Critical:     Mental health notes, HIV status, substance abuse records
```

### Encryption
- **At rest**: Firebase encrypts RTDB data at rest (Google-managed keys). For Level 5 data,
  consider application-level encryption with customer-managed keys (CMEK).
- **In transit**: Firebase enforces TLS 1.2+. Never use HTTP (enforce HTTPS in app).
- **Backups**: All exported data must be encrypted with AES-256 before cloud storage.

### Data Minimization
- Do not log or cache patient data in client-side storage beyond session needs.
- Prescription exports must redact patient national ID when sent to third parties.
- Analytics dashboards must aggregate data — never expose individual patient records.

---

## 6. Threat Modeling for Argon

### Key Threats and Mitigations
```
Threat                          Mitigation
────────────────────────────────────────────────────────────────
Unauthorized patient access     RBAC + department-scoped queries
Insider data exfiltration       Audit logging + anomaly alerts
Prescription forgery            Doctor-only prescription write + visit linkage
Invoice manipulation            Append-only billing + immutable line items
Cross-tenant data leak          Tenant isolation at DB rules level
Replay attacks                  Firebase token expiry + server-side validation
Mass patient data export        Rate limiting + export size limits
Compromised admin account       MFA + role change audit + session revocation
```

---

## 7. Security Anti-Patterns

- ❌ Trusting `tenantId` from client request body — always use JWT claims.
- ❌ Firebase rules that only check `auth.uid !== null` (no role/tenant check).
- ❌ Logging sensitive clinical content (diagnosis text) in error logs.
- ❌ Storing Firebase service account keys in client-side code.
- ❌ Using `.read: true` or `.write: true` on any clinical or billing path.
- ❌ Skipping audit logging for "minor" operations (every clinical action matters).
- ❌ Implementing security only in the frontend (easily bypassed).
- ❌ Allowing billing edits after an invoice has been issued to a patient.
- ❌ Shared service accounts between production and staging environments.
