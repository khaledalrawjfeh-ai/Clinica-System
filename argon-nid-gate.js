/**
 * ============================================================
 *  ARGON MEDICAL OS — Smart NID Gate v2.0
 *  ملف: argon-nid-gate.js
 *
 *  المبدأ: الرقم الوطني مهم لكن الرعاية الطبية لا تتوقف
 *
 *  3 مسارات عند فتح ملف بدون رقم وطني:
 *  1. المريض يعطي رقمه → يُحفظ فوراً → يُفتح الملف ✅
 *  2. المريض لا يعرفه (مغترب/طارئ/نسيان) → Bypass مع سبب ✅
 *  3. الرقم موجود لشخص آخر → إنذار أحمر، إيقاف كامل 🚫
 * ============================================================
 */

window.ArgonNID = window.ArgonNID || {};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// أسباب التجاوز الجاهزة
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ArgonNID.BYPASS_REASONS = [
  { id: 'expat',     label: '🌍 مغترب أو جنسية أجنبية' },
  { id: 'emergency', label: '🚨 حالة طارئة — لا وقت' },
  { id: 'child',     label: '👶 طفل — يُستخدم رقم ولي الأمر' },
  { id: 'forgot',    label: '🤔 نسي رقمه — سيُوفَّر لاحقاً' },
  { id: 'elderly',   label: '👴 كبير سن — لا يحفظ رقمه' },
  { id: 'other',     label: '📝 سبب آخر (اكتب أدناه)' },
];

ArgonNID.isValidNID = function(nid) {
  const clean = String(nid || '').replace(/[\s\-]/g, '');

  // طول 9 أرقام على الأقل
  if (clean.length < 9 || !/^\d+$/.test(clean)) return false;

  // ليس كله أصفاراً
  if (/^0+$/.test(clean)) return false;

  // ليس تاريخ ميلاد مكتوب بدون شرطات (مثل 19991231)
  if (clean.length === 8 && /^(19|20)\d{6}$/.test(clean)) return false;

  return true;
};
ArgonNID.cleanNID     = (nid) => String(nid||'').replace(/[\s\-]/g,'').trim();
ArgonNID.findByNIDLocal = (nid, cache) => {
  const c = ArgonNID.cleanNID(nid);
  if (!ArgonNID.isValidNID(c)) return null;
  for (const [uid, p] of Object.entries(cache||{}))
    if (ArgonNID.cleanNID(p.info?.nationalId||'') === c) return { uid, info: p.info||{} };
  return null;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🪟 Smart NID Dialog
// يعرض نافذة ذكية بـ 3 حالات:
//   A) إدخال الرقم الوطني
//   B) تجاوز مع تسجيل سبب
//   C) إنذار تعارض (لا تجاوز)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * @param {object} opts
 *   patientName   : اسم المريض
 *   patientId     : UID في Firebase
 *   db            : Firebase Database
 *   basePath      : clinics/{CID}
 *   doctorId      : UID الطبيب الحالي
 *   doctorName    : اسم الطبيب
 *   patientsCache : _patients المحلي
 *   onComplete    : callback(patientId, {nid|null, bypassed, bypassReason})
 */
ArgonNID.showGate = function(opts) {
  const { patientName, patientId, db, basePath,
          doctorId, doctorName, patientsCache, currentInvalidNID, onComplete } = opts;

  const old = document.getElementById('_nidGateOverlay');
  if (old) old.remove();

  _injectStyles();

  const overlay = document.createElement('div');
  overlay.id = '_nidGateOverlay';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9999999;
    background:rgba(3,11,10,0.88);backdrop-filter:blur(12px);
    display:flex;align-items:center;justify-content:center;
    padding:20px;font-family:'Tajawal',sans-serif;direction:rtl;
  `;

  overlay.innerHTML = `
    <div id="_nidGateCard" style="
      background:var(--panel,#0f172a);
      border:1px solid var(--border,#334155);
      border-radius:22px;padding:28px 26px;
      width:100%;max-width:460px;
      box-shadow:0 32px 80px rgba(0,0,0,0.65);
    ">

      <!-- Header -->
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:22px;">
        <div style="
          width:48px;height:48px;border-radius:14px;flex-shrink:0;
          background:linear-gradient(135deg,rgba(13,148,136,.18),rgba(14,165,233,.1));
          border:1.5px solid rgba(13,148,136,.3);
          display:flex;align-items:center;justify-content:center;font-size:1.5rem;
        ">🪪</div>
        <div>
          <div style="font-size:1rem;font-weight:900;color:var(--text,#f8fafc);">
            تأكيد هوية المريض
          </div>
          <div style="font-size:.78rem;color:var(--muted,#94a3b8);margin-top:2px;">
            ملف: <strong style="color:var(--teal,#0d9488);">${_esc(patientName)}</strong>
          </div>
        </div>
      </div>

      <!-- TAB A: إدخال الرقم الوطني -->
      <div id="_nidTabA">
        ${currentInvalidNID ? `<div style="margin-bottom:12px;padding:8px 12px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:8px;font-size:.75rem;color:#ef4444;display:flex;align-items:center;gap:8px;"><i class="fas fa-exclamation-triangle"></i><span>الرقم <b>${_esc(currentInvalidNID)}</b> غير صالح. يرجى إدخال رقم وطني صحيح (9-12 رقم).</span></div>` : ''}
        <label style="font-size:.72rem;color:var(--muted,#94a3b8);font-weight:700;display:block;margin-bottom:7px;">
          الرقم الوطني / رقم الهوية
        </label>
        <input id="_nidInp" type="text" inputmode="numeric"
          placeholder="أدخل الرقم (9-12 رقم)"
          autocomplete="off"
          style="
            width:100%;background:var(--surf,#1e293b);
            border:2px solid var(--border,#334155);
            border-radius:11px;padding:13px 14px;
            color:var(--text,#f8fafc);
            font-family:'IBM Plex Mono',monospace;
            font-size:1.05rem;letter-spacing:3px;text-align:center;
            transition:border-color .2s;
          ">
        <div id="_nidInpErr" style="
          display:none;color:#ef4444;font-size:.75rem;
          margin-top:6px;padding:6px 10px;
          background:rgba(239,68,68,.07);border-radius:7px;
        "></div>

        <div style="display:flex;gap:8px;margin-top:14px;">
          <button id="_nidSaveBtn" style="
            flex:1;padding:12px;
            background:linear-gradient(135deg,var(--teal,#0d9488),#0ea5e9);
            border:none;border-radius:10px;color:#fff;
            font-family:'Tajawal',sans-serif;font-size:.93rem;font-weight:800;
            cursor:pointer;
          ">✅ تحقق وافتح الملف</button>
        </div>

        <!-- فاصل -->
        <div style="
          display:flex;align-items:center;gap:10px;
          margin:18px 0 14px;color:var(--muted,#94a3b8);font-size:.75rem;
        ">
          <div style="flex:1;height:1px;background:var(--border,#334155);"></div>
          المريض لا يعرف رقمه الوطني؟
          <div style="flex:1;height:1px;background:var(--border,#334155);"></div>
        </div>

        <button id="_nidBypassBtn" style="
          width:100%;padding:10px;
          background:rgba(245,158,11,.07);
          border:1px solid rgba(245,158,11,.25);
          border-radius:10px;color:var(--amber,#f59e0b);
          font-family:'Tajawal',sans-serif;font-size:.85rem;font-weight:700;
          cursor:pointer;
        ">⚡ تجاوز مؤقت مع تسجيل السبب</button>
      </div>

      <!-- TAB B: تجاوز مع سبب -->
      <div id="_nidTabB" style="display:none;">
        <div style="
          padding:10px 13px;margin-bottom:16px;
          background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.2);
          border-radius:9px;font-size:.78rem;color:var(--amber,#f59e0b);
          display:flex;gap:8px;align-items:flex-start;
        ">
          <span style="font-size:1rem;flex-shrink:0;">⚠️</span>
          <span>سيُفتح الملف بدون رقم وطني. سيُسجَّل هذا التجاوز في سجل المراجعة.</span>
        </div>

        <label style="font-size:.72rem;color:var(--muted,#94a3b8);font-weight:700;display:block;margin-bottom:8px;">
          سبب التجاوز *
        </label>
        <div id="_nidReasonBtns" style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px;">
          ${ArgonNID.BYPASS_REASONS.map(r => `
            <button
              class="_nidReasonBtn"
              data-id="${r.id}"
              style="
                padding:6px 13px;border-radius:20px;
                border:1.5px solid var(--border,#334155);
                background:transparent;color:var(--muted,#94a3b8);
                font-family:'Tajawal',sans-serif;font-size:.78rem;font-weight:600;
                cursor:pointer;transition:.15s;
              "
            >${r.label}</button>
          `).join('')}
        </div>

        <div id="_nidOtherWrap" style="display:none;margin-bottom:12px;">
          <input id="_nidOtherInp" type="text"
            placeholder="اكتب السبب..."
            style="
              width:100%;background:var(--surf,#1e293b);
              border:1.5px solid var(--border,#334155);border-radius:9px;
              padding:10px 13px;color:var(--text,#f8fafc);
              font-family:'Tajawal',sans-serif;font-size:.88rem;outline:none;
            ">
        </div>

        <div id="_nidBypassErr" style="
          display:none;color:#ef4444;font-size:.75rem;
          margin-bottom:10px;padding:6px 10px;
          background:rgba(239,68,68,.07);border-radius:7px;
        ">⚠️ يرجى اختيار سبب التجاوز أولاً</div>

        <div style="display:flex;gap:8px;">
          <button id="_nidConfirmBypass" style="
            flex:2;padding:12px;
            background:rgba(245,158,11,.1);
            border:1.5px solid rgba(245,158,11,.3);
            border-radius:10px;color:var(--amber,#f59e0b);
            font-family:'Tajawal',sans-serif;font-size:.9rem;font-weight:800;
            cursor:pointer;
          ">⚡ تأكيد التجاوز وفتح الملف</button>
          <button id="_nidBackBtn" style="
            flex:1;padding:12px;
            background:transparent;
            border:1px solid var(--border,#334155);
            border-radius:10px;color:var(--muted,#94a3b8);
            font-family:'Tajawal',sans-serif;font-size:.88rem;
            cursor:pointer;
          ">← رجوع</button>
        </div>
      </div>

      <!-- TAB C: تعارض رقم وطني — إنذار أحمر -->
      <div id="_nidTabC" style="display:none;">
        <div style="
          text-align:center;padding:20px 10px;
          background:rgba(239,68,68,.05);border:2px solid rgba(239,68,68,.25);
          border-radius:14px;margin-bottom:18px;
        ">
          <div style="font-size:2.5rem;margin-bottom:10px;">🚫</div>
          <div style="font-size:1rem;font-weight:900;color:#ef4444;margin-bottom:8px;">
            تعارض في الرقم الوطني
          </div>
          <div style="font-size:.82rem;color:var(--muted,#94a3b8);line-height:1.6;" id="_nidConflictMsg">
          </div>
        </div>
        <div style="
          padding:10px 13px;margin-bottom:16px;
          background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.15);
          border-radius:9px;font-size:.75rem;color:#fca5a5;
        ">
          ⛔ لا يمكن تجاوز هذا الخطأ. يرجى مراجعة السجلات أو التواصل مع الإدارة.
        </div>
        <button id="_nidConflictBack" style="
          width:100%;padding:11px;
          background:transparent;border:1px solid var(--border,#334155);
          border-radius:10px;color:var(--muted,#94a3b8);
          font-family:'Tajawal',sans-serif;font-size:.88rem;cursor:pointer;
        ">← إدخال رقم مختلف</button>
      </div>

    </div>
  `;

  document.body.appendChild(overlay);

  // ── المتغيرات ──
  const inp         = document.getElementById('_nidInp');
  const inpErr      = document.getElementById('_nidInpErr');
  const saveBtn     = document.getElementById('_nidSaveBtn');
  const bypassBtn   = document.getElementById('_nidBypassBtn');
  const backBtn     = document.getElementById('_nidBackBtn');
  const cfmBypass   = document.getElementById('_nidConfirmBypass');
  const bypassErr   = document.getElementById('_nidBypassErr');
  const conflictBack= document.getElementById('_nidConflictBack');
  const tabA = document.getElementById('_nidTabA');
  const tabB = document.getElementById('_nidTabB');
  const tabC = document.getElementById('_nidTabC');

  let selectedReasonId   = null;
  let selectedReasonLabel= null;

  // ── تنسيق الإدخال ──
  inp.addEventListener('input', () => {
    inp.value = inp.value.replace(/\\D/g,'').slice(0,12);
    inp.style.borderColor = '';
    _hide(inpErr);
  });
  if (currentInvalidNID) {
    inp.value = currentInvalidNID;
  }
  inp.focus();

  // ── زر الحفظ ──
  saveBtn.addEventListener('click', () => _trySaveNID());
  inp.addEventListener('keydown', e => { if(e.key==='Enter') _trySaveNID(); });

  async function _trySaveNID() {
    const nid = ArgonNID.cleanNID(inp.value);
    _hide(inpErr);

    if (!ArgonNID.isValidNID(nid)) {
      _showErr(inpErr, '⚠️ الرقم غير صالح — يجب أن يكون 9 أرقام على الأقل');
      _shake(inp); return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = '⏳ جاري التحقق...';

    try {
      // تحقق: هل موجود لمريض آخر؟
      const snap = await db.ref(basePath+'/patients')
        .orderByChild('info/nationalId').equalTo(nid).once('value');

      let conflict = null;
      snap.forEach(ch => {
        if (ch.key !== patientId) conflict = { uid: ch.key, name: ch.val().info?.name||'مريض آخر' };
      });

      if (conflict) {
        // ── TAB C: تعارض ──
        document.getElementById('_nidConflictMsg').innerHTML =
          `الرقم الوطني <strong style="font-family:monospace">${nid}</strong> مسجّل مسبقاً لـ<br>
           <strong style="color:var(--text,#f8fafc);font-size:.95rem">${_esc(conflict.name)}</strong><br>
           <span style="font-size:.72rem;opacity:.6">(UID: ${conflict.uid})</span>`;
        tabA.style.display='none'; tabB.style.display='none'; tabC.style.display='block';
        saveBtn.disabled=false; saveBtn.textContent='✅ تحقق وافتح الملف';
        return;
      }

      // ✅ احفظ في Firebase
      await db.ref(`${basePath}/patients/${patientId}/info/nationalId`).set(nid);
      await db.ref(`${basePath}/mpi/${patientId}/nationalId`).set(nid).catch(()=>{});
      await _logBypass(db, basePath, patientId, patientName, doctorId, doctorName,
                       'nid_collected', `تم جمع الرقم الوطني ${nid} من المريض`, nid);

      overlay.remove();
      if (typeof onComplete === 'function')
        onComplete(patientId, { nid, bypassed: false });

    } catch(e) {
      saveBtn.disabled=false; saveBtn.textContent='✅ تحقق وافتح الملف';
      _showErr(inpErr, '❌ خطأ في الاتصال — حاول مجدداً');
    }
  }

  // ── زر "لا يعرف رقمه" ──
  bypassBtn.addEventListener('click', () => {
    tabA.style.display='none'; tabB.style.display='block';
  });
  backBtn.addEventListener('click', () => {
    tabA.style.display='block'; tabB.style.display='none';
    selectedReasonId=null; selectedReasonLabel=null;
    _resetReasonBtns(); _hide(bypassErr);
  });
  conflictBack.addEventListener('click', () => {
    tabC.style.display='none'; tabA.style.display='block';
    inp.value=''; inp.focus();
  });

  // ── أزرار الأسباب ──
  document.querySelectorAll('._nidReasonBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      _resetReasonBtns();
      btn.style.borderColor = 'var(--amber,#f59e0b)';
      btn.style.color       = 'var(--amber,#f59e0b)';
      btn.style.background  = 'rgba(245,158,11,.08)';
      selectedReasonId    = btn.dataset.id;
      selectedReasonLabel = btn.textContent.trim();
      _hide(bypassErr);
      const otherWrap = document.getElementById('_nidOtherWrap');
      otherWrap.style.display = selectedReasonId === 'other' ? 'block' : 'none';
      if (selectedReasonId === 'other') document.getElementById('_nidOtherInp').focus();
    });
  });

  // ── تأكيد التجاوز ──
  cfmBypass.addEventListener('click', async () => {
    if (!selectedReasonId) { _show(bypassErr); return; }

    let reasonText = selectedReasonLabel;
    if (selectedReasonId === 'other') {
      const custom = document.getElementById('_nidOtherInp').value.trim();
      if (!custom) { _showErr(document.getElementById('_nidOtherInp'), ''); _shake(document.getElementById('_nidOtherInp')); return; }
      reasonText = custom;
    }

    cfmBypass.disabled=true; cfmBypass.textContent='⏳ جاري الحفظ...';

    try {
      // سجّل الـ Bypass في Firebase
      await _logBypass(db, basePath, patientId, patientName,
                       doctorId, doctorName, selectedReasonId, reasonText, null);

      overlay.remove();
      if (typeof onComplete === 'function')
        onComplete(patientId, { nid: null, bypassed: true, bypassReason: reasonText, bypassId: selectedReasonId });

    } catch(e) {
      cfmBypass.disabled=false;
      cfmBypass.textContent='⚡ تأكيد التجاوز وفتح الملف';
    }
  });
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// تسجيل Bypass في Firebase
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function _logBypass(db, basePath, patientId, patientName,
                           doctorId, doctorName, reasonId, reasonText, nid) {
  const entry = {
    timestamp:   new Date().toISOString(),
    patientId,
    patientName: patientName || '',
    doctorId:    doctorId    || 'unknown',
    doctorName:  doctorName  || 'unknown',
    reasonId:    reasonId    || 'unknown',
    reasonText:  reasonText  || '',
    nidCollected: nid ? true : false,
    nid:          nid || null,
    type:         nid ? 'NID_COLLECTED' : 'NID_BYPASS',
  };
  return db.ref(`${basePath}/nid_bypass_log`).push(entry);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// دوال مساعدة داخلية
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function _esc(s){ return String(s||'').replace(/[<>"'&]/g,c=>({'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;'}[c])); }
function _hide(el){ if(el) el.style.display='none'; }
function _show(el){ if(el) el.style.display='block'; }
function _showErr(el, msg){ if(!el) return; if(msg) el.textContent=msg; el.style.display='block'; }
function _shake(el){ if(!el) return; el.classList.add('_nidShake'); setTimeout(()=>el.classList.remove('_nidShake'),400); }
function _resetReasonBtns(){
  document.querySelectorAll('._nidReasonBtn').forEach(b=>{
    b.style.borderColor=''; b.style.color=''; b.style.background='';
  });
  const ow = document.getElementById('_nidOtherWrap');
  if(ow) ow.style.display='none';
}

function _injectStyles(){
  if(document.getElementById('_nidGateStyle')) return;
  const s = document.createElement('style');
  s.id = '_nidGateStyle';
  s.textContent = `
    @keyframes _nidGateIn  { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
    @keyframes _nidShake    { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-7px)} 75%{transform:translateX(7px)} }
    #_nidGateCard           { animation:_nidGateIn .25s ease; }
    #_nidInp:focus          { border-color:var(--teal,#0d9488)!important; outline:none; }
    ._nidReasonBtn:hover    { border-color:rgba(245,158,11,.4)!important; color:var(--amber,#f59e0b)!important; }
    ._nidShake              { animation:_nidShake .35s ease; }
  `;
  document.head.appendChild(s);
}
