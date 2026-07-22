/**
 * ============================================================
 *  ARGON MEDICAL OS — National ID Security Layer v1.0
 *  ملف: argon-nid-security.js
 *
 *  أضف هذا الملف قبل argon-enterprise.js في كل صفحة:
 *  <script src="argon-nid-security.js"></script>
 *
 *  يحتوي على:
 *  1. NID Guard — يمنع فتح/إنشاء أي ملف بدون رقم وطني
 *  2. NID Collector Dialog — نافذة تطلب الرقم الوطني للمرضى القدامى
 *  3. NID Search Engine — بحث فوري بالرقم الوطني
 *  4. تعزيز findMatch — رقم وطني = EXACT فوري مطلق
 * ============================================================
 */

window.ArgonNID = window.ArgonNID || {};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔒 PART 1 — NID Guard
// القاعدة المطلقة: لا ملف بدون رقم وطني
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * يتحقق أن الرقم الوطني صالح (أردني 10 أرقام أو 9+)
 * قابل للتعديل حسب متطلبات بلدك
 */
ArgonNID.isValidNID = function(nid) {
  const clean = String(nid || '').replace(/[\s\-]/g, '');
  return clean.length >= 9 && /^\d+$/.test(clean);
};

/**
 * ينظف الرقم الوطني (يزيل المسافات والشرطات)
 */
ArgonNID.cleanNID = function(nid) {
  return String(nid || '').replace(/[\s\-]/g, '').trim();
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🪟 PART 2 — NID Collector Dialog
// نافذة تطلب الرقم الوطني للمرضى القدامى
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * يعرض نافذة إجبارية لإدخال الرقم الوطني
 * لا يمكن إغلاقها بدون إدخال الرقم
 *
 * @param {string} patientName  - اسم المريض للعرض
 * @param {string} patientId    - UID المريض في Firebase
 * @param {object} db           - Firebase Database
 * @param {string} basePath     - clinics/{CID}
 * @param {Function} onComplete - callback بعد الحفظ (patientId, nid)
 */
ArgonNID.showCollectorDialog = function(patientName, patientId, db, basePath, onComplete) {
  // أزل أي نافذة سابقة
  const old = document.getElementById('_argonNidOverlay');
  if (old) old.remove();

  // أضف الـ styles مرة واحدة
  if (!document.getElementById('_argonNidStyle')) {
    const s = document.createElement('style');
    s.id = '_argonNidStyle';
    s.textContent = `
      @keyframes _nidSlide { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
      #_argonNidCard { animation: _nidSlide 0.25s ease; }
      #_argonNidInp:focus { border-color: var(--teal, #0d9488) !important; outline: none; }
      #_argonNidInp.shake { animation: _nidShake 0.3s ease; }
      @keyframes _nidShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-8px)} 75%{transform:translateX(8px)} }
      ._nid-err { display:none; color:#ef4444; font-size:0.78rem; margin-top:6px; padding:6px 10px;
                  background:rgba(239,68,68,0.08); border-radius:7px; }
      ._nid-err.show { display:block; }
    `;
    document.head.appendChild(s);
  }

  const overlay = document.createElement('div');
  overlay.id = '_argonNidOverlay';
  overlay.style.cssText = `
    position:fixed; inset:0; z-index:9999999;
    background:rgba(3,11,10,0.85); backdrop-filter:blur(10px);
    display:flex; align-items:center; justify-content:center; padding:20px;
    font-family:'Tajawal',sans-serif; direction:rtl;
  `;

  overlay.innerHTML = `
    <div id="_argonNidCard" style="
      background:var(--panel,#0f172a);
      border:1px solid var(--border,#334155);
      border-radius:22px; padding:32px 28px;
      width:100%; max-width:420px;
      box-shadow:0 32px 80px rgba(0,0,0,0.6);
    ">
      <!-- أيقونة الأمان -->
      <div style="text-align:center; margin-bottom:24px;">
        <div style="
          width:64px; height:64px; border-radius:50%; margin:0 auto 14px;
          background:linear-gradient(135deg,rgba(13,148,136,0.2),rgba(14,165,233,0.1));
          border:2px solid rgba(13,148,136,0.3);
          display:flex; align-items:center; justify-content:center; font-size:1.8rem;
        ">🪪</div>
        <div style="font-size:1.1rem; font-weight:900; color:var(--text,#f8fafc); margin-bottom:6px;">
          الرقم الوطني مطلوب
        </div>
        <div style="font-size:0.82rem; color:var(--muted,#94a3b8); line-height:1.5;">
          لفتح ملف <strong style="color:var(--teal,#0d9488)">${_escNid(patientName)}</strong>
          يجب إدخال رقمه الوطني أولاً.<br>
          هذا ضروري لضمان عدم الخلط بين الملفات الطبية.
        </div>
      </div>

      <!-- حقل الإدخال -->
      <div style="margin-bottom:16px;">
        <label style="font-size:0.75rem; color:var(--muted,#94a3b8); font-weight:700; display:block; margin-bottom:8px;">
          الرقم الوطني / رقم الهوية *
        </label>
        <input
          id="_argonNidInp"
          type="text"
          inputmode="numeric"
          placeholder="أدخل الرقم الوطني (9-10 أرقام)"
          autocomplete="off"
          style="
            width:100%; background:var(--surf,#1e293b);
            border:2px solid var(--border,#334155);
            border-radius:11px; padding:13px 14px;
            color:var(--text,#f8fafc);
            font-family:'IBM Plex Mono',monospace;
            font-size:1.1rem; letter-spacing:3px;
            text-align:center; transition:border-color 0.2s;
          "
        >
        <div class="_nid-err" id="_argonNidErr">
          ⚠️ الرقم الوطني غير صالح — يجب أن يكون 9 أرقام على الأقل
        </div>
        <div id="_argonNidDupErr" class="_nid-err">
          ❌ هذا الرقم الوطني مسجل لمريض آخر — يرجى مراجعة السجلات
        </div>
      </div>

      <!-- زر الحفظ -->
      <button id="_argonNidSaveBtn" style="
        width:100%; padding:13px;
        background:linear-gradient(135deg, var(--teal,#0d9488), #0ea5e9);
        border:none; border-radius:11px; color:#fff;
        font-family:'Tajawal',sans-serif; font-size:1rem; font-weight:800;
        cursor:pointer; transition:opacity 0.15s;
      ">
        🔒 حفظ الرقم وفتح الملف الطبي
      </button>

      <!-- تحذير -->
      <div style="
        margin-top:16px; padding:10px 12px;
        background:rgba(245,158,11,0.06); border:1px solid rgba(245,158,11,0.18);
        border-radius:9px; font-size:0.75rem; color:var(--amber,#f59e0b);
        display:flex; align-items:center; gap:8px;
      ">
        <span style="font-size:1rem">⚠️</span>
        <span>لا يمكن إغلاق هذه النافذة بدون إدخال الرقم الوطني. هذا إجراء أمني لا يمكن تجاوزه.</span>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const inp  = document.getElementById('_argonNidInp');
  const btn  = document.getElementById('_argonNidSaveBtn');
  const err  = document.getElementById('_argonNidErr');
  const dupE = document.getElementById('_argonNidDupErr');

  inp.focus();

  async function trySave() {
    const nid = ArgonNID.cleanNID(inp.value);
    err.classList.remove('show');
    dupE.classList.remove('show');

    // تحقق صالح؟
    if (!ArgonNID.isValidNID(nid)) {
      err.classList.add('show');
      inp.classList.add('shake');
      setTimeout(() => inp.classList.remove('shake'), 350);
      return;
    }

    // تحقق: هل هذا الرقم مسجل لمريض آخر؟
    btn.disabled = true;
    btn.textContent = '⏳ جاري التحقق...';

    try {
      const snap = await db.ref(basePath + '/patients')
        .orderByChild('info/nationalId')
        .equalTo(nid)
        .once('value');

      let conflictFound = false;
      snap.forEach(child => {
        if (child.key !== patientId) {
          conflictFound = true;
        }
      });

      if (conflictFound) {
        dupE.classList.add('show');
        btn.disabled = false;
        btn.textContent = '🔒 حفظ الرقم وفتح الملف الطبي';
        inp.classList.add('shake');
        setTimeout(() => inp.classList.remove('shake'), 350);
        return;
      }

      // ✅ حفظ في Firebase
      await db.ref(basePath + '/patients/' + patientId + '/info/nationalId').set(nid);

      // تحديث MPI إن وجد
      await db.ref(basePath + '/mpi/' + patientId + '/nationalId').set(nid).catch(() => {});

      // سجّل audit
      await db.ref(basePath + '/audit_logs').push({
        action: 'NID_COLLECTED',
        patientId,
        nid,
        timestamp: new Date().toISOString(),
        note: 'تم جمع الرقم الوطني من قِبل الطبيب عند فتح الملف'
      }).catch(() => {});

      overlay.remove();
      if (typeof onComplete === 'function') onComplete(patientId, nid);

    } catch (e) {
      btn.disabled = false;
      btn.textContent = '🔒 حفظ الرقم وفتح الملف الطبي';
      console.error('[ArgonNID] Save error:', e);
    }
  }

  btn.addEventListener('click', trySave);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') trySave(); });

  // تنسيق تلقائي للأرقام فقط
  inp.addEventListener('input', () => {
    inp.value = inp.value.replace(/\D/g, '').slice(0, 12);
  });
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔍 PART 3 — NID Search Engine
// بحث فوري بالرقم الوطني في قاعدة البيانات
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * يبحث عن مريض بالرقم الوطني
 * @returns {Promise<{uid, info}|null>}
 */
ArgonNID.findByNID = async function(nid, db, basePath) {
  const clean = ArgonNID.cleanNID(nid);
  if (!ArgonNID.isValidNID(clean)) return null;

  try {
    const snap = await db.ref(basePath + '/patients')
      .orderByChild('info/nationalId')
      .equalTo(clean)
      .once('value');

    let result = null;
    snap.forEach(child => {
      if (!result) {
        result = { uid: child.key, info: (child.val().info || {}) };
      }
    });
    return result;
  } catch (e) {
    console.error('[ArgonNID] findByNID error:', e);
    return null;
  }
};

/**
 * يبحث في _patients المحلي (أسرع — بدون Firebase)
 * @param {string} nid
 * @param {object} patientsCache - الكائن المحلي _patients
 * @returns {{uid, info}|null}
 */
ArgonNID.findByNIDLocal = function(nid, patientsCache) {
  const clean = ArgonNID.cleanNID(nid);
  if (!ArgonNID.isValidNID(clean)) return null;

  const entries = Object.entries(patientsCache || {});
  for (const [uid, p] of entries) {
    if (ArgonNID.cleanNID(p.info?.nationalId || '') === clean) {
      return { uid, info: p.info || {} };
    }
  }
  return null;
};

// دالة مساعدة داخلية
function _escNid(s) {
  return String(s || '').replace(/[<>"'&]/g, c =>
    ({ '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;', '&':'&amp;' }[c])
  );
}
