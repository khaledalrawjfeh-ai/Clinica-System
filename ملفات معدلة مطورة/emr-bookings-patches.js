/**
 * ARGON MEDICAL OS — EMR Bookings Query Patches v1.0
 * تعديلات emr-app.js لحل مشكلة سحب كل المواعيد منذ بداية التشغيل
 *
 * المشكلة المُصلَحة:
 *   db.ref(BASE + '/bookings').on('child_added', ...)  ← بدون أي فلتر
 *   كان يسحب كل موعد حدث في تاريخ العيادة، كل مرة يُفتح فيها النظام.
 *
 * الحل:
 *   1. الاستعلام محدود بـ orderByChild('date').startAt(today)
 *      → فقط مواعيد اليوم + المستقبل (نطاق صغير دائماً)
 *   2. ArgonBookingArchiver ينقل المواعيد المنتهية/القديمة لمسار
 *      منفصل (archived_bookings) بشكل دوري تلقائي
 *
 * المتطلبات:
 *   - argon-booking-archiver.js مُضاف قبل emr-app.js
 *   - firebase.rules.json (النسخة المحدّثة) منشورة
 */


/* ══════════════════════════════════════════════════════
 * STEP 0 — أضف سكربت الأرشفة في emr.html
 * قبل <script src="emr-app.js">
 * ══════════════════════════════════════════════════════ */
/*
<script src="argon-booking-archiver.js"></script>
*/


/* ══════════════════════════════════════════════════════
 * STEP 1 — استبدل قسم الحجوزات بالكامل داخل initEMR()
 *
 * هذا الكود يستبدل من:
 *   let bookingLoadTimer = null;
 * إلى نهاية:
 *   db.ref(BASE + '/bookings').on('child_removed', snap => {...});
 *
 * (إذا طبّقت emr-app-patches.js مسبقاً، استبدل نفس القسم
 *  داخل initEMR() الجديدة بنفس الطريقة)
 * ══════════════════════════════════════════════════════ */

/* ── في بداية initEMR(), بعد _pager.init(); أضف: ── */
/*
  ArgonBookingArchiver.init(db, BASE, CID);
  ArgonBookingArchiver.runIfDue().then(result => {
    if (result && result.archived > 0) {
      console.log(`%c📦 تمت أرشفة ${result.archived} موعداً قديماً (تبقّى ${result.remaining} نشط)`,
        'color:#0d9488;font-weight:bold');
    }
  });
*/

/* ── استبدال قسم الحجوزات: ── */
function _initBookingsScopedListener() {
  const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

  let bookingLoadTimer = null;
  let isInitWr = true;

  /* الاستعلام الأساسي — مُحدَّد بالتاريخ، يُعيد فقط اليوم + المستقبل */
  const scopedQuery = () => db.ref(BASE + '/bookings')
    .orderByChild('date')
    .startAt(todayStr);

  scopedQuery().once('value', () => {
    setTimeout(() => { isInitWr = false; }, 2000);
  });

  function playWrAlert() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, ctx.currentTime);
      osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6);
    } catch (e) {}
  }

  scopedQuery().on('child_added', snap => {
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

  scopedQuery().on('child_changed', snap => {
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

  /* child_removed يُطلَق أيضاً عند:
     - حذف الحجز فعلياً
     - أو خروج الحجز من نطاق الاستعلام (مثلاً: تمت أرشفته فأصبح
       تاريخه < اليوم بعد إعادة الكتابة، أو تم تعيينه null) */
  scopedQuery().on('child_removed', snap => {
    delete _liveBookings[snap.key];
    renderWaitingRoom();
  });
}


/* ══════════════════════════════════════════════════════
 * STEP 2 — تعديل completeWorkspaceVisit()
 * استبدل في الحالتين (مريض مسجل / غير مسجل):
 * ══════════════════════════════════════════════════════ */

/*
  القديم:
    updates[`${BASE}/completedBookings/${bookingId}`] = { ...b, status: 'done', completedAt: new Date().toISOString() };
    updates[`${BASE}/bookings/${bookingId}`] = null;

  الجديد (في كلا الحالتين — uid مسجّل وغير مسجّل):
*/
function _archiveCompletedBooking(updates, bookingId, b) {
  updates[`${BASE}/archived_bookings/${bookingId}`] = {
    ...b,
    status: 'done',
    completedAt: new Date().toISOString(),
    archivedAt: new Date().toISOString(),
    archiveReason: 'visit_completed'
  };
  updates[`${BASE}/bookings/${bookingId}`] = null;
}

/* مثال الاستخدام داخل completeWorkspaceVisit():

   if (bookingId) {
     const b = _liveBookings[bookingId];
     if (b) {
       _archiveCompletedBooking(updates, bookingId, b);
     } else {
       updates[`${BASE}/bookings/${bookingId}/status`] = 'completed';
     }
   }
*/


/* ══════════════════════════════════════════════════════
 * STEP 3 — (اختياري) عرض تاريخ مواعيد المريض من الأرشيف
 * يُستخدم في ملف المريض — تبويب "تاريخ المواعيد"
 * ══════════════════════════════════════════════════════ */

async function loadPatientBookingHistory(patientId) {
  const container = document.getElementById('patientBookingHistory');
  if (!container) return;

  container.innerHTML = `<div style="text-align:center;padding:20px;color:var(--muted)">
    <i class="fas fa-circle-notch fa-spin"></i> جاري تحميل السجل...
  </div>`;

  try {
    const history = await ArgonBookingArchiver.getPatientHistory(patientId, 30);

    if (!history.length) {
      container.innerHTML = `<div style="text-align:center;padding:20px;color:var(--muted)">
        لا يوجد مواعيد سابقة مؤرشفة لهذا المريض
      </div>`;
      return;
    }

    container.innerHTML = `<div style="display:grid;gap:8px">
      ${history.map(b => `
        <div class="glass-panel" style="padding:10px 14px;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:700;font-size:0.85rem">${b.date} — ${b.time || ''}</div>
            <div style="font-size:0.75rem;color:var(--muted)">${b.docName || ''}</div>
          </div>
          <span style="font-size:0.7rem;padding:3px 8px;border-radius:6px;
            background:${b.status === 'done' || b.status === 'completed' ? 'rgba(16,185,129,0.1);color:var(--green)' : 'rgba(148,163,184,0.1);color:var(--muted)'}">
            ${b.status === 'done' || b.status === 'completed' ? '✅ مكتمل' : b.status}
          </span>
        </div>
      `).join('')}
    </div>`;
  } catch (e) {
    container.innerHTML = `<div style="text-align:center;padding:20px;color:var(--red)">
      خطأ في تحميل السجل: ${e.message}
    </div>`;
  }
}

/* لإضافة التبويب في generatePatientFileHTML — أضف زر/قسم:
   <div id="patientBookingHistory"></div>
   ثم استدعِ: loadPatientBookingHistory(uid)
   عند فتح ملف المريض (في refreshPatientFileUI أو viewPatientFile)
*/


/* ══════════════════════════════════════════════════════
 * STEP 4 — شاشة إدارة الأرشيف (اختياري — للسوبر أدمن/admin)
 * ══════════════════════════════════════════════════════ */

async function renderArchiverAdminPanel(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const stats = await ArgonBookingArchiver.getStats();
  if (!stats) return;

  container.innerHTML = `
    <div class="glass-panel" style="padding:16px">
      <div style="font-weight:800;margin-bottom:10px">📦 إدارة أرشيف المواعيد</div>
      <div style="display:flex;gap:16px;margin-bottom:12px;flex-wrap:wrap">
        <div>
          <div style="font-size:1.4rem;font-weight:900;color:var(--teal)">${stats.activeCount}</div>
          <div style="font-size:0.75rem;color:var(--muted)">حجوزات نشطة (اليوم+)</div>
        </div>
        <div>
          <div style="font-size:1.4rem;font-weight:900;color:var(--muted)">${stats.archivedCount}</div>
          <div style="font-size:0.75rem;color:var(--muted)">حجوزات مؤرشفة</div>
        </div>
      </div>
      <div style="font-size:0.7rem;color:var(--muted);margin-bottom:10px">
        آخر تشغيل: ${stats.lastRun ? new Date(parseInt(stats.lastRun)).toLocaleString('ar-JO') : 'لم يُشغَّل بعد'}
      </div>
      <button class="btn-secondary btn-sm" onclick="_runArchiverNow('${containerId}')">
        <i class="fas fa-broom"></i> تشغيل الأرشفة الآن
      </button>
    </div>
  `;
}

async function _runArchiverNow(containerId) {
  toast('⏳ جاري الأرشفة...', 'ok');
  const result = await ArgonBookingArchiver.runSweep();
  if (result.skipped) {
    toast(`⚠️ ${result.reason === 'locked_by_another_device' ? 'جهاز آخر يقوم بالأرشفة الآن' : 'لا يوجد ما يُؤرشف'}`, 'info');
  } else {
    toast(`✅ تمت أرشفة ${result.archived} حجزاً`, 'ok');
  }
  renderArchiverAdminPanel(containerId);
}
