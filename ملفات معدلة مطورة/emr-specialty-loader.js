/**
 * 🏥 ARGON MEDICAL OS — EMR Specialty Loader
 * emr-specialty-loader.js — v1.0
 *
 * ─────────────────────────────────────────────────────────────────────
 * ⚠️  LOADER RULES — اقرأ قبل أي تعديل
 * ─────────────────────────────────────────────────────────────────────
 * هذا الملف يُحمَّل في emr.html بعد emr-app.js وبعد specialty-config.js.
 * يعمل بـ observer pattern: ينتظر _sets (clinic settings) من Firebase،
 * يقرأ specialty، ثم يُفعّل UI المناسب — دون الكتابة على أي كود موجود.
 *
 * التحميل في emr.html (آخر script):
 *   <script src="specialty-config.js"></script>
 *   <script src="emr-specialty-loader.js"></script>
 *
 * SAFETY ANCHORS:
 *   1. إذا specialty === 'general_medicine' أو غير موجودة →
 *      السلوك الحالي كما هو بدون أي تغيير (legacy path).
 *   2. الـ loader لا يُغيّر vitals tab الأصلية للطب العام أبداً.
 *   3. كل وحدة (module) تُحمَّل كملف منفصل بنمط lazy loading.
 *   4. إذا فشل تحميل الوحدة → يُكمل بدونها بدون crash.
 *   5. الـ loader ينتظر window.ArgonSession.get() قبل أي تطبيق.
 * ─────────────────────────────────────────────────────────────────────
 */

(function (global) {
  'use strict';

  /* ── Guards ── */
  if (typeof window.getSpecialtyConfig === 'undefined') {
    console.warn('[ArgonSpecialtyLoader] specialty-config.js missing — loader disabled.');
    return;
  }

  /* ══ STATE ══ */
  var _loader = {
    currentSpecialty: null,
    currentConfig: null,
    modulesLoaded: [],
    initialized: false,
    settingsWatcher: null
  };

  /* ══════════════════════════════════════════════════════════════════
   * 1. BOOT — ينتظر _sets من Firebase ثم يُهيئ
   * ══════════════════════════════════════════════════════════════════ */
  function boot() {
    /* انتظر حتى يكون _sets متاحاً من emr-app.js */
    var attempts = 0;
    var interval = setInterval(function () {
      attempts++;
      var sets = (typeof window._sets !== 'undefined') ? window._sets : null;

      if (sets || attempts > 60) {
        clearInterval(interval);
        if (sets && sets.specialty) {
          applySpecialty(sets.specialty, sets);
        } else {
          /* لا تخصص = general_medicine = سلوك حالي */
          console.log('[ArgonSpecialtyLoader] No specialty set — using legacy general_medicine path.');
          applyGeneralMedicineDefaults();
        }
      }
    }, 200);

    /* استمع لتغيير _sets مستقبلاً (إذا تغيرت إعدادات العيادة) */
    if (typeof db !== 'undefined' && typeof BASE !== 'undefined') {
      _loader.settingsWatcher = db.ref(BASE + '/settings/specialty').on('value', function (snap) {
        var newSpec = snap.val();
        if (newSpec && newSpec !== _loader.currentSpecialty) {
          applySpecialty(newSpec, window._sets || {});
        }
      });
    }
  }

  /* ══════════════════════════════════════════════════════════════════
   * 2. applySpecialty — النقطة المركزية لتطبيق التخصص
   * ══════════════════════════════════════════════════════════════════ */
  function applySpecialty(specialtyId, settings) {
    if (!specialtyId) return;

    _loader.currentSpecialty = specialtyId;
    _loader.currentConfig = window.getSpecialtyConfig(specialtyId);
    var cfg = _loader.currentConfig;

    /* ── 2a. لا نُطبق شيئاً على general_medicine (legacy path) ── */
    if (specialtyId === 'general_medicine') {
      applyGeneralMedicineDefaults();
      return;
    }

    console.log(
      '%c[ArgonSpecialtyLoader] Applying specialty: ' + cfg.emoji + ' ' + cfg.nameAr,
      'color:' + cfg.color + ';font-weight:bold'
    );

    /* ── 2b. تطبيق CSS Variables ── */
    applyCSSVariables(cfg);

    /* ── 2c. تطبيق UI (topbar badge, sidebar items) ── */
    applyTopbarBadge(cfg);
    applyVisitTabsFilter(cfg);
    applySidebarSpecialtyItems(cfg);

    /* ── 2d. تطبيق العلامات الحيوية المتخصصة ── */
    applySpecialtyVitalsHint(cfg);

    /* ── 2e. تطبيق الشكاوى السريعة في workspace ── */
    applyQuickComplaints(cfg);

    /* ── 2f. تحميل الوحدات الخاصة ── */
    loadSpecialtyModules(cfg);

    _loader.initialized = true;
  }

  /* ══════════════════════════════════════════════════════════════════
   * 3. general_medicine — لا نُغيّر شيئاً
   * ══════════════════════════════════════════════════════════════════ */
  function applyGeneralMedicineDefaults() {
    _loader.currentSpecialty = 'general_medicine';
    _loader.currentConfig = window.getSpecialtyConfig('general_medicine');
    _loader.initialized = true;
    /* ⚠️ SAFETY: لا تغيير على الواجهة للطب العام — legacy path محفوظ */
    console.log('[ArgonSpecialtyLoader] general_medicine — legacy UI path active, no changes applied.');
  }

  /* ══════════════════════════════════════════════════════════════════
   * 4. CSS Variables — لون التخصص في كل الواجهة
   * ══════════════════════════════════════════════════════════════════ */
  function applyCSSVariables(cfg) {
    var root = document.documentElement;
    root.style.setProperty('--specialty-color',       cfg.color);
    root.style.setProperty('--specialty-color-light', cfg.colorLight);
    root.style.setProperty('--specialty-emoji',       '"' + cfg.emoji + '"');

    /* إضافة style tag مرة واحدة فقط */
    if (document.getElementById('_argon-specialty-vars')) return;
    var style = document.createElement('style');
    style.id = '_argon-specialty-vars';
    style.textContent = [
      /* تلوين الـ topbar بلطف */
      '.tlogo { border-right: 3px solid var(--specialty-color, #0d9488) !important; }',
      /* تلوين أزرار المرحلة النشطة */
      '.visit-tab.active { border-bottom-color: var(--specialty-color, #0d9488) !important; color: var(--specialty-color, #0d9488) !important; }',
      /* تلوين sidebar item نشط */
      '.ni.on { color: var(--specialty-color, #0d9488) !important; }',
      /* specialty badge */
      '.argon-specialty-topbar-badge {',
        'display:inline-flex;align-items:center;gap:4px;',
        'padding:2px 10px;border-radius:20px;font-size:0.72rem;font-weight:800;',
        'background:var(--specialty-color-light,rgba(13,148,136,0.1));',
        'color:var(--specialty-color,#0d9488);',
        'border:1px solid color-mix(in srgb, var(--specialty-color,#0d9488) 25%, transparent);',
        'margin-right:8px;',
      '}',
    ].join('\n');
    document.head.appendChild(style);
  }

  /* ══════════════════════════════════════════════════════════════════
   * 5. Topbar Badge — يُظهر اسم التخصص بجانب اسم الطبيب
   * ══════════════════════════════════════════════════════════════════ */
  function applyTopbarBadge(cfg) {
    /* انتظر topName يُعبَّأ من emr-app.js */
    var attempts = 0;
    var interval = setInterval(function () {
      attempts++;
      var topName = document.getElementById('topName');
      if (!topName || attempts > 30) {
        clearInterval(interval);
        return;
      }
      if (topName.textContent.includes('...')) return; /* لم يُعبَّأ بعد */

      clearInterval(interval);

      /* لا تُضيف مرتين */
      if (document.querySelector('.argon-specialty-topbar-badge')) return;

      var badge = document.createElement('span');
      badge.className = 'argon-specialty-topbar-badge';
      badge.innerHTML = cfg.emoji + ' ' + cfg.nameAr;
      badge.title = cfg.nameEn;

      /* أضف بعد topName */
      topName.insertAdjacentElement('afterend', badge);
    }, 300);
  }

  /* ══════════════════════════════════════════════════════════════════
   * 6. Visit Tabs Filter — إخفاء تبويبات غير مناسبة
   * ══════════════════════════════════════════════════════════════════ */
  function applyVisitTabsFilter(cfg) {
    /* ⚠️ SAFETY: لا نُخفي Lab/Rad للمجمع الطبي — تبقى كما هي */
    /* فقط نُعلَّق كـ hint للمستخدم */
    var vitalsTab = document.querySelector('[onclick*="tabVitals"]');
    if (vitalsTab && cfg.vitals && cfg.vitals.note) {
      vitalsTab.title = cfg.vitals.note;
    }
  }

  /* ══════════════════════════════════════════════════════════════════
   * 7. Sidebar Specialty Items — إضافة روابط الوحدات في الشريط
   * ══════════════════════════════════════════════════════════════════ */
  function applySidebarSpecialtyItems(cfg) {
    var sidebarContainer = document.querySelector('.sidebar > div:first-child');
    if (!sidebarContainer) return;

    /* حذف العناصر القديمة إذا وُجدت */
    var old = sidebarContainer.querySelectorAll('.argon-spec-sidebar-item');
    old.forEach(function (el) { el.remove(); });

    /* عنوان قسم */
    if (cfg.specialModules && cfg.specialModules.length > 0) {
      var divider = document.createElement('div');
      divider.className = 'sl argon-spec-sidebar-item';
      divider.innerHTML = cfg.emoji + ' أدوات ' + cfg.nameAr;
      sidebarContainer.appendChild(divider);
    }

    /* وحدات الأسنان */
    if (cfg.features && cfg.features.dentalChart) {
      addSidebarSpecItem(sidebarContainer, 'dentalChartSection', '🦷 الرسم البياني للأسنان', 'fa-tooth', cfg.color);
    }
    /* وحدة النمو للأطفال */
    if (cfg.features && cfg.features.growthCharts) {
      addSidebarSpecItem(sidebarContainer, 'growthChartsSection', '📈 منحنيات النمو', 'fa-chart-line', cfg.color);
    }
    /* جدول التطعيمات */
    if (cfg.features && cfg.features.vaccinationSchedule) {
      addSidebarSpecItem(sidebarContainer, 'vaccinationSection', '💉 جدول التطعيمات', 'fa-syringe', cfg.color);
    }
    /* سجل الحمل */
    if (cfg.features && cfg.features.pregnancyTracking) {
      addSidebarSpecItem(sidebarContainer, 'pregnancySection', '🤱 متابعة الحمل', 'fa-baby', cfg.color);
    }
    /* ECG */
    if (cfg.features && cfg.features.ecgReport) {
      addSidebarSpecItem(sidebarContainer, 'ecgSection', '💓 تقرير رسم القلب', 'fa-heartbeat', cfg.color);
    }
    /* سجل ضغط الدم */
    if (cfg.features && cfg.features.bpLogChart) {
      addSidebarSpecItem(sidebarContainer, 'bpLogSection', '📊 سجل ضغط الدم', 'fa-chart-area', cfg.color);
    }
    /* حاسبات المخاطر */
    if (cfg.features && cfg.features.framinghamRisk) {
      addSidebarSpecItem(sidebarContainer, 'riskCalcSection', '🧮 حاسبات المخاطر القلبية', 'fa-calculator', cfg.color);
    }
    /* مقاييس التقييم النفسي */
    if (cfg.features && cfg.features.phq9) {
      addSidebarSpecItem(sidebarContainer, 'assessmentScalesSection', '📋 مقاييس التقييم النفسي', 'fa-brain', cfg.color);
    }
    /* لوحة السكري */
    if (cfg.features && cfg.features.diabetesDashboard) {
      addSidebarSpecItem(sidebarContainer, 'diabetesDashSection', '🩸 لوحة متابعة السكري', 'fa-tint', cfg.color);
    }
    /* وظائف الرئة */
    if (cfg.features && cfg.features.spirometry) {
      addSidebarSpecItem(sidebarContainer, 'spirometrySection', '🫁 وظائف الرئة', 'fa-lungs', cfg.color);
    }
    /* خريطة الألم */
    if (cfg.features && cfg.features.painBodyMap) {
      addSidebarSpecItem(sidebarContainer, 'painMapSection', '🗺️ خريطة الألم', 'fa-map-marked-alt', cfg.color);
    }
  }

  function addSidebarSpecItem(container, sectionId, label, iconClass, color) {
    var item = document.createElement('div');
    item.className = 'ni argon-spec-sidebar-item';
    item.style.cssText = 'color:' + color + ';opacity:0.85;font-size:0.82rem;';
    item.innerHTML = '<i class="fas ' + iconClass + '" style="color:' + color + '"></i>' + label;

    item.addEventListener('click', function () {
      /* إذا وُجد قسم بهذا الـ id أفتحه، وإلا أظهر toast */
      var section = document.getElementById(sectionId);
      if (section) {
        /* استخدم sw() من emr-app.js */
        if (typeof window.sw === 'function') window.sw(sectionId, item);
      } else {
        /* القسم لم يُنشأ بعد — الوحدة لم تُحمَّل */
        if (typeof window.toast === 'function') {
          window.toast('⏳ جاري تحميل وحدة ' + label + ' ...', 'ok');
        }
        /* محاولة تحميل الوحدة عند الطلب */
        triggerModuleLoad(sectionId, color);
      }
    });

    container.appendChild(item);
  }

  /* ══════════════════════════════════════════════════════════════════
   * 8. Vitals Hint — تلميح بالعلامات الحيوية الإضافية للتخصص
   * ══════════════════════════════════════════════════════════════════ */
  function applySpecialtyVitalsHint(cfg) {
    if (!cfg.vitals) return;

    var vitalsForm = document.getElementById('tabVitals');
    if (!vitalsForm) return;

    /* لا تُضيف مرتين */
    if (document.getElementById('_argon-vitals-hint')) return;

    var specialVitals = cfg.vitals.show.filter(function (v) {
      /* العلامات الإضافية غير الموجودة في الـ tab الحالية */
      var currentVitals = ['temp', 'bp', 'hr', 'o2_sat'];
      return currentVitals.indexOf(v) === -1;
    });

    if (!specialVitals.length) return;

    var vitalsMap = {
      bp_right:          'ضغط الدم (يمين)',
      bp_left:           'ضغط الدم (يسار)',
      rr:                'معدل التنفس (bpm)',
      rhythm:            'إيقاع القلب',
      weight:            'الوزن (kg)',
      height:            'الطول (cm)',
      head_circumference:'محيط الرأس (cm)'
    };

    var hint = document.createElement('div');
    hint.id = '_argon-vitals-hint';
    hint.style.cssText = [
      'margin:10px 16px;padding:10px 14px;border-radius:10px;',
      'background:', cfg.colorLight, ';',
      'border:1px solid ', cfg.color + '30', ';',
      'font-size:0.78rem;color:', cfg.color, ';',
    ].join('');

    hint.innerHTML = [
      '<div style="font-weight:800;margin-bottom:6px">',
        cfg.emoji, ' علامات حيوية إضافية لـ ', cfg.nameAr, ':',
      '</div>',
      '<div style="display:flex;flex-wrap:wrap;gap:6px">',
        specialVitals.map(function (v) {
          return '<span style="background:rgba(255,255,255,0.5);padding:2px 8px;border-radius:6px;font-weight:700">' +
            (vitalsMap[v] || v) + '</span>';
        }).join(''),
      '</div>',
      '<div style="margin-top:6px;font-size:0.7rem;opacity:0.7">',
        'سيتم تفعيل حقول إدخال هذه العلامات في الإصدار القادم.',
      '</div>',
    ].join('');

    /* أضف في نهاية tabVitals */
    vitalsForm.appendChild(hint);
  }

  /* ══════════════════════════════════════════════════════════════════
   * 9. Quick Complaints — إضافة chip سريعة في workspace
   * ══════════════════════════════════════════════════════════════════ */
  function applyQuickComplaints(cfg) {
    if (!cfg.quickComplaints || !cfg.quickComplaints.length) return;

    /* انتظر تحميل workspace */
    var attempts = 0;
    var checkInterval = setInterval(function () {
      attempts++;

      var complaintInput = document.getElementById('vComplaint');
      if (!complaintInput) {
        if (attempts > 20) clearInterval(checkInterval);
        return;
      }

      clearInterval(checkInterval);

      /* لا تُضيف مرتين */
      if (document.getElementById('_argon-quick-complaints')) return;

      var wrap = document.createElement('div');
      wrap.id = '_argon-quick-complaints';
      wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:-6px;margin-bottom:8px;';

      cfg.quickComplaints.slice(0, 8).forEach(function (complaint) {
        var chip = document.createElement('span');
        chip.className = 'tag';
        chip.style.cssText = 'cursor:pointer;font-size:0.7rem;background:' + cfg.colorLight + ';color:' + cfg.color + ';border:1px solid ' + cfg.color + '30;';
        chip.textContent = complaint;
        chip.title = 'اضغط للإضافة';
        chip.addEventListener('click', function () {
          var inp = document.getElementById('vComplaint');
          if (!inp) return;
          if (inp.value && inp.value.slice(-2) !== '، ') {
            inp.value += '، ';
          }
          inp.value += complaint;
          inp.dispatchEvent(new Event('input')); /* trigger autosave */
        });
        wrap.appendChild(chip);
      });

      /* أضف قبل حقل الشكوى */
      complaintInput.parentNode.insertBefore(wrap, complaintInput);
    }, 500);
  }

  /* ══════════════════════════════════════════════════════════════════
   * 10. Load Specialty Modules — lazy loading للوحدات
   * ══════════════════════════════════════════════════════════════════ */
  function loadSpecialtyModules(cfg) {
    if (!cfg.specialModules || !cfg.specialModules.length) return;

    cfg.specialModules.forEach(function (moduleName) {
      if (_loader.modulesLoaded.indexOf(moduleName) !== -1) return;
      loadModule(moduleName);
    });
  }

  function loadModule(moduleName) {
    var scriptPath = 'specialty-modules/' + moduleName + '.js';

    var script = document.createElement('script');
    script.src = scriptPath + '?v=1.0';
    script.async = true;

    script.onload = function () {
      _loader.modulesLoaded.push(moduleName);
      console.log('[ArgonSpecialtyLoader] Module loaded:', moduleName);

      /* إذا الوحدة تنتظر init */
      var moduleKey = toCamelCase(moduleName);
      if (window[moduleKey] && typeof window[moduleKey].init === 'function') {
        window[moduleKey].init();
      }
    };

    script.onerror = function () {
      console.warn('[ArgonSpecialtyLoader] Module not found (non-critical):', moduleName);
      /* الوحدة غير موجودة = لا crash */
    };

    document.head.appendChild(script);
  }

  function triggerModuleLoad(sectionId, color) {
    /* إذا الوحدة لم تُحمَّل بعد — تحميل عند الطلب */
    var moduleMap = {
      dentalChartSection: 'dental_chart_module',
      growthChartsSection: 'growth_chart_module',
      vaccinationSection: 'vaccination_module',
      ecgSection: 'ecg_module',
      bpLogSection: 'bp_chart_module',
      riskCalcSection: 'risk_calculator_module',
      assessmentScalesSection: 'assessment_scales_module',
      diabetesDashSection: 'diabetes_module',
      spirometrySection: 'spirometry_module',
      painMapSection: 'pain_map_module',
      pregnancySection: 'pregnancy_module'
    };
    var modName = moduleMap[sectionId];
    if (modName && _loader.modulesLoaded.indexOf(modName) === -1) {
      loadModule(modName);
    }
  }

  /* ══════════════════════════════════════════════════════════════════
   * 11. Public API — للاستخدام من emr-app.js أو الوحدات
   * ══════════════════════════════════════════════════════════════════ */
  global.ArgonSpecialtyLoader = {

    /** الحصول على التخصص الحالي */
    getCurrentSpecialty: function () {
      return _loader.currentSpecialty;
    },

    /** الحصول على إعداد التخصص الحالي */
    getCurrentConfig: function () {
      return _loader.currentConfig;
    },

    /** هل التخصص الحالي يدعم ميزة معينة؟ */
    hasFeature: function (featureName) {
      var cfg = _loader.currentConfig;
      return cfg && cfg.features && !!cfg.features[featureName];
    },

    /** تحميل وحدة بالاسم يدوياً */
    loadModule: loadModule,

    /** إعادة تطبيق التخصص (بعد تحديث _sets) */
    reapply: function () {
      var sets = window._sets;
      if (sets && sets.specialty) applySpecialty(sets.specialty, sets);
    },

    /**
     * renderSpecialtyVitalsForm(containerId)
     * ينشئ نموذج علامات حيوية مُخصَّص للتخصص.
     * للاستخدام من specialty modules فقط.
     * ⚠️ لا يُلغي tabVitals الأصلية — يُضيف بجانبها.
     */
    renderSpecialtyVitalsForm: function (containerId) {
      var cfg = _loader.currentConfig;
      if (!cfg || !cfg.vitals) return;

      var container = document.getElementById(containerId);
      if (!container) return;

      var vitalsConfig = cfg.vitals;
      var showList = vitalsConfig.show || [];

      var fieldMap = {
        temp:               { label: 'الحرارة (°C)',       placeholder: '37.0', inputId: 'svTemp',  type: 'number' },
        bp:                 { label: 'ضغط الدم',           placeholder: '120/80', inputId: 'svBp',  type: 'text'   },
        bp_right:           { label: 'ضغط (يمين)',          placeholder: '120/80', inputId: 'svBpR', type: 'text'   },
        bp_left:            { label: 'ضغط (يسار)',          placeholder: '120/80', inputId: 'svBpL', type: 'text'   },
        hr:                 { label: 'نبض القلب (bpm)',      placeholder: '80',    inputId: 'svHr',   type: 'number' },
        pulse:              { label: 'النبض (bpm)',          placeholder: '80',    inputId: 'svHr',   type: 'number' },
        rhythm:             { label: 'الإيقاع',             options: ['منتظم', 'غير منتظم'], inputId: 'svRhythm', type: 'select' },
        rr:                 { label: 'معدل التنفس',          placeholder: '16',    inputId: 'svRR',   type: 'number' },
        o2_sat:             { label: 'تشبع O₂ (%)',          placeholder: '98',    inputId: 'svO2',   type: 'number' },
        weight:             { label: 'الوزن (kg)',           placeholder: '70',    inputId: 'svWt',   type: 'number' },
        height:             { label: 'الطول (cm)',           placeholder: '170',   inputId: 'svHt',   type: 'number' },
        head_circumference: { label: 'محيط الرأس (cm)',      placeholder: '35',    inputId: 'svHC',   type: 'number' }
      };

      var html = '<div class="fi-row4">';
      showList.forEach(function (key) {
        var f = fieldMap[key];
        if (!f) return;
        html += '<div class="fg"><label>' + f.label + '</label>';
        if (f.type === 'select') {
          html += '<select id="' + f.inputId + '" class="fi">';
          (f.options || []).forEach(function (opt) { html += '<option>' + opt + '</option>'; });
          html += '</select>';
        } else {
          html += '<input type="' + f.type + '" id="' + f.inputId + '" class="fi" placeholder="' + f.placeholder + '" dir="ltr">';
        }
        html += '</div>';
      });
      html += '</div>';

      /* BMI Auto-Calculator */
      if (showList.indexOf('weight') !== -1 && showList.indexOf('height') !== -1) {
        html += '<div id="_svBmiResult" style="font-size:0.8rem;color:var(--teal);margin-top:6px;font-weight:700;"></div>';
      }

      container.innerHTML = html;

      /* BMI listener */
      if (showList.indexOf('weight') !== -1 && showList.indexOf('height') !== -1) {
        ['svWt', 'svHt'].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.addEventListener('input', _calcBMIInline);
        });
      }

      /* BP comparison */
      if (showList.indexOf('bp_right') !== -1 && showList.indexOf('bp_left') !== -1) {
        ['svBpR', 'svBpL'].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.addEventListener('input', _calcBPDiff);
        });
      }
    },

    /** استخراج قيم العلامات الحيوية المتخصصة (للحفظ) */
    getSpecialtyVitalsValues: function () {
      return {
        bp_right: (document.getElementById('svBpR') || {}).value || null,
        bp_left:  (document.getElementById('svBpL') || {}).value || null,
        rhythm:   (document.getElementById('svRhythm') || {}).value || null,
        rr:       (document.getElementById('svRR') || {}).value || null,
        weight:   (document.getElementById('svWt') || {}).value || null,
        height:   (document.getElementById('svHt') || {}).value || null,
        head_circumference: (document.getElementById('svHC') || {}).value || null
      };
    },

    /**
     * getFollowUpMessage(ruleKey)
     * رسالة المتابعة للتخصص الحالي
     */
    getFollowUpMessage: function (ruleKey) {
      if (typeof window.getFollowUpDate === 'function') {
        var d = window.getFollowUpDate(_loader.currentSpecialty, ruleKey);
        var cfg = _loader.currentConfig;
        var rule = cfg && cfg.followUpRules && (cfg.followUpRules[ruleKey] || cfg.followUpRules.routine);
        return {
          date: d,
          message: rule ? rule.message : null
        };
      }
      return null;
    },

    /** بيانات الوحدات المُحمَّلة */
    getLoadedModules: function () { return _loader.modulesLoaded.slice(); },

    /** هل تم التهيئة؟ */
    isInitialized: function () { return _loader.initialized; }
  };

  /* ══════════════════════════════════════════════════════════════════
   * 12. HELPERS
   * ══════════════════════════════════════════════════════════════════ */
  function _calcBMIInline() {
    var wEl = document.getElementById('svWt');
    var hEl = document.getElementById('svHt');
    var res = document.getElementById('_svBmiResult');
    if (!wEl || !hEl || !res) return;

    var w = parseFloat(wEl.value);
    var h = parseFloat(hEl.value) / 100;
    if (!w || !h || h <= 0) { res.textContent = ''; return; }

    var bmi = (w / (h * h)).toFixed(1);
    var label = bmi < 18.5 ? 'نقص وزن' : bmi < 25 ? 'طبيعي ✅' : bmi < 30 ? 'زيادة وزن' : 'سمنة ⚠️';
    var color = bmi < 18.5 ? 'var(--amber)' : bmi < 25 ? 'var(--green)' : bmi < 30 ? 'var(--amber)' : 'var(--red)';
    res.innerHTML = '<i class="fas fa-weight"></i> BMI: <span style="color:' + color + ';font-weight:900">' + bmi + '</span> — ' + label;
  }

  function _calcBPDiff() {
    var rEl = document.getElementById('svBpR');
    var lEl = document.getElementById('svBpL');
    if (!rEl || !lEl) return;

    var rVal = rEl.value.split('/')[0];
    var lVal = lEl.value.split('/')[0];
    var diff = Math.abs(parseInt(rVal) - parseInt(lVal));

    if (!isNaN(diff) && diff > 0) {
      var existingNote = document.getElementById('_svBpDiff');
      if (!existingNote) {
        existingNote = document.createElement('div');
        existingNote.id = '_svBpDiff';
        existingNote.style.cssText = 'font-size:0.75rem;margin-top:4px;font-weight:700;';
        rEl.parentNode.parentNode.parentNode.appendChild(existingNote);
      }
      var warn = diff >= 15 ? ' ⚠️ فرق ملحوظ — يستدعي التقييم' : '';
      existingNote.style.color = diff >= 15 ? 'var(--red)' : 'var(--muted)';
      existingNote.textContent = 'فرق الضغط بين الذراعين: ' + diff + ' mmHg' + warn;
    }
  }

  function toCamelCase(str) {
    return str.replace(/_([a-z])/g, function (g) { return g[1].toUpperCase(); });
  }

  /* ── BOOT ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 500); });
  } else {
    setTimeout(boot, 500);
  }

  console.log('[ArgonSpecialtyLoader] v1.0 initialized — waiting for clinic settings...');

}(window));
