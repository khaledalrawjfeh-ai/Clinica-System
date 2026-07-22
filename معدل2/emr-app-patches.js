/**
 * ARGON MEDICAL OS — EMR App Patches v2.0
 * التعديلات المطلوبة على emr-app.js
 *
 * الهدف: استبدال تحميل 50,000 مريض دفعة واحدة
 *        بنظام التحميل المتدرج (Pagination) + بحث server-side
 *
 * ─────────────────────────────────────────────────────────────
 * ⚠️ SAFETY RULES — اقرأ قبل أي تعديل
 * ─────────────────────────────────────────────────────────────
 * 1. _patients يبقى كـ reference متوافق مع كل الكود الأصلي
 * 2. _pager.cache مربوط بـ _patients — لا تكرار في الذاكرة
 * 3. كل الدوال الأصلية (viewPatientFile, openPatientFromBooking...) تعمل بدون تغيير
 * 4. عند البحث: أولاً محلي، ثم server-side إذا < 5 نتائج
 * 5. الـ listeners (bookings, lab, rad, pharmacy) تبقى كما هي
 * ─────────────────────────────────────────────────────────────
 */


/* ══════════════════════════════════════════════════════════════
 * STEP 0 — متغيرات عالمية جديدة
 * أضفها بعد: let rxItems = [];
 * ══════════════════════════════════════════════════════════════ */
let _pager = null;               /* مثيل ArgonPatientPager */
let _searchDebounceTimer = null; /* لمنع الطلبات المتكررة عند الكتابة */


/* ══════════════════════════════════════════════════════════════
 * STEP 1 — استبدل initEMR() كاملة
 * ══════════════════════════════════════════════════════════════ */
function initEMR() {
  toast('مرحباً بك في نظام السجلات الطبية', 'ok');

  /* ══ تهيئة محرك التحميل المتدرج ══ */
  _pager = new ArgonPatientPager(db, BASE, {
    pageSize:    30,
    searchLimit: 25
  });

  /* ── ربط الكاشات: _patients ← _pager.cache ── */
  /* بدلاً من كائن جديد، نُعيّن نفس المرجع حتى لا يكون هناك نسختان */
  _pager.onPageLoaded = (patientsMap, isFirst) => {
    /* دمج الصفحة الجديدة في _patients */
    Object.entries(patientsMap).forEach(([uid, p]) => {
      _patients[uid] = p;
    });
    filterPatients();
    /* Auto-open من URL param إذا كان الـ Pager جلب المريض المطلوب الآن */
    const urlParams = new URLSearchParams(window.location.search);
    const urlPid = urlParams.get('pid');
    if (urlPid && _patients[urlPid] && !activePatientId && !window._pendingUrlBk) {
      viewPatientFile(urlPid);
      window.history.replaceState({}, document.title, window.location.pathname + '?id=' + CID);
    }
  };

  /* تحديث فوري عند تغيّر أي مريض محمّل */
  _pager.onPatientUpdated = (uid, newData) => {
    if (newData) {
      _patients[uid] = newData;
    } else {
      delete _patients[uid];
    }
    filterPatients();
    /* تحديث ملف المريض المفتوح حالياً */
    if (activePatientId === uid) {
      if (newData) {
        refreshPatientFileUI(uid);
      } else {
        sw('waitingRoom');
        toast('⚠️ تم حذف ملف المريض المفتوح', 'err');
      }
    }
  };

  /* إظهار/إخفاء مؤشر التحميل */
  _pager.onLoadingChange = (isLoading) => {
    const spinner = document.getElementById('patLoadingSpinner');
    if (spinner) spinner.style.display = isLoading ? 'flex' : 'none';
  };

  /* معالجة الأخطاء */
  _pager.onError = (err) => {
    console.error('[ArgonPager] Error:', err);
    const grid = document.getElementById('patGrid');
    if (grid && !Object.keys(_patients).length) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)">
          <i class="fas fa-exclamation-triangle" style="font-size:2rem;margin-bottom:10px;opacity:.3;display:block"></i>
          <p>تعذّر تحميل قائمة المرضى</p>
          <button onclick="window._pager?.init()"
            style="margin-top:12px;padding:8px 18px;background:var(--teal);color:#fff;border:none;
                   border-radius:8px;font-family:'Tajawal',sans-serif;font-weight:700;cursor:pointer">
            🔄 إعادة المحاولة
          </button>
        </div>`;
    }
  };

  /* بدء التحميل الأول */
  _pager.init();

  /* تشغيل المهاجرة الصامتة للبيانات القديمة */
  setTimeout(() => {
    if (typeof migratePhoneKeyedPatients === 'function') {
      migratePhoneKeyedPatients();
    }
  }, 5000);

  /* ══ باقي initEMR — الـ listeners الأخرى تبقى كما هي ══ */

  /* ── الحجوزات / غرفة الانتظار ── */
  let bookingLoadTimer = null;
  let isInitWr = true;
  db.ref(BASE + '/bookings').once('value', () => {
    setTimeout(() => { isInitWr = false; }, 2000);
  });

  function playWrAlert() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, ctx.currentTime);
      osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
    } catch(e) { console.log('Audio fallback'); }
  }

  db.ref(BASE + '/bookings').on('child_added', snap => {
    const b = snap.val();
    _liveBookings[snap.key] = b;
    renderWaitingRoom();
    if (!isInitWr && b.status === 'waiting') {
      const session = ArgonSession.get() || {};
      const assignedDoc = b.doctorId || b.docKey;
      if (session.role === 'admin' || assignedDoc === session.staffId) playWrAlert();
    }
    clearTimeout(bookingLoadTimer);
    bookingLoadTimer = setTimeout(() => {
      filterPatients();
      if (window._pendingUrlBk && _liveBookings[window._pendingUrlBk] && Object.keys(_patients).length > 0) {
        openPatientFromBooking(window._pendingUrlBk);
        window.history.replaceState({}, document.title, window.location.pathname + '?id=' + CID);
        window._pendingUrlBk = null;
      }
    }, 300);
  });

  db.ref(BASE + '/bookings').on('child_changed', snap => {
    const oldB = _liveBookings[snap.key] || {};
    const newB = snap.val();
    _liveBookings[snap.key] = newB;
    renderWaitingRoom();
    if (!isInitWr && newB.status === 'waiting' && oldB.status !== 'waiting') {
      const session = ArgonSession.get() || {};
      const assignedDoc = newB.doctorId || newB.docKey;
      if (session.role === 'admin' || assignedDoc === session.staffId) playWrAlert();
    }
  });

  db.ref(BASE + '/bookings').on('child_removed', snap => {
    delete _liveBookings[snap.key];
    renderWaitingRoom();
  });

  /* ── الإشعارات ── */
  const sessionData = window.ArgonSession ? window.ArgonSession.get() : null;
  const sessionUid  = sessionData ? sessionData.staffId : null;
  let isInitNotify  = true;

  if (sessionUid) {
    db.ref(BASE + '/notifications')
      .orderByKey()
      .limitToLast(200)
      .on('child_added', snap => {
        const n = snap.val();
        n.key = snap.key;
        if (n && n.role === 'doctor' && n.docKey === sessionUid) {
          if (new Date(n.createdAt).getTime() > _notifsClearedAt) {
            if (!_myNotifications.find(x => x.key === n.key)) {
              _myNotifications.unshift(n);
              _myNotifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
              if (typeof renderDoctorNotifications === 'function') renderDoctorNotifications();
              if (!isInitNotify) toast('🔔 إشعار جديد: ' + (n.title || 'رسالة جديدة'), 'ok');
            }
          }
        }
      });
  }
  setTimeout(() => { isInitNotify = false; }, 3000);

  /* ── التحويلات الداخلية ── */
  if (_sets && _sets.mode === 'medical_complex') {
    const btn = document.getElementById('referralsMenuBtn');
    if (btn) btn.style.display = 'flex';
  }

  let _refTimer = null;
  const debounceRef = () => {
    clearTimeout(_refTimer);
    _refTimer = setTimeout(() => {
      if (typeof renderReferralsList === 'function') renderReferralsList();
    }, 80);
  };
  db.ref(BASE + '/referrals').on('child_added',   snap => { _referrals[snap.key] = snap.val(); debounceRef(); });
  db.ref(BASE + '/referrals').on('child_changed', snap => { _referrals[snap.key] = snap.val(); debounceRef(); });
  db.ref(BASE + '/referrals').on('child_removed', snap => { delete _referrals[snap.key]; debounceRef(); });

  /* ── مخزون الصيدلية ── */
  let _invTimer = null;
  const debounceInv = () => { clearTimeout(_invTimer); _invTimer = setTimeout(() => {}, 80); };
  db.ref(BASE + '/pharmacy_inventory').on('child_added',   snap => { _pharmacyInventory[snap.key] = snap.val(); debounceInv(); });
  db.ref(BASE + '/pharmacy_inventory').on('child_changed', snap => { _pharmacyInventory[snap.key] = snap.val(); debounceInv(); });
  db.ref(BASE + '/pharmacy_inventory').on('child_removed', snap => { delete _pharmacyInventory[snap.key]; debounceInv(); });

  /* ── كتالوج الأسعار ── */
  db.ref(BASE + '/pricing_catalog').on('value', snap => {
    _pricingCatalogCache = snap.val() || {};
    if (typeof renderDynamicCatalogTags === 'function') renderDynamicCatalogTags();
  });

  /* ── طلبات المختبر والأشعة ── */
  db.ref(BASE + '/lab_orders').on('value', snap => {
    _labOrders = snap.val() || {};
    if (activePatientId && _patients[activePatientId]) refreshPatientFileUI(activePatientId);
  });

  db.ref(BASE + '/radiology_orders').on('value', snap => {
    _radOrders = snap.val() || {};
    if (activePatientId && _patients[activePatientId]) refreshPatientFileUI(activePatientId);
  });

  /* ── الأطباء والأقسام ── */
  db.ref(BASE + '/doctors').on('value', snap => { _doctors = snap.val() || {}; });
  db.ref(BASE + '/departments').on('value', snap => {
    _depts = snap.val() || {};
    if (activePatientId && _patients[activePatientId]) refreshPatientFileUI(activePatientId);
  });

  /* ── معالجة URL Params ── */
  const urlParams = new URLSearchParams(window.location.search);
  const urlPid    = urlParams.get('pid');
  window._pendingUrlBk = urlParams.get('bk');
  window._pendingUrlBkExpectedName = decodeURIComponent(urlParams.get('expectedName') || '');

  if (urlPid && !window._pendingUrlBk) {
    /* المريض قد يكون في الكاش بعد init() أو سنجلبه بشكل صريح */
    _pager.getPatient(urlPid).then(p => {
      if (p) {
        _patients[urlPid] = p;
        if (!activePatientId) {
          viewPatientFile(urlPid);
          window.history.replaceState({}, document.title, window.location.pathname + '?id=' + CID);
        }
      }
    });
  }

  /* clearAllNotifications + toggleNotifications + openNotification
   * تبقى كما هي — لا تغيير */
  window.clearAllNotifications = function () {
    if (!confirm('هل أنت متأكد من مسح جميع الإشعارات؟')) return;
    _notifsClearedAt = Date.now();
    localStorage.setItem('argon_notifs_cleared', _notifsClearedAt.toString());
    _myNotifications = [];
    if (typeof renderDoctorNotifications === 'function') renderDoctorNotifications();
    toast('✅ تم مسح الإشعارات بنجاح', 'ok');
    const badge = document.getElementById('notifBadge');
    if (badge) badge.style.display = 'none';
  };
}


/* ══════════════════════════════════════════════════════════════
 * STEP 2 — استبدل filterPatients() كاملة
 * ══════════════════════════════════════════════════════════════ */
function filterPatients() {
  const rawQuery = (document.getElementById('patSearch')?.value || '').trim();

  /* إعادة ضبط page limit عند تغيير البحث */
  if (rawQuery !== lastQuery) {
    patPageLimit = 15;
    lastQuery    = rawQuery;
  }

  const session     = ArgonSession.get() || {};
  const loggedInDoc = session.staffId;
  const isAdmin     = session.role === 'admin';
  const isComplex   = _sets && (_sets.mode === 'medical_complex' || _sets.type === 'complex');

  /* عزل المجمع الطبي: اعرض فقط مرضى هذا الطبيب */
  let allowedPatients = null;
  if (isComplex && loggedInDoc && !isAdmin) {
    allowedPatients = new Set();
    Object.values(_liveBookings).forEach(b => {
      const assignedDoc = b.doctorId || b.docKey;
      if (assignedDoc === loggedInDoc) {
        if (b.patientId) allowedPatients.add(b.patientId);
        if (b.patPhone)  allowedPatients.add(b.patPhone);
      }
    });
  }

  /* تصفية الكاش المحلي */
  const q = rawQuery.toLowerCase();
  const entries = Object.entries(_patients).filter(([uid, p]) => {
    const info = p.info || {};

    /* فلتر عزل الطبيب */
    if (allowedPatients !== null) {
      const hasBooking   = allowedPatients.has(uid) || allowedPatients.has(info.phone);
      const createdByMe  = info.createdBy === loggedInDoc;
      const hasPastVisit = Object.values(p.visits || {})
        .some(v => (v.doctorId || v.docKey) === loggedInDoc);
      if (!hasBooking && !createdByMe && !hasPastVisit) return false;
    }

    if (!q) return true;

    return (info.phone      || '').includes(q)
        || (info.name       || '').toLowerCase().includes(q)
        || (info.mrn        || '').toLowerCase().includes(q)
        || (info.nationalId || '').toLowerCase().includes(q)
        || uid.includes(q);
  });

  renderPatientsList(entries);

  /* إذا كان البحث لم يُعطِ نتائج كافية → ابحث server-side بعد 300ms */
  if (rawQuery.length >= 2 && entries.length < 5 && _pager) {
    clearTimeout(_searchDebounceTimer);
    _searchDebounceTimer = setTimeout(() => {
      _pager.search(rawQuery).then(count => {
        if (count > 0) {
          /* onPageLoaded سيُستدعى من الـ Pager → filterPatients مرة ثانية تلقائياً */
        }
      });
    }, 300);
  }

  /* إذا أُفرغ البحث وكان الـ pager في وضع البحث → أعد تعيينه */
  if (!rawQuery && _pager?.isSearchMode) {
    _pager.resetToFirstPage();
  }
}


/* ══════════════════════════════════════════════════════════════
 * STEP 3 — استبدل renderPatientsList() كاملة
 * ══════════════════════════════════════════════════════════════ */
function renderPatientsList(entries) {
  const grid = document.getElementById('patGrid');
  if (!grid) return;

  /* قائمة فارغة */
  if (!entries.length) {
    if (_pager?.isLoading) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--muted)">
          <i class="fas fa-spinner fa-spin" style="font-size:2rem;display:block;margin-bottom:12px"></i>
          جاري تحميل المرضى...
        </div>`;
    } else {
      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)">
          <i class="fas fa-users-slash" style="font-size:2.5rem;margin-bottom:10px;opacity:.3;display:block"></i>
          <p>لا يوجد مرضى مسجلين بعد</p>
        </div>`;
    }
    return;
  }

  /* عرض الصفحة الحالية */
  const sliced = entries.slice(0, patPageLimit);

  let html = sliced.map(([uid, p]) => {
    const info       = p.info || {};
    const genderIcon = info.gender === 'ذكر' ? '👨' : info.gender === 'أنثى' ? '👩' : '👤';
    const ageStr     = info.age ? `${info.age} سنة` : '';
    const genderStr  = info.gender || '';
    const ageGender  = [ageStr, genderStr].filter(Boolean).join(' · ');

    /* NID Status Badge */
    const nidValid = typeof ArgonNID !== 'undefined' && ArgonNID.isValidNID(info.nationalId || '');
    const _nidStatus = nidValid
      ? `<span style="font-size:10px;color:var(--teal,#0d9488);font-family:monospace;background:rgba(13,148,136,.08);padding:1px 7px;border-radius:5px;border:1px solid rgba(13,148,136,.2)">
           🪪 ${ArgonNID.cleanNID(info.nationalId)}
         </span>`
      : `<span style="font-size:10px;color:rgba(239,68,68,0.7);background:rgba(239,68,68,.06);padding:1px 7px;border-radius:5px;border:1px solid rgba(239,68,68,.15)">
           🪪 لا يوجد رقم وطني
         </span>`;

    /* تكرار محتمل */
    const dupCount = Object.values(_patients).filter(pp =>
      pp.info && pp.info.name === info.name && pp.info.phone === info.phone
    ).length;
    const dupBadge = dupCount > 1
      ? `<span style="background:rgba(245,158,11,0.12);color:var(--amber);border-radius:6px;padding:2px 7px;font-size:10px;font-weight:700;margin-right:5px">⚠️ تعارض</span>`
      : '';

    const avatarHTML = info.photo
      ? `<div class="plist-avatar"><img src="${info.photo}"></div>`
      : `<div class="plist-avatar" style="font-size:1.5rem">${genderIcon}</div>`;

    const safeName = typeof sanitize === 'function' ? sanitize(info.name) : (info.name || '');
    const safePhone = typeof sanitize === 'function' ? sanitize(info.phone || '') : (info.phone || '');

    return `<div class="plist-card" onclick="viewPatientFile('${uid}')">
      ${avatarHTML}
      <div class="plist-info">
        <div class="plist-name">${safeName} ${dupBadge}</div>
        <div class="plist-meta">${safePhone}${ageGender ? ` · ${ageGender}` : ''}</div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <div class="plist-mrn">${info.mrn || 'MRN-NEW'}</div>
          ${_nidStatus}
        </div>
      </div>
    </div>`;
  }).join('');

  /* زر "عرض المزيد" من الكاش المحلي */
  if (entries.length > patPageLimit) {
    html += `
      <div id="patLoadMoreContainer" style="grid-column:1/-1;text-align:center;padding:12px 0">
        <button class="btn-secondary" onclick="loadMorePatients()"
          style="width:100%;justify-content:center;padding:12px;border-radius:8px">
          <i class="fas fa-chevron-down"></i>
          عرض المزيد (${entries.length - patPageLimit} مريض في الكاش)
        </button>
      </div>`;
  }

  /* زر "تحميل المزيد من السيرفر" */
  if (_pager?.hasMore && !_pager?.isSearchMode) {
    html += `
      <div id="patServerLoadMore" style="grid-column:1/-1;text-align:center;padding:12px 0">
        <button class="btn-secondary" onclick="loadMorePatientsFromServer()"
          style="width:100%;justify-content:center;padding:12px;border-radius:8px;
                 border-style:dashed;color:var(--muted);font-family:'Tajawal',sans-serif">
          <i class="fas fa-cloud-download-alt"></i>
          تحميل المزيد من السيرفر
          <span style="font-size:0.7rem;opacity:0.6;margin-right:6px">
            (${_pager.totalCached} محمّل حالياً)
          </span>
        </button>
      </div>`;
  }

  /* مؤشر التحميل */
  html += `
    <div id="patLoadingSpinner"
      style="grid-column:1/-1;text-align:center;padding:20px;
             display:${_pager?.isLoading ? 'flex' : 'none'};
             align-items:center;justify-content:center;gap:10px;color:var(--muted)">
      <i class="fas fa-circle-notch fa-spin"></i> جاري التحميل...
    </div>`;

  grid.innerHTML = html;
}


/* ══════════════════════════════════════════════════════════════
 * STEP 4 — استبدل loadMorePatients() + أضف loadMorePatientsFromServer()
 * ══════════════════════════════════════════════════════════════ */

/* عرض المزيد من الكاش المحلي */
function loadMorePatients() {
  patPageLimit += 15;
  filterPatients();
}

/* جلب المزيد من السيرفر عبر Pagination */
async function loadMorePatientsFromServer() {
  if (!_pager) return;

  /* تعطيل الزر أثناء التحميل */
  const btn = document.querySelector('#patServerLoadMore button');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> يُحمَّل...';
  }

  try {
    await _pager.loadNextPage();
    /* onPageLoaded سيُستدعى → filterPatients تلقائياً */
  } catch(e) {
    toast('❌ تعذّر تحميل المزيد: ' + e.message, 'err');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-cloud-download-alt"></i> إعادة المحاولة';
    }
  }
}

/* helper داخلي */
function _renderLoadMoreButton() {
  filterPatients();
}


/* ══════════════════════════════════════════════════════════════
 * STEP 5 — دالة getPatientSafe (جلب مريض واحد بأمان)
 * أضفها كدالة مستقلة جديدة في emr-app.js
 * ══════════════════════════════════════════════════════════════ */
async function getPatientSafe(uid) {
  if (!uid) return null;

  /* 1. من الكاش المحلي */
  if (_patients[uid]) return _patients[uid];

  /* 2. من Pager cache */
  if (_pager?.cache[uid]) {
    _patients[uid] = _pager.cache[uid];
    return _patients[uid];
  }

  /* 3. من Firebase مباشرة */
  try {
    const p = await _pager?.getPatient(uid);
    if (p) {
      _patients[uid] = p;
      return p;
    }
  } catch(e) {
    console.warn('[getPatientSafe] Firebase fetch failed:', e);
  }

  /* 4. Fallback: طلب Firebase مباشر */
  try {
    const snap = await db.ref(`${BASE}/patients/${uid}`).once('value');
    if (snap.exists()) {
      const p = snap.val();
      _patients[uid] = p;
      return p;
    }
  } catch(e) {
    console.warn('[getPatientSafe] Direct Firebase fetch failed:', e);
  }

  return null;
}


/* ══════════════════════════════════════════════════════════════
 * STEP 6 — تعديل safeViewPatientFile
 *
 * في بداية دالة safeViewPatientFile() الأصلية، بعد:
 *   async function safeViewPatientFile(phoneOrUid) {
 *
 * أضف هذا الكود مباشرة:
 * ══════════════════════════════════════════════════════════════
 *
 *   // ── Lazy Load: جلب المريض من السيرفر إذا لم يكن في الكاش ──
 *   if (!_patients[phoneOrUid] && _pager) {
 *     const loaded = await _pager.getPatient(phoneOrUid);
 *     if (loaded) _patients[phoneOrUid] = loaded;
 *   }
 *
 * ══════════════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════════════
 * STEP 7 — تعديل _executeSaveNewPatient
 *
 * في دالة _executeSaveNewPatient()، داخل:
 *   newRef.set(patObj).then(() => {
 *
 * أضف هذا السطر مباشرة بعد السطر الأول داخل then:
 *
 *   if (_pager) _pager.cache[newUid] = { id: newUid, ...patObj };
 *
 * ══════════════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════════════
 * STEP 8 — تنظيف عند تسجيل الخروج
 *
 * في دالة ArgonSession.logout() أو قبلها مباشرة، أضف:
 *
 *   if (window._pager) {
 *     window._pager.destroy();
 *     window._pager = null;
 *   }
 *
 * ══════════════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════════════
 * STEP 9 — إضافة spinner في HTML (emr.html)
 *
 * داخل div#patGrid (بدايته) أضف:
 *   <!-- سيُملأ ديناميكياً من renderPatientsList() -->
 *
 * لا تغيير في HTML مطلوب — renderPatientsList تُضيف الـ spinner تلقائياً.
 * ══════════════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════════════
 * VALIDATION — دالة للتحقق من صحة التثبيت (للاستخدام مرة واحدة)
 * شغّلها من console المتصفح بعد التثبيت:
 *   ArgonPatchValidator.run()
 * ══════════════════════════════════════════════════════════════ */
window.ArgonPatchValidator = {
  run() {
    const checks = [
      { name: 'ArgonPatientPager class', ok: typeof window.ArgonPatientPager !== 'undefined' },
      { name: '_pager initialized',     ok: window._pager !== null },
      { name: '_pager.cache exists',    ok: typeof window._pager?.cache === 'object' },
      { name: '_patients linked',       ok: typeof window._patients === 'object' },
      { name: 'filterPatients updated', ok: typeof window.filterPatients === 'function' },
      { name: 'loadMorePatientsFromServer', ok: typeof window.loadMorePatientsFromServer === 'function' },
      { name: 'getPatientSafe',         ok: typeof window.getPatientSafe === 'function' },
      { name: 'ArgonAuthBridge loaded', ok: typeof window.ArgonAuthBridge !== 'undefined' },
    ];

    console.group('%c🔍 ARGON Patch Validator', 'color:#0d9488;font-weight:bold;font-size:1.1rem');
    let passed = 0, failed = 0;
    checks.forEach(c => {
      if (c.ok) {
        console.log(`%c  ✅ ${c.name}`, 'color:#10b981');
        passed++;
      } else {
        console.error(`  ❌ ${c.name} — فشل`);
        failed++;
      }
    });
    console.log(`\n%c  نتيجة: ${passed}/${checks.length} — ${failed ? '⚠️ يوجد مشاكل' : '✅ جاهز للإنتاج'}`,
      'font-weight:bold;color:' + (failed ? '#f59e0b' : '#10b981'));

    /* اختبار جلب صفحة */
    if (window._pager) {
      console.log('\n📋 Pager Status:');
      console.log('  - totalCached:', window._pager.totalCached);
      console.log('  - hasMore:',     window._pager.hasMore);
      console.log('  - isLoading:',   window._pager.isLoading);
      console.log('  - mode:',        window._pager.isSearchMode ? 'search' : 'browse');
    }
    console.groupEnd();

    return { passed, failed, total: checks.length };
  }
};
