/**
 * 👶 ARGON MEDICAL OS — Growth Chart Module
 * specialty-modules/growth_chart_module.js — v1.0
 *
 * منحنيات النمو التفاعلية (WHO 2006/2007) + جدول التطعيمات الأردني +
 * مراحل التطور + حاسبة جرعات الأطفال
 *
 * الاستخدام:
 *   GrowthChartModule.render('containerId', patientId)
 *   GrowthChartModule.getLatestMeasurements()
 */

(function (global) {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════
   * WHO PERCENTILE DATA (P3, P15, P50, P85, P97)
   * Source: WHO Child Growth Standards 2006 / 2007
   * Key = age in months, Value = [P3, P15, P50, P85, P97]
   * ══════════════════════════════════════════════════════════════════ */
  var WHO_WEIGHT_BOYS = {
    0: [2.5, 2.9, 3.3, 3.9, 4.3],
    1: [3.2, 3.8, 4.5, 5.2, 5.7],
    2: [4.0, 4.7, 5.6, 6.4, 7.1],
    3: [4.9, 5.6, 6.4, 7.3, 8.0],
    4: [5.4, 6.2, 7.0, 8.0, 8.8],
    6: [6.4, 7.1, 7.9, 8.9, 9.7],
    9: [7.2, 8.0, 9.0, 10.2, 11.1],
    12: [8.1, 9.0, 9.9, 11.0, 11.9],
    18: [9.3, 10.2, 11.3, 12.5, 13.6],
    24: [10.3, 11.4, 12.5, 13.9, 15.1],
    36: [12.0, 13.2, 14.7, 16.3, 17.7],
    48: [13.5, 14.9, 16.7, 18.5, 20.2],
    60: [15.0, 16.6, 18.7, 20.9, 22.9]
  };

  var WHO_WEIGHT_GIRLS = {
    0: [2.3, 2.7, 3.2, 3.7, 4.2],
    1: [3.0, 3.5, 4.2, 5.0, 5.5],
    2: [3.8, 4.4, 5.1, 6.0, 6.6],
    3: [4.5, 5.2, 5.8, 6.7, 7.5],
    4: [4.9, 5.7, 6.4, 7.3, 8.2],
    6: [5.9, 6.7, 7.3, 8.4, 9.3],
    9: [6.6, 7.5, 8.2, 9.4, 10.5],
    12: [7.1, 8.0, 8.9, 10.2, 11.3],
    18: [8.4, 9.4, 10.5, 11.8, 13.0],
    24: [9.5, 10.5, 11.5, 13.0, 14.3],
    36: [11.2, 12.4, 13.9, 15.6, 17.3],
    48: [12.7, 14.1, 15.9, 17.9, 19.9],
    60: [14.2, 15.8, 17.9, 20.2, 22.5]
  };

  var WHO_HEIGHT_BOYS = {
    0: [46.3, 48.0, 49.9, 51.8, 53.4],
    1: [51.0, 52.8, 54.7, 56.6, 58.4],
    3: [57.6, 59.4, 61.4, 63.4, 65.3],
    6: [63.6, 65.5, 67.6, 69.7, 71.6],
    9: [68.3, 70.2, 72.3, 74.5, 76.5],
    12: [72.1, 74.0, 75.7, 77.7, 79.7],
    18: [78.2, 80.1, 82.3, 84.5, 86.6],
    24: [83.1, 85.3, 87.8, 90.3, 92.5],
    36: [90.6, 93.0, 96.1, 99.2, 102.0],
    48: [97.0, 99.8, 103.3, 106.8, 109.9],
    60: [103.2, 106.2, 110.0, 113.8, 117.1]
  };

  var WHO_HEIGHT_GIRLS = {
    0: [45.4, 47.1, 49.1, 51.1, 52.9],
    1: [50.0, 51.7, 53.7, 55.6, 57.4],
    3: [56.2, 58.0, 60.2, 62.2, 64.0],
    6: [61.8, 63.7, 65.7, 67.8, 69.8],
    9: [66.3, 68.2, 70.1, 72.2, 74.1],
    12: [70.0, 72.0, 74.0, 76.2, 78.1],
    18: [76.1, 78.2, 80.7, 83.2, 85.5],
    24: [81.2, 83.6, 86.4, 89.2, 91.8],
    36: [89.3, 91.9, 95.1, 98.2, 101.1],
    48: [96.0, 98.9, 102.7, 106.4, 109.9],
    60: [102.5, 105.6, 109.4, 113.3, 116.9]
  };

  /* ══════════════════════════════════════════════════════════════════
   * JORDAN MOH VACCINATION SCHEDULE 2024
   * ══════════════════════════════════════════════════════════════════ */
  var JORDAN_VACCINES = [
    { id: 'bcg',    ageLabel: 'عند الولادة',  vaccines: ['BCG', 'OPV-0', 'HepB-1'],              ageMonths: 0  },
    { id: 'hepb2',  ageLabel: 'شهر واحد',     vaccines: ['HepB-2'],                               ageMonths: 1  },
    { id: 'penta1', ageLabel: 'شهرين',         vaccines: ['Penta-1', 'OPV-1', 'PCV-1', 'Rota-1'], ageMonths: 2  },
    { id: 'penta2', ageLabel: 'أربعة أشهر',   vaccines: ['Penta-2', 'OPV-2', 'PCV-2', 'Rota-2'], ageMonths: 4  },
    { id: 'penta3', ageLabel: 'ستة أشهر',     vaccines: ['Penta-3', 'OPV-3', 'PCV-3', 'HepB-3'], ageMonths: 6  },
    { id: 'mmr1',   ageLabel: 'سنة',           vaccines: ['MMR-1', 'Varicella-1', 'HepA-1'],       ageMonths: 12 },
    { id: 'boost',  ageLabel: 'سنة ونصف',     vaccines: ['Penta-B', 'OPV-B', 'PCV-B'],            ageMonths: 18 },
    { id: 'school', ageLabel: 'ست سنوات',     vaccines: ['MMR-2', 'DT', 'OPV-4'],                 ageMonths: 72 }
  ];

  /* ══════════════════════════════════════════════════════════════════
   * DEVELOPMENTAL MILESTONES
   * ══════════════════════════════════════════════════════════════════ */
  var MILESTONES = [
    { id: 'm_soc_2',   ageMonths: 2,  domain: 'اجتماعي',   text: 'يبتسم اجتماعياً عند مخاطبته' },
    { id: 'm_mot_2',   ageMonths: 2,  domain: 'حركي',      text: 'يرفع رأسه عند الاستلقاء على بطنه' },
    { id: 'm_mot_4',   ageMonths: 4,  domain: 'حركي',      text: 'يدير رأسه نحو الأصوات' },
    { id: 'm_lan_4',   ageMonths: 4,  domain: 'لغوي',      text: 'يُصدر أصوات مناغاة (أووه، آه)' },
    { id: 'm_mot_6_1', ageMonths: 6,  domain: 'حركي',      text: 'يجلس بمساعدة خفيفة' },
    { id: 'm_mot_6_2', ageMonths: 6,  domain: 'حركي',      text: 'يمسك الألعاب بكلتا اليدين' },
    { id: 'm_mot_9_1', ageMonths: 9,  domain: 'حركي',      text: 'يجلس وحده بثبات' },
    { id: 'm_mot_9_2', ageMonths: 9,  domain: 'حركي',      text: 'إمساك الإبهام-السبابة (Pincer Grasp)' },
    { id: 'm_soc_9',   ageMonths: 9,  domain: 'اجتماعي',   text: 'يخشى الغرباء (Stranger Anxiety)' },
    { id: 'm_mot_12',  ageMonths: 12, domain: 'حركي',      text: 'يمشي بمساعدة أو يقف وحده' },
    { id: 'm_lan_12',  ageMonths: 12, domain: 'لغوي',      text: 'يقول كلمة أو كلمتين بمعنى (ماما/بابا)' },
    { id: 'm_mot_18',  ageMonths: 18, domain: 'حركي',      text: 'يمشي وحده بثبات' },
    { id: 'm_lan_18',  ageMonths: 18, domain: 'لغوي',      text: 'يقول 6-20 كلمة' },
    { id: 'm_lan_24',  ageMonths: 24, domain: 'لغوي',      text: 'جملة من كلمتين (ماما جاءت)' },
    { id: 'm_mot_24',  ageMonths: 24, domain: 'حركي',      text: 'يصعد ويهبط الدرج بمساعدة' },
    { id: 'm_lan_36',  ageMonths: 36, domain: 'لغوي',      text: 'جمل من 3 كلمات، غرباء يفهمونه' },
    { id: 'm_mot_36',  ageMonths: 36, domain: 'حركي',      text: 'يركب دراجة ثلاثية العجلات' },
    { id: 'm_lan_48',  ageMonths: 48, domain: 'لغوي',      text: 'يحكي قصصاً بسيطة' },
    { id: 'm_cog_60',  ageMonths: 60, domain: 'معرفي',     text: 'يعرف الألوان والأرقام 1-10' }
  ];

  /* ══════════════════════════════════════════════════════════════════
   * COMMON PEDIATRIC DRUG DOSES
   * ══════════════════════════════════════════════════════════════════ */
  var PEDIATRIC_DOSES = [
    { name: 'Paracetamol',  dosePerKg: 15,  max: 75,  unit: 'mg/kg/dose', freq: 'كل 4-6 ساعات', note: 'جرعة قصوى 1000mg' },
    { name: 'Ibuprofen',    dosePerKg: 10,  max: 40,  unit: 'mg/kg/dose', freq: 'كل 6-8 ساعات', note: 'لا تُعطَ لأقل من 6 أشهر' },
    { name: 'Amoxicillin',  dosePerKg: 50,  max: 3000, unit: 'mg/kg/day', freq: 'مقسم 3 جرعات', note: 'التهابات الجهاز التنفسي' },
    { name: 'Amoxicillin-Clav', dosePerKg: 45, max: 3000, unit: 'mg/kg/day', freq: 'مقسم 2 جرعات', note: 'Augmentin' },
    { name: 'Azithromycin', dosePerKg: 10,  max: 500,  unit: 'mg/kg/day', freq: 'مرة واحدة يومياً', note: 'لمدة 3-5 أيام' },
    { name: 'Cetirizine',   dosePerKg: 0.25, max: 10,  unit: 'mg/kg/dose', freq: 'مرة يومياً', note: '2-5 سنة: 2.5mg، >6 سنوات: 5-10mg' },
    { name: 'Salbutamol',   dosePerKg: 0.1,  max: 5,   unit: 'mg/kg/dose', freq: 'كل 4-6 ساعات', note: 'نيبولايزر أو بخاخ' },
    { name: 'ORS',          dosePerKg: 75,   max: null, unit: 'ml/kg', freq: 'خلال 4 ساعات', note: 'لعلاج التجفيف الخفيف-المتوسط' }
  ];

  /* ══════════════════════════════════════════════════════════════════
   * MODULE STATE
   * ══════════════════════════════════════════════════════════════════ */
  var _measurements = [];
  var _vaccinations = {};
  var _milestonesStatus = {};
  var _currentPatientId = null;
  var _containerId = null;
  var _activeTab = 'growth';

  /* ══════════════════════════════════════════════════════════════════
   * 1. RENDER — نقطة الدخول
   * ══════════════════════════════════════════════════════════════════ */
  function render(containerId, patientId) {
    _containerId = containerId;
    _currentPatientId = patientId;

    var container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted)">' +
      '<i class="fas fa-circle-notch fa-spin" style="color:var(--green);font-size:1.5rem"></i>' +
      '<p style="margin-top:10px">جاري تحميل بيانات النمو والتطعيمات...</p></div>';

    _loadData(patientId).then(function (data) {
      _measurements = data.measurements || [];
      _vaccinations = data.vaccinations || {};
      _milestonesStatus = data.milestones || {};
      container.innerHTML = _buildMainHTML();
      _attachStyles();
      _switchTab(_activeTab);
    }).catch(function () {
      _measurements = [];
      _vaccinations = {};
      _milestonesStatus = {};
      container.innerHTML = _buildMainHTML();
      _attachStyles();
      _switchTab(_activeTab);
    });
  }

  /* ══════════════════════════════════════════════════════════════════
   * 2. MAIN HTML BUILDER
   * ══════════════════════════════════════════════════════════════════ */
  function _buildMainHTML() {
    return [
      '<div class="argon-growth-module" style="font-family:\'Tajawal\',sans-serif">',

      /* Tabs */
      '<div style="display:flex;gap:6px;border-bottom:1px solid var(--border);',
        'padding-bottom:10px;margin-bottom:16px;overflow-x:auto">',
        _tabBtn('growth',       '📈 منحنيات النمو',      'fa-chart-line'),
        _tabBtn('add',          '➕ إضافة قياس',          'fa-plus-circle'),
        _tabBtn('vaccination',  '💉 التطعيمات',           'fa-syringe'),
        _tabBtn('milestones',   '🧸 مراحل التطور',        'fa-child'),
        _tabBtn('dosing',       '💊 حاسبة الجرعات',       'fa-calculator'),
      '</div>',

      /* Tab Contents */
      '<div id="_gcTab-growth">',     _buildGrowthChartsTab(),  '</div>',
      '<div id="_gcTab-add">',        _buildAddMeasurementTab(), '</div>',
      '<div id="_gcTab-vaccination">', _buildVaccinationTab(),   '</div>',
      '<div id="_gcTab-milestones">', _buildMilestonesTab(),    '</div>',
      '<div id="_gcTab-dosing">',     _buildDosingTab(),         '</div>',

      '</div>'
    ].join('');
  }

  function _tabBtn(id, label, icon) {
    return [
      '<button id="_gcTabBtn-', id, '" ',
        'onclick="GrowthChartModule.switchTab(\'', id, '\')" ',
        'style="padding:7px 14px;border-radius:8px;border:1px solid var(--border);',
        'background:var(--surf);color:var(--muted);font-family:\'Tajawal\',sans-serif;',
        'font-weight:700;font-size:0.8rem;cursor:pointer;white-space:nowrap;',
        'display:inline-flex;align-items:center;gap:6px;transition:all 0.2s">',
        '<i class="fas ', icon, '"></i>', label,
      '</button>'
    ].join('');
  }

  /* ══════════════════════════════════════════════════════════════════
   * 3. GROWTH CHARTS TAB
   * ══════════════════════════════════════════════════════════════════ */
  function _buildGrowthChartsTab() {
    if (!_measurements.length) {
      return [
        '<div style="text-align:center;padding:40px;color:var(--muted)">',
          '<i class="fas fa-chart-line" style="font-size:2.5rem;opacity:0.2;display:block;margin-bottom:12px"></i>',
          '<p>لا يوجد قياسات مسجلة بعد</p>',
          '<p style="font-size:0.8rem;margin-top:6px">اذهب إلى تبويب <b>إضافة قياس</b> لتسجيل أول قياس</p>',
        '</div>'
      ].join('');
    }

    /* احسب الـ percentiles لآخر قياس */
    var latest = _measurements[_measurements.length - 1];
    var patient = _getPatientInfo();
    var ageMonths = _calcAgeMonths(patient.dob);
    var gender = patient.gender || 'ذكر';
    var weightPerc = _calcPercentile(latest.weight, ageMonths, gender, 'weight');
    var heightPerc = _calcPercentile(latest.height, ageMonths, gender, 'height');

    var rows = _measurements.slice().reverse().map(function (m) {
      return [
        '<tr>',
          '<td style="padding:10px;border-bottom:1px solid var(--border);font-weight:700">', m.date, '</td>',
          '<td style="padding:10px;border-bottom:1px solid var(--border);text-align:center;color:var(--teal);font-weight:700">',
            m.weight ? m.weight + ' kg' : '—',
          '</td>',
          '<td style="padding:10px;border-bottom:1px solid var(--border);text-align:center;color:var(--sky);font-weight:700">',
            m.height ? m.height + ' cm' : '—',
          '</td>',
          '<td style="padding:10px;border-bottom:1px solid var(--border);text-align:center">',
            m.headCirc ? m.headCirc + ' cm' : '—',
          '</td>',
          '<td style="padding:10px;border-bottom:1px solid var(--border);text-align:center">',
            m.weight && m.height ? _calcBMI(m.weight, m.height) : '—',
          '</td>',
          '<td style="padding:10px;border-bottom:1px solid var(--border);text-align:center;font-size:0.75rem;color:var(--muted)">',
            m.notes || '—',
          '</td>',
        '</tr>'
      ].join('');
    }).join('');

    return [
      /* Current Status Cards */
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px">',
        _statusCard('⚖️', 'الوزن الحالي', latest.weight ? latest.weight + ' kg' : '—',
          weightPerc ? 'الـ P' + weightPerc : '', 'var(--teal)'),
        _statusCard('📏', 'الطول الحالي', latest.height ? latest.height + ' cm' : '—',
          heightPerc ? 'الـ P' + heightPerc : '', 'var(--sky)'),
        _statusCard('🔵', 'محيط الرأس', latest.headCirc ? latest.headCirc + ' cm' : '—', '', 'var(--purple)'),
        _statusCard('🧮', 'مؤشر كتلة الجسم', (latest.weight && latest.height) ? _calcBMI(latest.weight, latest.height) : '—',
          _bmiCategory(_calcBMI(latest.weight, latest.height)), 'var(--amber)'),
      '</div>',

      /* WHO Percentile Reference */
      '<div style="padding:10px 14px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.2);',
        'border-radius:10px;margin-bottom:14px;font-size:0.78rem;color:var(--green)">',
        '<i class="fas fa-info-circle"></i> <b>معايير WHO 2006:</b> ',
        'الـ P50 يمثل متوسط الأطفال الأصحاء. ',
        'القيم بين P15-P85 طبيعية. ',
        'أقل من P3 أو فوق P97 تستدعي تقييماً.&nbsp;',
        '<b>جنس المريض: ', gender, '</b>',
      '</div>',

      /* Measurements History Table */
      '<div style="overflow-x:auto">',
        '<table style="width:100%;border-collapse:collapse;font-size:0.85rem">',
          '<thead><tr style="background:rgba(255,255,255,0.03)">',
            '<th style="padding:10px;text-align:right;border-bottom:2px solid var(--border)">التاريخ</th>',
            '<th style="padding:10px;text-align:center;border-bottom:2px solid var(--border);color:var(--teal)">الوزن</th>',
            '<th style="padding:10px;text-align:center;border-bottom:2px solid var(--border);color:var(--sky)">الطول</th>',
            '<th style="padding:10px;text-align:center;border-bottom:2px solid var(--border)">محيط الرأس</th>',
            '<th style="padding:10px;text-align:center;border-bottom:2px solid var(--border)">BMI</th>',
            '<th style="padding:10px;text-align:center;border-bottom:2px solid var(--border)">ملاحظة</th>',
          '</tr></thead>',
          '<tbody>', rows, '</tbody>',
        '</table>',
      '</div>'
    ].join('');
  }

  function _statusCard(emoji, label, value, sub, color) {
    return [
      '<div style="padding:12px;border:1px solid var(--border);border-radius:10px;',
        'background:rgba(255,255,255,0.02);text-align:center">',
        '<div style="font-size:1.4rem">', emoji, '</div>',
        '<div style="font-size:0.7rem;color:var(--muted);margin:3px 0">', label, '</div>',
        '<div style="font-size:1.1rem;font-weight:900;color:', color, '">', value, '</div>',
        sub ? '<div style="font-size:0.68rem;color:var(--muted);margin-top:2px">' + sub + '</div>' : '',
      '</div>'
    ].join('');
  }

  /* ══════════════════════════════════════════════════════════════════
   * 4. ADD MEASUREMENT TAB
   * ══════════════════════════════════════════════════════════════════ */
  function _buildAddMeasurementTab() {
    return [
      '<div style="max-width:500px">',
        '<div style="font-size:0.95rem;font-weight:800;color:var(--green);margin-bottom:14px">',
          '📏 تسجيل قياس نمو جديد',
        '</div>',

        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">',
          '<div class="fg">',
            '<label style="font-size:0.78rem;color:var(--muted)">تاريخ القياس</label>',
            '<input type="date" id="_gc-date" class="fi" value="' + new Date().toISOString().split('T')[0] + '">',
          '</div>',
          '<div class="fg">',
            '<label style="font-size:0.78rem;color:var(--muted)">الوزن (kg) *</label>',
            '<input type="number" id="_gc-weight" class="fi" placeholder="مثال: 7.5" step="0.1" dir="ltr"',
              'oninput="GrowthChartModule.liveCalc()">',
          '</div>',
          '<div class="fg">',
            '<label style="font-size:0.78rem;color:var(--muted)">الطول/الطول (cm)</label>',
            '<input type="number" id="_gc-height" class="fi" placeholder="مثال: 68" step="0.1" dir="ltr"',
              'oninput="GrowthChartModule.liveCalc()">',
          '</div>',
          '<div class="fg">',
            '<label style="font-size:0.78rem;color:var(--muted)">محيط الرأس (cm) — حتى 3 سنوات</label>',
            '<input type="number" id="_gc-head" class="fi" placeholder="مثال: 42" step="0.1" dir="ltr">',
          '</div>',
        '</div>',

        /* Live BMI Display */
        '<div id="_gc-bmi-live" style="padding:8px 12px;background:rgba(16,185,129,0.08);',
          'border:1px solid rgba(16,185,129,0.2);border-radius:8px;margin-bottom:12px;',
          'font-size:0.8rem;color:var(--green);font-weight:700;display:none">',
        '</div>',

        '<div class="fg" style="margin-bottom:16px">',
          '<label style="font-size:0.78rem;color:var(--muted)">ملاحظة</label>',
          '<input type="text" id="_gc-note" class="fi" placeholder="مثال: فحص دوري شهر 6، طفل نشيط">',
        '</div>',

        '<button onclick="GrowthChartModule.addMeasurement()" ',
          'style="width:100%;padding:12px;background:var(--green);color:#fff;border:none;',
          'border-radius:10px;font-family:\'Tajawal\',sans-serif;font-weight:800;',
          'cursor:pointer;font-size:0.95rem">',
          '<i class="fas fa-plus-circle"></i> إضافة القياس وحفظه',
        '</button>',
      '</div>'
    ].join('');
  }

  /* ══════════════════════════════════════════════════════════════════
   * 5. VACCINATION TAB
   * ══════════════════════════════════════════════════════════════════ */
  function _buildVaccinationTab() {
    var patient = _getPatientInfo();
    var ageMonths = _calcAgeMonths(patient.dob);

    var rows = JORDAN_VACCINES.map(function (milestone) {
      var isDue = ageMonths >= milestone.ageMonths;
      var isNext = ageMonths < milestone.ageMonths && ageMonths >= (milestone.ageMonths - 2);
      var isTaken = _vaccinations[milestone.id] && _vaccinations[milestone.id].taken;

      var statusBadge, statusColor, rowBg;
      if (isTaken) {
        statusBadge = '✅ مأخوذ';
        statusColor = 'var(--green)';
        rowBg = 'rgba(16,185,129,0.04)';
      } else if (isNext) {
        statusBadge = '⏰ قريباً';
        statusColor = 'var(--amber)';
        rowBg = 'rgba(245,158,11,0.06)';
      } else if (isDue) {
        statusBadge = '⚠️ متأخر';
        statusColor = 'var(--red)';
        rowBg = 'rgba(239,68,68,0.04)';
      } else {
        statusBadge = '📅 قادم';
        statusColor = 'var(--muted)';
        rowBg = '';
      }

      var takenDate = isTaken && _vaccinations[milestone.id].date ? _vaccinations[milestone.id].date : '';

      return [
        '<tr style="background:', rowBg, '">',
          '<td style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:700">',
            milestone.ageLabel,
          '</td>',
          '<td style="padding:10px 12px;border-bottom:1px solid var(--border)">',
            '<div style="display:flex;flex-wrap:wrap;gap:4px">',
              milestone.vaccines.map(function (v) {
                return '<span style="background:rgba(14,165,233,0.1);color:var(--sky);' +
                  'padding:2px 6px;border-radius:4px;font-size:0.72rem;font-weight:700">' + v + '</span>';
              }).join(''),
            '</div>',
          '</td>',
          '<td style="padding:10px 12px;border-bottom:1px solid var(--border);text-align:center">',
            '<span style="color:', statusColor, ';font-weight:800;font-size:0.8rem">', statusBadge, '</span>',
            takenDate ? '<div style="font-size:0.68rem;color:var(--muted);margin-top:2px">' + takenDate + '</div>' : '',
          '</td>',
          '<td style="padding:10px 12px;border-bottom:1px solid var(--border);text-align:center">',
            isTaken ? '' : [
              '<button onclick="GrowthChartModule.markVaccine(\'', milestone.id, '\')" ',
                'style="padding:4px 10px;background:rgba(16,185,129,0.1);color:var(--green);',
                'border:1px solid rgba(16,185,129,0.3);border-radius:6px;font-family:\'Tajawal\',sans-serif;',
                'font-weight:700;cursor:pointer;font-size:0.72rem">',
                '<i class="fas fa-check"></i> تسجيل',
              '</button>'
            ].join(''),
          '</td>',
        '</tr>'
      ].join('');
    }).join('');

    var completedCount = Object.values(_vaccinations).filter(function (v) { return v.taken; }).length;
    var totalCount = JORDAN_VACCINES.length;

    return [
      /* Header */
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">',
        '<div>',
          '<div style="font-size:0.95rem;font-weight:800;color:var(--sky)">💉 جدول التطعيمات — وزارة الصحة الأردنية 2024</div>',
          '<div style="font-size:0.75rem;color:var(--muted);margin-top:2px">',
            'مكتمل: ', completedCount, ' / ', totalCount,
            ' | عمر الطفل التقريبي: ', ageMonths > 0 ? ageMonths + ' شهر' : 'غير محدد',
          '</div>',
        '</div>',
      '</div>',

      /* Progress Bar */
      '<div style="height:6px;background:var(--border);border-radius:3px;margin-bottom:14px;overflow:hidden">',
        '<div style="height:100%;width:', Math.round((completedCount / totalCount) * 100), '%;',
          'background:var(--green);border-radius:3px;transition:width 0.5s"></div>',
      '</div>',

      /* Table */
      '<div style="overflow-x:auto">',
        '<table style="width:100%;border-collapse:collapse;font-size:0.85rem">',
          '<thead><tr style="background:rgba(255,255,255,0.03)">',
            '<th style="padding:10px;text-align:right;border-bottom:2px solid var(--border)">العمر</th>',
            '<th style="padding:10px;text-align:right;border-bottom:2px solid var(--border)">المطاعيم</th>',
            '<th style="padding:10px;text-align:center;border-bottom:2px solid var(--border)">الحالة</th>',
            '<th style="padding:10px;text-align:center;border-bottom:2px solid var(--border)">إجراء</th>',
          '</tr></thead>',
          '<tbody>', rows, '</tbody>',
        '</table>',
      '</div>'
    ].join('');
  }

  /* ══════════════════════════════════════════════════════════════════
   * 6. MILESTONES TAB
   * ══════════════════════════════════════════════════════════════════ */
  function _buildMilestonesTab() {
    var patient = _getPatientInfo();
    var ageMonths = _calcAgeMonths(patient.dob);

    var domainColors = {
      'حركي': 'var(--teal)',
      'لغوي': 'var(--sky)',
      'اجتماعي': 'var(--purple)',
      'معرفي': 'var(--amber)'
    };

    /* اعرض فقط المراحل المناسبة لعمر الطفل (± 3 أشهر) */
    var relevantMilestones = MILESTONES.filter(function (m) {
      return m.ageMonths <= ageMonths + 3;
    });

    if (!relevantMilestones.length) {
      return '<div style="text-align:center;padding:40px;color:var(--muted)">' +
        '<p>أدخل تاريخ ميلاد الطفل في ملف المريض لعرض المراحل المناسبة لعمره.</p></div>';
    }

    var items = relevantMilestones.map(function (m) {
      var docStatus = _milestonesStatus[m.id];
      var isAchievedByAge = ageMonths > m.ageMonths + 2;
      var isCurrentByAge = ageMonths >= m.ageMonths && ageMonths <= m.ageMonths + 2;
      var domColor = domainColors[m.domain] || 'var(--muted)';

      var icon, opacity;
      if (docStatus === 'pass') { icon = '✅'; opacity = '1'; }
      else if (docStatus === 'fail') { icon = '⚠️'; opacity = '1'; }
      else if (isAchievedByAge) { icon = '✅'; opacity = '0.8'; }
      else if (isCurrentByAge) { icon = '🔔'; opacity = '1'; }
      else { icon = '⏳'; opacity = '0.5'; }

      var isPass = docStatus === 'pass';
      var isFail = docStatus === 'fail';

      return [
        '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;',
          'border-radius:8px;border:1px solid ', isFail ? 'rgba(239,68,68,0.3)' : 'var(--border)', ';margin-bottom:6px;',
          'opacity:', opacity, ';background:', isFail ? 'rgba(239,68,68,0.05)' : (isPass ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.01)'), '">',
          '<div style="font-size:1.2rem;flex-shrink:0;margin-top:1px;width:24px;text-align:center">', icon, '</div>',
          '<div style="flex:1">',
            '<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">',
              '<span style="font-size:0.68rem;padding:2px 7px;border-radius:10px;',
                'background:', domColor + '20', ';color:', domColor, ';font-weight:800">',
                m.domain,
              '</span>',
              '<span style="font-size:0.68rem;color:var(--muted)">عند ', m.ageMonths, ' شهر</span>',
            '</div>',
            '<div style="font-size:0.85rem;font-weight:600;color:', isFail ? 'var(--red)' : 'var(--text)', '">', m.text, '</div>',
          '</div>',
          '<div style="display:flex;gap:4px">',
            '<button onclick="GrowthChartModule.markMilestone(\'', m.id, '\', \'pass\')" title="تأكيد تطور طبيعي"',
              'style="padding:4px 8px;border-radius:6px;cursor:pointer;font-size:0.75rem;border:none;font-family:\'Tajawal\',sans-serif;font-weight:700;transition:0.2s;',
              isPass ? 'background:var(--green);color:white;' : 'background:rgba(16,185,129,0.1);color:var(--green);', '">',
              'طبيعي',
            '</button>',
            '<button onclick="GrowthChartModule.markMilestone(\'', m.id, '\', \'fail\')" title="تأكيد تأخر أو مشكلة"',
              'style="padding:4px 8px;border-radius:6px;cursor:pointer;font-size:0.75rem;border:none;font-family:\'Tajawal\',sans-serif;font-weight:700;transition:0.2s;',
              isFail ? 'background:var(--red);color:white;' : 'background:rgba(239,68,68,0.1);color:var(--red);', '">',
              'تأخر',
            '</button>',
          '</div>',
        '</div>'
      ].join('');
    }).join('');

    return [
      '<div style="font-size:0.95rem;font-weight:800;color:var(--purple);margin-bottom:12px">',
        '🧸 مراحل النمو والتطور المتوقعة — عمر: ', ageMonths > 0 ? ageMonths + ' شهر' : 'غير محدد',
      '</div>',

      /* Domain Legend */
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">',
        Object.entries(domainColors).map(function (e) {
          return '<span style="font-size:0.7rem;padding:2px 8px;border-radius:8px;' +
            'background:' + e[1] + '15;color:' + e[1] + ';font-weight:700">' + e[0] + '</span>';
        }).join(''),
      '</div>',

      '<div style="max-height:400px;overflow-y:auto;padding-left:4px">', items, '</div>'
    ].join('');
  }

  /* ══════════════════════════════════════════════════════════════════
   * 7. DOSING CALCULATOR TAB
   * ══════════════════════════════════════════════════════════════════ */
  function _buildDosingTab() {
    var patient = _getPatientInfo();
    var latestWeight = _measurements.length ? _measurements[_measurements.length - 1].weight : null;

    var drugOptions = PEDIATRIC_DOSES.map(function (d) {
      return '<option value="' + d.name + '">' + d.name + '</option>';
    }).join('');

    return [
      '<div style="font-size:0.95rem;font-weight:800;color:var(--amber);margin-bottom:14px">',
        '💊 حاسبة جرعات الأطفال — بناءً على الوزن',
      '</div>',

      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">',
        '<div class="fg">',
          '<label style="font-size:0.78rem;color:var(--muted)">وزن الطفل (kg)</label>',
          '<input type="number" id="_dose-weight" class="fi" step="0.1" dir="ltr" ',
            'value="', (latestWeight || ''), '" placeholder="أدخل الوزن">',
        '</div>',
        '<div class="fg">',
          '<label style="font-size:0.78rem;color:var(--muted)">الدواء</label>',
          '<select id="_dose-drug" class="fi" onchange="GrowthChartModule.calcDose()">',
            '<option value="">— اختر الدواء —</option>',
            drugOptions,
          '</select>',
        '</div>',
      '</div>',

      '<button onclick="GrowthChartModule.calcDose()" ',
        'style="width:100%;padding:10px;background:var(--amber);color:#fff;border:none;',
        'border-radius:8px;font-family:\'Tajawal\',sans-serif;font-weight:800;',
        'cursor:pointer;margin-bottom:14px">',
        '<i class="fas fa-calculator"></i> احسب الجرعة',
      '</button>',

      '<div id="_dose-result"></div>',

      /* Drug Reference Table */
      '<div style="margin-top:16px;font-size:0.8rem;font-weight:700;color:var(--muted);margin-bottom:8px">',
        '📋 جدول الجرعات المرجعي:',
      '</div>',
      '<div style="overflow-x:auto">',
        '<table style="width:100%;border-collapse:collapse;font-size:0.75rem">',
          '<thead><tr style="background:rgba(255,255,255,0.03)">',
            '<th style="padding:8px;text-align:right;border-bottom:1px solid var(--border)">الدواء</th>',
            '<th style="padding:8px;text-align:center;border-bottom:1px solid var(--border)">الجرعة</th>',
            '<th style="padding:8px;text-align:center;border-bottom:1px solid var(--border)">التكرار</th>',
            '<th style="padding:8px;text-align:right;border-bottom:1px solid var(--border)">ملاحظة</th>',
          '</tr></thead>',
          '<tbody>',
            PEDIATRIC_DOSES.map(function (d) {
              return [
                '<tr>',
                  '<td style="padding:8px;border-bottom:1px solid var(--border);font-weight:700">', d.name, '</td>',
                  '<td style="padding:8px;border-bottom:1px solid var(--border);text-align:center;',
                    'font-family:monospace;color:var(--teal)">', d.dosePerKg, ' ', d.unit, '</td>',
                  '<td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">', d.freq, '</td>',
                  '<td style="padding:8px;border-bottom:1px solid var(--border);font-size:0.7rem;color:var(--muted)">', d.note, '</td>',
                '</tr>'
              ].join('');
            }).join(''),
          '</tbody>',
        '</table>',
      '</div>'
    ].join('');
  }

  /* ══════════════════════════════════════════════════════════════════
   * 8. PUBLIC ACTIONS
   * ══════════════════════════════════════════════════════════════════ */
  function addMeasurement() {
    var dateVal   = document.getElementById('_gc-date');
    var weightVal = document.getElementById('_gc-weight');
    var heightVal = document.getElementById('_gc-height');
    var headVal   = document.getElementById('_gc-head');
    var noteVal   = document.getElementById('_gc-note');

    if (!dateVal || !weightVal || !weightVal.value.trim()) {
      if (typeof window.toast === 'function') window.toast('⚠️ يرجى إدخال التاريخ والوزن على الأقل', 'err');
      return;
    }

    var weight = parseFloat(weightVal.value);
    if (isNaN(weight) || weight <= 0 || weight > 200) {
      if (typeof window.toast === 'function') window.toast('⚠️ وزن غير منطقي — يرجى التحقق', 'err');
      return;
    }

    var newMeasurement = {
      date:     dateVal.value,
      weight:   weight,
      height:   heightVal && heightVal.value ? parseFloat(heightVal.value) : null,
      headCirc: headVal && headVal.value ? parseFloat(headVal.value) : null,
      notes:    noteVal ? noteVal.value.trim() : '',
      recordedAt: new Date().toISOString()
    };

    _measurements.push(newMeasurement);

    /* حفظ في Firebase */
    if (typeof db !== 'undefined' && typeof BASE !== 'undefined' && _currentPatientId) {
      db.ref(BASE + '/patients/' + _currentPatientId + '/specialty_data/pediatrics/growth_records').push(newMeasurement)
        .then(function () {
          if (typeof window.toast === 'function') window.toast('✅ تم حفظ قياس النمو بنجاح', 'ok');
        })
        .catch(function (e) {
          if (typeof window.toast === 'function') window.toast('❌ خطأ في الحفظ: ' + e.message, 'err');
        });
    } else {
      if (typeof window.toast === 'function') window.toast('✅ تم إضافة القياس محلياً', 'ok');
    }

    /* انتقل لتبويب النمو وأعد العرض */
    _activeTab = 'growth';
    var container = document.getElementById(_containerId);
    if (container) {
      container.innerHTML = _buildMainHTML();
      _attachStyles();
      _switchTab('growth');
    }
  }

  function markVaccine(milestoneId) {
    var today = new Date().toISOString().split('T')[0];
    _vaccinations[milestoneId] = { taken: true, date: today };

    /* حفظ في Firebase */
    if (typeof db !== 'undefined' && typeof BASE !== 'undefined' && _currentPatientId) {
      db.ref(BASE + '/patients/' + _currentPatientId + '/specialty_data/pediatrics/vaccinations/' + milestoneId)
        .set({ taken: true, date: today })
        .then(function () {
          if (typeof window.toast === 'function') {
            var milestone = JORDAN_VACCINES.find(function (v) { return v.id === milestoneId; });
            window.toast('💉 تم تسجيل مطعوم ' + (milestone ? milestone.ageLabel : milestoneId), 'ok');
          }
          /* أعد رسم تبويب التطعيمات */
          var tabContent = document.getElementById('_gcTab-vaccination');
          if (tabContent) tabContent.innerHTML = _buildVaccinationTab();
        });
    }
  }

  function markMilestone(milestoneId, status) {
    if (_milestonesStatus[milestoneId] === status) {
      delete _milestonesStatus[milestoneId];
      status = null;
    } else {
      _milestonesStatus[milestoneId] = status;
    }

    if (typeof db !== 'undefined' && typeof BASE !== 'undefined' && _currentPatientId) {
      var ref = db.ref(BASE + '/patients/' + _currentPatientId + '/specialty_data/pediatrics/milestones/' + milestoneId);
      if (status === null) {
        ref.remove();
      } else {
        ref.set(status);
      }
    }

    var tabContent = document.getElementById('_gcTab-milestones');
    if (tabContent) tabContent.innerHTML = _buildMilestonesTab();
  }

  function calcDose() {
    var weightEl = document.getElementById('_dose-weight');
    var drugEl   = document.getElementById('_dose-drug');
    var resultEl = document.getElementById('_dose-result');
    if (!weightEl || !drugEl || !resultEl) return;

    var weight = parseFloat(weightEl.value);
    var drugName = drugEl.value;

    if (!weight || !drugName) {
      resultEl.innerHTML = '';
      return;
    }

    var drug = PEDIATRIC_DOSES.find(function (d) { return d.name === drugName; });
    if (!drug) return;

    var dose = drug.dosePerKg * weight;
    var maxDose = drug.max;
    var isCapped = maxDose && dose > maxDose;
    var finalDose = isCapped ? maxDose : dose;

    resultEl.innerHTML = [
      '<div style="padding:14px;border-radius:10px;',
        isCapped ? 'background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3)' :
                   'background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3)', '">',
        '<div style="font-size:1rem;font-weight:900;color:', isCapped ? 'var(--amber)' : 'var(--green)', ';margin-bottom:6px">',
          '<i class="fas fa-pills"></i> ', drug.name,
        '</div>',
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.82rem">',
          '<div>',
            '<span style="color:var(--muted)">الجرعة المحسوبة:</span><br>',
            '<b style="font-size:1.1rem">', dose.toFixed(1), ' mg</b>',
          '</div>',
          '<div>',
            '<span style="color:var(--muted)">الجرعة الفعلية:</span><br>',
            '<b style="font-size:1.1rem;color:', isCapped ? 'var(--amber)' : 'var(--green)', '">',
              finalDose.toFixed(1), ' mg',
              isCapped ? ' ⚠️ (محدودة)' : ' ✅',
            '</b>',
          '</div>',
          '<div><span style="color:var(--muted)">التكرار:</span><br><b>', drug.freq, '</b></div>',
          '<div><span style="color:var(--muted)">الجرعة اليومية:</span><br><b>', (drug.unit.includes('day') ? finalDose.toFixed(1) + ' mg/day' : '—'), '</b></div>',
        '</div>',
        isCapped ? '<div style="margin-top:8px;font-size:0.75rem;color:var(--amber)">⚠️ الجرعة القصوى: ' + maxDose + ' mg</div>' : '',
        '<div style="margin-top:6px;font-size:0.72rem;color:var(--muted)"><i class="fas fa-info-circle"></i> ', drug.note, '</div>',
        '<div style="margin-top:8px;padding:8px;background:rgba(239,68,68,0.06);border-radius:6px;',
          'font-size:0.72rem;color:var(--red)">',
          '<i class="fas fa-shield-alt"></i> الجرعات للاسترشاد فقط — تأكد دائماً من نشرة الدواء ومع الصيدلاني.',
        '</div>',
      '</div>'
    ].join('');
  }

  function liveCalc() {
    var wEl = document.getElementById('_gc-weight');
    var hEl = document.getElementById('_gc-height');
    var bmiEl = document.getElementById('_gc-bmi-live');
    if (!wEl || !hEl || !bmiEl) return;

    var w = parseFloat(wEl.value);
    var h = parseFloat(hEl.value) / 100;
    if (!w || !h || h <= 0) { bmiEl.style.display = 'none'; return; }

    var bmi = (w / (h * h)).toFixed(1);
    var cat = _bmiCategory(bmi);
    bmiEl.style.display = 'block';
    bmiEl.innerHTML = '<i class="fas fa-calculator"></i> BMI المحسوب: <b>' + bmi + '</b> — ' + cat;
  }

  /* ══════════════════════════════════════════════════════════════════
   * 9. TAB SWITCHER
   * ══════════════════════════════════════════════════════════════════ */
  function _switchTab(tabId) {
    _activeTab = tabId;
    var tabs = ['growth', 'add', 'vaccination', 'milestones', 'dosing'];
    tabs.forEach(function (t) {
      var content = document.getElementById('_gcTab-' + t);
      var btn = document.getElementById('_gcTabBtn-' + t);
      if (content) content.style.display = (t === tabId) ? 'block' : 'none';
      if (btn) {
        if (t === tabId) {
          btn.style.background = 'rgba(16,185,129,0.1)';
          btn.style.color = 'var(--green)';
          btn.style.borderColor = 'rgba(16,185,129,0.3)';
        } else {
          btn.style.background = 'var(--surf)';
          btn.style.color = 'var(--muted)';
          btn.style.borderColor = 'var(--border)';
        }
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════
   * 10. HELPERS
   * ══════════════════════════════════════════════════════════════════ */
  function _loadData(patientId) {
    if (typeof db === 'undefined' || typeof BASE === 'undefined') return Promise.resolve({});

    var basePath = BASE + '/patients/' + patientId + '/specialty_data/pediatrics';
    var p1 = db.ref(basePath + '/growth_records').once('value')
      .then(function (s) {
        var raw = s.val() || {};
        return Object.values(raw).sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
      });
    var p2 = db.ref(basePath + '/vaccinations').once('value')
      .then(function (s) { return s.val() || {}; });
    var p3 = db.ref(basePath + '/milestones').once('value')
      .then(function (s) { return s.val() || {}; });

    return Promise.all([p1, p2, p3]).then(function (res) {
      return { measurements: res[0], vaccinations: res[1], milestones: res[2] };
    });
  }

  function _getPatientInfo() {
    var pid = _currentPatientId || (typeof window.activePatientId !== 'undefined' ? window.activePatientId : null);
    if (!pid || typeof window._patients === 'undefined') return { dob: null, gender: 'ذكر' };
    var p = (window._patients[pid] || {}).info || {};
    return { dob: p.dob || null, gender: p.gender || 'ذكر' };
  }

  function _calcAgeMonths(dob) {
    if (!dob) return 0;
    var birth = new Date(dob);
    var now = new Date();
    return Math.max(0, Math.floor((now - birth) / (1000 * 60 * 60 * 24 * 30.44)));
  }

  function _calcBMI(w, h) {
    if (!w || !h) return '—';
    return (w / Math.pow(h / 100, 2)).toFixed(1);
  }

  function _bmiCategory(bmi) {
    var b = parseFloat(bmi);
    if (isNaN(b)) return '';
    if (b < 14) return '⚠️ نحافة شديدة';
    if (b < 18.5) return 'نقص وزن';
    if (b < 25) return '✅ طبيعي';
    if (b < 30) return 'زيادة وزن';
    return '⚠️ سمنة';
  }

  function _calcPercentile(value, ageMonths, gender, type) {
    if (!value || !ageMonths) return null;
    var table = type === 'weight'
      ? (gender === 'أنثى' ? WHO_WEIGHT_GIRLS : WHO_WEIGHT_BOYS)
      : (gender === 'أنثى' ? WHO_HEIGHT_GIRLS : WHO_HEIGHT_BOYS);

    /* أقرب عمر في الجدول */
    var ages = Object.keys(table).map(Number).sort(function (a, b) { return a - b; });
    var closest = ages.reduce(function (prev, curr) {
      return Math.abs(curr - ageMonths) < Math.abs(prev - ageMonths) ? curr : prev;
    });

    var centiles = table[closest];
    if (!centiles) return null;

    var percMap = [3, 15, 50, 85, 97];
    for (var i = 0; i < centiles.length; i++) {
      if (value <= centiles[i]) return percMap[i];
    }
    return 97;
  }

  function _attachStyles() {
    if (document.getElementById('_gc-styles')) return;
    var style = document.createElement('style');
    style.id = '_gc-styles';
    style.textContent = '.argon-growth-module .fi { width:100%;box-sizing:border-box; }';
    document.head.appendChild(style);
  }

  /* ══════════════════════════════════════════════════════════════════
   * 11. PUBLIC API
   * ══════════════════════════════════════════════════════════════════ */
  global.GrowthChartModule = {
    render: render,
    switchTab: _switchTab,
    addMeasurement: addMeasurement,
    markVaccine: markVaccine,
    markMilestone: markMilestone,
    calcDose: calcDose,
    liveCalc: liveCalc,
    getLatestMeasurements: function () {
      return _measurements.length ? _measurements[_measurements.length - 1] : null;
    },
    getAllMeasurements: function () { return _measurements.slice(); },
    init: function () { console.log('[GrowthChartModule] v1.0 ready'); }
  };

  console.log('%c👶 GrowthChartModule v1.0 loaded', 'color:#10b981;font-weight:bold');

}(window));
