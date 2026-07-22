/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ARGON DENTAL MEDIA GALLERY v2.0
 * معرض الصور والأشعة السنية الاحترافي
 *
 * مستوحى من: Carestream Dental · Planmeca Romexis · Dentsply Sirona · Apteryx
 *
 * المزايا:
 * ✅ تصنيف ذكي: بانورامية / منطقية / عضة / CBCT / سريرية / قبل وبعد
 * ✅ رفع مباشر إلى Firebase Storage مع شريط التقدم
 * ✅ عارض Lightbox احترافي بالتكبير والتحريك والتنقل
 * ✅ مقارنة قبل وبعد بمؤشر السحب التفاعلي
 * ✅ ربط الصور بأرقام الأسنان (FDI) وزيارة محددة
 * ✅ عرض شبكي وعرض زمني (Timeline) مجموّع بالتاريخ
 * ✅ دعم JPEG / PNG / PDF / WebP
 * ✅ ضغط تلقائي للصور الكبيرة قبل الرفع
 * ✅ خلاصة إحصائية (عدد الصور حسب الفئة)
 * ✅ حذف آمن مع تسجيل في Audit Trail
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function (global) {
  'use strict';

  /* ── حالة الوحدة ── */
  let _pid       = null;
  let _cid       = null;
  let _db        = null;
  let _storage   = null;
  let _base      = null;
  let _media     = {};           /* { mediaId: { ...data } } */
  let _filter    = 'all';
  let _viewMode  = 'grid';       /* 'grid' | 'timeline' */
  let _listener  = null;
  let _lbItems   = [];           /* Lightbox items list */
  let _lbIdx     = 0;
  let _lbZoom    = 1;
  let _lbPanX    = 0;
  let _lbPanY    = 0;
  let _lbDragging = false;
  let _lbStartX  = 0;
  let _lbStartY  = 0;

  /* ── ثوابت الفئات ── */
  const CATS = [
    { key: 'all',          label: 'الكل',          icon: '🖼️',  color: 'var(--teal)' },
    { key: 'panoramic',    label: 'بانورامية',     icon: '🦷',  color: '#3b82f6' },
    { key: 'periapical',   label: 'منطقية',        icon: '🔬',  color: '#8b5cf6' },
    { key: 'bitewing',     label: 'عضة',           icon: '📐',  color: '#06b6d4' },
    { key: 'cbct',         label: 'CBCT / ثلاثي', icon: '🧊',  color: '#f59e0b' },
    { key: 'clinical',     label: 'سريرية',        icon: '📷',  color: '#10b981' },
    { key: 'before_after', label: 'قبل وبعد',      icon: '⟺',  color: '#ec4899' },
    { key: 'xray_report',  label: 'تقارير PDF',    icon: '📄',  color: '#ef4444' },
  ];

  const CAT_MAP = Object.fromEntries(CATS.map(c => [c.key, c]));

  /* ────────────────────────────────────────────────────────────────────────────
   * PUBLIC API
   * ──────────────────────────────────────────────────────────────────────────── */
  global.DentalMediaModule = {

    render(containerId, patientId) {
      _pid      = patientId;
      _cid      = typeof CID     !== 'undefined' ? CID     : '';
      _db       = typeof db      !== 'undefined' ? db      : null;
      _storage  = typeof storage !== 'undefined' ? storage : null;
      _base     = typeof BASE    !== 'undefined' ? BASE    : '';

      let container = document.getElementById(containerId);
      if (!container) {
        const tab = document.getElementById('emr-tab-dental-media');
        if (!tab) return;
        tab.innerHTML = '';
        container = document.createElement('div');
        container.id = containerId;
        tab.appendChild(container);
      }

      if (!_pid || !_db) {
        container.innerHTML = _tmpl_empty_nopatient();
        return;
      }

      container.innerHTML = _tmpl_skeleton();
      _stopListener();
      _startListener(container);
    },

    setFilter(key) { _filter = key; _paint(_getContainer()); },
    setView(mode)  { _viewMode = mode; _paint(_getContainer()); },

    openUpload()   { _showUploadModal(); },
    openLightbox(items, idx) { _openLightbox(items, idx); },
    closeLightbox() { _closeLightbox(); },
    lbNext()  { _lbNav(1); },
    lbPrev()  { _lbNav(-1); },
    lbZoomIn()  { _lbSetZoom(_lbZoom * 1.3); },
    lbZoomOut() { _lbSetZoom(_lbZoom / 1.3); },
    lbReset()   { _lbSetZoom(1); },
    async deleteMedia(mediaId) { await _deleteMedia(mediaId); },
    openBeforeAfter(aId, bId) { _showBeforeAfter(aId, bId); },
  };

  /* ────────────────────────────────────────────────────────────────────────────
   * FIREBASE LISTENER
   * ──────────────────────────────────────────────────────────────────────────── */
  function _startListener(container) {
    _listener = _db.ref(`${_base}/patients/${_pid}/dental_media`)
      .orderByChild('uploadedAt')
      .on('value', snap => {
        _media = {};
        snap.forEach(child => { _media[child.key] = { ...child.val(), _id: child.key }; });
        _paint(container);
      });
  }

  function _stopListener() {
    if (_listener && _db && _pid) {
      try { _db.ref(`${_base}/patients/${_pid}/dental_media`).off('value', _listener); } catch(_) {}
    }
    _listener = null;
    _media = {};
  }

  function _getContainer() {
    return document.getElementById('_dm_root_container') || document.querySelector('[id^="_dm"]')?.closest('[id]');
  }

  /* ────────────────────────────────────────────────────────────────────────────
   * PAINT
   * ──────────────────────────────────────────────────────────────────────────── */
  function _paint(container) {
    if (!container) return;

    const filtered = Object.values(_media).filter(m =>
      !m._archived && (_filter === 'all' || m.mediaType === _filter)
    ).sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));

    container.innerHTML = `
    <div id="_dm_root_container" style="font-family:'Tajawal',sans-serif">
      ${_tmpl_header()}
      ${_tmpl_stats()}
      ${_tmpl_filter_tabs()}
      ${_tmpl_view_controls(filtered.length)}
      ${filtered.length === 0
        ? _tmpl_empty_gallery()
        : (_viewMode === 'grid' ? _tmpl_grid(filtered) : _tmpl_timeline(filtered))
      }
    </div>`;

    _bindKeyboard();
  }

  /* ────────────────────────────────────────────────────────────────────────────
   * TEMPLATES
   * ──────────────────────────────────────────────────────────────────────────── */
  function _tmpl_header() {
    return `
    <div style="display:flex;align-items:center;justify-content:space-between;
                flex-wrap:wrap;gap:12px;margin-bottom:18px">
      <div>
        <div style="font-size:1.15rem;font-weight:900;color:var(--text)">
          <i class="fas fa-camera-retro" style="color:#0ea5e9;margin-left:8px"></i>معرض الصور والأشعة
        </div>
        <div style="font-size:0.78rem;color:var(--muted);margin-top:2px">
          توثيق الحالة السريرية — أشعة سينية، صور قبل وبعد، توثيق علاجي
        </div>
      </div>
      <button onclick="DentalMediaModule.openUpload()"
        style="background:linear-gradient(135deg,#0ea5e9,#0284c7);border:none;color:#fff;
               padding:10px 20px;border-radius:10px;font-family:'Tajawal',sans-serif;
               font-weight:800;font-size:0.88rem;cursor:pointer;
               box-shadow:0 6px 16px rgba(14,165,233,0.35);
               display:flex;align-items:center;gap:8px;transition:transform 0.15s"
        onmouseover="this.style.transform='translateY(-1px)'"
        onmouseout="this.style.transform='translateY(0)'">
        <i class="fas fa-cloud-upload-alt"></i> رفع صورة / أشعة جديدة
      </button>
    </div>`;
  }

  function _tmpl_stats() {
    const counts = {};
    CATS.slice(1).forEach(c => { counts[c.key] = 0; });
    Object.values(_media).filter(m=>!m._archived).forEach(m => {
      if (counts[m.mediaType] !== undefined) counts[m.mediaType]++;
    });
    const total = Object.values(counts).reduce((a,b) => a+b, 0);

    return `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px">
      <div style="background:var(--panel);border:1px solid var(--border);border-radius:12px;
                  padding:10px 16px;display:flex;align-items:center;gap:10px;min-width:110px">
        <span style="font-size:1.4rem">🖼️</span>
        <div>
          <div style="font-size:1.2rem;font-weight:900;color:var(--text)">${total}</div>
          <div style="font-size:0.65rem;color:var(--muted)">إجمالي الصور</div>
        </div>
      </div>
      ${CATS.slice(1).filter(c=>counts[c.key]>0).map(c=>`
        <div style="background:var(--panel);border:1px solid var(--border);border-radius:12px;
                    padding:10px 14px;display:flex;align-items:center;gap:8px">
          <span style="font-size:1.1rem">${c.icon}</span>
          <div>
            <div style="font-size:1rem;font-weight:800;color:${c.color}">${counts[c.key]}</div>
            <div style="font-size:0.62rem;color:var(--muted)">${c.label}</div>
          </div>
        </div>`).join('')}
    </div>`;
  }

  function _tmpl_filter_tabs() {
    return `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;
                border-bottom:1px solid var(--border);padding-bottom:12px">
      ${CATS.map(c => {
        const cnt = c.key === 'all'
          ? Object.values(_media).filter(m=>!m._archived).length
          : Object.values(_media).filter(m=>!m._archived && m.mediaType===c.key).length;
        const isActive = _filter === c.key;
        return `
          <button onclick="DentalMediaModule.setFilter('${c.key}')"
            style="background:${isActive ? c.color : 'rgba(255,255,255,0.03)'};
                   border:1px solid ${isActive ? c.color : 'var(--border)'};
                   color:${isActive ? '#fff' : 'var(--muted)'};
                   border-radius:8px;padding:6px 13px;cursor:pointer;font-size:0.78rem;
                   font-family:'Tajawal',sans-serif;font-weight:700;
                   display:inline-flex;align-items:center;gap:5px;transition:all 0.2s">
            ${c.icon} ${c.label}
            ${cnt > 0 ? `<span style="background:${isActive?'rgba(255,255,255,0.25)':'rgba(255,255,255,0.08)'};
                                       border-radius:99px;padding:1px 6px;font-size:0.65rem">${cnt}</span>` : ''}
          </button>`;
      }).join('')}
    </div>`;
  }

  function _tmpl_view_controls(count) {
    return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div style="font-size:0.78rem;color:var(--muted)">
        عرض <b style="color:var(--text)">${count}</b> عنصر
      </div>
      <div style="display:flex;gap:6px">
        <button onclick="DentalMediaModule.setView('grid')"
          title="عرض شبكي"
          style="background:${_viewMode==='grid'?'var(--teal)':'rgba(255,255,255,0.04)'};
                 border:1px solid ${_viewMode==='grid'?'var(--teal)':'var(--border)'};
                 color:${_viewMode==='grid'?'#fff':'var(--muted)'};
                 border-radius:7px;padding:6px 10px;cursor:pointer;font-size:0.8rem">
          <i class="fas fa-th"></i>
        </button>
        <button onclick="DentalMediaModule.setView('timeline')"
          title="عرض زمني"
          style="background:${_viewMode==='timeline'?'var(--teal)':'rgba(255,255,255,0.04)'};
                 border:1px solid ${_viewMode==='timeline'?'var(--teal)':'var(--border)'};
                 color:${_viewMode==='timeline'?'#fff':'var(--muted)'};
                 border-radius:7px;padding:6px 10px;cursor:pointer;font-size:0.8rem">
          <i class="fas fa-stream"></i>
        </button>
      </div>
    </div>`;
  }

  /* ── Grid View ── */
  function _tmpl_grid(items) {
    const lbData = JSON.stringify(items.map(m => ({id:m._id,url:m.url,type:m.mediaType,title:m.title||m.mediaType})))
      .replace(/'/g, "\\'").replace(/"/g,'&quot;');

    return `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));
                gap:14px;align-items:start">
      ${items.map((m, idx) => _tmpl_grid_card(m, idx, items)).join('')}
    </div>`;
  }

  function _tmpl_grid_card(m, idx, allItems) {
    const cat    = CAT_MAP[m.mediaType] || CAT_MAP['clinical'];
    const isPDF  = m.fileFormat === 'pdf' || (m.url||'').includes('.pdf');
    const isBA   = m.mediaType === 'before_after';
    const date   = (m.uploadedAt||'').substring(0,10);
    const tooth  = m.toothFDI ? `🦷 ${m.toothFDI}` : '';

    /* Serialisable items list for lightbox */
    const lbList = JSON.stringify(allItems.map(i=>({
      id:i._id, url:i.url, type:i.mediaType, title:i.title||i.mediaType,
      tooth:i.toothFDI||'', date:i.uploadedAt||''
    }))).replace(/"/g,'&quot;');

    return `
    <div style="background:var(--panel);border:1px solid var(--border);border-radius:14px;
                overflow:hidden;transition:transform 0.2s,box-shadow 0.2s;cursor:pointer;
                position:relative;group"
         onmouseover="this.style.transform='translateY(-3px)';this.style.boxShadow='0 10px 30px rgba(0,0,0,0.3)'"
         onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='none'"
         onclick="DentalMediaModule._openLightboxFromData('${lbList}',${idx})">

      <!-- Thumbnail -->
      <div style="height:150px;overflow:hidden;background:#0a0f0e;position:relative;display:flex;
                  align-items:center;justify-content:center">
        ${isPDF
          ? `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                          height:100%;background:rgba(239,68,68,0.08)">
               <i class="fas fa-file-pdf" style="font-size:3rem;color:#ef4444;opacity:0.8"></i>
               <span style="font-size:0.7rem;color:#f87171;margin-top:8px;font-weight:700">PDF</span>
             </div>`
          : m.thumbnail
            ? `<img src="${_esc(m.thumbnail)}" style="width:100%;height:100%;object-fit:cover;
                                                        transition:transform 0.4s"
                    onmouseover="this.style.transform='scale(1.07)'"
                    onmouseout="this.style.transform='scale(1)'">`
            : m.url
              ? `<img src="${_esc(m.url)}" style="width:100%;height:100%;object-fit:cover;
                                                    transition:transform 0.4s" loading="lazy"
                      onmouseover="this.style.transform='scale(1.07)'"
                      onmouseout="this.style.transform='scale(1)'">`
              : `<i class="fas fa-image" style="font-size:3rem;color:rgba(255,255,255,0.1)"></i>`
        }
        <!-- Category badge -->
        <div style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.6);
                    backdrop-filter:blur(4px);border-radius:6px;padding:3px 8px;font-size:0.65rem;
                    font-weight:700;color:#fff">
          ${cat.icon} ${cat.label}
        </div>
        <!-- Before/After indicator -->
        ${isBA ? `<div style="position:absolute;bottom:8px;left:8px;background:rgba(236,72,153,0.8);
                               border-radius:6px;padding:3px 8px;font-size:0.65rem;font-weight:700;color:#fff">
                    ⟺ قبل وبعد
                  </div>` : ''}
        <!-- Expand icon overlay -->
        <div style="position:absolute;inset:0;background:rgba(0,0,0,0);
                    display:flex;align-items:center;justify-content:center;
                    transition:background 0.2s;opacity:0"
             id="_dm_overlay_${m._id}"
             onmouseover="this.style.background='rgba(0,0,0,0.4)';this.style.opacity='1'"
             onmouseout="this.style.background='rgba(0,0,0,0)';this.style.opacity='0'">
          <i class="fas fa-expand" style="font-size:1.5rem;color:#fff;
                                          filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5))"></i>
        </div>
      </div>

      <!-- Card Footer -->
      <div style="padding:10px 12px">
        <div style="font-weight:700;font-size:0.82rem;color:var(--text);
                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${_esc(m.title || cat.label)}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:5px">
          <div style="display:flex;gap:5px;flex-wrap:wrap">
            ${tooth ? `<span style="font-size:0.62rem;background:rgba(13,148,136,0.1);
                                     color:var(--teal);padding:1px 6px;border-radius:4px">${_esc(tooth)}</span>` : ''}
            <span style="font-size:0.6rem;color:var(--muted)">${_fmtDate(date)}</span>
          </div>
          <!-- Delete -->
          <button onclick="event.stopPropagation();DentalMediaModule.deleteMedia('${m._id}')"
            style="background:transparent;border:none;color:rgba(239,68,68,0.5);cursor:pointer;
                   font-size:0.7rem;padding:2px 4px;transition:color 0.15s"
            onmouseover="this.style.color='#ef4444'"
            onmouseout="this.style.color='rgba(239,68,68,0.5)'"
            title="حذف">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    </div>`;
  }

  /* ── Timeline View ── */
  function _tmpl_timeline(items) {
    /* Group by date */
    const groups = {};
    items.forEach(m => {
      const d = (m.uploadedAt||'').substring(0,10) || 'تاريخ غير محدد';
      if (!groups[d]) groups[d] = [];
      groups[d].push(m);
    });

    return Object.entries(groups)
      .sort((a,b) => b[0].localeCompare(a[0]))
      .map(([date, groupItems]) => `
        <div style="margin-bottom:28px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
            <div style="height:1px;flex:1;background:var(--border)"></div>
            <div style="background:var(--panel);border:1px solid var(--border);border-radius:8px;
                        padding:5px 14px;font-size:0.78rem;font-weight:700;color:var(--text);
                        white-space:nowrap">
              <i class="far fa-calendar-alt" style="color:var(--teal);margin-left:6px"></i>
              ${_fmtDate(date)}
              <span style="color:var(--muted);font-weight:400;margin-right:6px">· ${groupItems.length} عنصر</span>
            </div>
            <div style="height:1px;flex:1;background:var(--border)"></div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px">
            ${groupItems.map((m, i) => _tmpl_grid_card(m, i, groupItems)).join('')}
          </div>
        </div>`).join('');
  }

  function _tmpl_empty_gallery() {
    const catInfo = CAT_MAP[_filter] || CAT_MAP['all'];
    return `
    <div style="text-align:center;padding:80px 40px;border-radius:20px;
                border:1px dashed rgba(14,165,233,0.2);
                background:rgba(14,165,233,0.02)">
      <div style="font-size:4rem;margin-bottom:16px">${catInfo.icon}</div>
      <h3 style="font-weight:900;color:var(--text);margin-bottom:8px;font-size:1.1rem">
        ${_filter === 'all' ? 'لا توجد صور أو أشعة مسجّلة' : `لا توجد ${catInfo.label} مسجّلة`}
      </h3>
      <p style="color:var(--muted);font-size:0.85rem;margin-bottom:24px;max-width:380px;margin-right:auto;margin-left:auto">
        وثّق الحالة السريرية للمريض بالصور والأشعة لمتابعة تقدم العلاج ومقارنة النتائج
      </p>
      <button onclick="DentalMediaModule.openUpload()"
        style="background:linear-gradient(135deg,#0ea5e9,#0284c7);border:none;color:#fff;
               padding:13px 28px;border-radius:12px;font-family:'Tajawal',sans-serif;
               font-weight:800;font-size:0.95rem;cursor:pointer;
               box-shadow:0 6px 20px rgba(14,165,233,0.3)">
        <i class="fas fa-cloud-upload-alt"></i> رفع أول صورة
      </button>
    </div>`;
  }

  function _tmpl_empty_nopatient() {
    return `<div style="text-align:center;padding:60px;color:var(--muted)">
      <i class="fas fa-user-slash" style="font-size:3rem;opacity:0.15;display:block;margin-bottom:16px"></i>
      <p>لم يتم تحديد مريض</p></div>`;
  }

  function _tmpl_skeleton() {
    return `<div style="display:flex;align-items:center;justify-content:center;
                         padding:80px;gap:14px;color:var(--muted)">
      <i class="fas fa-circle-notch fa-spin" style="font-size:1.8rem;color:#0ea5e9"></i>
      <span>جاري تحميل المعرض...</span></div>`;
  }

  /* ────────────────────────────────────────────────────────────────────────────
   * LIGHTBOX
   * ──────────────────────────────────────────────────────────────────────────── */
  global.DentalMediaModule._openLightboxFromData = function(lbListEncoded, idx) {
    try {
      const items = JSON.parse(lbListEncoded.replace(/&quot;/g,'"'));
      _openLightbox(items, idx);
    } catch(e) { console.error('[DentalMedia] Lightbox parse error', e); }
  };

  function _openLightbox(items, idx) {
    _lbItems = items;
    _lbIdx   = idx;
    _lbZoom  = 1;
    _lbPanX  = 0;
    _lbPanY  = 0;

    document.getElementById('_dm_lb')?.remove();

    const overlay = document.createElement('div');
    overlay.id = '_dm_lb';
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(2,7,6,0.97);
      z-index:500000;display:flex;flex-direction:column;
      font-family:'Tajawal',sans-serif;`;

    overlay.innerHTML = `
      <!-- Topbar -->
      <div id="_dm_lb_top" style="display:flex;align-items:center;justify-content:space-between;
               padding:12px 20px;background:rgba(0,0,0,0.4);backdrop-filter:blur(8px);
               border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0;z-index:2">

        <div style="display:flex;align-items:center;gap:14px">
          <div id="_dm_lb_title" style="font-size:0.9rem;font-weight:700;color:#fff"></div>
          <div id="_dm_lb_meta" style="font-size:0.75rem;color:rgba(255,255,255,0.5)"></div>
        </div>

        <div style="display:flex;align-items:center;gap:8px">
          <!-- Zoom controls -->
          <button onclick="DentalMediaModule.lbZoomOut()" title="تصغير"
            style="${_lbBtn()}"><i class="fas fa-search-minus"></i></button>
          <span id="_dm_lb_zoom_label" style="font-size:0.75rem;color:rgba(255,255,255,0.6);
                                                min-width:40px;text-align:center">100%</span>
          <button onclick="DentalMediaModule.lbZoomIn()" title="تكبير"
            style="${_lbBtn()}"><i class="fas fa-search-plus"></i></button>
          <button onclick="DentalMediaModule.lbReset()" title="إعادة ضبط"
            style="${_lbBtn()}"><i class="fas fa-compress-arrows-alt"></i></button>
          <div style="width:1px;height:22px;background:rgba(255,255,255,0.15);margin:0 4px"></div>
          <!-- Download -->
          <button id="_dm_lb_dl" title="تنزيل" style="${_lbBtn()}">
            <i class="fas fa-download"></i>
          </button>
          <!-- Close -->
          <button onclick="DentalMediaModule.closeLightbox()" title="إغلاق"
            style="${_lbBtn('rgba(239,68,68,0.2)','#ef4444')}">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>

      <!-- Main Stage -->
      <div id="_dm_lb_stage"
           style="flex:1;display:flex;align-items:center;justify-content:center;
                  position:relative;overflow:hidden;cursor:grab;user-select:none">

        <!-- Prev -->
        <button onclick="event.stopPropagation();DentalMediaModule.lbPrev()"
          id="_dm_lb_prev"
          style="position:absolute;right:16px;top:50%;transform:translateY(-50%);
                 z-index:2;${_lbNavBtn()}">
          <i class="fas fa-chevron-right"></i>
        </button>

        <!-- Image / PDF container -->
        <div id="_dm_lb_content" style="position:relative;transform-origin:center center;
                                         transition:transform 0.15s ease;max-width:96%;max-height:100%">
        </div>

        <!-- Next -->
        <button onclick="event.stopPropagation();DentalMediaModule.lbNext()"
          id="_dm_lb_next"
          style="position:absolute;left:16px;top:50%;transform:translateY(-50%);
                 z-index:2;${_lbNavBtn()}">
          <i class="fas fa-chevron-left"></i>
        </button>
      </div>

      <!-- Filmstrip -->
      <div id="_dm_lb_strip"
           style="display:flex;gap:6px;padding:8px 16px;background:rgba(0,0,0,0.5);
                  overflow-x:auto;flex-shrink:0;border-top:1px solid rgba(255,255,255,0.06)">
      </div>`;

    document.body.appendChild(overlay);
    _lbRender();
    _bindLightboxDrag();
  }

  function _closeLightbox() {
    document.getElementById('_dm_lb')?.remove();
    document.removeEventListener('keydown', _handleLbKey);
  }

  function _lbRender() {
    const item = _lbItems[_lbIdx];
    if (!item) return;

    const isPDF = item.type === 'xray_report' || (item.url||'').includes('.pdf');
    const content = document.getElementById('_dm_lb_content');
    const title   = document.getElementById('_dm_lb_title');
    const meta    = document.getElementById('_dm_lb_meta');
    const dl      = document.getElementById('_dm_lb_dl');
    const prev    = document.getElementById('_dm_lb_prev');
    const next    = document.getElementById('_dm_lb_next');
    const strip   = document.getElementById('_dm_lb_strip');

    if (!content) return;

    const cat = CAT_MAP[item.type] || CAT_MAP['clinical'];
    if (title) title.innerHTML = `${cat.icon} ${_esc(item.title || cat.label)}`;
    if (meta)  meta.innerHTML  = [
      item.tooth ? `🦷 ${_esc(item.tooth)}` : '',
      item.date  ? `📅 ${_fmtDate(item.date.substring(0,10))}` : '',
      `${_lbIdx+1} / ${_lbItems.length}`
    ].filter(Boolean).join(' · ');

    if (dl) {
      dl.onclick = () => {
        const a = document.createElement('a');
        a.href = item.url; a.download = item.title || 'image';
        a.target = '_blank'; a.click();
      };
    }

    /* Load media */
    if (isPDF) {
      content.innerHTML = `
        <iframe src="${_esc(item.url)}" frameborder="0"
          style="width:80vw;height:75vh;border-radius:8px;background:#fff"></iframe>`;
    } else {
      content.innerHTML = `
        <img src="${_esc(item.url)}" alt="${_esc(item.title||'')}"
          style="max-width:88vw;max-height:76vh;border-radius:8px;
                 object-fit:contain;display:block;
                 box-shadow:0 8px 40px rgba(0,0,0,0.8)"
          draggable="false"
          onload="this.style.opacity='1'"
          style="opacity:0;transition:opacity 0.3s">`;
    }

    /* Reset zoom/pan */
    _lbZoom = 1; _lbPanX = 0; _lbPanY = 0;
    _applyLbTransform();

    /* Prev/Next visibility */
    if (prev) prev.style.visibility = _lbIdx > 0 ? 'visible' : 'hidden';
    if (next) next.style.visibility = _lbIdx < _lbItems.length - 1 ? 'visible' : 'hidden';

    /* Filmstrip */
    if (strip) {
      strip.innerHTML = _lbItems.map((it, i) => {
        const isAct = i === _lbIdx;
        return `<div onclick="DentalMediaModule._lbGoto(${i})"
          style="width:56px;height:42px;flex-shrink:0;border-radius:6px;overflow:hidden;cursor:pointer;
                 border:2px solid ${isAct?'var(--teal)':'rgba(255,255,255,0.12)'};
                 transition:border-color 0.2s;background:#111">
          ${it.url
            ? `<img src="${_esc(it.url)}" style="width:100%;height:100%;object-fit:cover" loading="lazy">`
            : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;
                            font-size:1rem">${CAT_MAP[it.type]?.icon||'🖼️'}</div>`
          }
        </div>`;
      }).join('');
      /* Scroll active into view */
      const actEl = strip.children[_lbIdx];
      if (actEl) actEl.scrollIntoView({ behavior:'smooth', block:'nearest', inline:'center' });
    }
  }

  global.DentalMediaModule._lbGoto = function(idx) { _lbIdx = idx; _lbRender(); };

  function _lbNav(dir) {
    const newIdx = _lbIdx + dir;
    if (newIdx < 0 || newIdx >= _lbItems.length) return;
    _lbIdx = newIdx;
    _lbRender();
  }

  function _lbSetZoom(z) {
    _lbZoom = Math.max(0.3, Math.min(8, z));
    _applyLbTransform();
    const label = document.getElementById('_dm_lb_zoom_label');
    if (label) label.textContent = Math.round(_lbZoom * 100) + '%';
  }

  function _applyLbTransform() {
    const el = document.getElementById('_dm_lb_content');
    if (!el) return;
    el.style.transform = `translate(${_lbPanX}px,${_lbPanY}px) scale(${_lbZoom})`;
  }

  function _bindLightboxDrag() {
    const stage = document.getElementById('_dm_lb_stage');
    if (!stage) return;

    stage.addEventListener('mousedown', e => {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'I') return;
      _lbDragging = true;
      _lbStartX = e.clientX - _lbPanX;
      _lbStartY = e.clientY - _lbPanY;
      stage.style.cursor = 'grabbing';
    });
    stage.addEventListener('mousemove', e => {
      if (!_lbDragging || _lbZoom <= 1) return;
      _lbPanX = e.clientX - _lbStartX;
      _lbPanY = e.clientY - _lbStartY;
      _applyLbTransform();
    });
    stage.addEventListener('mouseup', () => { _lbDragging = false; stage.style.cursor = 'grab'; });
    stage.addEventListener('mouseleave', () => { _lbDragging = false; stage.style.cursor = 'grab'; });

    /* Wheel zoom */
    stage.addEventListener('wheel', e => {
      e.preventDefault();
      _lbSetZoom(_lbZoom * (e.deltaY < 0 ? 1.15 : 0.87));
    }, { passive: false });
  }

  function _bindKeyboard() {
    document.removeEventListener('keydown', _handleLbKey);
    document.addEventListener('keydown', _handleLbKey);
  }

  function _handleLbKey(e) {
    const lb = document.getElementById('_dm_lb');
    if (!lb) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp')    _lbNav(-1);
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowDown')   _lbNav(1);
    if (e.key === 'Escape')    _closeLightbox();
    if (e.key === '+')         _lbSetZoom(_lbZoom * 1.2);
    if (e.key === '-')         _lbSetZoom(_lbZoom / 1.2);
    if (e.key === '0')         _lbSetZoom(1);
  }

  function _openLightbox(items, idx) {
    _lbItems = items;
    _lbIdx   = idx;
    _lbZoom  = 1;
    _lbPanX  = 0;
    _lbPanY  = 0;

    document.getElementById('_dm_lb')?.remove();

    const overlay = document.createElement('div');
    overlay.id = '_dm_lb';
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(2,7,6,0.97);z-index:500000;
      display:flex;flex-direction:column;font-family:'Tajawal',sans-serif;`;

    overlay.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;
                  padding:12px 20px;background:rgba(0,0,0,0.4);backdrop-filter:blur(8px);
                  border-bottom:1px solid rgba(255,255,255,0.07);flex-shrink:0">
        <div style="display:flex;align-items:center;gap:12px">
          <div id="_dm_lb_title" style="font-size:0.9rem;font-weight:700;color:#fff"></div>
          <div id="_dm_lb_meta" style="font-size:0.72rem;color:rgba(255,255,255,0.5)"></div>
        </div>
        <div style="display:flex;align-items:center;gap:7px">
          <button onclick="DentalMediaModule.lbZoomOut()" style="${_lbBtn()}">
            <i class="fas fa-search-minus"></i>
          </button>
          <span id="_dm_lb_zoom_label" style="font-size:0.72rem;color:rgba(255,255,255,0.6);min-width:38px;text-align:center">100%</span>
          <button onclick="DentalMediaModule.lbZoomIn()" style="${_lbBtn()}">
            <i class="fas fa-search-plus"></i>
          </button>
          <button onclick="DentalMediaModule.lbReset()" style="${_lbBtn()}">
            <i class="fas fa-compress-arrows-alt"></i>
          </button>
          <div style="width:1px;height:20px;background:rgba(255,255,255,0.15);margin:0 3px"></div>
          <button id="_dm_lb_dl" style="${_lbBtn()}"><i class="fas fa-download"></i></button>
          <button onclick="DentalMediaModule.closeLightbox()" style="${_lbBtn('rgba(239,68,68,0.2)','#ef4444')}">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
      <div id="_dm_lb_stage" style="flex:1;display:flex;align-items:center;justify-content:center;
                                     position:relative;overflow:hidden;cursor:grab;user-select:none">
        <button onclick="event.stopPropagation();DentalMediaModule.lbPrev()" id="_dm_lb_prev"
          style="position:absolute;right:14px;top:50%;transform:translateY(-50%);z-index:2;${_lbNavBtn()}">
          <i class="fas fa-chevron-right"></i>
        </button>
        <div id="_dm_lb_content" style="transition:transform 0.15s ease;transform-origin:center center;
                                         max-width:96%;max-height:100%"></div>
        <button onclick="event.stopPropagation();DentalMediaModule.lbNext()" id="_dm_lb_next"
          style="position:absolute;left:14px;top:50%;transform:translateY(-50%);z-index:2;${_lbNavBtn()}">
          <i class="fas fa-chevron-left"></i>
        </button>
      </div>
      <div id="_dm_lb_strip" style="display:flex;gap:6px;padding:8px 16px;
                                      background:rgba(0,0,0,0.5);overflow-x:auto;flex-shrink:0;
                                      border-top:1px solid rgba(255,255,255,0.06)"></div>`;

    document.body.appendChild(overlay);
    _lbRender();
    _bindLightboxDrag();
  }

  /* ────────────────────────────────────────────────────────────────────────────
   * UPLOAD MODAL
   * ──────────────────────────────────────────────────────────────────────────── */
  function _showUploadModal() {
    document.getElementById('_dm_upload_overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = '_dm_upload_overlay';
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(10px);
      z-index:400000;display:flex;align-items:center;justify-content:center;
      padding:20px;font-family:'Tajawal',sans-serif;`;

    overlay.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--border);border-radius:22px;
                padding:28px;width:100%;max-width:540px;max-height:92vh;overflow-y:auto;
                box-shadow:0 24px 60px rgba(0,0,0,0.65)">

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:22px">
        <div>
          <div style="font-size:1.1rem;font-weight:900;color:var(--text)">⬆️ رفع صورة / أشعة جديدة</div>
          <div style="font-size:0.75rem;color:var(--muted);margin-top:3px">
            يدعم: JPEG · PNG · WebP · PDF | الحجم الأقصى: 20 ميجابايت
          </div>
        </div>
        <button onclick="document.getElementById('_dm_upload_overlay').remove()"
          style="background:rgba(255,255,255,0.05);border:1px solid var(--border);
                 color:var(--muted);border-radius:9px;padding:7px 13px;cursor:pointer">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <!-- Drop Zone -->
      <div id="_dm_dropzone"
        onclick="document.getElementById('_dm_file_input').click()"
        ondragover="event.preventDefault();this.style.borderColor='var(--teal)';this.style.background='rgba(13,148,136,0.1)'"
        ondragleave="this.style.borderColor='rgba(14,165,233,0.3)';this.style.background='rgba(14,165,233,0.04)'"
        ondrop="event.preventDefault();DentalMediaModule._handleDrop(event)"
        style="border:2px dashed rgba(14,165,233,0.3);border-radius:14px;
               background:rgba(14,165,233,0.04);padding:36px 20px;text-align:center;
               cursor:pointer;transition:all 0.2s;margin-bottom:18px"
        onmouseover="this.style.borderColor='var(--teal)'"
        onmouseout="this.style.borderColor='rgba(14,165,233,0.3)'">
        <i class="fas fa-cloud-upload-alt" style="font-size:2.5rem;color:#0ea5e9;display:block;margin-bottom:10px"></i>
        <div style="font-weight:700;color:var(--text);font-size:0.95rem">
          اسحب وأفلت الصورة هنا، أو اضغط للاختيار
        </div>
        <div style="font-size:0.75rem;color:var(--muted);margin-top:6px">
          أشعة سينية، صور سريرية، تقارير PDF
        </div>
        <input type="file" id="_dm_file_input" accept="image/*,.pdf"
          multiple style="display:none"
          onchange="DentalMediaModule._handleFileSelect(this.files)">
      </div>

      <!-- Preview -->
      <div id="_dm_file_preview" style="margin-bottom:18px"></div>

      <!-- Metadata Form -->
      <div id="_dm_meta_form" style="display:none">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
          <div>
            <label style="${_lbl()}">نوع الصورة / الأشعة *</label>
            <select id="_dm_m_type" style="${_inp()}">
              ${CATS.slice(1).map(c=>`<option value="${c.key}">${c.icon} ${c.label}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="${_lbl()}">رقم السن (FDI)</label>
            <input type="text" id="_dm_m_tooth" placeholder="مثال: 16، 36"
              style="${_inp()} font-family:'IBM Plex Mono',monospace">
          </div>
        </div>
        <div style="margin-bottom:14px">
          <label style="${_lbl()}">العنوان / الوصف</label>
          <input type="text" id="_dm_m_title" placeholder="مثال: أشعة بانورامية — مرحلة ما قبل العلاج"
            style="${_inp()}">
        </div>
        <div style="margin-bottom:20px">
          <label style="${_lbl()}">ملاحظات</label>
          <textarea id="_dm_m_notes" rows="2" placeholder="ملاحظات إضافية..."
            style="${_inp()} resize:none"></textarea>
        </div>
      </div>

      <!-- Progress -->
      <div id="_dm_progress_wrap" style="display:none;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:0.78rem;color:var(--muted)">جاري الرفع...</span>
          <span id="_dm_progress_pct" style="font-size:0.78rem;font-weight:700;color:var(--teal)">0%</span>
        </div>
        <div style="background:rgba(255,255,255,0.07);border-radius:99px;height:8px;overflow:hidden">
          <div id="_dm_progress_bar" style="height:100%;border-radius:99px;width:0%;
                                              background:linear-gradient(90deg,var(--teal),#0ea5e9);
                                              transition:width 0.3s"></div>
        </div>
      </div>

      <!-- Actions -->
      <div id="_dm_upload_actions" style="display:none;flex-direction:column;gap:10px">
        <button id="_dm_upload_btn" onclick="DentalMediaModule._startUpload()"
          style="background:linear-gradient(135deg,#0ea5e9,#0284c7);border:none;color:#fff;
                 padding:13px;border-radius:12px;font-family:'Tajawal',sans-serif;
                 font-weight:800;font-size:0.95rem;cursor:pointer;
                 box-shadow:0 6px 16px rgba(14,165,233,0.3)">
          <i class="fas fa-cloud-upload-alt"></i> رفع الصورة
        </button>
        <button onclick="document.getElementById('_dm_upload_overlay').remove()"
          style="background:transparent;border:1px solid var(--border);color:var(--muted);
                 padding:11px;border-radius:12px;font-family:'Tajawal',sans-serif;cursor:pointer">
          إلغاء
        </button>
      </div>
    </div>`;

    document.body.appendChild(overlay);
    window._dm_pendingFiles = [];
  }

  global.DentalMediaModule._handleDrop = function (e) {
    const files = e.dataTransfer?.files;
    if (files) global.DentalMediaModule._handleFileSelect(files);
  };

  global.DentalMediaModule._handleFileSelect = function (files) {
    window._dm_pendingFiles = Array.from(files).filter(f =>
      f.type.startsWith('image/') || f.type === 'application/pdf'
    );

    if (!window._dm_pendingFiles.length) {
      if (typeof toast === 'function') toast('⚠️ يرجى اختيار صورة أو ملف PDF', 'err');
      return;
    }

    /* Show previews */
    const previewEl = document.getElementById('_dm_file_preview');
    const metaEl    = document.getElementById('_dm_meta_form');
    const actEl     = document.getElementById('_dm_upload_actions');
    const dz        = document.getElementById('_dm_dropzone');

    if (dz) dz.style.display = 'none';

    if (previewEl) {
      previewEl.innerHTML = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px">
          ${window._dm_pendingFiles.map(f => {
            const isPDF = f.type === 'application/pdf';
            const objUrl = isPDF ? null : URL.createObjectURL(f);
            return `
              <div style="background:rgba(255,255,255,0.04);border:1px solid var(--border);
                          border-radius:10px;overflow:hidden;width:90px;text-align:center;
                          padding:8px;flex-shrink:0">
                ${isPDF
                  ? `<i class="fas fa-file-pdf" style="font-size:2rem;color:#ef4444"></i>`
                  : `<img src="${objUrl}" style="width:72px;height:56px;object-fit:cover;border-radius:6px">`
                }
                <div style="font-size:0.62rem;color:var(--muted);margin-top:4px;
                             overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                  ${_esc(f.name)}
                </div>
              </div>`;
          }).join('')}
        </div>
        <div style="font-size:0.75rem;color:var(--teal);font-weight:700;margin-bottom:14px">
          ✅ ${window._dm_pendingFiles.length} ملف جاهز للرفع
        </div>`;
    }

    if (metaEl) metaEl.style.display = 'block';
    if (actEl)  actEl.style.display  = 'flex';
  };

  global.DentalMediaModule._startUpload = async function () {
    const files = window._dm_pendingFiles || [];
    if (!files.length) return;

    if (!_db || !_storage || !_pid) {
      if (typeof toast === 'function') toast('❌ خطأ في الاتصال بقاعدة البيانات', 'err');
      return;
    }

    const mediaType = document.getElementById('_dm_m_type')?.value  || 'clinical';
    const toothFDI  = document.getElementById('_dm_m_tooth')?.value.trim() || null;
    const title     = document.getElementById('_dm_m_title')?.value.trim() || null;
    const notes     = document.getElementById('_dm_m_notes')?.value.trim() || null;

    const btn      = document.getElementById('_dm_upload_btn');
    const progress = document.getElementById('_dm_progress_wrap');
    const bar      = document.getElementById('_dm_progress_bar');
    const pct      = document.getElementById('_dm_progress_pct');

    if (btn)      { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> جارِ الرفع...'; }
    if (progress) progress.style.display = 'block';

    const session = typeof ArgonSession !== 'undefined' ? ArgonSession.get() : {};
    let done = 0;

    for (const file of files) {
      try {
        /* Compress image if large */
        let uploadFile = file;
        if (file.type.startsWith('image/') && file.size > 1024 * 1024) {
          uploadFile = await _compressImage(file, 1600, 0.82);
        }

        /* Build Storage path */
        const ext       = file.name.split('.').pop().toLowerCase();
        const timestamp = Date.now();
        const fileName  = `${timestamp}_${Math.random().toString(36).substr(2,6)}.${ext}`;
        const storagePath = `clinics/${_cid}/patients/${_pid}/media/${fileName}`;

        /* Upload to Firebase Storage */
        const uploadTask = _storage.ref(storagePath).put(uploadFile);

        await new Promise((resolve, reject) => {
          uploadTask.on('state_changed',
            snapshot => {
              const p = Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100);
              const totalPct = Math.round((done / files.length + p / 100 / files.length) * 100);
              if (bar) bar.style.width = totalPct + '%';
              if (pct) pct.textContent = totalPct + '%';
            },
            reject,
            async () => {
              const url = await uploadTask.snapshot.ref.getDownloadURL();

              /* Generate thumbnail for images */
              let thumbnail = null;
              if (file.type.startsWith('image/')) {
                thumbnail = await _makeThumbnail(file, 240);
              }

              /* Save metadata to RTDB */
              const mediaId  = _db.ref().push().key;
              const mediaObj = {
                mediaId, title, notes, mediaType, toothFDI,
                url, thumbnail, storagePath,
                fileFormat: ext, fileSize: file.size, originalName: file.name,
                uploadedAt: new Date().toISOString(),
                uploadedBy: session.staffId || 'doctor',
                _archived: false
              };

              await _db.ref(`${_base}/patients/${_pid}/dental_media/${mediaId}`).set(mediaObj);
              _logAudit('MEDIA_UPLOAD', `رفع ${mediaType}: ${title || file.name}`);
              done++;
              resolve();
            }
          );
        });

      } catch(err) {
        console.error('[DentalMedia] Upload error:', err);
        if (typeof toast === 'function') toast('❌ فشل رفع ' + file.name, 'err');
      }
    }

    if (bar) bar.style.width = '100%';
    if (pct) pct.textContent = '100%';

    setTimeout(() => {
      document.getElementById('_dm_upload_overlay')?.remove();
      if (typeof toast === 'function') toast(`✅ تم رفع ${done} ملف بنجاح`, 'ok');
    }, 500);
  };

  /* ────────────────────────────────────────────────────────────────────────────
   * BEFORE / AFTER COMPARISON
   * ──────────────────────────────────────────────────────────────────────────── */
  function _showBeforeAfter(aId, bId) {
    const a = _media[aId];
    const b = _media[bId];
    if (!a || !b) return;

    document.getElementById('_dm_ba_overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = '_dm_ba_overlay';
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:500000;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      font-family:'Tajawal',sans-serif;padding:20px`;

    overlay.innerHTML = `
      <div style="text-align:center;margin-bottom:16px;color:#fff">
        <div style="font-size:1.1rem;font-weight:800">⟺ مقارنة قبل وبعد</div>
        <div style="font-size:0.75rem;color:rgba(255,255,255,0.5);margin-top:4px">
          اسحب المؤشر للمقارنة
        </div>
      </div>

      <div id="_dm_ba_wrapper" style="position:relative;width:min(80vw,700px);height:min(70vh,520px);
                                        border-radius:14px;overflow:hidden;cursor:ew-resize;
                                        box-shadow:0 8px 40px rgba(0,0,0,0.8)">

        <!-- After (full width, behind) -->
        <img src="${_esc(b.url)}" alt="بعد"
          style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">

        <!-- Before (clipped by slider) -->
        <div id="_dm_ba_clip" style="position:absolute;inset:0;width:50%;overflow:hidden">
          <img src="${_esc(a.url)}" alt="قبل"
            style="width:min(80vw,700px);height:min(70vh,520px);object-fit:cover">
        </div>

        <!-- Divider line -->
        <div id="_dm_ba_line" style="position:absolute;top:0;bottom:0;left:50%;
                                       width:3px;background:#fff;
                                       box-shadow:0 0 8px rgba(255,255,255,0.6);
                                       transform:translateX(-50%)">
          <!-- Handle -->
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
                      width:40px;height:40px;border-radius:50%;background:#fff;
                      display:flex;align-items:center;justify-content:center;
                      box-shadow:0 4px 16px rgba(0,0,0,0.4);cursor:ew-resize">
            <i class="fas fa-arrows-alt-h" style="color:#0ea5e9;font-size:1rem"></i>
          </div>
        </div>

        <!-- Labels -->
        <div style="position:absolute;top:12px;right:12px;background:rgba(0,0,0,0.6);
                    backdrop-filter:blur(4px);border-radius:6px;padding:4px 10px;
                    font-size:0.72rem;font-weight:700;color:#fff">قبل</div>
        <div style="position:absolute;top:12px;left:12px;background:rgba(0,0,0,0.6);
                    backdrop-filter:blur(4px);border-radius:6px;padding:4px 10px;
                    font-size:0.72rem;font-weight:700;color:#fff">بعد</div>
      </div>

      <button onclick="document.getElementById('_dm_ba_overlay').remove()"
        style="margin-top:20px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);
               color:#fff;padding:10px 28px;border-radius:10px;cursor:pointer;
               font-family:'Tajawal',sans-serif;font-size:0.9rem">
        إغلاق
      </button>`;

    document.body.appendChild(overlay);
    _bindBASlider();
  }

  function _bindBASlider() {
    const wrapper = document.getElementById('_dm_ba_wrapper');
    const clip    = document.getElementById('_dm_ba_clip');
    const line    = document.getElementById('_dm_ba_line');
    if (!wrapper || !clip || !line) return;

    let dragging = false;

    const setPos = (clientX) => {
      const rect = wrapper.getBoundingClientRect();
      let pct = ((clientX - rect.left) / rect.width) * 100;
      pct = Math.max(2, Math.min(98, pct));
      clip.style.width = pct + '%';
      line.style.left  = pct + '%';
    };

    wrapper.addEventListener('mousedown',  () => { dragging = true; });
    document.addEventListener('mousemove', e => { if (dragging) setPos(e.clientX); });
    document.addEventListener('mouseup',   () => { dragging = false; });
    wrapper.addEventListener('touchstart', e => { dragging = true; setPos(e.touches[0].clientX); });
    document.addEventListener('touchmove', e => { if (dragging) setPos(e.touches[0].clientX); });
    document.addEventListener('touchend',  () => { dragging = false; });
  }

  /* ────────────────────────────────────────────────────────────────────────────
   * DELETE
   * ──────────────────────────────────────────────────────────────────────────── */
  async function _deleteMedia(mediaId) {
    if (!confirm('⚠️ حذف هذه الصورة نهائياً؟ لا يمكن التراجع عن هذه العملية.')) return;
    if (!_db || !_pid) return;

    const m = _media[mediaId];
    if (!m) return;

    try {
      /* Soft-delete in RTDB */
      await _db.ref(`${_base}/patients/${_pid}/dental_media/${mediaId}/_archived`).set(true);
      await _db.ref(`${_base}/patients/${_pid}/dental_media/${mediaId}/_archivedAt`).set(new Date().toISOString());

      /* Hard-delete from Storage if path available */
      if (m.storagePath && _storage) {
        try { await _storage.ref(m.storagePath).delete(); } catch(_) {}
      }

      _logAudit('MEDIA_DELETE', `حذف ${m.mediaType}: ${m.title || m.originalName}`);
      if (typeof toast === 'function') toast('✅ تم حذف الصورة', 'ok');
    } catch(e) {
      if (typeof toast === 'function') toast('❌ فشل الحذف: ' + e.message, 'err');
    }
  }

  /* ────────────────────────────────────────────────────────────────────────────
   * IMAGE UTILITIES
   * ──────────────────────────────────────────────────────────────────────────── */
  function _compressImage(file, maxPx, quality) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          if (width > maxPx || height > maxPx) {
            if (width > height) { height = height * maxPx / width; width = maxPx; }
            else { width = width * maxPx / height; height = maxPx; }
          }
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', quality);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function _makeThumbnail(file, size) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext('2d');
          /* Center-crop */
          const min  = Math.min(img.width, img.height);
          const sx   = (img.width  - min) / 2;
          const sy   = (img.height - min) / 2;
          ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
          resolve(canvas.toDataURL('image/jpeg', 0.65));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ────────────────────────────────────────────────────────────────────────────
   * HELPERS
   * ──────────────────────────────────────────────────────────────────────────── */
  function _logAudit(action, details) {
    if (typeof logAudit === 'function') logAudit(action, details, 'DENTAL_MEDIA');
  }

  function _fmtDate(d) {
    try {
      return new Date(d).toLocaleDateString('ar-JO', { year:'numeric', month:'long', day:'numeric' });
    } catch(_) { return d; }
  }

  function _esc(s) {
    return String(s || '').replace(/[<>"'&]/g, c =>
      ({ '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":"&#39;", '&':'&amp;' }[c])
    ).substring(0, 400);
  }

  function _lbl() { return `font-size:0.75rem;color:var(--muted);display:block;margin-bottom:7px;font-weight:700`; }

  function _inp() {
    return `width:100%;background:var(--surf);border:1px solid var(--border);border-radius:10px;
            padding:10px 14px;color:var(--text);font-family:'Tajawal',sans-serif;
            font-size:0.88rem;outline:none;box-sizing:border-box`;
  }

  function _lbBtn(bg='rgba(255,255,255,0.08)', color='rgba(255,255,255,0.8)') {
    return `background:${bg};border:none;color:${color};border-radius:7px;
            padding:7px 11px;cursor:pointer;font-size:0.82rem;transition:background 0.15s`;
  }

  function _lbNavBtn() {
    return `background:rgba(0,0,0,0.5);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,0.12);
            color:#fff;border-radius:50%;width:44px;height:44px;cursor:pointer;font-size:1rem;
            display:flex;align-items:center;justify-content:center;transition:background 0.15s`;
  }

}(window));
