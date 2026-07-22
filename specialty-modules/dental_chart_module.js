/**
 * 🦷 ARGON MEDICAL OS — Dental Chart Module
 * specialty-modules/dental_chart_module.js — v2.0 "Clinical Pro"
 *
 * ═══════════════════════════════════════════════════════════════════════
 * الرسم البياني التفاعلي الاحترافي الكامل للأسنان
 * ═══════════════════════════════════════════════════════════════════════
 */

(function (global) {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════
   * 1. CONSTANTS — خرائط الأسنان (FDI / ISO 3950)
   * ══════════════════════════════════════════════════════════════════ */

  var ADULT_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  var ADULT_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

  var PRIMARY_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
  var PRIMARY_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

  var TOOTH_STATUSES = {
    healthy: { labelAr: 'سليم', color: '#10b981', emoji: '🦷' },
    crown: { labelAr: 'تاج', color: '#3b82f6', emoji: '👑' },
    root_canal: { labelAr: 'علاج عصب', color: '#ef4444', emoji: '🩹' },
    veneer: { labelAr: 'قشرة تجميلية', color: '#ec4899', emoji: '✨' },
    bridge_abutment: { labelAr: 'دعامة جسر', color: '#0891b2', emoji: '🌉' },
    bridge_pontic: { labelAr: 'تعويض جسر (فاقد)', color: '#0891b2', emoji: '➖' },
    implant: { labelAr: 'زرعة', color: '#8b5cf6', emoji: '🔩' },
    impacted: { labelAr: 'مطمور', color: '#7c3aed', emoji: '🔒' },
    unerupted: { labelAr: 'لم يبزغ بعد', color: '#cbd5e1', emoji: '⏳' },
    missing: { labelAr: 'مفقود / مخلوع', color: '#94a3b8', emoji: '❌' }
  };

  var SURFACE_CONDITIONS = {
    decay: { labelAr: 'تسوس', color: '#dc2626', glyph: '🔴' },
    filling: { labelAr: 'حشوة', color: '#f59e0b', glyph: '🟧' },
    sealant: { labelAr: 'مادة سادة', color: '#38bdf8', glyph: '🔵' },
    fracture: { labelAr: 'كسر / شرخ', color: '#7f1d1d', glyph: '⚡' },
    wear: { labelAr: 'تآكل/برادة', color: '#a16207', glyph: '🟫' }
  };

  var ORIGINS = {
    existing: { labelAr: 'موجود مسبقاً', badge: '', accent: '#94a3b8' },
    planned: { labelAr: 'مخطط للعلاج', badge: '🗓️', accent: '#0ea5e9' },
    completed: { labelAr: 'منجز اليوم', badge: '✅', accent: '#10b981' }
  };

  var SURFACE_REGIONS = ['top', 'right', 'bottom', 'left', 'center'];

  var REGION_PATHS = {
    top: 'M2,2 L42,2 L29,15 L15,15 Z',
    right: 'M42,2 L29,15 L29,29 L42,42 Z',
    bottom: 'M2,42 L42,42 L29,29 L15,29 Z',
    left: 'M2,2 L15,15 L15,29 L2,42 Z',
    center: 'M15,15 L29,15 L29,29 L15,29 Z'
  };
  var REGION_LABEL_POS = {
    top: [22, 8], bottom: [22, 39], left: [8, 24], right: [36, 24], center: [22, 24]
  };

  var PERM_NAMES = { 1: 'القاطعة المركزية', 2: 'القاطعة الجانبية', 3: 'الناب', 4: 'الضاحك الأول', 5: 'الضاحك الثاني', 6: 'الرحى الأولى', 7: 'الرحى الثانية', 8: 'رحى العقل (الثالثة)' };
  var PRIM_NAMES = { 1: 'القاطعة المركزية اللبنية', 2: 'القاطعة الجانبية اللبنية', 3: 'الناب اللبني', 4: 'الرحى الأولى اللبنية', 5: 'الرحى الثانية اللبنية' };
  var QUAD_SIDE = { 1: 'العلوي الأيمن', 2: 'العلوي الأيسر', 3: 'السفلي الأيسر', 4: 'السفلي الأيمن', 5: 'العلوي الأيمن', 6: 'العلوي الأيسر', 7: 'السفلي الأيسر', 8: 'السفلي الأيمن' };

  var _chart = {};
  var _meta = { dentitionMode: 'adult', bridges: [] };
  var _currentPatientId = null;
  var _containerId = null;
  var _unsavedChanges = false;
  var _currentOriginMode = 'existing';
  var _highlightOrigin = null; // null = عرض عادي, أو 'existing'/'planned'/'completed' = تمييز بصري
  var _selectedSurfaceCond = 'decay';
  var _bridgeMode = false;
  var _bridgeSelection = [];

  function _esc(str) { return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function _isPrimary(num) { return num >= 51 && num <= 85; }
  function _isAnterior(num) { var p = num % 10; return p >= 1 && p <= 3; }
  function _isUpper(num) { var q = Math.floor(num / 10); return q === 1 || q === 2 || q === 5 || q === 6; }
  function _getSideLabels(num) { var q = Math.floor(num / 10); var leftIsMesial = (q === 1 || q === 4 || q === 5 || q === 8); return leftIsMesial ? { left: 'M', right: 'D' } : { left: 'D', right: 'M' }; }

  function _regionLabel(num, region) {
    if (region === 'center') return _isAnterior(num) ? 'I' : 'O';
    if (region === 'top') return 'B';
    if (region === 'bottom') return _isUpper(num) ? 'P' : 'L';
    var sides = _getSideLabels(num);
    if (region === 'left') return sides.left;
    if (region === 'right') return sides.right;
    return '';
  }

  function _labelToRegion(num, label) {
    label = String(label).toUpperCase();
    if (label === 'O' || label === 'I') return 'center';
    if (label === 'B' || label === 'F' || label === 'V') return 'top';
    if (label === 'L' || label === 'P') return 'bottom';
    var sides = _getSideLabels(num);
    if (sides.left === label) return 'left';
    if (sides.right === label) return 'right';
    return null;
  }

  function _anatomicalName(num) {
    var q = Math.floor(num / 10), pos = num % 10;
    var names = _isPrimary(num) ? PRIM_NAMES : PERM_NAMES;
    var posName = names[pos] || 'سن';
    var side = QUAD_SIDE[q] || '';
    return posName + ' ' + side;
  }

  function _fdiToUniversal(num) {
    var q = Math.floor(num / 10), pos = num % 10;
    if (!_isPrimary(num)) {
      if (q === 1) return String(9 - pos);
      if (q === 2) return String(8 + pos);
      if (q === 3) return String(25 - pos);
      if (q === 4) return String(24 + pos);
    } else {
      var letters = 'ABCDEFGHIJKLMNOPQRST';
      var idx = -1;
      if (q === 5) idx = 5 - pos; else if (q === 6) idx = 4 + pos; else if (q === 7) idx = 15 - pos; else if (q === 8) idx = 14 + pos;
      if (idx >= 0 && idx < 20) return letters.charAt(idx);
    }
    return '—';
  }

  function _toothHasOrigin(data, origin) {
    if (!data) return false;
    if (data.status && data.status !== 'healthy' && data.statusOrigin === origin) return true;
    if (data.surfaces) {
      for (var k in data.surfaces) { if (data.surfaces[k] && data.surfaces[k].origin === origin) return true; }
    }
    return false;
  }

  function _findBridgeForTooth(num) {
    var list = _meta.bridges || [];
    for (var i = 0; i < list.length; i++) { if (list[i].teeth.indexOf(num) !== -1) return list[i]; }
    return null;
  }

  function _getPatientName() {
    if (!_currentPatientId) return 'غير محدد';
    try {
      if (typeof document !== 'undefined') {
        var pName = document.querySelector('.pat-name');
        if (pName && pName.textContent) return pName.textContent.trim();
      }
      return 'مريض';
    } catch (e) { return 'مريض'; }
  }

  function _migrateLegacyTooth(num, t) {
    if (!t || t._v2) return t || null;
    var migrated = {
      status: 'healthy', statusOrigin: 'existing',
      surfaces: { center: null, top: null, bottom: null, left: null, right: null },
      material: t.material || null, mobility: null, notes: t.notes || null,
      requiresTreatment: !!t.requiresTreatment, updatedAt: t.updatedAt || new Date().toISOString(), _v2: true
    };
    var old = t.status;
    if (old === 'decay' || old === 'filling') {
      if (t.surface) {
        String(t.surface).toUpperCase().split('').forEach(function (L) {
          var region = _labelToRegion(num, L);
          if (region) migrated.surfaces[region] = { condition: old, origin: 'existing' };
        });
      } else { migrated.surfaces.center = { condition: old, origin: 'existing' }; }
    } else if (old === 'needs_rx') { migrated.requiresTreatment = true; }
    else if (old === 'bridge') { migrated.status = 'bridge_abutment'; }
    else if (old && TOOTH_STATUSES[old]) { migrated.status = old; }
    return migrated;
  }

  function render(containerId, patientId) {
    _containerId = containerId;
    _currentPatientId = patientId;
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = _buildLoadingHTML();

    _loadChart(patientId).then(function (data) {
      var rawChart = (data && data.chart) || {};
      _chart = {};
      Object.keys(rawChart).forEach(function (numStr) {
        var num = parseInt(numStr, 10);
        if (!isNaN(num) && rawChart[numStr]) {
          _chart[num] = _migrateLegacyTooth(num, rawChart[numStr]);
        }
      });
      _meta = { dentitionMode: 'adult', bridges: [] };
      if (data && data.meta) {
        if (data.meta.dentitionMode) _meta.dentitionMode = data.meta.dentitionMode;
        if (Array.isArray(data.meta.bridges)) {
          _meta.bridges = data.meta.bridges;
        } else if (data.meta.bridges && typeof data.meta.bridges === 'object') {
          _meta.bridges = Object.keys(data.meta.bridges).map(function (k) { return data.meta.bridges[k]; });
        }
        _meta.bridges.forEach(function (b) {
          if (b.teeth && !Array.isArray(b.teeth) && typeof b.teeth === 'object') {
            b.teeth = Object.keys(b.teeth).map(function (k) { return b.teeth[k]; });
          } else if (!b.teeth) { b.teeth = []; }

          if (b.pontics && !Array.isArray(b.pontics) && typeof b.pontics === 'object') {
            b.pontics = Object.keys(b.pontics).map(function (k) { return b.pontics[k]; });
          } else if (!b.pontics) { b.pontics = []; }
        });
      }
      _unsavedChanges = false;
      container.innerHTML = _buildChartHTML();
      _attachStyles();
    }).catch(function (err) {
      _chart = {}; _meta = { dentitionMode: 'adult', bridges: [] };
      container.innerHTML = _buildChartHTML();
      _attachStyles();
    });
  }

  function _loadChart(patientId) {
    if (typeof db === 'undefined' || typeof BASE === 'undefined') return Promise.resolve({ chart: {}, meta: {} });
    return db.ref(BASE + '/patients/' + patientId + '/specialty_data/dental').once('value').then(function (snap) {
      var v = snap.val() || {}; return { chart: v.chart || {}, meta: v.meta || {} };
    });
  }

  function _buildLoadingHTML() {
    return '<div style="text-align:center;padding:30px;color:#94a3b8"><p>جاري تحميل الرسم البياني...</p></div>';
  }

  function _buildChartHTML() {
    var mode = _meta.dentitionMode || 'adult';
    var sections;
    if (mode === 'pediatric') { sections = _buildArchPair(PRIMARY_UPPER, PRIMARY_LOWER, true); }
    else if (mode === 'mixed') { sections = _buildArchPair(ADULT_UPPER, ADULT_LOWER, false) + '<div class="argon-dental-mixed-divider">🔄 الأسنان اللبنية (Mixed Dentition)</div>' + _buildArchPair(PRIMARY_UPPER, PRIMARY_LOWER, true); }
    else { sections = _buildArchPair(ADULT_UPPER, ADULT_LOWER, false); }

    return [
      '<div class="argon-dental-chart-v2" dir="rtl">',
      _buildToolbarHTML(),
      '<div id="_dental-unsaved" style="display:', (_unsavedChanges ? 'block' : 'none'), ';font-size:0.75rem;color:#f59e0b;font-weight:700;margin-bottom:8px">● تغييرات غير محفوظة</div>',
      '<div id="_dental-bridge-panel"></div>',
      sections,
      _buildBridgeListPanel(),
      '<div class="summary-grid">',
      _buildSummary(),
      '</div>',
      '</div>'
    ].join('');
  }

  function _buildToolbarHTML() {
    var modes = [{ key: 'adult', label: '👨⚕️ بالغين (32)' }, { key: 'pediatric', label: '🧒 أطفال (20)' }, { key: 'mixed', label: '🔄 مختلط (Mixed)' }];
    var modeBtns = modes.map(function (m) {
      var active = (_meta.dentitionMode || 'adult') === m.key ? ' mode-active' : '';
      return '<button type="button" class="mode-btn' + active + '" onclick="DentalChartModule.setDentitionMode(\'' + m.key + '\')">' + m.label + '</button>';
    }).join('');

    return [
      '<div class="argon-dental-toolbar">',
      '<div class="toolbar-row">',
      '<div class="toolbar-group"><span class="toolbar-label">🗂️ نوع المخطط:</span>', modeBtns, '</div>',
      '<div class="toolbar-group toolbar-actions">',
      '<button class="det-btn det-btn-save" id="_dental-save-btn" onclick="DentalChartModule.saveChart()"><i class="fas fa-save"></i> حفظ الرسم</button>',
      '<button class="det-btn det-btn-bridge" id="_dental-bridge-btn" onclick="DentalChartModule.toggleBridgeMode()"><i class="fas fa-link"></i> ربط / جسر</button>',
      '<button class="det-btn det-btn-print" onclick="DentalChartModule.printChart()"><i class="fas fa-print"></i> طباعة التقرير</button>',
      '<button class="det-btn det-btn-cancel" onclick="DentalChartModule.resetChart()"><i class="fas fa-undo"></i> إعادة تعيين</button>',
      '</div>',
      '</div>',
      '<div class="toolbar-row">',
      '<span class="toolbar-label">📌 نمط الإدخال الحالي:</span>',
      '<div id="_dental-origin-toolbar" class="origin-bar">', _buildOriginSelector(), '</div>',
      '</div>',
      '</div>'
    ].join('');
  }

  function _buildOriginSelector() {
    return Object.keys(ORIGINS).map(function (key) {
      var o = ORIGINS[key];
      var active = _currentOriginMode === key ? ' origin-active' : '';
      var filtering = _highlightOrigin === key ? ' origin-filtering' : '';
      return '<button type="button" class="origin-btn' + active + filtering + '" style="--oc:' + o.accent + '" onclick="DentalChartModule.setOriginMode(\'' + key + '\')">' + (o.badge || '📋') + ' ' + o.labelAr + '</button>';
    }).join('');
  }

  function _buildArchPair(upperArr, lowerArr, isPrimary) {
    var kindLabel = isPrimary ? ' — لبني' : ' — دائم';
    return [
      '<div class="argon-jaw-label">⬆️ الفك العلوي', kindLabel, '</div>',
      '<div class="argon-tooth-row">', upperArr.map(_buildToothCell).join(''), '</div>',
      _buildBridgeConnectorRow(upperArr),
      '<div class="argon-midline">┄┄┄┄┄┄ خط الوسط (Midline) ┄┄┄┄┄┄</div>',
      _buildBridgeConnectorRow(lowerArr),
      '<div class="argon-tooth-row">', lowerArr.map(_buildToothCell).join(''), '</div>',
      '<div class="argon-jaw-label">⬇️ الفك السفلي', kindLabel, '</div>'
    ].join('');
  }

  function _buildToothCell(num) {
    var data = _chart[num] || {};
    var svg = _buildToothSVG(num, data);
    var anat = _anatomicalName(num);
    var uni = _fdiToUniversal(num);
    var tooltip = 'FDI ' + num + ' (Universal ' + uni + ') — ' + anat;
    if (data.notes) tooltip += '\n📝 ' + data.notes;

    var badges = '';
    if (_toothHasOrigin(data, 'planned')) badges += '<span class="tb tb-tl">🗓️</span>';
    if (_toothHasOrigin(data, 'completed')) badges += '<span class="tb tb-tl2">✅</span>';
    if (data.requiresTreatment) badges += '<span class="tb tb-tr">⚠️</span>';
    if (data.notes) badges += '<span class="tb tb-br">📝</span>';

    /* ── Origin Highlight: حساب class التمييز البصري ── */
    var hlClass = '';
    if (_highlightOrigin) {
      if (_toothHasOrigin(data, _highlightOrigin)) {
        hlClass = ' origin-glow origin-glow-' + _highlightOrigin;
      } else if (data.status && data.status !== 'healthy') {
        hlClass = ' origin-dim';
      }
    }

    return [
      '<div class="argon-tooth-cell-v2', hlClass, '" data-tooth="', num, '" data-status="', (data.status || 'healthy'), '" title="', _esc(tooltip), '" onclick="DentalChartModule._onToothClick(', num, ')">',
      '<div class="tooth-svg-wrap">', svg, badges, '</div>',
      '<div class="tooth-num">', num, '</div>',
      '</div>'
    ].join('');
  }

  function _buildToothSVG(num, data) {
    var status = data.status || 'healthy';
    if (status !== 'healthy' && TOOTH_STATUSES[status]) return _buildWholeToothSVG(num, data);
    var hasFindings = data.surfaces && Object.keys(data.surfaces).some(function (k) { return !!data.surfaces[k]; });
    if (hasFindings) return _buildSurfaceMapSVG(num, data, false);
    return '<svg viewBox="0 0 44 44" class="tooth-icon"><rect x="1" y="1" width="42" height="42" rx="8" fill="#f0fdf4" stroke="#10b981" stroke-width="1.5"/><text x="22" y="29" font-size="20" text-anchor="middle">🦷</text></svg>';
  }

  function _buildWholeToothSVG(num, data) {
    var cfg = TOOTH_STATUSES[data.status];
    var origin = data.statusOrigin || 'existing';
    var dash = origin === 'planned' ? ' stroke-dasharray="4 2"' : '';
    var strokeColor = origin === 'completed' ? '#10b981' : cfg.color;
    var fillColor = cfg.color + '22';
    return '<svg viewBox="0 0 44 44" class="tooth-icon"><rect x="1" y="1" width="42" height="42" rx="8" fill="' + fillColor + '" stroke="' + strokeColor + '" stroke-width="2"' + dash + '/><text x="22" y="29" font-size="19" text-anchor="middle">' + cfg.emoji + '</text></svg>';
  }

  function _buildSurfaceMapSVG(num, data, interactive) {
    var surfaces = data.surfaces || {};
    var defs = '';
    var paths = SURFACE_REGIONS.map(function (region) {
      var entry = surfaces[region];
      var fill = '#ffffff';
      if (entry && SURFACE_CONDITIONS[entry.condition]) {
        var color = SURFACE_CONDITIONS[entry.condition].color;
        if (entry.origin === 'planned') {
          var patId = 'hatch_' + num + '_' + region;
          defs += '<pattern id="' + patId + '" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="' + color + '22"/><line x1="0" y1="0" x2="0" y2="6" stroke="' + color + '" stroke-width="2.5"/></pattern>';
          fill = 'url(#' + patId + ')';
        } else { fill = color; }
      }
      var clickAttr = interactive ? ' class="surf-region" onclick="DentalChartModule._applySurface(' + num + ',\'' + region + '\')"' : '';
      return '<path d="' + REGION_PATHS[region] + '" fill="' + fill + '" stroke="#cbd5e1" stroke-width="0.6" data-region="' + region + '"' + clickAttr + '/>';
    }).join('');

    var labels = interactive ? SURFACE_REGIONS.map(function (region) {
      var pos = REGION_LABEL_POS[region];
      return '<text x="' + pos[0] + '" y="' + pos[1] + '" font-size="6.5" font-weight="900" text-anchor="middle" fill="#475569" style="pointer-events:none">' + _regionLabel(num, region) + '</text>';
    }).join('') : '';

    return '<svg viewBox="0 0 44 44" class="tooth-icon' + (interactive ? ' tooth-icon-lg' : '') + '"><defs>' + defs + '</defs><rect x="1" y="1" width="42" height="42" rx="8" fill="#f8fafc" stroke="#94a3b8" stroke-width="1"/>' + paths + labels + '</svg>';
  }

  function openToothEditor(num) {
    var existing = document.getElementById('_dental-editor-overlay');
    if (existing) existing.remove();

    var data = _chart[num] || {};
    var status = data.status || 'healthy';
    var anat = _anatomicalName(num);
    var uni = _fdiToUniversal(num);
    var bridgeInfo = _findBridgeForTooth(num);

    var bridgeBlock = '';
    if (bridgeInfo) {
      var role = bridgeInfo.pontics.indexOf(num) !== -1 ? 'تعويضي (Pontic)' : 'دعامة (Abutment)';
      bridgeBlock = '<div class="det-section bridge-info-box"><label class="det-label">🌉 هذا السن جزء من جسر / رابط</label><div style="font-size:0.8rem">الأسنان: <b>' + bridgeInfo.teeth.join(' - ') + '</b></div><button type="button" class="det-btn det-btn-cancel" style="margin-top:8px" onclick="DentalChartModule.removeBridge(\'' + bridgeInfo.id + '\')">🗑️ إزالة من الجسر</button></div>';
    }

    var overlay = document.createElement('div');
    overlay.id = '_dental-editor-overlay';
    overlay.className = 'dental-editor-overlay';

    var statusOptions = Object.keys(TOOTH_STATUSES).map(function (k) { return '<option value="' + k + '" ' + (k === status ? 'selected' : '') + '>' + TOOTH_STATUSES[k].emoji + ' ' + TOOTH_STATUSES[k].labelAr + '</option>'; }).join('');

    var mats = [['', '—'], ['composite', 'مركبة (Composite)'], ['amalgam', 'أملغم (Amalgam)'], ['zirconia', 'زيركونيا (Zirconia)'], ['pfm', 'خزف-معدن (PFM)']];
    var materialOptions = mats.map(function (m) { return '<option value="' + m[0] + '" ' + (m[0] === (data.material || '') ? 'selected' : '') + '>' + m[1] + '</option>'; }).join('');

    var palette = Object.keys(SURFACE_CONDITIONS).map(function (k) {
      var c = SURFACE_CONDITIONS[k];
      return '<button type="button" class="palette-btn' + (_selectedSurfaceCond === k ? ' palette-active' : '') + '" style="--pc:' + c.color + '" onclick="DentalChartModule._selectPalette(\'' + k + '\')">' + c.glyph + '</button>';
    }).join('');
    palette += '<button type="button" class="palette-btn' + (_selectedSurfaceCond === 'clear' ? ' palette-active' : '') + '" style="--pc:#94a3b8" onclick="DentalChartModule._selectPalette(\'clear\')">⌫</button>';

    overlay.innerHTML = [
      '<div class="dental-editor-card">',
      '<div class="dental-editor-head"><div class="det-title">🦷 السن ', num, ' — ', anat, '</div><div class="det-sub">Universal: ', uni, '</div></div>',
      '<div class="det-section"><label class="det-label">📌 وضع الإدخال الحالي</label><div id="_dental-origin-editor" class="origin-bar">', _buildOriginSelector(), '</div></div>',
      '<div class="det-section"><label class="det-label">🦷 الحالة العامة للسن</label><select id="_dental-status-sel" class="det-input" onchange="DentalChartModule._onStatusChange(', num, ')">', statusOptions, '</select></div>',
      '<div class="det-section" id="_dental-surfsection-', num, '" style="', (status === 'healthy' ? '' : 'display:none'), '">',
      '<label class="det-label">🗺️ خريطة أسطح السن</label><div class="surf-editor"><div id="_dental-surfmap-', num, '">', _buildSurfaceMapSVG(num, data, true), '</div><div id="_dental-palette" class="palette-row">', palette, '</div></div>',
      '</div>',
      '<div class="det-section"><label class="det-label">🧪 مادة العلاج (اختياري)</label><select id="_dental-material-sel" class="det-input">', materialOptions, '</select></div>',
      '<div class="det-section det-row"><input type="checkbox" id="_dental-needs-rx" ', (data.requiresTreatment ? 'checked' : ''), '><label for="_dental-needs-rx" class="det-check-label">⚠️ مُدرج ضمن خطة العلاج الحالية</label></div>',
      '<div class="det-section"><label class="det-label">📝 ملاحظة سريرية (اختياري)</label><input type="text" id="_dental-note-inp" class="det-input" value="', _esc(data.notes || ''), '" placeholder="ملاحظات..."></div>',
      bridgeBlock,
      '<div class="det-actions"><button onclick="DentalChartModule.saveToothData(', num, ')" class="det-btn det-btn-save"><i class="fas fa-save"></i> حفظ</button><button onclick="document.getElementById(\'_dental-editor-overlay\').remove()" class="det-btn det-btn-cancel">إلغاء</button></div>',
      '</div>'
    ].join('');

    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
  }

  function _selectPalette(key) {
    _selectedSurfaceCond = key;
    var btns = document.querySelectorAll('#_dental-palette .palette-btn');
    btns.forEach(function (b) { b.classList.remove('palette-active'); });
    event.currentTarget.classList.add('palette-active');
  }

  function _applySurface(num, region) {
    if (!_chart[num]) _chart[num] = _migrateLegacyTooth(num, {}) || {};
    if (!_chart[num].surfaces) _chart[num].surfaces = { center: null, top: null, bottom: null, left: null, right: null };
    var current = _chart[num].surfaces[region];

    if (_selectedSurfaceCond === 'clear') { _chart[num].surfaces[region] = null; }
    else if (current && current.condition === _selectedSurfaceCond && current.origin === _currentOriginMode) { _chart[num].surfaces[region] = null; }
    else {
      _chart[num].surfaces[region] = { condition: _selectedSurfaceCond, origin: _currentOriginMode };
      if (_chart[num].status && _chart[num].status !== 'healthy' && _chart[num].status !== 'bridge_abutment' && _chart[num].status !== 'bridge_pontic') {
        _chart[num].status = 'healthy';
        delete _chart[num].statusOrigin;
      }
    }

    _chart[num].updatedAt = new Date().toISOString();
    _unsavedChanges = true;
    _showUnsaved();
    var wrap = document.getElementById('_dental-surfmap-' + num);
    if (wrap) wrap.innerHTML = _buildSurfaceMapSVG(num, _chart[num], true);
    _refreshToothCell(num);
    _updateSummaryUI();
  }

  function _onStatusChange(num) {
    var sel = document.getElementById('_dental-status-sel');
    var sec = document.getElementById('_dental-surfsection-' + num);
    if (sel && sec) sec.style.display = sel.value === 'healthy' ? '' : 'none';
  }

  function setOriginMode(mode) {
    if (!ORIGINS[mode]) return;

    if (_currentOriginMode === mode) {
      // نفس الزر → تبديل التمييز البصري فقط (toggle)
      _highlightOrigin = (_highlightOrigin === mode) ? null : mode;
    } else {
      // زر مختلف → تغيير نمط الإدخال وتفعيل التمييز
      _currentOriginMode = mode;
      _highlightOrigin = mode;
    }

    var bar1 = document.getElementById('_dental-origin-toolbar');
    if (bar1) bar1.innerHTML = _buildOriginSelector();
    var bar2 = document.getElementById('_dental-origin-editor');
    if (bar2) bar2.innerHTML = _buildOriginSelector();
    _applyOriginHighlight();
  }

  /**
   * ── تطبيق التمييز البصري على الأسنان في الرسم البياني ──
   * يُضاف/يُزال CSS classes بدون إعادة رسم (أداء عالي)
   */
  function _applyOriginHighlight() {
    var cells = document.querySelectorAll('.argon-tooth-cell-v2');
    cells.forEach(function (cell) {
      var num = parseInt(cell.getAttribute('data-tooth'), 10);
      var data = _chart[num] || {};

      cell.classList.remove('origin-glow', 'origin-glow-existing', 'origin-glow-planned', 'origin-glow-completed', 'origin-dim');

      if (_highlightOrigin) {
        if (_toothHasOrigin(data, _highlightOrigin)) {
          cell.classList.add('origin-glow', 'origin-glow-' + _highlightOrigin);
        } else if (data.status && data.status !== 'healthy') {
          cell.classList.add('origin-dim');
        }
      }
    });
  }

  function saveToothData(num) {
    var status = document.getElementById('_dental-status-sel').value;
    var material = document.getElementById('_dental-material-sel').value;
    var notes = document.getElementById('_dental-note-inp').value.trim();
    var requiresTreatment = document.getElementById('_dental-needs-rx').checked;

    if (!_chart[num]) _chart[num] = { surfaces: { center: null, top: null, bottom: null, left: null, right: null }, _v2: true };

    var oldStatus = _chart[num].status || 'healthy';
    if (status !== oldStatus) {
      _chart[num].surfaces = { center: null, top: null, bottom: null, left: null, right: null };
    }

    _chart[num].status = status;
    if (status !== 'healthy') { _chart[num].statusOrigin = _currentOriginMode; } else { delete _chart[num].statusOrigin; }
    _chart[num].material = material || null;
    _chart[num].notes = notes || null;
    _chart[num].requiresTreatment = requiresTreatment;
    _chart[num].updatedAt = new Date().toISOString();
    _chart[num]._v2 = true;

    _unsavedChanges = true;
    var overlay = document.getElementById('_dental-editor-overlay');
    if (overlay) overlay.remove();
    _refreshToothCell(num);
    _updateSummaryUI();
    _showUnsaved();
    if (typeof window.toast === 'function') window.toast('✅ تم تحديث السن ' + num, 'ok');
  }

  function _refreshToothCell(num) {
    var cell = document.querySelector('.argon-tooth-cell-v2[data-tooth="' + num + '"]');
    if (!cell) return;
    var temp = document.createElement('div');
    temp.innerHTML = _buildToothCell(num);
    cell.parentNode.replaceChild(temp.firstElementChild, cell);
  }

  function _showUnsaved() {
    var el = document.getElementById('_dental-unsaved');
    if (el) el.style.display = _unsavedChanges ? 'block' : 'none';
  }

  function _onToothClick(num) {
    if (_bridgeMode) {
      var idx = _bridgeSelection.indexOf(num);
      if (idx === -1) _bridgeSelection.push(num); else _bridgeSelection.splice(idx, 1);
      _bridgeSelection.sort(function (a, b) { return a - b; });
      document.querySelectorAll('.argon-tooth-cell-v2').forEach(function (cell) {
        var n = parseInt(cell.getAttribute('data-tooth'), 10);
        cell.classList.toggle('bridge-selected', _bridgeSelection.indexOf(n) !== -1);
      });
      _renderBridgePanel();
    } else { openToothEditor(num); }
  }

  function toggleBridgeMode() {
    _bridgeMode = !_bridgeMode;
    _bridgeSelection = [];
    var btn = document.getElementById('_dental-bridge-btn');
    if (btn) btn.classList.toggle('active', _bridgeMode);
    var chart = document.querySelector('.argon-dental-chart-v2');
    if (chart) chart.classList.toggle('bridge-mode', _bridgeMode);
    _renderBridgePanel();
  }

  function _renderBridgePanel() {
    var panel = document.getElementById('_dental-bridge-panel');
    if (!panel) return;
    if (!_bridgeMode) { panel.innerHTML = ''; return; }
    var chips = _bridgeSelection.map(function (n) { return '<span class="chip">' + n + '</span>'; }).join('<span class="chip-sep"> – </span>');
    var body = _bridgeSelection.length >= 2 ? '<div class="bridge-panel-form"><select id="_bridge-material" class="det-input"><option value="pfm">خزف-معدن (PFM)</option><option value="zirconia">زيركونيا</option></select><button class="det-btn det-btn-save" onclick="DentalChartModule.createBridge()">✅ إنشاء الجسر</button></div>' : '<div class="bridge-panel-hint">اختر سنّين متجاورين لإنشاء جسر.</div>';
    panel.innerHTML = '<div class="bridge-panel"><div class="bridge-panel-title">🔗 وضع الربط نشط — (' + _bridgeSelection.length + ' محدد)</div><div class="bridge-panel-chips">' + chips + '</div>' + body + '<button class="det-btn det-btn-cancel" onclick="DentalChartModule.toggleBridgeMode()">إنهاء</button></div>';
  }

  function createBridge() {
    if (_bridgeSelection.length < 2) return;
    var materialSel = document.getElementById('_bridge-material');
    var teeth = _bridgeSelection.slice();
    var pontics = teeth.filter(function (n) { return _chart[n] && _chart[n].status === 'missing'; });
    if (!pontics.length && teeth.length > 2) pontics = teeth.slice(1, teeth.length - 1);

    var bridge = { id: 'bridge_' + Date.now(), teeth: teeth, pontics: pontics, material: materialSel ? materialSel.value : 'pfm', origin: _currentOriginMode };
    _meta.bridges = _meta.bridges || [];
    _meta.bridges.push(bridge);

    teeth.forEach(function (n) {
      if (!_chart[n]) _chart[n] = { surfaces: { center: null, top: null, bottom: null, left: null, right: null }, _v2: true };
      if (pontics.indexOf(n) !== -1) { _chart[n].status = 'bridge_pontic'; } else if ((_chart[n].status || 'healthy') === 'healthy') { _chart[n].status = 'bridge_abutment'; }
      _chart[n].statusOrigin = _currentOriginMode; _chart[n].updatedAt = new Date().toISOString();
    });

    _unsavedChanges = true; _bridgeSelection = []; _bridgeMode = false;
    _rerenderChart();
  }

  function removeBridge(bridgeId) {
    var list = _meta.bridges || [];
    var bridge = null;
    for (var i = 0; i < list.length; i++) { if (list[i].id === bridgeId) { bridge = list[i]; break; } }
    if (!bridge) return;
    if (!confirm('هل تريد إزالة هذا الجسر/الرابط؟')) return;

    _meta.bridges = list.filter(function (b) { return b.id !== bridgeId; });
    bridge.teeth.forEach(function (n) {
      if (_chart[n] && (_chart[n].status === 'bridge_abutment' || _chart[n].status === 'bridge_pontic')) {
        _chart[n].status = 'healthy'; delete _chart[n].statusOrigin;
      }
    });

    _unsavedChanges = true;
    var overlay = document.getElementById('_dental-editor-overlay');
    if (overlay) overlay.remove();
    _rerenderChart();
  }

  function _buildBridgeConnectorRow(teethArr) {
    var bridges = _meta.bridges || [];
    var any = false;
    var segs = teethArr.map(function (n) {
      var cls = '', style = '', title = '', bridgeId = '';
      for (var i = 0; i < bridges.length; i++) {
        var b = bridges[i];
        if (b.teeth.indexOf(n) === -1) continue;
        any = true;
        cls = 'bseg-on ' + (b.pontics.indexOf(n) !== -1 ? 'bseg-pontic' : 'bseg-abut');
        if (n === b.teeth[0]) cls += ' bseg-cap-start';
        if (n === b.teeth[b.teeth.length - 1]) cls += ' bseg-cap-end';
        var color = b.origin === 'planned' ? ORIGINS.planned.accent : (b.origin === 'completed' ? ORIGINS.completed.accent : '#0891b2');
        style = 'border-top-color:' + color + (b.origin === 'planned' ? ';border-top-style:dashed' : '') + ';';
        title = '🌉 جسر/رابط: ' + b.teeth.join('-') + ' — ' + (b.material || '');
        bridgeId = b.id;
      }
      return { tooth: n, cls: cls, style: style, title: title, bridgeId: bridgeId };
    });

    if (!any) return '';
    return '<div class="argon-bridge-row">' + segs.map(function (s) {
      return '<div class="bseg ' + s.cls + '" style="' + s.style + '" ' + (s.bridgeId ? 'onclick="DentalChartModule.removeBridge(\'' + s.bridgeId + '\')" title="' + _esc(s.title) + '"' : '') + '></div>';
    }).join('') + '</div>';
  }

  function _buildBridgeListPanel() {
    var bridges = _meta.bridges || [];
    if (!bridges.length) return '';
    var rows = bridges.map(function (b) {
      var origin = ORIGINS[b.origin] || ORIGINS.existing;
      var matStr = b.material === 'zirconia' ? 'زيركونيا' : (b.material === 'pfm' ? 'بورسلان-معدن (PFM)' : (b.material || 'غير محدد'));
      var tStr = (b.teeth || []).join(' - ');
      var pCount = (b.pontics || []).length;

      return '<div class="bridge-list-item" style="padding: 12px; margin-bottom: 10px; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">' +
        '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 8px;">' +
        '<b style="color: #0f172a; font-size: 0.95rem;"><i class="fas fa-link" style="color: var(--oc); margin-left: 5px;"></i> 🌉 جسر للأسنان (' + tStr + ')</b>' +
        '<button type="button" class="det-btn det-btn-cancel" style="padding: 4px 10px; font-size: 0.8rem; display: flex; align-items: center; gap: 5px;" onclick="DentalChartModule.removeBridge(\'' + b.id + '\')"><i class="fas fa-trash-alt"></i> إزالة</button>' +
        '</div>' +
        '<div style="font-size: 0.85rem; color: #475569; display: flex; gap: 15px; flex-wrap: wrap;">' +
        '<span style="display: flex; align-items: center; gap: 4px;"><i class="fas fa-tooth" style="color: #94a3b8;"></i> <b>المادة:</b> ' + matStr + '</span>' +
        '<span style="display: flex; align-items: center; gap: 4px;"><i class="fas fa-tags" style="color: #94a3b8;"></i> <b>الحالة:</b> ' + origin.labelAr + '</span>' +
        (pCount > 0 ? '<span style="display: flex; align-items: center; gap: 4px;"><i class="fas fa-layer-group" style="color: #94a3b8;"></i> <b>عدد التعويضات:</b> ' + pCount + '</span>' : '') +
        '</div>' +
        '</div>';
    }).join('');

    return '<div class="bridge-list-panel" style="background: #f8fafc; border-radius: 10px; border: 1px solid #cbd5e1; margin-top: 20px; padding: 15px;">' +
      '<div style="font-weight: bold; color: #1e293b; font-size: 1.05rem; margin-bottom: 15px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;"><i class="fas fa-project-diagram" style="color: var(--oc); margin-left: 8px;"></i> تفاصيل الجسور والتركيبات</div>' +
      rows +
      '</div>';
  }

  function _buildSummary() {
    var groups = {};
    var hasData = false;

    Object.keys(_chart).forEach(function (numStr) {
      var num = parseInt(numStr, 10);
      var data = _chart[num];
      if (!data) return;

      var origin = ORIGINS[data.statusOrigin] || ORIGINS.existing;

      // Group by whole-tooth status
      if (data.status && data.status !== 'healthy' && data.status !== 'bridge_abutment' && data.status !== 'bridge_pontic') {
        var stObj = TOOTH_STATUSES[data.status];
        if (stObj) {
          if (!groups[data.status]) groups[data.status] = { label: stObj.labelAr, icon: stObj.emoji, color: stObj.color, items: [] };
          groups[data.status].items.push({ num: num, origin: origin, notes: data.notes, reqRx: data.requiresTreatment, material: data.material });
          hasData = true;
        }
      }

      // Group by surface conditions
      if (data.surfaces) {
        Object.keys(data.surfaces).forEach(function (surf) {
          var sData = data.surfaces[surf];
          if (sData && sData.condition && sData.condition !== 'healthy') {
            var cObj = SURFACE_CONDITIONS[sData.condition];
            if (cObj) {
              var gKey = 'surf_' + sData.condition;
              if (!groups[gKey]) groups[gKey] = { label: cObj.labelAr, icon: cObj.glyph, color: cObj.color, items: [] };
              groups[gKey].items.push({ num: num, surface: surf, origin: ORIGINS[sData.origin] || ORIGINS.existing });
              hasData = true;
            }
          }
        });
      }
    });

    if (!hasData) {
      return '<div style="text-align:center; padding: 30px; background: #f8fafc; border-radius: 10px; border: 1px dashed #cbd5e1; margin-top: 20px;">' +
        '<i class="fas fa-smile-beam" style="font-size: 2.5rem; color: #10b981; margin-bottom: 15px; display: block;"></i>' +
        '<div style="font-weight: bold; color: #334155; font-size: 1.1rem;">أسنان سليمة (لا يوجد تدخلات)</div>' +
        '<div style="color: #64748b; font-size: 0.9rem; margin-top: 5px;">لم يتم تسجيل أي تسوس، حشوات، أو تركيبات على المخطط حتى الآن.</div>' +
        '</div>';
    }

    var html = '<div class="chart-full-summary" style="margin-top: 20px; display: flex; flex-direction: column; gap: 15px;">';

    Object.keys(groups).forEach(function (gKey) {
      var group = groups[gKey];
      var toothMap = {};

      group.items.forEach(function (item) {
        if (!toothMap[item.num]) toothMap[item.num] = { num: item.num, surfaces: [], notes: item.notes, origin: item.origin, material: item.material, reqRx: item.reqRx };
        if (item.surface) {
          var sName = { top: 'العلوي', bottom: 'السفلي', center: 'المركز', left: 'اليسار', right: 'اليمين' }[item.surface] || item.surface;
          if (toothMap[item.num].surfaces.indexOf(sName) === -1) toothMap[item.num].surfaces.push(sName);
        }
      });

      var rows = Object.keys(toothMap).sort(function (a, b) { return parseInt(a) - parseInt(b); }).map(function (numStr) {
        var tData = toothMap[numStr];
        var sHtml = tData.surfaces.length > 0 ? '<span style="display: flex; align-items: center; gap: 4px; background: #f1f5f9; padding: 2px 8px; border-radius: 4px;"><i class="fas fa-border-all" style="color: #94a3b8;"></i> <b>الأسطح:</b> ' + tData.surfaces.join('، ') + '</span>' : '';
        var nHtml = tData.notes ? '<span style="display: flex; align-items: center; gap: 4px; width: 100%; margin-top: 5px; color: #b45309;"><i class="fas fa-sticky-note" style="color: #f59e0b;"></i> <b>ملاحظات:</b> ' + tData.notes + '</span>' : '';
        var mHtml = tData.material ? '<span style="display: flex; align-items: center; gap: 4px;"><i class="fas fa-fill-drip" style="color: #94a3b8;"></i> <b>المادة:</b> ' + tData.material + '</span>' : '';
        var rHtml = tData.reqRx ? '<span style="display: flex; align-items: center; gap: 4px; color: #ef4444;"><i class="fas fa-prescription" style="color: #ef4444;"></i> بحاجة لوصفة</span>' : '';

        return '<div class="summary-tooth-item" style="padding: 12px; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">' +
          '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: ' + (sHtml || nHtml || mHtml || rHtml ? '8px' : '0') + '; border-bottom: ' + (sHtml || nHtml || mHtml || rHtml ? '1px dashed #e2e8f0' : 'none') + '; padding-bottom: ' + (sHtml || nHtml || mHtml || rHtml ? '8px' : '0') + ';">' +
          '<b style="color: #0f172a; font-size: 0.95rem;"><i class="fas fa-tooth" style="color: ' + group.color + '; margin-left: 5px;"></i> السن رقم (' + tData.num + ')</b>' +
          '<span style="font-size: 0.8rem; background: #f8fafc; border: 1px solid #cbd5e1; padding: 2px 8px; border-radius: 12px; color: #475569;"><i class="fas fa-tag"></i> ' + tData.origin.labelAr + '</span>' +
          '</div>' +
          (sHtml || nHtml || mHtml || rHtml ? '<div style="font-size: 0.85rem; color: #475569; display: flex; gap: 10px; flex-wrap: wrap;">' + sHtml + mHtml + rHtml + nHtml + '</div>' : '') +
          '</div>';
      }).join('');

      html += '<div class="summary-group-panel" style="background: #f8fafc; border-radius: 10px; border: 1px solid #cbd5e1; padding: 15px;">' +
        '<div style="font-weight: bold; color: #1e293b; font-size: 1.05rem; margin-bottom: 15px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; display: flex; align-items: center; gap: 8px;">' +
        '<span style="font-size: 1.2rem;">' + group.icon + '</span> <span style="color: ' + group.color + ';">' + group.label + '</span>' +
        '<span style="background: ' + group.color + '20; color: ' + group.color + '; font-size: 0.75rem; padding: 3px 8px; border-radius: 12px; margin-right: auto; font-weight: bold;">' + Object.keys(toothMap).length + ' أسنان</span>' +
        '</div>' +
        '<div style="display: flex; flex-direction: column; gap: 8px;">' + rows + '</div>' +
        '</div>';
    });

    html += '</div>';
    return html;
  }

  function _updateSummaryUI() {
    var summaryGrid = document.querySelector('.summary-grid');
    if (summaryGrid) summaryGrid.innerHTML = _buildSummary();
  }

  function _rerenderChart() {
    var container = document.getElementById(_containerId);
    if (!container) return;
    container.innerHTML = _buildChartHTML();
    _attachStyles();
  }

  function setDentitionMode(mode) {
    if (['adult', 'pediatric', 'mixed'].indexOf(mode) === -1) return;
    _meta.dentitionMode = mode; _unsavedChanges = true; _rerenderChart();
  }

  function printChart() {
    var printWindow = window.open('', '_blank');
    if (!printWindow) return;

    var summary = getTextSummary();
    var patientName = _getPatientName();
    var date = new Date().toLocaleDateString('ar-JO');
    var chartHtml = document.querySelector('.argon-dental-chart-v2');
    var chartContent = chartHtml ? chartHtml.outerHTML : '<p>لا يوجد رسم بياني</p>';

    // سحب ستايلات CSS الخاصة بالأسنان لضمان الطباعة الصحيحة
    var cssRules = '';
    var styleEl = document.getElementById('_dental-chart-v2-styles');
    if (styleEl) cssRules = styleEl.textContent;

    var html = [
      '<!DOCTYPE html>',
      '<html dir="rtl" lang="ar">',
      '<head>',
      '<meta charset="UTF-8">',
      '<title>تقرير الأسنان السريري</title>',
      '<style>',
      '@import url("https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;900&display=swap");',
      'body { font-family: "Tajawal", sans-serif; padding: 40px; background: #f8fafc; color: #0f172a; }',
      '.print-container { max-width: 900px; margin: 0 auto; background: #fff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }',
      '.print-header { border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end; }',
      '.print-title { margin: 0; font-size: 24px; color: #0f172a; font-weight: 900; }',
      '.print-meta { font-size: 14px; color: #475569; line-height: 1.6; }',
      '.print-meta b { color: #0f172a; }',
      '.clinic-brand { text-align: left; }',
      '.clinic-brand h2 { margin: 0; color: #0ea5e9; font-size: 20px; }',
      '.print-section { margin-bottom: 30px; }',
      '.print-section h3 { border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; margin-bottom: 15px; font-size: 18px; color: #0f172a; }',
      '.summary-text { font-size: 15px; line-height: 1.8; background: #f1f5f9; padding: 20px; border-radius: 8px; border-right: 4px solid #0ea5e9; }',
      '@media print {',
      'body { background: #fff; padding: 0; }',
      '.print-container { box-shadow: none; padding: 0; }',
      '.origin-btn, .mode-btn { border: 1px solid #ccc !important; }',
      '}',
      /* إخفاء عناصر التحكم للطباعة */
      '.argon-dental-toolbar, .det-btn, .origin-bar button:not(.origin-active), .bridge-panel-form, #_dental-unsaved { display: none !important; }',
      '.argon-dental-chart-v2 { border: none !important; padding: 0 !important; background: transparent !important; }',
      cssRules,
      '</style>',
      '</head>',
      '<body>',
      '<div class="print-container">',
      '<div class="print-header">',
      '<div>',
      '<h1 class="print-title">تقرير الأسنان السريري (Dental Chart Report)</h1>',
      '<div class="print-meta" style="margin-top: 10px;">',
      '<div><b>اسم المريض:</b> ' + _esc(patientName) + '</div>',
      '<div><b>تاريخ التقرير:</b> ' + date + '</div>',
      '</div>',
      '</div>',
      '<div class="clinic-brand">',
      '<h2>ARGON EMR</h2>',
      '<div style="color:#64748b;font-size:12px;">نظام إدارة العيادات الذكي</div>',
      '</div>',
      '</div>',

      '<div class="print-section">',
      '<h3>المخطط السريري للأسنان</h3>',
      '<div>' + chartContent + '</div>',
      '</div>',

      '<div class="print-section" style="page-break-inside: avoid;">',
      '<h3>التشخيص السريري والتوصيات</h3>',
      '<div class="summary-text">' + summary + '</div>',
      '</div>',

      '<div style="margin-top: 50px; display: flex; justify-content: space-between; align-items: center; font-size: 14px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 20px;">',
      '<div>توقيع الطبيب المعالج: _____________________</div>',
      '<div>تم إنشاء هذا التقرير عبر نظام Argon EMR &copy;</div>',
      '</div>',
      '</div>',
      '<script>setTimeout(function(){ window.print(); window.close(); }, 800);</script>',
      '</body>',
      '</html>'
    ].join('\n');

    printWindow.document.write(html);
    printWindow.document.close();
  }

  function saveChart() {
    if (!_currentPatientId || typeof db === 'undefined') return;

    // حفظ المحرر المفتوح تلقائياً لتجنب ضياع التعديلات
    var overlay = document.getElementById('_dental-editor-overlay');
    if (overlay) {
      var saveBtn = overlay.querySelector('.det-btn-save');
      if (saveBtn) saveBtn.click();
    }

    // إذا كان المستخدم في وضع الربط وحدد أكثر من سن، يتم إنشاء الجسر تلقائياً قبل الحفظ
    if (_bridgeMode && _bridgeSelection.length >= 2) {
      createBridge();
    }

    var btn = document.getElementById('_dental-save-btn');
    if (btn) btn.innerHTML = 'جاري الحفظ...';

    // تنظيف _chart من أي قيم فارغة قبل الحفظ لتجنب مشاكل المصفوفات
    var cleanChart = {};
    Object.keys(_chart).forEach(function (k) {
      if (_chart[k]) cleanChart[k] = _chart[k];
    });

    var saveData = { chart: cleanChart, meta: _meta, savedAt: new Date().toISOString() };
    db.ref(BASE + '/patients/' + _currentPatientId + '/specialty_data/dental').set(saveData).then(function () {
      _unsavedChanges = false; _showUnsaved();
      if (btn) btn.innerHTML = '<i class="fas fa-save"></i> حفظ الرسم';
      if (typeof window.toast === 'function') window.toast('✅ تم الحفظ بنجاح', 'ok');
    });
  }

  function getChartData() { return { chart: Object.assign({}, _chart), meta: Object.assign({}, _meta), summary: getTextSummary() }; }

  function getTextSummary() {
    var parts = [];
    Object.keys(_chart).sort().forEach(function (n) {
      var t = _chart[n];
      if (t && t.status && t.status !== 'healthy') parts.push('سن ' + n + ': ' + (TOOTH_STATUSES[t.status] ? TOOTH_STATUSES[t.status].labelAr : t.status));
    });
    return parts.join(' | ') || 'لا توجد ملاحظات سريرية.';
  }

  function resetChart() {
    if (!confirm('مسح الرسم البياني بالكامل؟')) return;
    _chart = {}; _meta.bridges = []; _unsavedChanges = true; _rerenderChart();
  }

  function _attachStyles() {
    if (document.getElementById('_dental-chart-v2-styles')) return;
    var style = document.createElement('style');
    style.id = '_dental-chart-v2-styles';
    style.textContent = `
      .argon-dental-chart-v2 { font-family: 'Tajawal', sans-serif; background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 20px 24px; overflow: visible; }
      .argon-dental-toolbar { background: #f8fafc; border-radius: 10px; padding: 12px; margin-bottom: 20px; border: 1px solid #e2e8f0; }
      .toolbar-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
      .toolbar-group { display: flex; align-items: center; gap: 6px; }
      .mode-btn { padding: 6px 12px; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer; }
      .mode-btn.mode-active { background: #e0f2fe; border-color: #0ea5e9; }
      .det-btn { padding: 6px 14px; border-radius: 6px; cursor: pointer; border: none; }
      .det-btn-save { background: #10b981; color: #fff; }
      .det-btn-bridge { background: #0891b2; color: #fff; }
      .det-btn-cancel { background: #f1f5f9; color: #475569; }
      .origin-bar { display: inline-flex; gap: 4px; background: #fff; padding: 3px; border-radius: 8px; border: 1px solid #e2e8f0; }
      .origin-btn { padding: 4px 10px; border: none; border-radius: 5px; cursor: pointer; }
      .origin-btn.origin-active { background: var(--oc); color: #fff; }
      .argon-jaw-label { text-align: center; font-size: 0.85rem; font-weight: bold; margin: 15px 0 5px; background: #f8fafc; padding: 6px; border-radius: 6px; }
      .argon-tooth-row { display: flex; justify-content: center; gap: 6px; overflow: visible; padding: 14px 10px; }
      .argon-tooth-cell-v2 { width: 44px; display: flex; flex-direction: column; align-items: center; cursor: pointer; transition: transform 0.2s ease; }
      .argon-tooth-cell-v2:hover { transform: scale(1.22); z-index: 5; }
      .argon-tooth-cell-v2:hover .tooth-svg-wrap { box-shadow: 0 0 0 2px rgba(13,148,136,0.6), 0 8px 20px rgba(13,148,136,0.25); }
      .argon-tooth-cell-v2:hover .tooth-num { background: rgba(13,148,136,0.12); border-color: #0d9488; color: #0d9488; font-weight: 900; transform: scale(1.05); }
      .tooth-svg-wrap { width: 44px; height: 44px; position: relative; border-radius: 10px; transition: box-shadow 0.2s ease; }
      .tooth-num { font-size: 0.65rem; font-weight: bold; margin-top: 4px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; border: 1px solid #e2e8f0; transition: all 0.2s ease; }
      .tb { position: absolute; width: 14px; height: 14px; font-size: 0.55rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
      .tb-tl { top: -4px; left: -4px; }
      .tb-tl2 { top: 12px; left: -6px; }
      .tb-tr { top: -4px; right: -4px; }
      .tb-br { bottom: -4px; right: -4px; }
      .argon-midline { text-align: center; border-top: 1px dashed #cbd5e1; border-bottom: 1px dashed #cbd5e1; padding: 4px 0; margin: 10px 0; font-size: 0.7rem; color: #94a3b8; }
      .dental-editor-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.8); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px; }
      .dental-editor-card { background: #fff; border-radius: 12px; padding: 20px; width: 100%; max-width: 420px; max-height: 90vh; overflow-y: auto; }
      .det-title { font-size: 1.1rem; font-weight: bold; }
      .det-section { margin-bottom: 16px; }
      .det-label { display: block; font-size: 0.8rem; font-weight: bold; margin-bottom: 6px; }
      .det-input { width: 100%; padding: 8px 12px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; }
      .det-actions { display: flex; gap: 8px; margin-top: 20px; }
      .surf-editor { display: flex; align-items: center; gap: 16px; background: #f8fafc; padding: 12px; border-radius: 8px; }
      .tooth-icon-lg { width: 80px; height: 80px; }
      .surf-region { cursor: pointer; }
      .palette-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
      .palette-btn { padding: 6px; background: #fff; border: 2px solid #e2e8f0; border-radius: 6px; cursor: pointer; }
      .palette-btn.palette-active { border-color: var(--pc); background: var(--pc); color: #fff; }
      .bridge-mode .argon-tooth-cell-v2 { opacity: 0.5; }
      .bridge-mode .argon-tooth-cell-v2.bridge-selected { opacity: 1; transform: scale(1.1); }
      .bridge-mode .argon-tooth-cell-v2.bridge-selected .tooth-svg-wrap { box-shadow: 0 0 0 3px #0ea5e9; border-radius: 12px; }
      .bridge-panel { background: #e0f2fe; border: 1px solid #7dd3fc; border-radius: 10px; padding: 12px; margin-bottom: 16px; }
      .bridge-panel-chips { display: flex; align-items: center; justify-content: center; gap: 2px; flex-wrap: wrap; margin: 6px 0; }
      .chip { display: inline-block; background: #fff; color: #0284c7; padding: 3px 10px; border-radius: 6px; font-weight: 800; font-size: 0.9rem; border: 1px solid #7dd3fc; }
      .chip-sep { color: #64748b; font-weight: 700; font-size: 0.85rem; padding: 0 2px; }
      .argon-bridge-row { display: flex; justify-content: center; gap: 4px; height: 12px; padding: 0 22px; margin: -4px 0 4px; }
      .bseg { width: 44px; border-top: 4px solid transparent; position: relative; }
      .bseg-on { cursor: pointer; }
      .bseg-pontic::after { content: ''; position: absolute; left: 50%; top: -8px; width: 8px; height: 8px; background: inherit; border-radius: 50%; transform: translateX(-50%); }
      /* ── Origin Highlight & Filter System ── */
      .origin-glow { z-index: 2; position: relative; transform: scale(1.06); transition: all 0.3s ease; }
      .origin-glow .tooth-svg-wrap { border-radius: 10px; transition: box-shadow 0.3s ease; }
      .origin-glow-existing .tooth-svg-wrap { box-shadow: 0 0 0 2.5px #94a3b8, 0 0 12px rgba(148,163,184,0.5); }
      .origin-glow-planned .tooth-svg-wrap { box-shadow: 0 0 0 2.5px #0ea5e9, 0 0 12px rgba(14,165,233,0.5); }
      .origin-glow-completed .tooth-svg-wrap { box-shadow: 0 0 0 2.5px #10b981, 0 0 12px rgba(16,185,129,0.5); }
      .origin-glow .tooth-num { font-weight: 900; }
      .origin-glow-existing .tooth-num { background: rgba(148,163,184,0.12); border-color: #94a3b8; color: #64748b; }
      .origin-glow-planned .tooth-num { background: rgba(14,165,233,0.12); border-color: #0ea5e9; color: #0284c7; }
      .origin-glow-completed .tooth-num { background: rgba(16,185,129,0.12); border-color: #10b981; color: #059669; }
      .origin-dim { opacity: 0.22; filter: grayscale(0.7); transition: all 0.3s ease; }
      .origin-btn.origin-filtering { box-shadow: 0 0 0 2px var(--oc); font-weight: 900; }
    `;
    document.head.appendChild(style);
  }

  global.DentalChartModule = {
    render: render, openToothEditor: openToothEditor, saveToothData: saveToothData,
    saveChart: saveChart, resetChart: resetChart, setOriginMode: setOriginMode,
    setDentitionMode: setDentitionMode, toggleBridgeMode: toggleBridgeMode,
    createBridge: createBridge, removeBridge: removeBridge, printChart: printChart,
    getChartData: getChartData, getTextSummary: getTextSummary,
    _onToothClick: _onToothClick, _onStatusChange: _onStatusChange,
    _selectPalette: _selectPalette, _applySurface: _applySurface,
    _applyOriginHighlight: _applyOriginHighlight,
    init: function () { console.log('[DentalChartModule] v2.0 "Clinical Pro" initialized.'); }
  };
}(window));
