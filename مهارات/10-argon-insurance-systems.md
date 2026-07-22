---
name: argon-insurance-systems
description: >
  Insurance and claims management for Argon Medical OS in the Jordanian healthcare context.
  Use when designing insurance workflows, claims processing, pre-authorization, coverage
  verification, co-payments, or insurer integrations. Trigger on: insurance, تأمين, claim,
  مطالبة, authorization, pre-auth, coverage, co-pay, deductible, insurer, MedNet, JNIH,
  Bupa, AXA, network, eligibility, approval, rejection, reimbursement.
---

# Argon Insurance Systems (Jordan Context)

Think like a Medical Billing & Insurance Expert who knows the Jordanian private health
insurance landscape in detail. Insurance logic in Argon must be exact — incorrect claims
cost the clinic revenue and create legal liability.

---

## 1. Jordan Insurance Landscape

### Major Insurers in Jordan
```
Insurer              Type                    Key Notes
──────────────────────────────────────────────────────────────────────
JNIH (CNIA)          National (Civil)        الضمان الصحي المدني — government employees
Royal Medical        Military                خدمات طبية ملكية — military + families
MedNet Jordan        Private TPA             Largest private TPA, digital portal
AXA Insurance        Private                 International standards, portal-based
Bupa Arabia          Private                 Premium tier, high documentation requirements
Jordan Insurance     Private                 Local insurer
Arab Orient          Private                 Mid-market, common in clinics
United Insurance     Private                 Growing presence
```

### TPA vs Direct Insurer
- **TPA (Third Party Administrator)**: MedNet processes claims on behalf of multiple insurers.
  Clinic deals with MedNet, not each insurer individually.
- **Direct**: Clinic submits directly to insurer (AXA, Bupa).
- Argon must support both models with configurable insurer/TPA routing per tenant.

---

## 2. Patient Insurance Model

```typescript
interface PatientInsurance {
  insuranceId: string;
  patientId: string;
  tenantId: string;

  // Policy details
  insurerCode: string;             // e.g., 'MEDNET', 'AXA', 'JNIH'
  policyNumber: string;            // رقم البوليصة
  membershipNumber: string;        // رقم العضوية / Card number
  planName: string;                // Plan tier
  class: 'A' | 'B' | 'C' | 'VIP'; // Coverage class (affects room, services)

  // Coverage rules
  coverageType: 'INPATIENT' | 'OUTPATIENT' | 'BOTH';
  networkType: 'IN_NETWORK' | 'OUT_OF_NETWORK';
  coPaymentPct: number;            // e.g., 10 = 10% patient pays
  coPaymentFixed?: number;         // Fixed amount per visit (JOD fils)
  deductibleRemaining: number;     // Running deductible balance
  annualMaxBenefit: number;        // Annual coverage cap
  usedBenefit: number;             // Used so far this year

  // Validity
  effectiveDate: string;           // ISO 8601
  expiryDate: string;
  isActive: boolean;

  // Pre-auth settings
  requiresPreAuth: boolean;
  preAuthThreshold: number;        // Min JOD amount requiring pre-auth
}
```

---

## 3. Coverage Verification Flow

```
Patient Arrives → Receptionist scans insurance card →
Eligibility check (online if insurer API available, manual otherwise) →
Coverage confirmed → Coverage class noted → Co-payment calculated →
Patient informed of expected out-of-pocket →
Visit proceeds
```

### Co-Payment Calculation
```typescript
function calculateCoPayment(
  invoiceTotal: number,  // In fils (JOD × 1000)
  insurance: PatientInsurance
): { coPayment: number; insurerResponsible: number } {
  // Check deductible first
  const deductibleApplied = Math.min(insurance.deductibleRemaining, invoiceTotal);
  const afterDeductible = invoiceTotal - deductibleApplied;

  // Apply co-payment percentage
  const coPaymentPct = insurance.coPaymentPct / 100;
  const coPaymentPctAmount = Math.ceil(afterDeductible * coPaymentPct);

  // Take the higher of percentage or fixed co-pay
  const coPayment = deductibleApplied +
    Math.max(coPaymentPctAmount, insurance.coPaymentFixed ?? 0);

  return {
    coPayment: Math.min(coPayment, invoiceTotal), // Can't exceed total
    insurerResponsible: invoiceTotal - coPayment,
  };
}
```

---

## 4. Pre-Authorization (Prior Authorization)

### Pre-Auth Requirements by Service Type
```
Service Category              Pre-Auth Threshold (typical)
──────────────────────────────────────────────────────────
Routine outpatient visit      Not required
Lab work (routine)            Not required
Lab work (specialized)        Often required above 50 JOD
Radiology (X-ray, US)         Not required
CT / MRI                      Usually required
Surgical procedures           Always required
Physiotherapy sessions        Required after session 5
Specialist referral           Some insurers require
Hospital admission            Always required
```

### Pre-Auth Data Model
```typescript
interface PreAuthRequest {
  requestId: string;
  visitId: string;
  patientId: string;
  insuranceId: string;
  insurerCode: string;

  // What we're requesting
  services: Array<{
    serviceCode: string;
    description: string;
    estimatedCost: number;    // In fils
    icdCodes: string[];       // Justification diagnoses
    quantity: number;
  }>;

  // Clinical justification
  clinicalNotes: string;
  requestedByPhysicianId: string;
  urgency: 'ROUTINE' | 'URGENT' | 'EMERGENCY';

  // Status tracking
  status: 'DRAFT' | 'SUBMITTED' | 'PENDING' | 'APPROVED' | 'PARTIAL' | 'REJECTED';
  submittedAt?: number;
  insurerReferenceNumber?: string;
  approvedAmount?: number;
  approvedServices?: string[];
  rejectionReason?: string;
  validUntil?: string;
}
```

---

## 5. Claims Submission

### Claim Structure (Standard Jordanian Format)
```typescript
interface InsuranceClaim {
  claimId: string;
  invoiceId: string;
  visitId: string;
  patientId: string;
  insuranceId: string;

  // Billing details
  serviceDate: string;
  diagnosisCodes: string[];      // Primary + secondary ICD codes
  procedureCodes: string[];       // CPT / service codes
  lineItems: ClaimLineItem[];
  totalCharges: number;
  coPaymentCollected: number;
  claimAmount: number;            // totalCharges - coPaymentCollected

  // Supporting docs
  attachments: {
    type: 'INVOICE' | 'LAB_RESULT' | 'RADIOLOGY_REPORT' | 'REFERRAL' | 'PRE_AUTH';
    fileUrl: string;
    fileId: string;
  }[];

  // Submission tracking
  submissionMethod: 'PORTAL' | 'EMAIL' | 'PAPER' | 'EDI';
  submittedAt?: number;
  insurerClaimNumber?: string;
  status: ClaimStatus;
  statusHistory: ClaimStatusEvent[];
  paidAmount?: number;
  paymentDate?: string;
  denialReason?: string;
  denialCode?: string;
}

type ClaimStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'PARTIALLY_APPROVED'
  | 'DENIED'
  | 'PAID'
  | 'WRITTEN_OFF';
```

---

## 6. Insurance Claim Lifecycle

```
Visit Completed (بعد اكتمال الزيارة)
       ↓
ArgonCheckout generates invoice with insurance split
       ↓
Claim created in DRAFT status
       ↓
Billing staff reviews → attaches supporting documents
       ↓
Submitted to insurer portal / email
       ↓
Insurer review (3–30 days depending on insurer)
       ↓
Decision:
  APPROVED  → Payment expected → Mark PAID on receipt
  PARTIAL   → Appeal or write-off difference
  DENIED    → Appeal process or patient billing
       ↓
Payment reconciliation
```

---

## 7. Appeals and Denials

### Common Denial Reasons in Jordan
```
Code    Reason (English)                     Arabic
──────────────────────────────────────────────────────────────────
DN01    Service not covered                  الخدمة غير مغطاة
DN02    Pre-authorization not obtained       لم يتم الحصول على موافقة مسبقة
DN03    Non-network provider                 مزود خارج الشبكة
DN04    Duplicate claim                      مطالبة مكررة
DN05    Missing documentation               وثائق ناقصة
DN06    Benefit limit exhausted              وصل الحد الأقصى للمزايا
DN07    Service not medically necessary      غير ضروري طبياً
DN08    Expired eligibility                 انتهت صلاحية التأمين
```

### Appeal Window
- Most Jordanian insurers: 30–90 days from denial date.
- Argon must track denial date and alert billing team before appeal window closes.

---

## 8. Anti-Patterns

- ❌ Allowing a visit to complete billing without checking insurance eligibility first.
- ❌ Submitting a claim without all required ICD codes.
- ❌ Hard-coding co-payment rates (they change with policy renewals).
- ❌ Treating all insurers the same (each has different portals, rules, timelines).
- ❌ Missing pre-auth for procedures that require it (results in claim denial).
- ❌ Not tracking claim aging (denied/unpaid claims need follow-up).
- ❌ Accepting verbal pre-auth without a reference number.
- ❌ Storing insurance card images without linking to the insurance record.
