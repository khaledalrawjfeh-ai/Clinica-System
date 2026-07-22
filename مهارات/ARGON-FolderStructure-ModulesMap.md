# ARGON Medical OS — Folder Structure & Modules Map
## هيكل الملفات الكامل للإصدار Enterprise

---

## 1. هيكل الملفات المُقترَح (Enterprise File Tree)

```
argon-medical-os/
│
├── 📁 core/                          ← الطبقة الأساسية (تُحمَّل في كل صفحة)
│   ├── argon-core.js                 ← Firebase init, ArgonSession, ArgonNID [موجود]
│   ├── argon-enterprise.js           ← PatientMatch, ShadowLog, RBAC hooks [موجود]
│   ├── argon-auth.js                 ← [جديد] Firebase Auth + Custom Claims
│   ├── argon-nid-gate.js             ← [موجود] بوابة الرقم الوطني
│   ├── ArgonEncodingGuard.js         ← [موجود] حارس الترميز العربي
│   └── argon-i18n.js                 ← [جديد] دعم اللغات (عربي/إنجليزي)
│
├── 📁 auth/                          ← [جديد] صفحات تسجيل الدخول
│   ├── login.html                    ← صفحة تسجيل الدخول الموحدة
│   └── change-password.html         ← تغيير كلمة المرور
│
├── 📁 admin/                         ← لوحة الإدارة المركزية
│   ├── dashboard.html                ← [موجود + موسَّع] لوحة التحكم
│   ├── super.html                    ← [موجود] إدارة المجمعات
│   ├── super-app.js                  ← [موجود]
│   └── executive-dashboard.html     ← [جديد] اللوحة التنفيذية
│
├── 📁 reception/                     ← [جديد وحدة] نظام الاستقبال المتكامل
│   ├── index.html                    ← [موجود] بوابة الحجز العام
│   ├── reception.html                ← [جديد] واجهة موظف الاستقبال
│   ├── reception-app.js              ← [جديد] منطق الاستقبال
│   └── queue-display.html            ← [جديد] شاشة الانتظار (Queue TV)
│
├── 📁 emr/                           ← الوحدة السريرية
│   ├── emr.html                      ← [موجود]
│   ├── emr-app.js                    ← [موجود + مُصلَح]
│   ├── patient-file.html             ← [جديد] ملف المريض الموسَّع
│   └── ai-assistant.js               ← [جديد Phase 10]
│
├── 📁 pharmacy/                      ← الصيدلية المتكاملة
│   ├── pharmacy.html                 ← [موجود + موسَّع] الواجهة الرئيسية
│   ├── pharmacy-app.js               ← [موجود + موسَّع] الصرف + المخزون
│   ├── pharmacy-suppliers.html       ← [جديد] إدارة الموردين
│   ├── pharmacy-purchases.html       ← [جديد] أوامر الشراء + GRN
│   ├── pharmacy-inventory.html       ← [جديد] إدارة المخزون التفصيلية
│   └── pharmacy-reports.html         ← [جديد] تقارير الصيدلية
│
├── 📁 laboratory/                    ← المختبر الطبي
│   ├── lab.html                      ← [موجود + موسَّع]
│   ├── lab-app.js                    ← [موجود + موسَّع]
│   ├── lab-catalog.html              ← [جديد] كتالوج الفحوصات
│   └── lab-reports.html              ← [جديد] تقارير المختبر
│
├── 📁 radiology/                     ← قسم الأشعة
│   ├── radiology.html                ← [موجود + موسَّع]
│   ├── radiology-app.js              ← [موجود + موسَّع]
│   ├── radiology-devices.html        ← [جديد] سجل الأجهزة + صيانة
│   ├── radiology-external.html       ← [جديد] المرضى الخارجيين
│   └── radiology-reports.html        ← [جديد] تقارير الأشعة
│
├── 📁 insurance/                     ← [جديد وحدة كاملة] التأمين
│   ├── insurance.html                ← لوحة التأمين الرئيسية
│   ├── insurance-app.js              ← المنطق الكامل
│   ├── insurance-approvals.html      ← الموافقات المسبقة
│   ├── insurance-claims.html         ← المطالبات + متابعتها
│   └── insurance-engine.js           ← [جديد] محرك التأمين
│
├── 📁 billing/                       ← الفوترة والمالية
│   ├── billing-engine.js             ← [موجود + موسَّع]
│   ├── invoice-print.html            ← [موجود + ضريبة]
│   ├── tax-invoice.html              ← [جديد] فاتورة ضريبية ISTD
│   ├── credit-note.html              ← [جديد] إشعار دائن
│   └── billing-settings.js          ← [جديد] إعدادات السياسة
│
├── 📁 reports/                       ← [جديد وحدة كاملة] التقارير
│   ├── reports.html                  ← مركز التقارير
│   ├── report-engine.js              ← محرك التقارير (300+)
│   ├── report-export.js              ← تصدير PDF + Excel
│   └── report-templates/             ← قوالب التقارير
│       ├── financial-report.html
│       ├── pharmacy-report.html
│       ├── lab-report.html
│       └── radiology-report.html
│
├── 📁 print/                         ← قوالب الطباعة
│   ├── invoice-print.html            ← [موجود]
│   ├── lab-report-print.html         ← [جديد]
│   ├── rad-report-print.html         ← [جديد]
│   ├── prescription-print.html       ← [جديد]
│   └── appointment-receipt.html      ← [جديد] إيصال الموعد
│
├── 📁 firebase/                      ← Firebase Configuration
│   ├── firebase-rules.json           ← [موجود + مُحسَّن]
│   ├── firebase-indexes.json          ← [جديد] .indexOn المركزية
│   └── firebase-functions/           ← [جديد] Cloud Functions
│       ├── billing-processor.js      ← معالج الفوترة التلقائي
│       ├── insurance-processor.js    ← معالج مطالبات التأمين
│       ├── backup-scheduler.js       ← النسخ الاحتياطية التلقائية
│       └── notification-sender.js    ← إرسال الإشعارات
│
├── 📁 assets/                        ← الأصول الثابتة
│   ├── css/
│   │   ├── pharmacy.css              ← [موجود] CSS المشترك
│   │   ├── print.css                 ← [جديد] CSS الطباعة
│   │   └── insurance.css             ← [جديد] CSS التأمين
│   └── icons/
│       ├── favicon.png               ← [موجود]
│       └── app-icon.png
│
├── 📁 scripts/                       ← أدوات التطوير
│   ├── ArgonEncodingGuard.js         ← [موجود] فحص الترميز
│   ├── migrate-v2-v3.js              ← [جديد] أداة الهجرة
│   ├── seed-insurance-companies.js   ← [جديد] زرع شركات التأمين
│   └── seed-drug-master.js           ← [جديد] زرع قاعدة الأدوية
│
└── 📁 docs/                          ← التوثيق
    ├── ARGON-Enterprise-Blueprint.md ← هذه الوثيقة
    ├── API-Reference.md              ← مرجع الـ API
    ├── Security-Guide.md             ← دليل الأمان
    └── User-Manual/                  ← دليل المستخدم لكل دور
        ├── reception-manual.md
        ├── doctor-manual.md
        ├── pharmacy-manual.md
        └── admin-manual.md
```

---

## 2. خريطة الوحدات التفاعلية (Modules Interaction Map)

```
┌─────────────────────────────────────────────────────────────────┐
│                    ARGON MEDICAL OS — CORE                      │
│              argon-core.js + argon-enterprise.js                │
│                Firebase Auth + RBAC + NID Gate                  │
└────────────────────────────┬────────────────────────────────────┘
                             │ تُحمَّل في كل وحدة
         ┌───────────────────┼──────────────────────┐
         ▼                   ▼                      ▼
┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐
│   RECEPTION    │  │   EMR / CLINIC │  │     ADMIN SHELL        │
│                │  │                │  │                        │
│ • تسجيل مريض  │  │ • ملف المريض   │  │ • إدارة المستخدمين    │
│ • حجز موعد   │  │ • SOAP Note    │  │ • إعدادات المجمع      │
│ • انتظار Queue│  │ • Rx / Lab Req │  │ • سياسة الفوترة       │
│ • خارجي أشعة │  │ • Rad Request  │  │ • لوحة KPI تنفيذية   │
└───────┬────────┘  └──────┬─────────┘  └───────────┬────────────┘
        │                  │                         │
        ▼                  ▼                         ▼
┌────────────────────────────────────────────────────────────────┐
│                    EVENT / TRIGGER LAYER                        │
│              billing_triggers / Firebase Listeners              │
│         طلبات المختبر | طلبات الأشعة | الوصفات | الفواتير      │
└──────┬────────────────┬────────────────┬───────────────────────┘
       ▼                ▼                ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ LABORATORY  │  │  RADIOLOGY  │  │  PHARMACY   │
│             │  │             │  │             │
│ • استقبال  │  │ • استقبال  │  │ • استلام Rx │
│   العينة   │  │   الطلب    │  │ • صرف دواء │
│ • إدخال    │  │ • التصوير  │  │ • مخزون    │
│   نتائج    │  │ • التقرير  │  │ • موردون   │
│ • اعتماد  │  │ • رفع صورة │  │ • طلبيات   │
│   النتيجة  │  │             │  │             │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       └────────────────┼────────────────┘
                        ▼
┌────────────────────────────────────────────────────────────────┐
│                   BILLING ENGINE v12+                           │
│          billing-engine.js + insurance-engine.js               │
│                                                                  │
│  موحد: فاتورة واحدة │ منفصل: فاتورة لكل قسم │ تأمين: مطالبة  │
│                                                                  │
│     ضريبة ISTD 16%     │    خصم التأمين %     │    TRN QR     │
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────────────┐
│                    INSURANCE ENGINE                             │
│                   insurance-engine.js                           │
│                                                                  │
│  تحقق الصلاحية │ طلب موافقة │ توليد مطالبة │ متابعة + رفض     │
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────────────┐
│                    REPORTS ENGINE                               │
│                   report-engine.js                              │
│                                                                  │
│    مالية │ مختبر │ أشعة │ صيدلية │ تأمين │ تنفيذية            │
│                                                                  │
│              PDF Export │ Excel Export │ Print                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. تدفق بيانات الزيارة الكاملة (Patient Visit Data Flow)

```
المريض يصل للمجمع:

①  الاستقبال
    ├── بحث بالرقم الوطني (NID Gate)
    ├── ملف موجود → فتحه
    ├── ملف غير موجود → تسجيل جديد
    ├── حجز موعد أو إضافة لقائمة الانتظار
    └── تحقق من التأمين ← insurance-engine.js

②  الزيارة السريرية (EMR)
    ├── الطبيب يفتح الملف من غرفة الانتظار
    ├── يُدخل: الشكوى + الفحص + التشخيص (ICD-10)
    ├── يطلب: تحاليل → lab_orders/$orderId
    ├── يطلب: أشعة → rad_orders/$orderId
    ├── يكتب: وصفة → prescriptions/$rxId
    └── يُنهي الزيارة → billing_triggers/$visitKey

③  المختبر (parallel)
    ├── يستقبل الطلب من EMR
    ├── يُولِّد باركود العينة
    ├── يُدخل النتائج
    ├── مدير المختبر يعتمد
    └── النتيجة → patients/$pid/visits/$vid/labResults

④  الأشعة (parallel)
    ├── يستقبل الطلب من EMR
    ├── يُصوِّر بالجهاز المناسب
    ├── يكتب التقرير + يرفع الصورة
    └── التقرير → patients/$pid/visits/$vid/radResults

⑤  الصيدلية (parallel)
    ├── تستقبل الوصفة من EMR
    ├── تتحقق من المخزون (FEFO)
    ├── تتحقق من قائمة التأمين المدعومة
    ├── تصرف الأدوية
    └── تُخصم من المخزون تلقائياً

⑥  الفوترة (trigger-based)
    ├── billing_triggers/$visitKey يُعالَج
    ├── حسب سياسة الفوترة (موحد/منفصل)
    │   ├── موحد: فاتورة واحدة INV-$visitKey
    │   └── منفصل:
    │       ├── INV-$visitKey (رسم كشف)
    │       ├── LAB-$visitKey (تحاليل)
    │       ├── RAD-$visitKey (أشعة)
    │       └── PHM-$visitKey (أدوية)
    └── حساب التأمين:
        ├── سعر التأمين المتفق عليه
        ├── نسبة التغطية %
        └── حصة المريض (Co-payment)

⑦  التحصيل
    ├── المريض يدفع حصته للكاشير
    ├── يُسجَّل الدفع في financial_transactions
    └── الرصيد المتبقي → مطالبة تأمين

⑧  مطالبة التأمين
    ├── insurance-engine توليد المطالبة
    ├── إرسال للشركة
    ├── متابعة الحالة
    └── عند القبول: تسجيل الدفعة الواردة
```

---

## 4. هيكل قاعدة بيانات الصيدلية التفصيلي

```javascript
// Firebase Path: clinics/$CID/pharmacy/

{
  "suppliers": {
    "$supplierId": {
      "name": "شركة الفرا للأدوية",
      "nameEn": "Al-Farra Pharmaceuticals",
      "taxNo": "12345678",
      "contact": {
        "phone": "0799123456",
        "email": "orders@alFarra.com",
        "address": "عمان — شارع المدينة المنورة"
      },
      "paymentTerms": 30,          // أيام
      "currency": "JOD",
      "balance": -2450.500,        // سالب = ندين لهم
      "isActive": true,
      "createdAt": "ISO"
    }
  },

  "purchase_orders": {
    "$poId": {
      "poNumber": "PO-2026-001",
      "supplierId": "$supplierId",
      "status": "received",        // draft|sent|partial|received|cancelled
      "items": {
        "$itemId": {
          "drugId": "$drugId",
          "drugName": "Augmentin 625mg",
          "orderedQty": 100,
          "receivedQty": 100,
          "costPrice": 1.200,
          "totalCost": 120.000
        }
      },
      "subtotal": 120.000,
      "taxAmount": 19.200,         // 16% على الأدوية غير المعفاة
      "totalAmount": 139.200,
      "createdBy": "$userId",
      "createdAt": "ISO",
      "expectedDelivery": "2026-06-15"
    }
  },

  "goods_receipts": {
    "$grnId": {
      "grnNumber": "GRN-2026-001",
      "poId": "$poId",
      "supplierId": "$supplierId",
      "items": {
        "$itemId": {
          "drugId": "$drugId",
          "receivedQty": 100,
          "batchNumber": "B2024-001",
          "expiryDate": "2027-06-30",
          "costPrice": 1.200,
          "sellPrice": 1.800        // هامش 50%
        }
      },
      "receivedBy": "$userId",
      "receivedAt": "ISO"
    }
  },

  "supplier_payments": {
    "$paymentId": {
      "supplierId": "$supplierId",
      "amount": 139.200,
      "method": "bank_transfer",   // cash|cheque|bank_transfer
      "reference": "TRF-XYZ-001",
      "note": "دفع فاتورة PO-2026-001",
      "paidBy": "$userId",
      "paidAt": "ISO"
    }
  },

  "inventory": {
    "$drugId": {
      "name": "Augmentin 625mg",
      "nameEn": "Augmentin 625mg",
      "scientificName": "Amoxicillin + Clavulanate",
      "category": "antibiotic",
      "form": "tablet",
      "strength": "625mg",
      "supplierId": "$supplierId",
      "minStock": 20,
      "requiresColdChain": false,
      "requiresPrescription": true,
      "batches": {
        "$batchId": {
          "batchNumber": "B2024-001",
          "quantity": 100,
          "costPrice": 1.200,
          "sellPrice": 1.800,
          "expiryDate": "2027-06-30",
          "receivedAt": "ISO"
        }
      },
      "insurancePrices": {
        "AXA-JO": 1.620,           // 10% خصم
        "RMS": 1.300,              // 28% خصم
        "MOH-CIVIL": 1.200         // تكلفة فقط
      },
      "totalStock": 100,           // يُحسب من الدفعات
      "isActive": true
    }
  },

  "dispensing_log": {
    "$logId": {
      "prescriptionId": "$rxId",
      "patientId": "$patientId",
      "drugId": "$drugId",
      "batchId": "$batchId",       // FEFO تلقائي
      "quantityDispensed": 2,
      "unitPrice": 1.800,
      "total": 3.600,
      "insuranceDiscount": 0.360,  // 10%
      "patientPays": 3.240,
      "dispensedBy": "$userId",
      "dispensedAt": "ISO"
      }
  }
}
```

---

## 5. هيكل قاعدة بيانات التأمين التفصيلي

```javascript
// Firebase Path: insurance_master/ (عالمي لكل العيادات)

{
  "companies": {
    "AXA-JO": {
      "nameAr": "AXA للتأمين — الأردن",
      "nameEn": "AXA Insurance Jordan",
      "type": "private",           // government|military|private|tpa
      "logoUrl": "...",
      "claimsEmail": "claims@axa.jo",
      "claimsPhone": "0800-000-111",
      "branches": {
        "amman_main": { "nameAr": "فرع عمان الرئيسي", "phone": "..." },
        "zarqa":      { "nameAr": "فرع الزرقاء", "phone": "..." }
      },
      "defaultCoverage": 80,       // نسبة التغطية الافتراضية %
      "requiresPreAuth": ["ct", "mri", "surgery"],
      "excludedServices": ["cosmetic", "dental_cosmetic"],
      "submissionDeadlineDays": 30, // يوم من تاريخ الخدمة
      "isActive": true
    },
    "RMS": {
      "nameAr": "الخدمات الطبية الملكية",
      "nameEn": "Royal Medical Services",
      "type": "military",
      "defaultCoverage": 100,
      "requiresPreAuth": ["elective_surgery", "mri"],
      "isActive": true
    }
    // ... باقي الشركات
  }
}

// Firebase Path: clinics/$CID/insurance/

{
  "contracts": {
    "$contractId": {
      "companyId": "AXA-JO",
      "contractNumber": "CTR-2026-AXA-001",
      "startDate": "2026-01-01",
      "endDate": "2026-12-31",
      "coverageRules": {
        "consultation": { "covered": true, "rate": 80, "maxAmount": 25 },
        "lab": { "covered": true, "rate": 80, "maxAmount": null },
        "radiology": { "covered": true, "rate": 80, "maxAmount": null },
        "pharmacy": { "covered": true, "rate": 80, "formularyOnly": true }
      },
      "isActive": true
    }
  },

  "approvals": {
    "$approvalId": {
      "patientId": "$patientId",
      "companyId": "AXA-JO",
      "memberNo": "AXA-12345",
      "serviceType": "mri",
      "serviceCode": "CPT-70553",
      "requestedAmount": 120.000,
      "approvedAmount": 96.000,    // 80%
      "approvalNumber": "APP-AXA-2026-001",
      "status": "approved",        // pending|approved|rejected|expired
      "validUntil": "2026-06-30",
      "requestedBy": "$userId",
      "requestedAt": "ISO",
      "approvedAt": "ISO"
    }
  },

  "claims": {
    "$claimId": {
      "claimNumber": "CLM-2026-001",
      "invoiceId": "$invoiceId",
      "patientId": "$patientId",
      "companyId": "AXA-JO",
      "approvalId": "$approvalId",
      "serviceDate": "2026-06-10",
      "claimedAmount": 96.000,
      "approvedAmount": null,
      "status": "submitted",
      "submittedAt": "ISO",
      "responseAt": null,
      "rejectionReason": null,
      "resubmissions": 0,
      "attachments": ["$fileUrl1", "$fileUrl2"]
    }
  }
}
```

---

## 6. خريطة التقارير الكاملة (300+ Reports Index)

### القسم المالي (50 تقرير)
| # | التقرير | الفلاتر | التصدير |
|---|---------|---------|---------|
| F01 | الإيراد اليومي | التاريخ / القسم / الطبيب | PDF+Excel |
| F02 | الإيراد الأسبوعي | الأسبوع / القسم | PDF+Excel |
| F03 | الإيراد الشهري | الشهر / السنة | PDF+Excel |
| F04 | الإيراد السنوي | السنة + مقارنة | PDF+Excel |
| F05 | الذمم المدينة (AR Aging) | 0-30 / 31-60 / 61-90 / +90 يوم | PDF+Excel |
| F06 | تقرير الضريبة الشهري (ISTD) | الشهر | PDF |
| F07 | تقرير الضريبة الربعي | الربع | PDF |
| F08 | الفواتير الصادرة | الفترة / الحالة | PDF+Excel |
| F09 | الفواتير الملغاة مع الأسباب | الفترة | PDF+Excel |
| F10 | الدفعات المستلمة | الفترة / طريقة الدفع | PDF+Excel |
| F11 | الإيراد لكل طبيب | الفترة | PDF+Excel |
| F12 | الإيراد لكل قسم | الفترة | PDF+Excel |
| F13 | النقدية اليومية (Cash Register) | اليوم | PDF |
| F14 | تسوية البنك | الشهر | PDF+Excel |
| F15 | تقرير مطالبات التأمين | الشركة / الفترة | PDF+Excel |
| F16 | تقرير المطالبات المرفوضة | الشركة / السبب | PDF+Excel |
| F17 | إيراد التأمين لكل شركة | الفترة | PDF+Excel |
| F18 | رصيد كل مريض (Statement) | المريض | PDF |
| F19 | تقرير الإعفاءات والخصومات | الفترة | PDF+Excel |
| F20 | ربحية كل قسم | الشهر | PDF+Excel |

### قسم الصيدلية (40 تقرير)
| # | التقرير | التصدير |
|---|---------|---------|
| P01 | جرد كامل (كل الأدوية + الكميات + القيمة) | PDF+Excel |
| P02 | حركة كل دواء (مبيعات + استلامات) | Excel |
| P03 | الأدوية منتهية الصلاحية | PDF+Excel |
| P04 | الأدوية قريبة الانتهاء (قابل للضبط: 3/6/12 شهر) | PDF+Excel |
| P05 | الأدوية ناقصة المخزون | PDF+Excel |
| P06 | أكثر 20 دواء مبيعاً | PDF+Excel |
| P07 | أكثر 20 دواء ربحاً | PDF+Excel |
| P08 | مبيعات الصيدلية اليومية | PDF+Excel |
| P09 | تقرير الموردين (رصيد + معاملات) | PDF+Excel |
| P10 | طلبيات الشراء (كل PO) | PDF+Excel |
| P11 | استلام البضاعة GRN | PDF+Excel |
| P12 | دفعات الموردين | PDF+Excel |
| P13 | تحليل هامش الربح لكل دواء | Excel |
| P14 | تقييم المخزون بالتكلفة | PDF+Excel |
| P15 | تقييم المخزون بسعر البيع | PDF+Excel |
| P16 | تقرير ABC لقيمة المخزون | PDF+Excel |
| P17 | معدل دوران المخزون | Excel |
| P18 | توقعات الطلب القادم (AI) | PDF+Excel |
| P19 | مبيعات بالتأمين (صيدلية) | PDF+Excel |
| P20 | مطالبات التأمين — صيدلية | PDF+Excel |

### قسم المختبر (35 تقرير)
| # | التقرير | التصدير |
|---|---------|---------|
| L01 | الفحوصات اليومية | PDF+Excel |
| L02 | الفحوصات الشهرية حسب النوع | PDF+Excel |
| L03 | النتائج قيد الانتظار (+24 ساعة) | PDF |
| L04 | القيم الحرجة المُبلَّغ عنها | PDF |
| L05 | إنتاجية الفنيين | PDF+Excel |
| L06 | إيراد المختبر | PDF+Excel |
| L07 | مطالبات التأمين — مختبر | PDF+Excel |
| L08 | أكثر 10 فحوصات طلباً | PDF+Excel |

### قسم الأشعة (30 تقرير)
| # | التقرير | التصدير |
|---|---------|---------|
| R01 | الصور اليومية لكل جهاز | PDF+Excel |
| R02 | إيراد قسم الأشعة | PDF+Excel |
| R03 | التقارير المعلَّقة | PDF |
| R04 | المرضى الخارجيين | PDF+Excel |
| R05 | إحصائيات الأجهزة (Utilization) | PDF+Excel |
| R06 | صيانة الأجهزة (Maintenance Log) | PDF |
| R07 | مطالبات التأمين — أشعة | PDF+Excel |

### قسم الاستقبال (30 تقرير)
| # | التقرير | التصدير |
|---|---------|---------|
| RC01 | الزيارات اليومية | PDF+Excel |
| RC02 | الحجوزات (بالطريقة: أونلاين/استقبال/هاتف) | PDF+Excel |
| RC03 | المواعيد الملغاة + no-show | PDF+Excel |
| RC04 | زمن الانتظار المتوسط | PDF+Excel |
| RC05 | المرضى الجدد مقابل المراجعين | PDF+Excel |
| RC06 | إحصائيات الاستقبال لكل موظف | PDF |

### التقارير التنفيذية (40 تقرير)
| # | التقرير | التصدير |
|---|---------|---------|
| E01 | لوحة أداء المجمع الشاملة (KPI Dashboard) | PDF |
| E02 | مقارنة الشهر بالشهر السابق | PDF+Excel |
| E03 | مقارنة السنة بالسنة السابقة | PDF+Excel |
| E04 | تحليل نمو قاعدة المرضى | PDF+Excel |
| E05 | ربحية كل قسم مقابل الهدف | PDF+Excel |
| E06 | تقرير أداء الأطباء الشامل | PDF+Excel |

---

**إجمالي التقارير المُخططة: 325+ تقرير**

---
*ARGON Medical OS — Folder Structure & Modules Map v3.0*
*تاريخ: 10 يونيو 2026 — للاستخدام الداخلي فقط*
