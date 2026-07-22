---
name: argon-healthcare-domain
description: >
  Core healthcare domain knowledge for building Argon Medical OS. Use this skill for any
  task involving clinical workflows, EMR/EHR design, medical coding, patient data modeling,
  visit lifecycle, SOAP notes, lab/pharmacy/radiology workflows, and anything that requires
  thinking like a healthcare professional rather than a generic software developer.
  Trigger on: clinical workflow, visit, patient record, diagnosis, prescription, lab order,
  SOAP, EMR, EHR, discharge, triage, referral, medical coding, ICD, CPT.
---

# Argon Healthcare Domain Knowledge

Think like a Senior Healthcare Workflow Expert who has implemented EMR systems in Jordanian
clinics and hospitals. You understand both the clinical reality (how doctors, nurses, and
pharmacists actually work) and the data model behind it. Never propose screens-only solutions —
design the clinical logic first, then the UI.

---

## 1. Core Clinical Concepts

### Patient Identity
Every patient in Argon has a permanent `patientId`. Identity data (name, DOB, national ID رقم
الهوية الوطنية, insurance card) is mutable but version-tracked. Medical records are never
deleted — soft-delete with full audit trail only.

### Visit Lifecycle (زيارة)
A visit is the atomic unit of care in Argon. States:
```
SCHEDULED → ARRIVED (triage) → IN_PROGRESS (examination) → COMPLETED → BILLED → CLOSED
                                                         ↘ REFERRED
                                                         ↘ ADMITTED
```
- Each state transition is immutable once written (append-only).
- `completeWorkspaceVisit()` is the canonical completion method in Argon Enterprise Workspace.
- Completion triggers billing checkout (`ArgonCheckout`) automatically.
- A visit can never go backwards in state — corrections use amendment records.

### SOAP Note Structure
```
Subjective  → Chief complaint (الشكوى الرئيسية), history of present illness, review of systems
Objective   → Vital signs, physical exam findings, lab/radiology results
Assessment  → Diagnoses (ICD-10/11 codes), differential diagnoses
Plan        → Treatment, medications (Rx), lab orders, radiology orders, referrals, follow-up
```
In Argon, each SOAP section is a separate append-only node in Firebase RTDB.

---

## 2. Medical Coding

### ICD-10 / ICD-11
- ICD-10 is current standard in Jordan; ICD-11 is the migration target.
- Every diagnosis in Argon MUST carry an ICD code — free text alone is insufficient for
  billing and epidemiology.
- Use dot notation: `J06.9` (Acute upper respiratory infection, unspecified).
- ICD-10-CM (US) vs ICD-10 (WHO): Jordan uses the WHO version. Do not confuse with CM codes.
- Common Jordan clinic codes: J06.9, K29.7, E11.9 (DM Type 2), I10 (Essential hypertension),
  M54.5 (Low back pain), N39.0 (UTI), L20.9 (Atopic dermatitis).

### CPT / Procedure Codes
- CPT codes are procedure-based billing codes (US origin but used as reference in Jordan
  private sector).
- Argon maps internal procedure catalog (`serviceId`) to CPT equivalents for insurance claims.
- Key categories: E/M codes (99201-99499), Surgery (10000-69999), Lab (80000-89999),
  Radiology (70000-79999).

### Drug Coding
- Use ATC (Anatomical Therapeutic Chemical) classification for drug catalog.
- Jordan formulary uses Arabic commercial names alongside generic INN names.
- Every medication in Argon pharmacy must have: genericName, brandName (Arabic + English),
  ATCCode, dispensingUnit, storageRequirements.

---

## 3. Clinical Workflow Patterns

### Outpatient Clinic Flow (العيادة الخارجية)
```
1. Patient Registration / Check-in
2. Triage → Vital signs (BP, HR, Temp, Weight, O2 Sat)
3. Queue assignment to doctor
4. Doctor examination → SOAP note
5. Orders: Rx | Lab | Radiology | Referral
6. Checkout / Billing
7. Pharmacy dispensing (if in-house)
8. Follow-up scheduling
```

### Inpatient Flow (قسم الداخلية)
```
1. Admission Order → bed assignment
2. Nursing assessments (every shift)
3. Daily physician rounds → progress notes
4. Orders: medications, procedures, consults
5. Discharge planning → discharge summary
6. Discharge order → billing finalization
```

### Emergency Flow (الطوارئ)
```
1. Triage → ESI Level (1-5) assignment
2. Immediate interventions for ESI 1-2
3. History & examination
4. Diagnostics (STAT orders)
5. Treatment → observation or disposition
6. Disposition: discharge / admit / transfer
```

---

## 4. Laboratory Workflow

### Order → Result Cycle
```
Physician order → Lab receives order → Sample collection (phlebotomy) →
Sample labeling (barcode) → Processing → Results entry → Verification →
Result release → Physician notification → Acknowledgment
```

### Critical Values (قيم حرجة)
- Potassium < 2.5 or > 6.5 mEq/L → immediate physician notification required.
- Glucose < 50 mg/dL → critical low.
- Hemoglobin < 7 g/dL → critical low.
- Argon must implement critical value alerts with mandatory acknowledgment by physician.

### Reference Ranges
- Store per-panel, per-gender, per-age-group reference ranges.
- Results outside reference range are flagged (H/L/HH/LL/Critical).
- Never hard-code reference ranges — manage as configurable data.

---

## 5. Pharmacy Workflow

### Prescription → Dispensing Cycle
```
Doctor writes Rx (in SOAP Plan) → Pharmacist reviews → Drug interaction check →
Insurance authorization (if needed) → Dispensing → Patient counseling → Documentation
```

### Drug Interaction Checking
- Check: Drug-Drug, Drug-Allergy, Drug-Condition interactions.
- Severity levels: Contraindicated / Major / Moderate / Minor.
- Contraindicated interactions must BLOCK dispensing with mandatory override justification.

### Controlled Substances (أدوية مخدرة)
- Require double signature (pharmacist + physician).
- Quantity dispensed must not exceed prescription amount.
- Full traceability: batch number, dispensing time, dispensing pharmacist.

---

## 6. Radiology Workflow

### Order → Report Cycle
```
Physician order → Radiology receives → Patient scheduling → Exam performed →
Images acquired → Radiologist reads → Report dictated → Report verified →
Report released → Physician notification
```

### DICOM & PACS Context
- DICOM (Digital Imaging and Communications in Medicine) is the universal standard.
- PACS (Picture Archiving and Communication System) stores and retrieves DICOM images.
- RIS (Radiology Information System) manages the workflow; PACS manages the images.
- Argon RIS module integrates with external PACS via HL7/FHIR or direct API.

---

## 7. Jordan-Specific Clinical Context

### Healthcare Structure in Jordan
- Primary care: Government health centers (وزارة الصحة), private clinics.
- Secondary: District hospitals, private hospitals.
- Tertiary: University hospitals (JUH, KAH), specialized centers.
- Argon serves private clinics and medical complexes (مجمعات طبية).

### Jordanian Patient Demographics
- Arabic is the primary clinical language; English for medical coding.
- National ID (الرقم الوطني) is the primary patient identifier — 10 digits.
- Passport number for non-Jordanian patients.
- Insurance: JNIH (National), Royal Medical Services, private insurers (MedNet, AXA, Bupa).

### Clinical Documentation Language
- Most physicians document in English or mixed Arabic-English.
- Drug names may be written in Arabic trade names (e.g., أوجمنتين for Augmentin).
- Diagnoses should always have both Arabic label and ICD code.

---

## 8. Data Quality Rules (Non-Negotiable)

1. No visit can be completed without at least one diagnosis (Assessment).
2. No prescription can be issued without an active visit.
3. Lab and radiology orders must be linked to a visit and diagnosis.
4. Every clinical record must carry: `createdBy`, `createdAt`, `visitId`, `patientId`.
5. Patient allergies must be checked before any prescription is saved.
6. Vital signs must be within physiologically plausible ranges:
   - BP systolic: 50–300 mmHg
   - Heart rate: 20–300 bpm
   - Temperature: 30–44 °C
   - O2 saturation: 50–100%
   - Weight: 0.5–500 kg

---

## 9. Anti-Patterns to Avoid

- ❌ Storing diagnoses as free text only (no ICD code).
- ❌ Allowing visit completion with empty clinical content.
- ❌ Hard-deleting any clinical record.
- ❌ Sharing patient records across unrelated clinics (multi-tenant isolation).
- ❌ Allowing prescription without allergy check.
- ❌ Treating lab results as simple key-value pairs (ignores ranges, units, flags).
- ❌ Building "screens" without defining the underlying clinical data model first.
