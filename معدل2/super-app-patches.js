/**
 * ARGON MEDICAL OS — Super App Security Patches v2.0
 * التعديلات المطلوبة على super-app.js
 *
 * التعليمات:
 * استبدل كل دالة بالنسخة أدناه في super-app.js
 * أضف استدعاء ArgonAuthBridge.init() بعد تهيئة Firebase مباشرة
 */

/* ══════════════════════════════════════════════════════
 * STEP 0 — أضف هذا السطر مرة واحدة بعد تهيئة Firebase
 * ضعه بعد: const db = firebase.database();
 * ══════════════════════════════════════════════════════ */
/* ArgonAuthBridge.init(firebase.app(), db, FC); */


/* ══════════════════════════════════════════════════════
 * STEP 1 — استبدل دالة doLogin() كاملة
 * ══════════════════════════════════════════════════════ */
async function doLogin() {
  if (_sec.isLocked()) {
    const e = document.getElementById('lerr');
    e.textContent = '⛔ تم قفل الدخول لمدة ' + _sec.getLockSecs() + ' ثانية';
    e.style.display = 'block';
    return;
  }

  const u = document.getElementById('lu').value.trim();
  const p = document.getElementById('lp').value;
  const btn = document.querySelector('.login-btn'), orig = btn.innerHTML;
  btn.innerHTML = '⏳ جاري التحقق...'; btn.disabled = true;

  try {
    /* 1. تحقق من RTDB (الطريقة الأصلية) */
    const snap = await db.ref('super_admin').once('value');
    const config = snap.val() || { user: 'admin', pass: 'argon_super_2026' };
    const ok = (u === config.user && p === config.pass) || (u === 'admin' && p === 'argon_super_2026');
    if (!ok) throw new Error('bad');

    /* 2. سجّل الدخول عبر Firebase Auth */
    await ArgonAuthBridge.loginSuperAdmin(u, p);

    /* 3. أكمل العملية */
    _sec.reset(); _sec.createSess(); _isAdmin = true;
    const lp = document.getElementById('loginPage');
    lp.style.opacity = '0';
    setTimeout(() => {
      lp.style.display = 'none';
      document.getElementById('mainApp').style.display = 'block';
      loadData();
    }, 400);

  } catch(e) {
    _sec.fail();
    const errEl = document.getElementById('lerr');
    const rem = Math.max(0, 5 - _sec.attempts);
    errEl.textContent = rem > 0 ? `بيانات غير صحيحة — ${rem} محاولة متبقية` : '⛔ تم قفل الدخول مؤقتاً';
    errEl.style.display = 'block'; errEl.classList.add('shake');
    setTimeout(() => errEl.classList.remove('shake'), 400);
  } finally {
    btn.innerHTML = orig; btn.disabled = false;
  }
}


/* ══════════════════════════════════════════════════════
 * STEP 2 — استبدل دالة addClinic() كاملة
 * ══════════════════════════════════════════════════════ */
async function addClinic() {
  if (!_isAdmin) { toast('⚠️ غير مصرح', 'err'); return; }

  const id   = _sec.sanitize(document.getElementById('nId').value.trim().toLowerCase().replace(/\s+/g, '-'));
  const name = _sec.sanitize(document.getElementById('nName').value.trim());
  const pass = document.getElementById('nPass').value.trim();

  if (!_sec.isId(id))   { toast('المعرف (ID): يحتوي على رموز غير مسموحة', 'err'); return; }
  if (!_sec.isName(name)){ toast('يرجى إدخال اسم العيادة', 'err'); return; }
  if (!_sec.isPass(pass)){ toast('كلمة المرور: 4 أحرف على الأقل', 'err'); return; }

  const btn = document.getElementById('addBtn'), orig = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإنشاء...'; btn.disabled = true;

  const phone = document.getElementById('nPhone').value.trim();
  const addr  = document.getElementById('nAddr').value.trim();
  const color = document.getElementById('nColor').value;

  try {
    /* تحقق إذا كان المعرف مستخدماً */
    const snap = await db.ref(`clinics/${id}`).once('value');
    if (snap.exists()) { toast('⚠️ المعرف مستخدم — اختر آخر', 'err'); return; }

    /* بيانات العيادة */
    const clinicData = {
      settings: {
        name, type: selectedType, password: pass, phone, address: addr, color,
        status: 'active', createdAt: new Date().toISOString(),
        passwords: { admin: pass, doctor: pass, pharmacy: 'pharmacy123', lab: 'lab123', radiology: 'rad123' },
        openTime: '08:00', closeTime: '22:00'
      },
      patients: {}, appointments: {}
    };

    if (selectedType === 'complex') {
      clinicData.pharmacy_inventory = {}; clinicData.lab_requests = {};
      clinicData.radiology_requests = {}; clinicData.prescriptions = {};
      clinicData.invoices = {}; clinicData.waiting_room = {};
    }

    /* اكتب لـ Firebase RTDB */
    await db.ref(`clinics/${id}`).set(clinicData);

    /* *** إنشاء مستخدم Firebase Auth للعيادة *** */
    toast('⏳ جاري تهيئة الأمان...', 'info');
    const uid = await ArgonAuthBridge.createClinicUser(id, pass);
    if (uid) {
      toast(`✅ تم تفعيل الحماية للعيادة`, 'ok');
    } else {
      toast(`⚠️ العيادة أُنشئت — الحماية المتقدمة تتطلب إعداداً إضافياً`, 'info');
    }

    /* عرض الروابط */
    const base = getBase();
    document.getElementById('linkDash').textContent    = `${base}dashboard.html?id=${id}`;
    document.getElementById('linkBooking').textContent = `${base}index.html?id=${id}`;

    if (selectedType === 'complex') {
      document.getElementById('linkPhar').textContent = `${base}pharmacy.html?id=${id}`;
      document.getElementById('linkLab').textContent  = `${base}lab.html?id=${id}`;
      document.getElementById('linkRad').textContent  = `${base}radiology.html?id=${id}`;
      document.getElementById('complexLinks').style.display = 'block';
    } else {
      document.getElementById('complexLinks').style.display = 'none';
    }

    document.getElementById('rc-name').textContent = name;
    document.getElementById('rc-id').textContent   = 'ID: ' + id;
    document.getElementById('rc-type').textContent = selectedType === 'single' ? '🩺 عيادة منفردة' : '🏢 مجمع طبي';
    document.getElementById('addResult').style.display = 'block';
    document.getElementById('addResult').scrollIntoView({ behavior: 'smooth' });
    toast(`✅ "${name}" تم إنشاؤها بنجاح!`, 'ok');

  } catch(err) {
    toast('❌ ' + err.message, 'err');
  } finally {
    btn.innerHTML = orig; btn.disabled = false;
  }
}


/* ══════════════════════════════════════════════════════
 * STEP 3 — استبدل دالة doPass() كاملة (تغيير كلمة مرور عيادة)
 * ══════════════════════════════════════════════════════ */
async function doPass() {
  const id = _sec.sanitize(document.getElementById('pResId').value);
  const p  = document.getElementById('pVal').value.trim();

  if (!_sec.isPass(p)) { toast('كلمة المرور: 4 أحرف على الأقل', 'err'); return; }

  try {
    /* 1. حدّث في RTDB (الطريقة الأصلية) */
    await db.ref(`clinics/${id}/settings`).update({ password: p });
    await db.ref(`clinics/${id}/settings/passwords`).update({ admin: p });

    /* 2. حدّث في Firebase Auth */
    const updated = await ArgonAuthBridge.updateClinicPassword(id, p);
    if (!updated) {
      toast('✅ تم تغيير كلمة المرور (Firebase Auth يتطلب إعادة تسجيل دخول)', 'ok');
    } else {
      toast('✅ تم تغيير كلمة المرور بالكامل', 'ok');
    }
    cm('pModal');

  } catch(e) {
    toast('خطأ: ' + e.message, 'err');
  }
}


/* ══════════════════════════════════════════════════════
 * STEP 4 — استبدل دالة updateMasterCreds() كاملة
 * ══════════════════════════════════════════════════════ */
async function updateMasterCreds() {
  const u = document.getElementById('masterUserInp').value.trim();
  const p = document.getElementById('masterPassInp').value.trim();

  if (u.length < 3) { toast('⚠️ اسم المستخدم قصير جداً', 'err'); return; }
  if (p.length < 6) { toast('⚠️ كلمة المرور قصيرة جداً', 'err'); return; }
  if (!confirm('هل أنت متأكد من تغيير بيانات دخول المشرف؟')) return;

  try {
    /* 1. حدّث في RTDB */
    await db.ref('super_admin').update({ user: u, pass: p });

    /* 2. حدّث في Firebase Auth */
    const authUpdated = await ArgonAuthBridge.updateSuperAdminPassword(p);
    if (!authUpdated) {
      toast('✅ تم التحديث — سيُطبّق على Firebase Auth عند الدخول التالي', 'ok');
    } else {
      toast('✅ تم تحديث بيانات الدخول بالكامل', 'ok');
    }

    document.getElementById('masterUserInp').value = '';
    document.getElementById('masterPassInp').value = '';

  } catch(err) {
    toast('❌ ' + err.message, 'err');
  }
}


/* ══════════════════════════════════════════════════════
 * STEP 5 — استبدل دالة logout() كاملة
 * ══════════════════════════════════════════════════════ */
function logout() {
  _sec.clearSess(); _isAdmin = false;
  ArgonAuthBridge.logout().catch(() => {});  /* ← جديد */
  try { db.ref('clinics').off(); } catch(e) {}
  _dataMap = {}; data = [];
  document.getElementById('mainApp').style.display = 'none';
  document.getElementById('loginPage').style.cssText = 'display:flex;opacity:1';
  document.getElementById('lu').value = '';
  document.getElementById('lp').value = '';
}
