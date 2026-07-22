/**
 * ❤️ ARGON MEDICAL OS — Cardiology Module
 * specialty-modules/cardio_module.js — v1.0
 *
 * يشمل: تقرير رسم القلب (ECG) + سجل ضغط الدم التفاعلي +
 *        حاسبات المخاطر (Framingham, ASCVD, CHA₂DS₂-VASc,
 *        HAS-BLED, GRACE, TIMI) + تقرير الإيكو
 *
 * الاستخدام:
 *   CardioModule.render('containerId', patientId)
 *   CardioModule.getECGReport()
 *   CardioModule.getBPLog()
 */

(function (global) {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════
   * STATE
   * ══════════════════════════════════════════════════════════════════ */
  var _bpLog        = [];
  var _ecgReports   = [];
  var _echoReports  = [];
  var _containerId  = null;
  var _patientId    = null;
  var _activeTab    = 'bp';

  /* ══════════════════════════════════════════════════════════════════
   * 1. RENDER
   * ══════════════════════════════════════════════════════════════════ */
  function render(containerId, patientId) {
    _containerId = containerId;
    _patientId   = patientId;

    var container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted)">' +
      '<i class="fas fa-circle-notch fa-spin" style="color:#ef4444;font-size:1.5rem"></i>' +
      '<p style="margin-top:10px">جاري تحميل الوحدة القلبية...</p></div>';

    _loadData(patientId).then(function (data) {
      _bpLog       = data.bpLog       || [];
      _ecgReports  = data.ecgReports  || [];
      _echoReports = data.echoReports || [];
      container.innerHTML = _buildMainHTML();
      _attachStyles();
      _switchTab(_activeTab);
      _drawBPChart();
    }).catch(function () {
      _bpLog = []; _ecgReports = []; _echoReports = [];
      container.innerHTML = _buildMainHTML();
      _attachStyles();
      _switchTab(_activeTab);
    });
  }

  /* ══════════════════════════════════════════════════════════════════
   * 2. MAIN HTML
   * ══════════════════════════════════════════════════════════════════ */
  function _buildMainHTML() {
    return [
      '<div class="argon-cardio-module" style="font-family:\'Tajawal\',sans-serif">',
      /* Tabs */
      '<div style="display:flex;gap:6px;border-bottom:1px solid var(--border);',
        'padding-bottom:10px;margin-bottom:16px;overflow-x:auto;flex-wrap:wrap">',
        _tabBtn('bp',    '📊 سجل ضغط الدم',       'fa-chart-area'),
        _tabBtn('ecg',   '💓 تقرير ECG',            'fa-heartbeat'),
        _tabBtn('echo',  '🔊 تقرير الإيكو',         'fa-wave-square'),
        _tabBtn('risk',  '🧮 حاسبات المخاطر',       'fa-calculator'),
      '</div>',
      /* Contents */
      '<div id="_cTab-bp">',   _buildBPTab(),   '</div>',
      '<div id="_cTab-ecg">',  _buildECGTab(),  '</div>',
      '<div id="_cTab-echo">', _buildEchoTab(), '</div>',
      '<div id="_cTab-risk">', _buildRiskTab(), '</div>',
      '</div>'
    ].join('');
  }

  function _tabBtn(id, label, icon) {
    return [
      '<button id="_cTabBtn-', id, '" ',
        'onclick="CardioModule.switchTab(\'', id, '\')" ',
        'style="padding:7px 14px;border-radius:8px;border:1px solid var(--border);',
        'background:var(--surf);color:var(--muted);font-family:\'Tajawal\',sans-serif;',
        'font-weight:700;font-size:0.8rem;cursor:pointer;white-space:nowrap;',
        'display:inline-flex;align-items:center;gap:6px;transition:all 0.2s">',
        '<i class="fas ', icon, '"></i> ', label,
      '</button>'
    ].join('');
  }

  /* ══════════════════════════════════════════════════════════════════
   * 3. BP LOG TAB
   * ══════════════════════════════════════════════════════════════════ */
  function _buildBPTab() {
    var rows = _bpLog.slice().reverse().map(function (r) {
      var sys = parseInt(r.systolic || 0);
      var dia = parseInt(r.diastolic || 0);
      var cat = _bpCategory(sys, dia);
      return [
        '<tr>',
          '<td style="padding:9px 12px;border-bottom:1px solid var(--border);font-weight:700">',
            r.date, '<span style="font-size:0.7rem;color:var(--muted);margin-right:4px">', r.time || '', '</span>',
          '</td>',
          '<td style="padding:9px 12px;border-bottom:1px solid var(--border);text-align:center">',
            r.arm === 'left' ? 'يسار 🫲' : 'يمين 🫱',
          '</td>',
          '<td style="padding:9px 12px;border-bottom:1px solid var(--border);text-align:center;',
            'font-weight:900;font-size:1rem;color:', cat.color, '">',
            sys, '/', dia,
          '</td>',
          '<td style="padding:9px 12px;border-bottom:1px solid var(--border);text-align:center">',
            r.pulse || '—',
          '</td>',
          '<td style="padding:9px 12px;border-bottom:1px solid var(--border);text-align:center">',
            '<span style="padding:2px 8px;border-radius:6px;font-size:0.72rem;font-weight:800;',
              'background:', cat.color + '15', ';color:', cat.color, '">',
              cat.label,
            '</span>',
          '</td>',
          '<td style="padding:9px 12px;border-bottom:1px solid var(--border);font-size:0.75rem;color:var(--muted)">',
            r.notes || '—',
          '</td>',
        '</tr>'
      ].join('');
    }).join('');

    /* Stats */
    var avgSys = 0, avgDia = 0;
    if (_bpLog.length) {
      _bpLog.forEach(function (r) { avgSys += parseInt(r.systolic || 0); avgDia += parseInt(r.diastolic || 0); });
      avgSys = Math.round(avgSys / _bpLog.length);
      avgDia = Math.round(avgDia / _bpLog.length);
    }
    var avgCat = _bpCategory(avgSys, avgDia);

    return [
      /* Quick Stats */
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px">',
        _statCard('📊', 'إجمالي القراءات', _bpLog.length, '', '#ef4444'),
        _statCard('📈', 'متوسط الانقباضي', avgSys || '—', 'mmHg', '#ef4444'),
        _statCard('📉', 'متوسط الانبساطي', avgDia || '—', 'mmHg', '#0ea5e9'),
        avgSys ? _statCard('🎯', 'التصنيف الوسطي', avgCat.label, '', avgCat.color) : '',
      '</div>',

      /* Target Banner */
      '<div style="padding:8px 14px;border-radius:8px;margin-bottom:12px;font-size:0.78rem;',
        'background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.2);color:var(--green)">',
        '<i class="fas fa-bullseye"></i> <b>هدف الضغط الموصى به (ACC/AHA 2017):</b> ',
        '≤ 130/80 mmHg لمعظم المرضى | ≤ 140/90 لكبار السن',
      '</div>',

      /* SVG Chart Placeholder */
      '<div id="_bp-chart-wrap" style="border:1px solid var(--border);border-radius:10px;',
        'padding:12px;margin-bottom:14px;background:rgba(255,255,255,0.01)">',
        '<div style="font-size:0.78rem;font-weight:700;color:var(--muted);margin-bottom:8px">',
          '<i class="fas fa-chart-line"></i> رسم بياني لاتجاه ضغط الدم',
        '</div>',
        '<canvas id="_bp-canvas" width="600" height="180" ',
          'style="width:100%;max-width:600px;display:block;margin:0 auto"></canvas>',
      '</div>',

      /* Add New Reading Form */
      '<div style="background:rgba(239,68,68,0.03);border:1px solid rgba(239,68,68,0.15);',
        'border-radius:10px;padding:14px;margin-bottom:14px">',
        '<div style="font-size:0.85rem;font-weight:800;color:#ef4444;margin-bottom:10px">',
          '<i class="fas fa-plus-circle"></i> تسجيل قراءة ضغط جديدة',
        '</div>',
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px">',
          '<div class="fg">',
            '<label style="font-size:0.73rem;color:var(--muted)">التاريخ</label>',
            '<input type="date" id="_bp-date" class="fi" value="', new Date().toISOString().split('T')[0], '">',
          '</div>',
          '<div class="fg">',
            '<label style="font-size:0.73rem;color:var(--muted)">الوقت</label>',
            '<input type="time" id="_bp-time" class="fi" dir="ltr">',
          '</div>',
          '<div class="fg">',
            '<label style="font-size:0.73rem;color:var(--muted)">الانقباضي (sys)</label>',
            '<input type="number" id="_bp-sys" class="fi" placeholder="120" dir="ltr" ',
              'oninput="CardioModule.liveBPClass()">',
          '</div>',
          '<div class="fg">',
            '<label style="font-size:0.73rem;color:var(--muted)">الانبساطي (dia)</label>',
            '<input type="number" id="_bp-dia" class="fi" placeholder="80" dir="ltr" ',
              'oninput="CardioModule.liveBPClass()">',
          '</div>',
          '<div class="fg">',
            '<label style="font-size:0.73rem;color:var(--muted)">النبض (bpm)</label>',
            '<input type="number" id="_bp-pulse" class="fi" placeholder="75" dir="ltr">',
          '</div>',
          '<div class="fg">',
            '<label style="font-size:0.73rem;color:var(--muted)">الذراع</label>',
            '<select id="_bp-arm" class="fi">',
              '<option value="right">يمين 🫱</option>',
              '<option value="left">يسار 🫲</option>',
            '</select>',
          '</div>',
        '</div>',
        '<div id="_bp-live-class" style="margin:8px 0;font-size:0.78rem;font-weight:800;min-height:22px"></div>',
        '<div style="display:flex;gap:8px;margin-top:8px">',
          '<input type="text" id="_bp-notes" class="fi" placeholder="ملاحظة (اختياري)" ',
            'style="flex:1">',
          '<button onclick="CardioModule.addBPReading()" ',
            'style="padding:8px 18px;background:#ef4444;color:#fff;border:none;border-radius:8px;',
            'font-family:\'Tajawal\',sans-serif;font-weight:800;cursor:pointer;white-space:nowrap">',
            '<i class="fas fa-save"></i> إضافة',
          '</button>',
        '</div>',
      '</div>',

      /* Table */
      _bpLog.length ? [
        '<div style="overflow-x:auto">',
          '<table style="width:100%;border-collapse:collapse;font-size:0.82rem">',
            '<thead><tr style="background:rgba(255,255,255,0.03)">',
              '<th style="padding:9px;text-align:right;border-bottom:2px solid var(--border)">التاريخ</th>',
              '<th style="padding:9px;text-align:center;border-bottom:2px solid var(--border)">الذراع</th>',
              '<th style="padding:9px;text-align:center;border-bottom:2px solid var(--border)">الضغط</th>',
              '<th style="padding:9px;text-align:center;border-bottom:2px solid var(--border)">النبض</th>',
              '<th style="padding:9px;text-align:center;border-bottom:2px solid var(--border)">التصنيف</th>',
              '<th style="padding:9px;text-align:right;border-bottom:2px solid var(--border)">ملاحظة</th>',
            '</tr></thead>',
            '<tbody>', rows, '</tbody>',
          '</table>',
        '</div>'
      ].join('') : '<div style="text-align:center;padding:20px;color:var(--muted)">لا يوجد قراءات مسجلة بعد</div>'
    ].join('');
  }

  /* ══════════════════════════════════════════════════════════════════
   * 4. ECG TAB
   * ══════════════════════════════════════════════════════════════════ */
  function _buildECGTab() {
    var formHTML = [
      '<div style="background:rgba(239,68,68,0.03);border:1px solid rgba(239,68,68,0.15);',
        'border-radius:10px;padding:16px;margin-bottom:14px">',
        '<div style="font-size:0.9rem;font-weight:800;color:#ef4444;margin-bottom:12px">',
          '<i class="fas fa-plus-circle"></i> تقرير رسم قلب جديد',
        '</div>',
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">',

          _ecgField('التاريخ',                'ecg-date',    'date',   ''),
          _ecgSelect('الإيقاع',               'ecg-rhythm',  ['سيني منتظم (Normal Sinus)', 'رجفان أذيني (Afib)', 'رفرفة أذينية (Flutter)', 'تسرع فوق بطيني (SVT)', 'تسرع بطيني (VT)', 'بطء القلب (Bradycardia)', 'حصار AV درجة 1', 'حصار AV درجة 2', 'حصار AV كامل', 'حصار LBBB', 'حصار RBBB']),
          _ecgField('معدل القلب (bpm)',        'ecg-hr',      'number', '75'),
          _ecgSelect('المحور الكهربائي',       'ecg-axis',    ['طبيعي (0 إلى +90)', 'انحراف يسار (LAD)', 'انحراف يمين (RAD)', 'انحراف شديد يسار']),
          _ecgField('QT (msec)',              'ecg-qt',      'number', ''),
          _ecgField('QTc (msec)',             'ecg-qtc',     'number', '', 'طبيعي < 450 للذكور, < 470 للإناث'),
          _ecgSelect('موجة P',                'ecg-p',       ['طبيعية', 'غائبة', 'منعكسة', 'ثنائية الذروة (P mitrale)', 'طويلة وحادة (P pulmonale)']),
          _ecgSelect('مجمع QRS',              'ecg-qrs',     ['طبيعي < 120ms', 'عريض > 120ms', 'ندبة Q قديمة', 'تدهور R progression']),

        '</div>',

        /* ST Changes */
        '<div style="margin-top:10px;font-size:0.78rem;font-weight:700;color:var(--muted);margin-bottom:6px">',
          'تغيرات ST/T:',
        '</div>',
        '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px" id="_ecg-st-chips">',
          _stChip('لا يوجد تغيرات'),
          _stChip('ارتفاع ST أمامي (V1-V4)'),
          _stChip('ارتفاع ST سفلي (II,III,aVF)'),
          _stChip('ارتفاع ST جانبي (I,aVL,V5-V6)'),
          _stChip('انخفاض ST نقري'),
          _stChip('انعكاس موجة T'),
          _stChip('تسطح موجة T'),
          _stChip('T مثبطة ≥ 1mm'),
        '</div>',

        /* Notes */
        '<div class="fg" style="margin-bottom:10px">',
          '<label style="font-size:0.73rem;color:var(--muted)">تفسير وملاحظات إضافية</label>',
          '<textarea id="ecg-notes" class="fi" rows="2" style="resize:none" ',
            'placeholder="مثال: رسم قلب طبيعي بدون تغيرات حادة..."></textarea>',
        '</div>',

        '<button onclick="CardioModule.saveECGReport()" ',
          'style="width:100%;padding:10px;background:#ef4444;color:#fff;border:none;',
          'border-radius:10px;font-family:\'Tajawal\',sans-serif;font-weight:800;cursor:pointer">',
          '<i class="fas fa-save"></i> حفظ تقرير رسم القلب',
        '</button>',
      '</div>'
    ].join('');

    /* Previous Reports */
    var historyHTML = '';
    if (_ecgReports.length) {
      historyHTML = [
        '<div style="font-size:0.85rem;font-weight:800;color:var(--muted);margin-bottom:8px">',
          'تقارير ECG السابقة:',
        '</div>',
        _ecgReports.slice().reverse().map(function (r) {
          return [
            '<div style="border:1px solid var(--border);border-radius:10px;padding:12px;',
              'margin-bottom:8px;background:rgba(255,255,255,0.01)">',
              '<div style="display:flex;justify-content:space-between;margin-bottom:8px">',
                '<span style="font-weight:800;color:#ef4444">', r.date || '—', '</span>',
                '<span style="font-size:0.75rem;padding:2px 8px;border-radius:6px;',
                  'background:rgba(239,68,68,0.1);color:#ef4444">', r.rhythm || '—', '</span>',
              '</div>',
              '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;font-size:0.78rem">',
                '<div><span style="color:var(--muted)">المحور:</span> <b>', r.axis || '—', '</b></div>',
                '<div><span style="color:var(--muted)">QTc:</span> <b>', r.qtc || '—', ' ms</b></div>',
                '<div><span style="color:var(--muted)">HR:</span> <b>', r.hr || '—', ' bpm</b></div>',
              '</div>',
              r.stChanges && r.stChanges.length ? [
                '<div style="margin-top:6px;font-size:0.72rem;color:var(--amber)">',
                  '⚠️ تغيرات ST: ', r.stChanges.join(' | '),
                '</div>'
              ].join('') : '',
              r.notes ? '<div style="margin-top:6px;font-size:0.75rem;color:var(--muted)">' + r.notes + '</div>' : '',
            '</div>'
          ].join('');
        }).join('')
      ].join('');
    }

    return formHTML + historyHTML;
  }

  function _ecgField(label, id, type, placeholder, hint) {
    return [
      '<div class="fg">',
        '<label style="font-size:0.73rem;color:var(--muted)">', label,
          hint ? ' <span style="font-size:0.65rem;opacity:0.7">(' + hint + ')</span>' : '',
        '</label>',
        '<input type="', type, '" id="', id, '" class="fi" ',
          'placeholder="', placeholder, '" dir="ltr">',
      '</div>'
    ].join('');
  }

  function _ecgSelect(label, id, opts) {
    return [
      '<div class="fg">',
        '<label style="font-size:0.73rem;color:var(--muted)">', label, '</label>',
        '<select id="', id, '" class="fi">',
          opts.map(function (o) { return '<option>' + o + '</option>'; }).join(''),
        '</select>',
      '</div>'
    ].join('');
  }

  function _stChip(text) {
    return [
      '<span id="_st-' + text.replace(/[^a-z0-9]/gi, '') + '" ',
        'onclick="CardioModule.toggleSTChip(this)" ',
        'style="padding:3px 10px;border-radius:6px;font-size:0.72rem;font-weight:700;',
        'cursor:pointer;border:1px solid var(--border);background:var(--surf);color:var(--muted);',
        'transition:all 0.2s" ',
        'data-text="', text, '">',
        text,
      '</span>'
    ].join('');
  }

  /* ══════════════════════════════════════════════════════════════════
   * 5. ECHO TAB
   * ══════════════════════════════════════════════════════════════════ */
  function _buildEchoTab() {
    return [
      '<div style="background:rgba(14,165,233,0.03);border:1px solid rgba(14,165,233,0.15);',
        'border-radius:10px;padding:16px;margin-bottom:14px">',
        '<div style="font-size:0.9rem;font-weight:800;color:var(--sky);margin-bottom:12px">',
          '<i class="fas fa-plus-circle"></i> تقرير إيكو قلب جديد',
        '</div>',
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">',
          _ecgField('التاريخ',              'echo-date',   'date',   ''),
          _ecgField('EF% (كسر القذف)',      'echo-ef',     'number', '55-65', 'طبيعي ≥ 55%'),
          _ecgField('LVEDd (mm)',           'echo-lvedd',  'number', '42-55', 'طبيعي < 56mm'),
          _ecgField('LVESd (mm)',           'echo-lvesd',  'number', '25-38'),
          _ecgField('IVS (mm)',             'echo-ivs',    'number', '6-11',  'طبيعي 6-11mm'),
          _ecgField('LVPW (mm)',            'echo-lvpw',   'number', '6-11'),
          _ecgField('PASP mmHg',           'echo-pasp',   'number', '',      'طبيعي < 35mmHg'),
          _ecgField('LA (mm)',              'echo-la',     'number', '29-45', 'طبيعي < 40mm'),
        '</div>',

        /* Valves */
        '<div style="margin-top:10px">',
          '<div style="font-size:0.78rem;font-weight:700;color:var(--muted);margin-bottom:6px">الصمامات:</div>',
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">',
            _ecgSelect('الميترالي',          'echo-mitral',  ['طبيعي', 'قصور خفيف', 'قصور متوسط', 'قصور شديد', 'تضيق خفيف', 'تضيق متوسط', 'تضيق شديد', 'MVP']),
            _ecgSelect('الأورطي',            'echo-aortic',  ['طبيعي', 'قصور خفيف', 'قصور متوسط', 'قصور شديد', 'تضيق خفيف', 'تضيق متوسط', 'تضيق شديد']),
            _ecgSelect('ثلاثي الشرفات',     'echo-tricusp', ['طبيعي', 'قصور خفيف', 'قصور متوسط', 'قصور شديد']),
            _ecgSelect('الشبكية',            'echo-ret',     ['طبيعية', 'ضمور بقعي', 'ضعف عضلة بطينية', 'حركة جدار غير طبيعية']),
          '</div>',
        '</div>',

        /* Pericardium */
        '<div style="margin-top:8px">',
          _ecgSelect('التامور (Pericardium)', 'echo-peri', ['طبيعي', 'انصباب خفيف', 'انصباب متوسط', 'انصباب شديد', 'التهاب تاموري']),
        '</div>',

        '<div class="fg" style="margin:10px 0">',
          '<label style="font-size:0.73rem;color:var(--muted)">خلاصة التقرير وتوصيات</label>',
          '<textarea id="echo-notes" class="fi" rows="2" style="resize:none" ',
            'placeholder="مثال: EF محفوظ 60%. قصور ميترالي خفيف. بدون انصباب تاموري."></textarea>',
        '</div>',

        '<button onclick="CardioModule.saveEchoReport()" ',
          'style="width:100%;padding:10px;background:var(--sky);color:#fff;border:none;',
          'border-radius:10px;font-family:\'Tajawal\',sans-serif;font-weight:800;cursor:pointer">',
          '<i class="fas fa-save"></i> حفظ تقرير الإيكو',
        '</button>',
      '</div>',

      /* Previous Echo Reports */
      _echoReports.length ? [
        '<div style="font-size:0.85rem;font-weight:700;color:var(--muted);margin-bottom:8px">تقارير إيكو سابقة:</div>',
        _echoReports.slice().reverse().map(function (r) {
          var efColor = parseInt(r.ef) < 40 ? 'var(--red)' : parseInt(r.ef) < 55 ? 'var(--amber)' : 'var(--green)';
          return [
            '<div style="border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px">',
              '<div style="display:flex;justify-content:space-between;margin-bottom:8px">',
                '<span style="font-weight:800;color:var(--sky)">', r.date || '—', '</span>',
                '<span style="font-size:1rem;font-weight:900;color:', efColor, '">EF: ', r.ef || '—', '%</span>',
              '</div>',
              '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;font-size:0.75rem">',
                '<div><span style="color:var(--muted)">LVEDd:</span> <b>', r.lvedd || '—', ' mm</b></div>',
                '<div><span style="color:var(--muted)">PASP:</span> <b>', r.pasp || '—', ' mmHg</b></div>',
                '<div><span style="color:var(--muted)">تامور:</span> <b>', r.pericardium || '—', '</b></div>',
              '</div>',
              r.notes ? '<div style="margin-top:6px;font-size:0.75rem;color:var(--muted)">' + r.notes + '</div>' : '',
            '</div>'
          ].join('');
        }).join('')
      ].join('') : ''
    ].join('');
  }

  /* ══════════════════════════════════════════════════════════════════
   * 6. RISK CALCULATORS TAB
   * ══════════════════════════════════════════════════════════════════ */
  function _buildRiskTab() {
    return [
      /* Tabs inside Risk */
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">',
        _riskTabBtn('framingham', 'Framingham 10Y'),
        _riskTabBtn('ascvd',     'ASCVD ACC/AHA'),
        _riskTabBtn('chads',     'CHA₂DS₂-VASc'),
        _riskTabBtn('hasbled',   'HAS-BLED'),
        _riskTabBtn('grace',     'GRACE Score'),
      '</div>',

      '<div id="_riskPanel-framingham">', _buildFraminghamPanel(), '</div>',
      '<div id="_riskPanel-ascvd">',     _buildASCVDPanel(),      '</div>',
      '<div id="_riskPanel-chads">',     _buildCHADSPanel(),      '</div>',
      '<div id="_riskPanel-hasbled">',   _buildHASBLEDPanel(),    '</div>',
      '<div id="_riskPanel-grace">',     _buildGRACEPanel(),      '</div>',
    ].join('');
  }

  function _riskTabBtn(id, label) {
    return [
      '<button id="_riskTabBtn-', id, '" onclick="CardioModule.switchRiskTab(\'', id, '\')" ',
        'style="padding:5px 12px;border-radius:6px;border:1px solid var(--border);',
        'background:var(--surf);color:var(--muted);font-family:\'Tajawal\',sans-serif;',
        'font-size:0.75rem;font-weight:700;cursor:pointer;transition:all 0.2s">',
        label,
      '</button>'
    ].join('');
  }

  /* ── Framingham ── */
  function _buildFraminghamPanel() {
    return _riskFormWrapper('Framingham 10-Year CVD Risk', '#ef4444', [
      _riskRow('العمر (سنة)',              'fr-age',    'number', '50'),
      _riskRow('الانقباضي (mmHg)',          'fr-sbp',    'number', '120'),
      _riskSel('الجنس',                   'fr-sex',    ['ذكر', 'أنثى']),
      _riskSel('الكولسترول الكلي',        'fr-tc',     ['< 160', '160-199', '200-239', '240-279', '≥ 280']),
      _riskSel('HDL الكولسترول',          'fr-hdl',    ['≥ 60', '50-59', '40-49', '< 40']),
      _riskSel('علاج ضغط الدم؟',         'fr-bp-rx',  ['لا', 'نعم']),
      _riskSel('مدخن؟',                  'fr-smoke',  ['لا', 'نعم']),
      _riskSel('سكري؟',                  'fr-dm',     ['لا', 'نعم']),
    ], 'CardioModule.calcFramingham()', 'احسب خطر Framingham');
  }

  /* ── ASCVD ── */
  function _buildASCVDPanel() {
    return _riskFormWrapper('ASCVD 10-Year Risk (ACC/AHA 2013)', '#f97316', [
      _riskRow('العمر',          'asc-age',  'number', '55'),
      _riskRow('الانقباضي',      'asc-sbp',  'number', '130'),
      _riskRow('الكولسترول الكلي (mg/dL)', 'asc-tc', 'number', '200'),
      _riskRow('HDL (mg/dL)',    'asc-hdl',  'number', '50'),
      _riskSel('الجنس',         'asc-sex',  ['ذكر', 'أنثى']),
      _riskSel('العرق',         'asc-race', ['أبيض/آخر', 'أسود (African American)']),
      _riskSel('علاج ضغط؟',    'asc-bprx', ['لا', 'نعم']),
      _riskSel('مدخن؟',        'asc-smk',  ['لا', 'نعم']),
      _riskSel('سكري؟',        'asc-dm',   ['لا', 'نعم']),
    ], 'CardioModule.calcASCVD()', 'احسب ASCVD');
  }

  /* ── CHA₂DS₂-VASc ── */
  function _buildCHADSPanel() {
    return _riskFormWrapper('CHA₂DS₂-VASc — خطر السكتة في الرجفان الأذيني', '#8b5cf6', [
      _riskCheck('قصور القلب (C)',           'chads-c'),
      _riskCheck('ارتفاع ضغط الدم (H)',     'chads-h'),
      _riskCheck('عمر 75 سنة أو أكثر (A₂)', 'chads-a2'),
      _riskCheck('سكري (D)',                 'chads-d'),
      _riskCheck('سكتة/TIA سابقة (S₂)',     'chads-s2'),
      _riskCheck('مرض وعائي (V)',           'chads-v'),
      _riskCheck('عمر 65-74 سنة (A)',        'chads-a'),
      _riskCheck('أنثى (Sc)',               'chads-sc'),
    ], 'CardioModule.calcCHADS()', 'احسب CHA₂DS₂-VASc');
  }

  /* ── HAS-BLED ── */
  function _buildHASBLEDPanel() {
    return _riskFormWrapper('HAS-BLED — خطر النزيف مع مضادات التخثر', '#dc2626', [
      _riskCheck('ارتفاع ضغط الدم غير مضبوط (H)', 'hb-h'),
      _riskCheck('اختلال وظائف كلى/كبد (A)',        'hb-a'),
      _riskCheck('سكتة دماغية سابقة (S)',           'hb-s'),
      _riskCheck('تاريخ نزيف/تهيؤ للنزيف (B)',      'hb-b'),
      _riskCheck('INR غير مستقر (L)',               'hb-l'),
      _riskCheck('عمر > 65 سنة (E)',               'hb-e'),
      _riskCheck('أدوية/كحول (D)',                  'hb-d'),
    ], 'CardioModule.calcHASBLED()', 'احسب HAS-BLED');
  }

  /* ── GRACE ── */
  function _buildGRACEPanel() {
    return _riskFormWrapper('GRACE Score — خطر الوفاة في ACS', '#7c3aed', [
      _riskRow('العمر',                    'grace-age',  'number', '60'),
      _riskRow('معدل القلب (bpm)',          'grace-hr',   'number', '80'),
      _riskRow('الانقباضي (mmHg)',          'grace-sbp',  'number', '120'),
      _riskRow('الكرياتينين (mg/dL)',       'grace-cr',   'number', '1.0'),
      _riskSel('تغيرات ST',               'grace-st',   ['لا', 'نعم']),
      _riskSel('ارتفاع إنزيم القلب',       'grace-enz',  ['لا', 'نعم']),
      _riskSel('توقف القلب عند الدخول',   'grace-ca',   ['لا', 'نعم']),
      _riskSel('Killip Class',            'grace-killip', ['I — بدون أعراض قصور', 'II — أصوات رئوية / وريد عنقي', 'III — وذمة رئوية', 'IV — صدمة قلبية']),
    ], 'CardioModule.calcGRACE()', 'احسب GRACE Score');
  }

  /* ── Shared Form Builder ── */
  function _riskFormWrapper(title, color, fields, onclick, btnLabel) {
    return [
      '<div style="border:1px solid ', color + '20', ';border-radius:10px;padding:16px;',
        'background:', color + '05', '">',
        '<div style="font-size:0.88rem;font-weight:800;color:', color, ';margin-bottom:12px">',
          '<i class="fas fa-calculator"></i> ', title,
        '</div>',
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-bottom:12px">',
          fields.join(''),
        '</div>',
        '<button onclick="', onclick, '" ',
          'style="width:100%;padding:9px;background:', color, ';color:#fff;border:none;',
          'border-radius:8px;font-family:\'Tajawal\',sans-serif;font-weight:800;cursor:pointer">',
          '<i class="fas fa-calculator"></i> ', btnLabel,
        '</button>',
        '<div id="_risk-result-', onclick.split('calc')[1].split('(')[0].toLowerCase(), '" ',
          'style="margin-top:10px"></div>',
      '</div>'
    ].join('');
  }

  function _riskRow(label, id, type, ph) {
    return [
      '<div class="fg">',
        '<label style="font-size:0.73rem;color:var(--muted)">', label, '</label>',
        '<input type="', type, '" id="', id, '" class="fi" placeholder="', ph, '" dir="ltr">',
      '</div>'
    ].join('');
  }

  function _riskSel(label, id, opts) {
    return [
      '<div class="fg">',
        '<label style="font-size:0.73rem;color:var(--muted)">', label, '</label>',
        '<select id="', id, '" class="fi">',
          opts.map(function (o) { return '<option>' + o + '</option>'; }).join(''),
        '</select>',
      '</div>'
    ].join('');
  }

  function _riskCheck(label, id) {
    return [
      '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;',
        'padding:6px 10px;border-radius:6px;border:1px solid var(--border);',
        'background:rgba(255,255,255,0.02);font-size:0.8rem;font-weight:600">',
        '<input type="checkbox" id="', id, '" style="width:16px;height:16px">',
        label,
      '</label>'
    ].join('');
  }

  /* ══════════════════════════════════════════════════════════════════
   * 7. RISK CALCULATIONS
   * ══════════════════════════════════════════════════════════════════ */
  function calcFramingham() {
    var age  = parseInt(_v('fr-age')) || 0;
    var sex  = _v('fr-sex');
    var sbp  = parseInt(_v('fr-sbp')) || 0;
    var tc   = _v('fr-tc');
    var hdl  = _v('fr-hdl');
    var bpRx = _v('fr-bp-rx') === 'نعم';
    var smk  = _v('fr-smoke') === 'نعم';
    var dm   = _v('fr-dm') === 'نعم';

    if (!age || !sbp) { _riskResult('framingham', null, 'يرجى إدخال العمر وضغط الدم الانقباضي', 'err'); return; }

    /* Simplified Framingham point scoring (Men) */
    var points = 0;

    /* Age points */
    if (sex === 'ذكر') {
      if (age < 35) points += -9;
      else if (age <= 39) points += -4;
      else if (age <= 44) points += 0;
      else if (age <= 49) points += 3;
      else if (age <= 54) points += 6;
      else if (age <= 59) points += 8;
      else if (age <= 64) points += 10;
      else if (age <= 69) points += 11;
      else if (age <= 74) points += 12;
      else points += 13;
    } else {
      if (age < 35) points += -7;
      else if (age <= 39) points += -3;
      else if (age <= 44) points += 0;
      else if (age <= 49) points += 3;
      else if (age <= 54) points += 6;
      else if (age <= 59) points += 8;
      else if (age <= 64) points += 10;
      else if (age <= 74) points += 12;
      else points += 14;
    }

    /* TC points */
    var tcMap = {'< 160': 0, '160-199': 1, '200-239': 2, '240-279': 3, '≥ 280': 4};
    points += (tcMap[tc] || 0) * (sex === 'ذكر' ? 1 : 1.2 | 0);

    /* HDL points */
    var hdlMap = {'≥ 60': -2, '50-59': 0, '40-49': 1, '< 40': 2};
    points += hdlMap[hdl] || 0;

    /* SBP */
    if (!bpRx) {
      if (sbp < 120) points += 0;
      else if (sbp <= 129) points += 1;
      else if (sbp <= 139) points += 2;
      else if (sbp <= 159) points += 3;
      else points += 4;
    } else {
      if (sbp < 120) points += 0;
      else if (sbp <= 129) points += 3;
      else if (sbp <= 139) points += 4;
      else if (sbp <= 159) points += 5;
      else points += 6;
    }

    if (smk) points += sex === 'ذكر' ? 4 : 3;
    if (dm)  points += sex === 'ذكر' ? 3 : 4;

    /* Point → Risk% (simplified) */
    var riskTable = {
      '-3': 1, '-2': 1, '-1': 2, '0': 2, '1': 2, '2': 3, '3': 3,
      '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 10,
      '10': 11, '11': 13, '12': 15, '13': 17, '14': 20, '15': 23,
      '16': 27, '17': 30
    };
    var clampedPts = Math.min(17, Math.max(-3, points));
    var risk = riskTable[String(clampedPts)] || (clampedPts >= 17 ? 30 : 1);

    var category = risk < 10 ? { label: 'منخفض', color: 'var(--green)' }
      : risk < 20 ? { label: 'متوسط', color: 'var(--amber)' }
      : { label: 'مرتفع', color: 'var(--red)' };

    _riskResult('framingham',
      '<div style="font-size:2rem;font-weight:900;color:' + category.color + '">' + risk + '%</div>' +
      '<div style="font-weight:700;color:' + category.color + '">' + category.label + ' (10 سنوات)</div>' +
      '<div style="font-size:0.75rem;color:var(--muted);margin-top:4px">نقاط Framingham: ' + points + '</div>'
    );
  }

  function calcCHADS() {
    var score = 0;
    var items = ['chads-c', 'chads-h', 'chads-d', 'chads-v', 'chads-a', 'chads-sc'];
    items.forEach(function (id) { if (_chk(id)) score++; });
    if (_chk('chads-a2')) score += 2;
    if (_chk('chads-s2')) score += 2;

    var strokeRisk = [0, 1.3, 2.2, 3.2, 4.0, 6.7, 9.8, 9.6, 6.7, 15.2];
    var riskPct = strokeRisk[Math.min(score, 9)] || 15;
    var recommendation = score === 0 ? 'لا يحتاج علاجاً مضاداً للتخثر'
      : score === 1 && _chk('chads-sc') ? 'النساء فقط: قد لا يحتجن علاجاً — تقييم فردي'
      : 'ضمادات دم موصى بها (OAC) — Warfarin أو NOAC';

    _riskResult('chads',
      '<div style="font-size:2rem;font-weight:900;color:' + (score >= 2 ? 'var(--red)' : score === 1 ? 'var(--amber)' : 'var(--green)') + '">' + score + '</div>' +
      '<div style="font-size:0.85rem;color:var(--muted)">خطر السكتة السنوي: <b>' + riskPct + '%</b></div>' +
      '<div style="margin-top:6px;padding:8px;border-radius:6px;background:rgba(255,255,255,0.05);font-size:0.8rem;font-weight:700">' + recommendation + '</div>'
    );
  }

  function calcHASBLED() {
    var score = 0;
    ['hb-h','hb-a','hb-s','hb-b','hb-l','hb-e','hb-d'].forEach(function (id) { if (_chk(id)) score++; });
    var cat = score <= 1 ? { label: 'منخفض', color: 'var(--green)' }
      : score <= 2 ? { label: 'متوسط', color: 'var(--amber)' }
      : { label: 'مرتفع ≥ 3', color: 'var(--red)' };

    _riskResult('hasbled',
      '<div style="font-size:2rem;font-weight:900;color:' + cat.color + '">' + score + '</div>' +
      '<div style="font-weight:700;color:' + cat.color + '">خطر نزيف ' + cat.label + '</div>' +
      '<div style="font-size:0.75rem;color:var(--muted);margin-top:4px">درجة ≥ 3: عالي الخطورة — راجع عوامل الخطر القابلة للتعديل</div>'
    );
  }

  function calcASCVD() {
    /* Simplified ASCVD — Pooled Cohort Equations (approximation) */
    var age  = parseInt(_v('asc-age'))  || 55;
    var sbp  = parseInt(_v('asc-sbp'))  || 130;
    var tc   = parseInt(_v('asc-tc'))   || 200;
    var hdl  = parseInt(_v('asc-hdl'))  || 50;
    var sex  = _v('asc-sex');
    var race = _v('asc-race');
    var bpRx = _v('asc-bprx') === 'نعم';
    var smk  = _v('asc-smk') === 'نعم';
    var dm   = _v('asc-dm') === 'نعم';

    /* Simplified linear approximation */
    var base = sex === 'ذكر' ? -7.1 : -12.8;
    var coeff = 0;
    coeff += Math.log(age) * (sex === 'ذكر' ? 4.3 : 5.0);
    coeff += Math.log(tc)  * (sex === 'ذكر' ? 1.6 : 1.9);
    coeff -= Math.log(hdl) * (sex === 'ذكر' ? 2.2 : 2.4);
    coeff += Math.log(sbp) * (bpRx ? (sex === 'ذكر' ? 2.0 : 2.5) : (sex === 'ذكر' ? 1.8 : 2.1));
    if (smk) coeff += sex === 'ذكر' ? 0.8 : 0.9;
    if (dm)  coeff += sex === 'ذكر' ? 0.6 : 0.7;
    if (race.includes('African')) coeff += 0.5;

    var risk = Math.round((1 - Math.exp(-Math.exp(coeff + base))) * 100);
    risk = Math.max(1, Math.min(99, risk));

    var cat = risk < 5 ? { label: 'منخفض', color: 'var(--green)' }
      : risk < 7.5 ? { label: 'حدي', color: 'var(--teal)' }
      : risk < 20 ? { label: 'متوسط', color: 'var(--amber)' }
      : { label: 'مرتفع', color: 'var(--red)' };

    _riskResult('ascvd',
      '<div style="font-size:2rem;font-weight:900;color:' + cat.color + '">' + risk + '%</div>' +
      '<div style="font-weight:700;color:' + cat.color + '">' + cat.label + ' (ACC/AHA 10-Year)</div>' +
      '<div style="font-size:0.75rem;color:var(--muted);margin-top:4px">' +
        (risk >= 7.5 ? '⚠️ يُنصح بعلاج الستاتين' : risk >= 5 ? 'ناقش الستاتين مع المريض' : '✅ متابعة وتعديل نمط حياة') +
      '</div>'
    );
  }

  function calcGRACE() {
    var age    = parseInt(_v('grace-age'))  || 60;
    var hr     = parseInt(_v('grace-hr'))   || 80;
    var sbp    = parseInt(_v('grace-sbp'))  || 120;
    var cr     = parseFloat(_v('grace-cr')) || 1.0;
    var st     = _v('grace-st')   === 'نعم';
    var enz    = _v('grace-enz')  === 'نعم';
    var ca     = _v('grace-ca')   === 'نعم';
    var killip = _v('grace-killip') || '';

    /* GRACE simplified point scoring */
    var pts = 0;
    /* Age */
    if (age < 30) pts += 0;
    else if (age <= 39) pts += 8;
    else if (age <= 49) pts += 25;
    else if (age <= 59) pts += 41;
    else if (age <= 69) pts += 58;
    else if (age <= 79) pts += 75;
    else pts += 91;

    /* HR */
    if (hr < 50) pts += 0;
    else if (hr <= 69) pts += 3;
    else if (hr <= 89) pts += 9;
    else if (hr <= 109) pts += 15;
    else if (hr <= 149) pts += 24;
    else if (hr <= 199) pts += 38;
    else pts += 46;

    /* SBP */
    if (sbp < 80) pts += 58;
    else if (sbp <= 99) pts += 53;
    else if (sbp <= 119) pts += 43;
    else if (sbp <= 139) pts += 34;
    else if (sbp <= 159) pts += 24;
    else if (sbp <= 199) pts += 10;
    else pts += 0;

    /* Creatinine */
    if (cr < 0.4) pts += 1;
    else if (cr < 0.8) pts += 4;
    else if (cr < 1.2) pts += 7;
    else if (cr < 1.6) pts += 10;
    else if (cr < 2.0) pts += 13;
    else if (cr < 4.0) pts += 21;
    else pts += 28;

    /* Killip */
    if (killip.includes('II')) pts += 20;
    else if (killip.includes('III')) pts += 39;
    else if (killip.includes('IV')) pts += 59;

    if (st)  pts += 28;
    if (enz) pts += 14;
    if (ca)  pts += 39;

    /* Mortality risk */
    var mortality = pts <= 60 ? '< 1%' : pts <= 80 ? '1-3%' : pts <= 100 ? '3-8%' : pts <= 120 ? '8-15%' : pts <= 140 ? '15-25%' : '> 25%';
    var risk_cat = pts <= 80 ? { label: 'منخفض', color: 'var(--green)' }
      : pts <= 118 ? { label: 'متوسط', color: 'var(--amber)' }
      : { label: 'مرتفع', color: 'var(--red)' };

    _riskResult('grace',
      '<div style="font-size:2rem;font-weight:900;color:' + risk_cat.color + '">' + pts + '</div>' +
      '<div style="font-weight:700;color:' + risk_cat.color + '">خطر ' + risk_cat.label + '</div>' +
      '<div style="font-size:0.8rem;color:var(--muted);margin-top:4px">خطر الوفاة في المستشفى: <b>' + mortality + '</b></div>'
    );
  }

  function _riskResult(key, html, errMsg, errType) {
    var el = document.getElementById('_risk-result-' + key);
    if (!el) return;
    if (errMsg) {
      el.innerHTML = '<div style="color:var(--red);font-size:0.8rem;padding:8px">' + errMsg + '</div>';
      return;
    }
    el.innerHTML = [
      '<div style="text-align:center;padding:14px;border-radius:10px;',
        'background:rgba(255,255,255,0.03);border:1px solid var(--border);margin-top:8px">',
        html,
        '<div style="font-size:0.68rem;color:var(--muted);margin-top:6px">',
          '* هذه الحاسبات للاسترشاد السريري فقط — لا تُغني عن التقدير الطبي.',
        '</div>',
      '</div>'
    ].join('');
  }

  /* ══════════════════════════════════════════════════════════════════
   * 8. SAVE ACTIONS
   * ══════════════════════════════════════════════════════════════════ */
  function addBPReading() {
    var sys   = parseInt(document.getElementById('_bp-sys')?.value);
    var dia   = parseInt(document.getElementById('_bp-dia')?.value);
    var date  = document.getElementById('_bp-date')?.value;
    var time  = document.getElementById('_bp-time')?.value;
    var pulse = document.getElementById('_bp-pulse')?.value;
    var arm   = document.getElementById('_bp-arm')?.value;
    var notes = document.getElementById('_bp-notes')?.value.trim();

    if (!sys || !dia || sys < 60 || sys > 280 || dia < 40 || dia > 180) {
      if (typeof window.toast === 'function') window.toast('⚠️ يرجى إدخال قيم ضغط صحيحة', 'err');
      return;
    }

    var reading = { date: date || new Date().toISOString().split('T')[0], time: time || '', systolic: sys, diastolic: dia, pulse: pulse || '', arm: arm || 'right', notes: notes, recordedAt: new Date().toISOString() };
    _bpLog.push(reading);

    _saveToFirebase('specialty_data/cardiology/bp_log', reading).then(function () {
      if (typeof window.toast === 'function') window.toast('✅ تم حفظ قراءة ضغط الدم', 'ok');
      var container = document.getElementById(_containerId);
      if (container) { container.innerHTML = _buildMainHTML(); _attachStyles(); _switchTab('bp'); _drawBPChart(); }
    });
  }

  function saveECGReport() {
    var stChips = [];
    document.querySelectorAll('#_ecg-st-chips span').forEach(function (el) {
      if (el.dataset.selected === '1') stChips.push(el.dataset.text);
    });

    var report = {
      date: _v('ecg-date') || new Date().toISOString().split('T')[0],
      rhythm: _v('ecg-rhythm'), axis: _v('ecg-axis'),
      hr: _v('ecg-hr'), qt: _v('ecg-qt'), qtc: _v('ecg-qtc'),
      p_wave: _v('ecg-p'), qrs: _v('ecg-qrs'),
      stChanges: stChips,
      notes: _v('ecg-notes'),
      savedAt: new Date().toISOString()
    };

    _ecgReports.push(report);
    _saveToFirebase('specialty_data/cardiology/ecg_reports', report).then(function () {
      if (typeof window.toast === 'function') window.toast('✅ تم حفظ تقرير رسم القلب', 'ok');
      var container = document.getElementById(_containerId);
      if (container) { container.innerHTML = _buildMainHTML(); _attachStyles(); _switchTab('ecg'); }
    });
  }

  function saveEchoReport() {
    var report = {
      date: _v('echo-date') || new Date().toISOString().split('T')[0],
      ef: _v('echo-ef'), lvedd: _v('echo-lvedd'), lvesd: _v('echo-lvesd'),
      ivs: _v('echo-ivs'), lvpw: _v('echo-lvpw'), pasp: _v('echo-pasp'), la: _v('echo-la'),
      mitral: _v('echo-mitral'), aortic: _v('echo-aortic'),
      tricuspid: _v('echo-tricusp'), retina: _v('echo-ret'),
      pericardium: _v('echo-peri'),
      notes: _v('echo-notes'),
      savedAt: new Date().toISOString()
    };

    _echoReports.push(report);
    _saveToFirebase('specialty_data/cardiology/echo_reports', report).then(function () {
      if (typeof window.toast === 'function') window.toast('✅ تم حفظ تقرير الإيكو', 'ok');
      var container = document.getElementById(_containerId);
      if (container) { container.innerHTML = _buildMainHTML(); _attachStyles(); _switchTab('echo'); }
    });
  }

  /* ══════════════════════════════════════════════════════════════════
   * 9. BP CHART — Canvas 2D
   * ══════════════════════════════════════════════════════════════════ */
  function _drawBPChart() {
    var canvas = document.getElementById('_bp-canvas');
    if (!canvas || !_bpLog.length) return;

    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var pad = { t: 20, r: 20, b: 35, l: 50 };
    var chartW = W - pad.l - pad.r;
    var chartH = H - pad.t - pad.b;

    ctx.clearRect(0, 0, W, H);

    var sysVals = _bpLog.map(function (r) { return parseInt(r.systolic) || 0; });
    var diaVals = _bpLog.map(function (r) { return parseInt(r.diastolic) || 0; });
    var allVals = sysVals.concat(diaVals);
    var minVal = Math.max(40, Math.min.apply(null, allVals) - 10);
    var maxVal = Math.min(240, Math.max.apply(null, allVals) + 10);

    var scaleX = function (i) { return pad.l + (i / Math.max(1, _bpLog.length - 1)) * chartW; };
    var scaleY = function (v) { return pad.t + chartH - ((v - minVal) / (maxVal - minVal)) * chartH; };

    /* Grid */
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    [80, 100, 120, 130, 140, 160, 180].forEach(function (v) {
      if (v >= minVal && v <= maxVal) {
        ctx.beginPath();
        ctx.moveTo(pad.l, scaleY(v)); ctx.lineTo(pad.l + chartW, scaleY(v));
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '10px monospace';
        ctx.fillText(v, pad.l - 36, scaleY(v) + 4);
      }
    });

    /* Target line 130 */
    ctx.strokeStyle = 'rgba(16,185,129,0.4)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.l, scaleY(130)); ctx.lineTo(pad.l + chartW, scaleY(130));
    ctx.stroke();
    ctx.setLineDash([]);

    /* Systolic line */
    _drawLine(ctx, _bpLog, scaleX, scaleY, 'systolic', '#ef4444', 2.5);
    /* Diastolic line */
    _drawLine(ctx, _bpLog, scaleX, scaleY, 'diastolic', '#0ea5e9', 2);

    /* X Labels */
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '9px sans-serif';
    _bpLog.forEach(function (r, i) {
      if (_bpLog.length <= 8 || i % Math.ceil(_bpLog.length / 8) === 0) {
        var label = (r.date || '').substring(5); /* MM-DD */
        ctx.fillText(label, scaleX(i) - 12, H - 8);
      }
    });

    /* Legend */
    ctx.fillStyle = '#ef4444'; ctx.fillRect(pad.l, 5, 16, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '10px sans-serif';
    ctx.fillText('الانقباضي', pad.l + 20, 12);
    ctx.fillStyle = '#0ea5e9'; ctx.fillRect(pad.l + 90, 5, 16, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('الانبساطي', pad.l + 110, 12);
  }

  function _drawLine(ctx, data, scaleX, scaleY, key, color, lw) {
    if (!data.length) return;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    data.forEach(function (r, i) {
      var v = parseInt(r[key]) || 0;
      if (i === 0) ctx.moveTo(scaleX(i), scaleY(v));
      else ctx.lineTo(scaleX(i), scaleY(v));
    });
    ctx.stroke();
    /* Dots */
    data.forEach(function (r, i) {
      var v = parseInt(r[key]) || 0;
      ctx.beginPath();
      ctx.arc(scaleX(i), scaleY(v), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });
  }

  /* ══════════════════════════════════════════════════════════════════
   * 10. HELPERS
   * ══════════════════════════════════════════════════════════════════ */
  function liveBPClass() {
    var sys = parseInt(document.getElementById('_bp-sys')?.value);
    var dia = parseInt(document.getElementById('_bp-dia')?.value);
    var el = document.getElementById('_bp-live-class');
    if (!el) return;
    if (!sys || !dia) { el.innerHTML = ''; return; }
    var cat = _bpCategory(sys, dia);
    el.innerHTML = '<span style="color:' + cat.color + '">' + sys + '/' + dia + ' — ' + cat.label + '</span>';
  }

  function toggleSTChip(el) {
    var selected = el.dataset.selected === '1';
    el.dataset.selected = selected ? '0' : '1';
    el.style.background = selected ? 'var(--surf)' : 'rgba(239,68,68,0.15)';
    el.style.color = selected ? 'var(--muted)' : '#ef4444';
    el.style.borderColor = selected ? 'var(--border)' : 'rgba(239,68,68,0.4)';
  }

  function _bpCategory(sys, dia) {
    if (!sys || !dia) return { label: '—', color: 'var(--muted)' };
    if (sys < 120 && dia < 80) return { label: 'طبيعي ✅', color: 'var(--green)' };
    if (sys < 130 && dia < 80) return { label: 'مرتفع-طبيعي', color: '#22d3ee' };
    if (sys < 140 || dia < 90) return { label: 'ارتفاع مرحلة 1', color: 'var(--amber)' };
    if (sys < 180 || dia < 120) return { label: 'ارتفاع مرحلة 2', color: '#f97316' };
    return { label: 'أزمة ضغط! 🚨', color: 'var(--red)' };
  }

  function _statCard(emoji, label, value, unit, color) {
    return [
      '<div style="padding:12px;border:1px solid var(--border);border-radius:10px;text-align:center">',
        '<div style="font-size:1.3rem">', emoji, '</div>',
        '<div style="font-size:0.68rem;color:var(--muted);margin:2px 0">', label, '</div>',
        '<div style="font-size:1rem;font-weight:900;color:', color, '">',
          value, unit ? ' <span style="font-size:0.7rem;font-weight:400">' + unit + '</span>' : '',
        '</div>',
      '</div>'
    ].join('');
  }

  function _v(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  function _chk(id) {
    var el = document.getElementById(id);
    return el ? el.checked : false;
  }

  function _saveToFirebase(path, data) {
    if (typeof db === 'undefined' || typeof BASE === 'undefined' || !_patientId) {
      return Promise.resolve();
    }
    return db.ref(BASE + '/patients/' + _patientId + '/' + path).push(data);
  }

  function _loadData(patientId) {
    if (typeof db === 'undefined' || typeof BASE === 'undefined') return Promise.resolve({});
    var base = BASE + '/patients/' + patientId + '/specialty_data/cardiology';
    return Promise.all([
      db.ref(base + '/bp_log').once('value').then(function (s) { return s.val() ? Object.values(s.val()) : []; }),
      db.ref(base + '/ecg_reports').once('value').then(function (s) { return s.val() ? Object.values(s.val()) : []; }),
      db.ref(base + '/echo_reports').once('value').then(function (s) { return s.val() ? Object.values(s.val()) : []; })
    ]).then(function (res) {
      return { bpLog: res[0], ecgReports: res[1], echoReports: res[2] };
    });
  }

  function _attachStyles() {
    if (document.getElementById('_cardio-styles')) return;
    var style = document.createElement('style');
    style.id = '_cardio-styles';
    style.textContent = '.argon-cardio-module .fi { width:100%;box-sizing:border-box; }';
    document.head.appendChild(style);
  }

  /* ══════════════════════════════════════════════════════════════════
   * 11. TAB SWITCHERS
   * ══════════════════════════════════════════════════════════════════ */
  function _switchTab(tabId) {
    _activeTab = tabId;
    ['bp', 'ecg', 'echo', 'risk'].forEach(function (t) {
      var c = document.getElementById('_cTab-' + t);
      var b = document.getElementById('_cTabBtn-' + t);
      if (c) c.style.display = (t === tabId) ? 'block' : 'none';
      if (b) {
        b.style.background = t === tabId ? 'rgba(239,68,68,0.1)' : 'var(--surf)';
        b.style.color      = t === tabId ? '#ef4444' : 'var(--muted)';
        b.style.borderColor= t === tabId ? 'rgba(239,68,68,0.3)' : 'var(--border)';
      }
    });
    if (tabId === 'bp') setTimeout(_drawBPChart, 50);
    if (tabId === 'risk') setTimeout(function () { CardioModule.switchRiskTab('framingham'); }, 50);
  }

  function switchRiskTab(id) {
    ['framingham','ascvd','chads','hasbled','grace'].forEach(function (k) {
      var p = document.getElementById('_riskPanel-' + k);
      var b = document.getElementById('_riskTabBtn-' + k);
      if (p) p.style.display = k === id ? 'block' : 'none';
      if (b) {
        b.style.background  = k === id ? 'rgba(239,68,68,0.1)' : 'var(--surf)';
        b.style.color       = k === id ? '#ef4444' : 'var(--muted)';
        b.style.borderColor = k === id ? 'rgba(239,68,68,0.3)' : 'var(--border)';
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════
   * 12. PUBLIC API
   * ══════════════════════════════════════════════════════════════════ */
  global.CardioModule = {
    render: render,
    switchTab: _switchTab,
    switchRiskTab: switchRiskTab,
    addBPReading: addBPReading,
    saveECGReport: saveECGReport,
    saveEchoReport: saveEchoReport,
    liveBPClass: liveBPClass,
    toggleSTChip: toggleSTChip,
    calcFramingham: calcFramingham,
    calcASCVD: calcASCVD,
    calcCHADS: calcCHADS,
    calcHASBLED: calcHASBLED,
    calcGRACE: calcGRACE,
    getBPLog: function () { return _bpLog.slice(); },
    getECGReport: function () { return _ecgReports.length ? _ecgReports[_ecgReports.length - 1] : null; },
    getLatestEF: function () { return _echoReports.length ? _echoReports[_echoReports.length - 1].ef : null; },
    init: function () { console.log('[CardioModule] v1.0 ready'); }
  };

  console.log('%c❤️ CardioModule v1.0 loaded', 'color:#ef4444;font-weight:bold');

}(window));
