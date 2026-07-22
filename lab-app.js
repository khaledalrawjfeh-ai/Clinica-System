// 🧪 ARGON — Smart Laboratory App
const firebaseConfig = {
  apiKey: "AIzaSyCDT_H-1klxbtuVR5n5GOVHKlxcmvY_2GA",
  authDomain: "clinica-system-e71b9.firebaseapp.com",
  databaseURL: "https://clinica-system-e71b9-default-rtdb.firebaseio.com",
  projectId: "clinica-system-e71b9",
  storageBucket: "clinica-system-e71b9.firebasestorage.app",
  messagingSenderId: "833103541884",
  appId: "1:833103541884:web:f8ee6ca4b3d8400cf0fbf9",
  measurementId: "G-KGN7CPYKTR"
};

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// State
let CID = new URLSearchParams(window.location.search).get('id') || '';
let BASE = 'clinics/' + CID;
let _sets = null;
let _orders = {};
let _pricingCatalog = {};
let activeOrderId = null;
let currentLabFilter = 'waiting';
let uploadedAttachment = null; // Stores Base64 PDF / image
let isSubmitting = false;

window.addEventListener('DOMContentLoaded', () => {
  if (!CID) {
    alert("خطأ: معرف العيادة غير موجود! يرجى فتح الصفحة من لوحة التحكم.");
    window.location.href = "super.html";
    return;
  }

  // Load Theme
  const savedTheme = localStorage.getItem('argon_theme') || 'light';
  document.body.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  // Settings Loader
  db.ref(BASE + '/settings').on('value', snap => {
    _sets = snap.val();
    if (_sets) {
      document.getElementById('lClinicName').textContent = _sets.name || 'المجمع الطبي';
      document.getElementById('topName').textContent = _sets.name || 'المجمع الطبي';
      document.getElementById('tlogo').textContent = _sets.emoji ? `ARGON ${_sets.emoji}` : 'ARGON LABORATORY';
    }
  });

  // Wait for Enterprise Runtime
  window.waitForArgonReady('lab').then(session => {
    document.getElementById('topName').textContent = `مرحباً، ${session.displayName}`;
    initLab();
  });
});

// Lab Initializer
function initLab() {
  toast('مرحباً بك في المختبر الطبي المركزي 🧪', 'ok');

  // Load Pricing Catalog for accurate billing
  db.ref(BASE + '/pricing_catalog').on('value', snap => {
    _pricingCatalog = snap.val() || {};
  });

  // Enterprise Incremental Lab Orders (child events only)
  let _labRenderTimer = null;
  const debounceLabRender = () => { clearTimeout(_labRenderTimer); _labRenderTimer = setTimeout(renderLabOrders, 80); };
  db.ref(BASE + '/lab_orders').on('child_added',   snap => { _orders[snap.key] = snap.val(); debounceLabRender(); });
  db.ref(BASE + '/lab_orders').on('child_changed', snap => { _orders[snap.key] = snap.val(); debounceLabRender(); });
  db.ref(BASE + '/lab_orders').on('child_removed', snap => { delete _orders[snap.key];      debounceLabRender(); });
}

// Switch Side menu tabs
function sw(id, el) {
  document.querySelectorAll('.sec').forEach(s => s.classList.remove('on'));
  document.getElementById(id).classList.add('on');
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('on'));
  if (el) el.classList.add('on');
}

// Filter Tab
function filterLab(status) {
  currentLabFilter = status;
  document.getElementById('btnFilterWaiting').style.borderColor = status === 'waiting' ? 'var(--amber)' : 'var(--border)';
  document.getElementById('btnFilterWaiting').style.color = status === 'waiting' ? 'var(--amber)' : 'var(--text)';
  document.getElementById('btnFilterCompleted').style.borderColor = status === 'completed' ? 'var(--green)' : 'var(--border)';
  document.getElementById('btnFilterCompleted').style.color = status === 'completed' ? 'var(--green)' : 'var(--text)';
  renderLabOrders();
}

// Render Lab Orders cards list
function renderLabOrders() {
  const grid = document.getElementById('labGrid');
  const searchInput = document.getElementById('labSearchInp');
  const searchVal = searchInput ? searchInput.value.trim().toLowerCase() : '';

  const items = Object.entries(_orders).filter(([k, v]) => {
    if (currentLabFilter === 'waiting' && !(v.status === 'waiting' || v.status === 'pending')) return false;
    if (currentLabFilter !== 'waiting' && v.status !== currentLabFilter) return false;
    
    if (searchVal) {
      const pName = (v.patientName || '').toLowerCase();
      const pPhone = String(v.phone || v.patientPhone || '').replace(/\D/g, '');
      return pName.includes(searchVal) || pPhone.includes(searchVal);
    }
    
    return true;
  });

  if (!items.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--muted)">
        <i class="fas fa-microscope" style="font-size:2.5rem;margin-bottom:10px;opacity:.2"></i>
        <p>لا توجد طلبات فحص في هذه القائمة حالياً</p>
      </div>`;
    return;
  }

  grid.innerHTML = items.map(([k, o]) => {
    const testNames = (o.requestedTests || []).map(t => {
      const safeName = typeof t.name === 'object' ? (t.name.name || 'فحص') : (t.name || t);
      return safeName;
    }).join(' ، ');
    const dateStr = o.createdAt ? o.createdAt.substring(0, 16).replace('T', ' ') : 'فوري';
    const relativeTime = window.argonTimeAgo ? window.argonTimeAgo(o.createdAt) : '';
    const badgeClass = o.status === 'completed' ? 'completed' : 'waiting';
    const badgeText = o.status === 'completed' ? 'تحاليل مكتملة ✅' : 'بانتظار إجراء التحليل ⏳';

    return `
      <div class="item-card glass-panel" onclick="openLabDetails('${k}')">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div class="card-title">${sanitize(o.patientName)}</div>
          <span class="badge ${badgeClass}">${badgeText}</span>
        </div>
        <div style="font-size:0.8rem;color:var(--muted)">
          <div><b>الطبيب المعالج:</b> د. ${sanitize(o.docName)}</div>
          <div><b>الهاتف:</b> <span dir="ltr">${sanitize(o.patientPhone || o.phone || '—')}</span></div>
          <div><b>التحاليل المطلوبة:</b> ${sanitize(testNames)}</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.75rem;color:var(--muted);border-top:1px solid var(--border);padding-top:8px;margin-top:4px">
          <span><i class="far fa-clock"></i> ${dateStr}</span>
          <span style="color:var(--amber);font-weight:bold">${relativeTime}</span>
        </div>
      </div>
    `;
  }).join('');
}

// Open Selected Lab Order modal
function openLabDetails(key) {
  activeOrderId = key;
  const o = _orders[key];
  if (!o) return;

  document.getElementById('mlPatName').textContent = o.patientName;
  document.getElementById('mlDocName').textContent = o.docName;
  document.getElementById('mlRequestDate').textContent = o.createdAt ? o.createdAt.substring(0, 10) : '—';
  document.getElementById('mlNotes').value = o.notes || '';
  
  uploadedAttachment = o.attachment || null;
  document.getElementById('mlFileLbl').textContent = uploadedAttachment ? '✅ تم رفع ملف تقرير التحليل بنجاح' : 'اضغط لرفع ملف التقرير المخبري المعتمد';

  const tbody = document.getElementById('mlTestsList');
  tbody.innerHTML = (o.requestedTests || []).map((t, idx) => {
    const safeName = typeof t.name === 'object' ? (t.name.name || 'فحص') : (t.name || t);
    const normalRange = getNormalReferenceRange(safeName);
    const unitHint = getUnitHint(safeName);
    
    const resultInput = `<input type="text" id="mlResult_${idx}" class="fi" value="${t.result || ''}" placeholder="أدخل النتيجة" style="height:32px;border-color:var(--teal)">`;
    const unitInput = `<input type="text" id="mlUnit_${idx}" class="fi" value="${t.unit || unitHint}" placeholder="الوحدة" style="height:32px" value="${unitHint}">`;

    return `
      <tr>
        <td><b>${sanitize(safeName)}</b></td>
        <td>${o.status === 'completed' ? `<b>${t.result || '—'}</b>` : resultInput}</td>
        <td>${o.status === 'completed' ? `<span>${t.unit || '—'}</span>` : unitInput}</td>
        <td style="font-size:0.8rem;color:var(--muted)">${normalRange}</td>
      </tr>
    `;
  }).join('');

  const actions = document.getElementById('labActions');
  if (o.status === 'completed') {
    actions.innerHTML = `
      ${o.attachment ? `<button class="btn-secondary" onclick="openReportPdf()" style="margin-left:auto"><i class="fas fa-file-pdf"></i> عرض التقرير المرفق</button>` : ''}
      <span style="color:var(--green);font-weight:bold;margin-right:auto"><i class="fas fa-check-double"></i> نتائج هذا الفحص مدخلة ومكتملة</span>
    `;
  } else {
    actions.innerHTML = `
      <button class="btn-primary" onclick="saveLabResults()" style="flex:1;justify-content:center"><i class="fas fa-save"></i> حفظ وتأكيد النتائج للـ EMR</button>
      <button class="btn-secondary" onclick="closeModal('labModal')">إلغاء</button>
    `;
  }

  document.getElementById('labModal').style.display = 'flex';
}

// Get normal ranges helper
function getNormalReferenceRange(name) {
  const n = name.toUpperCase().trim();
  if (n.includes('CBC') || n.includes('HB')) return 'الرجال: 13.5 - 17.5 g/dL | النساء: 12.0 - 15.5';
  if (n.includes('HBA1C')) return 'طبيعي: < 5.7% | ما قبل السكري: 5.7 - 6.4%';
  if (n.includes('LIPID') || n.includes('CHOL')) return 'الكوليسترول الكلي: < 200 mg/dL';
  if (n.includes('KIDNEY') || n.includes('CREAT')) return 'الكرياتينين: 0.6 - 1.2 mg/dL';
  return 'حسب توجيهات طبيب المختبر';
}

// Get unit hint helper
function getUnitHint(name) {
  const n = name.toUpperCase().trim();
  if (n.includes('CBC') || n.includes('HB')) return 'g/dL';
  if (n.includes('HBA1C')) return '%';
  if (n.includes('KIDNEY') || n.includes('LIPID') || n.includes('CREAT')) return 'mg/dL';
  return '—';
}

// Attachment Reader
function handleAttachment(e) {
  const file = e.target.files[0];
  if (!file) return;

  toast('⏳ جاري رفع وقراءة التقرير...', 'ok');
  const reader = new FileReader();
  reader.onload = ev => {
    uploadedAttachment = ev.target.result;
    document.getElementById('mlFileLbl').textContent = '✅ تم قراءة ورفع الملف المرفق بنجاح';
    toast('✅ تم رفع التقرير المكتوب بنجاح', 'ok');
  };
  reader.readAsDataURL(file);
}

// Save Lab Results
function saveLabResults() {
  if (isSubmitting) return;
  const o = _orders[activeOrderId];
  if (!o) return;
  isSubmitting = true;

  const notes = document.getElementById('mlNotes').value.trim();
  const completedTests = [];
  let isAnyFieldEmpty = false;

  (o.requestedTests || []).forEach((t, idx) => {
    const resEl = document.getElementById(`mlResult_${idx}`);
    const unitEl = document.getElementById(`mlUnit_${idx}`);
    if (resEl && unitEl) {
      const resVal = resEl.value.trim();
      const unitVal = unitEl.value.trim();
      if (!resVal) isAnyFieldEmpty = true;
      
      completedTests.push({
        name: t.name,
        serviceId: t.serviceId || 'external',
        unitPrice: typeof t.unitPrice !== 'undefined' ? t.unitPrice : null,
        source: t.source || 'manual',
        requiresBillingReview: t.requiresBillingReview || false,
        result: resVal,
        unit: unitVal,
        status: 'completed'
      });
    }
  });

  if (isAnyFieldEmpty) {
    toast('⚠️ يرجى إدخال النتائج لجميع الفحوصات المطلوبة أولاً', 'err');
    return;
  }

  const updates = {};
  
  // 1. Update lab order in DB
  updates[`lab_orders/${activeOrderId}/status`] = 'completed';
  updates[`lab_orders/${activeOrderId}/requestedTests`] = completedTests;
  updates[`lab_orders/${activeOrderId}/notes`] = notes;
  updates[`lab_orders/${activeOrderId}/attachment`] = uploadedAttachment;

  // 2. Log Laboratory Event inside patient EMR timeline
  const visitId = o.visitId;
  if (visitId) {
    const resultsSummary = completedTests.map(t => {
      const safeName = typeof t.name === 'object' ? (t.name.name || 'غير معروف') : (t.name || 'غير معروف');
      return `• ${safeName}: <b>${t.result}</b> ${t.unit}`;
    }).join('<br>');
    const timelineKey = 'lab_' + activeOrderId;
    const timelineObj = {
      date: new Date().toLocaleDateString('en-CA'),
      time: new Date().toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' }),
      docKey: 'lab',
      docName: 'المختبر الطبي المركزي',
      diagnosis: 'نتائج فحوصات مخبرية مكتملة 🧪',
      complaint: 'مختبر المركز الموحد',
      notes: `نتائج التحاليل للمريض:<br>${resultsSummary}<br>${notes ? `<b>ملاحظات الفني:</b> ${notes}` : ''}`,
      vitals: { temp: null, bp: null, pulse: null },
      prescriptions: [],
      attachments: uploadedAttachment ? [{ name: 'تقرير فحص مخبري.pdf', type: 'pdf', data: uploadedAttachment }] : []
    };
    updates[`patients/${o.patientId}/visits/${timelineKey}`] = timelineObj;

    // 3. Send Doctor Notification
    try {
      db.ref(`${BASE}/notifications`).push({
        title: 'نتائج تحاليل جاهزة 🔬',
        message: `تم إنهاء نتائج تحاليل المريض ${sanitize(o.patientName)} لمراجعتها بالـ EMR`,
        role: 'doctor',
        docKey: o.doctorId || 'doctor',
        patientId: o.patientId,
        createdAt: new Date().toISOString()
      });
    } catch(e) { console.error('Notification error', e); }

    // 4. Auto-Billing: Strict Enterprise Protocol
    const bpState = (_sets && _sets.billingPolicy) || { mode: 'legacy' };
    const labPolicy = (bpState.departments && bpState.departments.lab) || 'unified';

    if (labPolicy === 'free') {
      if (typeof ArgonCore !== 'undefined' && ArgonCore.logAudit) {
        ArgonCore.logAudit('BILLING_FREE', `تجاوز مالي للمختبر حسب سياسة المجمع لطلب: ${k}`, 'LABORATORY');
      }
    } else {
      // Fetch invoices for this visit to handle idempotency and unified appending
      db.ref(`${BASE}/invoices`).orderByChild('visitId').equalTo(visitId).once('value', invSnap => {
        const invoices = invSnap.val() || {};
        
        // 1. Determine Default Policy
        const bp = (_sets && _sets.billingPolicy && _sets.billingPolicy.departments) ? _sets.billingPolicy.departments : {};
        const labPolicy = bp.lab || 'separate';

        const transactionPromises = completedTests.map(t => {
          let serviceId = t.serviceId || t.id || 'external';
          if (serviceId === 'external' || serviceId === 'unknown') {
             const rawName = typeof t.name === 'object' ? (t.name.name || '') : (t.name || '');
             serviceId = 'ext_' + btoa(encodeURIComponent(rawName)).replace(/[^a-zA-Z0-9]/g, '').substring(0, 12) + '_' + Math.floor(Math.random()*1000);
          }
          const safeServiceId = serviceId.replace(/[\.\#\$\[\]\/]/g, '_');
          const billingRefId = `${typeof CID !== 'undefined' ? CID : '0'}-${visitId}-${safeServiceId}-LAB`;
          
          return db.ref(`${BASE}/billing_refs/${billingRefId}`).transaction(currentData => {
            if (currentData === null) return { timestamp: Date.now(), serviceId: serviceId };
            return; // Abort
          }).then(result => {
             return { test: t, committed: result.committed, billingRefId: billingRefId, serviceId: serviceId };
          });
        });

        Promise.all(transactionPromises).then(results => {
          const newLabItems = [];
          results.forEach(res => {
            if (!res.committed) {
               if (typeof ArgonCore !== 'undefined' && ArgonCore.logAudit) ArgonCore.logAudit('DUPLICATE_PREVENTED_RACE', `منع تكرار فوترة مختبر: ${res.billingRefId}`, 'FINANCE');
               return; // Skip this test
            }

            const t = res.test;
            const serviceId = res.serviceId;
            const billingRefId = res.billingRefId;

            // 4. Strict Pricing from Catalog
            let testPrice = 0;
            let requiresReview = false;
            
            let catalogItem = null;
            if (typeof _pricingCatalog !== 'undefined') {
               catalogItem = _pricingCatalog[serviceId];
            }

            if (catalogItem && catalogItem.price !== undefined && catalogItem.price !== null) {
               testPrice = parseFloat(catalogItem.price);
            } else {
               requiresReview = true;
               if (typeof ArgonCore !== 'undefined' && ArgonCore.logAudit) ArgonCore.logAudit('MISSING_PRICE', `خدمة مختبر غير مسعرة: ${serviceId}`, 'FINANCE');
            }

            const safeName = typeof t.name === 'object' ? (t.name.name || 'غير معروف') : (t.name || 'غير معروف');
            newLabItems.push({
              name: `تحليل: ${sanitize(safeName)}`,
              price: requiresReview ? 0 : parseFloat(testPrice.toFixed(2)),
              requiresBillingReview: requiresReview,
              billingStatus: requiresReview ? 'pending_review' : 'unpaid',
              financialBlocked: requiresReview,
              billingReferenceId: billingRefId,
              department: 'lab',
              serviceType: 'test',
              serviceId: serviceId,
              invoiceType: labPolicy === 'separate' ? 'lab_invoice' : 'visit_invoice'
            });
          });

          if (newLabItems.length === 0) return;

          // 5. Apply Policy
          if (labPolicy === 'free') {
             return;
          }

          const createSeparateInvoiceFallback = (linkedId = null) => {
              const newInvId = db.ref().child('invoices').push().key;
              const invTotal = parseFloat(newLabItems.reduce((sum, item) => sum + item.price, 0).toFixed(2));
              const hasPending = newLabItems.some(i => i.requiresBillingReview);
              const separateInvoice = {
                patientId: o.patientId,
                patientName: o.patientName,
                visitId: visitId,
                docName: o.doctorName || 'طبيب غير محدد',
                items: newLabItems,
                total: invTotal,
                status: hasPending ? 'pending_review' : 'unpaid',
                invoiceType: 'lab_invoice',
                orderReferenceId: k,
                createdAt: new Date().toISOString(),
                invoiceNumber: `INV-LAB-${Date.now()}`
              };
              
              if (linkedId) {
                 separateInvoice.linkedInvoiceId = linkedId;
                 if (typeof ArgonCore !== 'undefined' && ArgonCore.logAudit) ArgonCore.logAudit('LINKED_INVOICE_CREATED', `إنشاء فاتورة تابعة للمختبر: ${newInvId} للأصل ${linkedId}`, 'FINANCE');
              }

              db.ref(`${BASE}/invoices/${newInvId}`).set(separateInvoice);
              if (typeof ArgonCore !== 'undefined' && ArgonCore.logAudit) ArgonCore.logAudit('INVOICE_CREATED', `إنشاء فاتورة مختبر: ${newInvId}`, 'FINANCE');
          };

          if (labPolicy === 'separate' || labPolicy === 'on_result') {
              createSeparateInvoiceFallback();
          } else if (labPolicy === 'unified') {
              const invEntry = Object.entries(invoices).find(([_, v]) => v.invoiceType !== 'lab_invoice' && v.invoiceType !== 'rad_invoice' && v.invoiceType !== 'pharmacy_invoice');
              if (invEntry) {
                  const [invKey, invVal] = invEntry;
                  // Remove 'partial' from soft freeze list to allow adding to partial invoices
                  if (['paid', 'cancelled', 'refunded', 'voided'].includes(invVal.status) || invVal.locked) {
                      createSeparateInvoiceFallback(invKey);
                  } else {
                      const currentItems = invVal.items || [];
                      newLabItems.forEach(newItem => currentItems.push(newItem));
                      
                      const newTotal = parseFloat(currentItems.reduce((acc, item) => acc + (parseFloat(item.price)||0), 0).toFixed(2));
                      const hasPending = currentItems.some(i => i.requiresBillingReview);
                      
                      const invoiceUpdates = {};
                      invoiceUpdates[`invoices/${invKey}/items`] = currentItems;
                      invoiceUpdates[`invoices/${invKey}/total`] = newTotal;
                      if (hasPending) invoiceUpdates[`invoices/${invKey}/status`] = 'pending_review';
                      
                      db.ref(BASE).update(invoiceUpdates);
                      if (typeof ArgonCore !== 'undefined' && ArgonCore.logAudit) ArgonCore.logAudit('INVOICE_UPDATED', `تحديث فاتورة موحدة: ${invKey}`, 'FINANCE');
                  }
              } else {
                  createSeparateInvoiceFallback();
              }
          }
        });
      });
    }
  }

  // Apply updates atomically
  db.ref(BASE).update(updates).then(() => {
    isSubmitting = false;
    if (typeof ArgonCore !== 'undefined') {
      ArgonCore.logAudit('SUBMIT_LAB', `تم رفع وتأكيد نتائج المختبر للمريض: ${o.patientName}`, 'LABORATORY');
    }
    toast('✅ تم تسجيل وتأكيد النتائج وإضافتها لملف المريض', 'ok');
    closeModal('labModal');
  }).catch(() => {
    isSubmitting = false;
    toast('❌ فشل حفظ نتائج التحليل', 'err');
  });
}

// Open attached PDF / Document
function openReportPdf() {
  if (!uploadedAttachment) return;
  const w = window.open();
  w.document.write(`<iframe src="${uploadedAttachment}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
  w.document.close();
}

// Modals management
function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

// Toast Alert
function toast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = 'block';
  t.style.background = type === 'err' ? 'var(--red)' : 'var(--teal)';
  setTimeout(() => t.style.display = 'none', 3000);
}

// Theme management
function toggleTheme() {
  const currentTheme = document.body.getAttribute('data-theme');
  const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', nextTheme);
  localStorage.setItem('argon_theme', nextTheme);
  updateThemeIcon(nextTheme);
}
function updateThemeIcon(theme) {
  const btn = document.getElementById('themeBtn');
  if (btn) btn.innerHTML = theme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
}

// Sanitization
const sanitize = s => String(s || '').replace(/[<>"']/g, '').trim().substring(0, 150);

// Auto-refresh timestamps every 30 seconds
setInterval(() => { if (typeof renderLabOrders === 'function') renderLabOrders(); }, 30000);
