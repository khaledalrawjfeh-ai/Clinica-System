/**
 * 🔍 ARGON MEDICAL OS — Security & Pagination Validator
 * argon-security-validator.js — v2.0
 *
 * شغّله من console المتصفح في emr.html بعد التثبيت:
 *   ArgonSecurityValidator.runAll()
 *
 * أو من super.html:
 *   ArgonSecurityValidator.runSuperTests()
 */

'use strict';

const ArgonSecurityValidator = (() => {

  const PASS  = (msg) => console.log(`%c  ✅ ${msg}`, 'color:#10b981;font-weight:600');
  const FAIL  = (msg) => console.error(`  ❌ ${msg}`);
  const WARN  = (msg) => console.warn(`  ⚠️  ${msg}`);
  const HEAD  = (msg) => console.log(`%c\n${msg}`, 'color:#0d9488;font-weight:900;font-size:1rem');
  const INFO  = (msg) => console.log(`%c  ℹ️  ${msg}`, 'color:#94a3b8');

  /* ══════════════════════════════════════════════════════════════
   * 1. CHECKS — EMR
   * ══════════════════════════════════════════════════════════════ */
  async function runEMRTests() {
    HEAD('══ ARGON EMR Security Validator v2.0 ══');
    let passed = 0, failed = 0, warned = 0;

    /* ── Auth Bridge ── */
    HEAD('🔐 Auth Bridge');
    if (typeof window.ArgonAuthBridge !== 'undefined') {
      PASS('ArgonAuthBridge loaded');
      passed++;
      if (typeof ArgonAuthBridge.loginClinic === 'function') { PASS('loginClinic()'); passed++; }
      else { FAIL('loginClinic() missing'); failed++; }
      if (typeof ArgonAuthBridge.logout === 'function') { PASS('logout()'); passed++; }
      else { FAIL('logout() missing'); failed++; }
      if (ArgonAuthBridge.currentUser) {
        PASS(`Authenticated: ${ArgonAuthBridge.currentUser.email}`);
        passed++;
      } else {
        WARN('No Firebase Auth session — legacy mode active');
        warned++;
      }
    } else {
      FAIL('ArgonAuthBridge NOT loaded — add argon-auth-bridge.js to emr.html');
      failed++;
    }

    /* ── Patient Pager ── */
    HEAD('📋 Patient Pagination Engine');
    if (typeof window.ArgonPatientPager !== 'undefined') {
      PASS('ArgonPatientPager class exists');
      passed++;
    } else {
      FAIL('ArgonPatientPager NOT loaded — add argon-patient-pager.js to emr.html');
      failed++;
    }

    if (typeof window._pager !== 'undefined' && window._pager !== null) {
      PASS('_pager instance created');
      passed++;
      INFO(`Cached patients: ${_pager.totalCached}`);
      INFO(`Has more pages: ${_pager.hasMore}`);
      INFO(`Loading: ${_pager.isLoading}`);
      INFO(`Search mode: ${_pager.isSearchMode}`);

      if (typeof _pager.loadNextPage === 'function') { PASS('loadNextPage()'); passed++; }
      else { FAIL('loadNextPage() missing'); failed++; }

      if (typeof _pager.search === 'function') { PASS('search()'); passed++; }
      else { FAIL('search() missing'); failed++; }

      if (typeof _pager.getPatient === 'function') { PASS('getPatient()'); passed++; }
      else { FAIL('getPatient() missing'); failed++; }

      /* تحقق من الكاش */
      const cachedCount = _pager.totalCached;
      if (cachedCount > 0) {
        PASS(`Patients in cache: ${cachedCount}`);
        passed++;
      } else {
        WARN('No patients in cache — may be loading or clinic is empty');
        warned++;
      }

    } else {
      FAIL('_pager is null — initEMR() patch not applied');
      failed++;
    }

    /* ── EMR Patches ── */
    HEAD('🔧 EMR Patches');
    const patchFunctions = [
      'filterPatients', 'renderPatientsList',
      'loadMorePatients', 'loadMorePatientsFromServer',
      'getPatientSafe'
    ];

    patchFunctions.forEach(fn => {
      if (typeof window[fn] === 'function') { PASS(fn + '()'); passed++; }
      else { FAIL(fn + '() missing — apply emr-app-patches.js'); failed++; }
    });

    /* ── safeViewPatientFile Lazy Load check ── */
    HEAD('🔍 safeViewPatientFile Lazy Load');
    const svpSource = (typeof safeViewPatientFile === 'function')
      ? safeViewPatientFile.toString()
      : '';
    if (svpSource.includes('_pager.getPatient')) {
      PASS('Lazy load patch applied in safeViewPatientFile');
      passed++;
    } else {
      FAIL('Lazy load NOT found in safeViewPatientFile — apply STEP 5');
      failed++;
    }

    /* ── _executeSaveNewPatient Pager sync check ── */
    HEAD('💾 _executeSaveNewPatient Pager Sync');
    const execSource = (typeof _executeSaveNewPatient === 'function')
      ? _executeSaveNewPatient.toString()
      : '';
    if (execSource.includes('_pager.cache')) {
      PASS('Pager cache sync applied in _executeSaveNewPatient');
      passed++;
    } else {
      FAIL('Pager cache sync NOT found in _executeSaveNewPatient — apply STEP 6');
      failed++;
    }

    /* ── Firebase Rules Test ── */
    HEAD('🔒 Firebase Rules (Data Isolation)');
    await _testDataIsolation(passed, failed, warned).then(r => {
      passed = r.passed;
      failed = r.failed;
      warned = r.warned;
    });

    /* ── مؤشر التحميل ── */
    HEAD('🎨 UI Elements');
    const grid = document.getElementById('patGrid');
    if (grid) {
      const hasSpinner = grid.innerHTML.includes('patLoadingSpinner') ||
                          document.getElementById('patLoadingSpinner');
      if (hasSpinner) { PASS('Loading spinner present'); passed++; }
      else { WARN('Loading spinner not found — will appear after first filter'); warned++; }
    }

    /* ── Performance Test ── */
    HEAD('⚡ Performance');
    if (typeof _patients === 'object') {
      const patCount = Object.keys(_patients).length;
      INFO(`_patients size: ${patCount} records`);
      if (patCount > 5000) {
        WARN(`⚠️ ${patCount} records in memory — consider reducing pageSize`);
        warned++;
      } else {
        PASS(`Memory: ${patCount} records in cache (safe)`);
        passed++;
      }
    }

    /* ── Summary ── */
    _printSummary(passed, failed, warned);
    return { passed, failed, warned };
  }


  /* ══════════════════════════════════════════════════════════════
   * 2. CHECKS — SUPER ADMIN
   * ══════════════════════════════════════════════════════════════ */
  async function runSuperTests() {
    HEAD('══ ARGON Super Admin Security Validator v2.0 ══');
    let passed = 0, failed = 0, warned = 0;

    /* ── Auth Bridge ── */
    HEAD('🔐 Auth Bridge (Super Admin)');
    if (typeof window.ArgonAuthBridge !== 'undefined') {
      PASS('ArgonAuthBridge loaded');
      passed++;
      if (typeof ArgonAuthBridge.loginSuperAdmin === 'function') { PASS('loginSuperAdmin()'); passed++; }
      else { FAIL('loginSuperAdmin() missing'); failed++; }
      if (typeof ArgonAuthBridge.createClinicUser === 'function') { PASS('createClinicUser()'); passed++; }
      else { FAIL('createClinicUser() missing'); failed++; }
      if (typeof ArgonAuthBridge.updateClinicPassword === 'function') { PASS('updateClinicPassword()'); passed++; }
      else { FAIL('updateClinicPassword() missing'); failed++; }
    } else {
      FAIL('ArgonAuthBridge NOT loaded — add to super.html');
      failed++;
    }

    /* ── Super App Patches ── */
    HEAD('🔧 Super App Patches');
    const superFunctions = ['doLogin', 'addClinic', 'doPass', 'updateMasterCreds', 'logout'];
    superFunctions.forEach(fn => {
      if (typeof window[fn] !== 'function') { FAIL(`${fn}() missing`); failed++; return; }
      const src = window[fn].toString();
      if (src.includes('ArgonAuthBridge')) { PASS(`${fn}() uses ArgonAuthBridge`); passed++; }
      else { FAIL(`${fn}() NOT patched — apply super-app-patches.js`); failed++; }
    });

    /* ── Firebase Auth State ── */
    HEAD('🔑 Firebase Auth State');
    if (typeof firebase !== 'undefined' && firebase.auth) {
      const user = firebase.auth().currentUser;
      if (user) {
        PASS(`Authenticated: ${user.email}`);
        passed++;
        INFO(`UID: ${user.uid}`);
        if (user.email.includes('superadmin@argon.clinic.system')) {
          PASS('Super admin email confirmed');
          passed++;
        } else {
          WARN('Email does not match super admin pattern');
          warned++;
        }
      } else {
        WARN('Not authenticated with Firebase Auth — legacy mode');
        warned++;
      }
    } else {
      WARN('firebase.auth() not available');
      warned++;
    }

    /* ── clinic_auth_map Test ── */
    HEAD('🗺️ clinic_auth_map (requires super admin auth)');
    if (typeof db !== 'undefined') {
      try {
        const snap = await db.ref('clinic_auth_map').once('value');
        const map = snap.val() || {};
        const count = Object.keys(map).length;
        if (count > 0) {
          PASS(`clinic_auth_map: ${count} entries`);
          passed++;
          const hasSuper = Object.values(map).includes('__SUPER__');
          if (hasSuper) { PASS('Super admin UID entry exists'); passed++; }
          else { FAIL('Super admin UID NOT in clinic_auth_map — add manually'); failed++; }
        } else {
          FAIL('clinic_auth_map is empty — super admin UID not added');
          failed++;
        }
      } catch(e) {
        WARN(`Cannot read clinic_auth_map: ${e.message}`);
        warned++;
      }
    }

    _printSummary(passed, failed, warned);
    return { passed, failed, warned };
  }


  /* ══════════════════════════════════════════════════════════════
   * 3. ISOLATION TEST — أهم اختبار
   * ══════════════════════════════════════════════════════════════ */
  async function _testDataIsolation(passed, failed, warned) {
    if (typeof db === 'undefined' || typeof CID === 'undefined') {
      WARN('db or CID not available — isolation test skipped');
      return { passed, failed, warned: warned + 1 };
    }

    /* جلب قائمة العيادات */
    let allClinics = [];
    try {
      const snap = await db.ref('clinics').once('value');
      allClinics = Object.keys(snap.val() || {});
    } catch(e) {
      INFO('Cannot list all clinics (expected if rules are active)');
    }

    /* محاولة قراءة عيادة أخرى */
    const otherClinic = allClinics.find(id => id !== CID);
    if (otherClinic) {
      try {
        await db.ref(`clinics/${otherClinic}/patients`).limitToFirst(1).once('value');
        FAIL(`⚠️ DATA ISOLATION BREACH: Can read clinic "${otherClinic}" — Firebase Rules NOT deployed`);
        failed++;
      } catch(e) {
        if (e.message.includes('permission') || e.message.includes('denied')) {
          PASS(`Data isolation: Cannot read clinic "${otherClinic}" ✅`);
          passed++;
        } else {
          WARN(`Isolation test inconclusive: ${e.message}`);
          warned++;
        }
      }
    } else {
      INFO('Only one clinic found — isolation test skipped (need 2+ clinics)');
    }

    /* اختبار audit_log: لا حذف */
    try {
      const testLogPath = `clinics/${CID}/audit_logs/_validator_test_${Date.now()}`;
      await db.ref(testLogPath).set({ action: 'VALIDATOR_TEST', timestamp: new Date().toISOString() });
      try {
        await db.ref(testLogPath).remove();
        FAIL('Audit logs can be deleted — append-only rule NOT working');
        failed++;
      } catch(delErr) {
        if (delErr.message.includes('permission') || delErr.message.includes('denied')) {
          PASS('Audit logs are append-only (cannot delete) ✅');
          passed++;
        } else {
          WARN(`Audit delete test: ${delErr.message}`);
          warned++;
        }
      }
    } catch(e) {
      WARN(`Cannot write to audit_logs: ${e.message}`);
      warned++;
    }

    return { passed, failed, warned };
  }


  /* ══════════════════════════════════════════════════════════════
   * 4. MIGRATION STATUS
   * ══════════════════════════════════════════════════════════════ */
  async function checkMigrationStatus() {
    HEAD('📊 Migration Status Report');
    if (typeof db === 'undefined') { WARN('db not available'); return; }

    try {
      const snap = await db.ref('clinics').once('value');
      const clinics = snap.val() || {};
      let withAuth = 0, withoutAuth = 0;

      for (const [id, clinic] of Object.entries(clinics)) {
        const s = clinic.settings || {};
        if (s.authEnabled === true || s.authUid) withAuth++;
        else withoutAuth++;
      }

      const total = withAuth + withoutAuth;
      console.log(`%c  📋 Total clinics: ${total}`, 'color:#0ea5e9;font-weight:700');
      console.log(`%c  ✅ With Firebase Auth: ${withAuth}`, 'color:#10b981;font-weight:700');
      console.log(`%c  ⚠️  Legacy (no Auth): ${withoutAuth}`, 'color:#f59e0b;font-weight:700');

      if (withoutAuth > 0) {
        console.log(`\n%c  💡 لترحيل العيادات المتبقية:`, 'color:#0d9488');
        console.log(`%c  ArgonSecurityValidator.migrateAll()`, 'color:#0d9488;font-family:monospace');
      }
    } catch(e) {
      WARN(`Cannot check migration: ${e.message}`);
    }
  }


  /* ══════════════════════════════════════════════════════════════
   * 5. MIGRATE ALL CLINICS
   * ══════════════════════════════════════════════════════════════ */
  async function migrateAll() {
    HEAD('🚀 Migrating All Clinics to Firebase Auth');
    if (typeof db === 'undefined' || typeof ArgonAuthBridge === 'undefined') {
      FAIL('db or ArgonAuthBridge not available');
      return;
    }

    const snap = await db.ref('clinics').once('value');
    const clinics = snap.val() || {};
    let success = 0, failed = 0, skipped = 0;

    for (const [id, clinic] of Object.entries(clinics)) {
      const s = clinic.settings || {};

      /* تخطّ إذا مُرحَّلة بالفعل */
      if (s.authEnabled === true) {
        console.log(`%c  ⏭  ${id}: already migrated`, 'color:#94a3b8');
        skipped++;
        continue;
      }

      const pass = s.password;
      if (!pass) {
        console.warn(`  ⚠️  ${id}: no password found — skipped`);
        skipped++;
        continue;
      }

      try {
        const uid = await ArgonAuthBridge.createClinicUser(id, pass);
        if (uid) {
          success++;
          console.log(`%c  ✅ ${id} → ${uid}`, 'color:#10b981');
        } else {
          console.warn(`  ⚠️  ${id}: Auth unavailable — legacy mode`);
          skipped++;
        }
      } catch(e) {
        failed++;
        console.error(`  ❌ ${id}: ${e.message}`);
      }

      /* Delay لتجنب rate limits */
      await new Promise(r => setTimeout(r, 600));
    }

    console.log(`\n%c  ✅ نجح: ${success} | ❌ فشل: ${failed} | ⏭  تخطّي: ${skipped}`,
      'font-weight:900;color:#0d9488;font-size:1rem');
  }


  /* ══════════════════════════════════════════════════════════════
   * 6. PERFORMANCE BENCHMARK
   * ══════════════════════════════════════════════════════════════ */
  async function benchmarkPagination() {
    HEAD('⚡ Pagination Performance Benchmark');
    if (!window._pager) { FAIL('_pager not initialized'); return; }

    /* Cold start: كم يستغرق جلب صفحة؟ */
    const t0 = performance.now();
    await _pager.loadNextPage().catch(() => {});
    const t1 = performance.now();

    const elapsed = (t1 - t0).toFixed(0);
    const status  = elapsed < 500 ? '✅ ممتاز' : elapsed < 1500 ? '⚠️ مقبول' : '❌ بطيء';

    console.log(`%c  ⏱️  وقت جلب الصفحة: ${elapsed}ms — ${status}`, 'font-weight:700');
    console.log(`%c  📋 المرضى في الكاش: ${_pager.totalCached}`, 'color:#0ea5e9');
    console.log(`%c  📄 المزيد متاح: ${_pager.hasMore}`, 'color:#0ea5e9');

    /* اختبار البحث */
    const tSearch0 = performance.now();
    await _pager.search('test_query_xyz').catch(() => {});
    const tSearch1 = performance.now();
    console.log(`%c  🔍 وقت البحث: ${(tSearch1 - tSearch0).toFixed(0)}ms`, 'font-weight:700');

    /* إعادة تعيين بعد الاختبار */
    await _pager.resetToFirstPage().catch(() => {});
  }


  /* ══════════════════════════════════════════════════════════════
   * 7. HELPER
   * ══════════════════════════════════════════════════════════════ */
  function _printSummary(passed, failed, warned) {
    const total = passed + failed + warned;
    const status = failed > 0 ? '❌ يوجد مشاكل تمنع الإنتاج' :
                   warned > 0 ? '⚠️ جاهز مع تحذيرات' : '✅ جاهز للإنتاج';
    const color  = failed > 0 ? '#ef4444' : warned > 0 ? '#f59e0b' : '#10b981';

    console.log(`\n%c══════════════════════════════════`, 'color:#334155');
    console.log(`%c  ${status}`, `color:${color};font-weight:900;font-size:1.1rem`);
    console.log(`%c  ✅ ${passed} نجح | ❌ ${failed} فشل | ⚠️ ${warned} تحذير`, 'font-weight:700');
    console.log(`%c══════════════════════════════════\n`, 'color:#334155');

    if (failed > 0) {
      console.log('%c📋 خطوات الإصلاح:', 'color:#ef4444;font-weight:700');
      console.log('  1. راجع INTEGRATION_EXACT_CHANGES.md');
      console.log('  2. تأكد من ترتيب الـ scripts في HTML');
      console.log('  3. طبّق كل الـ STEPS بالترتيب');
    }
  }

  /* ══════════════════════════════════════════════════════════════
   * PUBLIC API
   * ══════════════════════════════════════════════════════════════ */
  return {
    /* التشغيل الكامل */
    runAll:            runEMRTests,
    runEMRTests:       runEMRTests,
    runSuperTests:     runSuperTests,

    /* أدوات مساعدة */
    checkMigrationStatus,
    migrateAll,
    benchmarkPagination,

    /* shortcuts */
    run:               runEMRTests,

    /* help */
    help() {
      console.log(`%c🔍 ARGON Security Validator Commands:
  ArgonSecurityValidator.run()                 — تشغيل فحص EMR كامل
  ArgonSecurityValidator.runSuperTests()       — فحص super.html
  ArgonSecurityValidator.checkMigrationStatus() — حالة ترحيل العيادات
  ArgonSecurityValidator.migrateAll()          — ترحيل كل العيادات
  ArgonSecurityValidator.benchmarkPagination() — قياس أداء الـ Pager`, 'color:#0d9488;font-family:monospace');
    }
  };
})();

window.ArgonSecurityValidator = ArgonSecurityValidator;

console.log(
  '%c🔍 ARGON Security Validator v2.0 loaded\n   شغّل: ArgonSecurityValidator.run()',
  'color:#0d9488;font-weight:bold'
);
