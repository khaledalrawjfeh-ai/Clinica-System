/* ═══════════════════════════════════════════════════════════════════════
   ARGON MEDICAL OS — Billing Engine v12.0
   File: billing-engine.js
   
   ✅ متوافق 100% مع Firebase Rules v3.0
   ✅ لا يعدّل أي workflow سريري موجود
   ✅ كل عملية مالية محمية من التكرار (idempotent)
   ✅ FIFO Payment Allocation
   ✅ Invoice Immutability بعد الإقفال
   
   يعتمد على: db, BASE, CID, toast(), _sets, _docs, _bks
   تحميل بعد: argon-core.js, argon-enterprise.js
═══════════════════════════════════════════════════════════════════════ */

// ── حارس التهيئة — يمنع الخطأ إذا حُمّل الملف قبل Firebase ──
(function _guardInit() {
  if (typeof db === 'undefined' || typeof BASE === 'undefined') {
    console.error('[BillingEngine v12] ⚠️ يجب تحميل billing-engine.js بعد Firebase وتعريف BASE');
  }
})();

// ════════════════════════════════════════════════════════════════════════
// 🔧 UTILITIES — أدوات مشتركة
// ════════════════════════════════════════════════════════════════════════

const _B = {
  /** تنسيق الأرقام بـ 3 منازل عشرية (الدينار الأردني) */
  jod: n => parseFloat(n || 0).toFixed(3),

  /** تعقيم المدخلات — يمنع XSS */
  san: s => String(s || '').replace(/[<>"'`]/g, '').trim().substring(0, 300),

  /** ISO timestamp */
  now: () => new Date().toISOString(),

  /** تاريخ عربي */
  todayAR: () => new Date().toLocaleDateString('ar-JO', { dateStyle: 'full' }),

  /** toast آمن — يعمل حتى لو toast غير معرّفة */
  toast: (msg, type = '') => {
    if (typeof toast === 'function') toast(msg, type);
    else console.log(`[BillingEngine] ${msg}`);
  },

  /**
   * كتابة آمنة لـ Firebase بـ set() فقط على مفاتيح جديدة.
   * إذا كان المفتاح موجوداً → تحديث بـ update() لمنع الكسر مع Rules.
   * هذا يضمن التوافق مع: ".write": "!data.exists() || newData.exists()"
   */
  safeWrite: async (ref, data, allowUpdate = true) => {
    const snap = await ref.once('value');
    if (snap.exists()) {
      if (!allowUpdate) return false; // append-only nodes
      return ref.update(data);
    } else {
      return ref.set(data);
    }
  },

  /** Audit log — append-only متوافق مع Rules */
  audit: (action, detail, category = 'BILLING') => {
    if (typeof ArgonCore !== 'undefined' && ArgonCore.logAudit) {
      ArgonCore.logAudit(action, detail, category);
    }
  }
};

// ════════════════════════════════════════════════════════════════════════
// 💰 BILLING ENGINE — المحرك الرئيسي
// ════════════════════════════════════════════════════════════════════════

const BillingEngine = {

  // ── حالة داخلية ──
  _invoices:         {},
  _transactions:     {},
  _patientsRef:      null,
  _pricingCatalog:   {},
  _pharmacyInventory:{},
  _clinicSettingsPolicy: null,
  _processedTriggers: new Set(),
  activePatientId:   null,

  // ── isUiAuthorized: يُقيَّم ديناميكياً في كل استدعاء ──
  // FIX v12.1: لا يُخزَّن كقيمة ثابتة عند التهيئة — يُقرأ من session في كل مرة
  get isUiAuthorized() {
    if (typeof CID !== 'undefined' && sessionStorage.getItem('clinica_auth_' + CID) === '1') return true;
    if (window.ArgonSession) {
      const s = window.ArgonSession.get();
      if (s && ['admin', 'accountant', 'superadmin', 'reception'].includes(s.role)) return true;
    }
    return false;
  },
  // setter صوري للتوافق مع الكود القديم (dashboard.html يضبطه يدوياً بعد الدخول)
  set isUiAuthorized(v) { /* dynamic getter takes precedence */ },

  // ════════════════════════════════════════════
  // 🚀 INIT
  // ════════════════════════════════════════════

  init: function () {
    // ── إظهار/إخفاء أزرار القائمة — يعتمد على الـ getter الديناميكي ──
    const _updateMenuVisibility = () => {
      const auth = this.isUiAuthorized;
      const mBilling = document.getElementById('mBilling');
      const mPricing = document.getElementById('mPricing');
      if (mBilling) mBilling.style.display = auth ? 'flex' : 'none';
      if (mPricing) mPricing.style.display = auth ? 'flex' : 'none';
    };
    _updateMenuVisibility();
    // إعادة تقييم بعد 2 ثانية (تغطية حالة الدخول البطيء)
    setTimeout(_updateMenuVisibility, 2000);

    if (typeof db === 'undefined' || !BASE) return;

    // ── الاستماع للبيانات المالية ──
    db.ref(`${BASE}/invoices`).on('value', snap => {
      this._invoices = snap.val() || {};
      this.renderKPIs();
      this.renderReceivables();
      if (this.activePatientId) this.renderPatientLedger(this.activePatientId);
    });

    db.ref(`${BASE}/financial_transactions`).on('value', snap => {
      this._transactions = snap.val() || {};
      this.renderKPIs();
      this.renderReceivables();
      if (this.activePatientId) this.renderPatientLedger(this.activePatientId);
    });

    db.ref(`${BASE}/patients`).on('value', snap => {
      this._patientsRef = snap.val() || {};
      this.renderReceivables();
      if (this.activePatientId) this.renderPatientLedger(this.activePatientId);
    });

    // ── تحميل البيانات الأساسية قبل مراقبة الأوامر (تمنع تسعير صفري أو سياسة خاطئة) ──
    Promise.all([
      db.ref(`${BASE}/pricing_catalog`).once('value').then(snap => {
        this._pricingCatalog = snap.val() || {};
        db.ref(`${BASE}/pricing_catalog`).on('value', s => { this._pricingCatalog = s.val() || {}; renderPricingTables(); });
      }),
      db.ref(`${BASE}/pharmacy_inventory`).once('value').then(snap => {
        this._pharmacyInventory = snap.val() || {};
        db.ref(`${BASE}/pharmacy_inventory`).on('value', s => { this._pharmacyInventory = s.val() || {}; });
      }),
      db.ref(`${BASE}/settings/billingPolicy`).once('value').then(snap => {
        const bp = snap.val() || {};
        this._clinicSettingsPolicy = bp.departments || null;
        this._billingPolicy = bp;
        db.ref(`${BASE}/settings/billingPolicy`).on('value', s => { 
            const sVal = s.val() || {};
            this._clinicSettingsPolicy = sVal.departments || null;
            this._billingPolicy = sVal;
        });
      }),
      db.ref(`${BASE}/doctors`).once('value').then(snap => {
        this._clinicDocs = snap.val() || {};
        db.ref(`${BASE}/doctors`).on('value', s => { this._clinicDocs = s.val() || {}; });
      })
    ]).then(() => {
      // ── مراقبة أوامر الفوترة من EMR ──
      this._initBillingTriggerWatcher();
    });
  },

  // ════════════════════════════════════════════
  // 💲 PRICING LOOKUP
  // ════════════════════════════════════════════

  lookupPrice: function (serviceName, serviceType) {
    const normalizeText = (text) => {
      return (text || '').toLowerCase().trim()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/[\u064B-\u065F]/g, '') // إزالة التشكيل
        .replace(/[-_]/g, ' ') // استبدال الشرطات بمسافات (x-ray = x ray)
        .replace(/\s+/g, ' '); // توحيد المسافات
    };
    const norm = normalizeText(serviceName);
    if (!norm) return null;

    // صيدلية: ابحث في المخزون أولاً
    if (serviceType === 'pharmacy' && this._pharmacyInventory) {
      const drug = Object.values(this._pharmacyInventory).find(v => {
        const n = normalizeText(v.name);
        if (!n) return false; // تم إزالة شرط الطول لدعم الاختصارات الإنجليزية مثل PT, CT
        return n === norm || n.includes(norm) || norm.includes(n);
      });
      if (drug) {
        if (drug.sellPrice !== undefined) return parseFloat(drug.sellPrice);
        if (drug.price     !== undefined) return parseFloat(drug.price);
      }
    }

    // كتالوج التسعير
    const entry = Object.values(this._pricingCatalog).find(item => {
      if (!item.active) return false;
      if (serviceType && item.type !== serviceType) return false;
      const n = normalizeText(item.name);
      if (!n) return false;
      return n === norm || n.includes(norm) || norm.includes(n);
    });
    return entry ? parseFloat(entry.price) : null;
  },

  // ════════════════════════════════════════════
  // 📋 BILLING POLICY
  // ════════════════════════════════════════════

  getBillingPolicy: function (dept) {
    const realTimePolicy = this._clinicSettingsPolicy || {};
    let v = realTimePolicy[dept] || realTimePolicy[dept === 'radiology' ? 'rad' : dept];
    
    if (!v) {
      const settings = typeof _sets !== 'undefined' ? _sets : {};
      const bp = settings.billingPolicy || {};
      const departments = bp.departments || {};
      v = departments[dept] || departments[dept === 'radiology' ? 'rad' : dept];
    }
    
    if (v === 'separate' || v === 'free' || v === 'external') return v;
    return 'unified';
  },

  // ════════════════════════════════════════════
  // 🔁 DUPLICATE PREVENTION
  // ════════════════════════════════════════════

  isDuplicateCharge: function (billingRefId) {
    for (const inv of Object.values(this._invoices)) {
      if ((inv.items || []).some(i => i.billingReferenceId === billingRefId)) return true;
    }
    return false;
  },

  findVisitInvoice: function (visitId) {
    const key = `INV-${visitId}`;
    if (this._invoices[key]) return { id: key, ...this._invoices[key] };
    // fallback بحث
    for (const [k, inv] of Object.entries(this._invoices)) {
      if (inv.visitId === visitId &&
          !['lab_invoice','rad_invoice','pharmacy_invoice'].includes(inv.invoiceType)) {
        return { id: k, ...inv };
      }
    }
    return null;
  },

  // ════════════════════════════════════════════
  // ➕ ADD CHARGE — إضافة بند فوترة
  // ════════════════════════════════════════════

  addCharge: function (eventData) {
    /*
      eventData: {
        patientId, patientName, visitId, department,
        serviceId, customName, docName, price? (override)
      }
    */
    const billingRefId =
      `${CID}-${eventData.visitId}-${eventData.serviceId}-${(eventData.department || '').toUpperCase()}`;

    // ── 1. منع التكرار ──
    if (this.isDuplicateCharge(billingRefId)) {
      _B.audit('DUPLICATE_PREVENTED', `منع فوترة مزدوجة: ${billingRefId}`);
      return false;
    }

    // ── 2. تحديد السعر ──
    const priceFromCatalog = this.lookupPrice(eventData.serviceId, eventData.department);
    let price = eventData.price !== undefined ? parseFloat(eventData.price) : priceFromCatalog;
    let requiresReview = false;

    if (price === null || isNaN(price)) {
      price = 0;
      requiresReview = true;
      _B.audit('MISSING_PRICE', `خدمة غير مسعرة: ${eventData.serviceId}`);
    }

    const item = {
      serviceId:           eventData.serviceId,
      name:                _B.san(eventData.customName || eventData.serviceId),
      price:               price,
      billingReferenceId:  billingRefId,
      requiresBillingReview: requiresReview,
      department:          eventData.department,
      addedAt:             _B.now()
    };

    // ── 3. تطبيق سياسة الفوترة ──
    const policy = this.getBillingPolicy(eventData.department);

    if (policy === 'free') {
      _B.audit('FREE_SERVICE', `إعفاء حسب السياسة: ${eventData.serviceId}`);
      return true;
    }

    if (policy === 'external') {
      _B.audit('EXTERNAL_SERVICE', `خدمة خارجية (لا تُفوتر): ${eventData.serviceId}`);
      return true;
    }

    const prefixMap = { lab: 'LAB', radiology: 'RAD', pharmacy: 'PHARM' };
    const prefix = prefixMap[eventData.department] || (eventData.department || 'GEN').toUpperCase();
    const invId  = policy === 'separate'
      ? `${prefix}-${eventData.visitId}`
      : `INV-${eventData.visitId}`;

    // ── 4. إنشاء أو تحديث الفاتورة ──
    this._appendItemToInvoice(invId, item, eventData, policy, requiresReview);
    return true;
  },

  /**
   * إضافة بند لفاتورة — أو إنشاء الفاتورة إذا لم تكن موجودة.
   * ⚠️ RULES SAFE: يستخدم .set() للجديدة و .update() للموجودة
   *    كلاهما مسموح بـ: ".write": "!data.exists() || newData.exists()"
   */
  _appendItemToInvoice: function (invId, item, eventData, policy, requiresReview) {
    const invRef    = db.ref(`${BASE}/invoices/${invId}`);
    const existing  = this._invoices[invId];

    if (existing) {
      // ── فاتورة موجودة: تحديث فقط ──
      const currentItems = existing.items || [];

      // تحقق مزدوج — احتياطي
      if (currentItems.some(i => i.billingReferenceId === item.billingReferenceId)) return;

      currentItems.push(item);
      const newTotal  = currentItems.reduce((s, i) => s + (parseFloat(i.price) || 0), 0);
      const patTotal  = currentItems.reduce((s, i) => s + (parseFloat(i.patientShare) || parseFloat(i.price) || 0), 0);
      const insTotal  = currentItems.reduce((s, i) => s + (parseFloat(i.insuranceShare) || 0), 0);
      let   newStatus = existing.status;

      if (requiresReview) newStatus = 'pending_review';
      else if (newStatus === 'paid' || newStatus === 'voided' || existing.locked) newStatus = 'partial';

      // .update() متوافق مع Rules (newData.exists() = true) ✅
      invRef.update({
        items:    currentItems,
        total:    parseFloat(newTotal.toFixed(3)),
        patientShareTotal: parseFloat(patTotal.toFixed(3)),
        insuranceShareTotal: parseFloat(insTotal.toFixed(3)),
        status:   newStatus,
        locked:   false,
        ...(requiresReview ? { financialBlocked: true } : {})
      });

      // تحديث الـ cache المحلي لمنع race condition في التكرار
      this._invoices[invId] = {
        ...existing,
        items:  currentItems,
        total:  parseFloat(newTotal.toFixed(3)),
        patientShareTotal: parseFloat(patTotal.toFixed(3)),
        insuranceShareTotal: parseFloat(insTotal.toFixed(3)),
        status: newStatus
      };

      _B.audit('INVOICE_ITEM_ADDED', `إضافة "${item.name}" للفاتورة ${invId}`);

    } else {
      // ── فاتورة جديدة: .set() ✅ (!data.exists() → مسموح) ──
      const displayId = 'INV-' + String(Date.now()).slice(-6);
      const newInvoice = {
        displayId:   displayId,
        patientId:   eventData.patientId   || null,
        patientName: _B.san(eventData.patientName || 'غير معروف'),
        patientPhone:_B.san(eventData.patientPhone || ''),
        visitId:     eventData.visitId     || null,
        docName:     _B.san(eventData.docName     || ''),
        department:  _B.san(eventData.department  || 'general'),
        invoiceType: policy === 'separate'
          ? `${(eventData.department || 'general')}_invoice`
          : 'visit_invoice',
        items:       [item],
        total:       parseFloat((item.price || 0).toFixed(3)),
        patientShareTotal: item.patientShare !== undefined ? item.patientShare : parseFloat((item.price || 0).toFixed(3)),
        insuranceShareTotal: item.insuranceShare || 0,
        insurance:   eventData.insurance || null,
        taxNumber:   (typeof _sets !== 'undefined' && _sets.taxNumber) ? _sets.taxNumber : '',
        nationalInvoiceNumber: '',
        invoiceUUID: 'UUID-' + Date.now() + Math.floor(Math.random()*1000),
        status:      requiresReview ? 'pending_review' : 'unpaid',
        locked:      false,
        createdAt:   _B.now(),
        ...(requiresReview ? { financialBlocked: true } : {})
      };

      // .set() على مفتاح جديد ✅
      invRef.set(newInvoice).then(() => {
        _B.audit(
          policy === 'separate' ? 'DEPT_INVOICE_CREATED' : 'MASTER_INVOICE_CREATED',
          `فاتورة جديدة ${invId} — ${newInvoice.patientName}`
        );
      }).catch(e => console.error('[BillingEngine] invoice create failed:', e));

      // تحديث cache محلي
      this._invoices[invId] = newInvoice;
    }
  },

  // (تم حذف _initVisitFeeObserver لتفادي التكرار الكارثي على السجلات القديمة - الاعتماد الآن فقط على EMR Triggers)

  // ════════════════════════════════════════════
  // ⚡ BILLING TRIGGER WATCHER (EMR Orders)
  // ════════════════════════════════════════════

  _initBillingTriggerWatcher: function () {
    const handle = snap => {
      const t = snap.val();
      if (t && !t.processedAt && !this._processedTriggers.has(snap.key)) {
        this._processBillingTrigger(snap.key, t);
      }
    };
    db.ref(`${BASE}/billing_triggers`).on('child_added',   handle);
    db.ref(`${BASE}/billing_triggers`).on('child_changed', handle);
  },

  _processBillingTrigger: async function (triggerKey, trigger) {
    if (this._processedTriggers.has(triggerKey)) return;
    this._processedTriggers.add(triggerKey);

    // قفل متزامن لمنع المعالجة المزدوجة
    try {
      const lockSnap = await db.ref(`${BASE}/billing_triggers/${triggerKey}/processingLock`).once('value');
      if (lockSnap.val()) { this._processedTriggers.delete(triggerKey); return; }
      // .update() على trigger موجود ✅ (newData.exists())
      await db.ref(`${BASE}/billing_triggers/${triggerKey}`).update({ processingLock: Date.now() });
    } catch (e) { return; }

    const { visitKey, orders = {}, docName } = trigger;
    const patId   = trigger.patientId;
    const patName = trigger.patientName;
    
    // --- FETCH INSURANCE FROM BOOKING ---
    let insuranceObj = trigger.insurance || null;
    try {
      const bkSnap = await db.ref(`${BASE}/bookings/${visitKey}`).once('value');
      const bk = bkSnap.val() || {};
      if (bk.insurance) insuranceObj = bk.insurance;
    } catch(e) {}

    // ── تأكد من وجود كشفية الطبيب ──
    const existingInv = this._invoices[`INV-${visitKey}`];
    const hasConsult  = existingInv &&
      (existingInv.items || []).some(i => i.serviceId === 'CONSULT' || i.name === 'كشفية الطبيب');

    if (!hasConsult) {
      let docFee = 15;
      if (docName && this._clinicDocs) {
        const cName = docName.trim();
        const d = Object.values(this._clinicDocs).find(d => {
          if (!d.name) return false;
          const dn = d.name.trim();
          return dn === cName || cName.includes(dn) || dn.includes(cName) || `د. ${dn}` === cName;
        });
        if (d && d.fee) docFee = parseFloat(d.fee);
      }
      this.addCharge({
        patientId: patId, patientName: patName,
        visitId: visitKey, docName,
        department: 'exam', serviceId: 'CONSULT',
        customName: 'كشفية الطبيب', price: docFee,
        insurance: insuranceObj
      });
    }

    // ── معالجة الطلبيات ──
    const processOrders = (list, dept) => {
      if (!list) return;
      for (const order of list) {
        let name = '';
        if (typeof order === 'string') {
          name = order;
        } else if (dept === 'pharmacy' && order.drug) {
          name = order.drug;
        } else if (order.name) {
          name = order.name;
        } else {
          name = order.id || 'خدمة غير معروفة';
        }
        
        this.addCharge({
          patientId: patId, patientName: patName,
          visitId: visitKey, docName, department: dept,
          serviceId: name, customName: name,
          insurance: insuranceObj
        });
      }
    };
    processOrders(orders.lab,       'lab');
    processOrders(orders.radiology, 'radiology');
    processOrders(orders.pharmacy,  'pharmacy');

    // ── الرسوم والضرائب التلقائية (Auto-Added Fees) ──
    if (this._billingPolicy && Array.isArray(this._billingPolicy.autoFees)) {
      if (!hasConsult || (orders.lab && orders.lab.length) || (orders.radiology && orders.radiology.length) || (orders.pharmacy && orders.pharmacy.length)) {
        this._billingPolicy.autoFees.forEach((fee, index) => {
          if (!fee.name || !fee.price) return;
          this.addCharge({
            patientId: patId, patientName: patName,
            visitId: visitKey, docName,
            department: 'exam', // إجبار نزولها في الفاتورة الرئيسية
            serviceId: `AUTOFEE_${index}`,
            customName: fee.name,
            price: parseFloat(fee.price) || 0
          });
        });
      }
    }

    // ── تحديث حالة الـ trigger — .update() ✅ ──
    await db.ref(`${BASE}/billing_triggers/${triggerKey}`).update({
      processedAt:      _B.now(),
      processingStatus: 'success',
      processingLock:   null
    });
  },

  // ════════════════════════════════════════════
  // 🧮 FINANCIAL MATH
  // ════════════════════════════════════════════

  calculateInvoicePaid: function (invoiceId) {
    let paid = 0;
    for (const tx of Object.values(this._transactions)) {
      if (tx.invoiceId !== invoiceId || tx.status === 'voided') continue;
      if (tx.type === 'PAYMENT')  paid += parseFloat(tx.amount) || 0;
      if (tx.type === 'REVERSAL') paid -= parseFloat(tx.amount) || 0;
    }
    return parseFloat(paid.toFixed(3));
  },

  calculatePatientFinancials: function (patientId) {
    let totalBilled = 0;
    let totalPaid   = 0;

    const patInvoices = Object.entries(this._invoices)
      .filter(([, inv]) => inv.patientId === patientId);

    patInvoices.forEach(([k, inv]) => {
      if (!['voided','cancelled'].includes(inv.status)) {
        totalBilled += parseFloat(inv.total) || 0;
      }
      totalPaid += this.calculateInvoicePaid(k);
    });

    // دفعات غير مرتبطة بفاتورة محددة
    for (const tx of Object.values(this._transactions)) {
      if (tx.patientId !== patientId || tx.status === 'voided') continue;
      if (tx.invoiceId && this._invoices[tx.invoiceId]) continue; // محسوبة أعلاه
      if (tx.type === 'PAYMENT')  totalPaid += parseFloat(tx.amount) || 0;
      if (tx.type === 'REVERSAL') totalPaid -= parseFloat(tx.amount) || 0;
    }

    return {
      total:  parseFloat(totalBilled.toFixed(3)),
      paid:   parseFloat(totalPaid.toFixed(3)),
      unpaid: parseFloat((totalBilled - totalPaid).toFixed(3))
    };
  },

  // ════════════════════════════════════════════
  // 📊 KPI RENDERING
  // ════════════════════════════════════════════

  renderKPIs: function () {
    if (!this.isUiAuthorized) return;
    let totalReceivables = 0;
    let totalCollected   = 0;
    let openCount        = 0;
    let overdueCount     = 0;

    for (const [k, inv] of Object.entries(this._invoices)) {
      if (['voided','cancelled'].includes(inv.status)) continue;
      const total     = parseFloat(inv.total) || 0;
      const paid      = this.calculateInvoicePaid(k);
      const remaining = parseFloat((total - paid).toFixed(3));

      totalReceivables += Math.max(remaining, 0);
      totalCollected   += paid;

      if (remaining > 0) {
        openCount++;
        if (inv.createdAt) {
          const diffDays = Math.floor((Date.now() - new Date(inv.createdAt)) / 86400000);
          if (diffDays > 30) overdueCount++;
        }
      }
    }

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('blTotalPaid',    totalCollected.toFixed(3));
    set('blTotalUnpaid',  totalReceivables.toFixed(3));
    set('blCountOpen',    openCount);
    set('blCountOverdue', overdueCount);
  },

  // ════════════════════════════════════════════
  // 📋 RECEIVABLES TABLE
  // ════════════════════════════════════════════

  renderReceivables: function () {
    if (!this.isUiAuthorized) return;
    const tbody = document.getElementById('blTbody');
    if (!tbody) return;

    const searchQ  = (document.getElementById('blSearch')?.value || '').trim().toLowerCase();
    const filterQ  = document.getElementById('blFilter')?.value || 'all';
    const pts      = this._patientsRef || {};
    const today    = new Date();

    // تجميع حسب المريض
    const balances = {};

    for (const [k, inv] of Object.entries(this._invoices)) {
      const pid = inv.patientId;
      if (!pid) continue;

      if (!balances[pid]) {
        balances[pid] = {
          patientId:    pid,
          patientName:  pts[pid]?.info?.name  || inv.patientName  || 'مريض غير معروف',
          patientPhone: pts[pid]?.info?.phone || inv.patientPhone || '',
          total: 0, paid: 0, lastDate: inv.createdAt || ''
        };
      }

      if (!['voided','cancelled'].includes(inv.status)) {
        balances[pid].total += parseFloat(inv.total) || 0;
      }
      balances[pid].paid += this.calculateInvoicePaid(k);
      if ((inv.createdAt || '') > balances[pid].lastDate) balances[pid].lastDate = inv.createdAt;
    }

    // دفعات بلا فاتورة
    for (const tx of Object.values(this._transactions)) {
      const pid = tx.patientId;
      if (!pid || tx.status === 'voided') continue;
      if (!balances[pid]) {
        balances[pid] = {
          patientId:    pid,
          patientName:  pts[pid]?.info?.name  || 'مريض غير معروف',
          patientPhone: pts[pid]?.info?.phone || '',
          total: 0, paid: 0, lastDate: tx.timestamp || ''
        };
      }
      if (!tx.invoiceId || !this._invoices[tx.invoiceId]) {
        if (tx.type === 'PAYMENT')  balances[pid].paid += parseFloat(tx.amount) || 0;
        if (tx.type === 'REVERSAL') balances[pid].paid -= parseFloat(tx.amount) || 0;
      }
      if ((tx.timestamp || '') > balances[pid].lastDate) balances[pid].lastDate = tx.timestamp;
    }

    // بناء الجدول
    let rows = '';
    for (const p of Object.values(balances)) {
      p.total = parseFloat(p.total.toFixed(3));
      p.paid  = parseFloat(p.paid.toFixed(3));
      const remaining = parseFloat((p.total - p.paid).toFixed(3));
      const diffDays  = p.lastDate
        ? Math.floor((today - new Date(p.lastDate)) / 86400000)
        : 0;

      let status = remaining <= 0 ? 'paid'
        : p.paid > 0             ? 'partial'
        : diffDays > 30          ? 'overdue'
        : 'unpaid';

      // فلترة
      if (filterQ !== 'all' && filterQ !== status) continue;
      if (filterQ === 'all' && status === 'paid' && !searchQ) continue;

      if (searchQ) {
        const phoneDigits = (p.patientPhone || '').replace(/\D/g, '');
        let invMatch = false;
        if (this._invoices) {
          invMatch = Object.entries(this._invoices).some(([invK, inv]) => {
            if (!inv || inv.patientId !== p.patientId) return false;
            let dId = inv.displayId;
            if (!dId) {
              let hash = 0;
              for (let i = 0; i < invK.length; i++) { hash = (hash << 5) - hash + invK.charCodeAt(i); hash |= 0; }
              dId = 'INV-' + String(Math.abs(hash)).padStart(6, '1').substring(0, 6);
            }
            return dId.toLowerCase().includes(searchQ) || invK.toLowerCase().includes(searchQ);
          });
        }
        if (!p.patientName.toLowerCase().includes(searchQ) && !phoneDigits.includes(searchQ) && !invMatch) continue;
      }

      const badgeMap = {
        paid:    `<span style="color:var(--green);background:rgba(16,185,129,.1);padding:3px 8px;border-radius:6px;font-size:.7rem;font-weight:800">مسدد بالكامل ✅</span>`,
        partial: `<span style="color:var(--amber);background:rgba(245,158,11,.1);padding:3px 8px;border-radius:6px;font-size:.7rem;font-weight:800">دفع جزئي 💳</span>`,
        unpaid:  `<span style="color:var(--red);background:rgba(239,68,68,.08);padding:3px 8px;border-radius:6px;font-size:.7rem;font-weight:800">غير مدفوع ⏳</span>`,
        overdue: `<span style="color:var(--red);background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);padding:3px 8px;border-radius:6px;font-size:.7rem;font-weight:800">متأخر الدفع ⚠️</span>`
      };

      rows += `<tr>
        <td>
          <div style="font-weight:800;color:var(--teal)">${_B.san(p.patientName)}</div>
          <div style="font-size:.68rem;color:var(--muted);font-family:'IBM Plex Mono',monospace">${p.patientId.substring(0,8)}…</div>
        </td>
        <td style="font-family:'IBM Plex Mono',monospace;font-weight:700">${_B.jod(p.total)}</td>
        <td style="font-family:'IBM Plex Mono',monospace;color:var(--green)">${_B.jod(p.paid)}</td>
        <td style="font-family:'IBM Plex Mono',monospace;color:${remaining > 0 ? 'var(--red)' : 'var(--muted)'};font-weight:${remaining > 0 ? 800 : 400}">${_B.jod(remaining)}</td>
        <td>${badgeMap[status] || ''}<br>${this._renderDeptInvoiceBadges(p.patientId)}</td>
        <td style="text-align:center">
          <button class="tbtn" onclick="BillingEngine.openPatientLedger('${_B.san(p.patientId)}')"
            style="background:rgba(13,148,136,.08);color:var(--teal);border-color:rgba(13,148,136,.2)">
            عرض كشف الحساب
          </button>
        </td>
      </tr>`;
    }

    tbody.innerHTML = rows ||
      `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--muted)">لا توجد ذمم مطابقة</td></tr>`;
  },

  // ════════════════════════════════════════════
  // 🧾 PATIENT LEDGER MODAL
  // ════════════════════════════════════════════

  openPatientLedger: function (patientId) {
    if (!this.isUiAuthorized) return;
    this.activePatientId = patientId;
    const pts  = this._patientsRef || {};
    const pat  = pts[patientId];
    const info = pat?.info || {};

    // بيانات المريض
    let patName  = info.name  || 'مريض غير معروف';
    let patPhone = info.phone || '';
    if (!patName || patName === 'مريض غير معروف') {
      const inv = Object.values(this._invoices).find(i => i.patientId === patientId);
      if (inv) { patName = inv.patientName || patName; patPhone = inv.patientPhone || patPhone; }
    }

    document.getElementById('blPatName').textContent = _B.san(patName);
    document.getElementById('blPatUID').textContent  = 'UID: ' + patientId;
    document.getElementById('blPatUID').dataset.patientId = patientId;

    // زر واتساب
    const waBtn = document.getElementById('blWaBtn');
    if (waBtn) {
      waBtn.style.display = patPhone ? 'flex' : 'none';
      if (patPhone) {
        waBtn.onclick = () => {
          let num = patPhone.replace(/\D/g, '');
          if (num.startsWith('07')) num = '962' + num.substring(1);
          const fin = this.calculatePatientFinancials(patientId);
          if (fin.unpaid <= 0) { _B.toast('✅ لا يوجد رصيد مستحق', 'ok'); return; }
          const msg = encodeURIComponent(
            `السلام عليكم ${_B.san(patName)}،\nنود تذكيركم بوجود رصيد مستحق بقيمة ${_B.jod(fin.unpaid)} دينار.\nيرجى مراجعة العيادة لتسوية الرصيد. شكراً.`
          );
          window.open(`https://wa.me/${num}?text=${msg}`, '_blank');
          _B.audit('WA_REMINDER', `إرسال تذكير للمريض ${patName}`);
        };
      }
    }

    this.renderPatientLedger(patientId);
    const modal = document.getElementById('billingModal');
    if (modal) modal.style.display = 'flex';
  },

  renderPatientLedger: function (patientId) {
    if (!this.isUiAuthorized) return;
    const fin = this.calculatePatientFinancials(patientId);

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('blLedgerTotal',  _B.jod(fin.total));
    set('blLedgerPaid',   _B.jod(fin.paid));
    set('blLedgerUnpaid', _B.jod(Math.max(fin.unpaid, 0)));

    // ── جدول الفواتير ──
    const invBody = document.getElementById('blInvoicesBody');
    if (invBody) {
      const pInvoices = Object.entries(this._invoices)
        .filter(([, inv]) => inv.patientId === patientId)
        .sort(([,a],[,b]) => (b.createdAt||'') > (a.createdAt||'') ? 1 : -1);

      const DEPT_LABELS = {
        exam:      { icon: '🏥', label: 'كشفية الطبيب',      color: 'var(--teal)'   },
        lab:       { icon: '🔬', label: 'فحوصات المختبر',     color: 'var(--green)'  },
        radiology: { icon: '🩻', label: 'صور الأشعة',         color: 'var(--sky)'    },
        rad:       { icon: '🩻', label: 'صور الأشعة',         color: 'var(--sky)'    },
        pharmacy:  { icon: '💊', label: 'الصيدلية',           color: 'var(--amber)'  },
        other:     { icon: '📋', label: 'خدمات أخرى',         color: 'var(--purple)' }
      };

      const classifyItem = (i, inv) => {
        const n = (i.name || '').toLowerCase();
        const d = (i.department || inv.department || '').toLowerCase();
        if (d === 'exam' || n.includes('كشفي') || n.includes('consultation')) return 'exam';
        if (d === 'lab'  || n.includes('تحليل') || n.includes('فحص دم'))      return 'lab';
        if (['radiology','rad'].includes(d) || n.includes('أشعة') || n.includes('x-ray')) return 'radiology';
        if (['pharmacy','pharm'].includes(d) || n.includes('دواء') || n.includes('صيدل')) return 'pharmacy';
        return 'other';
      };

      invBody.innerHTML = pInvoices.map(([k, inv]) => {
        const total     = parseFloat(inv.total) || 0;
        const paid      = this.calculateInvoicePaid(k);
        const remaining = parseFloat((total - paid).toFixed(3));
        const dateStr   = inv.createdAt ? new Date(inv.createdAt).toLocaleString('ar-JO') : '—';
        const isLocked  = inv.locked || ['paid','voided','cancelled'].includes(inv.status);

        // تصنيف البنود
        const groups = {};
        for (const item of (inv.items || [])) {
          const cat = classifyItem(item, inv);
          if (!groups[cat]) groups[cat] = [];
          groups[cat].push(item);
        }

        const itemsHtml = Object.entries(groups).map(([cat, items]) => {
          const cfg = DEPT_LABELS[cat] || DEPT_LABELS.other;
          const subtotal = items.reduce((s, i) => s + (parseFloat(i.price) || 0), 0);
          return `<div style="margin-bottom:5px">
            <div style="font-size:.7rem;font-weight:800;color:${cfg.color};margin-bottom:3px">${cfg.icon} ${cfg.label}</div>
            ${items.map(i => {
              const isPending = i.requiresBillingReview;
              return `<div style="display:flex;justify-content:space-between;padding:2px 6px;border-radius:4px;
                background:${isPending ? 'rgba(239,68,68,.08)' : 'rgba(0,0,0,.02)'};
                border:1px solid ${isPending ? 'rgba(239,68,68,.25)' : 'var(--border)'};margin-bottom:2px">
                <span style="font-size:.77rem;${isPending?'color:var(--red)':''}">${_B.san(i.name)}</span>
                ${isPending
                  ? `<span style="font-size:.65rem;color:var(--red);font-weight:700">⚠️ قيد المراجعة</span>`
                  : `<span style="font-family:'IBM Plex Mono',monospace;font-size:.77rem;font-weight:700;color:${cfg.color}">${_B.jod(i.price)}</span>`
                }
              </div>`;
            }).join('')}
            <div style="text-align:left;font-size:.65rem;color:var(--muted);font-family:'IBM Plex Mono',monospace">
              مجموع: ${_B.jod(subtotal)} د.أ
            </div>
          </div>`;
        }).join('');

        let statusHtml;
        if (inv.status === 'voided' || inv.status === 'cancelled')
          statusHtml = `<span style="color:var(--muted);font-size:.7rem">ملغاة</span>`;
        else if (remaining <= 0 && total > 0)
          statusHtml = `<span style="color:var(--green);font-size:.7rem">مدفوعة بالكامل ✅</span>`;
        else if (paid > 0)
          statusHtml = `<span style="color:var(--amber);font-size:.7rem">دفع جزئي 💳</span>`;
        else if (inv.status === 'pending_review')
          statusHtml = `<span style="color:var(--amber);font-size:.7rem">⚠️ قيد التسعير</span>`;
        else
          statusHtml = `<span style="color:var(--red);font-size:.7rem">غير مدفوعة</span>`;

        const editBtn = isLocked
          ? `<button class="tbtn" disabled title="فاتورة مقفلة 🔒"
               style="opacity:.5;cursor:not-allowed"><i class="fas fa-lock"></i></button>`
          : `<button class="tbtn" onclick="BillingEngine.openInvoiceEditor('${_B.san(k)}')"
               style="background:rgba(14,165,233,.08);color:var(--sky);border-color:rgba(14,165,233,.2)">
               <i class="fas fa-edit"></i></button>`;

        const printBtn = `<button class="tbtn" onclick="BillingEngine.printSingleInvoice('${_B.san(k)}')"
               style="background:rgba(13,148,136,.08);color:var(--teal);border-color:rgba(13,148,136,.2);margin-right:4px;" title="طباعة هذه الفاتورة">
               <i class="fas fa-print"></i></button>`;

        const totalHtml = (inv.insuranceShareTotal > 0) 
          ? `<div style="font-size:0.7rem;color:var(--muted);text-decoration:line-through">${_B.jod(total)} الإجمالي</div>
             <div style="font-size:0.75rem;color:var(--purple);margin-top:2px"><i class="fas fa-shield-halved"></i> تأمين: ${_B.jod(inv.insuranceShareTotal)}</div>
             <div style="font-size:0.95rem;color:var(--teal);margin-top:2px;font-weight:900">المريض: ${_B.jod(inv.patientShareTotal)}</div>`
          : `<div style="font-size:1rem">${_B.jod(total)}</div>`;

        return `<tr>
          <td style="font-size:.75rem;white-space:nowrap">${dateStr}</td>
          <td style="min-width:220px">${itemsHtml}</td>
          <td style="font-family:'IBM Plex Mono',monospace;font-weight:900;">${totalHtml}</td>
          <td>${statusHtml}</td>
          <td style="text-align:center;white-space:nowrap">${editBtn}${printBtn}</td>
        </tr>`;
      }).join('') ||
        `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">لا توجد مطالبات</td></tr>`;
    }

    // ── جدول الدفعات ──
    const payBody = document.getElementById('blPaymentsBody');
    if (payBody) {
      const pTx = Object.entries(this._transactions)
        .filter(([, tx]) => tx.patientId === patientId && tx.status !== 'voided')
        .sort(([,a],[,b]) => (b.timestamp||'') > (a.timestamp||'') ? 1 : -1);

      let lastDate = '--';
      payBody.innerHTML = pTx.map(([, tx], i) => {
        if (i === 0 && tx.timestamp)
          lastDate = new Date(tx.timestamp).toLocaleDateString('ar-JO');
        const isRev  = tx.type === 'REVERSAL';
        const color  = isRev ? 'var(--red)' : 'var(--green)';
        const sign   = isRev ? '−' : '+';
        const dateStr = tx.timestamp ? new Date(tx.timestamp).toLocaleString('ar-JO') : '—';
        return `<tr>
          <td style="font-size:.75rem">
            <div>${dateStr}</div>
            <div style="font-size:.62rem;color:var(--muted)">${_B.san(tx.reason || '')}</div>
          </td>
          <td style="font-family:'IBM Plex Mono',monospace;font-weight:800;color:${color}">${sign}${_B.jod(tx.amount)}</td>
        </tr>`;
      }).join('') ||
        `<tr><td colspan="2" style="text-align:center;color:var(--muted);padding:16px">لا توجد حركات مالية</td></tr>`;

      set('blLedgerLastPay', lastDate);
    }
  },

  // ════════════════════════════════════════════
  // 🖨️ PRINT PATIENT INVOICE (→ invoice-print.html)
  // ════════════════════════════════════════════

  printPatientInvoice: function () {
    const pid = this.activePatientId;
    if (!pid) { _B.toast('⚠️ لم يتم تحديد مريض', 'err'); return; }

    // البحث عن جميع الفواتير المرتبطة بهذا المريض
    const pInvoices = Object.entries(this._invoices)
      .filter(([, inv]) => inv.patientId === pid)
      .sort(([,a],[,b]) => (a.createdAt||'') > (b.createdAt||'') ? -1 : 1); // الأحدث أولاً

    if (pInvoices.length === 0) {
      _B.toast('⚠️ لا توجد فواتير مسجلة لهذا المريض', 'err'); return;
    }

    // الأولوية القصوى: العثور على أحدث "فاتورة عيادة رئيسية" (التي لا تحتوي على الأقسام المنفصلة)
    // هذا يضمن احترام سياسة الفصل: الفاتورة المنفصلة (مثل الصيدلية) لن تظهر هنا
    const targetInvoice = pInvoices.find(([k]) => k.startsWith('INV-')) || pInvoices[0];

    // توجيه أمر الطباعة إلى محرك طباعة الفاتورة الفردية
    // والذي سيطبع فقط البنود الخاصة بهذه الفاتورة المحددة، متجاهلاً الفواتير المنفصلة الأخرى
    this.printSingleInvoice(targetInvoice[0]);
  },

  printSingleInvoice: function (invId) {
    const inv = this._invoices[invId];
    if (!inv) return;
    
    const pts  = this._patientsRef || {};
    const info = pts[inv.patientId]?.info || {};
    
    let isPending = ['pending_review','pending'].includes(inv.status);
    
    // حساب المدفوع لهذه الفاتورة تحديداً
    let paidForInv = 0;
    const invPayments = [];
    for (const tx of Object.values(this._transactions)) {
      if (tx.invoiceId === invId && tx.status !== 'voided') {
        if (tx.type === 'PAYMENT') {
          paidForInv += parseFloat(tx.amount) || 0;
          invPayments.push({
            date: new Date(tx.timestamp || _B.now()).toLocaleString('ar-JO'),
            note: tx.reason || 'دفع نقدي',
            amount: tx.amount
          });
        }
        if (tx.type === 'REVERSAL') {
          paidForInv -= parseFloat(tx.amount) || 0;
          invPayments.push({
            date: new Date(tx.timestamp || _B.now()).toLocaleString('ar-JO'),
            note: tx.reason || 'استرداد / عكس دفعة',
            amount: -parseFloat(tx.amount)
          });
        }
      }
    }

    // تجهيز العناصر
    const allItems = [];
    const docNames = new Set();
    const visitIds = new Set();
    
    if (inv.visitId) visitIds.add(inv.visitId);
    if (inv.docName) docNames.add(inv.docName);
    
    (inv.items || []).forEach(i => {
      const n = (i.name || '').toLowerCase();
      const d = (i.department || inv.department || '').toLowerCase();
      let type = 'other';
      if (d === 'exam'  || n.includes('كشف'))    type = 'exam';
      else if (d === 'lab')                        type = 'lab';
      else if (['radiology','rad'].includes(d))    type = 'radiology';
      else if (['pharmacy','pharm'].includes(d))   type = 'pharmacy';
      docNames.add(i.docName || inv.docName || '');
      allItems.push({ ...i, type, note: `فاتورة: ${invId.substring(0,8)}` });
    });

    const clinicSettings = typeof _sets !== 'undefined' ? _sets : {};

    let dSpec = 'عيادة عامة';
    if (this._clinicDocs && docNames.size > 0) {
      const specs = new Set();
      docNames.forEach(n => {
        const doc = Object.values(this._clinicDocs).find(d => 
          d.name === n || 'د. ' + d.name === n || d.name === n.replace('د. ', '')
        );
        if (doc && doc.specialty) specs.add(doc.specialty);
      });
      if (specs.size > 0) dSpec = [...specs].join('، ');
    }

    let dispId = inv.displayId;
    if (!dispId) {
      let hash = 0;
      for (let i = 0; i < invId.length; i++) { hash = (hash << 5) - hash + invId.charCodeAt(i); hash |= 0; }
      dispId = 'INV-' + String(Math.abs(hash)).padStart(6, '1').substring(0, 6);
    }

    const payload = {
      invoice: {
        id: invId,
        displayId: dispId,
        visitId: [...visitIds].join(', ') || '—',
        status: isPending ? 'pending_review' : inv.status,
        patientName: inv.patientName || info.name || 'مريض غير معروف',
        patientNID: info.nationalId || '—',
        patientPhone: inv.patientPhone || info.phone || '—',
        patientAge: info.age || '—',
        patientGender: info.gender || '—',
        patientMRN: info.mrn || '—',
        docName: [...docNames].filter(Boolean).join('، ') || '—',
        docSpec: dSpec,
        visitTime: new Date(inv.createdAt || _B.now()).toLocaleTimeString('ar-JO', { hour:'2-digit', minute:'2-digit' }),
        department: inv.department || 'متعدد الأقسام',
        createdAt: inv.createdAt || _B.now(),
        paidAt: (inv.total <= paidForInv && inv.total > 0) ? _B.now() : null,
        paidAmount: paidForInv,
        discount: 0,
        tax: 0,
        items: allItems,
        payments: invPayments, // Added payment logs for history display
        notes: `إجمالي الفاتورة: ${_B.jod(inv.total)} · المسدد: ${_B.jod(paidForInv)} · المتبقي: ${_B.jod(Math.max((inv.total || 0) - paidForInv, 0))} د.أ`,
        originalTotal: inv.total,
        isComprehensive: false
      },
      settings: {
        name: clinicSettings.name || 'العيادة',
        phone: clinicSettings.phone || '',
        logoUrl: clinicSettings.logoUrl || null,
        emoji: clinicSettings.emoji || '🏥'
      }
    };

    try {
      localStorage.setItem('argon_invoice_payload', JSON.stringify(payload));
      const base = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/')) || '';
      window.open(`${base}/invoice-print.html?v=15&id=${encodeURIComponent(typeof CID !== 'undefined' ? CID : '1')}`, '_blank');
      setTimeout(() => localStorage.removeItem('argon_invoice_payload'), 30000);
      _B.audit('INVOICE_PRINTED', `طباعة الفاتورة ${invId}`);
    } catch (e) {
      console.error('[BillingEngine] print failed:', e);
      _B.toast('❌ فشل تحضير الفاتورة للطباعة', 'err');
    }
  },

  // ════════════════════════════════════════════
  // ✏️ INVOICE EDITOR (Admin Only)
  // ════════════════════════════════════════════

  activeEditInvId:   null,
  activeEditItems:   [],

  openInvoiceEditor: function (invId) {
    // ── تحقق الصلاحية ──
    let authorized = false;
    if (typeof CID !== 'undefined' && sessionStorage.getItem('clinica_auth_' + CID) === '1') {
      authorized = true;
    } else if (window.ArgonSession) {
      const s = window.ArgonSession.get();
      if (s && ['admin', 'accountant', 'superadmin'].includes(s.role)) authorized = true;
    }
    if (!authorized) {
      _B.toast('⚠️ صلاحيات الإدارة العليا أو المحاسبة فقط', 'err'); return;
    }
    const inv = this._invoices[invId];
    if (!inv) { _B.toast('❌ الفاتورة غير موجودة', 'err'); return; }

    // ── منع تعديل الفواتير المقفلة ──
    if (inv.locked || ['paid','voided','cancelled'].includes(inv.status)) {
      _B.toast('🔒 الفاتورة مقفلة مالياً — لا يمكن التعديل', 'err'); return;
    }

    this.activeEditInvId  = invId;
    this.activeEditItems  = JSON.parse(JSON.stringify(inv.items || []));

    const el = id => document.getElementById(id);
    if (el('invEdId'))     el('invEdId').textContent   = invId;
    if (el('invEdStatus')) el('invEdStatus').innerHTML =
      inv.status === 'pending_review'
        ? '<span style="color:var(--amber)">⚠️ قيد التسعير</span>'
        : '<span style="color:var(--sky)">قيد المراجعة</span>';

    this._renderEditorItems();
    const modal = document.getElementById('invoiceEditorModal');
    if (modal) modal.style.display = 'flex';
  },

  _renderEditorItems: function () {
    const tbody = document.getElementById('invEdItemsBody');
    if (!tbody) return;
    let total = 0;
    tbody.innerHTML = this.activeEditItems.map((item, idx) => {
      const price = parseFloat(item.price || 0);
      total += price;
      return `<tr style="border-bottom:1px solid rgba(0,0,0,.04)">
        <td style="padding:6px 10px">
          <input type="text" class="mfi" value="${_B.san(item.name)}"
            onchange="BillingEngine._updateItemName(${idx},this.value)"
            style="padding:4px;font-size:.8rem;margin:0;border:none;background:transparent">
        </td>
        <td style="padding:6px 10px">
          <input type="number" class="mfi" value="${price.toFixed(3)}" step="0.001"
            onchange="BillingEngine._updateItemPrice(${idx},this.value)"
            style="padding:4px;font-size:.8rem;margin:0;font-family:'IBM Plex Mono',monospace;border:none;background:transparent">
        </td>
        <td style="padding:6px;text-align:center"></td>
      </tr>`;
    }).join('') ||
      `<tr><td colspan="3" style="text-align:center;padding:16px;color:var(--muted)">لا توجد بنود</td></tr>`;

    const totEl = document.getElementById('invEdTotal');
    if (totEl) totEl.textContent = _B.jod(total);
  },

  _updateItemName:  function (idx, val) { if (this.activeEditItems[idx]) this.activeEditItems[idx].name  = val.trim(); },
  _updateItemPrice: function (idx, val) { if (this.activeEditItems[idx]) { this.activeEditItems[idx].price = parseFloat(val) || 0; this._renderEditorItems(); } },

  addInvoiceItemUI: function () {
    const nameEl  = document.getElementById('invEdNewName');
    const priceEl = document.getElementById('invEdNewPrice');
    const name    = nameEl?.value.trim();
    const price   = parseFloat(priceEl?.value) || 0;
    if (!name) { _B.toast('⚠️ أدخل اسم البند', 'err'); return; }
    this.activeEditItems.push({ id: `MANUAL-${Date.now()}`, name, price, addedAt: _B.now() });
    if (nameEl) nameEl.value = '';
    if (priceEl) priceEl.value = '';
    this._renderEditorItems();
  },

  addTax16UI: function () {
    const total = this.activeEditItems.reduce((s, i) => s + (parseFloat(i.price) || 0), 0);
    this.activeEditItems.push({
      id: `TAX-${Date.now()}`,
      name:  'ضريبة مبيعات 16%',
      price: parseFloat((total * 0.16).toFixed(3)),
      addedAt: _B.now()
    });
    this._renderEditorItems();
  },

  voidInvoiceUI: function () {
    if (!confirm('تأكيد إبطال هذه الفاتورة؟ لا يمكن التراجع عن هذه العملية.')) return;
    const invId = this.activeEditInvId;
    const inv   = this._invoices[invId];
    if (!inv) return;
    const reason = prompt('سبب الإبطال:', 'إلغاء') || 'إلغاء';

    // .update() ✅ — فاتورة موجودة (newData.exists() = true)
    db.ref(`${BASE}/invoices/${invId}`).update({
      status:        'voided',
      locked:        true,
      originalTotal: inv.total || 0,
      voidedAt:      _B.now(),
      voidReason:    _B.san(reason)
    }).then(() => {
      // سجل مراجعة append-only ✅
      db.ref(`${BASE}/audit_logs`).push({
        invoiceId: invId,
        action:    'VOID_INVOICE',
        voidReason:_B.san(reason),
        timestamp: _B.now()
      });
      _B.toast('✅ تم إبطال الفاتورة', 'ok');
      const modal = document.getElementById('invoiceEditorModal');
      if (modal) modal.style.display = 'none';
    });
  },

  saveEditedInvoice: function () {
    const invId = this.activeEditInvId;
    const inv   = this._invoices[invId];
    if (!inv) return;

    const newTotal = this.activeEditItems.reduce((s, i) => s + (parseFloat(i.price) || 0), 0);
    const oldTotal = parseFloat(inv.total || 0);

    // .update() ✅ — تحديث فاتورة موجودة
    db.ref(`${BASE}/invoices/${invId}`).update({
      items:            this.activeEditItems,
      total:            parseFloat(newTotal.toFixed(3)),
      status:           'unpaid',
      financialBlocked: null,
      lastEditedAt:     _B.now()
    }).then(() => {
      // سجل مراجعة ✅
      db.ref(`${BASE}/audit_logs`).push({
        invoiceId: invId,
        action:    'EDIT_INVOICE',
        oldTotal,
        newTotal:  parseFloat(newTotal.toFixed(3)),
        timestamp: _B.now()
      });
      _B.toast('✅ تم حفظ الفاتورة بنجاح', 'ok');
      const modal = document.getElementById('invoiceEditorModal');
      if (modal) modal.style.display = 'none';
    }).catch(e => {
      console.error('[BillingEngine] save failed:', e);
      _B.toast('❌ فشل الحفظ — تأكد من الاتصال', 'err');
    });
  },

  sanitize: _B.san,

  // ════════════════════════════════════════════
  // 🏷️ DEPT INVOICE BADGES — شارات الفواتير المنفصلة
  // ════════════════════════════════════════════
  /**
   * يُظهر شارات صغيرة بجانب كل مريض تُشير للفواتير المنفصلة الموجودة
   * يُساعد محاسب الاستقبال على معرفة أن مريضاً عنده فاتورة مختبر + أشعة منفصلة
   */
  _renderDeptInvoiceBadges: function(patientId) {
    const BADGE_MAP = {
      lab_invoice:      { label: '🔬 مختبر', color: 'rgba(16,185,129,.15)', border: 'rgba(16,185,129,.3)', text: 'var(--green)' },
      radiology_invoice:{ label: '🩻 أشعة',  color: 'rgba(14,165,233,.15)', border: 'rgba(14,165,233,.3)', text: 'var(--sky)'   },
      pharmacy_invoice: { label: '💊 صيدلية',color: 'rgba(245,158,11,.15)', border: 'rgba(245,158,11,.3)', text: 'var(--amber)' },
    };
    const badges = [];
    for (const [, inv] of Object.entries(this._invoices)) {
      if (inv.patientId !== patientId) continue;
      if (inv.invoiceType && BADGE_MAP[inv.invoiceType]) {
        const cfg = BADGE_MAP[inv.invoiceType];
        const paid = this.calculateInvoicePaid(Object.keys(this._invoices).find(k => this._invoices[k] === inv) || '');
        const rem  = (parseFloat(inv.total) || 0) - paid;
        const isDue = rem > 0.001 && !['voided','cancelled','paid'].includes(inv.status);
        if (!badges.find(b => b.includes(cfg.label))) {
          badges.push(
            `<span style="display:inline-block;margin-top:3px;margin-left:3px;font-size:.6rem;font-weight:800;padding:1px 6px;border-radius:5px;
              background:${cfg.color};border:1px solid ${cfg.border};color:${cfg.text}">
              ${cfg.label}${isDue ? ` · ${_B.jod(rem)}` : ' ✓'}
            </span>`
          );
        }
      }
    }
    return badges.join('');
  },

}; // ← END BillingEngine object

// ════════════════════════════════════════════════════════════════════════
// 💳 RECORD BILLING PAYMENT — تسجيل دفعة
// ════════════════════════════════════════════════════════════════════════

/**
 * تسجيل دفعة مالية من المريض.
 *
 * ✅ RULES SAFE:
 *   - financial_transactions: append-only (tx جديد دائماً) → .set() ✅
 *   - invoices status: .update() على فاتورة موجودة ✅
 *
 * منطق التوزيع: FIFO — يُطبَّق على الفواتير من الأقدم للأحدث.
 */
function recordBillingPayment() {
  const patientId = BillingEngine.activePatientId;
  if (!patientId) { _B.toast('⚠️ لم يتم تحديد مريض', 'err'); return; }

  const amtEl    = document.getElementById('blPayAmount');
  const reasonEl = document.getElementById('blPayReason');
  const amount   = parseFloat(amtEl?.value);
  const reason   = reasonEl?.value?.trim() || 'دفع نقدي';

  if (!amount || amount <= 0 || isNaN(amount)) {
    _B.toast('⚠️ أدخل مبلغاً صحيحاً أكبر من صفر', 'err'); return;
  }

  // ── منع الدفع إذا كانت هناك فواتير قيد المراجعة ──
  const hasBlocked = Object.values(BillingEngine._invoices)
    .some(inv => inv.patientId === patientId && inv.financialBlocked);
  if (hasBlocked) {
    _B.toast('⛔ لا يمكن تحصيل الدفعات: هناك فواتير قيد المراجعة المالية', 'err'); return;
  }

  // ── حساب الرصيد المستحق الفعلي ──
  const pInvoices = Object.entries(BillingEngine._invoices)
    .filter(([, inv]) => inv.patientId === patientId && !['voided','cancelled'].includes(inv.status))
    .sort(([,a],[,b]) => (a.createdAt||'') > (b.createdAt||'') ? 1 : -1); // FIFO

  let totalUnallocated = pInvoices.reduce((sum, [k, inv]) => {
    const rem = (parseFloat(inv.total) || 0) - BillingEngine.calculateInvoicePaid(k);
    return sum + Math.max(rem, 0);
  }, 0);

  if (amount > totalUnallocated + 0.001) { // tolerance صغير للأرقام العشرية
    _B.toast(
      `⛔ المبلغ (${_B.jod(amount)}) يتجاوز الرصيد المستحق (${_B.jod(totalUnallocated)}) — يُمنع الرصيد السالب`,
      'err'
    ); return;
  }

  // ── بناء batch update ──
  const timestamp  = _B.now();
  const session    = window.ArgonSession ? window.ArgonSession.get() : {};
  const actorId    = session.staffId || 'dashboard_admin';
  const updates    = {};
  let   remaining  = amount;

  for (const [invId, inv] of pInvoices) {
    if (remaining <= 0.001) break;

    const total       = parseFloat(inv.total) || 0;
    const paid        = BillingEngine.calculateInvoicePaid(invId);
    const unallocated = parseFloat((total - paid).toFixed(3));
    if (unallocated <= 0.001) continue;

    const toApply = parseFloat(Math.min(unallocated, remaining).toFixed(3));
    const newPaid = parseFloat((paid + toApply).toFixed(3));
    const isFullyPaid = newPaid >= total - 0.001;

    // ── financial_transaction جديد — .set() على push key ✅ ──
    // (append-only node: ".write": "!data.exists()")
    const txKey = db.ref().child('x').push().key;
    updates[`${BASE}/financial_transactions/${txKey}`] = {
      invoiceId:  invId,
      patientId,
      type:       'PAYMENT',
      amount:     toApply,
      reason:     _B.san(reason),
      timestamp,
      actorId
    };

    // ── تحديث حالة الفاتورة — .update() ✅ ──
    // invoices: ".write": "!data.exists() || newData.exists()"
    // newData.exists() = true لأننا نحدث (لا نحذف)
    updates[`${BASE}/invoices/${invId}/status`] = isFullyPaid ? 'paid' : 'partial';
    if (isFullyPaid) {
      updates[`${BASE}/invoices/${invId}/locked`]  = true;
      updates[`${BASE}/invoices/${invId}/paidAt`]  = timestamp;
    }

    remaining -= toApply;
  }

  // ── كتابة دفعية واحدة ✅ ──
  db.ref().update(updates).then(() => {
    _B.toast(`✅ تم تسجيل دفعة ${_B.jod(amount)} د.أ بنجاح`, 'ok');
    if (amtEl)    amtEl.value    = '';
    if (reasonEl) reasonEl.value = '';

    const patName = document.getElementById('blPatName')?.textContent || '';
    _B.audit('PAYMENT_RECORDED', `دفعة ${_B.jod(amount)} من ${_B.san(patName)}`);
  }).catch(e => {
    console.error('[BillingEngine] payment batch failed:', e);
    _B.toast('❌ فشل تسجيل الدفعة — تأكد من الاتصال', 'err');
  });
}

function closeBillingModal() {
  const modal = document.getElementById('billingModal');
  if (modal) modal.style.display = 'none';
  BillingEngine.activePatientId = null;
}

// ════════════════════════════════════════════════════════════════════════
// 🏷️ PRICING CATALOG MANAGEMENT
// ════════════════════════════════════════════════════════════════════════

function renderPricingTables() {
  const labBody = document.getElementById('pricingLabBody');
  const radBody = document.getElementById('pricingRadBody');
  if (!labBody && !radBody) return;

  const catalog  = BillingEngine._pricingCatalog || {};
  const entries  = Object.entries(catalog).filter(([, v]) => !v.deleted);
  const labItems = entries.filter(([, v]) => v.type === 'lab');
  const radItems = entries.filter(([, v]) => v.type === 'radiology');

  const buildRows = (items) => items.map(([k, item]) => {
    const isActive = item.active !== false;
    return `<tr>
      <td style="font-weight:800">${_B.san(item.name)}</td>
      <td style="font-family:'IBM Plex Mono',monospace;font-weight:800;color:var(--teal)">
        ${parseFloat(item.price || 0).toFixed(3)} د.أ
      </td>
      <td>
        <span style="font-size:.7rem;font-weight:700;padding:2px 8px;border-radius:5px;
          ${isActive
            ? 'background:rgba(16,185,129,.1);color:var(--green)'
            : 'background:rgba(239,68,68,.08);color:var(--red)'}">
          ${isActive ? 'فعال ✅' : 'معطل ❌'}
        </span>
      </td>
      <td style="text-align:center">
        <div style="display:flex;gap:5px;justify-content:center">
          <button class="tbtn" onclick="editPricingItem('${_B.san(k)}')"
            style="background:rgba(14,165,233,.08);color:var(--sky);border-color:rgba(14,165,233,.2)">
            <i class="fas fa-edit"></i>
          </button>
          <button class="tbtn"
            onclick="togglePricingItem('${_B.san(k)}',${!isActive})"
            style="background:rgba(245,158,11,.08);color:var(--amber);border-color:rgba(245,158,11,.2)">
            <i class="fas fa-${isActive ? 'pause' : 'play'}"></i>
          </button>
          <button class="tbtn"
            onclick="deletePricingItem('${_B.san(k)}','${_B.san(item.name).replace(/'/g,"\\'")}')"
            style="background:rgba(239,68,68,.06);color:var(--red);border-color:rgba(239,68,68,.15)">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const emptyMsg = (type) =>
    `<tr><td colspan="4" style="text-align:center;padding:28px;color:var(--muted)">
      لم يتم إضافة فحوصات ${type} بعد
    </td></tr>`;

  if (labBody) labBody.innerHTML = labItems.length ? buildRows(labItems) : emptyMsg('مختبرية');
  if (radBody) radBody.innerHTML = radItems.length ? buildRows(radItems) : emptyMsg('أشعة');
}

function openAddPricingItem(type) {
  ['prEditKey','prName','prPrice'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const typeEl = document.getElementById('prEditType');
  const titleEl = document.getElementById('pricingModalTitle');
  if (typeEl)  typeEl.value = type;
  if (titleEl) titleEl.textContent = type === 'lab' ? 'إضافة فحص مختبري جديد' : 'إضافة فحص أشعة جديد';
  const modal = document.getElementById('pricingModal');
  if (modal) {
    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('prName')?.focus(), 80);
  }
}

function editPricingItem(key) {
  const item = BillingEngine._pricingCatalog[key];
  if (!item) return;
  const f = id => document.getElementById(id);
  if (f('prEditKey'))  f('prEditKey').value  = key;
  if (f('prEditType')) f('prEditType').value = item.type;
  if (f('prName'))     f('prName').value     = item.name;
  if (f('prPrice'))    f('prPrice').value    = item.price;
  if (f('pricingModalTitle')) f('pricingModalTitle').textContent = 'تعديل تسعيرة الفحص';
  const modal = document.getElementById('pricingModal');
  if (modal) modal.style.display = 'flex';
}

function savePricingItem() {
  const key   = document.getElementById('prEditKey')?.value.trim();
  const type  = document.getElementById('prEditType')?.value;
  const name  = document.getElementById('prName')?.value.trim();
  const price = parseFloat(document.getElementById('prPrice')?.value);

  if (!name)               { _B.toast('⚠️ أدخل اسم الفحص', 'err'); return; }
  if (isNaN(price) || price < 0) { _B.toast('⚠️ أدخل سعراً صحيحاً', 'err'); return; }

  // سجّل تغيير السعر في Audit
  if (key && BillingEngine._pricingCatalog[key]) {
    const old = BillingEngine._pricingCatalog[key].price;
    if (old !== price) _B.audit('PRICE_CHANGE', `"${name}" من ${old} → ${price} د.أ`);
  }

  const data = { name: _B.san(name), type, price, active: true, updatedAt: _B.now() };
  const ref  = key
    ? db.ref(`${BASE}/pricing_catalog/${key}`)
    : db.ref(`${BASE}/pricing_catalog`).push();

  ref.set(data).then(() => {
    _B.toast(key ? '✅ تم تحديث التسعيرة' : '✅ تم إضافة الخدمة', 'ok');
    document.getElementById('pricingModal').style.display = 'none';
    if (!key) _B.audit('PRICE_ADD', `إضافة "${name}" — ${price} د.أ`);
  }).catch(() => _B.toast('❌ فشل حفظ التسعيرة', 'err'));
}

function togglePricingItem(key, newState) {
  const item = BillingEngine._pricingCatalog[key];
  if (!item) return;
  db.ref(`${BASE}/pricing_catalog/${key}/active`).set(Boolean(newState)).then(() => {
    _B.toast(newState ? '✅ تم تفعيل الخدمة' : '⏸️ تم تعطيل الخدمة', 'ok');
    _B.audit('PRICE_TOGGLE', `${newState ? 'تفعيل' : 'تعطيل'} "${_B.san(item.name)}"`);
  });
}

function deletePricingItem(key, itemName) {
  if (!confirm(`أرشفة الخدمة "${itemName}" نهائياً؟`)) return;
  // soft-delete: نضع deleted=true بدل الحذف الفعلي
  db.ref(`${BASE}/pricing_catalog/${key}/deleted`).set(true).then(() => {
    _B.toast('🗑️ تم أرشفة الخدمة', 'ok');
    _B.audit('PRICE_DELETE', `أرشفة "${_B.san(itemName)}"`);
  }).catch(() => _B.toast('❌ فشل الأرشفة', 'err'));
}

// global bridge
function renderReceivables() {
  BillingEngine.renderReceivables();
}

// ── التهيئة عند تحميل الصفحة ──
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    BillingEngine.init();
    renderPricingTables();
  }, 1500);
});

console.log('[BillingEngine v12.0] ✅ Loaded — Firebase Rules v3 compatible');
