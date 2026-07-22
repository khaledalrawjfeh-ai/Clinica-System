---
name: argon-database-engineering
description: >
  Database design and engineering for Argon Medical OS. Use when designing data models,
  Firebase RTDB schemas, query strategies, indexing, transactions, backup planning, or
  evaluating a future PostgreSQL migration. Trigger on: data model, schema, database,
  Firebase, RTDB, query, index, transaction, normalization, ERD, migration, denormalization,
  concurrent write, atomic, lock.
---

# Argon Database Engineering

Think like a Senior Database Engineer who specializes in healthcare data systems and has
deep expertise in both Firebase Realtime Database and relational databases (PostgreSQL).
Argon's current database is Firebase RTDB. Every schema decision must account for clinical
safety, ISTD billing compliance, and multi-tenant isolation.

---

## 1. Firebase RTDB Architecture for Argon

### Fundamental RTDB Rules
1. **RTDB is a JSON tree** — no joins, no queries with multiple conditions natively.
2. **Denormalize aggressively** — duplicate data to avoid deep nesting reads.
3. **Index every query path** — `.indexOn` rules must exist before any `orderByChild` query.
4. **Atomic multi-location writes** — use `update({path1: val, path2: val})` for consistency.
5. **Avoid deep nesting** — max 3-4 levels recommended; deeply nested data is hard to secure.

### Canonical Path Structure
```
/tenants/{tenantId}/
  /meta/                          ← Tenant settings, billing policy, departments
  /patients/{patientId}/
    /profile/                     ← Demographics (mutable, version-tracked)
    /allergies/{allergyId}/       ← Append-only
    /chronicConditions/{id}/      ← Append-only
  /visits/{visitId}/
    /meta/                        ← visitId, patientId, deptId, providerId, status, timestamps
    /soap/
      /subjective/                ← Append-only sections
      /objective/                 ← Vitals (append-only), exam findings
      /assessment/{diagId}/       ← Diagnoses (append-only)
      /plan/{orderId}/            ← Orders (append-only)
    /timeline/{eventId}/          ← Immutable state transition log
  /billing/
    /invoices/{invoiceId}/        ← Invoice header (append-only after ISSUED)
    /lineItems/{invoiceId}/{id}/  ← Immutable after invoice is ISSUED
    /payments/{paymentId}/        ← Append-only
    /creditNotes/{cnId}/          ← Append-only (إشعار دائن)
  /pharmacy/
    /inventory/{drugId}/          ← Mutable (stock levels)
    /dispensings/{id}/            ← Append-only
  /lab/
    /orders/{orderId}/            ← Transitions: PENDING→IN_PROGRESS→RESULTED
    /results/{resultId}/          ← Append-only after verification
  /radiology/
    /orders/{orderId}/
    /reports/{reportId}/
  /staff/{userId}/                ← Mutable profile, immutable role assignments
  /auditLog/{logId}/              ← Global append-only audit stream
```

### Concurrent Write Protection
For the billing engine and checkout flow, use Firebase RTDB transactions for values that
multiple clients might write simultaneously:
```javascript
// Pattern: Atomic billing lock
const lockPath = `/tenants/${tenantId}/locks/billing/${visitId}`;
await runTransaction(ref(db, lockPath), (current) => {
  if (current !== null) return; // abort if locked
  return { lockedBy: userId, lockedAt: Date.now(), expires: Date.now() + 30000 };
});
```

---

## 2. Data Modeling Patterns

### Append-Only Pattern (Medical Records)
```javascript
// ✅ CORRECT: New node per amendment
/visits/{visitId}/soap/assessment/{diagId_v1}/  ← original
/visits/{visitId}/soap/assessment/{diagId_v2}/  ← amendment (links to v1)

// ❌ WRONG: Overwriting existing diagnosis
/visits/{visitId}/diagnosis → { code: "J06.9" }  // mutable = no audit trail
```

### Dual-Write for Query Efficiency
When a visit is completed, write to multiple paths atomically:
```javascript
await update(ref(db), {
  [`/tenants/${tId}/visits/${vId}/meta/status`]: 'COMPLETED',
  [`/tenants/${tId}/completedVisits/${date}/${vId}`]: true,    // index by date
  [`/tenants/${tId}/patientVisits/${patientId}/${vId}`]: true, // index by patient
  [`/tenants/${tId}/providerVisits/${providerId}/${vId}`]: true, // index by provider
  [`/tenants/${tId}/billing/queue/${vId}`]: { visitId: vId, createdAt: now }, // billing trigger
});
```

### Invoice Number Generation (ISTD Compliance)
```javascript
// Sequential invoice numbers require a counter node:
/tenants/{tenantId}/counters/invoices/2025 → { next: 143 }

// Use RTDB transaction to atomically increment:
const nextNum = await runTransaction(counterRef, (n) => (n || 0) + 1);
const invoiceId = `INV-${year}-${String(nextNum).padStart(5, '0')}`;
```

---

## 3. Firebase Security Rules (Database-Level Enforcement)

### Rule Categories
```
auth.uid        → must exist for any read/write
tenantId claim  → user's token.tenantId must match the path's tenantId
role claim      → token.role determines which sub-paths are accessible
ownership       → some paths require auth.uid === record.createdBy
time window     → clinical notes: editable only within 24 hours of creation
```

### Immutability Rule Pattern
```json
"visits": {
  "$visitId": {
    "soap": {
      "assessment": {
        "$diagId": {
          ".write": "!data.exists()",  // Only new creates allowed; no overwrites
          ".validate": "newData.hasChildren(['icd10Code', 'createdBy', 'createdAt'])"
        }
      }
    }
  }
}
```

### Soft-Delete Guard
```json
".write": "auth.uid !== null &&
           (!data.exists() || data.child('deletedAt').val() === null)"
```

---

## 4. Indexing Strategy

### Required `.indexOn` Rules for Argon
```json
"visits": {
  ".indexOn": ["patientId", "providerId", "deptId", "status", "createdAt"]
},
"billing/invoices": {
  ".indexOn": ["patientId", "status", "visitId", "issuedAt"]
},
"lab/orders": {
  ".indexOn": ["visitId", "patientId", "status", "orderedAt"]
},
"pharmacy/inventory": {
  ".indexOn": ["deptId", "expiryDate", "stockLevel"]
}
```

---

## 5. PostgreSQL — Future Migration Target

### When to Migrate
- Monthly visit volume exceeds 10,000 per tenant with complex reporting needs.
- Need for multi-column WHERE clauses without denormalization overhead.
- Insurance claims require complex relational joins.
- Regulatory requirement for SQL-level audit trails.

### Schema Design Principles for Healthcare PostgreSQL

#### Normalization Level
- 3NF for transactional tables (patients, visits, prescriptions).
- Denormalized reporting tables/views (materialized views for KPI dashboards).
- Never store ICD codes as free text — FK to a `icd_codes` reference table.

#### Core Tables (ERD Summary)
```sql
patients          → id (UUID), national_id, dob, gender, tenant_id
visits            → id, patient_id, provider_id, dept_id, status, tenant_id
diagnoses         → id, visit_id, icd10_code, is_primary, created_by, created_at
prescriptions     → id, visit_id, drug_id, dosage, frequency, duration, created_by
lab_orders        → id, visit_id, panel_id, status, ordered_by, ordered_at
lab_results       → id, order_id, component_id, value, unit, flag, verified_by
invoices          → id, visit_id, patient_id, status, total, tax, tenant_id
invoice_lines     → id, invoice_id, service_id, qty, unit_price, discount
payments          → id, invoice_id, method, amount, received_at, received_by
audit_log         → id, table_name, record_id, action, old_val (jsonb), new_val (jsonb), actor_id, ts
```

#### Audit Log Trigger (PostgreSQL)
```sql
CREATE OR REPLACE FUNCTION audit_trigger() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (table_name, record_id, action, old_val, new_val, actor_id, ts)
  VALUES (TG_TABLE_NAME, NEW.id, TG_OP, row_to_json(OLD), row_to_json(NEW),
          current_setting('app.user_id', true)::uuid, NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Key Indexes for PostgreSQL
```sql
CREATE INDEX idx_visits_patient ON visits(patient_id, tenant_id);
CREATE INDEX idx_visits_provider ON visits(provider_id, visited_at DESC);
CREATE INDEX idx_invoices_status ON invoices(tenant_id, status) WHERE status != 'PAID';
CREATE INDEX idx_lab_results_order ON lab_results(order_id);
-- Partial index for unpaid invoices (frequent query)
CREATE INDEX idx_unpaid ON invoices(tenant_id, due_date) WHERE status IN ('ISSUED', 'OVERDUE');
```

---

## 6. Backup Strategy

### Firebase RTDB Backup
- Enable automated daily exports to Google Cloud Storage.
- Format: GZIP-compressed JSON.
- Retention: 90 days minimum for medical records (Jordanian legal requirement).
- Test restore procedure quarterly — an untested backup is no backup.

### PostgreSQL Backup (Future)
- pg_dump for logical backups (daily, retained 30 days).
- WAL archiving for point-in-time recovery (PITR).
- Encrypted backups — medical data is sensitive.
- Off-site copy (different GCP region or provider).

---

## 7. Anti-Patterns

- ❌ Using `.push()` auto-IDs for billing records (non-sequential, breaks ISTD requirements).
- ❌ Storing complete patient objects inside visit nodes (breaks single-source-of-truth).
- ❌ Using RTDB `.orderByValue()` on un-indexed paths (full scan = slow + expensive).
- ❌ Writing to RTDB in loops without batching into a single `update()` call.
- ❌ Mixing tenant data in shared Firebase paths.
- ❌ Using RTDB `remove()` on any clinical or financial record.
- ❌ Storing currency amounts as floats (use integer cents/fils: 1500 = 15.00 JOD).
- ❌ Missing `.validate` rules on critical fields (name, ICD code, amounts).
