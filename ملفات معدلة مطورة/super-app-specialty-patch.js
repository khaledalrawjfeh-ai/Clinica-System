/**
 * 🏥 ARGON MEDICAL OS — Super Admin Specialty Patch
 * super-app-specialty-patch.js — v1.0
 *
 * ─────────────────────────────────────────────────────────────────────
 * ⚠️  PATCH RULES — اقرأ قبل أي تعديل
 * ─────────────────────────────────────────────────────────────────────
 * هذا الملف يُحمَّل بعد super-app.js وبعد specialty-config.js.
 * يعمل بنمط patch: يُعدّل addClinic() الأصلية ليُضيف حقل التخصص،
 * ويُضيف Specialty Picker في HTML، ويُعدّل بطاقات العيادات لتُظهر
 * التخصص — دون المساس بأي كود موجود.
 *
 * التحميل في super.html (بعد super-app.js):
 *   <script src="specialty-config.js"></script>
 *   <script src="super-app-specialty-patch.js"></script>
 *
 * SAFETY:
 *   - إذا لم يُوجد specialty-config.js، الـ patch يُسكت نفسه.
 *   - addClinic() الأصلية تعمل بشكل كامل إذا فشل الـ patch.
 *   - العيادات القديمة بدون specialty تعمل بالسلوك الحالي ذاته.
 * ─────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  /* ── Guard: يحتاج specialty-config.js أولاً ── */
  if (typeof window.ARGON_SPECIALTIES === 'undefined' ||
      typeof window.getSpecialtyConfig === 'undefined') {
    console.warn('[ArgonSpecialtyPatch] specialty-config.js not loaded — patch skipped.');
    return;
  }

  /* ══ STATE ══ */
  var _selectedSpecialty = 'general_medicine';
  var _patchReady = false;

  /* ══════════════════════════════════════════════════════════════════
   * 1. INJECT SPECIALTY PICKER INTO super.html ADD FORM
   * ══════════════════════════════════════════════════════════════════ */
  function injectSpecialtyPicker() {
    /* استهداف حقل اللون — نُضيف التخصص قبله */
    var colorField = document.querySelector('#nColor')?.closest('.fg');
    if (!colorField) {
      /* fallback: نُضيفه في بداية form-grid */
      var formGrid = document.querySelector('.form-grid');
      if (!formGrid) return;
      colorField = formGrid.firstElementChild;
    }

    /* لا نُضيف مرتين */
    if (document.getElementById('argon-specialty-picker-wrap')) return;

    var wrapper = document.createElement('div');
    wrapper.id = 'argon-specialty-picker-wrap';
    wrapper.className = 'fg';
    wrapper.style.cssText = 'grid-column: span 3;';

    wrapper.innerHTML = [
      '<label style="display:flex;align-items:center;gap:8px;font-weight:700">',
        '<i class="fas fa-stethoscope" style="color:var(--teal)"></i>',
        ' تخصص العيادة الطبي *',
        '<span id="spec-selected-badge" style="',
          'margin-right:auto;font-size:0.75rem;padding:3px 12px;border-radius:20px;',
          'background:rgba(13,148,136,0.12);color:#0d9488;font-weight:800;',
          'border:1px solid rgba(13,148,136,0.25);transition:all 0.3s;',
        '">🩺 الطب العام</span>',
      '</label>',
      '<div id="argon-specialty-grid" style="',
        'display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));',
        'gap:8px;padding:12px;margin-top:8px;',
        'background:rgba(255,255,255,0.02);border:1px solid var(--border);',
        'border-radius:12px;max-height:280px;overflow-y:auto;',
      '"></div>',
      '<input type="hidden" id="nSpecialty" value="general_medicine">',
    ].join('');

    /* أدخل قبل حقل اللون */
    colorField.parentNode.insertBefore(wrapper, colorField);

    /* ارسم البطاقات */
    renderSpecialtyCards();
  }

  function renderSpecialtyCards() {
    var grid = document.getElementById('argon-specialty-grid');
    if (!grid) return;

    var list = window.SPECIALTY_LIST_FOR_UI || [];

    grid.innerHTML = list.map(function (s) {
      var isSelected = s.id === _selectedSpecialty;
      return [
        '<div class="argon-spec-card" data-id="', s.id, '"',
          ' onclick="ArgonSpecialtyPatch.selectSpecialty(\'', s.id, '\')"',
          ' title="', s.nameEn, '"',
          ' style="',
            'display:flex;flex-direction:column;align-items:center;gap:4px;',
            'padding:10px 6px;border-radius:10px;cursor:pointer;',
            'border:2px solid ', (isSelected ? s.color : 'transparent'), ';',
            'background:', (isSelected ? 'rgba(13,148,136,0.08)' : 'rgba(255,255,255,0.02)'), ';',
            'transition:all 0.18s;',
            '--spec-color:', s.color, ';',
          '">',
          '<div style="font-size:1.6rem">', s.emoji, '</div>',
          '<div style="',
            'font-size:0.68rem;font-weight:700;text-align:center;line-height:1.3;',
            'color:', (isSelected ? s.color : 'var(--muted)'), ';',
          '">', s.nameAr, '</div>',
        '</div>',
      ].join('');
    }).join('');

    /* hover styles injected once */
    if (!document.getElementById('_argon-spec-hover-style')) {
      var style = document.createElement('style');
      style.id = '_argon-spec-hover-style';
      style.textContent = [
        '.argon-spec-card:hover {',
          'border-color: var(--spec-color) !important;',
          'background: rgba(13,148,136,0.06) !important;',
          'transform: scale(1.04);',
        '}',
      ].join('');
      document.head.appendChild(style);
    }
  }

  /* ══════════════════════════════════════════════════════════════════
   * 2. PUBLIC: selectSpecialty
   * ══════════════════════════════════════════════════════════════════ */
  function selectSpecialty(id) {
    if (!window.ARGON_SPECIALTIES[id]) return;

    _selectedSpecialty = id;
    var cfg = window.getSpecialtyConfig(id);

    /* تحديث hidden input */
    var inp = document.getElementById('nSpecialty');
    if (inp) inp.value = id;

    /* تحديث badge */
    var badge = document.getElementById('spec-selected-badge');
    if (badge) {
      badge.textContent = cfg.emoji + ' ' + cfg.nameAr;
      badge.style.background = cfg.colorLight;
      badge.style.color = cfg.color;
      badge.style.borderColor = cfg.color + '40';
    }

    /* تحديث لون اختيار العيادة اقتراحاً (إذا لم يُعدَّل) */
    var colorSel = document.getElementById('nColor');
    if (colorSel && colorSel.dataset.autoColor !== 'manual') {
      /* أضف لون التخصص كأول خيار مؤقت إذا لم يكن موجوداً */
      var hasColor = false;
      for (var i = 0; i < colorSel.options.length; i++) {
        if (colorSel.options[i].value === cfg.color) { hasColor = true; break; }
      }
      if (hasColor) colorSel.value = cfg.color;
    }

    /* placeholder اسم العيادة */
    var nameInp = document.getElementById('nName');
    if (nameInp && !nameInp.value.trim()) {
      nameInp.placeholder = 'عيادة ' + cfg.nameAr + ' — د. ';
    }

    /* أعد رسم cards لتحديث الـ selected state */
    renderSpecialtyCards();

    /* تنبيه للمستخدم إذا اختار تخصصاً يحتاج وحدات خاصة */
    var specialModules = cfg.specialModules || [];
    if (specialModules.length > 0 && id !== 'general_medicine') {
      var existingNote = document.getElementById('_spec-module-note');
      if (!existingNote) {
        var note = document.createElement('div');
        note.id = '_spec-module-note';
        note.style.cssText = [
          'margin-top:8px;padding:8px 12px;border-radius:8px;font-size:0.78rem;',
          'background:rgba(13,148,136,0.08);border:1px solid rgba(13,148,136,0.2);',
          'color:var(--teal);font-weight:600;',
        ].join('');
        document.getElementById('argon-specialty-picker-wrap').appendChild(note);
        existingNote = note;
      }
      existingNote.innerHTML =
        '<i class="fas fa-info-circle"></i> هذا التخصص يُفعّل: ' +
        specialModules.map(function (m) {
          return '<span style="background:rgba(13,148,136,0.15);padding:1px 6px;border-radius:4px;margin-right:4px">' + m + '</span>';
        }).join('') + ' عند تحميل شاشة الطبيب.';
    } else {
      var oldNote = document.getElementById('_spec-module-note');
      if (oldNote) oldNote.remove();
    }
  }

  /* ══════════════════════════════════════════════════════════════════
   * 3. PATCH addClinic() — حفظ التخصص في Firebase
   * ══════════════════════════════════════════════════════════════════ */
  function patchAddClinic() {
    /* الحفظ على الدالة الأصلية */
    var _originalAddClinic = window.addClinic;
    if (!_originalAddClinic) return;

    window.addClinic = async function () {
      /* اقرأ التخصص قبل استدعاء الأصلية */
      var specInp = document.getElementById('nSpecialty');
      var specialty = (specInp && specInp.value) ? specInp.value : 'general_medicine';
      var cfg = window.getSpecialtyConfig(specialty);

      /* احفظه مؤقتاً ليقرأه الـ patch داخل الكود الأصلي */
      window._pendingClinicSpecialty = {
        specialty: specialty,
        specialtyName: cfg.nameAr,
        specialtyEmoji: cfg.emoji,
        specialtyColor: cfg.color,
        specialtyModules: cfg.specialModules || []
      };

      /* استدعِ الدالة الأصلية */
      await _originalAddClinic.apply(this, arguments);

      /* الدالة الأصلية تكتب clinicData — نُكمل بكتابة حقل specialty */
      var idInp = document.getElementById('nId');
      var clinicId = idInp ? idInp.value.trim().toLowerCase() : null;

      if (clinicId && window._pendingClinicSpecialty && typeof db !== 'undefined') {
        try {
          await db.ref('clinics/' + clinicId + '/settings').update({
            specialty:       window._pendingClinicSpecialty.specialty,
            specialtyName:   window._pendingClinicSpecialty.specialtyName,
            specialtyEmoji:  window._pendingClinicSpecialty.specialtyEmoji,
            specialtyColor:  window._pendingClinicSpecialty.specialtyColor,
            specialtyModules: window._pendingClinicSpecialty.specialtyModules
          });
          console.log('[ArgonSpecialtyPatch] specialty saved:', specialty, 'for clinic:', clinicId);
        } catch (e) {
          console.warn('[ArgonSpecialtyPatch] Failed to write specialty — non-critical:', e.message);
        }
      }

      /* reset */
      window._pendingClinicSpecialty = null;
      _selectedSpecialty = 'general_medicine';
      var badge = document.getElementById('spec-selected-badge');
      if (badge) { badge.textContent = '🩺 الطب العام'; badge.style.cssText = ''; }
      renderSpecialtyCards();
    };
  }

  /* ══════════════════════════════════════════════════════════════════
   * 4. PATCH renderCards() — إظهار التخصص في بطاقات العيادات
   * ══════════════════════════════════════════════════════════════════ */
  function patchRenderCards() {
    var _originalRenderCards = window.renderCards;
    if (!_originalRenderCards) return;

    window.renderCards = function (d) {
      /* استدعِ الأصلية أولاً */
      _originalRenderCards.apply(this, arguments);

      /* بعدها أضف specialty badge لكل بطاقة */
      if (!d || !d.length) return;

      d.forEach(function (r) {
        var s = r.settings || {};
        if (!s.specialty || s.specialty === 'general_medicine') return;

        var card = document.getElementById('card-' + r.id);
        if (!card) return;

        /* أضف badge التخصص بعد rc-type-badge */
        var typeBadge = card.querySelector('.rc-type-badge');
        if (!typeBadge) return;

        /* لا تُضيف مرتين */
        if (card.querySelector('.rc-specialty-badge')) return;

        var specColor = s.specialtyColor || '#0d9488';
        var badge = document.createElement('span');
        badge.className = 'rc-specialty-badge';
        badge.style.cssText = [
          'display:inline-block;margin-right:6px;margin-top:4px;',
          'font-size:0.68rem;font-weight:800;padding:2px 8px;border-radius:8px;',
          'background:', specColor + '18', ';',
          'color:', specColor, ';',
          'border:1px solid ', specColor + '35', ';',
        ].join('');
        badge.textContent = (s.specialtyEmoji || '🩺') + ' ' + (s.specialtyName || s.specialty);

        typeBadge.insertAdjacentElement('afterend', badge);
      });
    };
  }

  /* ══════════════════════════════════════════════════════════════════
   * 5. PATCH showLinks() — إضافة EMR Link في روابط العيادة
   * ══════════════════════════════════════════════════════════════════ */
  function patchShowLinks() {
    var _originalShowLinks = window.showLinks;
    if (!_originalShowLinks) return;

    window.showLinks = function (id, name, type) {
      /* الأصلية تُنشئ المحتوى في lContent */
      _originalShowLinks.apply(this, arguments);

      /* أضف التخصص إن وُجد */
      var clinic = window._dataMap ? window._dataMap[id] : null;
      var specName = clinic && clinic.settings && clinic.settings.specialtyName;
      var specEmoji = clinic && clinic.settings && clinic.settings.specialtyEmoji;
      if (!specName) return;

      var lContent = document.getElementById('lContent');
      if (!lContent) return;

      var specDiv = document.createElement('div');
      specDiv.style.cssText = 'margin-bottom:12px;font-size:0.78rem;color:var(--muted)';
      specDiv.innerHTML = '<i class="fas fa-stethoscope"></i> التخصص: <b>' +
        (specEmoji || '') + ' ' + specName + '</b>';

      lContent.insertAdjacentElement('afterbegin', specDiv);
    };
  }

  /* ══════════════════════════════════════════════════════════════════
   * 6. PATCH clearAdd() — إعادة ضبط Specialty Picker
   * ══════════════════════════════════════════════════════════════════ */
  function patchClearAdd() {
    var _originalClearAdd = window.clearAdd;
    if (!_originalClearAdd) return;

    window.clearAdd = function () {
      _originalClearAdd.apply(this, arguments);
      _selectedSpecialty = 'general_medicine';
      var inp = document.getElementById('nSpecialty');
      if (inp) inp.value = 'general_medicine';
      var badge = document.getElementById('spec-selected-badge');
      if (badge) { badge.textContent = '🩺 الطب العام'; badge.style.cssText = ''; }
      renderSpecialtyCards();
      var note = document.getElementById('_spec-module-note');
      if (note) note.remove();
    };
  }

  /* ══════════════════════════════════════════════════════════════════
   * 7. ADD COLOR SELECT onChange — تعيين manual flag
   * ══════════════════════════════════════════════════════════════════ */
  function patchColorSelect() {
    var colorSel = document.getElementById('nColor');
    if (!colorSel) return;
    colorSel.addEventListener('change', function () {
      this.dataset.autoColor = 'manual';
    });
  }

  /* ══════════════════════════════════════════════════════════════════
   * 8. INIT — تنفيذ بعد اكتمال DOM وبعد تحميل super-app.js
   * ══════════════════════════════════════════════════════════════════ */
  function init() {
    if (_patchReady) return;

    /* انتظر toggleAddPanel() الأولى لأن الـ panel يُفتح عند DOMContentLoaded */
    var attempts = 0;
    var maxAttempts = 40; /* 4 ثوانٍ */

    var interval = setInterval(function () {
      attempts++;

      /* تحقق أن لوحة الإضافة مفتوحة أو جاهزة */
      var formGrid = document.querySelector('.form-grid');
      if (formGrid || attempts >= maxAttempts) {
        clearInterval(interval);

        injectSpecialtyPicker();
        patchAddClinic();
        patchRenderCards();
        patchShowLinks();
        patchClearAdd();
        patchColorSelect();

        _patchReady = true;
        console.log(
          '%c[ArgonSpecialtyPatch] v1.0 ready — ' +
          Object.keys(window.ARGON_SPECIALTIES).length + ' specialties available',
          'color:#0d9488;font-weight:bold'
        );
      }
    }, 100);
  }

  /* ── تصدير Public API ── */
  window.ArgonSpecialtyPatch = {
    selectSpecialty: selectSpecialty,
    getSelected: function () { return _selectedSpecialty; },
    reinjectPicker: function () { injectSpecialtyPicker(); renderSpecialtyCards(); }
  };

  /* ── Boot ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    /* DOM جاهز بالفعل */
    setTimeout(init, 200);
  }

  /* ── إعادة تشغيل إذا فُتح الـ panel لاحقاً ── */
  document.addEventListener('click', function (e) {
    if (!_patchReady) return;
    var btn = e.target.closest('[onclick*="toggleAddPanel"]');
    if (btn) {
      setTimeout(function () {
        if (!document.getElementById('argon-specialty-picker-wrap')) {
          injectSpecialtyPicker();
        }
      }, 50);
    }
  });

}());
