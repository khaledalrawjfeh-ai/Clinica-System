/**
 * ARGON MEDICAL OS — Auth Bridge v2.2 (SaaS Mode)
 * جسر المصادقة للعيادات ذاتية التسجيل
 */

'use strict';

const ArgonAuthBridge = (() => {

  const AUTH_MAP_PATH = 'clinic_auth_map';
  let _db = null;
  let _auth = null;

  function init(firebaseApp, database) {
    _auth = firebaseApp.auth ? firebaseApp.auth() : firebase.auth();
    _db = database;

    _auth.onAuthStateChanged(user => {
      if (user) {
        console.log(`%c🔐 ARGON Auth: موقّع [${user.email}]`, 'color:#0d9488;font-weight:bold');
        window.dispatchEvent(new CustomEvent('argon:auth:ready', { detail: { uid: user.uid, email: user.email } }));
      } else {
        window.dispatchEvent(new CustomEvent('argon:auth:signed_out'));
      }
    });
    return _auth.currentUser;
  }

  /**
   * تسجيل حساب عيادة جديد (التسجيل الذاتي SaaS)
   */
  async function registerNewClinic(clinicName, email, password) {
    try {
      // 1. إنشاء حساب Firebase Auth
      const cred = await _auth.createUserWithEmailAndPassword(email, password);
      const uid = cred.user.uid;

      // 2. توليد ID فريد للعيادة
      const clinicId = 'clinic_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

      // 3. ربط الـ UID بمعرف العيادة (هذه الخطوة مسموحة بفضل قواعد الأمان الجديدة)
      await _db.ref(`${AUTH_MAP_PATH}/${uid}`).set(clinicId);

      // 4. إعداد سجل المصادقة المحمي
      await _db.ref(`clinic_auth_settings/${clinicId}`).set({
        authEmail: email,
        authUid: uid,
        authEnabled: true,
        createdAt: new Date().toISOString()
      });

      // 5. بناء هيكل العيادة الأساسي
      await _db.ref(`clinics/${clinicId}/settings`).set({
        name: clinicName,
        status: 'active',
        createdAt: new Date().toISOString()
      });

      console.log(`%c✅ تم إنشاء العيادة بنجاح: ${clinicId}`, 'color:#10b981;font-weight:bold');
      return { clinicId, uid };

    } catch (err) {
      console.error('[ArgonAuthBridge] فشل في إنشاء العيادة:', err);
      throw err;
    }
  }

  /**
   * تسجيل الدخول بالإيميل الشخصي (SaaS)
   */
  async function loginWithEmail(email, password) {
    try {
      const cred = await _auth.signInWithEmailAndPassword(email, password);
      
      // جلب معرف العيادة المرتبط بهذا الحساب
      const snap = await _db.ref(`${AUTH_MAP_PATH}/${cred.user.uid}`).once('value');
      const clinicId = snap.val();

      if (!clinicId) throw new Error('هذا الحساب غير مرتبط بأي عيادة.');
      
      return { clinicId, uid: cred.user.uid };
    } catch (err) {
      console.error('[ArgonAuthBridge] فشل تسجيل الدخول:', err);
      throw err;
    }
  }

  // PHASE 3 - 3.3: First-Run Setup Wizard for Super Admin
  function _showSuperAdminWizard(resolve, reject) {
    const existing = document.getElementById('argon-super-wizard');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'argon-super-wizard';
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(15,23,42,0.95);backdrop-filter:blur(8px);z-index:9999999;display:flex;align-items:center;justify-content:center;font-family:Tajawal,sans-serif;direction:rtl;";
    
    overlay.innerHTML = `
      <div style="background:#1e293b;padding:40px;border-radius:16px;border:1px solid var(--border);width:90%;max-width:400px;text-align:center;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5)">
        <i class="fas fa-crown" style="font-size:3rem;color:var(--amber);margin-bottom:15px"></i>
        <h2 style="color:#fff;margin-bottom:10px">الإعداد لأول مرة (سوبر أدمن)</h2>
        <p style="color:var(--muted);font-size:0.9rem;margin-bottom:25px">يرجى تهيئة النظام وتعيين حساب السوبر أدمن الجديد بشكل آمن.</p>
        
        <div style="text-align:right;margin-bottom:15px">
            <label style="color:var(--sky);font-size:0.8rem;margin-bottom:5px;display:block">اسم المستخدم</label>
            <input type="text" id="arg-sa-user" class="vform-input" style="width:100%" placeholder="مثال: admin">
        </div>
        <div style="text-align:right;margin-bottom:15px">
            <label style="color:var(--sky);font-size:0.8rem;margin-bottom:5px;display:block">كلمة المرور</label>
            <input type="password" id="arg-sa-pass" class="vform-input" style="width:100%" placeholder="8 أحرف على الأقل">
        </div>
        <div style="text-align:right;margin-bottom:25px">
            <label style="color:var(--sky);font-size:0.8rem;margin-bottom:5px;display:block">تأكيد كلمة المرور</label>
            <input type="password" id="arg-sa-conf" class="vform-input" style="width:100%" placeholder="تأكيد كلمة المرور">
        </div>
        
        <button id="arg-sa-btn" class="btn-primary" style="width:100%;padding:12px;font-size:1.1rem;background:var(--amber);color:#000;border-color:var(--amber);"><i class="fas fa-check"></i> إنشاء الحساب والدخول</button>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('arg-sa-btn').onclick = async () => {
      const u = document.getElementById('arg-sa-user').value.trim();
      const p1 = document.getElementById('arg-sa-pass').value;
      const p2 = document.getElementById('arg-sa-conf').value;
      
      if (!u) return alert('يرجى إدخال اسم المستخدم');
      if (p1.length < 8) return alert('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
      if (p1 !== p2) return alert('كلمتا المرور غير متطابقتين');
      
      const btn = document.getElementById('arg-sa-btn');
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
      btn.disabled = true;

      // Hash password using SHA-256 for basic security without ArgonEnterpriseAuth dependency
      const encoder = new TextEncoder();
      const data = encoder.encode(p1 + "SUPER_SALT");
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      await _db.ref('super_admin').set({
        user: u,
        pass: hashHex,
        first_setup_completed: true,
        setupAt: new Date().toISOString()
      });
      
      overlay.remove();
      alert('تم إعداد السوبر أدمن بنجاح! يمكنك الآن تسجيل الدخول.');
      // Resolve so the caller knows it's handled (though typically they just reload)
      window.location.reload();
      resolve(null);
    };
  }

  /**
   * تسجيل دخول السوبر أدمن بالطريقة الكلاسيكية
   */
  async function loginSuperAdmin(username, password) {
    const snap = await _db.ref('super_admin').once('value');
    const config = snap.val();

    if (!config || !config.user || !config.pass) {
      return new Promise((resolve, reject) => {
        _showSuperAdminWizard(resolve, reject);
      });
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(password + "SUPER_SALT");
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const inputHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    if (username === config.user && (password === config.pass || inputHash === config.pass)) {
      try {
        await _auth.signInWithEmailAndPassword('superadmin@argon.clinic.system', password);
        return { role: 'super', uid: _auth.currentUser?.uid };
      } catch (e) {
        console.warn('تسجيل دخول السوبر أدمن عبر Firebase Auth فشل، جاري استخدام التوافق الخلفي.', e);
        return { role: 'super', legacy: true };
      }
    }
    throw new Error('بيانات الدخول غير صحيحة');
  }

  async function logout() {
    try {
      await _auth.signOut();
      sessionStorage.clear();
    } catch (e) {
      console.warn('Sign out error:', e);
    }
  }

  function waitForAuth() {
    return new Promise(resolve => {
      if (_auth?.currentUser) { resolve(_auth.currentUser); return; }
      const unsub = _auth.onAuthStateChanged(user => {
        if (user || user === null) { unsub(); resolve(user); }
      });
      setTimeout(() => { unsub(); resolve(null); }, 5000);
    });
  }

  return {
    init,
    registerNewClinic,
    loginWithEmail,
    loginSuperAdmin,
    logout,
    waitForAuth,
    get currentUser() { return _auth?.currentUser; }
  };

})();

window.ArgonAuthBridge = ArgonAuthBridge;
