/**
 * 🏥 ARGON MEDICAL OS — Specialty Configuration Registry
 * specialty-config.js — v2.0  (PHASE 0 — FOUNDATION / INERT DATA)
 *
 * ─────────────────────────────────────────────────────────────────────
 * ⚠️  SAFETY ANCHOR — اقرأ هذا قبل أي تعديل
 * ─────────────────────────────────────────────────────────────────────
 * هذا الملف بيانات وتعريفات فقط — لا كود يُغيّر الواجهة، يقرأ
 * Firebase، أو يُعدّل أي DOM. تحميله في emr.html أو super.html
 * لا يُغيّر أي سلوك حالي مهما كان.
 *
 * SAFETY ANCHORS:
 *   1. getSpecialtyConfig() دائماً يرجع general_medicine كـ fallback
 *      لأي عيادة بدون settings.specialty (كل العيادات الحالية).
 *   2. general_medicine.vitals.show تطابق حرفياً الحقول الأربعة
 *      الموجودة في tabVitals اليوم: (vTemp, vBp, vHr, vO2)
 *   3. لا وحدة مُفعَّلة تلقائياً — activation يتم فقط من
 *      emr-specialty-loader.js عند طلب صريح.
 *
 * مفاتيح vitals المعتمدة عبر كل المراحل:
 *   temp, bp, bp_right, bp_left, pulse, hr, rr, rhythm, o2_sat,
 *   weight, height, head_circumference
 *
 * الإصدار 2.0 يضيف:
 *   - دعم كامل لـ 23 تخصصاً
 *   - quickExamTemplate لكل تخصص
 *   - soapHints: اقتراحات جمل SOAP
 *   - billingCodes: رموز الإجراءات الشائعة للفوترة
 *   - referralTemplates: قوالب رسائل الإحالة
 *   - followUpRules: قواعد المتابعة الذكية
 * ─────────────────────────────────────────────────────────────────────
 */

(function (global) {
  'use strict';

  /* ── مساعد داخلي: Hex → rgba ── */
  function _rgba(hex, alpha) {
    var h = hex.replace('#', '');
    var r = parseInt(h.substring(0, 2), 16);
    var g = parseInt(h.substring(2, 4), 16);
    var b = parseInt(h.substring(4, 6), 16);
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
  }

  /* ══════════════════════════════════════════════════════════════════
   * ARGON_SPECIALTIES — 23 تخصصاً طبياً كاملاً
   * كل تخصص يحمل: هوية، ألوان، علامات حيوية، شكاوى سريعة، ميزات،
   * تحاليل، تشخيصات، وحدات خاصة، قوالب طباعة، قواعد متابعة
   * ══════════════════════════════════════════════════════════════════ */

  var ARGON_SPECIALTIES = {

    /* ═══ 01 — الطب العام ═══════════════════════════════════════════ */
    general_medicine: {
      id: 'general_medicine',
      nameAr: 'الطب العام وطب العائلة',
      nameEn: 'General Practice & Family Medicine',
      emoji: '🩺',
      color: '#0d9488',
      colorLight: _rgba('#0d9488', 0.1),
      description: 'رعاية صحية شاملة — التخصص الافتراضي لكل عيادات أرغون الحالية',

      vitals: {
        /* ⚠️ SAFETY: هذه القائمة تطابق tabVitals الحالية حرفياً */
        show: ['temp', 'bp', 'hr', 'o2_sat'],
        required: []
      },

      quickComplaints: [
        'حمى', 'سعال', 'إسهال', 'ألم بطن', 'صداع',
        'دوخة', 'التهاب حلق', 'ألم مفاصل', 'إرهاق عام',
        'ضيق تنفس', 'طفح جلدي', 'أعراض بولية'
      ],

      quickExamTemplate: {
        respiratory: { label: 'الجهاز التنفسي', options: ['نظيف', 'صفير', 'أصوات خشنة', 'تخفيت'] },
        cardiovascular: { label: 'القلب', options: ['منتظم بدون نفخات', 'خفقان', 'نفخة انقباضية'] },
        abdomen: { label: 'البطن', options: ['طري بدون ألم', 'ألم موضعي', 'صلب', 'انتفاخ'] },
        throat: { label: 'الحلق', options: ['طبيعي', 'احتقان', 'تضخم لوزتين', 'إفرازات'] },
        skin: { label: 'الجلد', options: ['طبيعي', 'طفح', 'شحوب', 'يرقان'] }
      },

      soapHints: {
        s: ['يشكو من {} منذ {} أيام', 'لديه تاريخ مرضي بـ {}', 'يأخذ {} بانتظام'],
        o: ['الحرارة {} مئوية، الضغط {}, النبض {}', 'الفحص: {}'],
        a: ['التهاب {}', 'تفاقم {} المزمن', 'حادث حاد'],
        p: ['مضاد حيوي لمدة {} أيام', 'مسكن + راحة', 'إحالة لـ {}', 'إعادة مراجعة خلال {} أيام']
      },

      features: {
        bmiCalculator: true,
        eddCalculator: true,
        bpLogChart: false,
        chronicDiseasePanel: false,
        medicationReconciliation: false,
        framinghamRisk: false,
        gfrCalculator: false,
        preventiveCareChecklist: true
      },

      commonLabs: [
        'CBC', 'Fasting Blood Sugar', 'HbA1c',
        'Lipid Profile', 'Creatinine', 'Liver Functions',
        'TSH', 'Urinalysis', 'CRP'
      ],

      commonDiagnoses: [
        { icd: 'J06.9', ar: 'التهاب الجهاز التنفسي العلوي الحاد' },
        { icd: 'I10',   ar: 'ارتفاع ضغط الدم الأولي' },
        { icd: 'E11',   ar: 'السكري من النوع الثاني' },
        { icd: 'K21',   ar: 'الارتجاع المعدي المريئي' },
        { icd: 'M54.5', ar: 'ألم أسفل الظهر' },
        { icd: 'J45',   ar: 'الربو' },
        { icd: 'A09',   ar: 'الإسهال المعدي المعوي' },
        { icd: 'K29',   ar: 'التهاب المعدة' }
      ],

      billingCodes: [
        { code: 'CONSULT-GP-01', ar: 'كشفية طب عام', defaultPrice: 10000 },
        { code: 'CONSULT-GP-02', ar: 'كشفية متابعة', defaultPrice: 7000 }
      ],

      followUpRules: {
        hypertension: { intervalDays: 30, message: 'متابعة ضغط الدم' },
        diabetes: { intervalDays: 90, message: 'متابعة HbA1c كل 3 أشهر' },
        routine: { intervalDays: 365, message: 'فحص دوري سنوي' }
      },

      specialModules: [],
      printTemplates: ['visit_summary', 'referral_letter', 'prescription', 'sick_leave']
    },

    /* ═══ 02 — أمراض القلب ══════════════════════════════════════════ */
    cardiology: {
      id: 'cardiology',
      nameAr: 'أمراض القلب والأوعية الدموية',
      nameEn: 'Cardiology',
      emoji: '❤️',
      color: '#ef4444',
      colorLight: _rgba('#ef4444', 0.1),
      description: 'متابعة أمراض القلب والشرايين وضغط الدم',

      vitals: {
        show: ['bp_right', 'bp_left', 'hr', 'rhythm', 'o2_sat', 'weight'],
        required: ['bp_right', 'hr']
      },

      quickComplaints: [
        'ألم صدر', 'ضيق تنفس عند الجهد', 'خفقان',
        'دوخة وإغماء', 'تورم الساقين', 'إرهاق غير مبرر',
        'ضيق تنفس ليلي', 'آلام صدر مع مجهود'
      ],

      quickExamTemplate: {
        s1s2: { label: 'الأصوات القلبية', options: ['S1 S2 طبيعي', 'S3 إضافي', 'S4 إضافي', 'نفخة انقباضية', 'نفخة انبساطية'] },
        jvp: { label: 'الأوردة العنقية JVP', options: ['طبيعي', 'مرتفع', 'منخفض'] },
        periphery: { label: 'الأطراف', options: ['دافئة بدون تورم', 'تورم كاحلين', 'برودة + شحوب', 'نبض محيطي ضعيف'] },
        lungs: { label: 'الرئتان', options: ['نظيفتان', 'رونكس قاعدي', 'فرقعات رطبة'] }
      },

      soapHints: {
        s: ['يشكو من {} عند {} منذ {}', 'NYHA Class {}', 'يأخذ {} بانتظام'],
        o: ['ضغط يمين {}, يسار {}, نبض {} bpm, {} إيقاع', 'ECG: {}', 'إيكو EF {}%'],
        a: ['ذبحة صدرية {}', 'قصور قلب NYHA {}', 'رجفان أذيني {}'],
        p: ['{} mg مرة يومياً', 'تعديل الجرعة', 'إحالة قسم طوارئ', 'إيكو دوري']
      },

      features: {
        bmiCalculator: true,
        ecgReport: true,
        echoReport: true,
        holterMonitor: true,
        bpLogChart: true,
        framinghamRisk: true,
        ascvdRisk: true,
        graceScore: true,
        hasBledScore: true,
        chadsScore: true,
        hfManagement: true,
        bpRightLeftComparison: true
      },

      commonLabs: [
        'Troponin I/T', 'BNP / NT-proBNP', 'CK-MB',
        'D-Dimer', 'PT/INR', 'Lipid Profile',
        'Electrolytes (K, Na, Mg)', 'Digoxin Level', 'Creatinine'
      ],

      commonDiagnoses: [
        { icd: 'I20',   ar: 'ذبحة صدرية' },
        { icd: 'I21',   ar: 'احتشاء عضلة القلب الحاد' },
        { icd: 'I25',   ar: 'مرض القلب الإقفاري المزمن' },
        { icd: 'I48',   ar: 'الرجفان الأذيني' },
        { icd: 'I50',   ar: 'قصور القلب' },
        { icd: 'I10',   ar: 'ارتفاع ضغط الدم' },
        { icd: 'I42',   ar: 'اعتلال عضلة القلب' },
        { icd: 'I35',   ar: 'اضطراب الصمام الأورطي' }
      ],

      billingCodes: [
        { code: 'CARDIO-01', ar: 'كشفية قلب', defaultPrice: 20000 },
        { code: 'CARDIO-ECG', ar: 'رسم قلب ECG', defaultPrice: 10000 },
        { code: 'CARDIO-ECHO', ar: 'إيكو قلب', defaultPrice: 40000 },
        { code: 'CARDIO-HOLTER', ar: 'هولتر 24 ساعة', defaultPrice: 60000 }
      ],

      followUpRules: {
        hf: { intervalDays: 14, message: 'متابعة قصور القلب كل أسبوعين' },
        af: { intervalDays: 30, message: 'متابعة الرجفان الأذيني شهرياً' },
        stable: { intervalDays: 90, message: 'متابعة دورية كل 3 أشهر' }
      },

      specialModules: ['ecg_module', 'echo_module', 'bp_chart_module', 'risk_calculator_module'],
      printTemplates: ['cardio_report', 'echo_report', 'referral_letter', 'patient_card']
    },

    /* ═══ 03 — طب الأسنان ═══════════════════════════════════════════ */
    dentistry: {
      id: 'dentistry',
      nameAr: 'طب الأسنان وجراحة الفم',
      nameEn: 'Dentistry',
      emoji: '🦷',
      color: '#3b82f6',
      colorLight: _rgba('#3b82f6', 0.1),
      description: 'تشخيص وعلاج وتخطيط علاج الأسنان واللثة والفم',

      vitals: {
        show: ['bp', 'pulse'],
        required: [],
        note: 'يُطلب ضغط الدم والنبض قبل التخدير الموضعي للمرضى كبار السن وذوي الأمراض المزمنة'
      },

      quickComplaints: [
        'ألم سن', 'نزيف لثة', 'حساسية أسنان', 'كسر سن',
        'تورم فكي', 'رائحة فم', 'صعوبة مضغ', 'ألم مفصل فكي',
        'أسنان متحركة', 'حشوة ساقطة'
      ],

      quickExamTemplate: {
        gingiva: { label: 'اللثة', options: ['سليمة صلبة', 'التهاب بسيط مع نزيف', 'تراجع لثوي', 'تقيح'] },
        occlusion: { label: 'العضة', options: ['Class I طبيعي', 'Class II - Upper Protrusion', 'Class III - Underbite', 'Open Bite'] },
        tmj: { label: 'المفصل الفكي TMJ', options: ['طبيعي', 'ضوضاء عند الفتح', 'ألم عند الجس', 'محدودية فتح الفم'] },
        hygiene: { label: 'النظافة الفموية', options: ['جيدة', 'مقبولة مع ترسبات خفيفة', 'ضعيفة مع ترسبات كثيفة'] }
      },

      features: {
        dentalChart: true,
        treatmentPlan: true,
        procedureTracking: true,
        xrayPerTooth: true,
        periodontalCharting: true,
        beforeAfterPhotos: true,
        appointmentSeries: true,
        anesthesiaRecord: true,
        bmiCalculator: false
      },

      dentalChartConfig: {
        notation: 'FDI (ISO 3950)',
        teethUpper: [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
        teethLower: [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38],
        statuses: {
          healthy:    { labelAr: 'سليم',          color: '#10b981', emoji: '🦷' },
          filling:    { labelAr: 'حشوة',           color: '#f59e0b', emoji: '✏️' },
          crown:      { labelAr: 'تاج',            color: '#3b82f6', emoji: '👑' },
          missing:    { labelAr: 'مفقود/مخلوع',   color: '#94a3b8', emoji: '❌' },
          implant:    { labelAr: 'زرع',            color: '#8b5cf6', emoji: '🔩' },
          root_canal: { labelAr: 'علاج عصب',       color: '#ef4444', emoji: '⚠️' },
          bridge:     { labelAr: 'جسر',            color: '#0891b2', emoji: '🌉' },
          decay:      { labelAr: 'نخر/تسوس',       color: '#dc2626', emoji: '🔴' },
          veneer:     { labelAr: 'قشرة تجميلية',   color: '#ec4899', emoji: '✨' },
          partial_rp: { labelAr: 'طقم جزئي',       color: '#6366f1', emoji: '🦷' }
        }
      },

      commonProcedures: [
        { code: 'D0120', ar: 'فحص دوري' },
        { code: 'D0210', ar: 'أشعة بانورامية شاملة' },
        { code: 'D1110', ar: 'تنظيف وتلميع (Prophylaxis)' },
        { code: 'D2330', ar: 'حشوة مركبة (Composite) - سطح واحد' },
        { code: 'D2740', ar: 'تاج خزفي (Ceramic Crown)' },
        { code: 'D3310', ar: 'علاج عصب (أحادي الجذر)' },
        { code: 'D3330', ar: 'علاج عصب (ثلاثي الجذر)' },
        { code: 'D4341', ar: 'تقليح (Scaling & Root Planing)' },
        { code: 'D6010', ar: 'زراعة أسنان (Implant Placement)' },
        { code: 'D7140', ar: 'خلع سن عادي' },
        { code: 'D7240', ar: 'خلع ضرس عقل مطمور' }
      ],

      commonLabs: [
        'Panoramic X-Ray',
        'Periapical X-Ray',
        'PT/INR (قبل الخلع لمرضى مضادات التخثر)'
      ],

      commonDiagnoses: [
        { icd: 'K02',  ar: 'تسوس الأسنان' },
        { icd: 'K05',  ar: 'التهاب اللثة وأنسجة اللثة الداعمة' },
        { icd: 'K04',  ar: 'أمراض اللب والأنسجة حول السنية' },
        { icd: 'K08',  ar: 'فقدان أسنان وتغيرات في الأقواس السنية' },
        { icd: 'M26',  ar: 'تشوهات سنية وجهية' },
        { icd: 'K12',  ar: 'التهاب الفم والتقرحات الفموية' }
      ],

      billingCodes: [
        { code: 'DENT-EXAM', ar: 'كشفية أسنان', defaultPrice: 10000 },
        { code: 'DENT-FILL-1', ar: 'حشوة سطح واحد', defaultPrice: 25000 },
        { code: 'DENT-CROWN', ar: 'تاج خزفي', defaultPrice: 120000 },
        { code: 'DENT-RCT', ar: 'علاج عصب', defaultPrice: 80000 },
        { code: 'DENT-XRAY-PAN', ar: 'أشعة بانورامية', defaultPrice: 15000 },
        { code: 'DENT-IMPL', ar: 'زراعة سن', defaultPrice: 600000 }
      ],

      followUpRules: {
        rct: { intervalDays: 7, message: 'متابعة بعد علاج العصب أسبوع' },
        extraction: { intervalDays: 3, message: 'متابعة بعد الخلع 3 أيام' },
        cleaning: { intervalDays: 180, message: 'تنظيف دوري كل 6 أشهر' }
      },

      specialModules: ['dental_chart_module', 'treatment_plan_module', 'perio_module'],
      printTemplates: ['dental_treatment_plan', 'dental_report', 'referral_letter', 'consent_form']
    },

    /* ═══ 04 — طب العيون ═════════════════════════════════════════════ */
    ophthalmology: {
      id: 'ophthalmology',
      nameAr: 'طب وجراحة العيون',
      nameEn: 'Ophthalmology',
      emoji: '👁️',
      color: '#0ea5e9',
      colorLight: _rgba('#0ea5e9', 0.1),
      description: 'فحص وعلاج وجراحة أمراض العين وحدة البصر',

      vitals: { show: ['bp', 'pulse'], required: [] },

      quickComplaints: [
        'ضعف نظر', 'احمرار العين', 'ألم العين', 'حكة وحساسية',
        'رؤية مزدوجة', 'جسم غريب بالعين', 'صداع مع رؤية ضبابية',
        'دموع زائدة', 'حساسية للضوء', 'ظهور بقع أو خيوط'
      ],

      quickExamTemplate: {
        va: { label: 'حدة البصر VA', options: ['6/6 بدون تصحيح', '6/6 بتصحيح', 'أقل من 6/6', 'عد الأصابع'] },
        conjunctiva: { label: 'الملتحمة', options: ['سليمة', 'احتقان', 'إفراز مائي', 'إفراز قيحي'] },
        cornea: { label: 'القرنية', options: ['شفافة', 'تعتيم', 'قرحة', 'جسم غريب'] },
        iop: { label: 'ضغط العين IOP', options: ['طبيعي (10-21)', 'مرتفع >21', 'منخفض <10'] },
        fundus: { label: 'قاع العين', options: ['طبيعي', 'ضمور البقعة', 'اعتلال شبكي سكري', 'احتقان القرص البصري'] }
      },

      features: {
        visualAcuity: true,
        refraction: true,
        iop: true,
        funduscopy: true,
        keratometry: true,
        visualField: true,
        iolCalculator: true,
        glaucomaRisk: true,
        colorVision: true
      },

      commonLabs: [
        'OCT (تصوير الشبكية المقطعي)',
        'Fundus Photography',
        'Visual Field Test',
        'Fasting Blood Sugar (لمرضى السكري)',
        'HbA1c'
      ],

      commonDiagnoses: [
        { icd: 'H52.1', ar: 'قصر النظر (Myopia)' },
        { icd: 'H52.0', ar: 'طول النظر (Hyperopia)' },
        { icd: 'H52.2', ar: 'الاستجماتيزم' },
        { icd: 'H52.4', ar: 'طول نظر الشيخوخة (Presbyopia)' },
        { icd: 'H40',   ar: 'الجلوكوما' },
        { icd: 'H26',   ar: 'الساد (Cataract)' },
        { icd: 'H10',   ar: 'التهاب الملتحمة' },
        { icd: 'H33',   ar: 'انفصال الشبكية' }
      ],

      billingCodes: [
        { code: 'OPTH-EXAM', ar: 'كشفية عيون', defaultPrice: 20000 },
        { code: 'OPTH-OCT', ar: 'OCT شبكية', defaultPrice: 35000 },
        { code: 'OPTH-FIELD', ar: 'مجال بصري', defaultPrice: 20000 },
        { code: 'OPTH-YAG', ar: 'ليزر YAG', defaultPrice: 50000 }
      ],

      followUpRules: {
        glaucoma: { intervalDays: 90, message: 'متابعة جلوكوما كل 3 أشهر' },
        diabetic_retinopathy: { intervalDays: 180, message: 'متابعة اعتلال شبكي سكري كل 6 أشهر' },
        postop: { intervalDays: 1, message: 'متابعة ما بعد العملية اليوم التالي' }
      },

      specialModules: ['va_module', 'refraction_module', 'iop_module', 'fundus_module'],
      printTemplates: ['eyewear_prescription', 'ophthal_report', 'referral_letter']
    },

    /* ═══ 05 — أنف وأذن وحنجرة ══════════════════════════════════════ */
    ent: {
      id: 'ent',
      nameAr: 'الأنف والأذن والحنجرة',
      nameEn: 'Ear, Nose & Throat',
      emoji: '👂',
      color: '#8b5cf6',
      colorLight: _rgba('#8b5cf6', 0.1),
      description: 'تشخيص وعلاج أمراض الأذن والأنف والحنجرة والجيوب',

      vitals: { show: ['temp', 'bp', 'pulse'], required: [] },

      quickComplaints: [
        'ألم أذن', 'نزول إفرازات من الأذن', 'طنين', 'دوخة ودوار',
        'انسداد أنف', 'نزيف أنف', 'بحة صوت', 'التهاب لوزتين',
        'صعوبة بلع', 'حساسية موسمية', 'شخير'
      ],

      quickExamTemplate: {
        ear: { label: 'الأذن', options: ['طبلة سليمة', 'احتقان', 'ثقب طبلي', 'إفراز'] },
        nose: { label: 'الأنف', options: ['حاجز مستقيم', 'انحراف حاجزي', 'ضخامة دسامات', 'إفراز مائي', 'إفراز قيحي'] },
        throat: { label: 'الحلق', options: ['طبيعي', 'احتقان بلعومي', 'لوزتان ضخمتان درجة {}', 'إفراز خلفي'] },
        neck: { label: 'الرقبة', options: ['بدون تضخم غدد', 'تضخم غدد جانبي عنقي', 'تضخم غدة درقية'] }
      },

      features: {
        otoscopyChart: true,
        audiogram: true,
        tympanometry: true,
        vestibularTest: true,
        nasalEndoscopy: true,
        laryngoscopy: true,
        snot22: true,
        tonsilGrading: true,
        epleyProtocol: true,
        hearingAidRx: true
      },

      commonLabs: [
        'Throat Culture',
        'CBC',
        'Allergy Panel (IgE)',
        'Audiometry',
        'ASO Titer'
      ],

      commonDiagnoses: [
        { icd: 'H66',   ar: 'التهاب الأذن الوسطى' },
        { icd: 'H81',   ar: 'اضطرابات الوظيفة الدهليزية' },
        { icd: 'J32',   ar: 'التهاب الجيوب الأنفية المزمن' },
        { icd: 'J35',   ar: 'أمراض اللوزتين واللحمية المزمنة' },
        { icd: 'J03',   ar: 'التهاب اللوزتين الحاد' },
        { icd: 'H91',   ar: 'فقدان السمع غير المصنف' },
        { icd: 'J30',   ar: 'التهاب الأنف التحسسي' }
      ],

      billingCodes: [
        { code: 'ENT-EXAM', ar: 'كشفية أنف وأذن', defaultPrice: 15000 },
        { code: 'ENT-AUDIO', ar: 'قياس سمع', defaultPrice: 20000 },
        { code: 'ENT-NASAL-WASH', ar: 'غسيل جيوب', defaultPrice: 15000 }
      ],

      followUpRules: {
        otitis_media: { intervalDays: 14, message: 'متابعة التهاب الأذن بعد العلاج' },
        tonsillitis: { intervalDays: 7, message: 'مراجعة بعد أسبوع من المضاد الحيوي' }
      },

      specialModules: ['ear_chart_module', 'audiogram_module', 'nasal_module'],
      printTemplates: ['audiogram_report', 'ent_report', 'referral_letter']
    },

    /* ═══ 06 — النساء والتوليد ═══════════════════════════════════════ */
    gynecology: {
      id: 'gynecology',
      nameAr: 'النساء والتوليد',
      nameEn: 'Gynecology & Obstetrics',
      emoji: '🤱',
      color: '#ec4899',
      colorLight: _rgba('#ec4899', 0.1),
      description: 'متابعة صحة المرأة والحمل والولادة',

      vitals: { show: ['bp', 'pulse', 'weight', 'height'], required: [] },

      quickComplaints: [
        'تأخر دورة', 'ألم حوضي', 'نزيف غير طبيعي', 'إفرازات مهبلية',
        'ألم خلال الجماع', 'أعراض حمل', 'انقطاع طمث', 'ألم ثدي',
        'غثيان وقيء في الحمل', 'تقلصات رحمية'
      ],

      quickExamTemplate: {
        abdomen: { label: 'الفحص البطني', options: ['ناعم بدون حساسية', 'قعر رحم عند {أسبوع}', 'حركة جنين محسوسة', 'نبض جنيني {}'] },
        pelvis: { label: 'الحوض', options: ['طبيعي', 'ألم عند تحريك عنق الرحم', 'ضخامة رحم', 'كيس مبيض'] },
        cervix: { label: 'عنق الرحم', options: ['مغلق', 'مفتوح {} سم', 'ناضج Bishop {}', 'ترقق {}%'] }
      },

      features: {
        menstrualHistory: true,
        pregnancyWheel: true,
        pregnancyTracking: true,
        papSmear: true,
        contraceptionTracker: true,
        ultrasoundLog: true,
        eddCalculator: true,
        bishopScore: true,
        obstetricFormula: true,
        bmiCalculator: true
      },

      obstetricFormula: { fields: ['G', 'P', 'A', 'L'] },

      commonLabs: [
        'Beta-hCG', 'CBC', 'Blood Group & Rh',
        'Pap Smear', 'HPV Test', 'TSH',
        'OGTT (سكر الحمل)', 'GBS Swab', 'TORCH Screen'
      ],

      commonDiagnoses: [
        { icd: 'N91.2', ar: 'انقطاع الطمث الثانوي' },
        { icd: 'N92.0', ar: 'غزارة الطمث' },
        { icd: 'O09',   ar: 'الحمل الطبيعي' },
        { icd: 'O14',   ar: 'تسمم الحمل (Pre-eclampsia)' },
        { icd: 'O20.0', ar: 'التهديد بالإجهاض' },
        { icd: 'N76',   ar: 'التهاب المهبل والفرج' }
      ],

      billingCodes: [
        { code: 'GYN-EXAM', ar: 'كشفية نساء', defaultPrice: 20000 },
        { code: 'GYN-PAP', ar: 'مسحة عنق الرحم Pap', defaultPrice: 15000 },
        { code: 'GYN-US', ar: 'سونار التوليد', defaultPrice: 25000 },
        { code: 'GYN-IUD', ar: 'تركيب لولب', defaultPrice: 40000 }
      ],

      followUpRules: {
        antenatal_1st: { intervalDays: 28, message: 'زيارة ما قبل الولادة الشهر الأول' },
        antenatal_3rd: { intervalDays: 14, message: 'زيارة ما قبل الولادة الثلث الثالث' },
        postpartum: { intervalDays: 42, message: 'متابعة ما بعد الولادة' }
      },

      specialModules: ['pregnancy_module', 'pap_module', 'contraception_module'],
      printTemplates: ['pregnancy_card', 'pap_report', 'referral_letter']
    },

    /* ═══ 07 — طب الأطفال ══════════════════════════════════════════ */
    pediatrics: {
      id: 'pediatrics',
      nameAr: 'طب الأطفال والمواليد',
      nameEn: 'Pediatrics',
      emoji: '👶',
      color: '#10b981',
      colorLight: _rgba('#10b981', 0.1),
      description: 'متابعة صحة ونمو وتطعيمات الأطفال من الولادة حتى 18 سنة',
      ageGroup: '0-18',

      vitals: {
        show: ['temp', 'hr', 'o2_sat', 'weight', 'height', 'head_circumference'],
        required: []
      },

      quickComplaints: [
        'حمى', 'سعال وبرد', 'إسهال وتقيؤ', 'طفح جلدي',
        'تأخر نمو', 'فقدان شهية', 'بكاء مستمر', 'صعوبة تنفس',
        'التهاب أذن', 'نوبة تشنجية'
      ],

      quickExamTemplate: {
        general: { label: 'الحالة العامة', options: ['نشيط ومستجيب', 'متعب وخامل', 'شحوب', 'يبكي بقوة'] },
        fontanelle: { label: 'اليافوخ (< 18 شهر)', options: ['مسطح وناعم', 'مشدود', 'غائر'] },
        respiratory: { label: 'التنفس', options: ['طبيعي', 'شهيق مسموع', 'صفير زفيري', 'تراجع صدري'] },
        hydration: { label: 'حالة الترطيب', options: ['جيدة', 'تجفيف خفيف', 'تجفيف متوسط', 'تجفيف شديد'] }
      },

      features: {
        bmiCalculator: true,
        growthCharts: true,
        vaccinationSchedule: true,
        developmentalMilestones: true,
        pediatricDosing: true,
        denver2: true,
        apgarScore: true,
        newbornScreen: true
      },

      vaccinationSchedule: {
        source: 'Jordan MOH 2024',
        milestones: [
          { age: '0d',   vaccines: ['BCG', 'OPV-0', 'HepB-1'] },
          { age: '1m',   vaccines: ['HepB-2'] },
          { age: '2m',   vaccines: ['Penta-1', 'OPV-1', 'PCV-1', 'Rota-1'] },
          { age: '4m',   vaccines: ['Penta-2', 'OPV-2', 'PCV-2', 'Rota-2'] },
          { age: '6m',   vaccines: ['Penta-3', 'OPV-3', 'PCV-3', 'HepB-3'] },
          { age: '12m',  vaccines: ['MMR-1', 'Varicella-1', 'HepA-1'] },
          { age: '18m',  vaccines: ['Penta-B', 'OPV-B', 'PCV-B'] },
          { age: '6y',   vaccines: ['MMR-2', 'DT', 'OPV-4'] }
        ]
      },

      commonLabs: [
        'CBC', 'CRP', 'Urinalysis', 'Blood Glucose',
        'Newborn Screening Panel', 'Blood Culture (عند الحمى الشديدة)'
      ],

      commonDiagnoses: [
        { icd: 'J06.9', ar: 'التهاب الجهاز التنفسي العلوي الحاد' },
        { icd: 'A09',   ar: 'الإسهال المعدي المعوي' },
        { icd: 'J20',   ar: 'التهاب القصبات الحاد' },
        { icd: 'Z00.1', ar: 'فحص صحي دوري للطفل' },
        { icd: 'R50.9', ar: 'حمى غير محددة السبب' },
        { icd: 'H66',   ar: 'التهاب الأذن الوسطى' }
      ],

      billingCodes: [
        { code: 'PED-EXAM', ar: 'كشفية أطفال', defaultPrice: 15000 },
        { code: 'PED-GROWTH', ar: 'فحص نمو وتطعيم', defaultPrice: 20000 },
        { code: 'PED-VACCINE', ar: 'تطعيم (لكل مطعوم)', defaultPrice: 5000 }
      ],

      followUpRules: {
        vaccine_next: { message: 'موعد التطعيم القادم' },
        febrile_illness: { intervalDays: 3, message: 'مراجعة إذا لم تتحسن الحمى خلال 3 أيام' },
        growth_check: { intervalDays: 90, message: 'فحص نمو دوري كل 3 أشهر (< 2 سنة)' }
      },

      specialModules: ['growth_chart_module', 'vaccination_module', 'milestones_module', 'dosing_module'],
      printTemplates: ['growth_report', 'vaccination_card', 'referral_letter']
    },

    /* ═══ 08 — الطب النفسي ══════════════════════════════════════════ */
    psychiatry: {
      id: 'psychiatry',
      nameAr: 'الطب النفسي والصحة النفسية',
      nameEn: 'Psychiatry & Mental Health',
      emoji: '🧠',
      color: '#6366f1',
      colorLight: _rgba('#6366f1', 0.1),
      description: 'تقييم وعلاج ومتابعة الاضطرابات النفسية والسلوكية',
      privacyLevel: 'ULTRA_HIGH',
      noteFormat: 'SOAP',

      vitals: { show: ['bp', 'pulse', 'weight'], required: [] },

      quickComplaints: [
        'اضطراب نوم', 'قلق مستمر', 'مزاج منخفض', 'نوبات هلع',
        'أفكار سلبية متكررة', 'تركيز ضعيف', 'تغير شهية',
        'أعراض ذهانية', 'عدوانية', 'إدمان'
      ],

      quickExamTemplate: {
        mood: { label: 'المزاج', options: ['طبيعي', 'حزين / اكتئابي', 'مرتفع / هوسي', 'متقلب / dysphorc'] },
        thought: { label: 'التفكير', options: ['طبيعي ومنطقي', 'أفكار وسواسية', 'أفكار انتحارية', 'أوهام'] },
        perception: { label: 'الإدراك', options: ['طبيعي', 'هلاوس سمعية', 'هلاوس بصرية', 'هلاوس أخرى'] },
        insight: { label: 'البصيرة', options: ['جيدة', 'جزئية', 'غائبة'] }
      },

      features: {
        phq9: true,
        gad7: true,
        audit: true,
        mmse: true,
        moca: true,
        ymrs: true,
        sessionNotes: true,
        riskAssessment: true,
        medicationLevels: true,
        ecgBeforeMeds: true
      },

      assessmentScales: {
        phq9: { name: 'PHQ-9', label: 'اكتئاب', maxScore: 27, cutoffs: [{ score: 5, level: 'خفيف' }, { score: 10, level: 'متوسط' }, { score: 15, level: 'شديد' }, { score: 20, level: 'شديد جداً' }] },
        gad7: { name: 'GAD-7', label: 'قلق', maxScore: 21, cutoffs: [{ score: 5, level: 'خفيف' }, { score: 10, level: 'متوسط' }, { score: 15, level: 'شديد' }] },
        mmse: { name: 'MMSE', label: 'ذاكرة', maxScore: 30, cutoffs: [{ score: 24, level: 'طبيعي', direction: 'above' }] },
        moca: { name: 'MoCA', label: 'إدراك', maxScore: 30, cutoffs: [{ score: 26, level: 'طبيعي', direction: 'above' }] }
      },

      commonLabs: [
        'TSH (استبعاد سبب عضوي)', 'CBC',
        'Lithium Level', 'Liver Functions',
        'Valproate Level', 'Clozapine Level'
      ],

      commonDiagnoses: [
        { icd: 'F32',   ar: 'الاضطراب الاكتئابي الشديد' },
        { icd: 'F41.1', ar: 'اضطراب القلق العام' },
        { icd: 'F43.1', ar: 'اضطراب ما بعد الصدمة' },
        { icd: 'F31',   ar: 'اضطراب ثنائي القطب' },
        { icd: 'F20',   ar: 'الفصام' },
        { icd: 'F90',   ar: 'اضطراب فرط الحركة وتشتت الانتباه' },
        { icd: 'F84.0', ar: 'التوحد' }
      ],

      billingCodes: [
        { code: 'PSY-INIT', ar: 'تقييم نفسي أولي', defaultPrice: 40000 },
        { code: 'PSY-FOLLOW', ar: 'جلسة متابعة', defaultPrice: 25000 },
        { code: 'PSY-THERAPY', ar: 'جلسة علاج نفسي', defaultPrice: 50000 }
      ],

      followUpRules: {
        acute: { intervalDays: 7, message: 'متابعة أسبوعية للمرحلة الحادة' },
        maintenance: { intervalDays: 30, message: 'متابعة شهرية للمرحلة المستقرة' }
      },

      specialModules: ['assessment_scales_module', 'risk_module', 'session_notes_module'],
      printTemplates: ['session_summary', 'referral_letter', 'medication_plan']
    },

    /* ═══ 09 — العظام والمفاصل ══════════════════════════════════════ */
    orthopedics: {
      id: 'orthopedics',
      nameAr: 'جراحة العظام والمفاصل',
      nameEn: 'Orthopedics',
      emoji: '🦴',
      color: '#78716c',
      colorLight: _rgba('#78716c', 0.1),
      description: 'تشخيص وعلاج إصابات وأمراض العظام والمفاصل والعمود الفقري',

      vitals: { show: ['bp', 'pulse', 'weight', 'height'], required: [] },

      quickComplaints: [
        'ألم ظهر', 'ألم رقبة', 'ألم ركبة', 'تيبس مفصل',
        'تورم مفصل', 'ضعف حركة', 'ألم بعد إصابة', 'خشونة مفاصل',
        'كسر', 'ألم كتف'
      ],

      quickExamTemplate: {
        joint: { label: 'المفصل المفحوص', options: ['كتف', 'مرفق', 'معصم', 'ورك', 'ركبة', 'كاحل', 'عمود فقري'] },
        swelling: { label: 'التورم', options: ['لا يوجد', 'خفيف', 'متوسط', 'شديد'] },
        rom: { label: 'مدى الحركة', options: ['طبيعي', 'محدود جزئياً', 'محدود شديداً', 'مؤلم عند نهاية الحركة'] },
        stability: { label: 'الاستقرار', options: ['مستقر', 'عدم استقرار خفيف', 'تهتز بالجس'] }
      },

      features: {
        bmiCalculator: true,
        painBodyMap: true,
        rangeOfMotion: true,
        implantTracking: true,
        xrayReport: true,
        dexa: true,
        muscleStrength: true,
        womacScore: true,
        oswestryIndex: true,
        quickDash: true,
        vasPain: true
      },

      commonLabs: [
        'CBC', 'ESR', 'CRP', 'Vitamin D',
        'Calcium', 'Uric Acid', 'RF', 'Anti-CCP'
      ],

      commonDiagnoses: [
        { icd: 'M54.5', ar: 'ألم أسفل الظهر' },
        { icd: 'M17',   ar: 'خشونة الركبة (Gonarthrosis)' },
        { icd: 'M16',   ar: 'خشونة الورك (Coxarthrosis)' },
        { icd: 'M75',   ar: 'اعتلالات مفصل الكتف' },
        { icd: 'M81',   ar: 'هشاشة العظام' },
        { icd: 'S82',   ar: 'كسر الساق' }
      ],

      billingCodes: [
        { code: 'ORTH-EXAM', ar: 'كشفية عظام', defaultPrice: 20000 },
        { code: 'ORTH-CAST', ar: 'تجبيس', defaultPrice: 30000 },
        { code: 'ORTH-INJECT', ar: 'حقن مفصل', defaultPrice: 40000 },
        { code: 'ORTH-XRAY', ar: 'أشعة سينية', defaultPrice: 15000 }
      ],

      followUpRules: {
        fracture: { intervalDays: 14, message: 'متابعة الكسر بعد أسبوعين' },
        injection: { intervalDays: 30, message: 'تقييم الاستجابة للحقن بعد شهر' },
        postop: { intervalDays: 7, message: 'متابعة ما بعد الجراحة' }
      },

      specialModules: ['pain_map_module', 'rom_module', 'implant_module'],
      printTemplates: ['ortho_report', 'physiotherapy_plan', 'referral_letter']
    },

    /* ═══ 10 — الجلدية ═══════════════════════════════════════════════ */
    dermatology: {
      id: 'dermatology',
      nameAr: 'الجلدية والتناسلية',
      nameEn: 'Dermatology',
      emoji: '🌿',
      color: '#d97706',
      colorLight: _rgba('#d97706', 0.1),
      description: 'تشخيص وعلاج أمراض الجلد والشعر والأظافر',

      vitals: { show: ['bp', 'pulse'], required: [] },

      quickComplaints: [
        'طفح جلدي', 'حكة', 'بقع جلدية', 'حب الشباب',
        'تساقط شعر', 'تغير شامة', 'جفاف جلد', 'التهاب جلدي',
        'تقرحات', 'أكزيما'
      ],

      quickExamTemplate: {
        lesion_type: { label: 'نوع الآفة', options: ['بقعة (Macule)', 'حطاطة (Papule)', 'نفطة (Vesicle)', 'بثرة (Pustule)', 'صفيحة (Plaque)', 'عقدة (Nodule)'] },
        distribution: { label: 'التوزيع', options: ['موضعي', 'منتشر', 'متناظر', 'أماكن مكشوفة', 'طيات الجلد'] },
        surface: { label: 'السطح', options: ['أملس', 'متقشر', 'خشن', 'مندي', 'متشقق'] }
      },

      features: {
        skinBodyMap: true,
        lesionDocumentation: true,
        beforeAfterPhotos: true,
        pasiScore: true,
        scorad: true,
        iga: true,
        easi: true,
        procedureTracking: true
      },

      commonLabs: [
        'Skin Biopsy', 'KOH Prep', 'Patch Test',
        'CBC', 'IgE Total', 'ANA (عند الاشتباه بأمراض مناعية)'
      ],

      commonDiagnoses: [
        { icd: 'L40',  ar: 'الصدفية' },
        { icd: 'L20',  ar: 'الإكزيما التأتبية' },
        { icd: 'L70',  ar: 'حب الشباب' },
        { icd: 'L21',  ar: 'التهاب الجلد الدهني' },
        { icd: 'B35',  ar: 'العدوى الفطرية الجلدية' },
        { icd: 'L50',  ar: 'الشرى (Urticaria)' }
      ],

      billingCodes: [
        { code: 'DERM-EXAM', ar: 'كشفية جلدية', defaultPrice: 20000 },
        { code: 'DERM-CRYO', ar: 'تجميد (Cryotherapy)', defaultPrice: 25000 },
        { code: 'DERM-BX', ar: 'خزعة جلدية', defaultPrice: 40000 },
        { code: 'DERM-LASER', ar: 'ليزر جلدي (جلسة)', defaultPrice: 100000 }
      ],

      followUpRules: {
        psoriasis: { intervalDays: 30, message: 'متابعة الصدفية شهرياً' },
        acne: { intervalDays: 45, message: 'متابعة حب الشباب كل 6 أسابيع' },
        postprocedure: { intervalDays: 7, message: 'متابعة ما بعد الإجراء' }
      },

      specialModules: ['skin_map_module', 'lesion_module', 'derm_photo_module'],
      printTemplates: ['derm_report', 'procedure_consent', 'referral_letter']
    },

    /* ═══ 11 — الغدد الصماء والسكري ══════════════════════════════════ */
    endocrinology: {
      id: 'endocrinology',
      nameAr: 'الغدد الصماء والسكري',
      nameEn: 'Endocrinology & Diabetes',
      emoji: '🧪',
      color: '#0891b2',
      colorLight: _rgba('#0891b2', 0.1),
      description: 'متابعة السكري واضطرابات الغدد الصماء',

      vitals: { show: ['bp', 'pulse', 'weight', 'height'], required: [] },

      quickComplaints: [
        'عطش زائد', 'تبول متكرر', 'تعب وخمول',
        'تغير وزن غير مبرر', 'خفقان وتعرق', 'جفاف وتساقط شعر',
        'تنميل أطراف', 'ارتفاع سكر', 'هبوط سكر'
      ],

      features: {
        bmiCalculator: true,
        gfrCalculator: true,
        diabetesDashboard: true,
        hba1cTrend: true,
        complicationsChecklist: true,
        thyroidPanel: true,
        insulinDosing: true,
        homaIR: true,
        tirads: true
      },

      diabetesComplicationsChecklist: [
        { id: 'eye', label: 'فحص العيون (Fundoscopy)', intervalMonths: 12 },
        { id: 'foot', label: 'فحص القدم (Monofilament)', intervalMonths: 6 },
        { id: 'kidney', label: 'نسبة ألبومين/كرياتينين بول', intervalMonths: 6 },
        { id: 'nerve', label: 'فحص الأعصاب', intervalMonths: 12 },
        { id: 'ecg', label: 'رسم قلب ECG', intervalMonths: 12 },
        { id: 'bp', label: 'ضغط الدم', intervalMonths: 1 }
      ],

      commonLabs: [
        'HbA1c', 'Fasting/Random Glucose',
        'TSH, Free T4, Free T3', 'Lipid Profile',
        'Microalbumin/Creatinine Ratio', 'Anti-TPO, Anti-Tg'
      ],

      commonDiagnoses: [
        { icd: 'E11',  ar: 'السكري من النوع الثاني' },
        { icd: 'E10',  ar: 'السكري من النوع الأول' },
        { icd: 'E03',  ar: 'قصور الغدة الدرقية' },
        { icd: 'E05',  ar: 'فرط نشاط الغدة الدرقية' },
        { icd: 'E66',  ar: 'السمنة' },
        { icd: 'E78',  ar: 'اضطراب شحوم الدم' }
      ],

      billingCodes: [
        { code: 'ENDO-EXAM', ar: 'كشفية غدد وسكري', defaultPrice: 20000 },
        { code: 'ENDO-INS', ar: 'تعليم الأنسولين', defaultPrice: 15000 }
      ],

      followUpRules: {
        diabetes_controlled: { intervalDays: 90, message: 'متابعة HbA1c كل 3 أشهر' },
        diabetes_uncontrolled: { intervalDays: 30, message: 'متابعة مكثفة شهرياً' },
        hypothyroid: { intervalDays: 42, message: 'متابعة TSH بعد 6 أسابيع من تعديل الجرعة' }
      },

      specialModules: ['diabetes_module', 'thyroid_module', 'complications_module'],
      printTemplates: ['diabetes_report', 'thyroid_report', 'referral_letter']
    },

    /* ═══ 12 — الأمراض الصدرية والرئوية ══════════════════════════════ */
    pulmonology: {
      id: 'pulmonology',
      nameAr: 'الأمراض الصدرية والرئوية',
      nameEn: 'Pulmonology',
      emoji: '🫁',
      color: '#0369a1',
      colorLight: _rgba('#0369a1', 0.1),
      description: 'تشخيص وعلاج أمراض الرئة والجهاز التنفسي',

      vitals: { show: ['temp', 'bp', 'pulse', 'o2_sat'], required: [] },

      quickComplaints: [
        'ضيق تنفس', 'سعال مزمن', 'صفير عند التنفس',
        'ألم صدر عند التنفس', 'انقطاع نفس أثناء النوم',
        'بلغم متكرر', 'نفث دم', 'شخير شديد'
      ],

      features: {
        spirometry: true,
        peakFlow: true,
        asthmaActionPlan: true,
        goldStaging: true,
        cpapData: true,
        cxrReport: true,
        smokingHistory: true,
        catScore: true
      },

      goldStaging: [
        { stage: 'I', label: 'خفيف', fev1: '>= 80%' },
        { stage: 'II', label: 'متوسط', fev1: '50-79%' },
        { stage: 'III', label: 'شديد', fev1: '30-49%' },
        { stage: 'IV', label: 'شديد جداً', fev1: '< 30%' }
      ],

      commonLabs: [
        'Spirometry / PFT', 'ABG', 'Sputum Culture',
        'CXR', 'D-Dimer', 'Alpha-1 Antitrypsin'
      ],

      commonDiagnoses: [
        { icd: 'J45',    ar: 'الربو' },
        { icd: 'J44',    ar: 'مرض الانسداد الرئوي المزمن (COPD)' },
        { icd: 'J18',    ar: 'الالتهاب الرئوي' },
        { icd: 'G47.33', ar: 'انقطاع النفس الانسدادي النومي' },
        { icd: 'J84',    ar: 'أمراض الرئة الخلالية' }
      ],

      billingCodes: [
        { code: 'PULM-EXAM', ar: 'كشفية صدرية', defaultPrice: 20000 },
        { code: 'PULM-PFT', ar: 'وظائف رئة Spirometry', defaultPrice: 30000 },
        { code: 'PULM-NEBUL', ar: 'جلسة نيبولايزر', defaultPrice: 10000 }
      ],

      followUpRules: {
        asthma: { intervalDays: 90, message: 'متابعة الربو كل 3 أشهر' },
        copd: { intervalDays: 90, message: 'متابعة COPD + spirometry سنوي' }
      },

      specialModules: ['spirometry_module', 'asthma_module', 'cpap_module'],
      printTemplates: ['pft_report', 'asthma_action_plan', 'referral_letter']
    },

    /* ═══ 13 — أمراض الأعصاب ════════════════════════════════════════ */
    neurology: {
      id: 'neurology',
      nameAr: 'أمراض الأعصاب',
      nameEn: 'Neurology',
      emoji: '🧠',
      color: '#7c3aed',
      colorLight: _rgba('#7c3aed', 0.1),
      description: 'تشخيص وعلاج أمراض الجهاز العصبي المركزي والمحيطي',

      vitals: { show: ['bp', 'pulse', 'o2_sat'], required: [] },

      quickComplaints: [
        'صداع متكرر', 'دوخة', 'تنميل/خدر', 'ضعف عضلي',
        'نوبة تشنج', 'فقدان توازن', 'نسيان وتشوش', 'رعشة',
        'اضطراب كلام', 'شلل'
      ],

      quickExamTemplate: {
        consciousness: { label: 'الوعي', options: ['واعٍ ومستجيب تماماً', 'خامل', 'مشوش', 'GCS {} / 15'] },
        cranial_nerves: { label: 'الأعصاب القحفية', options: ['سليمة', 'شلل وجه', 'اضطراب حركة عين', 'صعوبة بلع'] },
        motor: { label: 'القوة الحركية', options: ['5/5 في كل الأطراف', 'ضعف يمين {}', 'ضعف يسار {}', 'شلل رباعي'] },
        reflexes: { label: 'ردود الفعل', options: ['طبيعية +++', 'خامدة +', 'غائبة', 'مبالغ فيها ++++', 'Babinski إيجابي'] }
      },

      features: {
        nihssScore: true,
        headacheDiary: true,
        cranialNerveExam: true,
        reflexExam: true,
        gaitAssessment: true,
        miniMental: true
      },

      commonLabs: [
        'CBC', 'Electrolytes', 'Vitamin B12',
        'TSH', 'Brain MRI/CT', 'EEG',
        'ESR', 'ANA', 'LP (CSF) عند الاشتباه'
      ],

      commonDiagnoses: [
        { icd: 'G43',  ar: 'الشقيقة (Migraine)' },
        { icd: 'G40',  ar: 'الصرع' },
        { icd: 'I63',  ar: 'السكتة الدماغية الإقفارية' },
        { icd: 'G20',  ar: 'مرض باركنسون' },
        { icd: 'G35',  ar: 'التصلب اللويحي المتعدد' },
        { icd: 'G62',  ar: 'اعتلال الأعصاب المحيطية' }
      ],

      billingCodes: [
        { code: 'NEURO-EXAM', ar: 'كشفية أعصاب', defaultPrice: 25000 },
        { code: 'NEURO-EEG', ar: 'تخطيط دماغ EEG', defaultPrice: 50000 }
      ],

      followUpRules: {
        epilepsy: { intervalDays: 90, message: 'متابعة الصرع كل 3 أشهر' },
        stroke: { intervalDays: 7, message: 'متابعة السكتة الدماغية أسبوعياً أولى شهر' },
        headache: { intervalDays: 30, message: 'متابعة الصداع المزمن شهرياً' }
      },

      specialModules: ['headache_module', 'stroke_module', 'exam_module'],
      printTemplates: ['neuro_report', 'headache_diary_report', 'referral_letter']
    },

    /* ═══ 14 — المسالك البولية ═══════════════════════════════════════ */
    urology: {
      id: 'urology',
      nameAr: 'المسالك البولية والكلى',
      nameEn: 'Urology',
      emoji: '💧',
      color: '#0f766e',
      colorLight: _rgba('#0f766e', 0.1),
      description: 'تشخيص وعلاج أمراض الكلى والمسالك البولية والجهاز التناسلي الذكري',

      vitals: { show: ['bp', 'pulse', 'weight'], required: [] },

      quickComplaints: [
        'ألم بالخصر', 'حرقان بول', 'تكرار تبول', 'دم في البول',
        'ألم أسفل البطن', 'صعوبة تبول', 'تسرب بول', 'تضخم بروستاتا'
      ],

      features: {
        gfrCalculator: true,
        psaTracking: true,
        kidneyStoneTracker: true,
        bladderDiary: true,
        ipss: true,
        erectileFunctionScore: true
      },

      commonLabs: [
        'Urinalysis', 'Urine Culture', 'PSA',
        'Creatinine/eGFR', 'Renal Ultrasound', '24h Urine Analysis'
      ],

      commonDiagnoses: [
        { icd: 'N20',   ar: 'حصى الكلى/الحالب' },
        { icd: 'N40',   ar: 'تضخم البروستاتا الحميد' },
        { icd: 'N30',   ar: 'التهاب المثانة' },
        { icd: 'N39.0', ar: 'التهاب المسالك البولية' },
        { icd: 'R31',   ar: 'دم في البول غير محدد السبب' }
      ],

      billingCodes: [
        { code: 'URO-EXAM', ar: 'كشفية مسالك', defaultPrice: 20000 },
        { code: 'URO-CATH', ar: 'قسطرة بولية', defaultPrice: 15000 },
        { code: 'URO-CYSTO', ar: 'منظار مثانة', defaultPrice: 80000 }
      ],

      followUpRules: {
        uti: { intervalDays: 7, message: 'ثقافة بول للتأكد من الشفاء' },
        stone: { intervalDays: 30, message: 'سونار كلى متابعة بعد شهر' },
        bph: { intervalDays: 90, message: 'متابعة BPH كل 3 أشهر' }
      },

      specialModules: ['psa_module', 'stone_module', 'bladder_diary_module'],
      printTemplates: ['urology_report', 'referral_letter']
    },

    /* ═══ 15 — أمراض الروماتيزم ══════════════════════════════════════ */
    rheumatology: {
      id: 'rheumatology',
      nameAr: 'أمراض الروماتيزم',
      nameEn: 'Rheumatology',
      emoji: '🫀',
      color: '#be185d',
      colorLight: _rgba('#be185d', 0.1),
      description: 'تشخيص وعلاج أمراض المفاصل المناعية والروماتيزمية',

      vitals: { show: ['bp', 'pulse', 'weight'], required: [] },

      quickComplaints: [
        'ألم وتورم مفاصل متعدد', 'تيبس صباحي', 'تعب شديد',
        'ألم عضلي منتشر', 'حساسية للضوء', 'تقرحات فموية', 'ظاهرة رينود'
      ],

      features: {
        joint66Assessment: true,
        das28: true,
        autoantibodyPanel: true,
        sledai: true,
        basdai: true,
        haqDi: true
      },

      commonLabs: [
        'RF', 'Anti-CCP', 'ANA', 'Anti-dsDNA',
        'ESR, CRP', 'Complement C3/C4', 'ANCA', 'HLA-B27'
      ],

      commonDiagnoses: [
        { icd: 'M05',  ar: 'التهاب المفاصل الرثياني' },
        { icd: 'M32',  ar: 'الذئبة الحمراء الجهازية' },
        { icd: 'M45',  ar: 'التهاب الفقار اللاصق' },
        { icd: 'M10',  ar: 'النقرس (Gout)' },
        { icd: 'M06',  ar: 'التهاب المفاصل غير المصنف' }
      ],

      billingCodes: [
        { code: 'RHEUM-EXAM', ar: 'كشفية روماتيزم', defaultPrice: 25000 },
        { code: 'RHEUM-INJECT', ar: 'حقن مفصل كورتيزون', defaultPrice: 50000 }
      ],

      followUpRules: {
        ra_active: { intervalDays: 30, message: 'متابعة DAS28 شهرياً حتى الهدأة' },
        ra_remission: { intervalDays: 90, message: 'متابعة الهدأة كل 3 أشهر' },
        lupus: { intervalDays: 30, message: 'متابعة الذئبة الحمراء شهرياً' }
      },

      specialModules: ['joint_assessment_module', 'autoantibody_module'],
      printTemplates: ['rheum_report', 'das28_report', 'referral_letter']
    },

    /* ═══ 16 — الطب الداخلي ══════════════════════════════════════════ */
    internal_medicine: {
      id: 'internal_medicine',
      nameAr: 'الطب الداخلي والأمراض العامة',
      nameEn: 'Internal Medicine',
      emoji: '🌡️',
      color: '#334155',
      colorLight: _rgba('#334155', 0.1),
      description: 'تقييم شامل للأجهزة الداخلية ومتابعة الحالات المعقدة',

      vitals: { show: ['temp', 'bp', 'hr', 'o2_sat', 'weight', 'height'], required: [] },

      quickComplaints: [
        'تعب عام', 'فقدان وزن غير مبرر', 'حمى مستمرة',
        'ألم متعدد الأجهزة', 'تورم عام', 'نتائج تحاليل غير طبيعية'
      ],

      features: {
        bmiCalculator: true,
        chronicDiseasePanel: true,
        medicationReconciliation: true,
        problemList: true,
        labTrends: true,
        referralTracker: true
      },

      commonLabs: [
        'CBC', 'وظائف الكلى والكبد (CMP)', 'Lipid Profile',
        'TSH', 'ESR/CRP', 'Urinalysis', 'Blood Culture',
        'Ferritin', 'LDH'
      ],

      commonDiagnoses: [
        { icd: 'I10',  ar: 'ارتفاع ضغط الدم' },
        { icd: 'E11',  ar: 'السكري من النوع الثاني' },
        { icd: 'E78',  ar: 'اضطراب شحوم الدم' },
        { icd: 'N18',  ar: 'مرض الكلى المزمن' },
        { icd: 'D64',  ar: 'فقر دم غير محدد' },
        { icd: 'R53',  ar: 'وهن وتعب عام' }
      ],

      billingCodes: [
        { code: 'INT-CONSULT', ar: 'استشارة طب داخلي', defaultPrice: 30000 },
        { code: 'INT-FOLLOW', ar: 'متابعة داخلية', defaultPrice: 20000 }
      ],

      followUpRules: {
        complex: { intervalDays: 30, message: 'متابعة الحالات المعقدة شهرياً' }
      },

      specialModules: ['problem_list_module', 'lab_trends_module'],
      printTemplates: ['consult_report', 'referral_letter', 'discharge_summary']
    },

    /* ═══ 17 — الجهاز الهضمي والكبد ══════════════════════════════════ */
    gastroenterology: {
      id: 'gastroenterology',
      nameAr: 'الجهاز الهضمي والكبد',
      nameEn: 'Gastroenterology',
      emoji: '🔬',
      color: '#a16207',
      colorLight: _rgba('#a16207', 0.1),
      description: 'تشخيص وعلاج أمراض الجهاز الهضمي والكبد والبنكرياس',

      vitals: { show: ['bp', 'pulse', 'weight'], required: [] },

      quickComplaints: [
        'ألم بطن', 'حرقة معدة', 'إسهال مزمن', 'إمساك',
        'نزيف هضمي', 'انتفاخ وغازات', 'غثيان وتقيؤ', 'يرقان'
      ],

      features: {
        endoscopyReports: true,
        hepatitisPanel: true,
        fibrosisScore: true,
        colonoscopyTracking: true
      },

      commonLabs: [
        'وظائف الكبد (LFTs)', 'Hepatitis B/C Panel',
        'H. Pylori Test', 'Stool Analysis/Occult Blood',
        'Amylase/Lipase', 'Abdominal Ultrasound',
        'AFP', 'CEA'
      ],

      commonDiagnoses: [
        { icd: 'K21',  ar: 'الارتجاع المعدي المريئي' },
        { icd: 'K29',  ar: 'التهاب المعدة' },
        { icd: 'K58',  ar: 'القولون العصبي' },
        { icd: 'K76',  ar: 'أمراض الكبد الأخرى' },
        { icd: 'K80',  ar: 'حصى المرارة' },
        { icd: 'K92',  ar: 'نزيف الجهاز الهضمي' }
      ],

      billingCodes: [
        { code: 'GI-EXAM', ar: 'كشفية هضمية', defaultPrice: 20000 },
        { code: 'GI-OGD', ar: 'تنظير علوي', defaultPrice: 80000 },
        { code: 'GI-COLON', ar: 'منظار قولون', defaultPrice: 120000 }
      ],

      followUpRules: {
        hepatitis_b: { intervalDays: 180, message: 'متابعة التهاب كبد B كل 6 أشهر' },
        ibs: { intervalDays: 60, message: 'متابعة القولون العصبي كل شهرين' }
      },

      specialModules: ['endoscopy_module', 'hepatitis_module'],
      printTemplates: ['endoscopy_report', 'gi_report', 'referral_letter']
    },

    /* ═══ 18 — الطب الرياضي ═════════════════════════════════════════ */
    sports_medicine: {
      id: 'sports_medicine',
      nameAr: 'الطب الرياضي وإعادة التأهيل',
      nameEn: 'Sports Medicine',
      emoji: '🏃',
      color: '#16a34a',
      colorLight: _rgba('#16a34a', 0.1),
      description: 'تقييم وعلاج الإصابات الرياضية وإعادة التأهيل الوظيفي',

      vitals: { show: ['bp', 'pulse', 'weight', 'height'], required: [] },

      quickComplaints: [
        'إصابة رياضية حادة', 'شد عضلي', 'ألم مفصل بعد تمرين',
        'تعب وإفراط تدريب', 'عدم استقرار مفصل', 'ألم وتر'
      ],

      features: {
        functionalMovementScreen: true,
        returnToPlayProtocol: true,
        strengthTracker: true,
        riceProtocol: true,
        vasPain: true,
        bmiCalculator: true
      },

      commonLabs: [
        'CK (Creatine Kinase)', 'CBC', 'Vitamin D', 'Ferritin',
        'Testosterone', 'Cortisol'
      ],

      commonDiagnoses: [
        { icd: 'S93',  ar: 'التواء الكاحل' },
        { icd: 'S83',  ar: 'التواء/تمزق أربطة الركبة' },
        { icd: 'M76',  ar: 'اعتلال الأوتار (الطرف السفلي)' },
        { icd: 'M77',  ar: 'اعتلالات أوتار أخرى' },
        { icd: 'T14.9', ar: 'إصابة رياضية غير محددة' }
      ],

      billingCodes: [
        { code: 'SPORT-EXAM', ar: 'كشفية طب رياضي', defaultPrice: 20000 },
        { code: 'SPORT-REHAB', ar: 'جلسة تأهيل', defaultPrice: 25000 }
      ],

      followUpRules: {
        sprain: { intervalDays: 7, message: 'متابعة الالتواء بعد أسبوع' },
        rtp: { intervalDays: 14, message: 'تقييم العودة للملاعب' }
      },

      specialModules: ['fms_module', 'return_to_play_module'],
      printTemplates: ['sports_injury_report', 'return_to_play_clearance', 'referral_letter']
    },

    /* ═══ 19 — طب التجميل ════════════════════════════════════════════ */
    aesthetic: {
      id: 'aesthetic',
      nameAr: 'التجميل وجراحة الجسم',
      nameEn: 'Aesthetic Medicine',
      emoji: '🌸',
      color: '#db2777',
      colorLight: _rgba('#db2777', 0.1),
      description: 'إجراءات التجميل غير الجراحية ومتابعة النتائج',

      vitals: { show: ['bp', 'pulse'], required: [] },

      quickComplaints: [
        'تجاعيد الوجه', 'ترهل جلدي', 'عدم تناسق ملامح',
        'رغبة بتفتيح البشرة', 'ندبات', 'شعر زائد', 'تساقط شعر',
        'دهون موضعية', 'بقع تصبغية'
      ],

      features: {
        injectionMap: true,
        beforeAfterGallery: true,
        consentForms: true,
        sessionSeriesTracker: true,
        bodyMeasurements: true,
        bmiCalculator: true
      },

      injectionMapZones: {
        forehead: { labelAr: 'الجبهة', type: 'botox', unitType: 'وحدة' },
        glabella: { labelAr: 'بين الحاجبين', type: 'botox', unitType: 'وحدة' },
        crow_feet: { labelAr: 'حول العيون', type: 'botox', unitType: 'وحدة' },
        nasolabial: { labelAr: 'خطوط الابتسامة', type: 'filler', unitType: 'مل' },
        cheek: { labelAr: 'الخدود', type: 'filler', unitType: 'مل' },
        lips: { labelAr: 'الشفاه', type: 'filler', unitType: 'مل' },
        chin: { labelAr: 'الذقن', type: 'filler', unitType: 'مل' }
      },

      commonLabs: ['Allergy Test (قبل الفيلر)'],

      commonDiagnoses: [
        { icd: 'L90',  ar: 'اضطرابات الجلد الضمورية' },
        { icd: 'L57',  ar: 'تغيرات الجلد الناتجة عن التعرض للشمس' }
      ],

      billingCodes: [
        { code: 'AES-EXAM', ar: 'استشارة تجميلية', defaultPrice: 25000 },
        { code: 'AES-BOT', ar: 'حقن بوتوكس (منطقة)', defaultPrice: 100000 },
        { code: 'AES-FILL', ar: 'حقن فيلر (مل)', defaultPrice: 150000 },
        { code: 'AES-LASER', ar: 'ليزر تجميلي (جلسة)', defaultPrice: 120000 }
      ],

      followUpRules: {
        botox: { intervalDays: 180, message: 'إعادة البوتوكس بعد 4-6 أشهر' },
        filler: { intervalDays: 365, message: 'متابعة الفيلر بعد سنة' }
      },

      specialModules: ['injection_map_module', 'gallery_module'],
      printTemplates: ['consent_form', 'procedure_plan', 'aftercare_instructions']
    },

    /* ═══ 20 — الحساسية والمناعة ═════════════════════════════════════ */
    allergy: {
      id: 'allergy',
      nameAr: 'الحساسية والمناعة',
      nameEn: 'Allergy & Immunology',
      emoji: '💨',
      color: '#65a30d',
      colorLight: _rgba('#65a30d', 0.1),
      description: 'تشخيص ومتابعة الحساسية وأمراض المناعة',

      vitals: { show: ['bp', 'pulse', 'o2_sat'], required: [] },

      quickComplaints: [
        'عطاس وحكة أنف', 'طفح وحكة جلدية', 'ضيق تنفس عند التعرض لمحفز',
        'تورم شفاه/وجه', 'حساسية غذائية', 'ربو موسمي', 'طفح أكزيمي'
      ],

      features: {
        skinPrickTest: true,
        igeTracking: true,
        immunotherapySchedule: true,
        anaphylaxisPlan: true,
        allergenDiary: true
      },

      commonLabs: [
        'Total IgE', 'Specific IgE (RAST/ImmunoCAP)',
        'Skin Prick Test Panel', 'Eosinophil Count',
        'Tryptase (عند الاشتباه بالحساسية الحادة)'
      ],

      commonDiagnoses: [
        { icd: 'J30',   ar: 'التهاب الأنف التحسسي' },
        { icd: 'L20',   ar: 'الإكزيما التأتبية' },
        { icd: 'T78.4', ar: 'حساسية غير محددة' },
        { icd: 'J45',   ar: 'الربو' },
        { icd: 'L50',   ar: 'الشرى (Urticaria)' },
        { icd: 'T78.0', ar: 'الحساسية الحادة (Anaphylaxis)' }
      ],

      billingCodes: [
        { code: 'ALLG-EXAM', ar: 'كشفية حساسية', defaultPrice: 20000 },
        { code: 'ALLG-SPT', ar: 'اختبار الجلد للحساسية', defaultPrice: 40000 },
        { code: 'ALLG-IMMUNO', ar: 'جلسة علاج مناعي', defaultPrice: 30000 }
      ],

      followUpRules: {
        immunotherapy: { intervalDays: 7, message: 'جلسة العلاج المناعي الأسبوعية' },
        anaphylaxis: { intervalDays: 14, message: 'متابعة ما بعد الحساسية الحادة' }
      },

      specialModules: ['allergy_test_module', 'immunotherapy_module'],
      printTemplates: ['allergy_report', 'anaphylaxis_action_plan', 'referral_letter']
    },

    /* ═══ 21 — طب المسنين ════════════════════════════════════════════ */
    geriatrics: {
      id: 'geriatrics',
      nameAr: 'طب المسنين',
      nameEn: 'Geriatrics',
      emoji: '👴',
      color: '#92400e',
      colorLight: _rgba('#92400e', 0.1),
      description: 'الرعاية الشاملة لكبار السن وتقييم الاستقلالية الوظيفية',

      vitals: { show: ['temp', 'bp', 'hr', 'o2_sat', 'weight', 'height'], required: [] },

      quickComplaints: [
        'سقوط متكرر', 'نسيان وتشوش', 'ضعف عام', 'فقدان شهية',
        'صعوبة حركة', 'سلس بول', 'أرق', 'ألم مزمن'
      ],

      features: {
        bmiCalculator: true,
        mocaMmse: true,
        timedUpAndGo: true,
        polypharmacyReview: true,
        barthelIndex: true,
        mnaScreen: true,
        fallsRisk: true
      },

      commonLabs: [
        'CBC', 'وظائف الكلى',
        'Vitamin B12 & Folate', 'TSH',
        'Vitamin D', 'Albumin', 'Calcium'
      ],

      commonDiagnoses: [
        { icd: 'Z91.81', ar: 'تاريخ سقوط متكرر' },
        { icd: 'F03',    ar: 'خرف غير محدد' },
        { icd: 'I10',    ar: 'ارتفاع ضغط الدم' },
        { icd: 'E11',    ar: 'السكري من النوع الثاني' },
        { icd: 'M81',    ar: 'هشاشة العظام' },
        { icd: 'R63.4',  ar: 'فقدان وزن غير طبيعي' }
      ],

      billingCodes: [
        { code: 'GER-EXAM', ar: 'كشفية مسنين شاملة', defaultPrice: 30000 },
        { code: 'GER-MED-REV', ar: 'مراجعة الأدوية', defaultPrice: 20000 }
      ],

      followUpRules: {
        dementia: { intervalDays: 90, message: 'متابعة الخرف كل 3 أشهر' },
        falls_risk: { intervalDays: 30, message: 'متابعة خطر السقوط شهرياً' }
      },

      specialModules: ['cognitive_module', 'falls_risk_module', 'polypharmacy_module'],
      printTemplates: ['geriatric_assessment_report', 'medication_review', 'referral_letter']
    },

    /* ═══ 22 — طب الطوارئ ════════════════════════════════════════════ */
    emergency: {
      id: 'emergency',
      nameAr: 'طب الطوارئ والرعاية الحادة',
      nameEn: 'Emergency Medicine',
      emoji: '🚨',
      color: '#dc2626',
      colorLight: _rgba('#dc2626', 0.1),
      description: 'تقييم وعلاج الحالات الحادة والطارئة وفرز المرضى',

      vitals: {
        show: ['temp', 'bp', 'hr', 'rr', 'o2_sat'],
        required: ['bp', 'hr']
      },

      quickComplaints: [
        'ألم صدر حاد', 'ضيق تنفس شديد', 'نزيف حاد',
        'فقدان وعي', 'إصابة وحادث', 'تسمم/جرعة دواء زائدة',
        'حمى شديدة عند طفل', 'صدمة تحسسية'
      ],

      quickExamTemplate: {
        abcde: {
          label: 'تقييم ABCDE',
          a: { label: 'A - Airway', options: ['سليمة', 'مهددة', 'مسدودة'] },
          b: { label: 'B - Breathing', options: ['طبيعي', 'سريع', 'بطيء', 'غائب'] },
          c: { label: 'C - Circulation', options: ['ضغط طبيعي', 'هبوط ضغط', 'صدمة'] },
          d: { label: 'D - Disability GCS', options: ['15/15', '13-14', '<12', '3'] },
          e: { label: 'E - Exposure', options: ['طبيعي', 'طفح', 'إصابات ظاهرة'] }
        }
      },

      features: {
        triageSystem: true,
        abcdeFramework: true,
        resuscitationProtocols: true,
        rapidLabPanel: true,
        patientTransferLog: true,
        gcsCalculator: true
      },

      triageCategories: [
        { level: 1, color: '#dc2626', label: 'حرج فوري', emoji: '🔴' },
        { level: 2, color: '#f97316', label: 'عاجل', emoji: '🟠' },
        { level: 3, color: '#f59e0b', label: 'أقل إلحاحاً', emoji: '🟡' },
        { level: 4, color: '#22c55e', label: 'روتيني', emoji: '🟢' },
        { level: 5, color: '#94a3b8', label: 'غير عاجل', emoji: '⚪' }
      ],

      commonLabs: [
        'CBC', 'Electrolytes', 'Troponin',
        'ABG', 'Glucose (POC)', 'Coagulation Profile',
        'Creatinine', 'Lactate', 'Blood Culture'
      ],

      commonDiagnoses: [
        { icd: 'R07.9', ar: 'ألم صدر غير محدد' },
        { icd: 'R06.0', ar: 'ضيق تنفس' },
        { icd: 'T14.9', ar: 'إصابة غير محددة' },
        { icd: 'R57',   ar: 'صدمة (Shock)' },
        { icd: 'R40.2', ar: 'غيبوبة' }
      ],

      billingCodes: [
        { code: 'ER-TRIAGE', ar: 'فرز طوارئ', defaultPrice: 15000 },
        { code: 'ER-EXAM', ar: 'كشفية طوارئ', defaultPrice: 30000 },
        { code: 'ER-SUTURE', ar: 'خياطة جرح', defaultPrice: 25000 }
      ],

      followUpRules: {
        discharge: { intervalDays: 2, message: 'مراجعة العيادة خلال 48 ساعة' }
      },

      specialModules: ['triage_module', 'resuscitation_module'],
      printTemplates: ['er_report', 'transfer_summary', 'discharge_instructions']
    },

    /* ═══ 23 — أمراض الدم والأورام ══════════════════════════════════ */
    hematology_oncology: {
      id: 'hematology_oncology',
      nameAr: 'أمراض الدم والأورام',
      nameEn: 'Hematology & Oncology',
      emoji: '🩸',
      color: '#9f1239',
      colorLight: _rgba('#9f1239', 0.1),
      description: 'تشخيص ومتابعة أمراض الدم والأورام وبروتوكولات العلاج الكيماوي',

      vitals: { show: ['temp', 'bp', 'hr', 'o2_sat', 'weight', 'height'], required: [] },

      quickComplaints: [
        'تعب شديد ووهن', 'شحوب', 'نزيف غير مبرر',
        'تضخم غدد لمفاوية', 'فقدان وزن غير مبرر',
        'حمى متكررة', 'كدمات سهلة', 'عرق ليلي'
      ],

      features: {
        cbcTrend: true,
        chemoProtocols: true,
        bsaCalculator: true,
        transfusionLog: true,
        stagingTracker: true
      },

      commonLabs: [
        'CBC with Differential', 'Peripheral Smear',
        'LDH', 'Ferritin', 'Coagulation Profile',
        'Bone Marrow Biopsy (عند الاستدعاء)', 'Flow Cytometry',
        'Beta-2 Microglobulin'
      ],

      commonDiagnoses: [
        { icd: 'D64',  ar: 'فقر دم غير محدد' },
        { icd: 'D50',  ar: 'فقر دم بعوز الحديد' },
        { icd: 'D70',  ar: 'نقص العدلات (Neutropenia)' },
        { icd: 'R59',  ar: 'تضخم الغدد اللمفاوية' },
        { icd: 'D69',  ar: 'اضطرابات النزف والفرفرية' }
      ],

      billingCodes: [
        { code: 'HEMA-EXAM', ar: 'كشفية أمراض دم', defaultPrice: 30000 },
        { code: 'HEMA-CHEMO', ar: 'جلسة علاج كيماوي', defaultPrice: 200000 },
        { code: 'HEMA-TRANS', ar: 'نقل دم (وحدة)', defaultPrice: 50000 }
      ],

      followUpRules: {
        chemo: { intervalDays: 21, message: 'دورة الكيماوي القادمة' },
        anemia: { intervalDays: 30, message: 'متابعة فقر الدم شهرياً' }
      },

      specialModules: ['cbc_trend_module', 'chemo_schedule_module'],
      printTemplates: ['hematology_report', 'chemo_protocol_sheet', 'transfusion_record']
    }

  }; /* ── END ARGON_SPECIALTIES ── */


  /* ══════════════════════════════════════════════════════════════════
   * PUBLIC API
   * ══════════════════════════════════════════════════════════════════ */

  /**
   * getSpecialtyConfig(specialtyId)
   * ─────────────────────────────
   * ⚠️ SAFETY ANCHOR: دائماً يرجع general_medicine كـ fallback.
   * لا يُغيّر DOM، لا يُفعّل وحدات، يرجع بيانات فقط.
   *
   * @param {string} specialtyId - معرف التخصص (اختياري)
   * @returns {Object} - إعدادات التخصص
   */
  function getSpecialtyConfig(specialtyId) {
    if (specialtyId && ARGON_SPECIALTIES[specialtyId]) {
      return ARGON_SPECIALTIES[specialtyId];
    }
    return ARGON_SPECIALTIES.general_medicine;
  }

  /**
   * getSpecialtyColors(specialtyId)
   * يرجع فقط لون التخصص + الخفيف — للاستخدام في CSS
   */
  function getSpecialtyColors(specialtyId) {
    var cfg = getSpecialtyConfig(specialtyId);
    return { color: cfg.color, colorLight: cfg.colorLight };
  }

  /**
   * getVitalsForSpecialty(specialtyId)
   * يرجع قائمة العلامات الحيوية للتخصص
   */
  function getVitalsForSpecialty(specialtyId) {
    var cfg = getSpecialtyConfig(specialtyId);
    return cfg.vitals || { show: ['temp', 'bp', 'hr', 'o2_sat'], required: [] };
  }

  /**
   * getFollowUpDate(specialtyId, ruleKey)
   * يحسب تاريخ المتابعة بناءً على قواعد التخصص
   * @returns {Date|null}
   */
  function getFollowUpDate(specialtyId, ruleKey) {
    var cfg = getSpecialtyConfig(specialtyId);
    var rules = cfg.followUpRules || {};
    var rule = rules[ruleKey] || rules.routine;
    if (!rule || !rule.intervalDays) return null;
    var d = new Date();
    d.setDate(d.getDate() + rule.intervalDays);
    return d;
  }

  /**
   * listSpecialties()
   * يرجع قائمة مبسطة لكل التخصصات (للعرض في Picker)
   */
  function listSpecialties() {
    return Object.values(ARGON_SPECIALTIES).map(function (s) {
      return {
        id: s.id,
        nameAr: s.nameAr,
        nameEn: s.nameEn,
        emoji: s.emoji,
        color: s.color,
        colorLight: s.colorLight,
        description: s.description
      };
    });
  }

  /**
   * getBillingCodes(specialtyId)
   * يرجع رموز الفوترة للتخصص
   */
  function getBillingCodes(specialtyId) {
    var cfg = getSpecialtyConfig(specialtyId);
    return cfg.billingCodes || [];
  }

  /**
   * hasFeature(specialtyId, featureName)
   * تحقق سريع: هل هذا التخصص يدعم ميزة معينة؟
   */
  function hasFeature(specialtyId, featureName) {
    var cfg = getSpecialtyConfig(specialtyId);
    return !!(cfg.features && cfg.features[featureName]);
  }


  /* ── التصدير للـ window ── */
  global.ARGON_SPECIALTIES         = ARGON_SPECIALTIES;
  global.getSpecialtyConfig        = getSpecialtyConfig;
  global.getSpecialtyColors        = getSpecialtyColors;
  global.getVitalsForSpecialty     = getVitalsForSpecialty;
  global.getFollowUpDate           = getFollowUpDate;
  global.listSpecialties           = listSpecialties;
  global.getBillingCodes           = getBillingCodes;
  global.hasFeature                = hasFeature;

  /* قائمة مبسطة جاهزة للـ UI */
  global.SPECIALTY_LIST_FOR_UI = listSpecialties();

  console.log(
    '%c🏥 ARGON Specialty Registry v2.0 — loaded (' +
    Object.keys(ARGON_SPECIALTIES).length +
    ' specialties, Phase 0: inert, zero UI impact)',
    'color:#0d9488;font-weight:bold'
  );

}(window));
