/**
 * 🦷 ARGON MEDICAL OS — Dental Chart Module
 * specialty-modules/dental_chart_module.js — v1.0
 *
 * الرسم البياني التفاعلي الكامل للأسنان — ترميز FDI (ISO 3950)
 *
 * الاستخدام:
 *   DentalChartModule.render('containerId', patientId)
 *   DentalChartModule.getChartData()  // للحفظ مع الزيارة
 *
 * يتطلب: Firebase db, BASE, activePatientId (من emr-app.js)
 */

(function (global) {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════
   * CONSTANTS
   * ══════════════════════════════════════════════════════════════════ */
  var TEETH_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  var TEETH_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

  var STATUSES = {
    healthy:    { labelAr: 'سليم',          color: '#10b981', emoji: '🦷', priority: 0 },
    filling:    { labelAr: 'حشوة',           color: '#f59e0b', emoji: '✏️', priority: 1 },
    crown:      { labelAr: 'تاج',            color: '#3b82f6', emoji: '👑', priority: 2 },
    root_canal: { labelAr: 'علاج عصب',       color: '#ef4444', emoji: '⚠️', priority: 3 },
    decay:      { labelAr: 'نخر/تسوس',       color: '#dc2626', emoji: '🔴', priority: 4 },
    bridge:     { labelAr: 'جسر',            color: '#0891b2', emoji: '🌉', priority: 5 },
    implant:    { labelAr: 'زرع',            color: '#8b5cf6', emoji: '🔩', priority: 6 },
    missing:    { labelAr: 'مفقود/مخلوع',   color: '#94a3b8', emoji: '❌', priority: 7 },
    veneer:     { labelAr: 'قشرة تجميلية',   color: '#ec4899', emoji: '✨', priority: 8 },
    needs_rx:   { labelAr: 'يحتاج علاجاً',   color: '#f97316', emoji: '🔔', priority: 9 }
  };

  /* ══════════════════════════════════════════════════════════════════
   * MODULE STATE
   * ══════════════════════════════════════════════════════════════════ */
  var _chart = {};
  var _currentPatientId = null;
  var _containerId = null;
  var _unsavedChanges = false;

  /* ══════════════════════════════════════════════════════════════════
   * 1. RENDER — نقطة الدخول الرئيسية
   * ══════════════════════════════════════════════════════════════════ */
  function render(containerId, patientId) {
    _containerId = containerId;
    _currentPatientId = patientId;

    var container = document.getElementById(containerId);
    if (!container) {
      console.warn('[DentalChart] Container not found:', containerId);
      return;
    }

    container.innerHTML = _buildLoadingHTML();

    _loadChart(patientId).then(function (chart) {
      _chart = chart || {};
      container.innerHTML = _buildChartHTML();
      _attachStyles();
    }).catch(function (err) {
      console.warn('[DentalChart] Load error:', err);
      _chart = {};
      container.innerHTML = _buildChartHTML();
      _attachStyles();
    });
  }

  /* ══════════════════════════════════════════════════════════════════
   * 2. HTML BUILDERS
   * ══════════════════════════════════════════════════════════════════ */
  function _buildLoadingHTML() {
    return '<div style="text-align:center;padding:30px;color:var(--muted)">' +
      '<i class="fas fa-circle-notch fa-spin" style="font-size:1.5rem;color:var(--teal)"></i>' +
      '<p style="margin-top:10px">جاري تحميل الرسم البياني للأسنان...</p></div>';
  }

  function _buildChartHTML() {
    var upperTeeth = TEETH_UPPER.map(function (n) { return _buildToothCell(n); }).join('');
    var lowerTeeth = TEETH_LOWER.map(function (n) { return _buildToothCell(n); }).join('');
    var legend = _buildLegend();
    var summary = _buildSummary();

    return [
      '<div class="argon-dental-chart" style="font-family:\'Tajawal\',sans-serif;direction:rtl">',

      /* ── Header ── */
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">',
        '<div style="font-size:1rem;font-weight:800;color:var(--teal)">',
          '🦷 الرسم البياني للأسنان — FDI (ISO 3950)',
        '</div>',
        '<div style="display:flex;gap:8px">',
          '<button onclick="DentalChartModule.saveChart()" ',
            'id="_dental-save-btn" ',
            'style="padding:6px 14px;background:var(--teal);color:#fff;border:none;border-radius:8px;',
            'font-family:\'Tajawal\',sans-serif;font-weight:700;cursor:pointer;font-size:0.8rem">',
            '<i class="fas fa-save"></i> حفظ الرسم',
          '</button>',
          '<button onclick="DentalChartModule.resetChart()" ',
            'style="padding:6px 14px;background:rgba(239,68,68,0.1);color:var(--red);',
            'border:1px solid rgba(239,68,68,0.3);border-radius:8px;font-family:\'Tajawal\',sans-serif;',
            'font-weight:700;cursor:pointer;font-size:0.8rem">',
            '<i class="fas fa-undo"></i> إعادة تعيين',
          '</button>',
        '</div>',
      '</div>',

      /* ── Unsaved Indicator ── */
      '<div id="_dental-unsaved" style="display:none;font-size:0.75rem;color:var(--amber);',
        'font-weight:700;margin-bottom:8px">',
        '● تغييرات غير محفوظة',
      '</div>',

      /* ── Upper Jaw ── */
      '<div style="text-align:center;font-size:0.72rem;font-weight:700;color:var(--muted);',
        'padding:4px 0;background:rgba(255,255,255,0.02);border-radius:6px;margin-bottom:6px">',
        'الفك العلوي — الفص الأيمن &nbsp;|&nbsp; الفص الأيسر',
      '</div>',
      '<div id="_dental-upper" style="display:flex;justify-content:center;gap:3px;flex-wrap:nowrap;overflow-x:auto;padding:4px 0">',
        upperTeeth,
      '</div>',

      /* ── Midline ── */
      '<div style="text-align:center;border-top:1px dashed rgba(255,255,255,0.15);',
        'border-bottom:1px dashed rgba(255,255,255,0.15);padding:3px 0;margin:8px 0;',
        'font-size:0.65rem;color:var(--muted)">',
        '── خط الوسط (Midline) ──',
      '</div>',

      /* ── Lower Jaw ── */
      '<div id="_dental-lower" style="display:flex;justify-content:center;gap:3px;flex-wrap:nowrap;overflow-x:auto;padding:4px 0">',
        lowerTeeth,
      '</div>',
      '<div style="text-align:center;font-size:0.72rem;font-weight:700;color:var(--muted);',
        'padding:4px 0;background:rgba(255,255,255,0.02);border-radius:6px;margin-top:6px">',
        'الفك السفلي — الفص الأيمن &nbsp;|&nbsp; الفص الأيسر',
      '</div>',

      /* ── Legend ── */
      legend,

      /* ── Summary ── */
      summary,

      '</div>' /* .argon-dental-chart */
    ].join('');
  }

  function _buildToothCell(number) {
    var toothData = _chart[number] || {};
    var status = toothData.status || 'healthy';
    var statusCfg = STATUSES[status] || STATUSES.healthy;
    var hasNote = toothData.notes ? ' 📝' : '';
    var isRequired = toothData.requiresTreatment ? '!' : '';

    return [
      '<div class="argon-tooth-cell" ',
        'data-tooth="', number, '" ',
        'data-status="', status, '" ',
        'title="سن ', number, ' — ', statusCfg.labelAr, (toothData.notes ? '\n' + toothData.notes : ''), '" ',
        'onclick="DentalChartModule.openToothEditor(', number, ')" ',
        'style="',
          'width:30px;min-width:30px;height:40px;',
          'background:', statusCfg.color + '20', ';',
          'border:2px solid ', statusCfg.color, ';',
          'border-radius:7px;display:flex;flex-direction:column;',
          'align-items:center;justify-content:center;',
          'cursor:pointer;transition:all 0.15s;position:relative;',
          'flex-shrink:0;',
        '">',
        '<div style="font-size:0.52rem;color:', statusCfg.color, ';font-weight:900;line-height:1">',
          number,
        '</div>',
        '<div style="font-size:0.85rem;line-height:1.1">',
          statusCfg.emoji,
        '</div>',
        hasNote || isRequired ? [
          '<div style="position:absolute;top:-4px;left:-4px;font-size:0.5rem;',
            'background:', statusCfg.color, ';color:#fff;border-radius:50%;',
            'width:12px;height:12px;display:flex;align-items:center;justify-content:center;',
            'font-weight:900">',
            isRequired || '!',
          '</div>'
        ].join('') : '',
      '</div>',
    ].join('');
  }

  function _buildLegend() {
    var items = Object.entries(STATUSES).map(function (entry) {
      var key = entry[0]; var cfg = entry[1];
      return [
        '<span style="display:inline-flex;align-items:center;gap:3px;',
          'background:', cfg.color + '15', ';border:1px solid ', cfg.color + '30', ';',
          'padding:2px 7px;border-radius:6px;font-size:0.65rem;font-weight:700;',
          'color:', cfg.color, ';cursor:pointer;margin:2px" ',
          'onclick="DentalChartModule.filterByStatus(\'', key, '\')" ',
          'title="اضغط للتصفية">',
          cfg.emoji, ' ', cfg.labelAr,
        '</span>'
      ].join('');
    }).join('');

    return [
      '<div style="margin-top:12px;padding:10px;background:rgba(255,255,255,0.02);',
        'border:1px solid var(--border);border-radius:10px">',
        '<div style="font-size:0.7rem;font-weight:700;color:var(--muted);margin-bottom:6px">',
          '🎨 مفتاح الألوان (اضغط للتصفية):',
        '</div>',
        '<div style="display:flex;flex-wrap:wrap;gap:3px">',
          items,
        '</div>',
      '</div>'
    ].join('');
  }

  function _buildSummary() {
    var counts = {};
    Object.keys(STATUSES).forEach(function (k) { counts[k] = 0; });

    Object.values(_chart).forEach(function (t) {
      var s = t.status || 'healthy';
      if (counts[s] !== undefined) counts[s]++;
    });

    var total = TEETH_UPPER.length + TEETH_LOWER.length;
    var recorded = Object.keys(_chart).length;
    var needTreatment = (counts.decay || 0) + (counts.needs_rx || 0) + (counts.root_canal || 0);

    return [
      '<div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr 1fr;',
        'gap:8px">',
        _summaryCard('fa-tooth', 'إجمالي الأسنان', total, 'var(--muted)'),
        _summaryCard('fa-check-circle', 'مُسجَّلة', recorded, 'var(--teal)'),
        _summaryCard('fa-exclamation-triangle', 'تحتاج علاج', needTreatment, needTreatment > 0 ? 'var(--amber)' : 'var(--muted)'),
      '</div>'
    ].join('');
  }

  function _summaryCard(icon, label, value, color) {
    return [
      '<div style="text-align:center;padding:8px;background:rgba(255,255,255,0.02);',
        'border:1px solid var(--border);border-radius:8px">',
        '<div style="font-size:0.7rem;color:var(--muted);margin-bottom:2px">',
          '<i class="fas ', icon, '"></i> ', label,
        '</div>',
        '<div style="font-size:1.2rem;font-weight:900;color:', color, '">', value, '</div>',
      '</div>'
    ].join('');
  }

  /* ══════════════════════════════════════════════════════════════════
   * 3. TOOTH EDITOR OVERLAY
   * ══════════════════════════════════════════════════════════════════ */
  function openToothEditor(toothNumber) {
    var existing = document.getElementById('_dental-editor-overlay');
    if (existing) existing.remove();

    var toothData = _chart[toothNumber] || {};
    var currentStatus = toothData.status || 'healthy';

    var statusOptions = Object.entries(STATUSES).map(function (entry) {
      var k = entry[0]; var cfg = entry[1];
      return [
        '<option value="', k, '" ', (k === currentStatus ? 'selected' : ''), '>',
          cfg.emoji, ' ', cfg.labelAr,
        '</option>'
      ].join('');
    }).join('');

    var overlay = document.createElement('div');
    overlay.id = '_dental-editor-overlay';
    overlay.style.cssText = [
      'position:fixed;inset:0;background:rgba(2,7,6,0.85);',
      'backdrop-filter:blur(10px);z-index:120000;',
      'display:flex;align-items:center;justify-content:center;',
      'padding:20px;font-family:\'Tajawal\',sans-serif;',
    ].join('');

    overlay.innerHTML = [
      '<div style="background:var(--panel);border:1px solid var(--border);',
        'border-radius:18px;padding:24px;width:100%;max-width:380px;',
        'box-shadow:0 20px 40px rgba(0,0,0,0.5)">',

        /* Header */
        '<div style="font-size:1.05rem;font-weight:900;color:var(--teal);',
          'margin-bottom:16px;display:flex;align-items:center;gap:8px">',
          '<span>🦷 تعديل السن رقم <span style="font-family:monospace">', toothNumber, '</span></span>',
        '</div>',

        /* Status Select */
        '<div style="margin-bottom:12px">',
          '<label style="font-size:0.8rem;color:var(--muted);display:block;margin-bottom:6px">',
            '<i class="fas fa-circle-dot"></i> حالة السن',
          '</label>',
          '<select id="_dental-status-sel" ',
            'style="width:100%;padding:10px;background:var(--surf);',
            'border:1px solid var(--border);border-radius:8px;',
            'color:var(--text);font-family:\'Tajawal\',sans-serif;font-size:0.9rem">',
            statusOptions,
          '</select>',
        '</div>',

        /* Surface */
        '<div style="margin-bottom:12px">',
          '<label style="font-size:0.8rem;color:var(--muted);display:block;margin-bottom:6px">',
            'وجوه الحشوة (اختياري) — MOD, MO, DO...',
          '</label>',
          '<input type="text" id="_dental-surface-inp" value="', (toothData.surface || ''), '" ',
            'placeholder="مثال: MOD" dir="ltr" ',
            'style="width:100%;padding:9px 12px;background:var(--surf);',
            'border:1px solid var(--border);border-radius:8px;',
            'color:var(--text);font-family:\'IBM Plex Mono\',monospace;',
            'box-sizing:border-box">',
        '</div>',

        /* Material */
        '<div style="margin-bottom:12px">',
          '<label style="font-size:0.8rem;color:var(--muted);display:block;margin-bottom:6px">',
            'مادة العلاج (اختياري)',
          '</label>',
          '<select id="_dental-material-sel" ',
            'style="width:100%;padding:9px;background:var(--surf);',
            'border:1px solid var(--border);border-radius:8px;',
            'color:var(--text);font-family:\'Tajawal\',sans-serif">',
            '<option value="">—</option>',
            '<option value="composite" ', toothData.material === 'composite' ? 'selected' : '', '>مركبة (Composite)</option>',
            '<option value="amalgam" ', toothData.material === 'amalgam' ? 'selected' : '', '>أمالغم (Amalgam)</option>',
            '<option value="porcelain" ', toothData.material === 'porcelain' ? 'selected' : '', '>خزف (Porcelain)</option>',
            '<option value="pfm" ', toothData.material === 'pfm' ? 'selected' : '', '>خزف-معدن (PFM)</option>',
            '<option value="zirconia" ', toothData.material === 'zirconia' ? 'selected' : '', '>زيركونيا</option>',
            '<option value="implant_titanium" ', toothData.material === 'implant_titanium' ? 'selected' : '', '>تيتانيوم (زرع)</option>',
          '</select>',
        '</div>',

        /* Requires Treatment Checkbox */
        '<div style="margin-bottom:12px;display:flex;align-items:center;gap:8px">',
          '<input type="checkbox" id="_dental-needs-rx" ',
            (toothData.requiresTreatment ? 'checked' : ''),
            ' style="width:16px;height:16px;cursor:pointer">',
          '<label for="_dental-needs-rx" style="font-size:0.82rem;cursor:pointer;color:var(--amber);font-weight:700">',
            '⚠️ مُدرج في خطة العلاج',
          '</label>',
        '</div>',

        /* Notes */
        '<div style="margin-bottom:16px">',
          '<label style="font-size:0.8rem;color:var(--muted);display:block;margin-bottom:6px">',
            'ملاحظة سريرية (اختياري)',
          '</label>',
          '<input type="text" id="_dental-note-inp" value="', (toothData.notes || ''), '" ',
            'placeholder="مثال: حشوة قديمة مكسورة — تحتاج استبدال" ',
            'style="width:100%;padding:9px 12px;background:var(--surf);',
            'border:1px solid var(--border);border-radius:8px;',
            'color:var(--text);font-family:\'Tajawal\',sans-serif;',
            'box-sizing:border-box">',
        '</div>',

        /* Action Buttons */
        '<div style="display:flex;gap:8px">',
          '<button onclick="DentalChartModule.saveToothData(', toothNumber, ')" ',
            'style="flex:1;padding:10px;background:var(--teal);color:#fff;border:none;',
            'border-radius:10px;font-family:\'Tajawal\',sans-serif;font-weight:800;',
            'cursor:pointer;font-size:0.9rem">',
            '<i class="fas fa-save"></i> حفظ',
          '</button>',
          '<button onclick="document.getElementById(\'_dental-editor-overlay\').remove()" ',
            'style="padding:10px 18px;background:var(--surf);border:1px solid var(--border);',
            'border-radius:10px;font-family:\'Tajawal\',sans-serif;cursor:pointer;color:var(--text)">',
            'إلغاء',
          '</button>',
        '</div>',

      '</div>'
    ].join('');

    document.body.appendChild(overlay);

    /* close on backdrop */
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });

    /* focus status select */
    setTimeout(function () {
      var sel = document.getElementById('_dental-status-sel');
      if (sel) sel.focus();
    }, 100);
  }

  /* ══════════════════════════════════════════════════════════════════
   * 4. SAVE TOOTH DATA
   * ══════════════════════════════════════════════════════════════════ */
  function saveToothData(toothNumber) {
    var statusSel = document.getElementById('_dental-status-sel');
    var surfaceInp = document.getElementById('_dental-surface-inp');
    var materialSel = document.getElementById('_dental-material-sel');
    var noteInp = document.getElementById('_dental-note-inp');
    var needsRx = document.getElementById('_dental-needs-rx');

    var status = statusSel ? statusSel.value : 'healthy';
    var surface = surfaceInp ? surfaceInp.value.trim().toUpperCase() : '';
    var material = materialSel ? materialSel.value : '';
    var notes = noteInp ? noteInp.value.trim() : '';
    var requiresTreatment = needsRx ? needsRx.checked : false;

    /* تحديث الكاش المحلي */
    _chart[toothNumber] = {
      status: status,
      surface: surface || null,
      material: material || null,
      notes: notes || null,
      requiresTreatment: requiresTreatment,
      updatedAt: new Date().toISOString()
    };

    _unsavedChanges = true;

    /* أغلق الـ overlay */
    var overlay = document.getElementById('_dental-editor-overlay');
    if (overlay) overlay.remove();

    /* أعد رسم الخانة المحدثة فقط */
    _refreshToothCell(toothNumber);

    /* تحديث مؤشر التغييرات */
    var unsavedEl = document.getElementById('_dental-unsaved');
    if (unsavedEl) unsavedEl.style.display = 'block';

    /* toast */
    if (typeof window.toast === 'function') {
      window.toast('✅ تم تحديث السن ' + toothNumber + ' — ' + (STATUSES[status] || {}).labelAr, 'ok');
    }
  }

  function _refreshToothCell(toothNumber) {
    var cell = document.querySelector('[data-tooth="' + toothNumber + '"]');
    if (!cell) return;

    /* أنشئ خانة جديدة من HTML */
    var temp = document.createElement('div');
    temp.innerHTML = _buildToothCell(toothNumber);
    var newCell = temp.firstElementChild;

    /* استبدل الخانة القديمة */
    cell.parentNode.replaceChild(newCell, cell);
  }

  /* ══════════════════════════════════════════════════════════════════
   * 5. SAVE CHART — حفظ كل الرسم في Firebase
   * ══════════════════════════════════════════════════════════════════ */
  function saveChart() {
    if (!_currentPatientId) {
      if (typeof window.toast === 'function') window.toast('⚠️ لا يوجد مريض نشط', 'err');
      return;
    }

    if (typeof db === 'undefined' || typeof BASE === 'undefined') {
      if (typeof window.toast === 'function') window.toast('⚠️ Firebase غير متاح', 'err');
      return;
    }

    var btn = document.getElementById('_dental-save-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...'; }

    var saveData = {
      chart: _chart,
      savedAt: new Date().toISOString(),
      savedBy: (window.ArgonSession ? window.ArgonSession.get().staffId : null) || 'doctor',
      toothCount: Object.keys(_chart).length
    };

    db.ref(BASE + '/patients/' + _currentPatientId + '/specialty_data/dental').set(saveData)
      .then(function () {
        _unsavedChanges = false;
        var unsavedEl = document.getElementById('_dental-unsaved');
        if (unsavedEl) unsavedEl.style.display = 'none';
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> حفظ الرسم'; }
        if (typeof window.toast === 'function') window.toast('✅ تم حفظ الرسم البياني للأسنان بنجاح', 'ok');
      })
      .catch(function (err) {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> حفظ الرسم'; }
        if (typeof window.toast === 'function') window.toast('❌ خطأ في الحفظ: ' + err.message, 'err');
      });
  }

  /* ══════════════════════════════════════════════════════════════════
   * 6. LOAD CHART — من Firebase
   * ══════════════════════════════════════════════════════════════════ */
  function _loadChart(patientId) {
    if (typeof db === 'undefined' || typeof BASE === 'undefined') {
      return Promise.resolve({});
    }

    return db.ref(BASE + '/patients/' + patientId + '/specialty_data/dental/chart')
      .once('value')
      .then(function (snap) { return snap.val() || {}; });
  }

  /* ══════════════════════════════════════════════════════════════════
   * 7. RESET CHART
   * ══════════════════════════════════════════════════════════════════ */
  function resetChart() {
    if (!confirm('هل أنت متأكد من إعادة تعيين الرسم البياني؟ ستُحذف كل البيانات غير المحفوظة.')) return;
    _chart = {};
    _unsavedChanges = false;
    render(_containerId, _currentPatientId);
  }

  /* ══════════════════════════════════════════════════════════════════
   * 8. FILTER BY STATUS
   * ══════════════════════════════════════════════════════════════════ */
  function filterByStatus(status) {
    var cells = document.querySelectorAll('.argon-tooth-cell');
    if (!cells) return;

    cells.forEach(function (cell) {
      var cellStatus = cell.dataset.status || 'healthy';
      cell.style.opacity = (cellStatus === status) ? '1' : '0.25';
    });

    /* إعادة تعيين بعد 3 ثوانٍ */
    setTimeout(function () {
      cells.forEach(function (c) { c.style.opacity = '1'; });
    }, 3000);

    /* Toast */
    var statusLabel = STATUSES[status] ? STATUSES[status].labelAr : status;
    if (typeof window.toast === 'function') {
      window.toast('🔍 تصفية: ' + statusLabel + ' (يختفي التأثير خلال 3 ثوانٍ)', 'ok');
    }
  }

  /* ══════════════════════════════════════════════════════════════════
   * 9. STYLES
   * ══════════════════════════════════════════════════════════════════ */
  function _attachStyles() {
    if (document.getElementById('_dental-chart-styles')) return;
    var style = document.createElement('style');
    style.id = '_dental-chart-styles';
    style.textContent = [
      '.argon-tooth-cell:hover {',
        'transform: scale(1.18) !important;',
        'box-shadow: 0 4px 14px rgba(0,0,0,0.25) !important;',
        'z-index: 10;',
      '}',
      '.argon-tooth-cell:active { transform: scale(1.05) !important; }',
      '#_dental-upper::-webkit-scrollbar,#_dental-lower::-webkit-scrollbar { height:4px; }',
      '#_dental-upper::-webkit-scrollbar-thumb,#_dental-lower::-webkit-scrollbar-thumb {',
        'background: var(--border); border-radius: 2px;',
      '}',
    ].join('\n');
    document.head.appendChild(style);
  }

  /* ══════════════════════════════════════════════════════════════════
   * 10. PUBLIC API
   * ══════════════════════════════════════════════════════════════════ */
  global.DentalChartModule = {
    render: render,
    openToothEditor: openToothEditor,
    saveToothData: saveToothData,
    saveChart: saveChart,
    resetChart: resetChart,
    filterByStatus: filterByStatus,

    /** استخراج بيانات الرسم للحفظ مع الزيارة */
    getChartData: function () {
      return {
        chart: Object.assign({}, _chart),
        summary: _buildChartSummary()
      };
    },

    /** ملخص نصي للرسم (للتقرير المطبوع) */
    getTextSummary: function () {
      var parts = [];
      Object.entries(_chart).forEach(function (entry) {
        var n = entry[0]; var t = entry[1];
        if (t.status && t.status !== 'healthy') {
          var label = STATUSES[t.status] ? STATUSES[t.status].labelAr : t.status;
          var note = t.notes ? ' (' + t.notes + ')' : '';
          parts.push('سن ' + n + ': ' + label + note);
        }
      });
      return parts.length ? parts.join(' — ') : 'كل الأسنان المسجلة سليمة';
    },

    init: function () {
      console.log('[DentalChartModule] v1.0 ready');
    }
  };

  function _buildChartSummary() {
    var counts = {};
    Object.keys(STATUSES).forEach(function (k) { counts[k] = 0; });
    Object.values(_chart).forEach(function (t) {
      if (counts[t.status] !== undefined) counts[t.status]++;
    });
    return counts;
  }

  console.log('%c🦷 DentalChartModule v1.0 loaded', 'color:#3b82f6;font-weight:bold');

}(window));
