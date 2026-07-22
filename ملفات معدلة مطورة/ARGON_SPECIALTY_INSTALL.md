# 🏥 ARGON MEDICAL OS — Specialty System
## دليل التثبيت الشامل — v2.0

---

## الملفات المُسلَّمة

```
argon-specialty/
├── specialty-config.js              ← سجل 23 تخصصاً (Phase 0 — inert)
├── super-app-specialty-patch.js     ← Patch لـ super.html بدون كسر شيء
├── emr-specialty-loader.js          ← Loader لـ emr.html
└── specialty-modules/
    ├── dental_chart_module.js       ← 🦷 الرسم البياني للأسنان (FDI)
    ├── growth_chart_module.js       ← 👶 منحنيات النمو + تطعيمات + جرعات
    └── cardio_module.js             ← ❤️ ECG + BP Log + حاسبات المخاطر
```

---

## ترتيب التحميل في super.html

أضف **قبل** `</body>` مباشرة، بعد `super-app.js`:

```html
<!-- Specialty System -->
<script src="specialty-config.js"></script>
<script src="super-app-specialty-patch.js"></script>
```

---

## ترتيب التحميل في emr.html

أضف **قبل** `</body>` مباشرة، بعد `emr-app.js`:

```html
<!-- Specialty System -->
<script src="specialty-config.js"></script>
<script src="emr-specialty-loader.js"></script>
```

> الوحدات (dental, growth, cardio) تُحمَّل **تلقائياً** عند الحاجة فقط (lazy loading).

---

## كيف تعمل السلسلة

```
super.html
  └── الطبيب يختار التخصص من Specialty Picker
  └── super-app-specialty-patch.js يحفظه في:
      Firebase: clinics/{id}/settings/specialty

emr.html (عند فتح العيادة)
  └── emr-specialty-loader.js يقرأ settings.specialty
  └── يُطبق CSS Variables + Topbar Badge + Sidebar Items
  └── يُحمّل الوحدة المناسبة (dental/growth/cardio)
  └── كل وحدة تقرأ/تكتب في:
      Firebase: clinics/{id}/patients/{pid}/specialty_data/{specialty}/...
```

---

## SAFETY GUARANTEES — ضمانات السلامة

| الضمان | التفاصيل |
|--------|----------|
| **صفر تأثير على general_medicine** | الطب العام = legacy path محفوظ حرفياً |
| **صفر تأثير على عيادات بدون specialty** | fallback تلقائي لـ general_medicine |
| **لا كسر لـ super-app.js الأصلي** | patch pattern — الأصلية محفوظة |
| **لا كسر لـ emr-app.js الأصلي** | loader pattern — observer فقط |
| **lazy loading** | الوحدات لا تُحمَّل إلا عند الحاجة |
| **Firebase path منفصل** | specialty_data مستقل عن patients/visits |

---

## إضافة تخصص جديد في المستقبل

في `specialty-config.js`، أضف مفتاحاً جديداً في `ARGON_SPECIALTIES`:

```javascript
my_specialty: {
  id: 'my_specialty',
  nameAr: 'تخصصي الجديد',
  nameEn: 'My New Specialty',
  emoji: '🔬',
  color: '#123456',
  colorLight: 'rgba(18,52,86,0.1)',
  vitals: { show: ['temp', 'bp', 'hr', 'o2_sat'], required: [] },
  quickComplaints: ['شكوى 1', 'شكوى 2'],
  features: { bmiCalculator: true },
  commonLabs: ['CBC'],
  commonDiagnoses: [{ icd: 'Z00', ar: 'فحص روتيني' }],
  billingCodes: [{ code: 'MY-01', ar: 'كشفية', defaultPrice: 15000 }],
  followUpRules: { routine: { intervalDays: 90, message: 'متابعة دورية' } },
  specialModules: [],
  printTemplates: ['visit_summary', 'referral_letter']
}
```

---

## استخدام الوحدات يدوياً

```javascript
// رسم الأسنان في container معين
DentalChartModule.render('myContainerId', activePatientId);

// منحنيات النمو
GrowthChartModule.render('myContainerId', activePatientId);

// وحدة القلب
CardioModule.render('myContainerId', activePatientId);

// استعلام سريع
ArgonSpecialtyLoader.getCurrentSpecialty();  // 'cardiology'
ArgonSpecialtyLoader.hasFeature('ecgReport'); // true/false
ArgonSpecialtyLoader.getFollowUpMessage('stable'); // { date, message }
```

---

## Firebase Data Structure

```
clinics/{clinicId}/
├── settings/
│   ├── specialty: "cardiology"
│   ├── specialtyName: "أمراض القلب"
│   ├── specialtyEmoji: "❤️"
│   └── specialtyColor: "#ef4444"
│
└── patients/{patientId}/
    └── specialty_data/
        ├── cardiology/
        │   ├── bp_log/         ← سجل ضغط الدم
        │   ├── ecg_reports/    ← تقارير ECG
        │   └── echo_reports/   ← تقارير الإيكو
        ├── dental/
        │   └── chart/          ← حالة كل سن
        └── pediatrics/
            ├── growth_records/ ← قياسات النمو
            └── vaccinations/   ← حالة كل تطعيم
```

---

## التخصصات الـ 23

| # | ID | الاسم | الوحدات |
|---|----|-------|---------|
| 01 | general_medicine | الطب العام | — (legacy) |
| 02 | cardiology | القلب | ecg, echo, bp_chart, risk_calc |
| 03 | dentistry | الأسنان | dental_chart, treatment_plan |
| 04 | ophthalmology | العيون | va, refraction, iop, fundus |
| 05 | ent | أنف وأذن | ear_chart, audiogram |
| 06 | gynecology | النساء | pregnancy, pap, contraception |
| 07 | pediatrics | الأطفال | growth_chart, vaccination, dosing |
| 08 | psychiatry | النفسية | assessment_scales, risk, session |
| 09 | orthopedics | العظام | pain_map, rom, implant |
| 10 | dermatology | الجلدية | skin_map, lesion, photo |
| 11 | endocrinology | الغدد | diabetes, thyroid, complications |
| 12 | pulmonology | الصدرية | spirometry, asthma, cpap |
| 13 | neurology | الأعصاب | headache, stroke, exam |
| 14 | urology | المسالك | psa, stone, bladder_diary |
| 15 | rheumatology | الروماتيزم | joint_assessment, autoantibody |
| 16 | internal_medicine | الداخلية | problem_list, lab_trends |
| 17 | gastroenterology | الهضمية | endoscopy, hepatitis |
| 18 | sports_medicine | الرياضي | fms, return_to_play |
| 19 | aesthetic | التجميل | injection_map, gallery |
| 20 | allergy | الحساسية | allergy_test, immunotherapy |
| 21 | geriatrics | المسنين | cognitive, falls_risk, polypharmacy |
| 22 | emergency | الطوارئ | triage, resuscitation |
| 23 | hematology_oncology | الدم والأورام | cbc_trend, chemo_schedule |

---

*ARGON MEDICAL OS — Specialty System v2.0*
*Zero-break, zero-side-effect, production-ready*
