---
name: argon-pharmacy-systems
description: >
  Pharmacy workflow and medication management for Argon Medical OS. Use when designing
  prescription handling, drug inventory, dispensing workflows, drug interaction checking,
  controlled substances, or pharmacy reporting. Trigger on: pharmacy, صيدلية, prescription,
  وصفة, drug, medication, دواء, dispense, inventory, مخزون, interaction, controlled substance,
  مخدر, dosage, refill, formulary, batch, expiry.
---

# Argon Pharmacy Systems

Think like a Senior Clinical Pharmacist who also understands software systems. Medication
errors kill patients. Every pharmacy feature in Argon must have multiple safeguards, and
the most critical check — drug-allergy interaction — must NEVER be skippable.

---

## 1. Medication Data Model

### Drug Catalog Entry
```typescript
interface Drug {
  drugId: string;
  // Names (multi-language for Jordan)
  genericName_en: string;           // INN (International Nonproprietary Name)
  genericName_ar: string;           // e.g., أموكسيسيلين
  brandNames: Array<{
    name_ar: string;                // e.g., أوجمنتين
    name_en: string;                // e.g., Augmentin
    manufacturer: string;
    isLocallyAvailable: boolean;
  }>;

  // Classification
  atcCode: string;                  // e.g., J01CA04
  atcDescription: string;
  dosageForm: string;               // Tablet / Syrup / Injection / etc.
  strength: string;                 // e.g., '500mg', '125mg/5ml'
  dispensingUnit: string;           // e.g., 'tablet', 'vial', 'bottle'

  // Regulatory
  isControlled: boolean;
  controlledSchedule?: 'I' | 'II' | 'III' | 'IV';
  requiresPrescription: boolean;
  jordanApproved: boolean;          // JFDA registration

  // Clinical
  routesOfAdministration: string[];
  commonDosages: string[];
  contraindications: string[];
  allergyCrossReactivity: string[]; // e.g., Amoxicillin cross-reacts with all penicillins
  storageRequirements: string;
  refrigerated: boolean;

  // Interactions
  interactions: DrugInteraction[];
}
```

### Prescription Record
```typescript
interface Prescription {
  rxId: string;
  visitId: string;
  patientId: string;
  prescribedBy: string;          // Doctor's userId
  prescribedAt: number;          // Server timestamp

  items: PrescriptionItem[];
  status: 'ACTIVE' | 'DISPENSED' | 'PARTIALLY_DISPENSED' | 'CANCELLED' | 'EXPIRED';
  dispensingRecord?: DispensingRecord;

  // For controlled substances
  requiresDualSignature?: boolean;
  secondSignatureBy?: string;
  secondSignatureAt?: number;
}

interface PrescriptionItem {
  rxItemId: string;
  drugId: string;
  genericName_ar: string;
  brandNamePreferred?: string;
  dosage: string;                // e.g., '500mg'
  frequency: string;             // e.g., 'مرتين يومياً', 'BID'
  duration: string;              // e.g., '7 أيام', '7 days'
  quantity: number;              // Units to dispense
  refillsAllowed: number;
  substitutionAllowed: boolean;
  instructions: string;          // e.g., 'مع الطعام'
  clinicalNote?: string;         // Internal pharmacist note
}
```

---

## 2. Prescription Safety Checks

### Check Priority Order (MUST ALL PASS before dispensing)
```
Priority 1 — HARD STOP (cannot override):
  ✗ Drug prescribed to patient with documented contraindicated allergy
  ✗ Controlled substance without dual signature
  ✗ Prescription from non-licensed prescriber

Priority 2 — WARN + CONFIRM (pharmacist can override with note):
  ⚠ Drug interaction severity: MAJOR
  ⚠ Drug-condition contraindication (e.g., beta-blocker in acute asthma)
  ⚠ Dose exceeds maximum recommended
  ⚠ Duplicate active prescription (same drug already dispensed)

Priority 3 — INFORMATIONAL (note only, no block):
  ℹ Drug interaction severity: MODERATE
  ℹ Generic available for branded prescription
  ℹ Drug approaching expiry in inventory
```

### Allergy Check Algorithm
```typescript
async function checkDrugAllergyConflict(
  patientId: string,
  drugId: string,
  tenantId: string
): Promise<AllergyCheckResult> {
  const [allergies, drug] = await Promise.all([
    loadPatientAllergies(tenantId, patientId),
    loadDrug(drugId),
  ]);

  for (const allergy of allergies) {
    // Direct match
    if (allergy.substanceId === drugId) {
      return { conflict: true, severity: 'CONTRAINDICATED', allergy };
    }
    // Cross-reactivity check
    if (drug.allergyCrossReactivity.includes(allergy.substanceId)) {
      return { conflict: true, severity: 'CROSS_REACTIVE', allergy };
    }
    // ATC class match (e.g., all penicillins share J01C prefix)
    if (allergy.atcClassContraindicated &&
        drug.atcCode.startsWith(allergy.atcClassContraindicated)) {
      return { conflict: true, severity: 'CLASS_CONTRAINDICATED', allergy };
    }
  }
  return { conflict: false };
}
```

---

## 3. Dispensing Workflow

```
Pharmacist receives Rx (linked to visitId) →
  1. Verify patient identity (name + national ID)
  2. Verify prescriber is licensed + prescription is recent (< 7 days)
  3. Run all safety checks (allergy + interaction + dose)
  4. Check inventory availability
  5. Prepare medication
  6. Label with: patient name, drug name (Arabic), dose, frequency, duration, expiry
  7. Counsel patient (especially for first-time medications)
  8. Record dispensing (batch number, pharmacist ID, timestamp)
  9. Update inventory (decrement stock)
  10. Mark Rx as DISPENSED in system
```

### Dispensing Record
```typescript
interface DispensingRecord {
  dispensingId: string;
  rxId: string;
  dispensedBy: string;           // Pharmacist userId
  dispensedAt: number;
  items: Array<{
    rxItemId: string;
    drugId: string;
    quantityDispensed: number;
    batchNumber: string;
    expiryDate: string;
    substituted: boolean;
    substitutionReason?: string;
  }>;
  patientCounselingGiven: boolean;
  pharmacistNotes?: string;
  // Controlled substance extras
  dualSignatureBy?: string;
  dualSignatureAt?: number;
}
```

---

## 4. Inventory Management

### Inventory Structure
```typescript
interface DrugInventory {
  inventoryId: string;
  tenantId: string;
  deptId: string;               // Each pharmacy dept has its own inventory
  drugId: string;
  genericName_ar: string;

  // Stock levels
  currentStock: number;          // In dispensing units
  minimumStock: number;          // Reorder trigger level
  reorderQuantity: number;

  // Batch tracking (array of batches)
  batches: Array<{
    batchId: string;
    batchNumber: string;
    supplier: string;
    receivedDate: string;
    expiryDate: string;
    quantity: number;
    costPerUnit: number;         // In fils
  }>;

  // FEFO (First Expiry, First Out) — required for pharmacy
  dispensingOrder: 'FEFO';

  // Alerts
  nearExpiryThresholdDays: number;  // Default: 90
  lastStocktakeDate: string;
}
```

### FEFO Dispensing
Always dispense from the batch with the earliest expiry date first.
```typescript
function selectBatchForDispensing(inventory: DrugInventory, quantity: number): BatchSelection[] {
  const validBatches = inventory.batches
    .filter(b => b.quantity > 0 && new Date(b.expiryDate) > new Date())
    .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()); // FEFO

  const selections: BatchSelection[] = [];
  let remaining = quantity;
  for (const batch of validBatches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity, remaining);
    selections.push({ batchId: batch.batchId, quantity: take, expiryDate: batch.expiryDate });
    remaining -= take;
  }
  if (remaining > 0) throw new Error('Insufficient stock');
  return selections;
}
```

---

## 5. Controlled Substances Special Handling

```typescript
// Controlled substance dispensing requires extra logging
const CONTROLLED_SUBSTANCE_LOG_FIELDS = [
  'patientNationalId',           // رقم هوية المريض
  'prescribingDoctorId',         // رقم ترخيص الطبيب
  'prescribingDoctorLicense',
  'pharmacistId',
  'secondSignaturePharmacistId', // مشرف الصيدلية
  'quantityPrescribed',
  'quantityDispensed',
  'batchNumber',
  'timestamp',
  'visitId',
  'runningBalance',              // Stock balance after dispensing
];

// Balances must reconcile daily — any discrepancy is a regulatory incident
```

---

## 6. Anti-Patterns

- ❌ Allowing pharmacist to override a HARD STOP allergy conflict without explicit double-confirmation and mandatory reason.
- ❌ Dispensing without recording the batch number (required for recalls).
- ❌ LIFO dispensing — always FEFO for medications (patient safety + legal).
- ❌ Decrementing inventory before confirming dispensing completed.
- ❌ Free-text drug entry without linking to the drug catalog (no safety checks possible).
- ❌ Allowing prescription older than 7 days to be dispensed without pharmacist review.
- ❌ Skipping patient identity verification for controlled substances.
- ❌ Not logging controlled substance running balances (regulatory requirement).
