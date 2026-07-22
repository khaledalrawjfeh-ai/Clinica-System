---
name: argon-radiology-systems
description: >
  Radiology information system (RIS) design for Argon Medical OS. Use when building
  radiology order workflows, imaging report management, PACS integration concepts,
  DICOM basics, or radiology-specific clinical logic. Trigger on: radiology, أشعة,
  imaging, DICOM, PACS, RIS, X-ray, CT, MRI, ultrasound, report, تقرير, order, study.
---

# Argon Radiology Systems

Think like a Senior RIS/PACS Engineer who understands both radiology workflow and
DICOM standards. Radiology in Argon integrates with external PACS systems — Argon
manages the workflow (orders, scheduling, reports) while PACS manages the images.

---

## 1. Radiology Modalities Supported

```
Modality   Code   Arabic Name             Typical Use
────────────────────────────────────────────────────────────
X-Ray      CR/DX  أشعة سينية              Chest, bones, abdomen
Ultrasound US     موجات صوتية / سونار     Abdomen, OB/GYN, vascular
CT Scan    CT     طبقي محوري              Head, chest, abdomen, angio
MRI        MR     رنين مغناطيسي           Brain, spine, joints
Mammography MG    تصوير الثدي             Breast screening/diagnostic
Fluoroscopy RF    تنظير بالأشعة           GI series, HSG
Nuclear    NM     طب نووي                 Bone scan, thyroid scan
```

---

## 2. Radiology Order Model

```typescript
interface RadiologyOrder {
  orderId: string;
  visitId: string;
  patientId: string;
  tenantId: string;
  deptId: string;

  // What was ordered
  exams: Array<{
    examId: string;
    modality: string;             // CT / MRI / US / XR
    bodyPart: string;             // e.g., 'chest', 'abdomen', 'left knee'
    examCode: string;             // Internal or CPT code
    examName_ar: string;
    withContrast: boolean;
    laterality?: 'LEFT' | 'RIGHT' | 'BILATERAL';
    clinicalIndication: string;   // Required for PACS order
    icdCode: string;
  }>;

  // Clinical context
  orderedBy: string;              // Doctor
  orderedAt: number;
  urgency: 'ROUTINE' | 'URGENT' | 'STAT' | 'EMERGENCY';
  clinicalHistory: string;        // Critical for radiologist context
  allergyToContrast?: boolean;
  recentCreatinine?: number;      // Required if contrast ordered (renal function)

  // Scheduling
  scheduledAt?: number;
  radiologyDeptId?: string;
  technicianId?: string;

  // Acquisition
  performedAt?: number;
  acquisitionTechnicianId?: string;
  pacsStudyId?: string;           // PACS Study Instance UID

  // Reporting
  reportId?: string;
  status: RadiologyOrderStatus;
  statusHistory: StatusEvent[];
}

type RadiologyOrderStatus =
  | 'ORDERED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'IMAGES_ACQUIRED'
  | 'READING'
  | 'DRAFT_REPORT'
  | 'REPORT_VERIFIED'
  | 'REPORT_RELEASED'
  | 'CANCELLED';
```

---

## 3. Radiology Report Model

```typescript
interface RadiologyReport {
  reportId: string;
  orderId: string;
  visitId: string;
  patientId: string;

  // Report content
  technique: string;              // How the study was performed
  clinicalHistory: string;        // Copied from order + any additions
  findings: string;               // Main report body (findingsنتائج الفحص)
  impression: string;             // Summary / conclusion (الاستنتاج)
  recommendations?: string;       // Follow-up recommendations

  // Addendum (if report is amended after release)
  addenda?: Array<{
    addendumId: string;
    text: string;
    addedBy: string;
    addedAt: number;
    reason: string;
  }>;

  // Radiologist
  draftedBy: string;
  draftedAt: number;
  verifiedBy?: string;
  verifiedAt?: number;
  releasedAt?: number;

  // PACS link
  pacsStudyUrl?: string;          // Link to view images in PACS viewer
  pacsStudyUid?: string;          // DICOM Study Instance UID

  // Quality
  studyQuality: 'ADEQUATE' | 'SUBOPTIMAL' | 'NON_DIAGNOSTIC';
  limitingFactors?: string;       // e.g., patient motion, bowel gas
}
```

---

## 4. DICOM Concepts for Argon

Argon manages the **workflow** (RIS side). The **images** live in PACS (external or
embedded PACS viewer). Understanding DICOM hierarchy is essential for integration.

### DICOM Hierarchy
```
Patient
└── Study (one imaging encounter)
    ├── Study Instance UID (globally unique)
    ├── Study Date / Time
    └── Series (one modality session within study)
        ├── Series Instance UID
        ├── Modality (CT / MR / US etc.)
        └── Instances / Images (individual frames)
            └── SOP Instance UID (each image)
```

### Key DICOM Tags for Argon Integration
```
(0010,0020) Patient ID          → must match Argon patientId
(0010,0010) Patient Name        → Arabic name in DICOM PN format
(0020,000D) Study Instance UID  → stored in RadiologyOrder.pacsStudyId
(0008,0060) Modality            → CT, MR, US, CR, DX, MG...
(0008,0020) Study Date
(0008,0030) Study Time
(0032,1070) Requested Procedure → links to RadiologyOrder
```

### PACS Integration Pattern
```typescript
// When images are acquired, PACS sends a webhook or Argon polls
// Argon stores the Study Instance UID for viewer deep links

async function linkStudyToOrder(
  orderId: string,
  pacsStudyUid: string,
  pacsViewerBaseUrl: string
): Promise<void> {
  const studyUrl = `${pacsViewerBaseUrl}/viewer?studyUID=${pacsStudyUid}`;
  await update(ref(db), {
    [`orders/${orderId}/pacsStudyId`]: pacsStudyUid,
    [`orders/${orderId}/pacsStudyUrl`]: studyUrl,
    [`orders/${orderId}/status`]: 'IMAGES_ACQUIRED',
    [`orders/${orderId}/imagesAcquiredAt`]: serverTimestamp(),
  });
}
```

---

## 5. Contrast Safety Protocols

### Pre-Contrast Checklist
Before CT with IV contrast, Argon must check/prompt:
- [ ] Creatinine / GFR result from last 30 days
- [ ] History of contrast allergy
- [ ] Metformin use (hold 48h after iodinated contrast if renal impairment)
- [ ] Thyroid disease (iodinated contrast caution)
- [ ] Pregnancy status (for female patients 12–50 years old)

```typescript
const CONTRAST_SAFETY_CHECKS: ContraCheck[] = [
  { field: 'recentCreatinine', threshold: 1.5, message: 'Creatinine > 1.5 mg/dL: nephroprotocol required' },
  { field: 'contrastAllergy', message: 'Documented contrast allergy: premedication required' },
  { field: 'metforminUse', message: 'Metformin user: advise to hold 48h post-contrast if eGFR < 60' },
];
```

---

## 6. Report Quality and Turnaround

### Turnaround Time Standards
```
Category               Target TAT
──────────────────────────────────────
STAT (life-threatening)  < 1 hour
Urgent                   < 4 hours
Routine inpatient        < 24 hours
Routine outpatient       < 48 hours
Elective MRI/CT          < 72 hours
```

### Incidental Findings
When a radiologist discovers a significant finding not related to the original clinical
question (e.g., lung nodule on a rib X-ray), Argon must:
1. Flag the report as containing an incidental finding.
2. Generate an alert to the ordering physician.
3. Require physician acknowledgment.
4. Suggest follow-up recommendation template.

---

## 7. Anti-Patterns

- ❌ Allowing contrast CT orders without checking creatinine.
- ❌ Releasing a radiology report without radiologist verification.
- ❌ Overwriting a report — all corrections must be addenda (append-only).
- ❌ Not storing the PACS Study Instance UID (makes image retrieval impossible).
- ❌ Generic "findings" field with no structure — findings and impression must be separate.
- ❌ Allowing the ordering physician to write the radiology report.
- ❌ Not flagging stat orders differently in the PACS/RIS worklist.
- ❌ No mechanism to acknowledge incidental findings.
