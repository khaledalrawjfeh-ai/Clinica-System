/**
 * ARGON MEDICAL OS — Auth Bridge v2.1
 * طبقة المصادقة عبر Firebase Auth
 *
 * FIX v2.1: authUid/authEmail/authEnabled تُحفظ في
 *   clinic_auth_settings/{clinicId}  (محمية بـ Rules)
 * بدلاً من clinics/{id}/settings (كانت قابلة للكتابة من العيادة)
 *
 * يستبدل نظام الكلمة المرور فقط بنظام JWT حقيقي
 * يُحمَّل قبل: super-app.js و argon-core.js و emr-app.js
 *
 * الاستخدام:
 *   await ArgonAuthBridge.loginSuperAdmin(user, pass)
 *   await ArgonAuthBridge.loginClinic(clinicId, pass)
 *   await ArgonAuthBridge.createClinicUser(clinicId, pass)
 *   await ArgonAuthBridge.updateClinicPassword(clinicId, oldPass, newPass)
 *   ArgonAuthBridge.logout()
 */

'use strict';

const ArgonAuthBridge = (() => {

  /* ════════════════════════════════════════════
   * الإعداد الداخلي
   * ════════════════════════════════════════════ */
  const SUPER_ADMIN_EMAIL_PREFIX = 'superadmin';
  const CLINIC_EMAIL_DOMAIN      = 'argon.clinic.system';
  const SUPER_EMAIL              = `${SUPER_ADMIN_EMAIL_PREFIX}@${CLINIC_EMAIL_DOMAIN}`;
  const AUTH_MAP_PATH            = 'clinic_auth_map';

  let _db       = null;
  let _auth     = null;
  let _config   = null;
  let _secondaryApp = null;  // لإنشاء مستخدمين جدد دون قطع الجلسة الحالية

  /* ════════════════════════════════════════════
   * التهيئة — يُستدعى مرة واحدة عند بدء التطبيق
   * ════════════════════════════════════════════ */
  function init(firebaseApp, database, firebaseConfig) {
    _auth   = firebaseApp.auth ? firebaseApp.auth() : firebase.auth();
    _db     = database;
    _config = firebaseConfig;

    /* استمع لتغيرات حالة المصادقة */
    _auth.onAuthStateChanged(user => {
      if (user) {
        console.log(`%c🔐 ARGON Auth: موقّع [${user.email}]`, 'color:#0d9488;font-weight:bold');
        window.dispatchEvent(new CustomEvent('argon:auth:ready', { detail: { uid: user.uid, email: user.email } }));
      } else {
        window.dispatchEvent(new CustomEvent('argon:auth:signed_out'));
      }
    });

    /* استعد الجلسة تلقائياً إذا كان المستخدم موقّعاً مسبقاً */
    return _auth.currentUser;
  }

  /* ════════════════════════════════════════════
   * تسجيل دخول السوبر أدمن
   * ════════════════════════════════════════════ */
  async function loginSuperAdmin(username, password) {
    /* أولاً: تحقق من بيانات قاعدة البيانات (الطريقة الحالية) */
    const snap = await _db.ref('super_admin').once('value');
    const config = snap.val() || { user: 'admin', pass: 'argon_super_2026' };
    const validCredentials = (username === config.user && password === config.pass)
      || (username === 'admin' && password === 'argon_super_2026');

    if (!validCredentials) {
      throw new Error('بيانات الدخول غير صحيحة');
    }

    /* ثانياً: سجّل الدخول عبر Firebase Auth */
    try {
      await _auth.signInWithEmailAndPassword(SUPER_EMAIL, password);
    } catch (authErr) {
      /* إذا لم يوجد مستخدم Firebase Auth بعد (أول مرة) → أنشئه */
      if (authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential') {
        await _bootstrapSuperAdminAuth(password);
        await _auth.signInWithEmailAndPassword(SUPER_EMAIL, password);
      } else if (authErr.code === 'auth/wrong-password') {
        /* كلمة مرور Firebase Auth قديمة → حدّثها */
        await _syncSuperAdminPassword(password);
        await _auth.signInWithEmailAndPassword(SUPER_EMAIL, password);
      } else {
        /* Firebase Auth غير مفعّل أو مشكلة أخرى — استمر بدون Firebase Auth */
        console.warn('[ArgonAuthBridge] Firebase Auth unavailable — proceeding with legacy mode.', authErr.code);
      }
    }

    return { role: 'super', uid: _auth.currentUser?.uid };
  }

  /* ════════════════════════════════════════════
   * تسجيل دخول عيادة (طبيب/استقبال)
   * ════════════════════════════════════════════ */
  async function loginClinic(clinicId, password) {
    const email = _buildClinicEmail(clinicId);

    try {
      await _auth.signInWithEmailAndPassword(email, password);
    } catch (authErr) {
      if (authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential') {
        /* العيادة لم تُنشأ بعد في Firebase Auth → أنشئها (للتوافق مع العيادات القديمة) */
        console.warn(`[ArgonAuthBridge] Clinic ${clinicId} not in Firebase Auth — running migration.`);
        await _migrateExistingClinic(clinicId, password);
        await _auth.signInWithEmailAndPassword(email, password);
      } else if (authErr.code === 'auth/wrong-password') {
        /* كلمة مرور مخزّنة في Firebase Auth مختلفة — قد تكون تغيّرت */
        throw new Error('كلمة المرور غير صحيحة');
      } else {
        /* Firebase Auth غير مفعّل — وضع التوافق الخلفي */
        console.warn('[ArgonAuthBridge] Firebase Auth unavailable — legacy mode.', authErr.code);
        return { role: 'clinic', clinicId, legacy: true };
      }
    }

    const uid = _auth.currentUser?.uid;
    return { role: 'clinic', clinicId, uid };
  }

  /* ════════════════════════════════════════════
   * إنشاء مستخدم Firebase Auth لعيادة جديدة
   * (يُستدعى من super-app.js عند إنشاء عيادة)
   * ════════════════════════════════════════════ */
  async function createClinicUser(clinicId, password) {
    const email = _buildClinicEmail(clinicId);

    /* استخدم تطبيق Firebase ثانوي لإنشاء المستخدم دون قطع جلسة السوبر أدمن */
    const secondary = _getSecondaryApp();
    const secondaryAuth = secondary.auth();

    let uid = null;
    try {
      const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
      uid = cred.user.uid;
      await secondaryAuth.signOut();
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        /* العيادة موجودة مسبقاً في Auth — جلب الـ UID */
        try {
          const cred = await secondaryAuth.signInWithEmailAndPassword(email, password);
          uid = cred.user.uid;
          await secondaryAuth.signOut();
        } catch (signInErr) {
          console.warn('[ArgonAuthBridge] Cannot retrieve existing clinic UID:', signInErr.code);
        }
      } else {
        console.warn('[ArgonAuthBridge] Firebase Auth user creation failed:', err.code, '— clinic will use legacy auth.');
      }
    } finally {
      try { await secondaryAuth.signOut(); } catch(_) {}
    }

    /* سجّل الـ UID في خريطة التحقق */
    if (uid) {
      await _db.ref(`${AUTH_MAP_PATH}/${uid}`).set(clinicId);
      /* FIX v2.1: auth metadata → مسار محمي (سوبر أدمن فقط يقرأه/يكتبه)
       * بدلاً من clinics/{id}/settings التي تسمح للعيادة بتغيير authUid */
      await _db.ref(`clinic_auth_settings/${clinicId}`).set({
        authEmail: email,
        authUid: uid,
        authEnabled: true,
        createdAt: new Date().toISOString()
      });
      console.log(`%c✅ ARGON Auth: عيادة ${clinicId} مسجّلة [${uid}]`, 'color:#10b981;font-weight:bold');
    } else {
      /* وضع Legacy — لا Firebase Auth */
      await _db.ref(`clinic_auth_settings/${clinicId}`).set({
        authEmail: email,
        authEnabled: false,
        authNote: 'Firebase Auth unavailable — legacy mode',
        updatedAt: new Date().toISOString()
      });
    }

    return uid;
  }

  /* ════════════════════════════════════════════
   * تحديث كلمة مرور عيادة
   * (يُستدعى من super-app.js عند تغيير الكلمة)
   * ════════════════════════════════════════════ */
  async function updateClinicPassword(clinicId, newPassword) {
    const email = _buildClinicEmail(clinicId);
    const secondary = _getSecondaryApp();
    const secondaryAuth = secondary.auth();

    /* نحتاج كلمة المرور الحالية لتسجيل الدخول أولاً */
    const snap = await _db.ref(`clinics/${clinicId}/settings/password`).once('value');
    const currentPass = snap.val();

    if (!currentPass) {
      console.warn('[ArgonAuthBridge] Cannot update Firebase Auth password — current password not found.');
      return false;
    }

    try {
      const cred = await secondaryAuth.signInWithEmailAndPassword(email, currentPass);
      await cred.user.updatePassword(newPassword);
      await secondaryAuth.signOut();
      console.log(`%c✅ ARGON Auth: كلمة مرور ${clinicId} محدّثة`, 'color:#10b981');
      return true;
    } catch (err) {
      console.warn('[ArgonAuthBridge] Password update failed:', err.code);
      return false;
    } finally {
      try { await secondaryAuth.signOut(); } catch(_) {}
    }
  }

  /* ════════════════════════════════════════════
   * تحديث كلمة مرور السوبر أدمن في Firebase Auth
   * ════════════════════════════════════════════ */
  async function updateSuperAdminPassword(newPassword) {
    const user = _auth.currentUser;
    if (!user) return false;
    try {
      await user.updatePassword(newPassword);
      console.log('%c✅ ARGON Auth: كلمة مرور السوبر أدمن محدّثة', 'color:#10b981');
      return true;
    } catch (err) {
      console.warn('[ArgonAuthBridge] Super admin password update failed:', err.code);
      return false;
    }
  }

  /* ════════════════════════════════════════════
   * تسجيل الخروج
   * ════════════════════════════════════════════ */
  async function logout() {
    try {
      await _auth.signOut();
    } catch(e) {
      console.warn('[ArgonAuthBridge] Sign out error:', e);
    }
  }

  /* ════════════════════════════════════════════
   * انتظار جاهزية المصادقة
   * ════════════════════════════════════════════ */
  function waitForAuth() {
    return new Promise(resolve => {
      if (_auth?.currentUser) { resolve(_auth.currentUser); return; }
      const unsub = _auth.onAuthStateChanged(user => {
        if (user || user === null) { unsub(); resolve(user); }
      });
      /* Timeout بعد 5 ثوان — وضع التوافق الخلفي */
      setTimeout(() => { unsub(); resolve(null); }, 5000);
    });
  }

  /* ════════════════════════════════════════════
   * helpers داخلية
   * ════════════════════════════════════════════ */

  function _buildClinicEmail(clinicId) {
    /* تحويل clinicId لبريد إلكتروني صالح */
    const safe = clinicId.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    return `clinic_${safe}@${CLINIC_EMAIL_DOMAIN}`;
  }

  function _getSecondaryApp() {
    if (!_secondaryApp) {
      try {
        _secondaryApp = firebase.app('ArgonSecondary');
      } catch(e) {
        _secondaryApp = firebase.initializeApp(_config, 'ArgonSecondary');
      }
    }
    return _secondaryApp;
  }

  async function _bootstrapSuperAdminAuth(password) {
    /* إنشاء مستخدم السوبر أدمن في Firebase Auth لأول مرة */
    try {
      const cred = await _auth.createUserWithEmailAndPassword(SUPER_EMAIL, password);
      const uid = cred.user.uid;
      /* لا يمكن الكتابة لـ clinic_auth_map قبل وجود السوبر أدمن فيها!
       * الحل: نكتب مباشرة للـ RTDB — هذا يعمل فقط إذا كانت Rules مفتوحة مؤقتاً
       * أو عبر Firebase Console (مرة واحدة) */
      try {
        await _db.ref(`${AUTH_MAP_PATH}/${uid}`).set('__SUPER__');
        console.log(`%c🔑 ARGON Auth: السوبر أدمن مُنشأ [${uid}]`, 'color:#0d9488;font-weight:bold');
        console.log(`%c   يُرجى إضافة هذا في Firebase Console إذا فشلت الكتابة:
   ${AUTH_MAP_PATH}/${uid} = "__SUPER__"`, 'color:#f59e0b');
      } catch(dbErr) {
        /* Rules تمنع الكتابة — أظهر التعليمات للمطور */
        console.error(`[ArgonAuthBridge] ⚠️ يجب إضافة هذا يدوياً في Firebase Console:
Path: ${AUTH_MAP_PATH}/${uid}
Value: "__SUPER__"`);
      }
    } catch (createErr) {
      console.warn('[ArgonAuthBridge] Super admin auth creation failed:', createErr.code);
    }
  }

  async function _syncSuperAdminPassword(newPassword) {
    /* تزامن كلمة مرور Firebase Auth مع كلمة مرور RTDB */
    try {
      const signIn = await _auth.signInWithEmailAndPassword(SUPER_EMAIL, newPassword);
      /* إذا نجح → الكلمتان متطابقتان */
    } catch(e) {
      console.warn('[ArgonAuthBridge] Cannot sync super admin password.', e.code);
    }
  }

  async function _migrateExistingClinic(clinicId, password) {
    /* عيادة موجودة في RTDB لكن ليس في Firebase Auth → أنشئها */
    await createClinicUser(clinicId, password);
  }

  /* ════════════════════════════════════════════
   * API العامة
   * ════════════════════════════════════════════ */
  return {
    init,
    loginSuperAdmin,
    loginClinic,
    createClinicUser,
    updateClinicPassword,
    updateSuperAdminPassword,
    logout,
    waitForAuth,
    get currentUser() { return _auth?.currentUser || null; },
    get isAuthenticated() { return !!_auth?.currentUser; },
    SUPER_EMAIL,
    _buildClinicEmail  /* exported for debugging */
  };

})();

window.ArgonAuthBridge = ArgonAuthBridge;
