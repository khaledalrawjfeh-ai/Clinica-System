'use strict';
/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║   ARGON MEDICAL OS v3.0 — Hybrid Cloud Disaster Recovery Engine            ║
 * ║   محرك النسخ الاحتياطي الهجين (محلي + سحابي) — الإصدار المؤسسي         ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  الإصدار: 3.0.0                                                            ║
 * ║  التوافق: Firebase v9 Compat SDK (Database + Storage)                     ║
 * ║  الاسم العام (Global) محفوظ كما هو لضمان التوافق الخلفي 100%:             ║
 * ║      window.LocalBackupEngine  ← لا حاجة لتغيير استدعاء init(CID) القديم  ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  ما هو جديد في v3.0:                                                       ║
 * ║  ☁️  نسخ احتياطي سحابي تلقائي + يدوي (Firebase Storage)                  ║
 * ║  🛟  لقطة أمان تلقائية إلزامية قبل أي استعادة (Pre-Restore Safety Snapshot)║
 * ║  🔒 فحص سلامة وهوية الملف قبل الاستبدال (Checksum + ClinicId Guard)       ║
 * ║  🗑️  تدوير تلقائي للنسخ السحابية (يحتفظ بآخر 15 نسخة)                    ║
 * ║  🎚️  نظام حماية بمستويين (Tier 1 أساسي / Tier 2 معزز بـ Custom Token)    ║
 * ║                                                                              ║
 * ║  ⚠️  تنبيه أمني جوهري (اقرأ قبل النشر للإنتاج):                          ║
 * ║  بسبب اعتماد النظام الحالي على Firebase Anonymous Auth فقط (بدون          ║
 * ║  Custom Claims)، فإن قواعد Firebase Storage لا تستطيع التحقق من ملكية      ║
 * ║  العيادة الحقيقية إلا بعد تفعيل "Tier 2" (انظر ملف                        ║
 * ║  cloud-backup-token-function.js المرفق). إلى ذلك الحين، يعمل النظام       ║
 * ║  بحماية "أساسية" فقط (Tier 1) — راجع شرح المستويين في رسالة المحادثة.   ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

window.LocalBackupEngine = (function () {

  /* ════════════════════════════════════════
     0. ثوابت المحرك — Engine Constants
  ════════════════════════════════════════ */
  const VERSION        = '3.0.0';

  // ── ثوابت النسخ المحلي (محفوظة من v2.1 — بدون أي تغيير) ──
  const IDB_DB_NAME    = 'ArgonLocalBackupDB_v2';
  const IDB_VERSION    = 2;
  const STORE_HANDLES  = 'dir_handles';
  const STORE_SETTINGS = 'engine_settings';
  const STORE_LOG      = 'backup_log';
  const MAX_BACKUPS    = 7;
  const FILE_PREFIX    = 'ARGON_BACKUP_';
  const FILE_EXT       = '.json';
  const FIRST_RUN_DELAY_MS = 4000;

  // ── ثوابت النسخ السحابي (جديد في v3.0) ──
  const CLOUD_FILE_PREFIX            = 'ARGON_BACKUP_';       // نفس بادئة الملف المحلي (مسارات مختلفة، لا تعارض)
  const CLOUD_PRERESTORE_PREFIX      = 'ARGON_PRERESTORE_';   // لقطات أمان قبل الاستعادة — لها سقف خاص منفصل
  const MAX_CLOUD_BACKUPS            = 15;                    // طلب العميل: الاحتفاظ بآخر 15 نسخة سحابية
  const MAX_PRERESTORE_SNAPSHOTS     = 3;                     // لا حاجة للاحتفاظ بأكثر من 3 لقطات أمان
  const DEFAULT_CLOUD_INTERVAL_MINUTES = 360;                 // 6 ساعات (لترشيد كلفة التخزين/الباندويث)
  const MAX_CLOUD_FILE_SIZE_BYTES    = 50 * 1024 * 1024;      // حد أعلى احترازي 50MB لكل ملف

  /* ════════════════════════════════════════
     1. الحالة الداخلية — Internal State
  ════════════════════════════════════════ */
  let _idb         = null;
  let _clinicId    = null;
  let _timerRef    = null;     // مؤقت المحرك المحلي
  let _cloudTimerRef = null;   // مؤقت المحرك السحابي (مستقل تماماً عن المحلي)
  let _isRunning   = false;
  let _dirHandle   = null;
  let _settings    = {};
  let _panelOpen   = false;

  // ── حالة واجهة النسخ السحابي (جديد) ──
  let _cloudFilesCache   = [];     // آخر قائمة نسخ سحابية تم جلبها
  let _cloudListLoading  = false;  // هل القائمة قيد التحميل الآن؟
  let _pendingRestoreTarget = null; // {fullPath, name} عند اختيار ملف للاستعادة (قبل التأكيد النهائي)
  let _restoreInProgress = false;

  /* ════════════════════════════════════════
     2. تهيئة IndexedDB — IDB Init
     (بدون أي تغيير عن v2.1 — نفس اسم وإصدار القاعدة
      لضمان عدم فقدان مقابض المجلدات المحفوظة لدى المستخدمين الحاليين)
  ════════════════════════════════════════ */

  function _openDB() {
    if (_idb) return Promise.resolve(_idb);

    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_DB_NAME, IDB_VERSION);

      req.onupgradeneeded = function (e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_HANDLES)) {
          db.createObjectStore(STORE_HANDLES);
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS);
        }
        if (!db.objectStoreNames.contains(STORE_LOG)) {
          const logStore = db.createObjectStore(STORE_LOG, {
            keyPath: 'id',
            autoIncrement: true
          });
          logStore.createIndex('idx_clinic', 'clinicId', { unique: false });
          logStore.createIndex('idx_ts',     'ts',       { unique: false });
        }
      };

      req.onsuccess = function (e) {
        _idb = e.target.result;
        _idb.onversionchange = function () {
          _idb.close();
          _idb = null;
        };
        resolve(_idb);
      };

      req.onerror = function (e) {
        reject(new Error('[ArgonBackup] فشل فتح IndexedDB: ' + e.target.error));
      };
    });
  }

  /* ════════════════════════════════════════
     3. مساعدات IDB — IDB Helpers (بدون تغيير)
  ════════════════════════════════════════ */

  async function _idbGet(storeName, key) {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
      req.onerror   = () => reject(new Error('IDB GET failed: ' + req.error));
    });
  }

  async function _idbPut(storeName, value, key) {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).put(value, key);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(new Error('IDB PUT failed: ' + req.error));
    });
  }

  async function _idbAdd(storeName, value) {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).add(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(new Error('IDB ADD failed: ' + req.error));
    });
  }

  async function _idbGetAllByIndex(storeName, indexName, query) {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(storeName, 'readonly');
      const idx   = tx.objectStore(storeName).index(indexName);
      const req   = idx.getAll(query);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = () => reject(new Error('IDB INDEX GET ALL failed: ' + req.error));
    });
  }

  /* ════════════════════════════════════════
     4. إدارة مقبض المجلد — Handle Management (بدون تغيير)
  ════════════════════════════════════════ */

  async function _saveHandle(handle) {
    await _idbPut(STORE_HANDLES, handle, `handle_${_clinicId}`);
  }

  async function _loadHandle() {
    try {
      return await _idbGet(STORE_HANDLES, `handle_${_clinicId}`);
    } catch (e) {
      console.warn('[ArgonBackup] تعذّر استرجاع مقبض المجلد:', e.message);
      return null;
    }
  }

  /* ════════════════════════════════════════
     5. إدارة الإعدادات — Settings Management
     (نفس آلية v2.1 — كائن إعدادات عام واحد لكل عيادة،
      نضيف حقول النسخ السحابي إليه بدون أي تغيير في بنية IDB)
  ════════════════════════════════════════ */

  async function _saveSettings(patch) {
    const key      = `settings_${_clinicId}`;
    const current  = (await _idbGet(STORE_SETTINGS, key)) || {};
    const updated  = {
      ...current,
      ...patch,
      clinicId:  _clinicId,
      updatedAt: new Date().toISOString()
    };
    await _idbPut(STORE_SETTINGS, updated, key);
    _settings = updated;
    return updated;
  }

  async function _loadSettings() {
    try {
      const r = await _idbGet(STORE_SETTINGS, `settings_${_clinicId}`);
      _settings = r || {};
      return _settings;
    } catch (e) {
      _settings = {};
      return {};
    }
  }

  /* ════════════════════════════════════════
     6. فحص الصلاحيات — Permission Handling (بدون تغيير)
  ════════════════════════════════════════ */

  async function _verifyPermission(handle) {
    if (!handle) return false;
    try {
      const current = await handle.queryPermission({ mode: 'readwrite' });
      if (current === 'granted') return true;
      const renewed = await handle.requestPermission({ mode: 'readwrite' });
      return renewed === 'granted';
    } catch (err) {
      console.warn('[ArgonBackup] فشل فحص الصلاحية:', err.message);
      return false;
    }
  }

  async function _queryPermissionSilent(handle) {
    if (!handle) return false;
    try {
      const perm = await handle.queryPermission({ mode: 'readwrite' });
      return perm === 'granted';
    } catch (e) {
      return false;
    }
  }

  /* ════════════════════════════════════════
     7. اختيار مجلد الحفظ — Directory Picker (بدون تغيير)
  ════════════════════════════════════════ */

  async function requestDirectoryAccess() {
    if (typeof window.showDirectoryPicker !== 'function') {
      throw new Error(
        'متصفحك لا يدعم File System Access API.\n' +
        'يُرجى استخدام Google Chrome أو Microsoft Edge إصدار 86 أو أحدث.\n' +
        '(ملاحظة: النسخ الاحتياطي السحابي ☁️ يعمل في كل المتصفحات حتى لو لم تدعم هذه الميزة)'
      );
    }

    const handle = await window.showDirectoryPicker({
      mode:    'readwrite',
      startIn: 'documents',
      id:      'argon-backup-folder'
    });

    await _saveHandle(handle);
    await _saveSettings({
      folderName:       handle.name,
      folderConfigured: true,
      configuredAt:     new Date().toISOString(),
      permissionOk:     true
    });

    _dirHandle = handle;
    _log('تم اختيار مجلد الحفظ: ' + handle.name, 'info');
    _updateSidebarDot('ok');
    _updateTopbarBadge('ok');

    return handle;
  }

  /* ════════════════════════════════════════
     8. جلب بيانات Firebase — Data Fetcher
     (مشتركة بين المحلي والسحابي — بدون تغيير في المنطق)
  ════════════════════════════════════════ */

  async function fetchClinicData(clinicId) {
    if (typeof window.firebase === 'undefined' || !window.firebase.apps.length) {
      throw new Error('Firebase SDK غير مهيأ. تأكد من تحميل الصفحة بشكل صحيح.');
    }

    const dbRef = window.firebase.database();
    const snap = await dbRef.ref(`clinics/${clinicId}`).once('value');
    const data = snap.val();

    if (!data) {
      throw new Error(`لا توجد بيانات للعيادة: ${clinicId}. تحقق من الاتصال.`);
    }

    const nodeCount = typeof data === 'object' ? Object.keys(data).length : 1;

    return {
      _meta: {
        backupEngine:  'ARGON Hybrid Backup Engine v' + VERSION,
        clinicId:      String(clinicId),
        exportedAt:    new Date().toISOString(),
        nodeCount,
        checksum:      _simpleChecksum(JSON.stringify(data))
      },
      data
    };
  }

  function _simpleChecksum(str) {
    let hash = 0;
    for (let i = 0; i < Math.min(str.length, 10000); i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16).toUpperCase();
  }

  /* ════════════════════════════════════════
     9. تدوير النسخ المحلية — Local Rotation (بدون تغيير)
  ════════════════════════════════════════ */

  async function _rotateBackups(dirHandle) {
    const prefix = FILE_PREFIX + _clinicId + '_';
    const files  = [];

    try {
      for await (const [name] of dirHandle.entries()) {
        if (name.startsWith(prefix) && name.endsWith(FILE_EXT)) {
          files.push(name);
        }
      }
    } catch (e) {
      console.warn('[ArgonBackup] تعذّر قراءة محتويات المجلد:', e.message);
      return { kept: 0, deleted: 0 };
    }

    files.sort();
    const excessCount = Math.max(0, files.length - MAX_BACKUPS);
    const toDelete    = files.slice(0, excessCount);

    let deletedCount = 0;
    for (const fileName of toDelete) {
      try {
        await dirHandle.removeEntry(fileName);
        deletedCount++;
        _log(`تم حذف النسخة المحلية القديمة: ${fileName}`, 'rotate');
      } catch (e) {
        console.warn(`[ArgonBackup] تعذّر حذف ${fileName}:`, e.message);
      }
    }

    return { kept: files.length - deletedCount, deleted: deletedCount };
  }

  /* ════════════════════════════════════════
     10. تنفيذ النسخة المحلية — Local Perform Backup
     (بدون أي تغيير وظيفي عن v2.1 — نفس السلوك بالضبط)
  ════════════════════════════════════════ */

  async function performBackup(silent = true) {
    if (!_clinicId) {
      _log('performBackup: _clinicId غير معيّن', 'error');
      return null;
    }

    let handle = _dirHandle;
    if (!handle) {
      handle = await _loadHandle();
      _dirHandle = handle;
    }

    if (!handle) {
      _emit('backup-skipped', { reason: 'no-folder', clinicId: _clinicId });
      if (!silent) throw new Error('لم يتم اختيار مجلد الحفظ بعد.');
      return null;
    }

    const hasPermission = silent
      ? await _queryPermissionSilent(handle)
      : await _verifyPermission(handle);

    if (!hasPermission) {
      await _saveSettings({ permissionOk: false });
      _updateSidebarDot('warn');
      _updateTopbarBadge('warn');
      _emit('permission-revoked', { clinicId: _clinicId });

      if (!silent) {
        throw new Error(
          'انتهت صلاحية الوصول إلى المجلد.\n' +
          'يرجى النقر على "تغيير المجلد" لإعادة التفعيل.'
        );
      }
      _showPermissionExpiredToast();
      return null;
    }

    _updateTopbarBadge('running');
    const startTime = Date.now();

    let payload;
    try {
      payload = await fetchClinicData(_clinicId);
    } catch (fetchErr) {
      _updateTopbarBadge('error');
      _log('فشل جلب البيانات من Firebase: ' + fetchErr.message, 'error');
      if (!silent) throw fetchErr;
      return null;
    }

    const now      = new Date();
    const dateStr  = now.toISOString().slice(0, 10);
    const timeStr  = now.toTimeString().slice(0, 8).replace(/:/g, '-');
    const fileName = `${FILE_PREFIX}${_clinicId}_${dateStr}_${timeStr}${FILE_EXT}`;

    const jsonString  = JSON.stringify(payload, null, 2);
    const encodedSize = new TextEncoder().encode(jsonString).length;

    try {
      const fileHandle = await handle.getFileHandle(fileName, { create: true });
      const writable   = await fileHandle.createWritable();
      await writable.write(jsonString);
      await writable.close();
    } catch (writeErr) {
      _updateTopbarBadge('error');
      _log('فشل كتابة الملف على القرص: ' + writeErr.message, 'error');
      if (!silent) throw writeErr;
      return null;
    }

    const rotation = await _rotateBackups(handle);

    const duration = Date.now() - startTime;
    const logEntry = {
      clinicId:     _clinicId,
      ts:           now.toISOString(),
      fileName,
      sizeBytes:    encodedSize,
      sizeMB:       (encodedSize / (1024 * 1024)).toFixed(3),
      durationMs:   duration,
      rotated:      rotation.deleted,
      status:       'success',
      target:       'local',
      nodeCount:    payload._meta.nodeCount,
      checksum:     payload._meta.checksum
    };

    try { await _idbAdd(STORE_LOG, logEntry); } catch (e) {
      console.warn('[ArgonBackup] تعذّر حفظ سجل النسخ:', e.message);
    }

    await _saveSettings({
      lastBackupAt:      now.toISOString(),
      lastBackupFile:    fileName,
      lastBackupSizeMB:  logEntry.sizeMB,
      lastBackupStatus:  'success',
      permissionOk:      true
    });

    _updateSidebarDot('ok');
    _updateTopbarBadge('ok');
    _log(`✅ نسخة محلية محفوظة: ${fileName} — ${logEntry.sizeMB} MB في ${duration}ms`, 'success');
    _emit('backup-success', logEntry);

    if (_panelOpen) setTimeout(() => _refreshPanel(), 200);

    return logEntry;
  }

  /* ════════════════════════════════════════
     10-B. ☁️ محرك النسخ السحابي — Cloud Engine (جديد بالكامل في v3.0)
  ════════════════════════════════════════ */

  /**
   * يرفع نص/كائن JSON كملف إلى Firebase Storage داخل مجلد العيادة
   * المسار: backups/{clinicId}/{fileName}
   *
   * @param {string} clinicId
   * @param {string|Blob} jsonBlob - نص JSON جاهز (أو Blob جاهز)
   * @param {string} fileName
   * @returns {Promise<{path:string, fileName:string, size:number}>}
   */
  async function uploadToCloud(clinicId, jsonBlob, fileName) {
    if (typeof firebase === 'undefined' || typeof firebase.storage !== 'function') {
      throw new Error('Firebase Storage SDK غير متاح. تأكد من تضمين firebase-storage-compat.js في الصفحة.');
    }
    const path = 'backups/' + String(clinicId) + '/' + fileName;

    // قبول نص JSON أو Blob جاهز (مرونة في الاستخدام)
    const blob = (jsonBlob instanceof Blob)
      ? jsonBlob
      : new Blob([typeof jsonBlob === 'string' ? jsonBlob : JSON.stringify(jsonBlob)], { type: 'application/json' });

    if (blob.size > MAX_CLOUD_FILE_SIZE_BYTES) {
      throw new Error('حجم النسخة (' + (blob.size / 1024 / 1024).toFixed(1) + 'MB) يتجاوز الحد الأقصى المسموح (50MB).');
    }

    const ref = firebase.storage().ref(path);
    const metadata = {
      contentType: 'application/json',
      customMetadata: {
        clinicId: String(clinicId),
        engine: 'ArgonHybridBackupEngine',
        engineVersion: VERSION
      }
    };

    try {
      await ref.put(blob, metadata);
    } catch (e) {
      throw new Error(_friendlyStorageError(e));
    }

    return { path, fileName, size: blob.size };
  }

  /**
   * يجلب قائمة كل ملفات النسخ السحابية الخاصة بعيادة معيّنة مع بياناتها الوصفية
   * @param {string} clinicId
   * @returns {Promise<Array<{name, fullPath, size, sizeMB, createdAt, isSafetySnapshot}>>}
   */
  async function fetchCloudBackups(clinicId) {
    if (typeof firebase === 'undefined' || typeof firebase.storage !== 'function') {
      throw new Error('Firebase Storage SDK غير متاح في هذه الصفحة.');
    }
    const folderRef = firebase.storage().ref('backups/' + String(clinicId));

    let list;
    try {
      list = await folderRef.listAll();
    } catch (e) {
      // مجلد العيادة قد لا يكون موجوداً بعد (لا توجد نسخ سحابية سابقاً) — هذا طبيعي وليس خطأ
      if (e && (e.code === 'storage/object-not-found')) return [];
      throw new Error(_friendlyStorageError(e));
    }

    const files = await Promise.all(list.items.map(async (itemRef) => {
      let meta = {};
      try { meta = await itemRef.getMetadata(); } catch (e) { /* تجاهل فشل قراءة Metadata لملف واحد */ }
      return {
        name: itemRef.name,
        fullPath: itemRef.fullPath,
        size: meta.size || 0,
        sizeMB: ((meta.size || 0) / (1024 * 1024)).toFixed(3),
        createdAt: meta.timeCreated || null,
        isSafetySnapshot: itemRef.name.startsWith(CLOUD_PRERESTORE_PREFIX)
      };
    }));

    files.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return files;
  }

  /** ترجمة أخطاء Firebase Storage الشائعة لرسائل عربية مفهومة */
  function _friendlyStorageError(e) {
    const code = (e && e.code) || '';
    const map = {
      'storage/unauthorized':   'ليس لديك صلاحية الوصول للنسخ السحابية. تحقق من قواعد الأمان (Storage Rules) أو فعّل الحماية المعززة (Tier 2).',
      'storage/canceled':       'تم إلغاء العملية.',
      'storage/quota-exceeded': 'تم تجاوز سعة التخزين السحابي المتاحة لهذا المشروع.',
      'storage/unauthenticated':'يجب تسجيل الدخول أولاً (Firebase Auth) قبل استخدام النسخ السحابي.',
      'storage/retry-limit-exceeded': 'فشل الاتصال بالسحابة بعد عدة محاولات — تحقق من الإنترنت.'
    };
    return map[code] || ('خطأ في الاتصال بالسحابة: ' + (e && e.message ? e.message : String(e)));
  }

  /**
   * يحذف الملفات الزائدة عن السقف المحدد ضمن بادئة معينة (الأقدم أولاً)
   * مساعد داخلي مشترك بين تدوير النسخ العادية ولقطات الأمان
   */
  async function _rotateCloudByPrefix(clinicId, prefix, maxCount) {
    if (typeof firebase === 'undefined' || typeof firebase.storage !== 'function') return { deleted: 0 };
    const folderRef = firebase.storage().ref('backups/' + String(clinicId));
    let list;
    try { list = await folderRef.listAll(); } catch (e) { return { deleted: 0 }; }

    const matching = list.items.filter(it => it.name.startsWith(prefix));
    // اسم الملف يحتوي تاريخ/وقت بصيغة قابلة للترتيب الأبجدي (YYYY-MM-DD_HH-MM-SS) → ترتيب تصاعدي = الأقدم أولاً
    matching.sort((a, b) => (a.name < b.name ? -1 : 1));

    const excess = Math.max(0, matching.length - maxCount);
    let deleted = 0;
    for (let i = 0; i < excess; i++) {
      try { await matching[i].delete(); deleted++; }
      catch (e) { console.warn('[ArgonBackup] فشل حذف نسخة سحابية قديمة:', matching[i].name, e.message); }
    }
    return { deleted };
  }

  /**
   * يحذف النسخ السحابية الزائدة عن 15 نسخة (الأقدم أولاً) — طلب الطرف الثالث
   * @param {string} clinicId
   */
  async function rotateCloudBackups(clinicId) {
    const result = await _rotateCloudByPrefix(clinicId, CLOUD_FILE_PREFIX, MAX_CLOUD_BACKUPS);
    if (result.deleted > 0) _log(`🗑️ تم حذف ${result.deleted} نسخة سحابية قديمة (تدوير تلقائي)`, 'rotate');
    return result;
  }

  /** تدوير لقطات الأمان (سقف منفصل وأصغر — 3 لقطات فقط) */
  async function _rotatePrerestoreSnapshots(clinicId) {
    return _rotateCloudByPrefix(clinicId, CLOUD_PRERESTORE_PREFIX, MAX_PRERESTORE_SNAPSHOTS);
  }

  /**
   * ينفذ دورة نسخ احتياطي سحابي كاملة (مكافئ لـ performBackup لكن للسحابة)
   * @param {boolean} silent
   * @param {string} [forcedPrefix] - استخدام داخلي: CLOUD_PRERESTORE_PREFIX عند أخذ لقطة أمان قبل الاستعادة
   * @returns {Promise<Object|null>} سجل العملية، يتضمن fileName المُستخدَم لاحقاً كنقطة استرجاع
   */
  async function performCloudBackup(silent, forcedPrefix) {
    silent = (silent !== false);

    if (!_clinicId) { _log('performCloudBackup: لا يوجد clinicId', 'error'); return null; }
    if (typeof firebase === 'undefined' || typeof firebase.storage !== 'function') {
      const msg = 'Firebase Storage SDK غير محمّل في هذه الصفحة.';
      if (!silent) throw new Error(msg);
      _log(msg, 'error');
      return null;
    }

    const startTime = Date.now();
    let payload;
    try {
      payload = await fetchClinicData(_clinicId);
    } catch (e) {
      _log('فشل جلب بيانات العيادة للنسخ السحابي: ' + e.message, 'error');
      if (!silent) throw e;
      return null;
    }

    const now      = new Date();
    const dateStr  = now.toISOString().slice(0, 10);
    const timeStr  = now.toTimeString().slice(0, 8).replace(/:/g, '-');
    const prefix   = forcedPrefix || CLOUD_FILE_PREFIX;
    const fileName = `${prefix}${_clinicId}_${dateStr}_${timeStr}${FILE_EXT}`;
    const jsonString = JSON.stringify(payload, null, 2);

    try {
      await uploadToCloud(_clinicId, jsonString, fileName);
    } catch (e) {
      _log('فشل رفع النسخة للسحابة: ' + e.message, 'error');
      if (prefix === CLOUD_FILE_PREFIX) _updateTopbarBadge('error');
      if (!silent) throw e;
      return null;
    }

    // التدوير التلقائي — فقط للنسخ الدورية العادية (لقطات الأمان لها تدويرها الخاص المُستقل)
    let rotation = { deleted: 0 };
    try {
      rotation = (prefix === CLOUD_FILE_PREFIX)
        ? await rotateCloudBackups(_clinicId)
        : await _rotatePrerestoreSnapshots(_clinicId);
    } catch (e) {
      console.warn('[ArgonBackup] فشل تدوير النسخ السحابية (غير حرج):', e.message);
    }

    const sizeBytes = new TextEncoder().encode(jsonString).length;
    const logEntry = {
      clinicId:   _clinicId,
      ts:         now.toISOString(),
      fileName,
      sizeBytes,
      sizeMB:     (sizeBytes / (1024 * 1024)).toFixed(3),
      durationMs: Date.now() - startTime,
      rotated:    rotation.deleted,
      status:     'success',
      target:     (prefix === CLOUD_FILE_PREFIX ? 'cloud' : 'cloud-safety'),
      nodeCount:  payload._meta.nodeCount,
      checksum:   payload._meta.checksum
    };

    try { await _idbAdd(STORE_LOG, logEntry); } catch (e) { /* غير حرج */ }

    if (prefix === CLOUD_FILE_PREFIX) {
      await _saveSettings({
        lastCloudBackupAt:     now.toISOString(),
        lastCloudBackupFile:   fileName,
        lastCloudBackupSizeMB: logEntry.sizeMB,
        lastCloudBackupStatus: 'success'
      });
      _log(`☁️✅ نسخة سحابية محفوظة: ${fileName} — ${logEntry.sizeMB} MB`, 'success');
      _emit('cloud-backup-success', logEntry);
      if (_panelOpen) setTimeout(() => _refreshPanel(), 200);
    } else {
      _log(`🛟 لقطة أمان سحابية قبل الاستعادة: ${fileName}`, 'info');
    }

    return logEntry;
  }

  /** بدء المحرك السحابي الصامت — مؤقت مستقل تماماً عن المحرك المحلي */
  function startCloudBackupEngine(clinicId, intervalMinutes) {
    _clinicId       = String(clinicId || _clinicId);
    intervalMinutes = parseInt(intervalMinutes) || DEFAULT_CLOUD_INTERVAL_MINUTES;

    stopCloudBackupEngine(); // منع تعدد المؤقتات (نفس نمط الحماية في المحرك المحلي)

    performCloudBackup(true).catch(e =>
      console.warn('[ArgonBackup] أول نسخة سحابية فشلت (صامت):', e.message)
    );

    const intervalMs = intervalMinutes * 60 * 1000;
    _cloudTimerRef = setInterval(async function _cloudBackupTick() {
      try { await performCloudBackup(true); }
      catch (e) { console.warn('[ArgonBackup] خطأ في الدورة السحابية التلقائية:', e.message); }
    }, intervalMs);

    _log(`☁️🟢 المحرك السحابي يعمل — كل ${intervalMinutes} دقيقة`, 'info');
    _emit('cloud-engine-started', { clinicId, intervalMinutes });
  }

  function stopCloudBackupEngine() {
    if (_cloudTimerRef !== null) {
      clearInterval(_cloudTimerRef);
      _cloudTimerRef = null;
      _emit('cloud-engine-stopped', { clinicId: _clinicId });
    }
  }

  /**
   * يُنزّل ملف نسخة سحابية إلى جهاز المستخدم (زر "📥 تحميل")
   * يستخدم تحويل Blob محلي لضمان التحميل الفعلي حتى عبر النطاقات المختلفة (Cross-Origin)
   * @param {string} fullPath - المسار الكامل داخل Storage (مثل backups/3/ARGON_BACKUP_...)
   * @param {string} [suggestedName]
   */
  async function downloadCloudBackup(fullPath, suggestedName) {
    if (typeof firebase === 'undefined' || typeof firebase.storage !== 'function') {
      throw new Error('Firebase Storage SDK غير متاح.');
    }
    const ref = firebase.storage().ref(fullPath);
    const url = await ref.getDownloadURL();

    const resp = await fetch(url);
    if (!resp.ok) throw new Error('فشل تحميل الملف: HTTP ' + resp.status);
    const blob = await resp.blob();

    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = suggestedName || fullPath.split('/').pop();
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    }, 1000);
  }

  /**
   * فحص سلامة وهوية ملف النسخة الاحتياطية قبل أي استعادة — خط الدفاع الأخير قبل الكتابة الفعلية
   * @param {Object} parsed - الكائن الناتج من JSON.parse لمحتوى الملف
   * @param {string} expectedClinicId - معرّف العيادة الحالية (المستهدفة بالاستعادة)
   * @returns {{ok: boolean, reason?: string}}
   */
  function _validateBackupPayloadShape(parsed, expectedClinicId) {
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, reason: 'الملف ليس بصيغة JSON صالحة.' };
    }
    if (!parsed._meta || !parsed.data) {
      return { ok: false, reason: 'بنية الملف غير متوافقة مع محرك آرغون للنسخ الاحتياطي (لا يحتوي _meta/data).' };
    }
    // ── حارس حرج: منع استعادة نسخة عيادة أخرى في عيادة مختلفة بالخطأ ──
    if (String(parsed._meta.clinicId) !== String(expectedClinicId)) {
      return {
        ok: false,
        reason: `🛑 هذا الملف يخص عيادة أخرى (ID: ${parsed._meta.clinicId}) وليس العيادة الحالية (ID: ${expectedClinicId}). تم إيقاف الاستعادة منعاً لدمج بيانات عيادتين مختلفتين.`
      };
    }
    // ── فحص سلامة المحتوى عبر checksum محفوظ وقت أخذ النسخة ──
    if (parsed._meta.checksum) {
      const recomputed = _simpleChecksum(JSON.stringify(parsed.data));
      if (recomputed !== parsed._meta.checksum) {
        return { ok: false, reason: '🛑 فشل فحص سلامة الملف (Checksum mismatch) — قد يكون الملف تالفاً أو مُعدّلاً يدوياً.' };
      }
    }
    if (typeof parsed.data !== 'object' || parsed.data === null || Object.keys(parsed.data).length === 0) {
      return { ok: false, reason: '🛑 الملف لا يحتوي على أي بيانات فعلية — تم إيقاف الاستعادة لحماية بياناتك الحالية من الحذف الكامل.' };
    }
    return { ok: true };
  }

  /**
   * 🛑 restoreFromCloud — العملية الأخطر في هذا المحرك بالكامل 🛑
   * تستبدل كامل بيانات العيادة الحيّة (clinics/{clinicId}) بمحتوى نسخة سحابية محددة.
   *
   * خطوات الأمان الإلزامية (لا يمكن تجاوز أي منها برمجياً):
   *   1) تحميل وفحص JSON.parse
   *   2) فحص الهوية + الـ checksum عبر _validateBackupPayloadShape (فشل = إيقاف فوري)
   *   3) أخذ لقطة أمان سحابية إلزامية مما هو موجود الآن — فشل هذه الخطوة = إيقاف العملية بالكامل (fail-closed)
   *   4) أخذ لقطة أمان محلية أيضاً (best-effort فقط، لا توقف العملية إن فشلت)
   *   5) الكتابة الفعلية في قاعدة البيانات الحيّة
   *   6) تنظيف عُقد الجلسات المؤقتة (active_logins/presence) لمنع أقفال تزامن وهمية بعد الاستعادة
   *   7) تسجيل العملية في السجل المحلي + سجل التدقيق العام للنظام (ArgonCore.logAudit إن وُجد)
   *
   * @param {string} fileRefOrUrl - مسار التخزين (fullPath) أو رابط تحميل مباشر (https://...)
   * @param {string} clinicId
   * @param {{onProgress?:Function, sourceFileName?:string}} [opts]
   * @returns {Promise<Object>} سجل العملية المكتملة
   */
  async function restoreFromCloud(fileRefOrUrl, clinicId, opts) {
    opts = opts || {};
    const notify = (msg) => { _log(msg, 'warn'); if (typeof opts.onProgress === 'function') { try { opts.onProgress(msg); } catch (e) {} } };
    const targetClinicId = String(clinicId || _clinicId);

    if (!targetClinicId) throw new Error('لم يتم تحديد معرّف العيادة المستهدفة بالاستعادة.');
    notify('⚠️ بدء عملية استعادة من السحابة — عملية حساسة وحرجة...');

    /* ── 1) تحميل الملف المطلوب ── */
    let downloadUrl = fileRefOrUrl;
    try {
      if (!/^https?:\/\//i.test(fileRefOrUrl)) {
        const ref = firebase.storage().ref(fileRefOrUrl);
        downloadUrl = await ref.getDownloadURL();
      }
    } catch (e) {
      throw new Error('تعذّر الوصول لملف النسخة الاحتياطية المطلوبة على السحابة: ' + _friendlyStorageError(e));
    }

    notify('⬇️ تحميل محتوى النسخة الاحتياطية...');
    let rawText;
    try {
      const resp = await fetch(downloadUrl);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      rawText = await resp.text();
    } catch (e) {
      throw new Error('فشل تحميل محتوى النسخة الاحتياطية: ' + e.message);
    }

    let parsed;
    try { parsed = JSON.parse(rawText); }
    catch (e) { throw new Error('🛑 الملف المُنزَّل ليس JSON صالحاً — تم إيقاف الاستعادة قبل أي تعديل.'); }

    /* ── 2) فحص السلامة والهوية (الحارس الأهم) ── */
    notify('🔍 فحص سلامة وهوية الملف...');
    const check = _validateBackupPayloadShape(parsed, targetClinicId);
    if (!check.ok) throw new Error(check.reason);

    /* ── 3) لقطة أمان سحابية إلزامية (fail-closed: فشلها = إيقاف العملية بالكامل) ── */
    notify('🛟 أخذ نسخة أمان سحابية من الوضع الحالي قبل أي استبدال...');
    let safetySnapshot;
    try {
      safetySnapshot = await performCloudBackup(true, CLOUD_PRERESTORE_PREFIX);
      if (!safetySnapshot) throw new Error('لم يتم إنشاء نسخة الأمان لسبب غير معروف.');
    } catch (e) {
      throw new Error('🛑 تعذّر إنشاء نسخة أمان قبل الاستعادة — تم إيقاف العملية بالكامل لحماية بياناتك الحالية. لم يتم تعديل أي شيء. السبب: ' + e.message);
    }

    /* ── 4) لقطة أمان محلية (best-effort — لا تُسقط العملية) ── */
    try { await performBackup(true); }
    catch (e) { console.warn('[ArgonBackup] فشل أخذ نسخة أمان محلية (غير حرج، تم تجاوزها):', e.message); }

    /* ── 5) الاستبدال الفعلي في قاعدة البيانات الحيّة ── */
    notify('💾 كتابة البيانات المستعادة في قاعدة البيانات الحيّة...');
    try {
      const dbRef = firebase.database().ref('clinics/' + targetClinicId);
      await dbRef.set(parsed.data);

      /* ── 6) تنظيف عُقد مؤقتة قد تصبح "أشباحاً" بعد استبدال شامل للبيانات ──
         active_logins: قد يحتوي قفل تزامن لجهاز لم يعد متصلاً فعلياً بعد الاستعادة
         presence: عدّاد "المتصفحين الآن" — لا قيمة لإبقائه بعد عملية كهذه */
      await firebase.database().ref('clinics/' + targetClinicId + '/active_logins').remove().catch(() => {});
      await firebase.database().ref('clinics/' + targetClinicId + '/presence').remove().catch(() => {});
    } catch (e) {
      throw new Error(
        '🛑 فشلت عملية الكتابة في قاعدة البيانات الحيّة: ' + e.message +
        ' — لم تُفقد بياناتك: نسخة الأمان محفوظة تحت اسم: ' + (safetySnapshot ? safetySnapshot.fileName : '—')
      );
    }

    /* ── 7) التسجيل في السجلات (المحلي + سجل التدقيق العام للنظام) ── */
    const logEntry = {
      clinicId:   targetClinicId,
      ts:         new Date().toISOString(),
      fileName:   opts.sourceFileName || fileRefOrUrl,
      target:     'restore',
      status:     'success',
      safetySnapshotFile: safetySnapshot ? safetySnapshot.fileName : null
    };
    try { await _idbAdd(STORE_LOG, logEntry); } catch (e) { /* غير حرج */ }

    if (typeof window.ArgonCore !== 'undefined' && window.ArgonCore.logAudit) {
      // ربط هذه العملية الحرجة بسجل التدقيق الطبي العام للنظام (استخدام قراءة فقط — لا تعديل على argon-core.js)
      window.ArgonCore.logAudit(
        'CLOUD_RESTORE_COMPLETED',
        'تمت استعادة كامل بيانات العيادة من نسخة سحابية: ' + (opts.sourceFileName || fileRefOrUrl) +
        ' (نسخة أمان محفوظة تلقائياً: ' + logEntry.safetySnapshotFile + ')',
        'BACKUP'
      );
    }

    notify('✅ تمت الاستعادة بنجاح!');
    _log('✅ تمت استعادة بيانات العيادة ' + targetClinicId + ' من السحابة بنجاح', 'success');
    _emit('restore-success', logEntry);

    return logEntry;
  }

  /**
   * Tier 2 (اختياري وموصى به) — ترقية الحماية من "أساسية" إلى "معززة حقيقية"
   * يستدعي Cloud Function اختيارية (mintClinicBackupToken) تتحقق من كلمة مرور العيادة
   * فعلياً على الخادم، ثم تُصدر Firebase Custom Auth Token يحمل صلاحية {clinicId}
   * مُضمَّنة بشكل لا يمكن للعميل تزويرها — بعدها تصبح قواعد Storage القائمة على
   * request.auth.token.clinicId قابلة للتطبيق فعلياً وبشكل آمن.
   *
   * إن لم تُنشَر الدالة بعد، تفشل هذه الوظيفة بأمان (graceful) ويستمر النظام
   * بالعمل بالحماية الأساسية (Tier 1) دون أي عطل.
   *
   * @param {string} clinicId
   * @param {string} password - كلمة مرور إدارة العيادة الحالية
   */
  async function enableSecureCloudAuth(clinicId, password) {
    if (typeof firebase === 'undefined' || typeof firebase.functions !== 'function') {
      throw new Error(
        'وظيفة الحماية المعززة (Tier 2) غير متاحة في هذه الصفحة.\n' +
        'يتطلب ذلك: (1) إضافة سكريبت firebase-functions-compat.js إلى dashboard.html، ' +
        '(2) نشر الدالة الموجودة في ملف cloud-backup-token-function.js.'
      );
    }
    let res;
    try {
      const fn = firebase.functions().httpsCallable('mintClinicBackupToken');
      res = await fn({ clinicId: String(clinicId), password: String(password) });
    } catch (e) {
      const code = (e && e.code) || '';
      if (code === 'functions/not-found' || code === 'not-found') {
        throw new Error('لم يتم نشر دالة الحماية المعززة (mintClinicBackupToken) على الخادم بعد. النظام يعمل حالياً بالحماية الأساسية.');
      }
      if (code === 'functions/permission-denied' || code === 'permission-denied') {
        throw new Error('❌ كلمة مرور العيادة غير صحيحة.');
      }
      throw new Error('فشل الاتصال بخدمة الحماية المعززة: ' + (e.message || code));
    }

    const token = res && res.data && res.data.token;
    if (!token) throw new Error('لم يُرجع الخادم رمز حماية صالحاً.');

    await firebase.auth().signInWithCustomToken(token);
    await _saveSettings({ secureAuthMode: 'token', secureAuthEnabledAt: new Date().toISOString() });

    if (typeof window.ArgonCore !== 'undefined' && window.ArgonCore.logAudit) {
      window.ArgonCore.logAudit('BACKUP_SECURITY_UPGRADED', 'تم تفعيل الحماية المعززة (Tier 2 Custom Token) للنسخ السحابي', 'SECURITY');
    }

    return true;
  }

  /* ════════════════════════════════════════
     11. المحرك الصامت المحلي — Background Engine (بدون تغيير)
  ════════════════════════════════════════ */

  function startSilentBackupEngine(clinicId, intervalMinutes) {
    _clinicId       = String(clinicId);
    intervalMinutes = parseInt(intervalMinutes) || 60;

    stopBackupEngine();

    performBackup(true).catch(e =>
      console.warn('[ArgonBackup] النسخة الأولية فشلت (صامت):', e.message)
    );

    const intervalMs = intervalMinutes * 60 * 1000;
    _timerRef  = setInterval(async function _backupTick() {
      try {
        await performBackup(true);
      } catch (e) {
        console.warn('[ArgonBackup] خطأ في الدورة التلقائية:', e.message);
        _updateTopbarBadge('error');
      }
    }, intervalMs);

    _isRunning = true;
    _log(`🟢 المحرك المحلي يعمل — كل ${intervalMinutes} دقيقة`, 'info');
    _emit('engine-started', { clinicId, intervalMinutes });
  }

  function stopBackupEngine() {
    if (_timerRef !== null) {
      clearInterval(_timerRef);
      _timerRef  = null;
      _isRunning = false;
      _emit('engine-stopped', { clinicId: _clinicId });
    }
  }

  /* ════════════════════════════════════════
     12. الحالة العامة — Public Status (مُوسَّعة بحقول السحابة)
  ════════════════════════════════════════ */

  async function getStatus() {
    const s = await _loadSettings();
    const browserSupported = typeof window.showDirectoryPicker === 'function';
    return {
      version:           VERSION,
      clinicId:          _clinicId,
      isRunning:         _isRunning,
      browserSupported,
      folderConfigured:  !!s.folderConfigured,
      folderName:        s.folderName   || null,
      permissionOk:      s.permissionOk !== false,
      lastBackupAt:      s.lastBackupAt || null,
      lastBackupFile:    s.lastBackupFile || null,
      lastBackupSizeMB:  s.lastBackupSizeMB || null,
      lastBackupStatus:  s.lastBackupStatus || null,
      intervalMinutes:   s.intervalMinutes || 60,
      configuredAt:      s.configuredAt || null,
      maxBackups:        MAX_BACKUPS,

      // ── حقول السحابة (جديد) ──
      cloudEnabled:          !!s.cloudEnabled,
      cloudIntervalMinutes:  s.cloudIntervalMinutes || DEFAULT_CLOUD_INTERVAL_MINUTES,
      secureAuthMode:        s.secureAuthMode === 'token' ? 'token' : 'basic',
      secureAuthEnabledAt:   s.secureAuthEnabledAt || null,
      lastCloudBackupAt:     s.lastCloudBackupAt || null,
      lastCloudBackupFile:   s.lastCloudBackupFile || null,
      lastCloudBackupSizeMB: s.lastCloudBackupSizeMB || null,
      lastCloudBackupStatus: s.lastCloudBackupStatus || null,
      maxCloudBackups:       MAX_CLOUD_BACKUPS
    };
  }

  async function getBackupLog(limit) {
    limit = limit || 10;
    try {
      const all = await _idbGetAllByIndex(STORE_LOG, 'idx_clinic', _clinicId);
      return all
        .sort(function (a, b) { return new Date(b.ts) - new Date(a.ts); })
        .slice(0, limit);
    } catch (e) {
      return [];
    }
  }

  /* ════════════════════════════════════════
     13. نظام الأحداث — Event Emitter (بدون تغيير)
  ════════════════════════════════════════ */
  const _listeners = {};
  function _on(event, fn)  {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(fn);
  }
  function _emit(event, data) {
    (_listeners[event] || []).forEach(function (fn) {
      try { fn(data); } catch (e) { /* عزل أخطاء المستمعين */ }
    });
  }

  /* ════════════════════════════════════════
     14. السجل الداخلي — Internal Logger (بدون تغيير)
  ════════════════════════════════════════ */
  function _log(msg, type) {
    const prefix = '[ArgonBackup]';
    if (type === 'error') console.error(prefix, msg);
    else if (type === 'success') console.log('%c' + prefix + ' ' + msg, 'color:#10b981;font-weight:bold');
    else if (type === 'warn') console.warn(prefix, msg);
    else console.log(prefix, msg);
  }

  /* ════════════════════════════════════════
     15. أنماط CSS — Injected Styles
     (أنماط v2.1 محفوظة كاملة + إضافات v3.0 لقسم السحابة في الأسفل)
  ════════════════════════════════════════ */

  function _injectStyles() {
    if (document.getElementById('argon-backup-css')) return;
    const s = document.createElement('style');
    s.id   = 'argon-backup-css';
    s.textContent = `
/* ══ ARGON HYBRID BACKUP ENGINE — Injected Styles ══ */

#abp-panel-overlay {
  position: fixed; inset: 0;
  background: rgba(3, 11, 10, 0.9);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  z-index: 9999990;
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
  font-family: 'Tajawal', sans-serif;
  direction: rtl;
  animation: abp-in .22s cubic-bezier(.16,1,.3,1);
}
@keyframes abp-in {
  from { opacity: 0; transform: scale(.96) translateY(8px); }
  to   { opacity: 1; transform: scale(1)  translateY(0); }
}

.abp-card {
  background: var(--panel, #0f172a);
  border: 1px solid var(--border, #334155);
  border-radius: 22px;
  padding: 30px 26px;
  width: 100%; max-width: 660px;
  max-height: 90vh; overflow-y: auto;
  box-shadow: 0 32px 80px rgba(0,0,0,.65);
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,.06) transparent;
}

.abp-header {
  display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid var(--border, #334155);
  padding-bottom: 16px; margin-bottom: 22px;
}
.abp-title {
  font-size: 1.2rem; font-weight: 900;
  color: var(--text, #f8fafc);
  display: flex; align-items: center; gap: 9px;
}
.abp-version-tag {
  font-size: .58rem; font-weight: 900; letter-spacing: 1px;
  background: linear-gradient(135deg, #0d9488, #0ea5e9);
  padding: 2px 8px; border-radius: 5px; color: #fff;
}
.abp-close-btn {
  background: rgba(239,68,68,.09); border: 1px solid rgba(239,68,68,.2);
  color: #fca5a5; border-radius: 8px; padding: 6px 14px;
  font-family: 'Tajawal', sans-serif; font-size: .83rem;
  cursor: pointer; transition: .2s;
}
.abp-close-btn:hover { background: rgba(239,68,68,.18); }

.abp-status-block {
  display: flex; align-items: flex-start; gap: 14px;
  padding: 15px 18px; border-radius: 13px;
  border: 1px solid; margin-bottom: 20px;
  transition: all .3s;
}
.abp-status-icon  { font-size: 2rem; flex-shrink: 0; line-height: 1; }
.abp-status-tag   { font-size: .68rem; font-weight: 700; opacity: .7; margin-bottom: 3px; text-transform: uppercase; letter-spacing: .5px; }
.abp-status-title { font-size: .97rem; font-weight: 800; }
.abp-status-sub   { font-size: .75rem; margin-top: 3px; opacity: .8; }
.abp-s-ok     { background: rgba(16,185,129,.06); border-color: rgba(16,185,129,.3); color: #10b981; }
.abp-s-warn   { background: rgba(245,158,11,.06); border-color: rgba(245,158,11,.3); color: #d97706; }
.abp-s-error  { background: rgba(239,68,68,.06);  border-color: rgba(239,68,68,.3);  color: #ef4444; }
.abp-s-idle   { background: rgba(100,116,139,.05);border-color: rgba(100,116,139,.25);color: #64748b; }

.abp-section { margin-bottom: 20px; }
.abp-section-title {
  font-size: .68rem; font-weight: 800;
  letter-spacing: 2px; text-transform: uppercase;
  color: var(--muted, #64748b);
  margin-bottom: 11px; padding-bottom: 6px;
  border-bottom: 1px dashed var(--border, #334155);
  display: flex; align-items: center; gap: 6px; justify-content: space-between;
}

.abp-folder-box {
  background: var(--surf, #1e293b);
  border: 1px solid var(--border, #334155);
  border-radius: 12px; padding: 13px 16px;
  display: flex; align-items: center; gap: 12px;
  margin-bottom: 12px;
}
.abp-folder-icon  { font-size: 1.7rem; flex-shrink: 0; }
.abp-folder-name  { font-weight: 800; font-size: .93rem; color: var(--text, #f8fafc); }
.abp-folder-label { font-size: .7rem; color: var(--muted, #64748b); margin-top: 2px; }
.abp-folder-empty {
  background: rgba(245,158,11,.04);
  border: 1px dashed rgba(245,158,11,.35);
  border-radius: 12px; padding: 18px;
  text-align: center; color: #fcd34d;
  margin-bottom: 12px;
}

.abp-btn {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 9px 17px; border-radius: 10px;
  font-family: 'Tajawal', sans-serif; font-weight: 700;
  font-size: .86rem; cursor: pointer; transition: .2s;
  border: 1px solid; white-space: nowrap;
}
.abp-btn:disabled { opacity: .5; cursor: not-allowed !important; transform: none !important; }
.abp-btn-primary {
  background: linear-gradient(135deg, #0d9488, #0ea5e9);
  border-color: transparent; color: #fff;
}
.abp-btn-primary:not(:disabled):hover { opacity: .88; transform: translateY(-1px); }
.abp-btn-ghost {
  background: var(--surf, #1e293b);
  border-color: var(--border, #334155);
  color: var(--text, #f8fafc);
}
.abp-btn-ghost:not(:disabled):hover { border-color: rgba(13,148,136,.45); }
.abp-btn-now {
  background: rgba(16,185,129,.1);
  border-color: rgba(16,185,129,.3);
  color: #10b981;
}
.abp-btn-danger {
  background: rgba(239,68,68,.12);
  border-color: rgba(239,68,68,.4);
  color: #fca5a5;
}
.abp-btn-danger:not(:disabled):hover { background: rgba(239,68,68,.22); }
.abp-btn-sm { padding: 5px 11px; font-size: .74rem; border-radius: 8px; }
.abp-btns-row { display: flex; gap: 8px; flex-wrap: wrap; }

.abp-intervals { display: flex; gap: 7px; flex-wrap: wrap; }
.abp-iv-btn, .abp-civ-btn {
  padding: 6px 14px; border-radius: 20px;
  font-family: 'Tajawal', sans-serif; font-weight: 700;
  font-size: .78rem; cursor: pointer; transition: .2s;
  background: var(--surf, #1e293b);
  border: 1.5px solid var(--border, #334155);
  color: var(--muted, #64748b);
}
.abp-iv-btn:hover, .abp-civ-btn:hover  { border-color: rgba(13,148,136,.4); color: #5eead4; }
.abp-iv-btn.active, .abp-civ-btn.active {
  background: rgba(13,148,136,.15);
  border-color: rgba(13,148,136,.55);
  color: #5eead4;
}

.abp-stats-grid {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 9px; margin-bottom: 4px;
}
.abp-stat-card {
  background: var(--surf, #1e293b);
  border: 1px solid var(--border, #334155);
  border-radius: 10px; padding: 12px;
  text-align: center;
}
.abp-stat-label { font-size: .63rem; color: var(--muted, #64748b); margin-bottom: 5px; }
.abp-stat-value {
  font-weight: 800; font-size: .85rem;
  font-family: 'IBM Plex Mono', monospace;
  color: var(--text, #f8fafc);
}

.abp-log-table { width: 100%; border-collapse: collapse; font-size: .78rem; }
.abp-log-table th {
  text-align: right; padding: 7px 10px;
  background: var(--surf, #1e293b);
  color: var(--muted, #64748b);
  font-weight: 700; font-size: .67rem; letter-spacing: .5px;
}
.abp-log-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border, #334155);
  color: var(--text, #f8fafc);
  vertical-align: middle;
}
.abp-log-table tbody tr:hover td { background: rgba(255,255,255,.025); }

.abp-browser-warn {
  background: rgba(245,158,11,.07);
  border: 1px solid rgba(245,158,11,.28);
  border-radius: 10px; padding: 13px 15px;
  color: #fcd34d; font-size: .8rem; line-height: 1.7;
  margin-bottom: 16px;
}

.abp-security-note {
  background: rgba(13,148,136,.04);
  border: 1px solid rgba(13,148,136,.14);
  border-radius: 10px; padding: 13px 15px;
  font-size: .76rem; color: var(--muted, #64748b);
  line-height: 1.85; margin-top: 6px;
}
.abp-security-note strong { color: #5eead4; }

/* ══ v3.0 — قسم السحابة ══ */
.abp-tier-badge {
  font-size: .64rem; font-weight: 800; padding: 3px 9px;
  border-radius: 20px; display: inline-flex; align-items: center; gap: 4px;
  white-space: nowrap;
}
.abp-tier-1 { background: rgba(245,158,11,.12); color: #fcd34d; border: 1px solid rgba(245,158,11,.3); }
.abp-tier-2 { background: rgba(16,185,129,.12); color: #5eead4; border: 1px solid rgba(16,185,129,.35); }

.abp-cloud-empty {
  text-align: center; padding: 22px; color: var(--muted, #64748b);
  font-size: .82rem; background: var(--surf, #1e293b);
  border: 1px dashed var(--border, #334155); border-radius: 10px;
}

.abp-cloud-disabled-box {
  background: rgba(100,116,139,.05);
  border: 1px solid var(--border, #334155);
  border-radius: 12px; padding: 16px;
}
.abp-cloud-disclosure {
  background: rgba(245,158,11,.05);
  border: 1px solid rgba(245,158,11,.25);
  border-radius: 10px; padding: 12px 14px;
  font-size: .76rem; color: #fcd34d; line-height: 1.75;
  margin: 12px 0;
}
.abp-ack-row {
  display: flex; align-items: flex-start; gap: 9px;
  font-size: .78rem; color: var(--text, #f8fafc);
  margin: 12px 0; cursor: pointer; line-height: 1.6;
}
.abp-ack-row input { margin-top: 3px; width: 16px; height: 16px; flex-shrink: 0; cursor: pointer; accent-color: #0d9488; }

.abp-restore-box {
  background: rgba(239,68,68,.06);
  border: 2px solid rgba(239,68,68,.4);
  border-radius: 14px; padding: 18px;
  margin-bottom: 14px;
}
.abp-restore-title { font-weight: 900; color: #fca5a5; font-size: 1rem; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
.abp-restore-file { font-family: 'IBM Plex Mono', monospace; background: var(--surf,#1e293b); padding: 8px 12px; border-radius: 8px; font-size: .8rem; color: #fcd34d; margin-bottom: 12px; word-break: break-all; }
.abp-restore-input {
  width: 100%; background: var(--surf, #1e293b);
  border: 1.5px solid rgba(239,68,68,.4); border-radius: 9px;
  padding: 10px 13px; color: var(--text, #f8fafc);
  font-family: 'IBM Plex Mono', monospace; font-size: .82rem;
  outline: none; margin-bottom: 10px; direction: ltr; text-align: left;
}
.abp-restore-input:focus { border-color: #ef4444; }
.abp-restore-progress { font-size: .78rem; color: #5eead4; margin-top: 10px; min-height: 18px; font-weight: 700; }

#abp-sidebar-btn {
  display: flex; align-items: center; gap: 9px;
  padding: 10px 14px; margin: 1px 6px;
  border-radius: 9px; cursor: pointer;
  color: var(--muted, #64748b);
  font-size: .86rem; font-weight: 500;
  transition: .2s; border: none; background: none;
  font-family: 'Tajawal', sans-serif;
  direction: rtl; width: calc(100% - 12px);
  text-align: right;
}
#abp-sidebar-btn:hover { background: rgba(255,255,255,.025); color: var(--text, #f8fafc); }
#abp-sidebar-btn .abp-dot {
  margin-right: auto; width: 8px; height: 8px;
  border-radius: 50%; flex-shrink: 0; transition: .3s;
}
.abp-dot-ok    { background: #10b981; box-shadow: 0 0 7px rgba(16,185,129,.7); }
.abp-dot-warn  { background: #d97706; box-shadow: 0 0 7px rgba(217,119,6,.7); }
.abp-dot-error { background: #ef4444; box-shadow: 0 0 7px rgba(239,68,68,.7); }
.abp-dot-idle  { background: #475569; }
@keyframes abp-pulse { 0%,100%{opacity:1} 50%{opacity:.45} }
.abp-dot-ok.abp-anim { animation: abp-pulse 2s infinite; }

#abp-topbar-badge {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: .67rem; font-weight: 700;
  padding: 4px 10px; border-radius: 20px;
  border: 1px solid; cursor: pointer;
  transition: background .3s, color .3s;
  font-family: 'Tajawal', sans-serif;
  white-space: nowrap;
}

#abp-firstrun-wizard {
  position: fixed; bottom: 24px; left: 24px;
  z-index: 9999980;
  background: var(--panel, #0f172a);
  border: 1px solid rgba(13,148,136,.45);
  border-radius: 18px; padding: 20px 22px;
  max-width: 330px; width: calc(100% - 32px);
  box-shadow: 0 18px 50px rgba(0,0,0,.55);
  font-family: 'Tajawal', sans-serif;
  direction: rtl;
  animation: abp-in .4s cubic-bezier(.16,1,.3,1);
}

#abp-perm-toast {
  position: fixed; top: 68px; right: 16px;
  z-index: 9999970;
  background: rgba(245,158,11,.92);
  color: #000; border-radius: 10px;
  padding: 11px 16px; font-weight: 700;
  font-size: .83rem; font-family: 'Tajawal', sans-serif;
  direction: rtl; max-width: 320px;
  box-shadow: 0 8px 24px rgba(0,0,0,.3);
  animation: abp-in .3s ease;
  cursor: pointer;
}
`;
    document.head.appendChild(s);
  }

  /* ════════════════════════════════════════
     16. واجهة المستخدم — UI Components (بدون تغيير)
  ════════════════════════════════════════ */

  function _injectTopbarBadge() {
    if (document.getElementById('abp-topbar-badge')) return;
    const topbarRight = document.querySelector('.topbar .tr');
    if (!topbarRight) return;

    const badge = document.createElement('span');
    badge.id    = 'abp-topbar-badge';
    badge.title = 'النسخ الاحتياطي (محلي + سحابي) — انقر للإعدادات';
    badge.addEventListener('click', function () { showPanel(); });
    topbarRight.prepend(badge);
    _updateTopbarBadge('idle');
  }

  function _injectSidebarButton() {
    if (document.getElementById('abp-sidebar-btn')) return;
    const sidebar = document.querySelector('.sidebar');
    const footer  = sidebar ? sidebar.querySelector('.royal-foot') : null;
    if (!footer) return;

    const btn = document.createElement('button');
    btn.id    = 'abp-sidebar-btn';
    btn.innerHTML = `
      <i class="fas fa-hard-drive" style="width:16px;text-align:center;font-size:.83rem;flex-shrink:0"></i>
      <span>النسخ الاحتياطي</span>
      <span class="abp-dot abp-dot-idle" title="حالة المحرك"></span>
    `;
    btn.addEventListener('click', function () { showPanel(); });
    sidebar.insertBefore(btn, footer);
  }

  function _updateSidebarDot(state) {
    const dot = document.querySelector('#abp-sidebar-btn .abp-dot');
    if (!dot) return;
    dot.className = 'abp-dot ' + ({
      ok:      'abp-dot-ok abp-anim',
      running: 'abp-dot-ok abp-anim',
      warn:    'abp-dot-warn',
      error:   'abp-dot-error',
      idle:    'abp-dot-idle'
    }[state] || 'abp-dot-idle');
  }

  function _updateTopbarBadge(state) {
    const el = document.getElementById('abp-topbar-badge');
    if (!el) return;
    const M = {
      ok:      { bg: 'rgba(16,185,129,.1)',   bd: 'rgba(16,185,129,.3)', cl: '#10b981', txt: '🟢 محمي' },
      running: { bg: 'rgba(14,165,233,.1)',   bd: 'rgba(14,165,233,.3)', cl: '#38bdf8', txt: '⏳ جارٍ الحفظ' },
      warn:    { bg: 'rgba(245,158,11,.1)',   bd: 'rgba(245,158,11,.3)', cl: '#fcd34d', txt: '⚠️ انتهت الصلاحية' },
      error:   { bg: 'rgba(239,68,68,.1)',    bd: 'rgba(239,68,68,.3)',  cl: '#fca5a5', txt: '🔴 خطأ' },
      idle:    { bg: 'rgba(100,116,139,.1)',  bd: 'rgba(100,116,139,.3)',cl: '#94a3b8', txt: '⚫ غير مُعدّ' }
    };
    const m = M[state] || M.idle;
    el.style.background  = m.bg;
    el.style.borderColor = m.bd;
    el.style.color       = m.cl;
    el.textContent       = m.txt;
  }

  function _showPermissionExpiredToast() {
    if (document.getElementById('abp-perm-toast')) return;
    const t = document.createElement('div');
    t.id = 'abp-perm-toast';
    t.innerHTML = '⚠️ <b>انتهت صلاحية مجلد النسخ الاحتياطي</b> — انقر هنا لإعادة التفعيل';
    t.addEventListener('click', function () { t.remove(); showPanel(); });
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.remove(); }, 12000);
  }

  /* ════════════════════════════════════════
     17. لوحة الإعدادات الكاملة — Full Panel
     (مُوسَّعة بقسم السحابة الكامل + واجهة تأكيد الاستعادة)
  ════════════════════════════════════════ */

  async function showPanel() {
    _injectStyles();
    _panelOpen = true;

    const old = document.getElementById('abp-panel-overlay');
    if (old) old.remove();
    const wiz = document.getElementById('abp-firstrun-wizard');
    if (wiz) wiz.remove();

    const status = await getStatus();
    const log    = await getBackupLog(8);
    let cloudFiles = [];
    if (status.cloudEnabled) {
      try { cloudFiles = await fetchCloudBackups(_clinicId); _cloudFilesCache = cloudFiles; }
      catch (e) { console.warn('[ArgonBackup] فشل جلب قائمة النسخ السحابية:', e.message); }
    }

    const overlay = document.createElement('div');
    overlay.id    = 'abp-panel-overlay';
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) _closePanel();
    });

    overlay.innerHTML = _buildPanelHTML(status, log, cloudFiles);
    document.body.appendChild(overlay);
    _bindPanelEvents(overlay, status);
  }

  function _closePanel() {
    _panelOpen = false;
    _pendingRestoreTarget = null;
    const el = document.getElementById('abp-panel-overlay');
    if (el) el.remove();
  }

  async function _refreshPanel() {
    if (!_panelOpen) return;
    const old = document.getElementById('abp-panel-overlay');
    if (!old) { _panelOpen = false; return; }
    const status = await getStatus();
    const log    = await getBackupLog(8);
    const card   = old.querySelector('.abp-card');
    if (card) card.innerHTML = _buildPanelContent(status, log, _cloudFilesCache);
    _bindPanelEvents(old, status);
  }

  /** يُعاد جلب قائمة النسخ السحابية من الخادم ثم يُعاد رسم اللوحة (زر "🔄 تحديث القائمة") */
  async function _refreshCloudList() {
    if (!_panelOpen || !_clinicId) return;
    _cloudListLoading = true;
    await _refreshPanel(); // إظهار حالة التحميل أولاً
    try {
      _cloudFilesCache = await fetchCloudBackups(_clinicId);
    } catch (e) {
      if (typeof window.toast === 'function') window.toast('❌ ' + e.message, 'err');
    }
    _cloudListLoading = false;
    await _refreshPanel();
  }

  function _buildPanelHTML(status, log, cloudFiles) {
    return `<div class="abp-card">${_buildPanelContent(status, log, cloudFiles)}</div>`;
  }

  function _buildPanelContent(status, log, cloudFiles) {
    cloudFiles = cloudFiles || [];

    /* ── حالة الحماية المحلية ── */
    let sClass, sIcon, sTitle, sSub;
    if (!status.browserSupported) {
      sClass = 'abp-s-warn'; sIcon = '⚠️';
      sTitle = 'النسخ المحلي غير مدعوم في هذا المتصفح';
      sSub   = 'يتطلب Chrome أو Edge 86+ — لكن النسخ السحابي ☁️ يعمل في أي متصفح';
    } else if (!status.folderConfigured) {
      sClass = 'abp-s-idle'; sIcon = '📂';
      sTitle = 'النسخ المحلي غير مُعدّ بعد';
      sSub   = 'اختر مجلداً على جهازك لبدء حماية البيانات محلياً';
    } else if (!status.permissionOk) {
      sClass = 'abp-s-warn'; sIcon = '🔒';
      sTitle = 'انتهت صلاحية الوصول لمجلد الحفظ المحلي';
      sSub   = 'انقر "تغيير المجلد" وأعد اختياره لتفعيل الحماية المحلية';
    } else {
      sClass = 'abp-s-ok'; sIcon = '🛡️';
      sTitle = 'بياناتك محمية محلياً — المحرك يعمل';
      sSub   = status.lastBackupAt
        ? 'آخر نسخة محلية: ' + new Date(status.lastBackupAt).toLocaleString('ar-JO', {dateStyle:'short', timeStyle:'short'})
        : 'جارٍ إعداد أول نسخة...';
    }

    const logRows = log.length ? log.map(function (l) {
      const targetTag = { local:'💻 محلي', cloud:'☁️ سحابي', 'cloud-safety':'🛟 أمان', restore:'♻️ استعادة' }[l.target] || '—';
      return `<tr>
        <td>${new Date(l.ts).toLocaleString('ar-JO', {dateStyle:'short', timeStyle:'short'})}</td>
        <td style="font-size:.71rem">${targetTag}</td>
        <td style="font-family:'IBM Plex Mono',monospace;font-size:.7rem;color:#94a3b8;direction:ltr">${(l.fileName||'').slice(-26)}</td>
        <td style="font-family:'IBM Plex Mono',monospace">${l.sizeMB || '—'}</td>
        <td style="color:#10b981;font-weight:700">${l.status === 'success' ? '✓' : '✗'}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="5" style="text-align:center;padding:18px;color:var(--muted)">لا يوجد سجل بعد</td></tr>`;

    const ivs = [15, 30, 60, 120, 360, 720];
    const ivBtns = ivs.map(function (m) {
      const active = status.intervalMinutes === m ? ' active' : '';
      const lbl    = m < 60 ? m + ' دقيقة' : (m / 60) + ' ساعة';
      return `<button class="abp-iv-btn${active}" data-min="${m}" onclick="LocalBackupEngine._changeInterval(${m})">${lbl}</button>`;
    }).join('');

    const lastTime  = status.lastBackupAt
      ? new Date(status.lastBackupAt).toLocaleTimeString('ar-JO', {hour:'2-digit', minute:'2-digit'}) : '—';
    const lastSize  = status.lastBackupSizeMB ? status.lastBackupSizeMB + ' MB' : '—';

    return `
      <div class="abp-header">
        <div class="abp-title">
          <span>💾☁️</span>
          النسخ الاحتياطي الهجين
          <span class="abp-version-tag">v${VERSION}</span>
        </div>
        <button class="abp-close-btn" onclick="LocalBackupEngine._closePanel()">✕ إغلاق</button>
      </div>

      ${!status.browserSupported ? `
        <div class="abp-browser-warn">
          ⚠️ <strong>تنبيه:</strong> النسخ المحلي على القرص يتطلب
          <strong>Google Chrome أو Microsoft Edge إصدار 86 أو أحدث.</strong>
          النسخ الاحتياطي السحابي ☁️ في الأسفل غير متأثر ويعمل في جميع المتصفحات.
        </div>` : ''}

      <!-- ═══ القسم المحلي ═══ -->
      <div class="abp-status-block ${sClass}">
        <span class="abp-status-icon">${sIcon}</span>
        <div>
          <div class="abp-status-tag">حالة الحماية المحلية (القرص الصلب)</div>
          <div class="abp-status-title">${sTitle}</div>
          <div class="abp-status-sub">${sSub}</div>
        </div>
      </div>

      <div class="abp-section">
        <div class="abp-section-title">📂 مجلد الحفظ المحلي على جهازك</div>

        ${status.folderConfigured
          ? `<div class="abp-folder-box">
               <span class="abp-folder-icon">🗂️</span>
               <div style="flex:1;min-width:0">
                 <div class="abp-folder-name">${_esc(status.folderName || 'مجلد محدد')}</div>
                 <div class="abp-folder-label">النسخ تُحفظ تلقائياً في هذا المجلد بصيغة JSON</div>
               </div>
             </div>`
          : `<div class="abp-folder-empty">
               <div style="font-size:1.8rem;margin-bottom:6px">📂</div>
               <div style="font-weight:700;margin-bottom:4px">لم يتم اختيار مجلد بعد</div>
               <div style="font-size:.77rem;opacity:.8">اضغط الزر أدناه واختر أي مجلد على جهازك أو قرص خارجي</div>
             </div>`}

        <div class="abp-btns-row">
          <button class="abp-btn abp-btn-primary" id="abp-choose-btn" ${!status.browserSupported ? 'disabled' : ''}>
            <i class="fas fa-folder-open"></i>
            ${status.folderConfigured ? 'تغيير المجلد' : 'اختيار مجلد الحفظ'}
          </button>
          ${status.folderConfigured ? `
            <button class="abp-btn abp-btn-now" id="abp-now-btn">
              <i class="fas fa-save"></i> نسخ محلي الآن
            </button>` : ''}
        </div>
      </div>

      ${status.folderConfigured ? `
        <div class="abp-section">
          <div class="abp-section-title">⏱️ فترة النسخ المحلي التلقائي</div>
          <div class="abp-intervals">${ivBtns}</div>
        </div>

        <div class="abp-section">
          <div class="abp-section-title">📊 إحصائيات الحماية المحلية</div>
          <div class="abp-stats-grid">
            <div class="abp-stat-card">
              <div class="abp-stat-label">آخر نسخة</div>
              <div class="abp-stat-value" style="font-size:.78rem">${lastTime}</div>
            </div>
            <div class="abp-stat-card">
              <div class="abp-stat-label">حجم آخر ملف</div>
              <div class="abp-stat-value">${lastSize}</div>
            </div>
            <div class="abp-stat-card">
              <div class="abp-stat-label">الاحتفاظ بـ</div>
              <div class="abp-stat-value">${MAX_BACKUPS} نسخ</div>
            </div>
          </div>
        </div>` : ''}

      <!-- ═══ القسم السحابي (جديد v3.0) ═══ -->
      ${_buildCloudSectionHTML(status, cloudFiles)}

      <!-- ═══ سجل كل العمليات (محلي + سحابي + استعادة) ═══ -->
      <div class="abp-section">
        <div class="abp-section-title">📋 سجل آخر العمليات (الكل)</div>
        <div style="border:1px solid var(--border,#334155);border-radius:10px;overflow:hidden">
          <table class="abp-log-table">
            <thead><tr><th>التاريخ والوقت</th><th>النوع</th><th>الملف</th><th>الحجم</th><th>الحالة</th></tr></thead>
            <tbody>${logRows}</tbody>
          </table>
        </div>
      </div>

      <div class="abp-security-note">
        <div style="color:#5eead4;font-weight:800;margin-bottom:7px">🔐 معلومات أمنية مهمة:</div>
        <div>• النسخ المحلية تُحفظ <strong>مباشرةً</strong> على قرصك — لا تُرسَل لأي خادم</div>
        <div>• النسخ السحابية تُرفع إلى Firebase Storage الخاص بمشروعكم فقط</div>
        <div>• يُحتفَظ تلقائياً بآخر <strong>${MAX_BACKUPS} نسخ محلية</strong> و <strong>${MAX_CLOUD_BACKUPS} نسخة سحابية</strong></div>
        <div>• عملية "الاستعادة" تأخذ نسخة أمان إلزامية تلقائياً قبل أي استبدال للبيانات</div>
      </div>
    `;
  }

  /** يبني HTML قسم النسخ السحابي بالكامل (يُستدعى من _buildPanelContent) */
  function _buildCloudSectionHTML(status, cloudFiles) {
    const tierBadge = status.secureAuthMode === 'token'
      ? `<span class="abp-tier-badge abp-tier-2"><i class="fas fa-shield-alt"></i> حماية معززة (Tier 2)</span>`
      : `<span class="abp-tier-badge abp-tier-1"><i class="fas fa-exclamation-triangle"></i> حماية أساسية (Tier 1)</span>`;

    /* ── حالة "السحابة غير مفعّلة" ── */
    if (!status.cloudEnabled) {
      return `
        <div class="abp-section">
          <div class="abp-section-title">☁️ النسخ الاحتياطي السحابي (Disaster Recovery)</div>
          <div class="abp-cloud-disabled-box">
            <div style="font-size:.85rem;color:var(--text,#f8fafc);margin-bottom:6px;font-weight:700">
              💡 لماذا تفعيل النسخ السحابي؟
            </div>
            <div style="font-size:.79rem;color:var(--muted,#64748b);line-height:1.7;margin-bottom:10px">
              يضمن استعادة بيانات العيادة بالكامل من أي مكان في العالم في حال تلف أو سرقة جهاز العيادة —
              حتى لو لم يكن مجلد النسخ المحلي مُعدّاً.
            </div>
            <div class="abp-cloud-disclosure">
              ⚠️ <strong>إفصاح أمني مطلوب قبل التفعيل:</strong> النظام الحالي يستخدم تسجيل دخول مجهول
              (Anonymous Auth)، لذلك فإن العزل بين بيانات العيادات المختلفة على مستوى التخزين السحابي
              يعتمد حالياً على حماية <strong>"أساسية" (Tier 1)</strong> فقط — وهي ليست عزلاً تاماً مضموناً 100%.
              للحصول على عزل حقيقي مضمون، يلزم تفعيل <strong>"الحماية المعززة" (Tier 2)</strong> من القسم
              أدناه بعد التفعيل (تتطلب خطوة نشر بسيطة من المطوّر).
            </div>
            <label class="abp-ack-row">
              <input type="checkbox" id="abp-cloud-ack">
              <span>أتفهم طبيعة الحماية الأساسية المذكورة أعلاه، وأرغب بتفعيل النسخ السحابي الآن (يمكن ترقية الحماية لاحقاً في أي وقت)</span>
            </label>
            <button class="abp-btn abp-btn-primary" id="abp-cloud-enable-btn" disabled>
              <i class="fas fa-cloud-upload-alt"></i> تفعيل النسخ الاحتياطي السحابي
            </button>
          </div>
        </div>`;
    }

    /* ── واجهة تأكيد الاستعادة (تظهر بدل الجدول عند اختيار ملف) ── */
    if (_pendingRestoreTarget) {
      const t = _pendingRestoreTarget;
      return `
        <div class="abp-section">
          <div class="abp-section-title">☁️ النسخ الاحتياطي السحابي ${tierBadge}</div>
          <div class="abp-restore-box">
            <div class="abp-restore-title">🛑 تأكيد عملية الاستعادة (خطر — لا يمكن التراجع التلقائي)</div>
            <div style="font-size:.82rem;color:var(--text,#f8fafc);line-height:1.75;margin-bottom:10px">
              أنت على وشك استبدال <strong>كامل</strong> بيانات هذه العيادة (المرضى، الحجوزات، الفواتير، كل شيء)
              بمحتوى النسخة الاحتياطية التالية. سيقوم النظام تلقائياً بأخذ نسخة أمان من الوضع الحالي
              <strong>قبل</strong> التنفيذ — لكن أي تغييرات حصلت <strong>بعد</strong> تاريخ هذه النسخة سيتم فقدانها.
            </div>
            <div class="abp-restore-file">📄 ${_esc(t.name)}</div>
            <label style="font-size:.76rem;color:var(--muted,#64748b);display:block;margin-bottom:6px">
              اكتب اسم الملف أعلاه <strong>بالضبط</strong> للتأكيد:
            </label>
            <input type="text" class="abp-restore-input" id="abp-restore-confirm-input"
                   placeholder="${_esc(t.name)}" oninput="LocalBackupEngine._updateRestoreBtnState()" autocomplete="off">
            <label class="abp-ack-row">
              <input type="checkbox" id="abp-restore-ack" onchange="LocalBackupEngine._updateRestoreBtnState()">
              <span>أؤكد أنني أفهم أن هذا سيستبدل كل البيانات الحالية للعيادة بشكل نهائي، وأن النظام سيأخذ نسخة أمان تلقائية قبل التنفيذ</span>
            </label>
            <div class="abp-btns-row">
              <button class="abp-btn abp-btn-danger" id="abp-restore-execute-btn" disabled onclick="LocalBackupEngine._confirmAndRestore()">
                <i class="fas fa-triangle-exclamation"></i> تنفيذ الاستعادة الآن
              </button>
              <button class="abp-btn abp-btn-ghost" onclick="LocalBackupEngine._cancelRestoreTarget()">
                <i class="fas fa-xmark"></i> إلغاء والرجوع
              </button>
            </div>
            <div class="abp-restore-progress" id="abp-restore-progress"></div>
          </div>
        </div>`;
    }

    /* ── الحالة العادية: السحابة مفعّلة — عرض الجدول والأزرار ── */
    const civs = [60, 180, 360, 720, 1440];
    const civBtns = civs.map(function (m) {
      const active = status.cloudIntervalMinutes === m ? ' active' : '';
      const lbl = m < 60 ? m + ' د' : (m / 60) + ' س';
      return `<button class="abp-civ-btn${active}" onclick="LocalBackupEngine._changeCloudInterval(${m})">${lbl}</button>`;
    }).join('');

    const cloudRows = cloudFiles.length ? cloudFiles.map(function (f) {
      const dt = f.createdAt ? new Date(f.createdAt).toLocaleString('ar-JO', {dateStyle:'short', timeStyle:'short'}) : '—';
      const safetyTag = f.isSafetySnapshot ? ' <span style="font-size:.62rem;color:#fcd34d">🛟 أمان</span>' : '';
      const safePath = f.fullPath.replace(/'/g, "\\'");
      const safeName = f.name.replace(/'/g, "\\'");
      return `<tr>
        <td>${dt}${safetyTag}</td>
        <td style="font-family:'IBM Plex Mono',monospace">${f.sizeMB} MB</td>
        <td>
          <div class="abp-btns-row">
            <button class="abp-btn abp-btn-ghost abp-btn-sm" onclick="LocalBackupEngine._downloadCloudFile('${safePath}','${safeName}')">📥 تحميل</button>
            <button class="abp-btn abp-btn-danger abp-btn-sm" onclick="LocalBackupEngine._selectRestoreTarget('${safePath}','${safeName}')">🔄 استرجاع (خطر)</button>
          </div>
        </td>
      </tr>`;
    }).join('') : `<tr><td colspan="3" style="text-align:center;padding:16px;color:var(--muted)">${_cloudListLoading ? 'جارٍ التحميل...' : 'لا توجد نسخ سحابية بعد'}</td></tr>`;

    const lastCloudTime = status.lastCloudBackupAt
      ? new Date(status.lastCloudBackupAt).toLocaleString('ar-JO', {dateStyle:'short', timeStyle:'short'}) : '—';

    return `
      <div class="abp-section">
        <div class="abp-section-title">
          <span>☁️ النسخ الاحتياطي السحابي (Disaster Recovery)</span>
          ${tierBadge}
        </div>

        <div class="abp-stats-grid" style="margin-bottom:12px">
          <div class="abp-stat-card">
            <div class="abp-stat-label">آخر نسخة سحابية</div>
            <div class="abp-stat-value" style="font-size:.74rem">${lastCloudTime}</div>
          </div>
          <div class="abp-stat-card">
            <div class="abp-stat-label">عدد النسخ المحفوظة</div>
            <div class="abp-stat-value">${_cloudFilesCache.filter(f=>!f.isSafetySnapshot).length} / ${MAX_CLOUD_BACKUPS}</div>
          </div>
          <div class="abp-stat-card">
            <div class="abp-stat-label">الفترة التلقائية</div>
            <div class="abp-stat-value" style="font-size:.74rem">${status.cloudIntervalMinutes < 60 ? status.cloudIntervalMinutes+' د' : (status.cloudIntervalMinutes/60)+' س'}</div>
          </div>
        </div>

        <div style="font-size:.72rem;color:var(--muted,#64748b);margin-bottom:8px;font-weight:700">⏱️ فترة الرفع التلقائي للسحابة:</div>
        <div class="abp-intervals" style="margin-bottom:14px">${civBtns}</div>

        <div class="abp-btns-row" style="margin-bottom:14px">
          <button class="abp-btn abp-btn-now" id="abp-cloud-now-btn"><i class="fas fa-cloud-arrow-up"></i> رفع نسخة سحابية الآن</button>
          <button class="abp-btn abp-btn-ghost" id="abp-cloud-refresh-btn" onclick="LocalBackupEngine._refreshCloudList()"><i class="fas fa-rotate"></i> تحديث القائمة</button>
          ${status.secureAuthMode !== 'token' ? `<button class="abp-btn abp-btn-ghost" onclick="LocalBackupEngine._triggerSecureUpgrade()"><i class="fas fa-lock"></i> ترقية الحماية (موصى به)</button>` : ''}
        </div>

        <div style="border:1px solid var(--border,#334155);border-radius:10px;overflow:hidden">
          <table class="abp-log-table">
            <thead><tr><th>التاريخ والوقت</th><th>الحجم</th><th>الإجراءات</th></tr></thead>
            <tbody>${cloudRows}</tbody>
          </table>
        </div>
      </div>`;
  }

  /* ── ربط أحداث اللوحة (مُوسَّع لربط أزرار السحابة الجديدة) ── */
  function _bindPanelEvents(overlay, status) {
    /* زر اختيار / تغيير المجلد المحلي */
    const chooseBtn = overlay.querySelector('#abp-choose-btn');
    if (chooseBtn) {
      chooseBtn.addEventListener('click', async function () {
        chooseBtn.disabled = true;
        chooseBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> جارٍ الاختيار...';
        try {
          await requestDirectoryAccess();
          const s   = await _loadSettings();
          const ivM = parseInt(s.intervalMinutes) || 60;
          startSilentBackupEngine(_clinicId, ivM);
          setTimeout(function () { _refreshPanel(); }, 400);
        } catch (e) {
          if (e.name !== 'AbortError') alert('❌ تعذّر اختيار المجلد:\n' + e.message);
          chooseBtn.disabled = false;
          chooseBtn.innerHTML = '<i class="fas fa-folder-open"></i> اختيار مجلد الحفظ';
        }
      });
    }

    /* زر النسخ المحلي الفوري */
    const nowBtn = overlay.querySelector('#abp-now-btn');
    if (nowBtn) {
      nowBtn.addEventListener('click', async function () {
        nowBtn.disabled = true;
        nowBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> جارٍ الحفظ...';
        try {
          await performBackup(false);
          nowBtn.innerHTML = '<i class="fas fa-check"></i> تم بنجاح!';
          setTimeout(function () { _refreshPanel(); }, 700);
        } catch (e) {
          alert('❌ فشل النسخ:\n' + e.message);
          nowBtn.disabled = false;
          nowBtn.innerHTML = '<i class="fas fa-save"></i> نسخ محلي الآن';
        }
      });
    }

    /* زر تفعيل السحابة (في حالة عدم التفعيل) */
    const ackBox = overlay.querySelector('#abp-cloud-ack');
    const enableBtn = overlay.querySelector('#abp-cloud-enable-btn');
    if (ackBox && enableBtn) {
      ackBox.addEventListener('change', function () { enableBtn.disabled = !ackBox.checked; });
      enableBtn.addEventListener('click', function () { _setCloudEnabled(true); });
    }

    /* زر الرفع السحابي الفوري */
    const cloudNowBtn = overlay.querySelector('#abp-cloud-now-btn');
    if (cloudNowBtn) {
      cloudNowBtn.addEventListener('click', async function () {
        cloudNowBtn.disabled = true;
        cloudNowBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> جارٍ الرفع...';
        try {
          await performCloudBackup(false);
          cloudNowBtn.innerHTML = '<i class="fas fa-check"></i> تم!';
          _cloudFilesCache = await fetchCloudBackups(_clinicId).catch(() => _cloudFilesCache);
          setTimeout(function () { _refreshPanel(); }, 600);
        } catch (e) {
          alert('❌ فشل الرفع السحابي:\n' + e.message);
          cloudNowBtn.disabled = false;
          cloudNowBtn.innerHTML = '<i class="fas fa-cloud-arrow-up"></i> رفع نسخة سحابية الآن';
        }
      });
    }
  }

  /* ── تغيير الفترة المحلية (يُستدعى من HTML) ── */
  async function _changeInterval(minutes) {
    await _saveSettings({ intervalMinutes: minutes });
    startSilentBackupEngine(_clinicId, minutes);
    document.querySelectorAll('.abp-iv-btn').forEach(function (b) {
      b.classList.toggle('active', parseInt(b.dataset.min) === minutes);
    });
    if (typeof window.toast === 'function') {
      window.toast('✅ تم تغيير فترة النسخ المحلي إلى ' + (minutes < 60 ? minutes + ' دقيقة' : (minutes / 60) + ' ساعة'), 'ok');
    }
  }

  /* ── تغيير الفترة السحابية (يُستدعى من HTML) ── */
  async function _changeCloudInterval(minutes) {
    await _saveSettings({ cloudIntervalMinutes: minutes });
    if (_settings.cloudEnabled) startCloudBackupEngine(_clinicId, minutes);
    if (typeof window.toast === 'function') {
      window.toast('✅ تم تغيير فترة الرفع السحابي إلى ' + (minutes < 60 ? minutes + ' دقيقة' : (minutes / 60) + ' ساعة'), 'ok');
    }
    _refreshPanel();
  }

  /* ── تفعيل/تعطيل النسخ السحابي بالكامل (يُستدعى من HTML) ── */
  async function _setCloudEnabled(enable) {
    const ivMin = _settings.cloudIntervalMinutes || DEFAULT_CLOUD_INTERVAL_MINUTES;
    await _saveSettings({ cloudEnabled: !!enable, cloudIntervalMinutes: ivMin });

    if (enable) {
      startCloudBackupEngine(_clinicId, ivMin);
      if (typeof window.toast === 'function') window.toast('☁️ تم تفعيل النسخ الاحتياطي السحابي', 'ok');
    } else {
      stopCloudBackupEngine();
      if (typeof window.toast === 'function') window.toast('⏸️ تم تعطيل النسخ الاحتياطي السحابي', 'ok');
    }
    await _refreshPanel();
  }

  /* ── اختيار ملف للاستعادة (يفتح واجهة التأكيد) ── */
  function _selectRestoreTarget(fullPath, name) {
    _pendingRestoreTarget = { fullPath, name };
    _refreshPanel();
  }

  function _cancelRestoreTarget() {
    _pendingRestoreTarget = null;
    _refreshPanel();
  }

  /* ── تحديث حالة (تفعيل/تعطيل) زر تنفيذ الاستعادة حسب اكتمال شرطي التأكيد ── */
  function _updateRestoreBtnState() {
    const input = document.getElementById('abp-restore-confirm-input');
    const ack   = document.getElementById('abp-restore-ack');
    const btn   = document.getElementById('abp-restore-execute-btn');
    if (!input || !ack || !btn || !_pendingRestoreTarget) return;
    btn.disabled = !(input.value.trim() === _pendingRestoreTarget.name && ack.checked);
  }

  /* ── تنفيذ الاستعادة الفعلي بعد التأكيد (الزر الأحمر داخل صندوق التحذير) ── */
  async function _confirmAndRestore() {
    if (!_pendingRestoreTarget || _restoreInProgress) return;
    const target = _pendingRestoreTarget;
    const btn = document.getElementById('abp-restore-execute-btn');
    const progressEl = document.getElementById('abp-restore-progress');
    const setProgress = (msg) => { if (progressEl) progressEl.textContent = msg; };

    _restoreInProgress = true;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> جارٍ التنفيذ...'; }
    setProgress('⏳ جارٍ البدء...');

    try {
      await restoreFromCloud(target.fullPath, _clinicId, {
        sourceFileName: target.name,
        onProgress: setProgress
      });
      setProgress('✅ تمت الاستعادة بنجاح! يُنصح بشدة بتحديث الصفحة الآن لضمان تزامن كل الشاشات.');
      if (btn) {
        btn.outerHTML = '<button class="abp-btn abp-btn-primary" onclick="window.location.reload()"><i class="fas fa-rotate-right"></i> تحديث الصفحة الآن</button>';
      }
      _pendingRestoreTarget = null;
    } catch (e) {
      setProgress('❌ فشلت الاستعادة: ' + e.message);
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-triangle-exclamation"></i> تنفيذ الاستعادة الآن'; }
    } finally {
      _restoreInProgress = false;
    }
  }

  /* ── تحميل ملف سحابي (زر "📥 تحميل") ── */
  async function _downloadCloudFile(fullPath, name) {
    try {
      await downloadCloudBackup(fullPath, name);
    } catch (e) {
      alert('❌ فشل التحميل:\n' + e.message);
    }
  }

  /* ── ترقية الحماية إلى Tier 2 (يُستدعى من HTML) — نفس نمط prompt() المستخدم في dashboard.html ── */
  async function _triggerSecureUpgrade() {
    const password = prompt('🔐 لترقية الحماية إلى المستوى المعزز (Tier 2)، أدخل كلمة مرور إدارة العيادة الحالية:');
    if (!password) return;
    try {
      await enableSecureCloudAuth(_clinicId, password);
      if (typeof window.toast === 'function') {
        window.toast('🔐 تم ترقية الحماية بنجاح! النسخ السحابي الآن معزول بشكل حقيقي بين العيادات.', 'ok');
      }
      _refreshPanel();
    } catch (e) {
      alert('❌ فشل ترقية الحماية:\n' + e.message);
    }
  }

  /* ── زر النسخ السحابي الفوري عند استدعائه من خارج اللوحة (اختياري) ── */
  async function _triggerCloudBackupNow() {
    try { await performCloudBackup(false); if (typeof window.toast === 'function') window.toast('☁️ تم رفع نسخة سحابية بنجاح', 'ok'); }
    catch (e) { if (typeof window.toast === 'function') window.toast('❌ ' + e.message, 'err'); }
  }

  /* ════════════════════════════════════════
     18. معالج أول تشغيل — First-Run Wizard (بدون تغيير)
  ════════════════════════════════════════ */

  function _showFirstRunWizard() {
    if (!_settings || _settings.folderConfigured) return;
    if (typeof window.showDirectoryPicker !== 'function') return;
    if (document.getElementById('abp-firstrun-wizard')) return;

    _injectStyles();
    const wiz = document.createElement('div');
    wiz.id = 'abp-firstrun-wizard';
    wiz.innerHTML = `
      <button onclick="document.getElementById('abp-firstrun-wizard').remove()"
        style="position:absolute;top:10px;left:13px;background:none;border:none;
               color:var(--muted,#64748b);cursor:pointer;font-size:1rem;padding:2px">✕</button>
      <div style="display:flex;align-items:center;gap:11px;margin-bottom:13px">
        <span style="font-size:2rem;line-height:1">💾</span>
        <div>
          <div style="font-weight:900;font-size:1rem;color:var(--text,#f8fafc)">حماية بياناتك أولوية</div>
          <div style="font-size:.73rem;color:var(--muted,#64748b);margin-top:1px">إعداد النسخ الاحتياطي (محلي + سحابي)</div>
        </div>
      </div>
      <div style="font-size:.8rem;color:var(--muted,#64748b);line-height:1.75;margin-bottom:14px">
        لم يتم بعد إعداد النسخ الاحتياطي لهذه العيادة.
        احمِ بيانات مرضاك بنسخ تلقائية <strong style="color:#5eead4">محلية وسحابية</strong>.
      </div>
      <div style="display:flex;gap:8px">
        <button id="abp-wiz-setup"
          style="flex:1;background:linear-gradient(135deg,#0d9488,#0ea5e9);
                 border:none;border-radius:10px;padding:10px;color:#fff;
                 font-family:'Tajawal',sans-serif;font-weight:800;font-size:.87rem;cursor:pointer">
          <i class="fas fa-shield-alt"></i> إعداد الحماية الآن
        </button>
        <button onclick="document.getElementById('abp-firstrun-wizard').remove()"
          style="background:var(--surf,#1e293b);border:1px solid var(--border,#334155);
                 border-radius:10px;padding:10px 13px;color:var(--muted,#64748b);
                 font-family:'Tajawal',sans-serif;cursor:pointer;font-size:.82rem">
          لاحقاً
        </button>
      </div>
    `;
    document.body.appendChild(wiz);

    document.getElementById('abp-wiz-setup').addEventListener('click', function () {
      wiz.remove();
      showPanel();
    });
  }

  /* ════════════════════════════════════════
     19. حقن عناصر الواجهة — UI Injection (بدون تغيير)
  ════════════════════════════════════════ */

  function _injectUI() {
    _injectSidebarButton();
    _injectTopbarBadge();
  }

  function _onDOMReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  /* ════════════════════════════════════════
     20. نقطة الدخول الرئيسية — init()
     (مُوسَّعة: تُعيد أيضاً تشغيل المحرك السحابي إن كان مُفعَّلاً سابقاً)
  ════════════════════════════════════════ */

  async function init(clinicId) {
    if (!clinicId) {
      console.error('[ArgonBackup] ❌ init() يتطلب clinicId');
      return;
    }

    _clinicId = String(clinicId);
    _injectStyles();
    await _openDB();

    _onDOMReady(_injectUI);

    const s = await _loadSettings();

    // ── إعادة تشغيل المحرك السحابي تلقائياً إن كان المستخدم فعّله في جلسة سابقة ──
    if (s.cloudEnabled) {
      startCloudBackupEngine(_clinicId, s.cloudIntervalMinutes || DEFAULT_CLOUD_INTERVAL_MINUTES);
    }

    if (!s.folderConfigured) {
      _updateSidebarDot('idle');
      _updateTopbarBadge('idle');
      setTimeout(_showFirstRunWizard, FIRST_RUN_DELAY_MS);
      _log('أول تشغيل (محلي) — في انتظار إعداد المجلد. السحابة: ' + (s.cloudEnabled ? 'مفعّلة' : 'غير مفعّلة'), 'info');
      return;
    }

    try {
      const handle = await _loadHandle();
      if (handle) {
        _dirHandle = handle;
        const permOk = await _queryPermissionSilent(handle);

        if (permOk) {
          const ivMin = parseInt(s.intervalMinutes) || 60;
          startSilentBackupEngine(_clinicId, ivMin);
          _updateSidebarDot('ok');
          _updateTopbarBadge('ok');
          _log(`✅ المحرك المحلي مُستعاد — "${s.folderName}" — كل ${ivMin} دقيقة`, 'success');
        } else {
          await _saveSettings({ permissionOk: false });
          _updateSidebarDot('warn');
          _updateTopbarBadge('warn');
          _log('⚠️ الصلاحية المحلية تحتاج تجديداً — يرجى النقر على الزر', 'info');
          setTimeout(_showPermissionExpiredToast, 2000);
        }
      } else {
        _updateSidebarDot('idle');
        _updateTopbarBadge('idle');
        _log('لا يوجد مقبض محفوظ رغم وجود إعدادات — يرجى إعادة الإعداد', 'info');
      }
    } catch (e) {
      _updateSidebarDot('error');
      _updateTopbarBadge('error');
      console.error('[ArgonBackup] فشل استعادة المحرك المحلي:', e);
    }
  }

  /* ════════════════════════════════════════
     مساعد: Escape HTML لمنع XSS (بدون تغيير)
  ════════════════════════════════════════ */
  function _esc(str) {
    return String(str || '').replace(/[<>"'&]/g, function (c) {
      return ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' })[c];
    });
  }

  /* ════════════════════════════════════════
     21. الواجهة العامة — Public API
     (كل دوال v2.1 محفوظة + إضافات السحابة الجديدة)
  ════════════════════════════════════════ */
  return {
    /** نقطة الدخول الرئيسية — يُستدعى بعد تسجيل الدخول (بدون تغيير في طريقة الاستدعاء) */
    init,

    /** فتح لوحة إعدادات النسخ الاحتياطي */
    showPanel,

    // ── محلي (v2.1 — بدون تغيير) ──
    _closePanel,
    _changeInterval,
    performBackup,
    requestDirectoryAccess,
    fetchClinicData,
    startSilentBackupEngine,
    stopBackupEngine,
    getStatus,
    getBackupLog,

    // ── سحابي (جديد v3.0) ──
    uploadToCloud,
    fetchCloudBackups,
    rotateCloudBackups,
    performCloudBackup,
    restoreFromCloud,
    downloadCloudBackup,
    startCloudBackupEngine,
    stopCloudBackupEngine,
    enableSecureCloudAuth,
    _setCloudEnabled,
    _changeCloudInterval,
    _refreshCloudList,
    _selectRestoreTarget,
    _cancelRestoreTarget,
    _updateRestoreBtnState,
    _confirmAndRestore,
    _downloadCloudFile,
    _triggerSecureUpgrade,
    _triggerCloudBackupNow,

    /** الاستماع للأحداث: backup-success, cloud-backup-success, restore-success, engine-started, permission-revoked... */
    on: _on,

    get version() { return VERSION; },
    get isRunning() { return _isRunning; }
  };

})();
