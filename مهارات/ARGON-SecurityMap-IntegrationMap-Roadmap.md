# ARGON Medical OS — Security Map + Integration Map + Future Roadmap
## وثيقة الأمان والتكامل وخارطة الطريق

---

# SECTION A — Security Map (خريطة الأمان الكاملة)

## A.1 نموذج الأمان متعدد الطبقات

```
┌═══════════════════════════════════════════════════════════════════╗
║              ARGON ZERO TRUST SECURITY MODEL                      ║
║         "ثق بلا أحد — تحقق من الجميع في كل مرة"                ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  Layer 0 — Network (HTTPS + Firebase TLS)                        ║
║  ────────────────────────────────────────                         ║
║  كل الاتصالات مشفَّرة TLS 1.3                                    ║
║  Firebase Hosting يفرض HTTPS إلزامياً                             ║
║                                                                   ║
║  Layer 1 — Authentication (Firebase Auth)                        ║
║  ────────────────────────────────────────                         ║
║  Email + Password (bcrypt)                                        ║
║  Multi-Factor Auth للأدوار الحساسة (مدير، محاسب)                ║
║  Session Token انتهاء = 8 ساعات (يوم عمل)                       ║
║  تجديد تلقائي في الخلفية                                          ║
║  قفل الحساب بعد 5 محاولات فاشلة                                  ║
║                                                                   ║
║  Layer 2 — Authorization (Custom Claims + RBAC)                  ║
║  ────────────────────────────────────────────                     ║
║  JWT Custom Claims: { clinicId, role, dept, permissions }        ║
║  يُضبَط من Firebase Admin SDK                                    ║
║  يُقرَأ في Firebase Rules + app code                             ║
║                                                                   ║
║  Layer 3 — Firebase Security Rules                               ║
║  ─────────────────────────────────                               ║
║  كل node مُقيَّد بـ auth.token.clinicId == $clinic_id           ║
║  المستخدم لا يقرأ إلا بيانات عيادته                              ║
║  لا كتابة بدون Firebase UID صالح                                 ║
║                                                                   ║
║  Layer 4 — Application Permission Guard                          ║
║  ────────────────────────────────────                            ║
║  كل دالة حساسة: ArgonRBAC.check(action, resource)               ║
║  إذا فشل → توقف + سجل في Audit Log                              ║
║                                                                   ║
║  Layer 5 — Audit Trail (append-only)                            ║
║  ────────────────────────────────                               ║
║  كل عملية: من + ماذا + متى + IP + Device + نتيجة               ║
║  يُكتَب فقط (لا حذف، لا تعديل بموجب Firebase Rules)            ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
```

## A.2 Firebase Security Rules الكاملة (بعد تطبيق Firebase Auth)

```json
{
  "rules": {
    "clinics": {
      "$clinic_id": {
        ".read":  "auth != null && auth.token.clinicId == $clinic_id",
        ".write": "auth != null && auth.token.clinicId == $clinic_id",

        "patients": {
          "$patient_id": {
            ".read":  "auth != null && auth.token.clinicId == $clinic_id && (auth.token.role == 'doctor' || auth.token.role == 'nurse' || auth.token.role == 'admin' || auth.token.role == 'clinic_owner')",
            ".write": "auth != null && auth.token.clinicId == $clinic_id && (auth.token.role == 'doctor' || auth.token.role == 'admin')",
            ".validate": "newData.hasChildren(['info'])"
          }
        },

        "invoices": {
          "$invoice_id": {
            ".write": "auth != null && auth.token.clinicId == $clinic_id && (!data.exists() || newData.exists())",
            ".read":  "auth != null && auth.token.clinicId == $clinic_id && (auth.token.role == 'accountant' || auth.token.role == 'cashier' || auth.token.role == 'admin' || auth.token.role == 'clinic_owner')"
          }
        },

        "audit_logs": {
          "$log_id": {
            ".write": "auth != null && auth.token.clinicId == $clinic_id && !data.exists()",
            ".read":  "auth != null && auth.token.clinicId == $clinic_id && auth.token.role == 'admin'"
          }
        },

        "pharmacy": {
          ".read":  "auth != null && auth.token.clinicId == $clinic_id && (auth.token.dept == 'pharmacy' || auth.token.role == 'admin')",
          ".write": "auth != null && auth.token.clinicId == $clinic_id && (auth.token.dept == 'pharmacy' || auth.token.role == 'admin')"
        },

        "insurance": {
          ".read":  "auth != null && auth.token.clinicId == $clinic_id",
          ".write": "auth != null && auth.token.clinicId == $clinic_id && (auth.token.role == 'insurance_officer' || auth.token.role == 'admin')"
        }
      }
    },

    "insurance_master": {
      ".read":  "auth != null",
      ".write": "auth != null && auth.token.role == 'super_admin'"
    },

    "drug_master": {
      ".read":  "auth != null",
      ".write": "auth != null && auth.token.role == 'super_admin'"
    }
  }
}
```

## A.3 مصفوفة الأمان لكل مسار Firebase

| المسار | قراءة | كتابة | حذف | ملاحظة |
|--------|-------|-------|-----|--------|
| `patients/*` | Doctor, Nurse, Admin | Doctor, Admin | ❌ ممنوع | لا حذف مطلقاً |
| `bookings/*` | Reception, Doctor, Admin | Reception, Doctor | Reception (إلغاء) | تسجيل سبب الإلغاء |
| `completedBookings/*` | Admin, Accountant | النظام فقط | ❌ ممنوع | append-only |
| `invoices/*` | Cashier, Accountant, Admin | Billing Engine | ❌ ممنوع | void بدلاً من حذف |
| `financial_transactions/*` | Accountant, Admin | Cashier, System | ❌ ممنوع | append-only |
| `audit_logs/*` | Admin فقط | System فقط | ❌ ممنوع | append-only |
| `pharmacy/inventory/*` | Pharmacist, Manager | Pharmacist | ❌ ممنوع | لا حذف إلا deactivate |
| `pharmacy/suppliers/*` | Pharm Manager | Pharm Manager | Pharm Manager (soft) | — |
| `insurance/claims/*` | Insurance Officer, Admin | Insurance Officer | ❌ ممنوع | append-only |
| `users/*` | نفس المستخدم, HR, Admin | Admin فقط | Admin (soft) | — |

## A.4 PHI (Protected Health Information) - قواعد حماية البيانات الطبية

```
البيانات الحساسة وكيفية التعامل معها:

NEVER expose in:
├── URL Parameters (لا رقم وطني في URL)
├── Console Logs (لا اسم مريض أو رقم هاتف في الـ console)
├── Error Messages (لا بيانات مريض في رسائل الخطأ)
├── Local Storage (بيانات حساسة في sessionStorage فقط)
└── DOM Attributes (لا data-nationalId في HTML)

ALWAYS:
├── تشفير كلمات المرور (SHA-256 + salt في الحد الأدنى، bcrypt مُفضَّل)
├── تسجيل كل وصول لملف مريض في Audit Log
├── انتهاء صلاحية الجلسة بعد 8 ساعات
├── قفل الشاشة عند الخمول +15 دقيقة (للواجهات الحساسة)
└── طباعة الفواتير والتقارير في بيئة آمنة
```

## A.5 خطة الاستجابة للحوادث الأمنية

```
مستويات الحوادث:

LEVEL 1 — خرق بيانات مريض واحد
├── إيقاف الحساب المخترَق فوراً
├── مراجعة Audit Log للساعات الأخيرة
├── إخطار مدير العيادة
└── توثيق الحادثة

LEVEL 2 — وصول غير مصرَّح للبيانات المالية
├── تجميد كل العمليات المالية
├── مراجعة كل financial_transactions في الفترة
├── إخطار المدير والمحاسب
└── فحص Firebase Rules

LEVEL 3 — خرق كامل (اختراق قاعدة البيانات)
├── إيقاف الخدمة فوراً
├── تغيير كل كلمات المرور وإلغاء كل الـ tokens
├── فحص النسخة الاحتياطية الأخيرة
├── إخطار الجهات القانونية
└── الاسترداد من آخر نسخة احتياطية نظيفة
```

---

# SECTION B — Integration Map (خريطة التكامل)

## B.1 التكاملات الحالية (Active)

```
┌─────────────────────────────────────────────────────┐
│ التكاملات الشغّالة الآن                             │
├─────────────────────────────────────────────────────┤
│ Firebase Realtime DB    ← قاعدة البيانات الأساسية  │
│ Firebase Auth           ← المصادقة (يُضاف)          │
│ Firebase Storage        ← رفع الصور والملفات        │
│ Firebase Hosting        ← استضافة الويب             │
│ Firebase Cloud Func.    ← معالجة الخلفية            │
│ WhatsApp (wa.me link)   ← إرسال بسيط للمريض        │
│ Google Fonts            ← Tajawal + IBM Plex Mono   │
└─────────────────────────────────────────────────────┘
```

## B.2 التكاملات المُخطَّطة (Planned)

```
المرحلة 1 — قريبة المدى (6 أشهر):
┌─────────────────────────────────────────────────────┐
│ WhatsApp Business API                               │
│   ← إشعارات ذكية: تذكير موعد / نتيجة جاهزة        │
│   ← إرسال الفاتورة كصورة للمريض                   │
│   ← تأكيد الحجز / الإلغاء                         │
│                                                     │
│ ISTD Jordan (فوترة إلكترونية)                      │
│   ← رفع الفواتير الضريبية                          │
│   ← استلام رقم القبول                              │
│   ← QR Code على كل فاتورة                         │
└─────────────────────────────────────────────────────┘

المرحلة 2 — متوسطة المدى (12 شهر):
┌─────────────────────────────────────────────────────┐
│ شبكات التأمين (Insurance Networks)                 │
│   MedNet API  ← تحقق صلاحية + موافقة مسبقة        │
│   Nextcare    ← مطالبات إلكترونية                  │
│   HealthMark  ← تسوية مباشرة                       │
│                                                     │
│ JFDA (هيئة الغذاء والدواء الأردنية)                │
│   ← قاعدة بيانات الأدوية المعتمدة                  │
│   ← التحقق من تسجيل الأدوية                        │
│   ← تنبيهات السحب من السوق                         │
│                                                     │
│ Twilio / SMS Gateway                               │
│   ← رسائل SMS تذكير بالمواعيد                     │
│   ← إشعارات عاجلة للأطباء (نتائج حرجة)            │
└─────────────────────────────────────────────────────┘

المرحلة 3 — بعيدة المدى (18-24 شهر):
┌─────────────────────────────────────────────────────┐
│ PACS / DICOM Integration                           │
│   ← عرض صور الأشعة داخل النظام                    │
│   ← DICOM Viewer مدمج                              │
│   ← نقل الصور بين المراكز                          │
│                                                     │
│ Jordan National Health Record                      │
│   ← FHIR R4 API                                    │
│   ← مشاركة الملف الطبي بين المنشآت                │
│   ← السجل الصحي الوطني                             │
│                                                     │
│ Lab Analyzers (LIS Integration)                    │
│   ← استيراد النتائج مباشرة من الجهاز               │
│   ← HL7 Protocol                                   │
│   ← إلغاء الإدخال اليدوي                          │
│                                                     │
│ Pharmacy Barcode Scanners                          │
│   ← مسح الباركود عند الاستلام                      │
│   ← مسح عند الصرف                                  │
│   ← تتبع حركة كل علبة                             │
└─────────────────────────────────────────────────────┘
```

## B.3 معماريّة API الداخلية (Firebase Cloud Functions)

```javascript
// الدوال المُخطَّط بناؤها في Firebase Functions:

exports.billingProcessor = functions.database
  .ref('/clinics/{cid}/billing_triggers/{triggerId}')
  .onCreate(async (snap, context) => {
    // معالجة الفوترة التلقائية بعد إنهاء الزيارة
    // ← إنشاء الفاتورة الصحيحة حسب السياسة
    // ← حساب التأمين والضريبة
    // ← إرسال إشعار WhatsApp للمريض
  });

exports.insuranceClaimProcessor = functions.database
  .ref('/clinics/{cid}/insurance/claims/{claimId}')
  .onCreate(async (snap, context) => {
    // إرسال المطالبة للشركة (لاحقاً عبر API)
    // ← توليد ملف المطالبة PDF
    // ← إرسال بريد إلكتروني
  });

exports.pharmacyAlertScheduler = functions.pubsub
  .schedule('0 8 * * *')         // يومياً الساعة 8 صباحاً
  .onRun(async (context) => {
    // فحص المخزون المنخفض
    // فحص الأدوية قريبة الانتهاء
    // إرسال تنبيه لمدير الصيدلية
  });

exports.backupScheduler = functions.pubsub
  .schedule('0 2 * * *')         // يومياً الساعة 2 فجراً
  .onRun(async (context) => {
    // تصدير نسخة احتياطية إلى Cloud Storage
  });

exports.revenueAnomalyDetector = functions.pubsub
  .schedule('0 23 * * *')        // يومياً نهاية اليوم
  .onRun(async (context) => {
    // مقارنة الإيراد اليومي مع المتوسط
    // إشعار إذا كان الفارق > 30%
  });
```

---

# SECTION C — Future Roadmap (خارطة الطريق المستقبلية)

## C.1 الخطة التنفيذية (Gantt-Style)

```
2026 — Q3 (يوليو - سبتمبر):
├── [SPRINT 1 — 2 أسبوع] Firebase Auth + RBAC
│   ├── تحويل auth من custom إلى Firebase Auth
│   ├── Custom Claims لكل دور
│   └── تحديث Firebase Rules
│
├── [SPRINT 2 — 2 أسبوع] ضريبة ISTD
│   ├── إضافة TRN وحقول الضريبة
│   ├── حساب 16% تلقائياً
│   └── قالب الفاتورة الضريبية
│
├── [SPRINT 3 — 3 أسبوع] نظام التأمين الأساسي
│   ├── إدخال شركات التأمين الأردنية
│   ├── ربط التأمين بملف المريض
│   └── حساب Co-payment في الفاتورة
│
└── [SPRINT 4 — 2 أسبوع] Pharmacy Suppliers Phase 1
    ├── إدارة الموردين
    └── أوامر الشراء (PO)

2026 — Q4 (أكتوبر - ديسمبر):
├── [SPRINT 5 — 3 أسبوع] Pharmacy Complete
│   ├── GRN + دفعات الموردين
│   ├── FEFO + إدارة الدفعات
│   └── تقارير الصيدلية الكاملة
│
├── [SPRINT 6 — 2 أسبوع] Insurance Claims Workflow
│   ├── توليد المطالبات
│   ├── متابعة الحالة
│   └── إعادة التقديم
│
├── [SPRINT 7 — 2 أسبوع] Radiology Devices + External Patients
│   ├── سجل الأجهزة
│   └── سير عمل المريض الخارجي
│
└── [SPRINT 8 — 3 أسبوع] Executive Dashboard
    ├── KPIs الرئيسية
    ├── الرسوم البيانية التفاعلية
    └── تصدير PDF

2027 — Q1 (يناير - مارس):
├── [SPRINT 9 — 3 أسبوع] Reports Engine Phase 1
│   ├── 50 تقرير أساسي
│   └── تصدير Excel
│
├── [SPRINT 10 — 2 أسبوع] Lab Catalog + Sample Management
│   ├── كتالوج الفحوصات مع Reference Ranges
│   └── إدارة العينات + الباركود
│
├── [SPRINT 11 — 2 أسبوع] WhatsApp Business API
│   ├── إشعارات المواعيد
│   └── إرسال نتائج المختبر
│
└── [SPRINT 12 — 3 أسبوع] AI Layer Phase 1
    ├── Drug Interaction Checker
    ├── Insurance Code Suggester
    └── Inventory Forecast

2027 — Q2 (أبريل - يونيو):
├── Reports Engine Phase 2 (150 تقرير)
├── SMS Integration
├── ISTD API Integration (e-invoice submission)
└── Performance Optimization

2027 — Q3-Q4:
├── PACS / DICOM Basic Viewer
├── Insurance API Integration (MedNet)
├── HL7 Lab Integration
└── Multi-branch Support

2028:
├── FHIR R4 Integration
├── Jordan National Health Record
├── Mobile App (Flutter)
└── AI Enhanced CDSS
```

## C.2 مؤشرات النجاح (Success Metrics)

```
المرحلة 1 (نهاية 2026):
├── ✅ صفر اختراق للبيانات (Firebase Auth + RBAC)
├── ✅ 100% امتثال ISTD (فواتير ضريبية صحيحة)
├── ✅ 60% من إيرادات التأمين مُوثَّقة في النظام
└── ✅ إغناء عن برامج الصيدلية الخارجية

المرحلة 2 (منتصف 2027):
├── ✅ نسبة رفض مطالبات التأمين < 5%
├── ✅ متوسط وقت معالجة المطالبة < 3 أيام
├── ✅ صفر فقدان بيانات (نسخ احتياطية آلية)
└── ✅ 150+ تقرير تشغيلي متاح

المرحلة 3 (نهاية 2027):
├── ✅ تكامل مع 3+ شبكات تأمين
├── ✅ إغناء عن أي برنامج خارجي في أي قسم
└── ✅ جاهزية للمستشفيات متوسطة الحجم
```

## C.3 مقارنة ARGON مع المنافسين (Post-Implementation)

| الميزة | ARGON Enterprise | Epic | Cerner | ClinicWise |
|--------|----------------|------|--------|------------|
| عربي كامل RTL | ✅ | ❌ | ❌ | ✅ جزئي |
| Firebase Real-time | ✅ | ❌ | ❌ | ❌ |
| تأمين أردني محلي | ✅ | ❌ | ❌ | ✅ |
| ضريبة ISTD أردن | ✅ | ❌ | ❌ | ✅ |
| سعر الترخيص | 🟢 منخفض | 🔴 مرتفع جداً | 🔴 مرتفع | 🟡 متوسط |
| استضافة سحابية | ✅ Firebase | ✅ | ✅ | ✅ |
| RBAC كامل | ✅ | ✅ | ✅ | ✅ |
| AI مدمج | ✅ (محلي) | ✅ | ✅ | ❌ |
| Offline Support | 🔶 جزئي | ❌ | ❌ | ❌ |
| Open Customizable | ✅ | ❌ | ❌ | ❌ |

---

# SECTION D — قرارات معمارية حرجة (Architecture Decision Records)

## ADR-001: الحفاظ على Firebase RTDB (لا هجرة لـ Firestore)

```
القرار: البقاء على Firebase Realtime Database
السبب:
├── البيانات الحالية كلها في RTDB
├── الكود محسَّن لـ RTDB (real-time listeners)
├── الهجرة تكلف وقتاً وخطر فقدان بيانات
└── RTDB كافٍ لحجم عيادة/مجمع

المراجعة عند: وصول البيانات لـ 5GB أو 10,000 مريض نشط
```

## ADR-002: لا حذف — Soft Delete فقط

```
القرار: لا hard delete في أي مكان
التطبيق:
├── المرضى: isActive = false
├── الموظفون: isActive = false
├── الأدوية: isActive = false
├── الفواتير: status = 'voided' (لا حذف)
└── الحجوزات: status = 'cancelled' + سبب

الاستثناء الوحيد: حجوزات العرض والتدريب
```

## ADR-003: Firebase Auth قبل أي ميزة جديدة

```
القرار: لا نبدأ أي phase جديد قبل Firebase Auth
السبب:
├── Firebase Auth هو الأساس الأمني
├── بدونه لا يمكن تطبيق Firebase Rules الحقيقية
└── كل ميزة تُبنى فوق auth صحيح تكون أكثر أماناً

الخطوات:
1. إنشاء Firebase Auth project
2. تسجيل كل موظف كـ Firebase user
3. إضافة Custom Claims (clinicId, role, dept)
4. تحديث Firebase Rules لتستخدم auth.token
5. تحديث argon-core.js لاستخدام Firebase Auth
6. اختبار شامل قبل الإنتاج
```

## ADR-004: Feature Flags لكل ميزة جديدة

```
القرار: كل ميزة جديدة تبدأ مُعطَّلة افتراضياً

المسار في Firebase:
clinics/$CID/settings/features/{
  insuranceModule: false,        ← تُفعَّل يدوياً
  pharmacySuppliers: false,
  taxInvoiceISTD: false,
  executiveDashboard: false,
  aiAssistant: false
}

الفائدة:
├── عيادة تجريبية تفعّل الميزة أولاً
├── إذا اشتغلت → تفعيل للجميع
└── إذا في مشكلة → إيقاف بدون deployment
```

---

# SECTION E — الملخص التنفيذي النهائي

## ما تم بناؤه حتى الآن (الحالة الراهنة)

```
✅ مكتمل ومشتغل:
├── نظام الحجز (استقبال + مريض)
├── غرفة الانتظار + بدء الزيارة
├── الملف الطبي (SOAP + تشخيص + وصفة)
├── طلبات المختبر والأشعة
├── الصيدلية (صرف + مخزون أساسي)
├── محرك الفوترة (موحد + منفصل)
├── سياسة الفوترة الذكية
├── NID Gate + Smart Dedup
├── Audit Log + Firebase Rules
└── قاعدة بيانات الأسعار
```

## ما يُبنى فوقه (Enterprise Layer)

```
🔵 الفجوة الكبرى الواحدة المهمة جداً:
└── Firebase Auth حقيقي + RBAC → هذا يُطلق كل شيء آخر

🔴 الفجوات الحرجة الثلاث:
├── التأمين (60% من إيراد المجمعات)
├── ضريبة ISTD (التزام قانوني)
└── سلسلة توريد الصيدلية

🟡 التحسينات التشغيلية:
├── تقارير تنفيذية
├── لوحة KPI
└── إشعارات ذكية

🟢 المستقبل (سنة+):
├── AI Layer
├── PACS/DICOM
└── FHIR Integration
```

---

**هذه الوثيقة الثلاثية تُمثِّل الخطة الكاملة لتحويل ARGON إلى منصة Enterprise**

```
الوثائق المُنتَجة:
├── ARGON-Enterprise-Blueprint.md      ← الوثيقة الرئيسية (12 Phase)
├── ARGON-FolderStructure-ModulesMap.md ← هيكل الملفات + خريطة الوحدات
└── ARGON-SecurityMap-IntegrationMap-Roadmap.md ← الأمان + التكامل + الخطة
```

*ARGON Elite System Architect*
*10 يونيو 2026 — المملكة الأردنية الهاشمية*
*"ملف طبي آمن + فاتورة صحيحة + مريض راضٍ"*
