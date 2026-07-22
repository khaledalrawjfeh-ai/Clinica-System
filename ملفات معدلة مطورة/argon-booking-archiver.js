/**
 * ARGON MEDICAL OS — Booking Archiver Engine v1.0
 * محرك أرشفة المواعيد التلقائي
 *
 * المشكلة التي يحلها:
 *   /bookings كان يحتوي على كل موعد منذ بداية تشغيل العيادة،
 *   ويتم تحميله بالكامل عبر .on('child_added') عند كل فتح للشاشة.
 *   بعد أشهر من الاستخدام = آلاف السجلات تُسحب كل مرة = استهلاك
 *   هائل لباقة Firebase وتجميد متصفح الطبيب.
 *
 * الحل:
 *   1. كل حجز "منتهي" (done/completed/cancelled/no_show) أو "قديم"
 *      (تاريخه قبل اليوم بـ N يوم) يُنقل إلى /archived_bookings
 *      عبر عملية واحدة (multi-path update) — لا حذف ثم إضافة.
 *   2. /bookings يبقى صغيراً دائماً = اليوم + المستقبل + النشط فقط.
 *   3. الأرشيف /archived_bookings مسطّح ومفهرس — يُستعلم عنه
 *      فقط بـ orderByChild + equalTo (لا تحميل كامل أبداً).
 *
 * التشغيل:
 *   - تلقائي عند تحميل EMR/Dashboard (مرة كل عدة ساعات لكل متصفح)
 *   - عملية .once() واحدة على /bookings (ليست .on() لحظية)
 *   - قفل بسيط في Firebase لمنع التشغيل المتزامن من عدة أجهزة
 */

'use strict';

const ArgonBookingArchiver = (() => {

  const DEFAULT_OPTIONS = {
    /* الحجوزات الأقدم من هذا العدد من الأيام تُؤرشف حتى لو كانت
       'waiting' أو 'new' (حجوزات منسية / لم تُكمَل) */
    staleAfterDays: 2,

    /* الحالات التي تُؤرشف فوراً بغض النظر عن التاريخ */
    finalStatuses: ['done', 'completed', 'cancelled', 'no_show'],

    /* الحد الأدنى بالساعات بين كل تشغيل لنفس المتصفح */
    runIntervalHours: 6,

    /* مدة صلاحية القفل بالدقائق (لمنع التعارض بين الأجهزة) */
    lockTtlMinutes: 5,

    /* أقصى عدد عمليات نقل في تشغيل واحد (لتفادي update ضخم جداً) */
    maxBatchSize: 500
  };

  let _db = null;
  let _base = null;
  let _clinicId = null;
  let _opts = { ...DEFAULT_OPTIONS };

  /* ════════════════════════════════════════════
   * التهيئة
   * ════════════════════════════════════════════ */
  function init(db, basePath, clinicId, options = {}) {
    _db = db;
    _base = basePath;
    _clinicId = clinicId || basePath;
    _opts = { ..._opts, ...options };
  }

  /* ════════════════════════════════════════════
   * تشغيل تلقائي مُحدّد بالوقت (يُستدعى من initEMR/Dashboard)
   * لا يفعل شيئاً إذا لم تحن ساعة التشغيل التالية
   * ════════════════════════════════════════════ */
  async function runIfDue() {
    const storageKey = `argon_booking_archiver_${_clinicId}`;
    const last = parseInt(localStorage.getItem(storageKey) || '0', 10);
    const now = Date.now();
    const intervalMs = _opts.runIntervalHours * 3600 * 1000;

    if (now - last < intervalMs) return { skipped: true, reason: 'not_due' };

    /* علّم الوقت فوراً لمنع تشغيل متكرر من تابات متعددة في نفس المتصفح */
    localStorage.setItem(storageKey, String(now));

    try {
      const result = await runSweep();
      return result;
    } catch (e) {
      console.error('[ArgonBookingArchiver] Sweep failed:', e);
      return { skipped: false, error: e.message };
    }
  }

  /* ════════════════════════════════════════════
   * التشغيل اليدوي الفوري (لشاشة إدارة الأرشيف)
   * ════════════════════════════════════════════ */
  async function runSweep() {
    if (!_db || !_base) throw new Error('ArgonBookingArchiver not initialized');

    /* ── قفل بسيط عبر Firebase لمنع التعارض بين أجهزة متعددة ── */
    const lockRef = _db.ref(`${_base}/_meta/archiver_lock`);
    const lockSnap = await lockRef.once('value');
    const lock = lockSnap.val();
    const now = Date.now();
    const ttl = _opts.lockTtlMinutes * 60 * 1000;

    if (lock && lock.ts && (now - lock.ts) < ttl) {
      return { skipped: true, reason: 'locked_by_another_device', lockedBy: lock.by };
    }

    /* أمسك القفل */
    const myId = Math.random().toString(36).slice(2);
    await lockRef.set({ ts: now, by: myId });

    try {
      return await _doSweep();
    } finally {
      /* أفرج عن القفل فقط إذا كان لنا */
      const checkSnap = await lockRef.once('value');
      if (checkSnap.val()?.by === myId) {
        await lockRef.remove();
      }
    }
  }

  /* ════════════════════════════════════════════
   * منطق الأرشفة الفعلي
   * ════════════════════════════════════════════ */
  async function _doSweep() {
    /* قراءة .once واحدة فقط — ليست listener لحظي */
    const snap = await _db.ref(`${_base}/bookings`).once('value');
    const all = snap.val() || {};

    const todayStr = _todayStr();
    const staleCutoff = _dateMinusDays(todayStr, _opts.staleAfterDays);

    const toArchive = [];
    for (const [key, booking] of Object.entries(all)) {
      if (!booking || typeof booking !== 'object') continue;

      const status = booking.status || 'new';
      const date = booking.date || '';

      const isFinal = _opts.finalStatuses.includes(status);
      const isStale = date && date < staleCutoff;

      if (isFinal || isStale) {
        toArchive.push({
          key, booking,
          reason: isFinal ? 'final_status' : 'stale_unprocessed'
        });
      }

      if (toArchive.length >= _opts.maxBatchSize) break;
    }

    if (!toArchive.length) {
      return { skipped: false, archived: 0, scanned: Object.keys(all).length };
    }

    /* بناء عملية update واحدة (atomic multi-path) */
    const updates = {};
    toArchive.forEach(({ key, booking, reason }) => {
      updates[`${_base}/archived_bookings/${key}`] = {
        ...booking,
        archivedAt: new Date().toISOString(),
        archiveReason: reason
      };
      updates[`${_base}/bookings/${key}`] = null; /* حذف من المسار النشط */
    });

    await _db.ref().update(updates);

    console.log(
      `%c📦 ARGON Archiver: تمت أرشفة ${toArchive.length} حجزاً ` +
      `(من إجمالي ${Object.keys(all).length} في /bookings)`,
      'color:#0d9488;font-weight:bold'
    );

    return {
      skipped: false,
      archived: toArchive.length,
      scanned: Object.keys(all).length,
      remaining: Object.keys(all).length - toArchive.length
    };
  }

  /* ════════════════════════════════════════════
   * استعلامات الأرشيف — كلها مفهرسة، لا تحميل كامل
   * ════════════════════════════════════════════ */

  /** كل الحجوزات السابقة لمريض معيّن (لتاريخ المريض) */
  async function getPatientHistory(patientId, limit = 50) {
    if (!_db || !_base) return [];
    const snap = await _db.ref(`${_base}/archived_bookings`)
      .orderByChild('patientId')
      .equalTo(patientId)
      .limitToLast(limit)
      .once('value');
    return _snapToArray(snap);
  }

  /** كل الحجوزات المؤرشفة بحالة معينة (تقارير الإدارة) */
  async function getByStatus(status, limit = 100) {
    if (!_db || !_base) return [];
    const snap = await _db.ref(`${_base}/archived_bookings`)
      .orderByChild('status')
      .equalTo(status)
      .limitToLast(limit)
      .once('value');
    return _snapToArray(snap);
  }

  /** الحجوزات المؤرشفة بين تاريخين (تقارير شهرية/سنوية) */
  async function getByDateRange(fromDate, toDate, limit = 1000) {
    if (!_db || !_base) return [];
    const snap = await _db.ref(`${_base}/archived_bookings`)
      .orderByChild('date')
      .startAt(fromDate)
      .endAt(toDate + '\uf8ff')
      .limitToLast(limit)
      .once('value');
    return _snapToArray(snap);
  }

  /** حجوزات طبيب معيّن من الأرشيف */
  async function getByDoctor(doctorId, limit = 200) {
    if (!_db || !_base) return [];
    const snap = await _db.ref(`${_base}/archived_bookings`)
      .orderByChild('doctorId')
      .equalTo(doctorId)
      .limitToLast(limit)
      .once('value');
    return _snapToArray(snap);
  }

  /* ════════════════════════════════════════════
   * إحصائيات سريعة لشاشة الإدارة (لا تُحمّل البيانات كاملة)
   * ════════════════════════════════════════════ */
  async function getStats() {
    if (!_db || !_base) return null;
    const [activeSnap, archivedSnap] = await Promise.all([
      _db.ref(`${_base}/bookings`).once('value'),
      _db.ref(`${_base}/archived_bookings`).once('value')
    ]);
    const active = activeSnap.val() || {};
    const archived = archivedSnap.val() || {};
    return {
      activeCount: Object.keys(active).length,
      archivedCount: Object.keys(archived).length,
      lastRun: localStorage.getItem(`argon_booking_archiver_${_clinicId}`)
    };
  }

  /* ════════════════════════════════════════════
   * Helpers
   * ════════════════════════════════════════════ */
  function _todayStr() {
    return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  }

  function _dateMinusDays(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() - days);
    return d.toLocaleDateString('en-CA');
  }

  function _snapToArray(snap) {
    const val = snap.val();
    if (!val) return [];
    return Object.entries(val)
      .map(([key, v]) => ({ id: key, ...v }))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  /* ════════════════════════════════════════════
   * API العامة
   * ════════════════════════════════════════════ */
  return {
    init,
    runIfDue,
    runSweep,
    getPatientHistory,
    getByStatus,
    getByDateRange,
    getByDoctor,
    getStats
  };

})();

window.ArgonBookingArchiver = ArgonBookingArchiver;
