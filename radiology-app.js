// 🩻 ARGON — Smart Radiology App
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
let currentRadFilter = 'waiting';
let uploadedImages = []; // Array of {imageId, fileName, storagePath, downloadUrl, uploadedAt, uploadedBy}
let isSubmitting = false;
let isUploading = false;
const USE_STORAGE = false; // 🔴 تغيير هذا إلى true عند الترقية إلى خطة Firebase Blaze

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
      document.getElementById('tlogo').textContent = _sets.emoji ? `ARGON ${_sets.emoji}` : 'ARGON RADIOLOGY';
    }
  });

  // Wait for Enterprise Runtime
  window.waitForArgonReady('radiology').then(session => {
    document.getElementById('topName').textContent = `مرحباً، ${session.displayName}`;
    initRad();
  });
});

// Rad Initializer
function initRad() {
  toast('مرحباً بك في قسم الأشعة الذكي ☢️', 'ok');

  // Load Pricing Catalog for accurate billing
  db.ref(BASE + '/pricing_catalog').on('value', snap => {
    _pricingCatalog = snap.val() || {};
  });

  // Enterprise Incremental Radiology Orders (child events only)
  let _radRenderTimer = null;
  const debounceRad = () => { clearTimeout(_radRenderTimer); _radRenderTimer = setTimeout(renderRadOrders, 80); };
  db.ref(BASE + '/radiology_orders').on('child_added',   snap => { _orders[snap.key] = snap.val(); debounceRad(); });
  db.ref(BASE + '/radiology_orders').on('child_changed', snap => { _orders[snap.key] = snap.val(); debounceRad(); });
  db.ref(BASE + '/radiology_orders').on('child_removed', snap => { delete _orders[snap.key]; debounceRad(); });
}

// Switch Side Menu items
function sw(id, el) {
  document.querySelectorAll('.sec').forEach(s => s.classList.remove('on'));
  document.getElementById(id).classList.add('on');
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('on'));
  if (el) el.classList.add('on');
}

// Filter Tab
function filterRad(status) {
  currentRadFilter = status;
  document.getElementById('btnFilterWaiting').style.borderColor = status === 'waiting' ? 'var(--amber)' : 'var(--border)';
  document.getElementById('btnFilterWaiting').style.color = status === 'waiting' ? 'var(--amber)' : 'var(--text)';
  document.getElementById('btnFilterCompleted').style.borderColor = status === 'completed' ? 'var(--green)' : 'var(--border)';
  document.getElementById('btnFilterCompleted').style.color = status === 'completed' ? 'var(--green)' : 'var(--text)';
  renderRadOrders();
}

// Render Radiology Orders cards list
function renderRadOrders() {
  const grid = document.getElementById('radGrid');
  const searchInput = document.getElementById('radSearchInp');
  const searchVal = searchInput ? searchInput.value.trim().toLowerCase() : '';

  const items = Object.entries(_orders).filter(([k, v]) => {
    if (currentRadFilter === 'waiting' && !(v.status === 'waiting' || v.status === 'pending')) return false;
    if (currentRadFilter !== 'waiting' && v.status !== currentRadFilter) return false;
    
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
        <i class="fas fa-x-ray" style="font-size:2.5rem;margin-bottom:10px;opacity:.2"></i>
        <p>لا توجد طلبات أشعة وتصوير حالياً</p>
      </div>`;
    return;
  }

  grid.innerHTML = items.map(([k, o]) => {
    const scanNames = (o.requestedScans || []).map(s => {
      const safeName = typeof s.name === 'object' ? (s.name.name || 'صورة أشعة') : (s.name || s);
      return safeName;
    }).join(' ، ');
    const dateStr = o.createdAt ? o.createdAt.substring(0, 16).replace('T', ' ') : 'فوري';
    const relativeTime = window.argonTimeAgo ? window.argonTimeAgo(o.createdAt) : '';
    const badgeClass = o.status === 'completed' ? 'completed' : 'waiting';
    const badgeText = o.status === 'completed' ? 'أشعة مكتملة ✅' : 'بانتظار التصوير ⏳';

    return `
      <div class="item-card glass-panel" onclick="openRadDetails('${k}')">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div class="card-title">${sanitize(o.patientName)}</div>
          <span class="badge ${badgeClass}">${badgeText}</span>
        </div>
        <div style="font-size:0.8rem;color:var(--muted)">
          <div><b>الطبيب المعالج:</b> د. ${sanitize(o.docName)}</div>
          <div><b>الهاتف:</b> <span dir="ltr">${sanitize(o.patientPhone || o.phone || '—')}</span></div>
          <div><b>الفحوصات المطلوبة:</b> ${sanitize(scanNames)}</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.75rem;color:var(--muted);border-top:1px solid var(--border);padding-top:8px;margin-top:4px">
          <span><i class="far fa-clock"></i> ${dateStr}</span>
          <span style="color:var(--amber);font-weight:bold">${relativeTime}</span>
        </div>
      </div>
    `;
  }).join('');
}

// Open Selected Radiology Order details inside modal
function openRadDetails(key) {
  activeOrderId = key;
  const o = _orders[key];
  if (!o) return;

  document.getElementById('mrPatName').textContent = o.patientName;
  document.getElementById('mrDocName').textContent = o.docName;
  document.getElementById('mrRequestDate').textContent = o.createdAt ? o.createdAt.substring(0, 10) : '—';
  
  document.getElementById('mrReport').value = o.report || '';
  
  // ── ARGON ENTERPRISE: MULTI-IMAGE & LEGACY SUPPORT ──
  uploadedImages = o.images ? [...o.images] : [];
  if (o.image && uploadedImages.length === 0) {
    uploadedImages.push({
      imageId: 'legacy',
      fileName: 'صورة قديمة.jpg',
      downloadUrl: o.image,
      storagePath: null
    });
  }

  if (uploadedImages.length > 0) {
    renderRadGallery();
    document.getElementById('mrFileLbl').textContent = `✅ يوجد ${uploadedImages.length} مرفقات مسجلة`;
    if (typeof ArgonCore !== 'undefined') ArgonCore.logAudit('RAD_VIEW', `تم عرض صور الأشعة للطلب: ${key}`, 'RADIOLOGY');
  } else {
    document.getElementById('radImageGallery').style.display = 'none';
    document.getElementById('mrFileLbl').textContent = 'اضغط هنا لتحميل صور الأشعة الرقمية';
  }

  const scansList = document.getElementById('mrScansList');
  scansList.innerHTML = (o.requestedScans || []).map(s => {
    const safeName = typeof s.name === 'object' ? (s.name.name || 'صورة أشعة') : (s.name || s);
    return `
      <span class="tag blue" style="font-size:0.85rem;background:rgba(14,165,233,0.15);border:1px solid var(--sky);color:var(--sky)">
        ${sanitize(safeName)} ☢️
      </span>
    `;
  }).join('');

  const actions = document.getElementById('radActions');
  if (o.status === 'completed') {
    actions.innerHTML = `
      <span style="color:var(--green);font-weight:bold;margin-right:auto"><i class="fas fa-check-double"></i> تقارير الأشعة مسجلة ومكتملة</span>
    `;
    document.getElementById('mrReport').readOnly = true;
    document.getElementById('mrFileInp').disabled = true;
  } else {
    actions.innerHTML = `
      <button class="btn-primary" onclick="saveRadReport()" style="flex:1;justify-content:center"><i class="fas fa-save"></i> حفظ وتأكيد التقرير وصور الأشعة</button>
      <button class="btn-secondary" onclick="closeModal('radModal')">إلغاء</button>
    `;
    document.getElementById('mrReport').readOnly = false;
    document.getElementById('mrFileInp').disabled = false;
  }

  document.getElementById('radModal').style.display = 'flex';
}

// ── ARGON ENTERPRISE: MULTI-IMAGE DUAL-MODE UPLOAD ──
async function handleImageUpload(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  if (isUploading) return toast('جاري رفع ملفات سابقة، يرجى الانتظار...', 'err');
  
  isUploading = true;
  document.getElementById('radImageGallery').style.display = 'flex';
  document.getElementById('mrFileLbl').textContent = '⏳ جاري الرفع...';
  toast(`⏳ جاري معالجة ورفع ${files.length} ملف/ملفات...`, 'ok');

  const uploaderName = document.getElementById('topName').textContent.replace('مرحباً، ', '');

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const isImage = file.type.startsWith('image/');
    
    try {
      if (USE_STORAGE) {
        // ── مسار التخزين السحابي (Firebase Storage) ──
        let fileToUpload = file;
        if (isImage) {
          fileToUpload = await processImageHighRes(file, 2500, 0.90);
        }

        const storageRef = firebase.storage().ref();
        const fileName = `${Date.now()}_${Math.floor(Math.random()*1000)}_${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;
        const storagePath = `${BASE}/radiology_orders/${activeOrderId}/${fileName}`;
        const fileRef = storageRef.child(storagePath);
        
        // Timeout wrapper to prevent forever hang if Storage rules block
        const snapshot = await Promise.race([
          fileRef.put(fileToUpload),
          new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 15000))
        ]);
        const downloadUrl = await snapshot.ref.getDownloadURL();
        
        uploadedImages.push({
          imageId: 'img_' + Date.now() + '_' + i,
          fileName: file.name,
          storagePath: storagePath,
          downloadUrl: downloadUrl,
          uploadedAt: new Date().toISOString(),
          uploadedBy: uploaderName
        });
      } else {
        // ── مسار قاعدة البيانات (RTDB Base64) المؤقت ──
        let base64Data = '';
        if (isImage) {
          // استخدام دقة 1500 بكسل في وضع الداتا بيس لمنع تجاوز حد 16MB
          base64Data = await processImageToBase64(file, 1500, 0.75);
        } else {
          base64Data = await readFileAsBase64(file);
        }

        uploadedImages.push({
          imageId: 'img_' + Date.now() + '_' + i,
          fileName: file.name,
          storagePath: null,
          downloadUrl: base64Data,
          uploadedAt: new Date().toISOString(),
          uploadedBy: uploaderName
        });
      }
      
      renderRadGallery();
      if (typeof ArgonCore !== 'undefined') ArgonCore.logAudit('RAD_UPLOAD', `تم رفع صورة: ${file.name}`, 'RADIOLOGY');
    } catch (err) {
      console.error('Upload Error', err);
      toast(`❌ فشل رفع الملف: ${file.name}`, 'err');
    }
  }
  
  isUploading = false;
  document.getElementById('mrFileLbl').textContent = `✅ تم رفع ${uploadedImages.length} ملفات بنجاح`;
  toast(`✅ اكتملت عملية الرفع`, 'ok');
}

function processImageHighRes(file, maxW, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxW) {
          h *= maxW / w;
          w = maxW;
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob(blob => resolve(blob), file.type, quality);
        } else {
          resolve(file); 
        }
      };
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = ev.target.result;
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function processImageToBase64(file, maxW, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxW) {
          h *= maxW / w;
          w = maxW;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = ev.target.result;
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => resolve(ev.target.result);
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function renderRadGallery() {
  const gallery = document.getElementById('radImageGallery');
  gallery.style.display = 'flex';
  
  const isCompleted = _orders[activeOrderId] && _orders[activeOrderId].status === 'completed';
  
  gallery.innerHTML = uploadedImages.map((imgObj, i) => {
    const isPdf = imgObj.fileName.toLowerCase().endsWith('.pdf');
    const deleteBtn = isCompleted ? '' : `<button onclick="removeRadImage(${i})" style="position:absolute;top:-5px;right:-5px;background:var(--red);color:#fff;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;font-size:0.6rem;display:flex;align-items:center;justify-content:center;z-index:10"><i class="fas fa-times"></i></button>`;
    
    if (isPdf) {
      return `<div style="position:relative;background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:10px;display:flex;align-items:center;gap:8px">
        <a href="${imgObj.downloadUrl}" target="_blank" style="color:inherit;text-decoration:none;display:flex;align-items:center;gap:8px">
          <i class="fas fa-file-pdf" style="color:var(--red);font-size:1.5rem"></i>
          <div style="font-size:0.7rem;max-width:80px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sanitize(imgObj.fileName)}</div>
        </a>
        ${deleteBtn}
      </div>`;
    } else {
      return `<div style="position:relative">
        <img src="${imgObj.downloadUrl}" loading="lazy" style="height:100px;width:100px;border-radius:8px;object-fit:cover;cursor:pointer;border:1px solid var(--border)" onclick="viewLightbox(${i})">
        ${deleteBtn}
      </div>`;
    }
  }).join('');
}

window.removeRadImage = function(index) {
  if (confirm('هل أنت متأكد من حذف هذه الصورة؟')) {
    const imgObj = uploadedImages[index];
    if (imgObj.storagePath) {
      firebase.storage().ref(imgObj.storagePath).delete().catch(e => console.error('Failed to delete from storage', e));
    }
    uploadedImages.splice(index, 1);
    renderRadGallery();
    if (typeof ArgonCore !== 'undefined') ArgonCore.logAudit('RAD_DELETE', `تم حذف صورة: ${imgObj.fileName}`, 'RADIOLOGY');
    
    if (uploadedImages.length === 0) {
      document.getElementById('mrFileLbl').textContent = 'اضغط هنا لرفع صور الأشعة';
    } else {
      document.getElementById('mrFileLbl').textContent = `✅ تم رفع ${uploadedImages.length} ملفات بنجاح`;
    }
  }
}

// Save Radiology Report
function saveRadReport() {
  if (isSubmitting) return;
  const o = _orders[activeOrderId];
  if (!o) return;
  isSubmitting = true;

  if (isUploading) {
    toast('⏳ يرجى الانتظار حتى اكتمال رفع الصور...', 'err');
    return;
  }
  const report = document.getElementById('mrReport').value.trim();
  if (!report) {
    toast('⚠️ الرجاء كتابة التقرير التشخيصي للأشعة أولاً', 'err');
    return;
  }
  if (!uploadedImages || uploadedImages.length === 0) {
    toast('⚠️ الرجاء رفع صور الأشعة الرقمية المصاحبة للتقرير', 'err');
    return;
  }

  const updates = {};
  
  // 1. Update order in database
  updates[`radiology_orders/${activeOrderId}/status`] = 'completed';
  updates[`radiology_orders/${activeOrderId}/report`] = report;
  updates[`radiology_orders/${activeOrderId}/images`] = uploadedImages;

  // 2. Log Radiology Event inside patient EMR timeline
  const visitId = o.visitId;
  if (visitId) {
    const scansSummary = (o.requestedScans || []).map(s => {
      const safeName = typeof s.name === 'object' ? (s.name.name || 'غير معروف') : (s.name || 'غير معروف');
      return `• ${safeName}`;
    }).join('<br>');
    const timelineKey = 'rad_' + activeOrderId;
    
    // Map Storage images to EMR timeline attachments
    const timelineAttachments = uploadedImages.map((imgObj, idx) => {
      return {
        name: imgObj.fileName || `صورة_الأشعة_${idx+1}.jpg`,
        type: imgObj.fileName.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image',
        data: imgObj.downloadUrl
      };
    });

    const timelineObj = {
      date: new Date().toLocaleDateString('en-CA'),
      time: new Date().toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' }),
      docKey: 'radiology',
      docName: 'قسم الأشعة والسينية',
      diagnosis: 'تقارير وصور الأشعة مكتملة 🩻',
      complaint: 'قسم الأشعة الموحد',
      notes: `تم إنهاء التصوير التشخيصي للفحوصات التالية:<br>${scansSummary}<br><b>التقرير الطبي المعتمَد:</b><br>${report.replace(/\n/g, '<br>')}`,
      vitals: { temp: null, bp: null, pulse: null },
      prescriptions: [],
      attachments: timelineAttachments
    };
    updates[`patients/${o.patientId}/visits/${timelineKey}`] = timelineObj;

    // 3. Send Doctor Notification
    try {
      db.ref(`${BASE}/notifications`).push({
        title: 'نتائج تقارير الأشعة جاهزة 🩻',
        message: `تم إنهاء تصوير الأشعة والتقرير للمريض ${sanitize(o.patientName)}`,
        role: 'doctor',
        docKey: o.doctorId || 'doctor',
        patientId: o.patientId,
        createdAt: new Date().toISOString()
      });
    } catch(e) { console.error('Notification error', e); }

    // 4. Auto-Billing: Strict Enterprise Protocol
    const bpState = (_sets && _sets.billingPolicy) || { mode: 'legacy' };
    const radPolicy = (bpState.departments && bpState.departments.rad) || 'unified';

    if (radPolicy === 'free') {
      if (typeof ArgonCore !== 'undefined' && ArgonCore.logAudit) {
        ArgonCore.logAudit('BILLING_FREE', `تجاوز مالي للأشعة حسب سياسة المجمع لطلب: ${k}`, 'RADIOLOGY');
      }
    } else {
      // Fetch invoices for this visit to handle idempotency and unified appending
      db.ref(`${BASE}/invoices`).orderByChild('visitId').equalTo(visitId).once('value', invSnap => {
        const invoices = invSnap.val() || {};
        
        // 1. Determine Default Policy
        const bp = (_sets && _sets.billingPolicy && _sets.billingPolicy.departments) ? _sets.billingPolicy.departments : {};
        const radPolicy = bp.rad || 'separate';

        const transactionPromises = (o.requestedScans || []).map(s => {
          let serviceId = s.serviceId || s.id || 'external';
          if (serviceId === 'external' || serviceId === 'unknown') {
             const rawName = typeof s.name === 'object' ? (s.name.name || '') : (s.name || '');
             serviceId = 'ext_' + btoa(encodeURIComponent(rawName)).replace(/[^a-zA-Z0-9]/g, '').substring(0, 12) + '_' + Math.floor(Math.random()*1000);
          }
          const safeServiceId = serviceId.replace(/[\.\#\$\[\]\/]/g, '_');
          const billingRefId = `${typeof CID !== 'undefined' ? CID : '0'}-${visitId}-${safeServiceId}-RAD`;
          
          return db.ref(`${BASE}/billing_refs/${billingRefId}`).transaction(currentData => {
            if (currentData === null) return { timestamp: Date.now(), serviceId: serviceId };
            return; // Abort
          }).then(result => {
             return { scan: s, committed: result.committed, billingRefId: billingRefId, serviceId: serviceId };
          });
        });

        Promise.all(transactionPromises).then(results => {
          const newRadItems = [];
          results.forEach(res => {
            if (!res.committed) {
               if (typeof ArgonCore !== 'undefined' && ArgonCore.logAudit) ArgonCore.logAudit('DUPLICATE_PREVENTED_RACE', `منع تكرار فوترة أشعة: ${res.billingRefId}`, 'FINANCE');
               return; // Skip this scan
            }

            const s = res.scan;
            const serviceId = res.serviceId;
            const billingRefId = res.billingRefId;

            // 4. Strict Pricing from Catalog
            let scanPrice = 0;
            let requiresReview = false;
            
            let catalogItem = null;
            if (typeof _pricingCatalog !== 'undefined') {
               catalogItem = _pricingCatalog[serviceId];
            }

            if (catalogItem && catalogItem.price !== undefined && catalogItem.price !== null) {
               scanPrice = parseFloat(catalogItem.price);
            } else {
               requiresReview = true;
               if (typeof ArgonCore !== 'undefined' && ArgonCore.logAudit) ArgonCore.logAudit('MISSING_PRICE', `خدمة أشعة غير مسعرة: ${serviceId}`, 'FINANCE');
            }

            const safeName = typeof s.name === 'object' ? (s.name.name || 'غير معروف') : (s.name || 'غير معروف');
            newRadItems.push({
              name: `تصوير: ${sanitize(safeName)}`,
              price: requiresReview ? 0 : parseFloat(scanPrice.toFixed(2)),
              requiresBillingReview: requiresReview,
              billingStatus: requiresReview ? 'pending_review' : 'unpaid',
              financialBlocked: requiresReview,
              billingReferenceId: billingRefId,
              department: 'radiology',
              serviceType: 'scan',
              serviceId: serviceId,
              invoiceType: radPolicy === 'separate' ? 'rad_invoice' : 'visit_invoice'
            });
          });

          if (newRadItems.length === 0) return;

          // 5. Apply Policy
          if (radPolicy === 'free') {
             return;
          }

          const createSeparateInvoiceFallback = (linkedId = null) => {
              const newInvId = db.ref().child('invoices').push().key;
              const invTotal = parseFloat(newRadItems.reduce((sum, item) => sum + item.price, 0).toFixed(2));
              const hasPending = newRadItems.some(i => i.requiresBillingReview);
              const separateInvoice = {
                patientId: o.patientId,
                patientName: o.patientName,
                visitId: visitId,
                docName: o.doctorName || 'طبيب غير محدد',
                items: newRadItems,
                total: invTotal,
                status: hasPending ? 'pending_review' : 'unpaid',
                invoiceType: 'rad_invoice',
                orderReferenceId: k,
                createdAt: new Date().toISOString(),
                invoiceNumber: `INV-RAD-${Date.now()}`
              };
              
              if (linkedId) {
                 separateInvoice.linkedInvoiceId = linkedId;
                 if (typeof ArgonCore !== 'undefined' && ArgonCore.logAudit) ArgonCore.logAudit('LINKED_INVOICE_CREATED', `إنشاء فاتورة تابعة للأشعة: ${newInvId} للأصل ${linkedId}`, 'FINANCE');
              }

              db.ref(`${BASE}/invoices/${newInvId}`).set(separateInvoice);
              if (typeof ArgonCore !== 'undefined' && ArgonCore.logAudit) ArgonCore.logAudit('INVOICE_CREATED', `إنشاء فاتورة أشعة: ${newInvId}`, 'FINANCE');
          };

          if (radPolicy === 'separate' || radPolicy === 'on_result') {
              createSeparateInvoiceFallback();
          } else if (radPolicy === 'unified') {
              const invEntry = Object.entries(invoices).find(([_, v]) => v.invoiceType !== 'lab_invoice' && v.invoiceType !== 'rad_invoice' && v.invoiceType !== 'pharmacy_invoice');
              if (invEntry) {
                  const [invKey, invVal] = invEntry;
                  // Remove 'partial' from soft freeze list to allow adding to partial invoices
                  if (['paid', 'cancelled', 'refunded', 'voided'].includes(invVal.status) || invVal.locked) {
                      createSeparateInvoiceFallback(invKey);
                  } else {
                      const currentItems = invVal.items || [];
                      newRadItems.forEach(newItem => currentItems.push(newItem));
                      
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
      ArgonCore.logAudit('SUBMIT_RADIOLOGY', `تم رفع تقرير وصور الأشعة للمريض: ${o.patientName}`, 'RADIOLOGY');
    }
    toast('✅ تم تسجيل وتأكيد تقرير الأشعة وإضافتها للـ EMR', 'ok');
    closeModal('radModal');
  }).catch(() => {
    isSubmitting = false;
    toast('❌ فشل إتمام تسجيل صور الأشعة والتقرير', 'err');
  });
}

// Lightbox full-size viewer
window.viewLightbox = function(index) {
  if (!uploadedImages || uploadedImages.length === 0) return;
  const imgObj = uploadedImages[index];
  if (!imgObj || imgObj.fileName.toLowerCase().endsWith('.pdf')) return;
  
  const w = window.open();
  w.document.write(`<body style="margin:0;background:#030b0a;display:flex;align-items:center;justify-content:center;height:100vh;">
    <img src="${imgObj.downloadUrl}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.7);">
  </body>`);
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
setInterval(() => { if (typeof renderRadOrders === 'function') renderRadOrders(); }, 30000);
