---
name: argon-software-architecture
description: >
  Software architecture guidance for Argon Medical OS. Use when designing system structure,
  module boundaries, data flow, multi-tenancy patterns, domain modeling, event-driven flows,
  or scalability planning. Trigger on: architecture, design, module, layer, tenant, domain,
  service, component, structure, scalability, multi-clinic, complex, hospital.
---

# Argon Software Architecture

Think like a Senior Healthcare Software Architect who has scaled systems from single-clinic
deployments to multi-branch medical complexes. Every architectural decision in Argon must
balance three forces: clinical safety, data integrity, and operational simplicity.

---

## 1. Core Architectural Principles

### The Six Non-Negotiables
1. **Append-Only Records** — Clinical and financial records are never mutated after creation.
   Amendments create new records; originals are preserved forever.
2. **Full Traceability** — Every state change carries: who, when, from what, to what.
3. **Defense in Depth** — Validation at UI, at function/service layer, and at database rules.
   No single point of trust.
4. **Fail-Safe Defaults** — If a rule or permission cannot be evaluated, deny access.
5. **Minimum Data Footprint** — Store only what is clinically or legally necessary.
6. **Surgical Changes Only** — Never refactor broadly when a targeted fix solves the problem.

---

## 2. System Layers

```
┌─────────────────────────────────────────┐
│          Presentation Layer             │  Flutter Mobile / Web UI
├─────────────────────────────────────────┤
│          Application Layer              │  ArgonCheckout, visit workflows,
│                                         │  billing engine, clinical modules
├─────────────────────────────────────────┤
│          Domain Layer                   │  Entities: Patient, Visit, Prescription,
│                                         │  Invoice, Department, Provider
├─────────────────────────────────────────┤
│          Infrastructure Layer           │  Firebase RTDB, Cloud Functions,
│                                         │  Storage, Auth, external APIs
└─────────────────────────────────────────┘
```

Domain logic must never depend on infrastructure. A billing rule should be testable
without touching Firebase.

---

## 3. Multi-Tenant Architecture

### Tenant Types in Argon
```
Tenant Type       Example                     Isolation Level
─────────────────────────────────────────────────────────────
Standalone Clinic  Dr. Ahmed's Cardiology      Single-department, single-provider
Medical Complex    Irbid Medical Center         Multi-department, multi-provider
Multi-Branch       HealthPlus (3 locations)    Shared catalog, separate patient data
```

### Tenant Isolation Rules
- Patient records: strict per-tenant, never visible across tenants.
- Provider catalog: per-tenant; templates can be shared via a global template layer.
- Billing policies: per-tenant, per-department.
- Insurance contracts: per-tenant.
- User authentication: per-tenant via Firebase Auth custom claims.

### Firebase RTDB Namespace Structure
```
/tenants/{tenantId}/
  /patients/{patientId}/
  /visits/{visitId}/
  /billing/{invoiceId}/
  /staff/{userId}/
  /departments/{deptId}/
  /settings/
```
Cross-tenant reads are blocked at Firebase security rules level — never at application level alone.

---

## 4. Domain Modeling

### Core Entities
```
Patient          ─────< Visit >─────── SOAP Note
                              │
                              ├──────< Lab Order >───── Lab Result
                              ├──────< Rx Order >────── Dispensing Record
                              ├──────< Rad Order >───── Radiology Report
                              ├──────< Invoice >──────── Payment
                              └──────< Referral >
```

### Entity Identity Rules
- `patientId`: UUID, permanent, never reused.
- `visitId`: UUID, permanent. A cancelled visit keeps its ID with `status: CANCELLED`.
- `invoiceId`: sequential number per-tenant per-year (e.g., `INV-2025-00142`).
- `providerId`: maps to a licensed healthcare professional.

### Aggregate Boundaries
- **Visit Aggregate**: owns SOAP, vital signs, orders (lab/rad/rx), diagnoses. One root.
- **Billing Aggregate**: owns invoice, line items, payments, credit notes. Separate root.
- **Patient Aggregate**: owns demographics, allergies, chronic conditions, consents. Separate root.
- Never allow one aggregate to directly mutate another. Use domain events.

---

## 5. Event-Driven Patterns

### Key Domain Events
```
VisitCompleted        → triggers ArgonCheckout (billing)
                      → triggers notification to patient
                      → triggers lab result polling (if pending)

InvoicePaid           → triggers receipt generation (ISTD-compliant)
                      → triggers inventory decrement (pharmacy)

PrescriptionFulfilled → triggers inventory update
                      → updates visit medication status

LabResultCritical     → triggers URGENT physician notification
                      → requires mandatory acknowledgment
```

### Event Handling Rules
- Events are immutable facts: "VisitCompleted at 14:32" is not retracted if billing fails.
- Failed event handlers must retry with exponential backoff, not suppress the event.
- Events are logged to an audit stream — they are never just in-memory callbacks.

---

## 6. Module Boundaries

### Argon Modules
```
Module              Responsibility                          Can Call
────────────────────────────────────────────────────────────────────
ArgonEMR            Clinical documentation, SOAP            PatientModule, VisitModule
ArgonBilling        Invoice generation, payments, ISTD      VisitModule
ArgonCheckout       Automated post-visit billing trigger    BillingModule, VisitModule
ArgonPharmacy       Rx fulfillment, inventory               VisitModule
ArgonLab            Lab orders, results                     VisitModule
ArgonRadiology      Rad orders, reports                     VisitModule
ArgonScheduler      Appointments, queues                    PatientModule, ProviderModule
ArgonInsurance      Claims, pre-auth, coverage              BillingModule, VisitModule
ArgonReports        Analytics, PDF generation               All modules (read-only)
ArgonAdmin          Tenant setup, user management           All modules (admin only)
```

**Rule**: Modules communicate via well-defined interfaces, not by reading each other's
Firebase paths directly.

---

## 7. Scalability Path

### Phase 1: Single Clinic (current Argon)
- Firebase RTDB + Cloud Functions
- Single-region deployment
- Up to ~50,000 visits/year per tenant

### Phase 2: Medical Complex
- Multiple departments under one tenant
- Per-department billing policies
- Concurrent processing locks for billing engine
- Departmental analytics separation

### Phase 3: Multi-Branch / Hospital
- Consider PostgreSQL migration for complex relational queries
- Event sourcing for financial records
- FHIR-compliant API layer for interoperability
- HL7 integration for lab and radiology instruments

---

## 8. Architectural Anti-Patterns

- ❌ Putting business logic in Firebase security rules (rules = access control only).
- ❌ Mixing tenant data under shared Firebase paths.
- ❌ Calling billing logic directly from UI — always via Cloud Functions.
- ❌ Using Firebase RTDB `.push()` keys as human-readable IDs.
- ❌ Designing screens before defining the domain model.
- ❌ "God functions" that handle 5+ business operations in one Cloud Function call.
- ❌ Synchronous chains of Firebase reads inside loops.
- ❌ Storing derived/computed data as source of truth instead of computing on read.
