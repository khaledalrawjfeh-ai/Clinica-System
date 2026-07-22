---
name: argon-laboratory-systems
description: >
  Laboratory information system (LIS) design for Argon Medical OS. Use when building
  lab order workflows, sample tracking, result entry, critical value handling, reference
  ranges, or lab reporting. Trigger on: lab, laboratory, مختبر, test, فحص, order, sample,
  عينة, result, نتيجة, reference range, critical value, CBC, panel, analyzer, LIS.
---

# Argon Laboratory Systems

Think like a Senior Laboratory Information Systems Engineer who also holds a medical
laboratory science background. Lab results directly affect clinical decisions — errors
in result entry, missed critical values, or mislabeled samples can be fatal.

---

## 1. Lab Data Model

### Lab Test Catalog
```typescript
interface LabTest {
  testId: string;
  code: string;                  // Internal code + LOINC code where available
  loincCode?: string;            // Logical Observation Identifiers Names and Codes
  name_ar: string;               // e.g., صورة الدم الكاملة
  name_en: string;               // e.g., Complete Blood Count (CBC)
  category: LabCategory;
  turnaroundHours: number;       // Expected TAT
  specimenType: string;          // EDTA blood, Serum, Urine, etc.
  specimenVolume: string;        // e.g., '3 mL EDTA'
  storageRequirements: string;
  components: LabComponent[];    // Sub-tests within a panel
  price: number;                 // In fils
  requiresFasting: boolean;
  specialInstructions_ar?: string;
}

interface LabComponent {
  componentId: string;
  name_ar: string;
  name_en: string;
  unit: string;                  // e.g., g/dL, 10³/μL, mg/dL
  dataType: 'NUMERIC' | 'TEXT' | 'CODED';
  referenceRanges: ReferenceRange[];
  criticalLow?: number;
  criticalHigh?: number;
  decimalPlaces: number;
}

interface ReferenceRange {
  gender: 'M' | 'F' | 'ALL';
  ageMinYears: number;
  ageMaxYears: number;
  low: number;
  high: number;
  unit: string;
}
```

### Lab Categories in Jordan Clinics
```
Hematology        صورة دم, تجلط, مجموعة دم
Chemistry         كيمياء دم: سكر, كلى, كبد, دهون, كهارل
Microbiology      زراعة وتحسس, CBC
Immunology        هرمونات, فيروسات (HBsAg, Anti-HCV, HIV), أجسام مضادة
Urinalysis        تحليل بول كامل, زراعة بول
Coagulation       PT, PTT, INR
Serology          VDRL, RF, CRP, Widal
Hormones          TSH, T3, T4, هرمونات الخصوبة
```

---

## 2. Lab Order Lifecycle

### Order State Machine
```
ORDERED → SAMPLE_COLLECTED → PROCESSING → RESULTED → VERIFIED → RELEASED
                                                    ↘ AMENDED (after release)
         ↘ CANCELLED (before sample collection only)
```

### Lab Order Record
```typescript
interface LabOrder {
  orderId: string;
  visitId: string;
  patientId: string;
  tenantId: string;
  deptId: string;                // Ordering department
  orderedBy: string;             // Doctor userId
  orderedAt: number;

  tests: Array<{
    testId: string;
    testName_ar: string;
    urgent: boolean;
    clinicalIndication: string;  // Why ordered (ICD code / note)
  }>;

  // Sample
  sample?: {
    collectedBy: string;         // Phlebotomist
    collectedAt: number;
    barcodeId: string;           // Unique sample label
    specimenType: string;
    collectionSite?: string;     // e.g., 'left antecubital vein'
  };

  status: LabOrderStatus;
  statusHistory: StatusEvent[];

  // Results
  resultId?: string;
  resultedAt?: number;
  verifiedBy?: string;
  verifiedAt?: number;
  releasedAt?: number;
  turnaroundActualHours?: number;

  // Critical value handling
  hasCriticalValue: boolean;
  criticalValueAcknowledgedBy?: string;
  criticalValueAcknowledgedAt?: number;
}
```

---

## 3. Sample Management

### Barcode / Label Requirements
Each sample label must contain:
- Patient full name (Arabic)
- Patient date of birth
- Patient national ID (last 4 digits only for privacy)
- Barcode (unique sample ID)
- Test name
- Collection date/time
- Ordering doctor name
- Specimen type

### Sample Integrity Checks
Before result entry, verify:
1. Barcode matches order in system.
2. Patient name on tube matches patient in system.
3. Specimen is within stability window (e.g., serum for glucose: max 2 hours uncentrifuged).
4. Sample volume is adequate.
5. Hemolysis / lipemia / icterus noted and recorded.

---

## 4. Result Entry and Validation

### Numeric Result Validation
```typescript
function validateLabResult(
  component: LabComponent,
  value: number
): ResultValidation {
  // 1. Physiologically impossible range check (absolute limits)
  const absLimits = ABSOLUTE_LIMITS[component.componentId];
  if (absLimits && (value < absLimits.min || value > absLimits.max)) {
    return { valid: false, flag: 'IMPOSSIBLE', message: 'قيمة مستحيلة فسيولوجياً — تحقق من الإدخال' };
  }

  // 2. Critical value check
  if (component.criticalLow !== undefined && value < component.criticalLow) {
    return { valid: true, flag: 'LL', critical: true, message: 'قيمة حرجة منخفضة' };
  }
  if (component.criticalHigh !== undefined && value > component.criticalHigh) {
    return { valid: true, flag: 'HH', critical: true, message: 'قيمة حرجة مرتفعة' };
  }

  // 3. Reference range flag
  const range = getApplicableRange(component, patient.gender, patient.ageYears);
  if (range) {
    if (value < range.low) return { valid: true, flag: 'L' };
    if (value > range.high) return { valid: true, flag: 'H' };
  }

  return { valid: true, flag: 'N' }; // Normal
}
```

### Critical Value Protocol
```
Critical value detected →
  System flags result as CRITICAL →
  PREVENTS result release until acknowledged →
  Sends URGENT notification to ordering doctor (push + SMS) →
  Doctor must acknowledge within 30 minutes →
  If no acknowledgment: escalate to dept head →
  Acknowledgment is recorded in audit log →
  Only then: result released to patient
```

### Critical Values Reference (Jordan Standard)
```
Component              Critical Low    Critical High
──────────────────────────────────────────────────
Hemoglobin             < 7.0 g/dL      > 20.0 g/dL
WBC                    < 2.0 ×10³/μL   > 30.0 ×10³/μL
Platelets              < 50 ×10³/μL    > 1000 ×10³/μL
Sodium                 < 120 mEq/L     > 160 mEq/L
Potassium              < 2.5 mEq/L     > 6.5 mEq/L
Glucose                < 50 mg/dL      > 500 mg/dL
Creatinine             —               > 10 mg/dL (acute)
INR                    —               > 5.0
Calcium                < 6.0 mg/dL     > 13.0 mg/dL
```

---

## 5. Lab Quality Metrics

### Key Performance Indicators
```typescript
interface LabKPIs {
  turnaroundTime: {
    routine: { target: 2, unit: 'hours' };
    urgent: { target: 45, unit: 'minutes' };
    stat: { target: 20, unit: 'minutes' };
  };
  criticalValueNotificationTime: { target: 30, unit: 'minutes' };
  sampleRejectionRate: number;   // Target < 1%
  resultAmendmentRate: number;   // Target < 0.5%
  unacknowledgedCriticals: number; // Target: always 0
}
```

---

## 6. External Lab Integration

When Argon connects to an external laboratory (not in-house):
- Orders sent via HL7 v2.x ORU/ORM messages or REST API (lab-dependent).
- Results received via HL7 or file import (CSV/PDF).
- All received results must go through the same validation and critical value pipeline.
- External lab barcode ID must be stored alongside Argon's internal order ID.

---

## 7. Anti-Patterns

- ❌ Allowing result entry without verifying sample barcode against order.
- ❌ Releasing critical results without physician acknowledgment.
- ❌ Storing reference ranges as hard-coded values in the app (must be configurable per lab).
- ❌ No amendment trail — if a result is corrected, both the original and correction are kept.
- ❌ Allowing result entry for a cancelled order.
- ❌ Not capturing the "verified by" field (every result needs a second reviewer).
- ❌ Using free-text result units (always use standardized units from catalog).
- ❌ Not tracking turnaround times (required for lab quality accreditation).
