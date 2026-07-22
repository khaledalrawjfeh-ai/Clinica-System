/**
 * ARGON MEDICAL OS — Patient Pagination Engine v2.0
 * محرك التحميل المتدرج للمرضى
 *
 * يحل مشكلة: تحميل 50,000 مريض دفعة واحدة في الذاكرة
 * الحل: 30 مريض لكل صفحة + بحث server-side
 *
 * الاستخدام:
 *   window.ArgonPager = new ArgonPatientPager(db, BASE);
 *   await ArgonPager.init();
 *   await ArgonPager.search('أحمد');
 *   await ArgonPager.loadNextPage();
 */

'use strict';

class ArgonPatientPager {

  constructor(db, basePath, options = {}) {
    this._db       = db;
    this._base     = basePath;
    this._patientsRef = db.ref(`${basePath}/patients`);

    /* إعدادات */
    this._pageSize    = options.pageSize    || 30;
    this._searchLimit = options.searchLimit || 25;

    /* الحالة */
    this._cursor      = null;   // آخر key محمّل — لـ pagination
    this._exhausted   = false;  // لا يوجد المزيد
    this._mode        = 'browse';  // browse | search
    this._searchQuery = '';
    this._searchField = 'info/name';

    /* الكاش المحلي — { uid: patientData } */
    this.cache = {};

    /* Callbacks */
    this.onPageLoaded  = null;  // (patientsMap, isFirstPage) => void
    this.onPatientUpdated = null;  // (uid, newData | null) => void
    this.onLoadingChange = null;   // (isLoading) => void
    this.onError = null;           // (error) => void

    /* الـ listeners النشطة */
    this._liveListeners = {};
    this._isLoading = false;

    /* IndexedDB cache للسرعة الفائقة */
    this._idb = null;
    this._initIDB();
  }

  /* ════════════════════════════════════════════
   * التهيئة — التحميل الأول
   * ════════════════════════════════════════════ */
  async init() {
    this._setLoading(true);
    try {
      /* محاولة تحميل من IndexedDB أولاً (فوري) */
      const cached = await this._loadFromIDB();
      if (cached && Object.keys(cached).length > 0) {
        this.cache = cached;
        this._notifyPageLoaded(cached, true);
        this._setLoading(false);
        /* ثم نحدّث من الشبكة في الخلفية */
        this._refreshFromNetwork();
      } else {
        await this._fetchPage(null, true);
      }
      this._attachLiveListeners();
    } catch(e) {
      this._handleError(e);
    } finally {
      this._setLoading(false);
    }
  }

  /* ════════════════════════════════════════════
   * تحميل الصفحة التالية
   * ════════════════════════════════════════════ */
  async loadNextPage() {
    if (this._exhausted || this._isLoading || this._mode !== 'browse') return false;
    this._setLoading(true);
    try {
      const loaded = await this._fetchPage(this._cursor, false);
      return loaded;
    } catch(e) {
      this._handleError(e);
      return false;
    } finally {
      this._setLoading(false);
    }
  }

  /* ════════════════════════════════════════════
   * البحث server-side
   * ════════════════════════════════════════════ */
  async search(query, options = {}) {
    if (!query || query.trim().length < 2) {
      /* عودة لوضع البراوز */
      return this._resetToFirstPage();
    }

    const q = query.trim();
    this._searchQuery = q;
    this._mode = 'search';
    this._setLoading(true);

    try {
      const results = {};

      /* بحث بالاسم */
      const byName = await this._searchByField('info/name', q);
      Object.assign(results, byName);

      /* إذا كان البحث أرقاماً → ابحث بالهاتف والرقم الوطني */
      if (/^\d+/.test(q)) {
        const cleanPhone = this._cleanPhone(q);
        const byPhone = await this._searchByField('info/phone', cleanPhone);
        Object.assign(results, byPhone);

        if (q.length >= 7) {
          const byNID = await this._searchByExact('info/nationalId', q);
          Object.assign(results, byNID);
        }
      }

      /* البحث بـ MRN */
      if (q.startsWith('JOR-') || q.startsWith('MRN-')) {
        const byMRN = await this._searchByExact('info/mrn', q);
        Object.assign(results, byMRN);
      }

      /* دمج مع الكاش المحلي (للمرضى المحمّلين مسبقاً) */
      const localResults = this._searchLocalCache(q);
      Object.assign(results, localResults);

      this._notifyPageLoaded(results, true);
      return Object.keys(results).length;

    } catch(e) {
      this._handleError(e);
      return 0;
    } finally {
      this._setLoading(false);
    }
  }

  /* ════════════════════════════════════════════
   * إعادة الضبط — العودة لأول صفحة
   * ════════════════════════════════════════════ */
  async resetToFirstPage() {
    return this._resetToFirstPage();
  }

  /* ════════════════════════════════════════════
   * الحصول على مريض واحد (بالـ UID)
   * ════════════════════════════════════════════ */
  async getPatient(uid) {
    /* من الكاش أولاً */
    if (this.cache[uid]) return this.cache[uid];

    /* من Firebase */
    const snap = await this._db.ref(`${this._base}/patients/${uid}`).once('value');
    if (snap.exists()) {
      const data = { id: uid, ...snap.val() };
      this.cache[uid] = data;
      return data;
    }
    return null;
  }

  /* ════════════════════════════════════════════
   * إلغاء جميع الـ listeners
   * ════════════════════════════════════════════ */
  destroy() {
    Object.values(this._liveListeners).forEach(off => { try { off(); } catch(_) {} });
    this._liveListeners = {};
  }

  /* ════════════════════════════════════════════
   * Getters
   * ════════════════════════════════════════════ */
  get hasMore()    { return !this._exhausted && this._mode === 'browse'; }
  get isLoading()  { return this._isLoading; }
  get totalCached(){ return Object.keys(this.cache).length; }
  get isSearchMode(){ return this._mode === 'search'; }

  /* ════════════════════════════════════════════
   * الـ listeners للتحديثات الفورية
   * ════════════════════════════════════════════ */
  _attachLiveListeners() {
    /* استمع لتغيّرات المرضى المحمّلين فقط */
    const changedRef = this._patientsRef;

    this._liveListeners.changed = changedRef.on('child_changed', snap => {
      if (this.cache[snap.key]) {
        const updated = { id: snap.key, ...snap.val() };
        this.cache[snap.key] = updated;
        this._saveToIDB(snap.key, updated);
        if (this.onPatientUpdated) this.onPatientUpdated(snap.key, updated);
      }
    }, err => { /* ignore - reconnect handles */ });

    this._liveListeners.removed = changedRef.on('child_removed', snap => {
      if (this.cache[snap.key]) {
        delete this.cache[snap.key];
        this._removeFromIDB(snap.key);
        if (this.onPatientUpdated) this.onPatientUpdated(snap.key, null);
      }
    }, err => {});

    /* المرضى الجدد — يُضاف للكاش فوراً للواجهة الحية */
    let _isInitAdded = true;
    setTimeout(() => { _isInitAdded = false; }, 3000);

    this._liveListeners.added = changedRef
      .orderByKey()
      .limitToLast(1)  /* استمع للمريض الجديد الأخير فقط */
      .on('child_added', snap => {
        if (_isInitAdded) return;  /* تجاهل المرضى الموجودين مسبقاً */
        const data = { id: snap.key, ...snap.val() };
        this.cache[snap.key] = data;
        this._saveToIDB(snap.key, data);
        if (this.onPatientUpdated) this.onPatientUpdated(snap.key, data);
      }, err => {});
  }

  /* ════════════════════════════════════════════
   * تحميل صفحة من Firebase
   * ════════════════════════════════════════════ */
  async _fetchPage(afterKey, isFirst) {
    let query = this._patientsRef
      .orderByKey()
      .limitToFirst(this._pageSize + 1);  /* +1 للتحقق إذا يوجد المزيد */

    if (afterKey) {
      query = this._patientsRef
        .orderByKey()
        .startAfter(afterKey)
        .limitToFirst(this._pageSize + 1);
    }

    const snap = await query.once('value');
    const raw = snap.val();

    if (!raw) {
      this._exhausted = true;
      if (isFirst) this._notifyPageLoaded({}, true);
      return 0;
    }

    const keys = Object.keys(raw);
    const hasMore = keys.length > this._pageSize;
    const pageKeys = hasMore ? keys.slice(0, this._pageSize) : keys;

    if (!hasMore) this._exhausted = true;

    const pageData = {};
    pageKeys.forEach(k => {
      const p = { id: k, ...raw[k] };
      this.cache[k] = p;
      pageData[k] = p;
    });

    /* آخر key للصفحة التالية */
    if (hasMore) this._cursor = pageKeys[pageKeys.length - 1];

    /* حفظ في IndexedDB */
    this._saveBatchToIDB(pageData);

    this._notifyPageLoaded(pageData, isFirst);
    return pageKeys.length;
  }

  /* ════════════════════════════════════════════
   * تحديث من الشبكة في الخلفية
   * ════════════════════════════════════════════ */
  async _refreshFromNetwork() {
    try {
      await this._fetchPage(null, false);
    } catch(e) { /* صامت */ }
  }

  /* ════════════════════════════════════════════
   * بحث بحقل معين (prefix search)
   * ════════════════════════════════════════════ */
  async _searchByField(field, query) {
    try {
      const snap = await this._patientsRef
        .orderByChild(field)
        .startAt(query)
        .endAt(query + '\uf8ff')
        .limitToFirst(this._searchLimit)
        .once('value');

      const raw = snap.val() || {};
      const results = {};
      Object.entries(raw).forEach(([k, v]) => {
        const p = { id: k, ...v };
        this.cache[k] = p;  /* تحديث الكاش */
        results[k] = p;
      });
      return results;
    } catch(e) {
      /* الحقل غير مفهرس — ابحث محلياً */
      return {};
    }
  }

  /* ════════════════════════════════════════════
   * بحث بقيمة مطابقة تماماً
   * ════════════════════════════════════════════ */
  async _searchByExact(field, value) {
    try {
      const snap = await this._patientsRef
        .orderByChild(field)
        .equalTo(value)
        .limitToFirst(10)
        .once('value');

      const raw = snap.val() || {};
      const results = {};
      Object.entries(raw).forEach(([k, v]) => {
        const p = { id: k, ...v };
        this.cache[k] = p;
        results[k] = p;
      });
      return results;
    } catch(e) {
      return {};
    }
  }

  /* ════════════════════════════════════════════
   * بحث محلي في الكاش
   * ════════════════════════════════════════════ */
  _searchLocalCache(query) {
    const q = query.toLowerCase();
    const results = {};
    Object.entries(this.cache).forEach(([uid, p]) => {
      const info = p.info || {};
      const matchName  = (info.name  || '').toLowerCase().includes(q);
      const matchPhone = (info.phone || '').includes(q);
      const matchNID   = (info.nationalId || '').includes(q);
      const matchMRN   = (info.mrn   || '').toLowerCase().includes(q);
      if (matchName || matchPhone || matchNID || matchMRN) results[uid] = p;
    });
    return results;
  }

  /* ════════════════════════════════════════════
   * إعادة ضبط كاملة
   * ════════════════════════════════════════════ */
  async _resetToFirstPage() {
    this._mode     = 'browse';
    this._cursor   = null;
    this._exhausted = false;
    this._searchQuery = '';
    this.cache = {};
    this._setLoading(true);
    try {
      await this._fetchPage(null, true);
    } finally {
      this._setLoading(false);
    }
  }

  /* ════════════════════════════════════════════
   * IndexedDB — كاش محلي سريع
   * ════════════════════════════════════════════ */
  _initIDB() {
    if (!window.indexedDB) return;
    try {
      const req = window.indexedDB.open('ArgonPatientsCache_v1', 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('patients')) {
          db.createObjectStore('patients', { keyPath: 'id' });
        }
      };
      req.onsuccess = e => { this._idb = e.target.result; };
      req.onerror = () => { /* IDB غير متاح */ };
    } catch(e) {}
  }

  async _loadFromIDB() {
    if (!this._idb) return null;
    return new Promise(resolve => {
      try {
        const tx  = this._idb.transaction('patients', 'readonly');
        const req = tx.objectStore('patients').getAll();
        req.onsuccess = e => {
          const arr = e.target.result || [];
          if (!arr.length) { resolve(null); return; }
          const map = {};
          arr.forEach(p => { map[p.id] = p; });
          resolve(map);
        };
        req.onerror = () => resolve(null);
      } catch(e) { resolve(null); }
    });
  }

  _saveBatchToIDB(patients) {
    if (!this._idb) return;
    try {
      const tx    = this._idb.transaction('patients', 'readwrite');
      const store = tx.objectStore('patients');
      Object.values(patients).forEach(p => store.put(p));
    } catch(e) {}
  }

  _saveToIDB(uid, patient) {
    if (!this._idb) return;
    try {
      const tx = this._idb.transaction('patients', 'readwrite');
      tx.objectStore('patients').put(patient);
    } catch(e) {}
  }

  _removeFromIDB(uid) {
    if (!this._idb) return;
    try {
      const tx = this._idb.transaction('patients', 'readwrite');
      tx.objectStore('patients').delete(uid);
    } catch(e) {}
  }

  /* ════════════════════════════════════════════
   * Helpers
   * ════════════════════════════════════════════ */
  _cleanPhone(p) {
    let c = String(p || '').replace(/\D/g, '');
    if (c.startsWith('962')) c = c.substring(3);
    if (c.startsWith('0'))   c = c.substring(1);
    return c;
  }

  _setLoading(v) {
    this._isLoading = v;
    if (this.onLoadingChange) this.onLoadingChange(v);
  }

  _notifyPageLoaded(data, isFirst) {
    if (this.onPageLoaded) this.onPageLoaded(data, isFirst);
  }

  _handleError(err) {
    console.error('[ArgonPager] Error:', err);
    if (this.onError) this.onError(err);
  }
}

window.ArgonPatientPager = ArgonPatientPager;
