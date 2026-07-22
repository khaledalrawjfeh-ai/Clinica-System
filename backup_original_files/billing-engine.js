/**
 * 💰 ARGON BILLING ENGINE (ZERO RISK MODE)
 * STRICTLY ADDITIVE - NO MODIFICATION TO EMR/CLINICAL WORKFLOWS
 */

const BillingEngine = {
  _invoices: {},
  _transactions: {},
  _patientsRef: null,
  activePatientId: null,

  init: function () {
    let isAuthorized = false;

    // Check if we are in dashboard.html (which sets clinica_auth_CID)
    if (typeof CID !== 'undefined' && sessionStorage.getItem('clinica_auth_' + CID) === '1') {
      isAuthorized = true; // Dashboard user is inherently an admin
    } else if (window.ArgonSession) {
      // Check standard ArgonSession used in other portals
      const session = window.ArgonSession.get();
      if (session && (session.role === 'admin' || session.role === 'accountant' || session.role === 'superadmin')) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      const btn = document.getElementById('mBilling');
      if (btn) btn.style.display = 'none';
      return;
    }

    const btn = document.getElementById('mBilling');
    if (btn) btn.style.display = 'flex';

    if (typeof db !== 'undefined' && BASE) {
      // 1. Listen for Financial Data
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

      // Listen to Patients for Name Resolution
      db.ref(`${BASE}/patients`).on('value', snap => {
        this._patientsRef = snap.val() || {};
        this.renderReceivables();
        if (this.activePatientId) this.renderPatientLedger(this.activePatientId);
      });

      // 2. Listen for Pricing Catalog (Enterprise Pricing)
      db.ref(`${BASE}/pricing_catalog`).on('value', snap => {
        this._pricingCatalog = snap.val() || {};
      });

      // 2.5 Listen for Billing Policy Settings
      db.ref(`${BASE}/clinic_settings/billingPolicy/departments`).on('value', snap => {
        this._clinicSettingsPolicy = snap.val() || null;
      });

      // 3. Additive Observer — ONLY for Visit Fee (كشفية الطبيب)
      // Lab, Radiology, Pharmacy add their own detailed items when they complete services.
      // This prevents double billing.
      this.initVisitFeeObserver();
    }
  },

  // ── Pricing Catalog Lookup ──
  // Used by lab-app.js and radiology-app.js to get prices per service name
  lookupPrice: function (serviceName, serviceType) {
    const catalog = this._pricingCatalog || {};
    const normalizedName = (serviceName || '').trim().toLowerCase();

    // Search by exact match or partial match on service name
    const entry = Object.values(catalog).find(item => {
      if (!item.active) return false;
      if (serviceType && item.type !== serviceType) return false;
      const catName = (item.name || '').trim().toLowerCase();
      return catName === normalizedName || catName.includes(normalizedName) || normalizedName.includes(catName);
    });

    return entry ? parseFloat(entry.price) : null;
  },

  // ── ENTERPRISE BILLING ENGINE V1.5 ──
  getBillingPolicy: function (dept) {
    const defaults = { lab: 'separate', rad: 'separate', pharmacy: 'dispense' };
    if (this._clinicSettingsPolicy && this._clinicSettingsPolicy[dept]) {
      return this._clinicSettingsPolicy[dept];
    }
    return defaults[dept] || 'separate';
  },

  isDuplicateCharge: function (billingRefId) {
    for (const invKey in this._invoices) {
      const inv = this._invoices[invKey];
      if (inv.items && inv.items.find(i => i.billingReferenceId === billingRefId)) {
        return true;
      }
    }
    return false;
  },

  findVisitInvoice: function (visitId) {
    for (const invKey in this._invoices) {
      const inv = this._invoices[invKey];
      if (inv.visitId === visitId && inv.invoiceType !== 'lab_invoice' && inv.invoiceType !== 'rad_invoice' && inv.invoiceType !== 'pharmacy_invoice') {
        return { id: invKey, ...inv };
      }
    }
    return null;
  },

  addCharge: function (eventData) {
    /* eventData: { patientId, patientName, visitId, department, serviceId, customName, docName } */
    const policy = this.getBillingPolicy(eventData.department);
    const billingRefId = `${CID}-${eventData.visitId}-${eventData.serviceId}-${eventData.department.toUpperCase()}`;

    // 1. Duplicate Prevention
    if (this.isDuplicateCharge(billingRefId)) {
      if (typeof ArgonCore !== 'undefined') ArgonCore.logAudit('DUPLICATE_PREVENTED', `منع فوترة مزدوجة: ${billingRefId}`, 'FINANCE');
      console.warn('ABORT: Duplicate Charge Detected -', billingRefId);
      return false; // ABORT
    }

    // 2. Pricing Source
    const priceInfo = this.lookupPrice(eventData.serviceId, eventData.department);
    let price = priceInfo;
    let requiresReview = false;
    let status = 'unpaid';

    if (price === null) {
      price = 0;
      requiresReview = true;
      status = 'pending_review';
      if (typeof ArgonCore !== 'undefined') ArgonCore.logAudit('MISSING_PRICE', `خدمة غير مسعرة: ${eventData.serviceId}`, 'FINANCE');
    }

    const item = {
      serviceId: eventData.serviceId,
      name: eventData.customName || eventData.serviceId,
      price: price,
      billingReferenceId: billingRefId
    };

    // 3. Apply Policy
    if (policy === 'free') {
      if (typeof ArgonCore !== 'undefined') ArgonCore.logAudit('FREE_SERVICE', `خدمة مجانية مرت بدون فوترة: ${item.name}`, 'FINANCE');
      return true;
    }

    if (policy === 'unified') {
      const visitInv = this.findVisitInvoice(eventData.visitId);
      if (visitInv) {
        if (visitInv.status === 'paid' || visitInv.status === 'partial' || visitInv.status === 'voided' || visitInv.locked) {
           this.createSeparateInvoice(eventData, [item], status, requiresReview, visitInv.id);
           return true;
        } else {
           const currentItems = visitInv.items || [];
           if (currentItems.find(i => i.billingReferenceId === billingRefId)) return false;
           currentItems.push(item);
           let newTotal = currentItems.reduce((acc, curr) => acc + curr.price, 0);
           let newStatus = visitInv.status;
           if (requiresReview) newStatus = 'pending_review';
           db.ref(`${BASE}/invoices/${visitInv.id}`).update({
             items: currentItems,
             total: newTotal,
             status: newStatus
           });
           if (typeof ArgonCore !== 'undefined') ArgonCore.logAudit('INVOICE_UPDATED', `تحديث فاتورة موحدة: إضافة ${item.name}`, 'FINANCE');
           return true;
        }
      } else {
        this.createSeparateInvoice(eventData, [item], status, requiresReview, null);
        return true;
      }
    }

    this.createSeparateInvoice(eventData, [item], status, requiresReview, null);
    return true;
  },

  createSeparateInvoice: function (eventData, items, status, requiresReview, linkedInvoiceId) {
    const newInvId = db.ref().child('invoices').push().key;
    const invTotal = items.reduce((sum, item) => sum + item.price, 0);
    
    const invoice = {
      patientId: eventData.patientId,
      patientName: eventData.patientName || 'غير معروف',
      visitId: eventData.visitId,
      docName: eventData.docName || 'طبيب غير محدد',
      items: items,
      total: invTotal,
      status: requiresReview ? 'pending_review' : 'unpaid',
      invoiceType: `${eventData.department}_invoice`,
      createdAt: new Date().toISOString()
    };

    if (linkedInvoiceId) {
      invoice.linkedInvoiceId = linkedInvoiceId;
      if (typeof ArgonCore !== 'undefined') ArgonCore.logAudit('LINKED_INVOICE_CREATED', `فاتورة تابعة للموحدة المدفوعة: ${linkedInvoiceId}`, 'FINANCE');
    }

    db.ref(`${BASE}/invoices/${newInvId}`).set(invoice);
    if (typeof ArgonCore !== 'undefined') ArgonCore.logAudit('INVOICE_CREATED', `إنشاء فاتورة قسم: ${eventData.department}`, 'FINANCE');
  },

  // ── VISIT FEE OBSERVER (كشفية الطبيب فقط) ──
  initVisitFeeObserver: function () {
    // 1. Listen to Completed Bookings (Fallback/Legacy)
    let initialCmp = true;
    const cmpRef = db.ref(`${BASE}/completedBookings`);
    cmpRef.once('value', () => initialCmp = false);
    cmpRef.on('child_added', snap => {
      if (!initialCmp) this.generateVisitInvoice(snap.key, snap.val());
    });

    // 2. Listen to Active Bookings (Real-time generation)
    let initialBks = true;
    const bksRef = db.ref(`${BASE}/bookings`);
    bksRef.once('value', () => initialBks = false);
    
    bksRef.on('child_added', snap => {
      if (!initialBks) this.generateVisitInvoice(snap.key, snap.val());
    });
    
    // Crucial: Generates invoice the moment patientId is attached to the active booking
    bksRef.on('child_changed', snap => {
      this.generateVisitInvoice(snap.key, snap.val());
    });
  },

  generateVisitInvoice: function (visitId, visitData) {
    if (!visitData || !visitData.patientId) return;
    const invId = `INV-${visitId}`;

    let fee = 15;
    if (typeof _docs !== 'undefined' && _docs[visitData.docId] && _docs[visitData.docId].fee) {
      fee = parseFloat(_docs[visitData.docId].fee);
    }
    const visitItem = { name: 'كشفية الطبيب', price: fee };

    if (this._invoices[invId]) {
      const currentItems = this._invoices[invId].items || [];
      const exists = currentItems.find(i => i.name === visitItem.name);
      if (!exists) {
        currentItems.push(visitItem);
        let newTotal = currentItems.reduce((acc, curr) => acc + curr.price, 0);
        db.ref(`${BASE}/invoices/${invId}`).update({
          items: currentItems,
          total: newTotal
        });
      }
    } else {
      this.saveInvoice(invId, visitData.patientId, visitId, [visitItem], visitData.patName, visitData.patPhone);
    }
  },

  saveInvoice: function (invId, patientId, visitId, items, patName, patPhone) {
    const total = items.reduce((acc, curr) => acc + curr.price, 0);
    const ts = new Date().toISOString();

    const invoiceData = {
      patientId: patientId,
      patientName: patName || '',
      patientPhone: patPhone || '',
      visitId: visitId,
      items: items,
      total: total,
      createdAt: ts,
      nationalInvoiceNumber: "",
      taxNumber: "",
      invoiceUUID: "",
      invoiceStatus: "draft"
    };

    db.ref(`${BASE}/invoices/${invId}`).set(invoiceData);
  },

  // ── MATH UTILS ──
  calculateInvoicePaid: function (invoiceId) {
    let paid = 0;
    Object.values(this._transactions).forEach(tx => {
      if (tx.invoiceId === invoiceId && tx.status !== 'voided') {
        if (tx.type === 'PAYMENT') paid += (parseFloat(tx.amount) || 0);
        if (tx.type === 'REVERSAL') paid -= (parseFloat(tx.amount) || 0);
      }
    });
    return parseFloat(paid.toFixed(2));
  },

  calculatePatientFinancials: function (patientId) {
    let totalBilled = 0;
    let totalPaid = 0;

    const patientInvoices = Object.entries(this._invoices).filter(([k, inv]) => inv.patientId === patientId);

    patientInvoices.forEach(([k, inv]) => {
      totalBilled += (parseFloat(inv.total) || 0);
      totalPaid += this.calculateInvoicePaid(k);
    });

    Object.values(this._transactions).forEach(tx => {
      if (!tx.invoiceId && tx.patientId === patientId && tx.status !== 'voided') {
        if (tx.type === 'PAYMENT') totalPaid += (parseFloat(tx.amount) || 0);
        if (tx.type === 'REVERSAL') totalPaid -= (parseFloat(tx.amount) || 0);
      }
    });

    return {
      total: parseFloat(totalBilled.toFixed(2)),
      paid: parseFloat(totalPaid.toFixed(2)),
      unpaid: parseFloat((totalBilled - totalPaid).toFixed(2))
    };
  },

  // ── RENDERING ──
  renderKPIs: function () {
    let totalReceivables = 0;
    let totalCollected = 0;
    let openCount = 0;
    let overdueCount = 0;

    Object.entries(this._invoices).forEach(([k, inv]) => {
      const total = parseFloat(inv.total) || 0;
      const paid = this.calculateInvoicePaid(k);
      const remaining = parseFloat((total - paid).toFixed(2));

      totalReceivables += remaining;
      totalCollected += paid;

      if (remaining > 0) {
        openCount++;
        if (inv.createdAt) {
          const invDate = new Date(inv.createdAt);
          const diffDays = Math.floor((new Date() - invDate) / (1000 * 60 * 60 * 24));
          if (diffDays > 30) overdueCount++;
        }
      }
    });

    const elTotalPaid = document.getElementById('blTotalPaid');
    const elTotalUnpaid = document.getElementById('blTotalUnpaid');
    const elOpen = document.getElementById('blCountOpen');
    const elOverdue = document.getElementById('blCountOverdue');

    if (elTotalPaid) elTotalPaid.textContent = totalCollected.toFixed(2);
    if (elTotalUnpaid) elTotalUnpaid.textContent = totalReceivables.toFixed(2);
    if (elOpen) elOpen.textContent = openCount;
    if (elOverdue) elOverdue.textContent = overdueCount;
  },

  renderReceivables: function () {
    const tbody = document.getElementById('blTbody');
    if (!tbody) return;

    const searchQ = (document.getElementById('blSearch')?.value || '').trim().toLowerCase();
    const filterQ = document.getElementById('blFilter')?.value || 'all';

    const patientBalances = {};
    const pts = this._patientsRef || {};

    Object.entries(this._invoices).forEach(([k, inv]) => {
      const pid = inv.patientId;
      if (!pid || inv.status === 'voided' || inv.status === 'cancelled') return;

      if (!patientBalances[pid]) {
        patientBalances[pid] = {
          patientId: pid,
          patientName: pts[pid] ? pts[pid].info?.name : (inv.patientName || 'مريض غير معروف'),
          patientPhone: pts[pid] ? pts[pid].info?.phone : (inv.patientPhone || ''),
          total: 0,
          paid: 0,
          hasPendingReview: false,
          lastDate: inv.createdAt || ''
        };
      }

      if (inv.status === 'pending_review' || inv.financialBlocked) {
        patientBalances[pid].hasPendingReview = true;
      }

      patientBalances[pid].total += parseFloat(inv.total) || 0;
      patientBalances[pid].paid += this.calculateInvoicePaid(k);
      if (inv.createdAt && inv.createdAt > patientBalances[pid].lastDate) {
        patientBalances[pid].lastDate = inv.createdAt;
      }
    });

    // Make sure patients with unassigned payments (or missing invoices) are also captured
    Object.values(this._transactions).forEach(tx => {
      const pid = tx.patientId;
      if (!pid || tx.status === 'voided') return;

      if (!patientBalances[pid]) {
        patientBalances[pid] = {
          patientId: pid,
          patientName: pts[pid] ? pts[pid].info?.name : 'مريض غير معروف',
          patientPhone: pts[pid] ? pts[pid].info?.phone : '',
          total: 0,
          paid: 0,
          lastDate: tx.timestamp || ''
        };
      }

      // If this transaction is NOT tied to a known invoice, we must add its value manually here
      if (!tx.invoiceId || !this._invoices[tx.invoiceId]) {
        if (tx.type === 'PAYMENT') patientBalances[pid].paid += (parseFloat(tx.amount) || 0);
        if (tx.type === 'REVERSAL') patientBalances[pid].paid -= (parseFloat(tx.amount) || 0);
      }

      if (tx.timestamp && tx.timestamp > patientBalances[pid].lastDate) {
        patientBalances[pid].lastDate = tx.timestamp;
      }
    });

    let html = '';

    Object.values(patientBalances).forEach(p => {
      p.total = parseFloat(p.total.toFixed(2));
      p.paid = parseFloat(p.paid.toFixed(2));
      const remaining = parseFloat((p.total - p.paid).toFixed(2));

      let status = 'unpaid';
      let statusBadge = '<span style="color:var(--red);background:rgba(239,68,68,0.1);padding:4px 8px;border-radius:6px;font-size:0.7rem;font-weight:bold">غير مدفوع</span>';

      if (p.hasPendingReview) {
        status = 'pending_review';
        statusBadge = '<span style="color:#d97706;background:rgba(245,158,11,0.15);padding:4px 8px;border-radius:6px;font-size:0.7rem;font-weight:bold;border:1px solid rgba(245,158,11,0.4)"><i class="fas fa-exclamation-triangle"></i> بانتظار التسعير</span>';
      } else if (remaining <= 0) {
        status = 'paid';
        statusBadge = '<span style="color:var(--green);background:rgba(16,185,129,0.1);padding:4px 8px;border-radius:6px;font-size:0.7rem;font-weight:bold">مسدد بالكامل</span>';
      } else if (p.paid > 0) {
        status = 'partial';
        statusBadge = '<span style="color:var(--amber);background:rgba(245,158,11,0.1);padding:4px 8px;border-radius:6px;font-size:0.7rem;font-weight:bold">دفع جزئي</span>';
      } else {
        const diffDays = Math.floor((new Date() - new Date(p.lastDate || new Date())) / (1000 * 60 * 60 * 24));
        if (diffDays > 30) {
          status = 'overdue';
          statusBadge = '<span style="color:#ef4444;background:rgba(239,68,68,0.15);padding:4px 8px;border-radius:6px;font-size:0.7rem;font-weight:bold;border:1px solid rgba(239,68,68,0.4)">متأخر الدفع</span>';
        }
      }

      if (filterQ !== 'all') {
        if (filterQ === 'unpaid' && status !== 'unpaid' && status !== 'pending_review') return;
        if (filterQ === 'partial' && status !== 'partial') return;
        if (filterQ === 'overdue' && status !== 'overdue') return;
      }

      if (searchQ) {
        const phoneDigits = (p.patientPhone || '').replace(/\D/g, '');
        if (!p.patientName.toLowerCase().includes(searchQ) && !phoneDigits.includes(searchQ)) return;
      }

      if (status === 'paid' && !searchQ && filterQ !== 'all') return;

      html += `
        <tr>
          <td>
            <div style="font-weight:800;color:var(--teal)">${BillingEngine.sanitize(p.patientName)}</div>
            <div style="font-size:0.7rem;color:var(--muted);font-family:'IBM Plex Mono',monospace">${p.patientId.substring(0, 8)}...</div>
          </td>
          <td style="font-weight:bold">${p.total.toFixed(2)}</td>
          <td style="color:var(--green);font-weight:bold">${p.paid.toFixed(2)}</td>
          <td style="color:var(--red);font-weight:bold">${remaining.toFixed(2)}</td>
          <td>${statusBadge}</td>
          <td style="text-align:center">
            <button class="tbtn" onclick="BillingEngine.openPatientLedger('${p.patientId}')" style="background:rgba(13,148,136,.1);color:var(--teal);border-color:rgba(13,148,136,.2)">عرض كشف الحساب</button>
          </td>
        </tr>
      `;
    });

    if (!html) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--muted)">لا توجد ذمم مطابقة للبحث</td></tr>';
    } else {
      tbody.innerHTML = html;
    }
  },

  openPatientLedger: function (patientId) {
    this.activePatientId = patientId;
    const pts = this._patientsRef || {};

    let patName = 'مريض غير معروف';
    let patPhone = '';

    if (pts[patientId]) {
      patName = pts[patientId].info?.name;
      patPhone = pts[patientId].info?.phone;
    } else {
      const inv = Object.values(this._invoices).find(i => i.patientId === patientId);
      if (inv) {
        patName = inv.patientName || patName;
        patPhone = inv.patientPhone || '';
      }
    }

    document.getElementById('blPatName').textContent = patName;
    document.getElementById('blPatUID').textContent = 'UID: ' + patientId;

    const waBtn = document.getElementById('blWaBtn');
    if (waBtn) {
      if (patPhone) {
        waBtn.style.display = 'flex';
        waBtn.onclick = () => {
          let num = patPhone.replace(/\D/g, '');
          if (num.startsWith('07')) num = '962' + num.substring(1);

          const rem = this.calculatePatientFinancials(patientId);
          if (rem.unpaid <= 0) {
            alert('المريض لا يملك ذمم مسجلة.');
            return;
          }

          const msg = encodeURIComponent(`السلام عليكم السيد/ة ${patName}،\nنود تذكيركم بوجود رصيد مستحق بقيمة ${rem.unpaid.toFixed(2)} دينار.\nيرجى مراجعة العيادة لتسوية الرصيد.\nشكراً لتعاونكم.`);
          window.open(`https://wa.me/${num}?text=${msg}`, '_blank');

          if (typeof ArgonCore !== 'undefined') ArgonCore.logAudit('WA_REMINDER', `إرسال تذكير مالي للمريض ${patName}`, 'BILLING');
        };
      } else {
        waBtn.style.display = 'none';
      }
    }

    this.renderPatientLedger(patientId);
    document.getElementById('billingModal').style.display = 'flex';
  },

  renderPatientLedger: function (patientId) {
    const fin = this.calculatePatientFinancials(patientId);
    document.getElementById('blLedgerTotal').textContent = fin.total.toFixed(2);
    document.getElementById('blLedgerPaid').textContent = fin.paid.toFixed(2);
    document.getElementById('blLedgerUnpaid').textContent = fin.unpaid.toFixed(2);

    const invBody = document.getElementById('blInvoicesBody');
    let invHtml = '';

    const pInvoices = Object.entries(this._invoices)
      .filter(([k, inv]) => inv.patientId === patientId)
      .sort((a, b) => (b[1].createdAt || '').localeCompare(a[1].createdAt || ''));

    pInvoices.forEach(([k, inv]) => {
      const total = parseFloat(inv.total) || 0;
      const paid = this.calculateInvoicePaid(k);
      const remaining = parseFloat((total - paid).toFixed(2));
      const dateStr = inv.createdAt ? new Date(inv.createdAt).toLocaleString('ar-JO') : '\u2014';

      // Categorize items by department
      const cats = { consult: [], lab: [], rad: [], pharm: [], other: [] };
      (inv.items || []).forEach(i => {
        const n = (i.name || '').toLowerCase();
        if (n.includes('\u0643\u0634\u0641\u064a\u0629') || n.includes('consultation')) cats.consult.push(i);
        else if (n.includes('\u062a\u062d\u0644\u064a\u0644') || n.includes('lab')) cats.lab.push(i);
        else if (n.includes('\u062a\u0635\u0648\u064a\u0631') || n.includes('\u0623\u0634\u0639\u0629') || n.includes('rad') || n.includes('x-ray') || n.includes('mri') || n.includes('ct')) cats.rad.push(i);
        else if (n.includes('\u0635\u064a\u062f\u0644') || n.includes('\u062f\u0648\u0627\u0621') || n.includes('pharm')) cats.pharm.push(i);
        else cats.other.push(i);
      });

      const renderCat = (icon, label, color, items) => {
        if (!items.length) return '';
        const sub = items.reduce((a, i) => a + (parseFloat(i.price) || 0), 0);
        return `<div style="margin-bottom:6px">
          <div style="font-size:0.72rem;font-weight:800;color:${color};margin-bottom:3px">${icon} ${label}</div>
          ${items.map(i => {
          const isPending = i.requiresBillingReview;
          const itemBg = isPending ? 'rgba(239,68,68,0.1)' : 'rgba(0,0,0,0.02)';
          const itemBorder = isPending ? '1px solid rgba(239,68,68,0.3)' : '1px solid var(--border)';
          const priceHtml = isPending ? `<span style="color:var(--red);font-size:0.65rem;font-weight:bold">⚠️ قيد المراجعة</span>` : `<span style="font-family:'IBM Plex Mono',monospace;font-weight:bold;color:${color};font-size:0.78rem">${parseFloat(i.price).toFixed(2)}</span>`;
          return `<div style="display:flex;justify-content:space-between;align-items:center;background:${itemBg};padding:2px 6px;border-radius:4px;border:${itemBorder};margin-bottom:2px">
              <span style="font-size:0.78rem;${isPending ? 'color:var(--red)' : ''}">${BillingEngine.sanitize(i.name)}</span>
              ${priceHtml}
            </div>`;
        }).join('')}
          <div style="text-align:left;font-size:0.68rem;color:var(--muted);font-family:'IBM Plex Mono',monospace">مجموع: ${sub.toFixed(2)} د.أ</div>
        </div>`;
      };

      let itemsHtml = '<div style="display:flex;flex-direction:column;gap:2px">';
      itemsHtml += renderCat('🏥', 'كشفية الطبيب', 'var(--teal)', cats.consult);
      itemsHtml += renderCat('🔬', 'فحوصات المختبر', 'var(--green)', cats.lab);
      itemsHtml += renderCat('🩻', 'صور الأشعة', 'var(--sky)', cats.rad);
      itemsHtml += renderCat('💊', 'الصيدلية', 'var(--amber)', cats.pharm);
      itemsHtml += renderCat('📋', 'خدمات أخرى', 'var(--purple)', cats.other);
      itemsHtml += '</div>';

      let isLocked = false;
      let status = '<span style="color:var(--red);font-size:0.7rem">غير مدفوعة</span>';
      if (inv.status === 'pending') status = '<span style="color:var(--amber);font-size:0.7rem;font-weight:bold">⚠️ بانتظار التسعير</span>';
      else if (remaining <= 0 && total > 0) { status = '<span style="color:var(--green);font-size:0.7rem">مدفوعة بالكامل</span>'; isLocked = true; }
      else if (paid > 0) { status = '<span style="color:var(--amber);font-size:0.7rem">دفع جزئي</span>'; isLocked = true; }
      else if (inv.status === 'paid') { status = '<span style="color:var(--green);font-size:0.7rem">مدفوعة بالكامل</span>'; isLocked = true; }
      else if (inv.status === 'cancelled' || inv.status === 'voided') { status = '<span style="color:var(--muted);font-size:0.7rem">ملغاة</span>'; isLocked = true; }

      const editBtn = isLocked 
        ? `<button class="tbtn" disabled style="background:rgba(156,163,175,0.1);color:var(--muted);border-color:rgba(156,163,175,0.2);cursor:not-allowed" title="فاتورة مقفلة مالياً 🔒"><i class="fas fa-lock"></i></button>`
        : `<button class="tbtn" onclick="BillingEngine.openInvoiceEditor('${k}')" style="background:rgba(14,165,233,.1);color:var(--sky);border-color:rgba(14,165,233,.2)" title="تعديل الفاتورة"><i class="fas fa-edit"></i></button>`;

      invHtml += `
        <tr>
          <td style="font-size:0.75rem">${dateStr}</td>
          <td style="font-size:0.75rem;min-width:240px;">${itemsHtml}</td>
          <td style="font-weight:bold;font-family:'IBM Plex Mono',monospace;font-size:1.1rem;color:var(--text)">${total.toFixed(2)}</td>
          <td>${status}</td>
          <td style="text-align:center;">${editBtn}</td>
        </tr>
      `;
    });

    invBody.innerHTML = invHtml || '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:20px">\u0644\u0627 \u062a\u0648\u062c\u062f \u0645\u0637\u0627\u0644\u0628\u0627\u062a</td></tr>';

    const payBody = document.getElementById('blPaymentsBody');
    let payHtml = '';
    let lastDate = '--';

    const pTx = Object.entries(this._transactions)
      .filter(([k, tx]) => tx.patientId === patientId && tx.status !== 'voided')
      .sort((a, b) => (b[1].timestamp || '').localeCompare(a[1].timestamp || ''));

    pTx.forEach(([k, tx], idx) => {
      if (idx === 0 && tx.timestamp) lastDate = new Date(tx.timestamp).toLocaleDateString('ar-JO');
      const dateStr = tx.timestamp ? new Date(tx.timestamp).toLocaleString('ar-JO') : '\u2014';
      const isRev = tx.type === 'REVERSAL';
      const color = isRev ? 'var(--red)' : 'var(--green)';
      const sign = isRev ? '-' : '+';

      payHtml += `
        <tr>
          <td style="font-size:0.75rem">
            <div>${dateStr}</div>
            <div style="font-size:0.6rem;color:var(--muted)">${BillingEngine.sanitize(tx.reason || '')}</div>
          </td>
          <td style="font-weight:bold;color:${color};font-family:'IBM Plex Mono',monospace">${sign}${parseFloat(tx.amount).toFixed(2)}</td>
        </tr>
      `;
    });

    document.getElementById('blLedgerLastPay').textContent = lastDate;
    payBody.innerHTML = payHtml || '<tr><td colspan="2" style="text-align:center;color:var(--muted);padding:20px">\u0644\u0627 \u062a\u0648\u062c\u062f \u062d\u0631\u0643\u0627\u062a \u0645\u0627\u0644\u064a\u0629</td></tr>';
  },

  // ── ENTERPRISE PRINT INVOICE (JOFOTARA-Ready) ──
  printPatientInvoice: function () {
    const pid = this.activePatientId;
    if (!pid) return;

    const pts = this._patientsRef || {};
    const pat = pts[pid] || {};
    const info = pat.info || {};
    const patName = info.name || 'مريض غير معروف';
    const patPhone = info.phone || '';
    const patNID = info.nationalId || '';
    const fin = this.calculatePatientFinancials(pid);

    // Clinic info from settings
    const clinicName = (typeof _sets !== 'undefined' && _sets.name) ? _sets.name : 'العيادة';
    const clinicPhone = (typeof _sets !== 'undefined' && _sets.phone) ? _sets.phone : '';
    const clinicAddr = (typeof _sets !== 'undefined' && _sets.address) ? _sets.address : '';
    const clinicLogo = (typeof _sets !== 'undefined' && _sets.logo) ? _sets.logo : '';
    const clinicTax = (typeof _sets !== 'undefined' && _sets.taxNumber) ? _sets.taxNumber : 'غير متوفر';

    // Collect ALL items across all invoices for this patient
    const pInvoices = Object.entries(this._invoices)
      .filter(([k, inv]) => inv.patientId === pid)
      .sort((a, b) => (a[1].createdAt || '').localeCompare(b[1].createdAt || ''));

    // Categorize items
    const cats = { consult: [], lab: [], rad: [], pharm: [], other: [] };
    pInvoices.forEach(([k, inv]) => {
      (inv.items || []).forEach(i => {
        const n = (i.name || '').toLowerCase();
        const price = parseFloat(i.price) || 0;
        const item = { name: BillingEngine.sanitize(i.name), price: price, date: inv.createdAt };
        if (n.includes('كشفية') || n.includes('consultation')) cats.consult.push(item);
        else if (n.includes('تحليل') || n.includes('lab')) cats.lab.push(item);
        else if (n.includes('تصوير') || n.includes('أشعة') || n.includes('rad') || n.includes('x-ray') || n.includes('mri') || n.includes('ct')) cats.rad.push(item);
        else if (n.includes('صيدل') || n.includes('دواء') || n.includes('pharm')) cats.pharm.push(item);
        else cats.other.push(item);
      });
    });

    let itemCounter = 1;
    const renderRows = (arr, deptName) => {
      return arr.map(i => `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center">${itemCounter++}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:700">${i.name}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b">${deptName}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center">1</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;font-family:'IBM Plex Mono',monospace">${i.price.toFixed(2)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:bold;font-family:'IBM Plex Mono',monospace">${i.price.toFixed(2)}</td>
        </tr>
      `).join('');
    };

    let rowsHtml = '';
    rowsHtml += renderRows(cats.consult, 'كشفية طبية');
    rowsHtml += renderRows(cats.lab, 'مختبر');
    rowsHtml += renderRows(cats.rad, 'أشعة');
    rowsHtml += renderRows(cats.pharm, 'صيدلية');
    rowsHtml += renderRows(cats.other, 'أخرى');
    
    if(!rowsHtml) {
        rowsHtml = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#94a3b8;">لا توجد خدمات طبية مسجلة في هذه الفاتورة</td></tr>';
    }

    const dateNow = new Date().toLocaleDateString('ar-JO', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const timeNow = new Date().toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' });
    const invNum = 'INV-' + (pid || '').substring(0, 8).toUpperCase();

    // QR Code data (JOFOTARA Standard simplified)
    const qrData = encodeURIComponent(`العيادة: ${clinicName}\nالرقم الضريبي: ${clinicTax}\nرقم الفاتورة: ${invNum}\nالتاريخ: ${dateNow} ${timeNow}\nالإجمالي: ${fin.total.toFixed(2)} JOD`);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${qrData}`;

    const logoHtml = clinicLogo ? `<img src="${clinicLogo}" style="max-height:70px;max-width:120px;object-fit:contain;border-radius:8px" crossorigin="anonymous">` : '<div style="width:70px;height:70px;background:#f1f5f9;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:2rem;border:2px dashed #cbd5e1">🏥</div>';

    const printHtml = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<title>فاتورة طبية ضريبية - ${BillingEngine.sanitize(patName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Tajawal',sans-serif;color:#1e293b;background:#fff;direction:rtl;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{size:A4;margin:15mm 12mm}
.inv{max-width:780px;margin:0 auto;padding:20px}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0d9488;padding-bottom:18px;margin-bottom:18px}
.hdr-right{display:flex;align-items:center;gap:14px}
.hdr h1{font-size:1.6rem;color:#0d9488;font-weight:900;margin-bottom:4px}
.hdr-left{text-align:left; display:flex; gap: 15px; align-items:flex-start;}
.hdr-left h2{font-size:1.1rem;color:#334155;margin-bottom:4px;font-weight:900;}
.qr-code { width: 90px; height: 90px; border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px; }
.pat-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;margin-bottom:16px;display:grid;grid-template-columns:1fr 1fr;gap:8px}
.pat-box b{color:#475569}
table{width:100%;border-collapse:collapse;margin-bottom:16px}
thead tr{background:#0d9488;color:#fff}
thead th{padding:10px;font-weight:700;font-size:0.85rem;border:1px solid #0f766e;}
tbody td{font-size:0.9rem;}
.summary{display:flex;justify-content:flex-end;margin-bottom:20px}
.summary-box{width:320px;border:2px solid #0d9488;border-radius:10px;overflow:hidden}
.summary-row{display:flex;justify-content:space-between;padding:8px 14px;font-size:0.9rem;border-bottom:1px solid #e2e8f0}
.summary-row:last-child{border-bottom:none;background:#0d9488;color:#fff;font-weight:900;font-size:1.1rem}
.stamp-area{margin-top:30px;display:flex;justify-content:space-between;align-items:flex-end}
.stamp-box{width:200px;text-align:center}
.stamp-box .line{border-bottom:2px dashed #94a3b8;height:60px;margin-bottom:8px}
.stamp-box .label{color:#475569;font-weight:700;font-size:0.85rem}
.footer{margin-top:30px;text-align:center;color:#94a3b8;font-size:0.75rem;border-top:1px solid #e2e8f0;padding-top:14px}
@media print{body{background:#fff}.inv{padding:0}}</style></head>
<body><div class="inv">
<div class="hdr">
  <div class="hdr-right">${logoHtml}<div>
    <h1>${BillingEngine.sanitize(clinicName)}</h1>
    <p style="color:#64748b;font-size:0.85rem">${BillingEngine.sanitize(clinicAddr)}</p>
    <p style="color:#64748b;font-size:0.85rem">هاتف: <span dir="ltr">${BillingEngine.sanitize(clinicPhone)}</span></p>
    <p style="color:#64748b;font-size:0.85rem;font-weight:bold;margin-top:2px;">الرقم الضريبي: ${BillingEngine.sanitize(clinicTax)}</p>
  </div></div>
  <div class="hdr-left">
    <div>
      <h2>فاتورة طبية ضريبية</h2>
      <p style="color:#64748b;font-size:0.85rem">رقم الفاتورة: ${invNum}</p>
      <p style="color:#64748b;font-size:0.85rem">التاريخ: ${dateNow}</p>
      <p style="color:#64748b;font-size:0.85rem">الوقت: ${timeNow}</p>
    </div>
    <img src="${qrUrl}" alt="QR Code" class="qr-code" onerror="this.style.display='none'">
  </div>
</div>
<div class="pat-box">
  <div><b>اسم المريض:</b> ${BillingEngine.sanitize(patName)}</div>
  <div><b>رقم الهاتف:</b> <span dir="ltr">${BillingEngine.sanitize(patPhone) || '—'}</span></div>
  <div><b>الرقم الوطني:</b> ${BillingEngine.sanitize(patNID) || '—'}</div>
  <div><b>الرقم المرجعي (UID):</b> <span dir="ltr" style="font-family:'IBM Plex Mono',monospace;font-size:0.8rem">${(pid || '').substring(0, 12)}</span></div>
</div>
<table>
  <thead>
    <tr><th>#</th><th>البيان (اسم الخدمة)</th><th>القسم الطبي</th><th>الكمية</th><th>السعر الإفرادي</th><th>المجموع (د.أ)</th></tr>
  </thead>
  <tbody>${rowsHtml}</tbody>
</table>
<div class="summary"><div class="summary-box">
  <div class="summary-row"><span>المجموع الإجمالي</span><span style="font-family:'IBM Plex Mono',monospace">${fin.total.toFixed(2)} د.أ</span></div>
  <div class="summary-row"><span>المدفوع مسبقاً</span><span style="font-family:'IBM Plex Mono',monospace;color:#10b981">${fin.paid.toFixed(2)} د.أ</span></div>
  <div class="summary-row"><span>الرصيد المستحق (الذمم)</span><span style="font-family:'IBM Plex Mono',monospace">${fin.unpaid.toFixed(2)} د.أ</span></div>
</div></div>
<div class="stamp-area">
  <div style="color:#94a3b8;font-size:0.82rem">ملاحظة: هذه الفاتورة صادرة إلكترونياً من النظام الطبي ومطابقة لمعايير الفوترة الأردنية.<br>يرجى الاحتفاظ بها لأغراض المراجعة والتأمين.</div>
  <div class="stamp-box"><div class="line"></div><div class="label">ختم العيادة والتوقيع</div></div>
</div>
<div class="footer">تم إصدار هذه الفاتورة بواسطة ARGON Medical OS — نظام إدارة العيادات والمجمعات الطبية</div>
</div><script>window.onload=function(){setTimeout(function(){window.print();}, 500); window.onafterprint=function(){window.close();}}</script></body></html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    if (win) { win.document.write(printHtml); win.document.close(); }
  },

  // ── INVOICE EDITOR (Admin Only) ──
  activeEditInvId: null,
  activeEditItems: [],

  openInvoiceEditor: function(invId) {
    if (sessionStorage.getItem('clinica_auth_' + CID) !== '1') {
      return toast('⚠️ صلاحيات الإدارة العليا فقط', 'err');
    }
    const inv = this._invoices[invId];
    if (!inv) return;

    if (inv.status === 'paid' || inv.status === 'voided' || inv.status === 'cancelled') {
      return toast('🔒 الفاتورة مقفلة مالياً. لا يمكن التعديل', 'err');
    }

    this.activeEditInvId = invId;
    this.activeEditItems = JSON.parse(JSON.stringify(inv.items || []));
    
    document.getElementById('invEdId').textContent = invId;
    document.getElementById('invEdStatus').innerHTML = inv.status === 'pending' ? '<span style="color:var(--amber)">⚠️ بانتظار التسعير</span>' : '<span style="color:var(--sky)">قيد المراجعة</span>';
    
    this.renderInvoiceEditorItems();
    document.getElementById('invoiceEditorModal').style.display = 'flex';
  },

  renderInvoiceEditorItems: function() {
    const tbody = document.getElementById('invEdItemsBody');
    let html = '';
    let total = 0;

    this.activeEditItems.forEach((item, idx) => {
      const price = parseFloat(item.price || 0);
      total += price;
      html += `
        <tr style="border-bottom:1px solid rgba(0,0,0,0.05)">
          <td style="padding:6px 10px;">
            <input type="text" class="mfi" value="${this.sanitize(item.name)}" onchange="BillingEngine.updateInvoiceItemName(${idx}, this.value)" style="padding:4px; font-size:0.8rem; margin:0; border:none; background:transparent;">
          </td>
          <td style="padding:6px 10px;">
            <input type="number" class="mfi" value="${price.toFixed(2)}" step="0.01" onchange="BillingEngine.updateInvoiceItemPrice(${idx}, this.value)" style="padding:4px; font-size:0.8rem; margin:0; font-family:'IBM Plex Mono',monospace; border:none; background:transparent;">
          </td>
          <td style="padding:6px 10px; text-align:center;">
             <!-- No delete allowed per rules, only voiding whole invoice or setting price to 0 -->
          </td>
        </tr>
      `;
    });

    if (this.activeEditItems.length === 0) {
      html = '<tr><td colspan="3" style="text-align:center; padding:20px; color:var(--muted)">لا توجد بنود</td></tr>';
    }

    tbody.innerHTML = html;
    document.getElementById('invEdTotal').textContent = total.toFixed(2);
  },

  updateInvoiceItemName: function(idx, newName) {
    if(this.activeEditItems[idx]) this.activeEditItems[idx].name = newName.trim();
  },

  updateInvoiceItemPrice: function(idx, newPrice) {
    if(this.activeEditItems[idx]) {
      this.activeEditItems[idx].price = parseFloat(newPrice) || 0;
      this.renderInvoiceEditorItems();
    }
  },

  addInvoiceItemUI: function() {
    const nameInp = document.getElementById('invEdNewName');
    const priceInp = document.getElementById('invEdNewPrice');
    const name = nameInp.value.trim();
    const price = parseFloat(priceInp.value) || 0;

    if (!name) return toast('أدخل اسم البند', 'err');
    
    this.activeEditItems.push({
      id: 'ITM-' + Date.now(),
      name: name,
      price: price
    });

    nameInp.value = '';
    priceInp.value = '';
    this.renderInvoiceEditorItems();
  },

  addTax16UI: function() {
    const total = this.activeEditItems.reduce((acc, itm) => acc + (parseFloat(itm.price) || 0), 0);
    const tax = total * 0.16;
    this.activeEditItems.push({
      id: 'ITM-TAX-' + Date.now(),
      name: 'ضريبة مبيعات 16%',
      price: parseFloat(tax.toFixed(2))
    });
    this.renderInvoiceEditorItems();
  },

  voidInvoiceUI: function() {
    if (!confirm('هل أنت متأكد من إبطال هذه الفاتورة؟ ستصبح قيمتها 0.')) return;
    const invId = this.activeEditInvId;
    const inv = this._invoices[invId];
    const session = window.ArgonSession ? window.ArgonSession.get() : {};
    db.ref(`${BASE}/invoices/${invId}`).update({
      status: 'voided',
      locked: true,
      originalTotal: inv.total || 0,
      voidAmount: inv.total || 0,
      voidedAt: new Date().toISOString(),
      voidedBy: session.staffId || 'Admin',
      voidReason: prompt('سبب الإبطال:', 'إلغاء') || 'إلغاء'
    }).then(() => {
      // Create Audit Log
      const logRef = db.ref(`${BASE}/audit_logs`).push();
      logRef.set({
        invoiceId: invId,
        action: 'VOID_INVOICE',
        editedBy: 'Admin',
        timestamp: new Date().toISOString()
      });
      toast('تم إبطال الفاتورة', 'ok');
      document.getElementById('invoiceEditorModal').style.display = 'none';
    });
  },

  saveEditedInvoice: function() {
    const invId = this.activeEditInvId;
    const inv = this._invoices[invId];
    if (!inv) return;

    const newTotal = this.activeEditItems.reduce((acc, itm) => acc + (parseFloat(itm.price) || 0), 0);
    const oldTotal = parseFloat(inv.total || 0);
    
    db.ref(`${BASE}/invoices/${invId}`).update({
      items: this.activeEditItems,
      total: newTotal,
      status: newTotal > 0 ? 'unpaid' : 'unpaid'
    }).then(() => {
      // Save Delta Audit Log
      const logRef = db.ref(`${BASE}/audit_logs`).push();
      logRef.set({
        invoiceId: invId,
        action: 'EDIT_INVOICE_ITEMS',
        field: 'total',
        oldValue: oldTotal,
        newValue: newTotal,
        editedBy: 'Admin',
        timestamp: new Date().toISOString()
      });
      
      toast('تم حفظ الفاتورة بنجاح', 'ok');
      document.getElementById('invoiceEditorModal').style.display = 'none';
    });
  },

  sanitize: function (s) {
    return String(s || '').replace(/[<>"']/g, '').trim();
  }
};

function recordBillingPayment() {
  const patientId = BillingEngine.activePatientId;
  if (!patientId) return;

  const amountInput = document.getElementById('blPayAmount');
  const reasonInput = document.getElementById('blPayReason');
  const amount = parseFloat(amountInput.value);
  const reason = reasonInput.value.trim();

  if (isNaN(amount) || amount <= 0) {
    if (typeof toast !== 'undefined') toast('⚠️ يرجى إدخال مبلغ صحيح', 'err');
    return;
  }

  // Task 4: Prevent payment collection if any invoice is financialBlocked
  const hasBlocked = Object.values(BillingEngine._invoices).some(inv => inv.patientId === patientId && inv.financialBlocked);
  if (hasBlocked) {
    if (typeof toast !== 'undefined') toast('⛔ لا يمكن تحصيل الدفعات: يوجد فواتير قيد المراجعة المالية', 'err');
    return;
  }

  const pInvoices = Object.entries(BillingEngine._invoices)
    .filter(([k, inv]) => inv.patientId === patientId && inv.status !== 'voided' && inv.status !== 'cancelled')
    .sort((a, b) => (a[1].createdAt || '').localeCompare(b[1].createdAt || ''));

  let totalUnallocated = 0;
  pInvoices.forEach(([_, inv]) => {
    const t = parseFloat(inv.total) || 0;
    const p = BillingEngine.calculateInvoicePaid(_);
    totalUnallocated += (t - p);
  });

  if (amount > totalUnallocated) {
    if (typeof toast !== 'undefined') toast('⛔ مرفوض: المبلغ يتجاوز الرصيد المستحق (يمنع الرصيد السالب). المستحق: ' + totalUnallocated.toFixed(2), 'err');
    return;
  }

  let remainingPayment = amount;
  const updates = {};
  const timestamp = new Date().toISOString();
  const session = window.ArgonSession ? window.ArgonSession.get() : {};

  // FIFO Allocation
  for (let i = 0; i < pInvoices.length; i++) {
    if (remainingPayment <= 0) break;

    const [invId, inv] = pInvoices[i];
    const total = parseFloat(inv.total) || 0;
    const paid = BillingEngine.calculateInvoicePaid(invId);
    const unallocated = total - paid;

    if (unallocated > 0) {
      const allocAmount = Math.min(unallocated, remainingPayment);
      const txId = db.ref().child('financial_transactions').push().key;
      updates[`${BASE}/financial_transactions/${txId}`] = {
        invoiceId: invId,
        patientId: patientId,
        type: 'PAYMENT',
        amount: parseFloat(allocAmount.toFixed(2)),
        reason: reason || 'تسديد دفعة',
        timestamp: timestamp,
        actorId: session.staffId || 'unknown'
      };

      // Strict Invoice Lock Policy: If fully paid, lock the invoice
      if (Math.abs(unallocated - allocAmount) < 0.01) {
        updates[`${BASE}/invoices/${invId}/status`] = 'paid';
        updates[`${BASE}/invoices/${invId}/locked`] = true;
      } else if (allocAmount > 0) {
        updates[`${BASE}/invoices/${invId}/status`] = 'partial';
      }

      remainingPayment -= allocAmount;
    }
  }

  db.ref().update(updates).then(() => {
    if (typeof toast !== 'undefined') toast('✅ تم تسجيل وتوثيق الدفعة بنجاح', 'ok');
    amountInput.value = '';
    reasonInput.value = '';

    if (typeof ArgonCore !== 'undefined') {
      const pName = document.getElementById('blPatName').textContent;
      ArgonCore.logAudit('PAYMENT_RECORD', `استلام مبلغ ${amount} من المريض ${pName}`, 'BILLING');
    }
  }).catch(e => {
    if (typeof toast !== 'undefined') toast('❌ حدث خطأ أثناء توثيق الدفعة', 'err');
    console.error(e);
  });
}

function closeBillingModal() {
  document.getElementById('billingModal').style.display = 'none';
  BillingEngine.activePatientId = null;
}

// ══════════════════════════════════════════════════════
// 🏷️ PRICING CATALOG MANAGEMENT (Enterprise)
// ══════════════════════════════════════════════════════

let _pricingCatalog = {};

function initPricingCatalog() {
  db.ref(`${BASE}/pricing_catalog`).on('value', snap => {
    const data = snap.val() || {};
    _pricingCatalog = {};
    for (let k in data) {
      if (!data[k].deleted) {
        _pricingCatalog[k] = data[k];
      }
    }
    renderPricingTables();
  });

  // Show pricing button if billing is visible
  const pricingBtn = document.getElementById('mPricing');
  const billingBtn = document.getElementById('mBilling');
  if (pricingBtn && billingBtn && billingBtn.style.display === 'flex') {
    pricingBtn.style.display = 'flex';
  }
}

function renderPricingTables() {
  const labBody = document.getElementById('pricingLabBody');
  const radBody = document.getElementById('pricingRadBody');
  if (!labBody || !radBody) return;

  const entries = Object.entries(_pricingCatalog);
  const labItems = entries.filter(([k, v]) => v.type === 'lab');
  const radItems = entries.filter(([k, v]) => v.type === 'radiology');

  // Lab Table
  if (!labItems.length) {
    labBody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--muted)">لم يتم إضافة فحوصات مختبرية بعد. اضغط "إضافة فحص" للبدء.</td></tr>';
  } else {
    labBody.innerHTML = labItems.map(([k, item]) => {
      const statusBadge = item.active !== false
        ? '<span style="color:var(--green);background:rgba(16,185,129,0.1);padding:3px 8px;border-radius:6px;font-size:0.7rem;font-weight:bold">مفعّل ✅</span>'
        : '<span style="color:var(--red);background:rgba(239,68,68,0.1);padding:3px 8px;border-radius:6px;font-size:0.7rem;font-weight:bold">معطّل ❌</span>';
      return `
        <tr>
          <td style="font-weight:800"><i class="fas fa-flask" style="color:var(--green);margin-left:6px"></i>${sanitize(item.name)}</td>
          <td style="font-weight:bold;font-family:'IBM Plex Mono',monospace;color:var(--teal);font-size:1.05rem">${parseFloat(item.price).toFixed(2)} د.أ</td>
          <td>${statusBadge}</td>
          <td style="text-align:center;display:flex;gap:6px;justify-content:center">
            <button class="tbtn" onclick="editPricingItem('${k}')" style="background:rgba(14,165,233,.1);color:var(--sky);border-color:rgba(14,165,233,.2)" title="تعديل"><i class="fas fa-edit"></i></button>
            <button class="tbtn" onclick="togglePricingItem('${k}',${item.active !== false ? 'false' : 'true'})" style="background:rgba(245,158,11,.1);color:var(--amber);border-color:rgba(245,158,11,.2)" title="${item.active !== false ? 'تعطيل' : 'تفعيل'}"><i class="fas fa-${item.active !== false ? 'pause' : 'play'}"></i></button>
            <button class="tbtn" onclick="deletePricingItem('${k}', '${sanitize(item.name).replace(/'/g, "\\'")}')" style="background:rgba(239,68,68,.1);color:var(--red);border-color:rgba(239,68,68,.2)" title="حذف نهائي"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`;
    }).join('');
  }

  // Radiology Table
  if (!radItems.length) {
    radBody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--muted)">لم يتم إضافة فحوصات أشعة بعد. اضغط "إضافة فحص" للبدء.</td></tr>';
  } else {
    radBody.innerHTML = radItems.map(([k, item]) => {
      const statusBadge = item.active !== false
        ? '<span style="color:var(--green);background:rgba(16,185,129,0.1);padding:3px 8px;border-radius:6px;font-size:0.7rem;font-weight:bold">مفعّل ✅</span>'
        : '<span style="color:var(--red);background:rgba(239,68,68,0.1);padding:3px 8px;border-radius:6px;font-size:0.7rem;font-weight:bold">معطّل ❌</span>';
      return `
        <tr>
          <td style="font-weight:800"><i class="fas fa-x-ray" style="color:var(--sky);margin-left:6px"></i>${sanitize(item.name)}</td>
          <td style="font-weight:bold;font-family:'IBM Plex Mono',monospace;color:var(--teal);font-size:1.05rem">${parseFloat(item.price).toFixed(2)} د.أ</td>
          <td>${statusBadge}</td>
          <td style="text-align:center;display:flex;gap:6px;justify-content:center">
            <button class="tbtn" onclick="editPricingItem('${k}')" style="background:rgba(14,165,233,.1);color:var(--sky);border-color:rgba(14,165,233,.2)" title="تعديل"><i class="fas fa-edit"></i></button>
            <button class="tbtn" onclick="togglePricingItem('${k}',${item.active !== false ? 'false' : 'true'})" style="background:rgba(245,158,11,.1);color:var(--amber);border-color:rgba(245,158,11,.2)" title="${item.active !== false ? 'تعطيل' : 'تفعيل'}"><i class="fas fa-${item.active !== false ? 'pause' : 'play'}"></i></button>
            <button class="tbtn" onclick="deletePricingItem('${k}', '${sanitize(item.name).replace(/'/g, "\\'")}')" style="background:rgba(239,68,68,.1);color:var(--red);border-color:rgba(239,68,68,.2)" title="حذف نهائي"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`;
    }).join('');
  }
}

function openAddPricingItem(type) {
  document.getElementById('prEditKey').value = '';
  document.getElementById('prEditType').value = type;
  document.getElementById('prName').value = '';
  document.getElementById('prPrice').value = '';
  document.getElementById('pricingModalTitle').textContent = type === 'lab' ? 'إضافة فحص مختبري جديد' : 'إضافة فحص أشعة جديد';
  document.getElementById('pricingModal').style.display = 'flex';
}

function editPricingItem(key) {
  const item = _pricingCatalog[key];
  if (!item) return;
  document.getElementById('prEditKey').value = key;
  document.getElementById('prEditType').value = item.type;
  document.getElementById('prName').value = item.name;
  document.getElementById('prPrice').value = item.price;
  document.getElementById('pricingModalTitle').textContent = 'تعديل السعر';
  document.getElementById('pricingModal').style.display = 'flex';
}

function savePricingItem() {
  const key = document.getElementById('prEditKey').value;
  const type = document.getElementById('prEditType').value;
  const name = document.getElementById('prName').value.trim();
  const price = parseFloat(document.getElementById('prPrice').value);

  if (!name) { toast('⚠️ يرجى إدخال اسم الفحص أو الخدمة', 'err'); return; }
  if (isNaN(price) || price < 0) { toast('⚠️ يرجى إدخال سعر صحيح', 'err'); return; }

  const itemData = {
    name: name,
    type: type,
    price: price,
    active: true,
    updatedAt: new Date().toISOString()
  };

  // Audit: log old price if editing
  if (key && _pricingCatalog[key] && typeof ArgonCore !== 'undefined') {
    const oldPrice = _pricingCatalog[key].price;
    if (oldPrice !== price) {
      ArgonCore.logAudit('PRICE_CHANGE', `تعديل سعر "${name}" من ${oldPrice} إلى ${price} د.أ`, 'BILLING');
    }
  }

  const ref = key ? db.ref(`${BASE}/pricing_catalog/${key}`) : db.ref(`${BASE}/pricing_catalog`).push();

  ref.set(itemData).then(() => {
    toast(key ? '✅ تم تحديث السعر بنجاح' : '✅ تم إضافة الخدمة وتسعيرها بنجاح', 'ok');
    document.getElementById('pricingModal').style.display = 'none';

    if (!key && typeof ArgonCore !== 'undefined') {
      ArgonCore.logAudit('PRICE_ADD', `إضافة خدمة جديدة "${name}" بسعر ${price} د.أ`, 'BILLING');
    }
  }).catch(e => {
    toast('❌ فشل حفظ التسعيرة', 'err');
    console.error(e);
  });
}

function togglePricingItem(key, newState) {
  const item = _pricingCatalog[key];
  if (!item) return;

  db.ref(`${BASE}/pricing_catalog/${key}/active`).set(newState === 'true' || newState === true).then(() => {
    toast(newState ? '✅ تم تفعيل الخدمة' : '⏸️ تم تعطيل الخدمة', 'ok');
    if (typeof ArgonCore !== 'undefined') {
      ArgonCore.logAudit('PRICE_TOGGLE', `${newState ? 'تفعيل' : 'تعطيل'} خدمة "${item.name}"`, 'BILLING');
    }
  });
}

function deletePricingItem(key, itemName) {
  if (confirm(`تحذير: هل أنت متأكد من أرشفة الفحص والتسعيرة "${itemName}" نهائياً؟`)) {
    db.ref(`${BASE}/pricing_catalog/${key}/deleted`).set(true).then(() => {
      toast('🗑️ تم أرشفة الخدمة بنجاح', 'ok');
      if (typeof ArgonCore !== 'undefined') {
        ArgonCore.logAudit('PRICE_DELETE', `أرشفة خدمة وتسعيرة "${itemName}" نهائياً`, 'BILLING');
      }
    }).catch(e => {
      toast('❌ فشل الأرشفة', 'err');
      console.error(e);
    });
  }
}

function renderReceivables() {
  if (typeof BillingEngine !== 'undefined' && BillingEngine.renderReceivables) {
    BillingEngine.renderReceivables();
  }
}

// Hook into Dashboard initialization
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    BillingEngine.init();
    initPricingCatalog();
  }, 1500);
});
