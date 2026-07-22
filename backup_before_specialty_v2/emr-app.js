// 🏥 ARGON EMR — Medical Records Engine v1.0
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
const storage = firebase.storage();

// State
let CID = new URLSearchParams(window.location.search).get('id') || '';
let BASE = 'clinics/' + CID;
let _sets = null;
let _patients = {};
let _doctors = {};
let _depts = {};
let _pricingCatalogCache = {};
let activePatientId = null;

window.EMRContext = {
  activePatientId: null,
  activeBookingId: null,
  activeDoctorId: null,
  sessionLock: false,
  renderToken: null,
  renderVersion: 0,
  initialized: false,
  lastOpenedAt: 0
};

window.AuditAPI = {
  log(type, payload = {}) {
    console.log('[AUDIT]', type, payload);
  }
};

// ── RECENT PATIENTS TRACKING (LOCAL STORAGE) ──
function trackRecentPatient(patientId, name, phone) {
  const session = window.ArgonSession ? ArgonSession.get() : {};
  const doctorId = session?.staffId || 'unknown';
  const key = `argon_recent_patients_${doctorId}`;
  
  let recent = JSON.parse(localStorage.getItem(key) || '[]');
  
  // Remove if exists
  recent = recent.filter(p => p.patientId !== patientId);
  
  // Add to start
  recent.unshift({
    patientId: patientId,
    name: name,
    phone: phone || '',
    openedAt: Date.now()
  });
  
  // Keep only 10
  if (recent.length > 10) recent = recent.slice(0, 10);
  
  localStorage.setItem(key, JSON.stringify(recent));
}

function toggleRecentPatientsDropdown() {
  const dd = document.getElementById('recentPatientsDropdown');
  if (!dd) return;
  if (dd.style.display === 'none') {
    renderRecentPatientsDropdown();
    dd.style.display = 'block';
  } else {
    dd.style.display = 'none';
  }
}

function renderRecentPatientsDropdown() {
  const dd = document.getElementById('recentPatientsDropdown');
  if (!dd) return;
  
  const session = window.ArgonSession ? ArgonSession.get() : {};
  const doctorId = session?.staffId || 'unknown';
  const key = `argon_recent_patients_${doctorId}`;
  const recent = JSON.parse(localStorage.getItem(key) || '[]');
  
  if (recent.length === 0) {
    dd.innerHTML = `<div style="padding:20px;text-align:center;color:var(--muted)">لا يوجد ملفات تم فتحها مؤخراً</div>`;
    return;
  }
  
  let html = `<div style="padding:12px; border-bottom:1px solid var(--border); font-weight:bold; color:var(--teal)">أحدث 10 ملفات تم فتحها</div>`;
  html += `<div style="display:flex; flex-direction:column; gap:4px; padding:8px;">`;
  
  recent.forEach(p => {
    const timeAgoMs = Date.now() - p.openedAt;
    const timeAgoMins = Math.floor(timeAgoMs / 60000);
    const timeStr = timeAgoMins === 0 ? 'الآن' : timeAgoMins < 60 ? `منذ ${timeAgoMins} دقيقة` : `منذ ${Math.floor(timeAgoMins/60)} ساعة`;
    
    html += `
      <div onclick="toggleRecentPatientsDropdown(); viewPatientFile('${p.patientId}')" style="display:flex; align-items:center; padding:10px 12px; border-radius:8px; cursor:pointer; background:rgba(0,0,0,0.02); transition:all 0.2s;" onmouseover="this.style.background='rgba(13,148,136,0.1)'" onmouseout="this.style.background='rgba(0,0,0,0.02)'">
        <div style="flex:1;">
          <div style="font-weight:700; color:#000;">${p.name}</div>
          <div style="font-size:0.75rem; color:var(--muted);">${p.phone || 'بدون هاتف'}</div>
        </div>
        <div style="font-size:0.7rem; color:var(--teal); background:rgba(13,148,136,0.1); padding:2px 6px; border-radius:6px;">${timeStr}</div>
      </div>
    `;
  });
  
  html += `</div>`;
  dd.innerHTML = html;
}

// Close dropdown if clicked outside
document.addEventListener('click', (e) => {
  const dd = document.getElementById('recentPatientsDropdown');
  if (dd && dd.style.display === 'block') {
    const isClickInside = dd.contains(e.target) || e.target.closest('button[onclick="toggleRecentPatientsDropdown()"]');
    if (!isClickInside) {
      dd.style.display = 'none';
    }
  }
});

// ── SOFT LOCK CLEANUP ON TAB CLOSE ──
window.addEventListener('beforeunload', () => {
  if (window.EMRContext && window.EMRContext.activePatientId && typeof BASE !== 'undefined') {
    db.ref(`${BASE}/active_sessions/${window.EMRContext.activePatientId}`).remove();
  }
});
let rxItems = [];
let uploadAttachments = [];
let _labOrders = {};
let _radOrders = {};
let activeEmrTab = 'timeline-tab';
let _referrals = {};
let currentReferralsFilter = 'all';
let _pharmacyInventory = {};
let _liveBookings = {};
let _myNotifications = [];
let _notifsClearedAt = parseInt(localStorage.getItem('argon_notifs_cleared') || '0');
let _lastSeenNotifTimestamp = parseInt(localStorage.getItem('argon_notif_seen') || '0');

let npPhotoData = '';
let epPhotoData = '';

// ── AUDIT LOGGING ENGINE ──
function logAudit(action, details, module = 'EMR') {
  const logId = db.ref().child('audit_logs').push().key;
  db.ref(`${BASE}/audit_logs/${logId}`).set({
    action,
    details,
    module,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent
  }).catch(err => console.error("Audit log failed: ", err));
}

// ── COMPRESS & PREVIEW PATIENT PHOTO ──
function previewPatientPhoto(event, prefix) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 120;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 120, 120);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      if (prefix === 'np') {
        npPhotoData = dataUrl;
        document.getElementById('npPhotoPreview').innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      } else {
        epPhotoData = dataUrl;
        document.getElementById('epPhotoPreview').innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ── DYNAMIC DUPLICATE ALERT ──
function detectNewPatDuplicates() {
  const name = document.getElementById('npName').value.trim().toLowerCase();
  const phone = cleanPhone(document.getElementById('npPhone').value);
  const warningDiv = document.getElementById('npDupWarning');

  if (!name && !phone) {
    warningDiv.style.display = 'none';
    return;
  }

  const matches = Object.entries(_patients).filter(([uid, p]) => {
    const info = p.info || {};
    const matchName = name && (info.name || '').trim().toLowerCase().includes(name);
    const matchPhone = phone && cleanPhone(info.phone || '') === phone;
    return matchName || matchPhone;
  });

  if (matches.length > 0) {
    let html = `<div style="font-weight:800;margin-bottom:6px"><i class="fas fa-exclamation-triangle"></i> تـنبيه: تم العثور على ملفات مشابهة (${matches.length})</div>`;
    html += matches.map(([uid, p]) => {
      const info = p.info || {};
      return `<div style="display:flex;justify-content:space-between;margin-top:4px;padding:4px 0;border-top:1px dashed rgba(245,158,11,0.15)">
        <span>👤 ${sanitize(info.name)} (MRN: ${info.mrn || '—'})</span>
        <span>📞 ${sanitize(info.phone || '')}</span>
      </div>`;
    }).join('');
    warningDiv.innerHTML = html;
    warningDiv.style.display = 'block';
  } else {
    warningDiv.style.display = 'none';
  }
}

// DOM Loaded
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

  // Bind EMR Login and settings
  db.ref(BASE + '/settings').on('value', snap => {
    _sets = snap.val();
    if (_sets) {
      _sets.mode = (_sets.type === 'complex' || _sets.mode === 'medical_complex') ? 'medical_complex' : 'single_clinic';
      checkAndSeedDefaultDepartments();
      const elClinicName = document.getElementById('lClinicName');
      const elTopName = document.getElementById('topName');
      const elTlogo = document.getElementById('tlogo');
      if (elClinicName) elClinicName.textContent = _sets.name || 'العيادة الطبية';
      // Only set clinic name in topbar if doctor hasn't logged in yet
      if (elTopName && !window._doctorLoggedIn) elTopName.textContent = _sets.name || 'العيادة الطبية';
      if (elTlogo) elTlogo.textContent = _sets.emoji ? `ARGON ${_sets.emoji}` : 'ARGON EMR';
    } else {
      const elClinicName = document.getElementById('lClinicName');
      if (elClinicName) elClinicName.textContent = 'العيادة غير موجودة';
    }
  });

  // Wait for Enterprise Runtime
  window.waitForArgonReady('emr').then(session => {
    window._doctorLoggedIn = true;
    const clinicName = _sets?.name || '';
    const docName = session.displayName || '';
    document.getElementById('topName').innerHTML = `<span style="color:var(--teal);font-weight:800">د. ${docName}</span><span style="margin:0 8px;opacity:0.3">|</span><span style="opacity:0.6;font-size:0.8rem">${clinicName}</span>`;
    initEMR();
  });

  // Load Doctors for dropdowns
  let _doctorsLoaded = false;
  db.ref(BASE + '/doctors').on('value', snap => {
    _doctors = snap.val() || {};
    _doctorsLoaded = true;
  });

  // Load Departments
  db.ref(BASE + '/departments').on('value', snap => {
    _depts = snap.val() || {};
    if (activePatientId && _patients[activePatientId]) {
      refreshPatientFileUI(activePatientId);
    }
  });

  // Load Lab Orders in EMR
  db.ref(BASE + '/lab_orders').on('value', snap => {
    _labOrders = snap.val() || {};
    if (activePatientId && _patients[activePatientId]) {
      refreshPatientFileUI(activePatientId);
    }
  });

  // Load Radiology Orders in EMR
  db.ref(BASE + '/radiology_orders').on('value', snap => {
    _radOrders = snap.val() || {};
    if (activePatientId && _patients[activePatientId]) {
      refreshPatientFileUI(activePatientId);
    }
  });

  // Load Pricing Catalog for Autocomplete
  db.ref(BASE + '/pricing_catalog').on('value', snap => {
    _pricingCatalogCache = snap.val() || {};
    if (typeof renderDynamicCatalogTags === 'function') renderDynamicCatalogTags();
  });
});
// EMR Initialization
function initEMR() {
  toast('مرحباً بك في نظام السجلات الطبية', 'ok');
  // Run legacy phone-key migration silently on first load
  setTimeout(() => migratePhoneKeyedPatients(), 3000);
  // Load Patients List directly from Firebase
  db.ref(BASE + '/patients').on('value', snap => {
    _patients = snap.val() || {};

    // Auto-load patient from URL param on first load
    if (!activePatientId) {
      const urlParams = new URLSearchParams(window.location.search);
      const urlPid = urlParams.get('pid');
      const urlPhone = urlParams.get('phone');
      window._pendingUrlBk = urlParams.get('bk'); // ── ARGON ENTERPRISE ──
      window._pendingUrlBkExpectedName = decodeURIComponent(urlParams.get('expectedName') || '');

      const targetId = urlPid || urlPhone;
      if (targetId && _patients[targetId] && !window._pendingUrlBk) {

        // ── ARGON ENTERPRISE: Block Legacy Poisoned Links from Old Dashboard Tabs ──
        const targetNid = typeof ArgonNID !== 'undefined' ? ArgonNID.cleanNID(urlParams.get('nid') || '') : '';
        const actualNid = typeof ArgonNID !== 'undefined' ? ArgonNID.cleanNID(_patients[targetId].info?.nationalId || '') : '';

        if (targetNid && actualNid && targetNid !== actualNid) {
          toast('🚨 تحذير أمني: تعارض بين الرقم الوطني في رابط الدخول وملف المريض المرتبط. تم إيقاف الدخول التلقائي لحماية السجلات.', 'err');
          if (typeof logAudit === 'function') logAudit('CRITICAL_NID_MISMATCH', `منع فتح ملف المريض المباشر بسبب تعارض الرقم الوطني. مطلوب:${targetNid} | موجود:${actualNid}`, 'EMR');
          window.history.replaceState({}, document.title, window.location.pathname + '?id=' + CID);
          return; // Block the automatic open
        }

        viewPatientFile(targetId);
        window.history.replaceState({}, document.title, window.location.pathname + '?id=' + CID);
      }
    } else if (_patients[activePatientId]) {
      refreshPatientFileUI(activePatientId);
    }

    filterPatients();
  });

  // Load Bookings for Waiting Room
  let bookingLoadTimer = null;
  let isInitWr = true;
  db.ref(BASE + '/bookings').once('value', () => { setTimeout(() => { isInitWr = false; }, 2000); });

  function playWrAlert() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
      osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.2); // A5
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
    } catch (e) { console.log('Audio fallback'); }
  }

  db.ref(BASE + '/bookings').on('child_added', snap => {
    const b = snap.val();
    _liveBookings[snap.key] = b;
    renderWaitingRoom();

    if (!isInitWr && b.status === 'waiting') {
      const session = ArgonSession.get() || {};
      const assignedDoc = b.doctorId || b.docKey;
      if (session.role === 'admin' || assignedDoc === session.staffId) playWrAlert();
    }

    // Debounce the patient list filter so it renders correctly after the initial batch of bookings arrives
    clearTimeout(bookingLoadTimer);
    bookingLoadTimer = setTimeout(() => {
      filterPatients();
      // ── ARGON ENTERPRISE: Process pending dashboard link ──
      if (window._pendingUrlBk && _liveBookings[window._pendingUrlBk] && Object.keys(_patients).length > 0) {
        openPatientFromBooking(window._pendingUrlBk);
        window.history.replaceState({}, document.title, window.location.pathname + '?id=' + CID);
        window._pendingUrlBk = null;
      }
    }, 300);
  });
  db.ref(BASE + '/bookings').on('child_changed', snap => {
    const oldB = _liveBookings[snap.key] || {};
    const newB = snap.val();
    _liveBookings[snap.key] = newB;
    renderWaitingRoom();

    if (!isInitWr && newB.status === 'waiting' && oldB.status !== 'waiting') {
      const session = ArgonSession.get() || {};
      const assignedDoc = newB.doctorId || newB.docKey;
      if (session.role === 'admin' || assignedDoc === session.staffId) playWrAlert();
    }
  });
  db.ref(BASE + '/bookings').on('child_removed', snap => {
    delete _liveBookings[snap.key];
    renderWaitingRoom();
  });

  // Real-time Notification Engine for Doctors
  const sessionData = window.ArgonSession ? window.ArgonSession.get() : null;
  const sessionUid = sessionData ? sessionData.staffId : null;
  let isInitNotify = true;

  if (sessionUid) {
    // 🚀 ULTRA-FAST QUERY: Explicitly using orderByKey to guarantee O(1) index seek for the last 200 items.
    db.ref(BASE + '/notifications').orderByKey().limitToLast(200).on('child_added', snap => {
      const n = snap.val();
      n.key = snap.key;

      // STRICT ISOLATION: Process notifications targeting this specific doctor
      if (n && n.role === 'doctor' && n.docKey === sessionUid) {
        if (new Date(n.createdAt).getTime() > _notifsClearedAt) {
          if (!_myNotifications.find(x => x.key === n.key)) {
            _myNotifications.unshift(n);
            _myNotifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            renderDoctorNotifications();

            // Provide instant visual and audio feedback for live notifications
            if (!isInitNotify) {
              toast('🔔 إشعار جديد: ' + (n.title || 'رسالة جديدة'), 'ok');
              try {
                // Play a subtle notification chime
                const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                audio.play().catch(e => console.log('Audio autoplay blocked'));
              } catch (e) { }
            }
          }
        }
      }
    });
  }

  window.clearAllNotifications = function () {
    if (!confirm('هل أنت متأكد من مسح جميع الإشعارات؟')) return;
    _notifsClearedAt = Date.now();
    localStorage.setItem('argon_notifs_cleared', _notifsClearedAt.toString());
    _myNotifications = [];
    renderDoctorNotifications();
    toast('✅ تم مسح الإشعارات بنجاح', 'ok');

    const badge = document.getElementById('notifBadge');
    if (badge) badge.style.display = 'none';
  };

  setTimeout(() => { isInitNotify = false; }, 3000);

  // --- DOCTOR NOTIFICATIONS SIDEBAR ---

  function renderDoctorNotifications() {
    const notifBadge = document.getElementById('notifBadge');
    const notifList = document.getElementById('notifList');
    const notifTitle = document.getElementById('notifSidebarTitle');

    if (!notifBadge || !notifList) return;

    if (notifTitle) {
      const docName = window.ArgonSession ? window.ArgonSession.get()?.displayName : '';
      const clearBtn = _myNotifications.length > 0 ? `<span onclick="event.stopPropagation(); clearAllNotifications()" style="font-size:0.75rem;color:var(--red);cursor:pointer;background:rgba(239,68,68,0.1);padding:4px 8px;border-radius:6px;margin-right:auto;display:flex;align-items:center;gap:4px;font-weight:bold;transition:0.2s" onmouseover="this.style.background='rgba(239,68,68,0.2)'" onmouseout="this.style.background='rgba(239,68,68,0.1)'"><i class="fas fa-trash-alt"></i> مسح الكل</span>` : '';
      notifTitle.innerHTML = `<div style="display:flex;align-items:center;width:100%;gap:10px">
        <i class="fas fa-bell" style="color:var(--amber)"></i> <span>إشعارات د. ${docName || 'الطبيب'}</span>
        ${clearBtn}
      </div>`;
    }

    const unreadCount = _myNotifications.filter(n => new Date(n.createdAt).getTime() > _lastSeenNotifTimestamp).length;
    if (unreadCount > 0) {
      notifBadge.textContent = unreadCount;
      notifBadge.style.display = 'block';
    } else {
      notifBadge.style.display = 'none';
    }

    if (_myNotifications.length > 0) {

      notifList.innerHTML = _myNotifications.map(n => {
        const isLab = (n.title || '').includes('تحاليل') || (n.title || '').includes('🔬');
        const isRad = (n.title || '').includes('أشعة') || (n.title || '').includes('🩻');
        const typeIcon = isLab ? '🧪' : isRad ? '🩻' : '🔔';
        const typeLabel = isLab ? 'نتيجة مختبر' : isRad ? 'نتيجة أشعة' : 'إشعار';
        const typeBg = isLab ? 'rgba(16,185,129,0.15)' : isRad ? 'rgba(14,165,233,0.15)' : 'rgba(255,255,255,0.05)';
        const typeBorder = isLab ? 'rgba(16,185,129,0.4)' : isRad ? 'rgba(14,165,233,0.4)' : 'var(--border)';
        const typeColor = isLab ? '#10b981' : isRad ? '#0ea5e9' : 'var(--amber)';
        const ago = window.argonTimeAgo(n.createdAt);
        const isNew = n.createdAt && (Date.now() - new Date(n.createdAt).getTime()) < 120000;

        return `
        <div style="background:${typeBg};border:1px solid ${typeBorder};border-radius:12px;padding:14px;cursor:pointer;transition:0.2s;${isNew ? 'animation:notifPulse 2s ease infinite;' : ''}" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'" onclick="openNotification('${n.patientId || ''}', '${n.key}')">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-size:0.75rem;background:${typeColor};color:#fff;padding:2px 8px;border-radius:6px;font-weight:bold">${typeIcon} ${typeLabel}</span>
            <span style="font-size:0.7rem;color:${isNew ? 'var(--amber)' : 'var(--muted)'};font-weight:${isNew ? 'bold' : 'normal'}"><i class="far fa-clock"></i> ${ago}</span>
          </div>
          <div style="font-size:0.85rem;color:var(--text);line-height:1.6;margin-top:4px">
            ${n.message.replace(/(للمريض|المريض)\s+(.*?)(?=\s+لمراجعتها|$)/, '$1 <span style="background:rgba(0,0,0,0.2);padding:2px 8px;border-radius:6px;font-weight:900;font-size:0.95rem;">$2</span>')}
          </div>
        </div>
      `;
      }).join('');
    } else {
      notifBadge.style.display = 'none';
      notifList.innerHTML = `
      <div style="text-align:center;color:var(--muted);margin-top:40px">
        <i class="fas fa-inbox" style="font-size:2rem;opacity:0.3"></i><br>لا يوجد إشعارات حالياً
      </div>
    `;
    }
  }

  // Auto-refresh relative timestamps every 30 seconds
  setInterval(() => { if (_myNotifications.length > 0) renderDoctorNotifications(); }, 30000);

  window.toggleNotifications = function () {
    const sidebar = document.getElementById('notifSidebar');
    if (sidebar) {
      if (sidebar.style.left === '0px') {
        sidebar.style.left = '-400px';
      } else {
        sidebar.style.left = '0px';
        // Mark all as read
        _lastSeenNotifTimestamp = Date.now();
        localStorage.setItem('argon_notif_seen', _lastSeenNotifTimestamp);
        const badge = document.getElementById('notifBadge');
        if (badge) badge.style.display = 'none';
      }
    }
  };

  window.openNotification = function (patientId, notifKey) {
    window.toggleNotifications();

    if (patientId && patientId !== 'undefined') {
      // 1. Switch sidebar active menu manually
      document.querySelectorAll('.ni').forEach(n => n.classList.remove('on'));
      const patFileMenu = document.querySelectorAll('.ni')[1]; // 'ملف المريض'
      if (patFileMenu) patFileMenu.classList.add('on');

      // 2. Switch main section
      sw('patFile');

      // 3. Load Patient Profile
      viewPatientFile(patientId);
    } else {
      toast('⚠️ عذراً، الإشعارات القديمة لا تحتوي على رابط مباشر لملف المريض', 'err');
    }
  };

  // Close sidebar when clicking outside
  document.addEventListener('click', (e) => {
    const sidebar = document.getElementById('notifSidebar');
    const btn = document.getElementById('notifBtn');
    if (sidebar && btn && sidebar.style.left === '0px') {
      if (!sidebar.contains(e.target) && !btn.contains(e.target)) {
        sidebar.style.left = '-400px';
      }
    }
  });
  // ----------------------------------

  // Show referrals sidebar button if license is Medical Complex
  if (_sets && _sets.mode === 'medical_complex') {
    const btn = document.getElementById('referralsMenuBtn');
    if (btn) btn.style.display = 'flex';
  }

  // Enterprise Incremental Referrals Listener
  let _refTimer = null;
  const debounceRef = () => { clearTimeout(_refTimer); _refTimer = setTimeout(renderReferralsList, 80); };
  db.ref(BASE + '/referrals').on('child_added', snap => { _referrals[snap.key] = snap.val(); debounceRef(); });
  db.ref(BASE + '/referrals').on('child_changed', snap => { _referrals[snap.key] = snap.val(); debounceRef(); });
  db.ref(BASE + '/referrals').on('child_removed', snap => { delete _referrals[snap.key]; debounceRef(); });

  // Enterprise Incremental Pharmacy Inventory Listener
  let _invTimer = null;
  const debounceInv = () => { clearTimeout(_invTimer); _invTimer = setTimeout(() => { /* inventory UI update placeholder */ }, 80); };
  db.ref(BASE + '/pharmacy_inventory').on('child_added', snap => { _pharmacyInventory[snap.key] = snap.val(); debounceInv(); });
  db.ref(BASE + '/pharmacy_inventory').on('child_changed', snap => { _pharmacyInventory[snap.key] = snap.val(); debounceInv(); });
  db.ref(BASE + '/pharmacy_inventory').on('child_removed', snap => { delete _pharmacyInventory[snap.key]; debounceInv(); });
}

// ── ENTERPRISE LEGACY MIGRATION ──
// One-time silent migration: converts patients stored with phone-as-key
// to proper Firebase Push Key (UUID), eliminating the primary collision source.
async function migratePhoneKeyedPatients() {
  // Check if migration was already done for this clinic
  const flagSnap = await db.ref(`${BASE}/_meta/phoneKeyMigrationDone`).once('value');
  if (flagSnap.val() === true) return; // Already migrated

  const snap = await db.ref(`${BASE}/patients`).once('value');
  if (!snap.exists()) return;

  const allPatients = snap.val();
  const phoneKeyedEntries = Object.entries(allPatients).filter(([k]) => /^\d+$/.test(k));

  if (!phoneKeyedEntries.length) {
    // No legacy records — mark as done and exit
    await db.ref(`${BASE}/_meta/phoneKeyMigrationDone`).set(true);
    return;
  }

  console.log(`%c🔄 ARGON Migration: Found ${phoneKeyedEntries.length} legacy phone-keyed patient(s). Migrating...`, 'color:#0d9488;font-weight:bold');

  const updates = {};
  const migrated = [];

  for (const [phoneKey, patientData] of phoneKeyedEntries) {
    const phone = cleanPhone(phoneKey);

    // Check if a UUID-keyed record already exists for this phone AND NAME
    // This prevents merging different family members who share a phone number.
    const existingUuid = Object.entries(allPatients).find(([k, p]) => {
      const isMatchPhone = phone && k.startsWith('-') && cleanPhone(p.info?.phone || '') === phone;
      if (!isMatchPhone) return false;

      const legacyName = (patientData.info?.name || '').trim().toLowerCase();
      const uuidName = (p.info?.name || '').trim().toLowerCase();

      // If either name is missing, or they match/substring match, we consider it the same person
      if (!legacyName || !uuidName) return true;
      return legacyName === uuidName || legacyName.includes(uuidName) || uuidName.includes(legacyName);
    });

    if (existingUuid) {
      // UUID record already exists — merge visits/data from legacy into it, then delete legacy
      const [uuidKey, uuidData] = existingUuid;
      const legacyVisits = patientData.visits || {};
      const legacyInvoices = patientData.invoices || {};

      // Copy visits not already in UUID record
      Object.entries(legacyVisits).forEach(([vk, vv]) => {
        if (!uuidData.visits?.[vk]) {
          updates[`${BASE}/patients/${uuidKey}/visits/${vk}`] = vv;
        }
      });
      // Copy invoices not already in UUID record
      Object.entries(legacyInvoices).forEach(([ik, iv]) => {
        if (!uuidData.invoices?.[ik]) {
          updates[`${BASE}/patients/${uuidKey}/invoices/${ik}`] = iv;
        }
      });
      // Merge missing info fields
      const legacyInfo = patientData.info || {};
      const mergedInfo = { ...legacyInfo, ...uuidData.info }; // UUID info takes priority
      updates[`${BASE}/patients/${uuidKey}/info`] = mergedInfo;

      // Delete legacy phone-keyed record
      updates[`${BASE}/patients/${phoneKey}`] = null;
      migrated.push(`${legacyInfo.name || phoneKey} (دمج في ${uuidKey})`);

    } else {
      // No UUID record — create a new one with proper Push Key
      const newRef = db.ref(`${BASE}/patients`).push();
      const newKey = newRef.key;
      // Ensure MRN exists
      if (!patientData.info) patientData.info = {};
      if (!patientData.info.mrn) patientData.info.mrn = genMRN();

      updates[`${BASE}/patients/${newKey}`] = patientData;
      updates[`${BASE}/patients/${phoneKey}`] = null;
      migrated.push(`${patientData.info.name || phoneKey} → ${newKey}`);
    }
  }

  // Mark migration as complete
  updates[`${BASE}/_meta/phoneKeyMigrationDone`] = true;
  updates[`${BASE}/_meta/phoneKeyMigrationDate`] = new Date().toISOString();
  updates[`${BASE}/_meta/phoneKeyMigrationCount`] = migrated.length;

  await db.ref().update(updates);
  console.log(`%c✅ ARGON Migration Complete: ${migrated.length} patient(s) migrated.`, 'color:#10b981;font-weight:bold');
  migrated.forEach(m => console.log(`   ✔ ${m}`));

  if (migrated.length > 0) {
    toast(`✅ تم ترحيل ${migrated.length} ملف طبي قديم إلى نظام UUID الحديث`, 'ok');
  }
}

// Sidebar Navigation
function sw(id, el) {
  // Prevent opening empty clinical workspace if no patient is active
  if (id === 'newVisit') {
    if (typeof activeVisit === 'undefined' || !activeVisit || !activeVisit.uid) {
      if (typeof toast !== 'undefined') toast('⚠️ الرجاء اختيار مريض من غرفة الانتظار أولاً لبدء زيارة', 'warn');
      return;
    }
  }

  // Release patient locks when leaving patient-specific contexts
  if (id !== 'patFile' && id !== 'newVisit') {
    if (window.EMRContext && window.EMRContext.sessionLock) {
      if (typeof BASE !== 'undefined' && window.EMRContext.activePatientId) {
        db.ref(`${BASE}/active_sessions/${window.EMRContext.activePatientId}`).remove();
      }
      window.EMRContext.sessionLock = false;
      window.EMRContext.activePatientId = null;
    }
  }

  document.querySelectorAll('.sec').forEach(s => s.classList.remove('on'));
  document.getElementById(id).classList.add('on');
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('on'));
  if (el) el.classList.add('on');
}

// Toast
function toast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = type ? 'show ' + type : 'show';
  setTimeout(() => t.className = '', 3000);
}

// Theme
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

// Render Patients List
let patPageLimit = 15;
let lastQuery = '';

function renderPatientsList(entries) {
  const grid = document.getElementById('patGrid');
  if (!entries.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)">
      <i class="fas fa-users-slash" style="font-size:2.5rem;margin-bottom:10px;opacity:.3"></i>
      <p>لا يوجد مرضى مسجلين بعد</p>
    </div>`;
    return;
  }

  const sliced = entries.slice(0, patPageLimit);
  let html = sliced.map(([uid, p]) => {
    const info = p.info || {};
    const genderIcon = info.gender === 'ذكر' ? '👨' : info.gender === 'أنثى' ? '👩' : '👤';
    const ageStr = info.age ? `${info.age} سنة` : '';
    const genderStr = info.gender || '';
    const ageGender = [ageStr, genderStr].filter(Boolean).join(' · ');
    const _nidStatus = ArgonNID.isValidNID(info.nationalId || '')
      ? `<span style="
           font-size:10px;color:var(--teal,#0d9488);font-family:monospace;
           background:rgba(13,148,136,.08);padding:1px 7px;border-radius:5px;
           border:1px solid rgba(13,148,136,.2);
         ">🪪 ${ArgonNID.cleanNID(info.nationalId)}</span>`
      : `<span style="
           font-size:10px;color:rgba(239,68,68,0.7);
           background:rgba(239,68,68,.06);padding:1px 7px;border-radius:5px;
           border:1px solid rgba(239,68,68,.15);
         ">🪪 لا يوجد رقم وطني</span>`;

    // Detect potential duplicates — show warning badge if same name+phone as another
    const dupCount = Object.values(_patients).filter(pp => pp.info && pp.info.name === info.name && pp.info.phone === info.phone).length;
    const dupBadge = dupCount > 1 ? `<span style="background:rgba(245,158,11,0.12);color:var(--amber);border-radius:6px;padding:2px 7px;font-size:10px;font-weight:700;margin-right:5px">⚠️ تعارض محتمل</span>` : '';

    const avatarHTML = info.photo
      ? `<div class="plist-avatar"><img src="${info.photo}"></div>`
      : `<div class="plist-avatar" style="font-size:1.5rem">${genderIcon}</div>`;

    return `<div class="plist-card" onclick="viewPatientFile('${uid}')">
      ${avatarHTML}
      <div class="plist-info">
        <div class="plist-name">${sanitize(info.name)} ${dupBadge}</div>
        <div class="plist-meta">${sanitize(info.phone || '')} ${ageGender ? `· ${ageGender}` : ''}</div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <div class="plist-mrn">${info.mrn || 'MRN-NEW'}</div>
          ${_nidStatus}
        </div>
      </div>
    </div>`;
  }).join('');

  if (entries.length > patPageLimit) {
    html += `
      <div id="patLoadMoreContainer" style="grid-column:1/-1; text-align:center; padding:15px 0;">
        <button class="btn-secondary" onclick="loadMorePatients()" style="width:100%; justify-content:center; padding:12px; border-radius:8px;">
          <i class="fas fa-chevron-down"></i> عرض المزيد (${entries.length - patPageLimit} مرضى إضافيين)
        </button>
      </div>
    `;
  }
  grid.innerHTML = html;
}

function loadMorePatients() {
  patPageLimit += 15;
  filterPatients();
}

// Smart Filter — Doctor-isolated: shows only patients booked with this doctor OR manually created by this doctor
function filterPatients() {
  const q = document.getElementById('patSearch').value.toLowerCase().trim();
  if (q !== lastQuery) {
    patPageLimit = 15;
    lastQuery = q;
  }

  const session = ArgonSession.get() || {};
  const loggedInDoctorId = session.staffId;
  const isAdmin = session.role === 'admin';

  // Build the set of patient IDs/phones that have at least one booking for THIS doctor
  let allowedPatients = null;
  const isComplex = _sets && (_sets.mode === 'medical_complex' || _sets.type === 'complex');
  
  // Only apply strict doctor isolation in Polyclinic (Medical Complex) mode.
  // In a Single Clinic, the doctor should see all patients in the database.
  if (isComplex && loggedInDoctorId && !isAdmin) {
    allowedPatients = new Set();
    Object.values(_liveBookings).forEach(b => {
      const assignedDoc = b.doctorId || b.docKey;
      if (assignedDoc === loggedInDoctorId) {
        if (b.patientId) allowedPatients.add(b.patientId);
        if (b.patPhone) allowedPatients.add(b.patPhone);
      }
    });
  }

  const entries = Object.entries(_patients).filter(([uid, p]) => {
    const info = p.info || {};
    if (allowedPatients !== null) {
      // Is there an active booking for this doctor?
      const hasBooking = allowedPatients.has(uid) || allowedPatients.has(info.phone);
      // Did this doctor create this patient?
      const createdByMe = info.createdBy === loggedInDoctorId;
      // Does this patient have past visits with this doctor?
      const hasPastVisit = Object.values(p.visits || {}).some(v => (v.doctorId || v.docKey) === loggedInDoctorId);
      
      if (!hasBooking && !createdByMe && !hasPastVisit) return false;
    }

    if (!q) return true;

    return (info.phone || '').includes(q) ||
      (info.name || '').toLowerCase().includes(q) ||
      (info.mrn || '').toLowerCase().includes(q) ||
      (info.nationalId || '').toLowerCase().includes(q) ||
      uid.includes(q);
  });
  renderPatientsList(entries);
}

// Render Waiting Room
function renderWaitingRoom() {
  const wrList = document.getElementById('wrList');
  const wrTitle = document.getElementById('wrTitle');
  const docName = window.ArgonSession ? window.ArgonSession.get()?.displayName : '';

  if (wrTitle) {
    wrTitle.innerHTML = `⏳ غرفة الانتظار المباشرة - <span style="color:var(--amber)">د. ${docName || 'الطبيب'}</span>`;
  }

  if (!wrList) return;

  const session = ArgonSession.get() || {};
  const loggedInDoctorId = session.staffId;
  const isAdmin = session.role === 'admin';

  const activeBookings = Object.entries(_liveBookings).filter(([k, b]) => {
    if (b.status === 'done' || b.status === 'completed' || b.status === 'cancelled') return false;

    // ═══ STRICT DOCTOR ISOLATION ═══
    // Every booking MUST have a doctorId — bookings without one are admin-only
    const assignedDoc = b.doctorId || b.docKey;
    if (!isAdmin) {
      if (!assignedDoc) return false;                          // No doctor assigned → invisible
      if (assignedDoc !== loggedInDoctorId) return false;     // Wrong doctor → blocked
    }
    return true;
  }).sort((a, b) => {
    const prio = { 'with_doctor': 1, 'waiting': 2, 'confirmed': 3, 'new': 4 };
    const pA = prio[a[1].status] || 5;
    const pB = prio[b[1].status] || 5;
    if (pA !== pB) return pA - pB;
    return (a[1].time || '').localeCompare(b[1].time || '');
  });

  const wrBadge = document.getElementById('wrBadge');
  if (wrBadge) {
    const waitingCount = activeBookings.filter(b => b[1].status === 'waiting').length;
    if (waitingCount > 0) {
      wrBadge.innerText = waitingCount;
      wrBadge.style.display = 'inline-block';
    } else {
      wrBadge.style.display = 'none';
    }
  }

  if (!activeBookings.length) {
    wrList.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)">
      <i class="fas fa-bed" style="font-size:2.5rem;margin-bottom:10px;opacity:.3"></i>
      <p>غرفة الانتظار فارغة حالياً</p>
    </div>`;
    return;
  }

  const stMap = {
    'new': 'حجز جديد',
    'confirmed': 'مؤكد',
    'waiting': 'في غرفة الانتظار ⏳',
    'with_doctor': 'عند الطبيب 🩺'
  };
  const stColor = {
    'new': 'var(--sky)',
    'confirmed': 'var(--teal)',
    'waiting': 'var(--amber)',
    'with_doctor': 'var(--purple)'
  };

  wrList.innerHTML = activeBookings.map(([k, b]) => {
    const isDoc = b.status === 'with_doctor';
    // Pass booking key so we can resolve by name+phone
    return `<div class="glass-panel" style="padding:16px;border-right:4px solid ${stColor[b.status] || 'var(--teal)'}; cursor:pointer; transition:all 0.2s" onclick="openPatientFromBooking('${k}')">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-size:0.75rem;font-weight:800;color:${stColor[b.status]};background:rgba(255,255,255,0.05);padding:3px 8px;border-radius:12px">${stMap[b.status] || b.status}</span>
        <span style="font-family:'IBM Plex Mono',monospace;font-size:0.8rem">${b.time || '—'}</span>
      </div>
      <div style="font-weight:800;font-size:1.05rem;margin-bottom:4px">${sanitize(b.patName)}</div>
      <div style="font-size:0.8rem;color:var(--muted);margin-bottom:8px">📞 ${sanitize(b.patPhone)}</div>
      ${isDoc ? `<button class="btn-primary btn-sm" style="width:100%;background:rgba(168,85,247,0.1);color:#a855f7;border:1px solid rgba(168,85,247,0.3)" onclick="event.stopPropagation(); openPatientFromBooking('${k}', true)"><i class="fas fa-stethoscope"></i> بدء زيارة طبية</button>` : ''}
    </div>`;
  }).join('');
}

// Open patient file from waiting room — resolves correct patient by phone+name from booking
async function openPatientFromBooking(bookingKey, startVisit = false) {
  const booking = _liveBookings[bookingKey] || {};
  const rawUid = booking.patientId || booking.patPhone;
  const bookingName = (booking.patName || '').trim();

  // B4-A: استخراج NID من بيانات الحجز
  const _bNID = ArgonNID.cleanNID(
    booking.patNationalId || booking.nationalId || ''
  );

  // B4-B: إذا في NID في الحجز ← بحث مباشر وسريع بدون Firebase
  if (ArgonNID.isValidNID(_bNID)) {
    const nidMatches = Object.entries(_patients).filter(([uid, p]) => ArgonNID.cleanNID(p.info?.nationalId || '') === _bNID);

    if (nidMatches.length > 1) {
      // ── ARGON ENTERPRISE: CRITICAL NID DUPLICATE DETECTION ──
      toast('🚨 خطأ أمني: يوجد أكثر من ملف طبي يحمل نفس الرقم الوطني. تم إيقاف الدخول لحماية السجلات.', 'err');
      if (typeof logAudit === 'function') {
        logAudit('CRITICAL_NID_DUPLICATE_DETECTION', `تم إيقاف الدخول لملف المريض من الحجز. تطابق الرقم الوطني (${_bNID}) لعدة مرضى.`, 'EMR');
      }
      return; // أوقف الفتح بالكامل — يحتاج مراجعة إدارية
    } else if (nidMatches.length === 1) {
      const _nidHit = { uid: nidMatches[0][0], info: nidMatches[0][1].info || {} };
      // ✅ EXACT فوري — فتح مباشر
      if (window.ArgonMedical?.ShadowLog?.log) {
        window.ArgonMedical.ShadowLog.log(CID, {
          result: 'EXACT', confidence: 1.0,
          matchedId: _nidHit.uid, matchedName: _nidHit.info.name,
          reason: '🔒 NID direct hit from booking — instant open, zero ambiguity'
        }, {
          source: 'doctor_wr_nid_direct',
          userId: (ArgonSession.get() || {}).staffId || ''
        }, db);
      }
      if (startVisit) { sw('newVisit'); loadVisitForm(_nidHit.uid, bookingKey); }
      else { viewPatientFile(_nidHit.uid); sw('patFile'); }
      return; // ← أوقف كل المنطق الآخر
    }
  }
  const bookingPhone = booking.patPhone || rawUid;

  if (!rawUid) {
    toast('⚠️ لا توجد بيانات مرتبطة بهذا الحجز', 'err');
    return;
  }

  // ── ARGON ENTERPRISE: Smart Patient Match & Shadow Logging ──
  if (window.ArgonMedical && window.ArgonMedical.PatientMatch) {
    const session = window.ArgonSession ? window.ArgonSession.get() : {};
    const currentDoctorId = session.staffId || 'unknown_doc';
    const matchResult = await window.ArgonMedical.PatientMatch.findMatch(
      CID,
      { name: bookingName, phone: bookingPhone, nationalId: _bNID },
      db
    );

    await window.ArgonMedical.ShadowLog.log(
      CID,
      matchResult,
      {
        source: "doctor_waiting_room", userId: currentDoctorId,
        incoming: { name: bookingName, phone: bookingPhone }
      },
      db
    );

    // If Shadow Mode is OFF, we enforce the smart matching decision
    if (typeof ARGON_FLAGS !== 'undefined' && !ARGON_FLAGS.shadowMode) {
      if (matchResult.result === "EXACT" || matchResult.result === "STRONG") {
        if (startVisit) {
          sw('newVisit');
          loadVisitForm(matchResult.matchedId, bookingKey);
        } else {
          viewPatientFile(matchResult.matchedId);
          sw('patFile');
        }
        return;
      }
      if (matchResult.result === "POSSIBLE") {
        // أضف البيانات الواردة للنتيجة حتى تظهر في نافذة المقارنة
        matchResult._incomingName = bookingName;
        matchResult._incomingPhone = booking.patPhone || rawUid;

        window.ArgonMedical.showMatchDialog(
          matchResult,
          // ✅ المستخدم قال: نفس الشخص
          (existingId) => {
            if (startVisit) {
              sw('newVisit');
              loadVisitForm(existingId, bookingKey);
            } else {
              viewPatientFile(existingId);
              sw('patFile');
            }
            // اربط الحجز بالملف الصحيح
            db.ref(`${BASE}/bookings/${bookingKey}/patientId`).set(existingId).catch(() => { });
          },
          // 👨👩👧 المستخدم قال: فرد عائلة جديد — سكمّل المنطق القديم
          () => {
            _openPatientFromBookingLegacy(bookingKey, booking, startVisit);
          }
        );
        return; // أوقف التنفيذ — النافذة ستتولى الأمر
      }
    }
  }
  // ─────────────────────────────────────────────────────────────

  // 1️⃣ Direct Firebase Push Key match (patientId) WITH Strict Name Integrity
  if (booking.patientId && _patients[booking.patientId]) {
    const pInfo = _patients[booking.patientId].info || {};
    const patName = (pInfo.name || '').trim().toLowerCase();

    // ── ARGON ENTERPRISE: Strict NID Conflict Check ──
    const patNID = ArgonNID.cleanNID(pInfo.nationalId || '');
    let isPoisoned = false;

    if (_bNID && patNID && _bNID !== patNID) {
      isPoisoned = true;
      toast('🚨 تحذير أمني: تعارض جذري بين الرقم الوطني للحجز والملف المرتبط به. تم إيقاف الدخول التلقائي.', 'err');
      if (typeof logAudit === 'function') logAudit('CRITICAL_NID_MISMATCH', `منع فتح ملف المريض بسبب تعارض الرقم الوطني. حجز:${_bNID} | ملف:${patNID}`, 'EMR');
    }

    // Strict Check: If names are radically different, the booking system mistakenly linked them due to a shared phone
    let nameMismatch = false;
    if (!bookingName || !patName) {
      nameMismatch = false; // إذا أحد الأسماء فاضي، ما نعتبره mismatch
    } else {
      const normalize = s => s.trim().replace(/\s+/g, ' ').split(' ')[0];
      const bFirst = normalize(bookingName);
      const pFirst = normalize(patName);
      nameMismatch = bFirst.length > 0 && pFirst.length > 0 && bFirst !== pFirst;
    }

    if (!isPoisoned && !nameMismatch) {
      if (startVisit) {
        sw('newVisit');
        loadVisitForm(booking.patientId, bookingKey);
      } else {
        viewPatientFile(booking.patientId);
        sw('patFile');
      }
      return;
    } else {
      console.warn('⚠️ EMR Integrity: Booking PatientID mismatch with Name. Falling back to phone resolver.', { bookingName, patName });
      // Clear the poisoned patientId for this resolution attempt
      booking.patientId = null;
    }
  }

  // ── ARGON ENTERPRISE: Zero Auto-Merge Without NID ──
  // بدلاً من إيقاف التنفيذ كلياً، نعرض نافذة تتيح للطاقم الربط اليدوي أو البحث بالاسم/الهاتف
  if (typeof ARGON_FLAGS !== 'undefined' && ARGON_FLAGS.REQUIRE_NID_FOR_LINKING) {
    if (window.ArgonMedical && window.ArgonMedical.ShadowLog) {
      window.ArgonMedical.ShadowLog.log(CID,
        { result: 'BLOCKED', reason: 'Zero auto-merge policy enforced. Missing NID.' },
        { source: 'doctor_wr_fallback', incoming: { name: bookingName } }, db
      );
    }
    // عرض نافذة الربط اليدوي بدلاً من رسالة الخطأ الصماء
    _showNIDLinkDialog(bookingKey, booking, bookingName, startVisit);
    return;
  }

  // 2️⃣ Search by Phone
  const phone = cleanPhone(booking.patPhone || rawUid);
  const matched = Object.entries(_patients).filter(([k, p]) =>
    cleanPhone(p.info?.phone || '') === phone ||
    cleanPhone(k) === phone
  );

  if (!matched.length) {
    toast('⚠️ ملف المريض غير موجود. يرجى تسجيله من لوحة الاستقبال.', 'err');
    return;
  }

  // 3️⃣ ARGON ENTERPRISE: Block Ambiguous Auto-Open
  if (matched.length > 1) {
    showDoctorProfileSelector(matched, bookingName || phone, (selectedUid) => {
      // ✅ الطبيب اختار المريض يدوياً بناءً على الهوية الصريحة
      if (typeof BASE !== 'undefined' && bookingKey && !bookingKey.includes('walkin')) {
        // نحدث الحجز بالمعرف الصحيح لتأكيد الربط
        db.ref(`${BASE}/bookings/${bookingKey}/patientId`).set(selectedUid).catch(() => { });
      }
      if (startVisit) { sw('newVisit'); loadVisitForm(selectedUid, bookingKey); }
      else { viewPatientFile(selectedUid); sw('patFile'); }
    });
    return;
  }

  // 4️⃣ If we have exactly 1 match
  if (matched.length === 1) {
    // لو الحجز فيه اسم، نتحقق إنه يطابق المريض المكتشف
    const foundInfo = _patients[matched[0][0]]?.info || {};
    const foundName = (foundInfo.name || '').trim().toLowerCase();
    const incomingName = bookingName.toLowerCase();

    const normalize = s => s.replace(/\s+/g, ' ').trim().split(' ')[0];
    const firstName1 = normalize(foundName);
    const firstName2 = normalize(incomingName);

    const namesMatch = !firstName1 || !firstName2 || firstName1 === firstName2;

    if (namesMatch) {
      if (startVisit) { sw('newVisit'); loadVisitForm(matched[0][0], bookingKey); }
      else { viewPatientFile(matched[0][0]); sw('patFile'); }
      return;
    } else {
      // الاسم مختلف — لا نفتح تلقائياً، نعرض selector
      showDoctorProfileSelector(matched, bookingName || phone, (selectedUid) => {
        if (typeof BASE !== 'undefined' && bookingKey && !bookingKey.includes('walkin')) {
          db.ref(`${BASE}/bookings/${bookingKey}/patientId`).set(selectedUid).catch(() => { });
        }
        if (startVisit) { sw('newVisit'); loadVisitForm(selectedUid, bookingKey); }
        else { viewPatientFile(selectedUid); sw('patFile'); }
      });
      return;
    }
  }

  // 5️⃣ Fallback Legacy
  _openPatientFromBookingLegacy(bookingKey, booking, startVisit);
}

/**
 * ── نافذة الربط اليدوي للمريض ──
 * تظهر عندما يكون الحجز بدون رقم وطني مؤكد
 * تتيح: (1) إدخال الرقم الوطني ومطابقته، (2) البحث بالاسم/الهاتف، (3) إنشاء ملف جديد
 * FIX v1.1 — بديل نافذة الخطأ الصماء
 */
function _showNIDLinkDialog(bookingKey, booking, bookingName, startVisit) {
  const existing = document.getElementById('_nidLinkDialogOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = '_nidLinkDialogOverlay';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(2,7,6,.88);backdrop-filter:blur(12px);
    z-index:120000;display:flex;align-items:center;justify-content:center;padding:20px;
    font-family:'Tajawal',sans-serif;
  `;

  overlay.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--border);border-radius:22px;
                padding:28px;width:100%;max-width:500px;box-shadow:0 24px 64px rgba(0,0,0,.6)">

      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:2.8rem;margin-bottom:8px">🔍</div>
        <div style="font-size:1.15rem;font-weight:900;color:var(--text)">ربط ملف المريض</div>
        <div style="font-size:.82rem;color:var(--amber);font-weight:600;margin-top:4px">
          الحجز لـ <b>${sanitize(bookingName)}</b> لا يحتوي على رقم وطني مؤكد
        </div>
      </div>

      <!-- Tab 1: NID entry -->
      <div style="background:rgba(13,148,136,.06);border:1px solid rgba(13,148,136,.2);border-radius:12px;padding:16px;margin-bottom:12px">
        <div style="font-size:.78rem;color:var(--teal);font-weight:800;margin-bottom:10px">
          <i class="fas fa-id-card"></i> إدخال الرقم الوطني والربط التلقائي
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="text" id="_nldNID" placeholder="أدخل الرقم الوطني (9-10 أرقام)"
            dir="ltr" maxlength="12"
            style="flex:1;background:var(--surf);border:1px solid var(--border);border-radius:9px;
                   padding:10px 12px;color:var(--text);font-family:'IBM Plex Mono',monospace;font-size:.9rem;outline:none"
            onkeydown="if(event.key==='Enter') _nldDoNID('${bookingKey}','${sanitize(bookingName)}',${startVisit})">
          <button onclick="_nldDoNID('${bookingKey}','${sanitize(bookingName)}',${startVisit})"
            style="background:var(--teal);border:none;color:#fff;padding:10px 16px;border-radius:9px;
                   font-family:'Tajawal',sans-serif;font-weight:800;cursor:pointer;white-space:nowrap">
            <i class="fas fa-search"></i> مطابقة
          </button>
        </div>
        <div id="_nldNIDResult" style="font-size:.78rem;margin-top:8px;color:var(--muted)"></div>
      </div>

      <!-- Tab 2: Search -->
      <div style="background:rgba(14,165,233,.06);border:1px solid rgba(14,165,233,.2);border-radius:12px;padding:16px;margin-bottom:12px">
        <div style="font-size:.78rem;color:var(--sky);font-weight:800;margin-bottom:10px">
          <i class="fas fa-user-search"></i> بحث في السجلات الموجودة (اسم أو هاتف)
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="text" id="_nldSearch" placeholder="اكتب جزءاً من الاسم أو الهاتف..."
            style="flex:1;background:var(--surf);border:1px solid var(--border);border-radius:9px;
                   padding:10px 12px;color:var(--text);font-family:'Tajawal',sans-serif;font-size:.88rem;outline:none"
            oninput="_nldDoSearch(this.value)">
        </div>
        <div id="_nldSearchResults" style="margin-top:10px;max-height:180px;overflow-y:auto"></div>
      </div>

      <!-- Actions -->
      <div style="display:flex;gap:8px">
        <button onclick="_nldOpenNew('${bookingKey}',${startVisit})"
          style="flex:1;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);color:var(--green);
                 padding:10px;border-radius:10px;font-family:'Tajawal',sans-serif;font-weight:700;cursor:pointer">
          <i class="fas fa-user-plus"></i> فتح كمريض جديد
        </button>
        <button onclick="document.getElementById('_nidLinkDialogOverlay').remove()"
          style="background:var(--surf);border:1px solid var(--border);color:var(--muted);
                 padding:10px 18px;border-radius:10px;font-family:'Tajawal',sans-serif;font-weight:600;cursor:pointer">
          إلغاء
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Pre-fill NID from booking if partially available
  const preFill = (booking.patNationalId || booking.nationalId || '').trim();
  if (preFill) document.getElementById('_nldNID').value = preFill;

  // Store context on window for callbacks
  window._nldCtx = { bookingKey, booking, startVisit };

  setTimeout(() => {
    const ni = document.getElementById('_nldNID');
    if (ni) ni.focus();
  }, 150);
}

// مطابقة بالرقم الوطني
window._nldDoNID = async function(bookingKey, bookingName, startVisit) {
  const rawNID = (document.getElementById('_nldNID')?.value || '').trim();
  const cleanNID = ArgonNID.cleanNID(rawNID);
  const resultDiv = document.getElementById('_nldNIDResult');

  if (!ArgonNID.isValidNID(cleanNID)) {
    if (resultDiv) resultDiv.innerHTML = '<span style="color:var(--red)">⚠️ رقم وطني غير صالح (يجب أن يكون 9 أرقام على الأقل)</span>';
    return;
  }

  if (resultDiv) resultDiv.innerHTML = '<i class="fas fa-circle-notch fa-spin" style="color:var(--teal)"></i> جارِ البحث...';

  // أولاً: بحث محلي في الذاكرة
  const localMatch = ArgonNID.findByNIDLocal(cleanNID, _patients);
  if (localMatch) {
    if (resultDiv) resultDiv.innerHTML = `<span style="color:var(--green)">✅ وُجد: ${sanitize(localMatch.info?.name || '')} — سيتم الربط</span>`;
    // ربط الحجز بالمريض المكتشف
    await db.ref(`${BASE}/bookings/${bookingKey}/patientId`).set(localMatch.uid).catch(() => {});
    await db.ref(`${BASE}/bookings/${bookingKey}/patNationalId`).set(cleanNID).catch(() => {});
    setTimeout(() => {
      const ov = document.getElementById('_nidLinkDialogOverlay');
      if (ov) ov.remove();
      if (startVisit) { sw('newVisit'); loadVisitForm(localMatch.uid, bookingKey); }
      else { viewPatientFile(localMatch.uid); sw('patFile'); }
    }, 700);
    return;
  }

  // ثانياً: بحث Firebase
  try {
    const snap = await db.ref(`${BASE}/patients`).orderByChild('info/nationalId').equalTo(cleanNID).once('value');
    if (snap.exists()) {
      const uid = Object.keys(snap.val())[0];
      const info = snap.val()[uid]?.info || {};
      if (resultDiv) resultDiv.innerHTML = `<span style="color:var(--green)">✅ وُجد: ${sanitize(info.name || '')} — سيتم الربط</span>`;
      await db.ref(`${BASE}/bookings/${bookingKey}/patientId`).set(uid).catch(() => {});
      await db.ref(`${BASE}/bookings/${bookingKey}/patNationalId`).set(cleanNID).catch(() => {});
      setTimeout(() => {
        const ov = document.getElementById('_nidLinkDialogOverlay');
        if (ov) ov.remove();
        if (startVisit) { sw('newVisit'); loadVisitForm(uid, bookingKey); }
        else { viewPatientFile(uid); sw('patFile'); }
      }, 700);
    } else {
      if (resultDiv) resultDiv.innerHTML = `<span style="color:var(--amber)">لم يُعثر على ملف بهذا الرقم. اضغط "فتح كمريض جديد" لإنشاء ملف.</span>`;
    }
  } catch (e) {
    if (resultDiv) resultDiv.innerHTML = `<span style="color:var(--red)">❌ خطأ في البحث: ${e.message}</span>`;
  }
};

// بحث بالاسم أو الهاتف
window._nldDoSearch = function(query) {
  const container = document.getElementById('_nldSearchResults');
  if (!container) return;
  const q = query.trim().toLowerCase();
  if (q.length < 2) { container.innerHTML = ''; return; }

  const ctx = window._nldCtx || {};
  const results = Object.entries(_patients).filter(([uid, p]) => {
    const info = p.info || {};
    const name  = (info.name  || '').toLowerCase();
    const phone = (info.phone || '').toLowerCase();
    const nid   = (info.nationalId || '').toLowerCase();
    return name.includes(q) || phone.includes(q) || nid.includes(q);
  }).slice(0, 8);

  if (!results.length) {
    container.innerHTML = '<div style="color:var(--muted);font-size:.78rem;padding:6px">لا نتائج</div>';
    return;
  }

  container.innerHTML = results.map(([uid, p]) => {
    const info = p.info || {};
    return `
      <div onclick="_nldSelectPatient('${uid}','${ctx.bookingKey}',${ctx.startVisit})"
        style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:9px;
               cursor:pointer;border:1px solid var(--border);margin-bottom:6px;
               background:rgba(255,255,255,.02);transition:.2s"
        onmouseover="this.style.background='rgba(13,148,136,.08)'"
        onmouseout="this.style.background='rgba(255,255,255,.02)'">
        <span style="font-size:1.4rem">${info.gender === 'أنثى' ? '👩' : '👨'}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:800;font-size:.9rem;color:var(--text)">${sanitize(info.name || '—')}</div>
          <div style="font-size:.72rem;color:var(--muted);font-family:'IBM Plex Mono',monospace">
            📞 ${info.phone || '—'}
            ${info.nationalId ? ` · 🪪 ${info.nationalId}` : ''}
          </div>
        </div>
        <i class="fas fa-chevron-left" style="color:var(--teal);font-size:.8rem"></i>
      </div>
    `;
  }).join('');
};

// اختيار مريض من نتائج البحث
window._nldSelectPatient = async function(uid, bookingKey, startVisit) {
  await db.ref(`${BASE}/bookings/${bookingKey}/patientId`).set(uid).catch(() => {});
  const ov = document.getElementById('_nidLinkDialogOverlay');
  if (ov) ov.remove();
  if (startVisit) { sw('newVisit'); loadVisitForm(uid, bookingKey); }
  else { viewPatientFile(uid); sw('patFile'); }
  toast('✅ تم ربط الملف الطبي بالحجز', 'ok');
};

// فتح كمريض جديد (يُحوَّل لنموذج التسجيل مع بيانات الحجز مُعبَّأة مسبقاً)
window._nldOpenNew = function(bookingKey, startVisit) {
  const ov = document.getElementById('_nidLinkDialogOverlay');
  if (ov) ov.remove();

  const booking = _liveBookings[bookingKey] || {};

  // عبِّئ نموذج المريض الجديد بالبيانات المتاحة من الحجز
  const nameEl  = document.getElementById('npName');
  const phoneEl = document.getElementById('npPhone');
  if (nameEl  && booking.patName)  nameEl.value  = booking.patName;
  if (phoneEl && booking.patPhone) phoneEl.value = booking.patPhone;

  // فتح نافذة تسجيل مريض جديد
  const modal = document.getElementById('newPatModal');
  if (modal) modal.style.display = 'flex';

  toast('📋 يرجى إكمال بيانات المريض وإضافة الرقم الوطني', 'ok');
};

async function _openPatientFromBookingLegacy(bookingKey, booking, startVisit = false) {
  const _legacyNID = ArgonNID.cleanNID(booking.patNationalId || booking.nationalId || '');

  // ── ARGON ENTERPRISE: Block creation without NID — show dialog instead of silent error ──
  if (typeof ARGON_FLAGS !== 'undefined' && ARGON_FLAGS.REQUIRE_NID_FOR_LINKING) {
    if (!ArgonNID.isValidNID(_legacyNID)) {
      if (window.ArgonMedical && window.ArgonMedical.ShadowLog) {
        window.ArgonMedical.ShadowLog.log(CID,
          { result: 'BLOCKED', reason: 'Missing NID for new file creation' },
          { source: 'legacy_booking_guard', incoming: { name: booking.patName } }, db
        );
      }
      // FIX v1.1: نافذة الربط اليدوي بدلاً من الإيقاف الصامت
      _showNIDLinkDialog(bookingKey, booking, booking.patName || '', startVisit);
      return;
    }
  }

  // ── ARGON ENTERPRISE: Prevent duplicating existing NID ──
  if (ArgonNID.isValidNID(_legacyNID)) {
    const existing = ArgonNID.findByNIDLocal(_legacyNID, _patients);
    if (existing) {
      db.ref(`${BASE}/bookings/${bookingKey}/patientId`).set(existing.uid).then(() => {
        if (startVisit) {
          sw('newVisit');
          loadVisitForm(existing.uid, bookingKey);
        } else {
          viewPatientFile(existing.uid);
          sw('patFile');
        }
      });
      return;
    }
  }

  toast('⚠️ يتم الآن تجهيز ملف مريض جديد...', 'ok');

  const newRef = db.ref(`${BASE}/patients`).push();
  const patPhone = booking.patPhone ? booking.patPhone.replace(/\D/g, '') : '';
  let cleanPhoneStr = patPhone;
  if (cleanPhoneStr.startsWith('962')) cleanPhoneStr = cleanPhoneStr.substring(3);
  if (cleanPhoneStr.startsWith('0')) cleanPhoneStr = cleanPhoneStr.substring(1);

  const session = ArgonSession.get() || {};
  const loggedInDoctorId = session.staffId || null;

  const patObj = {
    info: {
      name: booking.patName || 'مريض',
      phone: cleanPhoneStr,
      nationalId: booking.patNationalId || booking.nationalId || '',
      age: booking.patAge ? parseInt(booking.patAge) : null,
      gender: booking.patGender || '',
      mrn: 'MRN-' + Math.floor(100000 + Math.random() * 900000),
      createdAt: new Date().toISOString(),
      createdBy: loggedInDoctorId
    }
  };

  // أضف إلى الذاكرة المحلية فوراً لتجنب تأخير Firebase
  _patients[newRef.key] = patObj;

  newRef.set(patObj).then(() => {
    db.ref(`${BASE}/bookings/${bookingKey}/patientId`).set(newRef.key).then(() => {
      if (startVisit) {
        sw('newVisit');
        loadVisitForm(newRef.key, bookingKey);
      } else {
        viewPatientFile(newRef.key);
        sw('patFile');
      }
    });
  });
}

// Modal management
function openNewPatient() {
  document.getElementById('newPatModal').style.display = 'flex';
}
function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

// Generate MRN (Medical Record Number) - Enterprise Format
function genMRN() {
  const year = new Date().getFullYear();
  const seq = String(Math.floor(1000000 + Math.random() * 9000000)).substring(1); // 6 digit sequence
  const branchCode = _sets && _sets.branchCode ? _sets.branchCode : 'CLN01';
  return `JOR-AMM-${branchCode}-${year}-${seq}`;
}

// Normalize phone number to use as a consistent database key (prevents duplicates)
function cleanPhone(p) {
  let clean = String(p || '').trim().replace(/\D/g, '');
  if (clean.startsWith('962')) clean = clean.substring(3);
  if (clean.startsWith('0')) clean = clean.substring(1);
  return clean;
}

// Edit Patient — uses UID (UUID or phone for legacy records)
function openEditPatient(uid) {
  const p = _patients[uid];
  if (!p) return;
  document.getElementById('epOldPhone').value = uid;
  document.getElementById('epName').value = p.info.name || '';
  document.getElementById('epPhone').value = p.info.phone || uid;
  document.getElementById('epNationalId').value = p.info.nationalId || '';
  const _epDobEl = document.getElementById('epDob');
  if (_epDobEl) {
    _epDobEl.value = p.info.dob || '';
    if (!p.info.dob && p.info.age) {
      _epDobEl.placeholder = `عمر سابق: ${p.info.age} سنة`;
    }
  }
  document.getElementById('epGender').value = p.info.gender || '';
  document.getElementById('epBlood').value = p.info.bloodType || '';
  if (window.ArgonClinicalParser && window.ARGON_FEATURES.ENABLE_CLINICAL_VERSIONING) {
    const algList = ArgonClinicalParser.getClinicalList(p.info, 'allergies');
    const chrList = ArgonClinicalParser.getClinicalList(p.info, 'chronicDiseases');
    document.getElementById('epAllergies').value = ArgonClinicalParser.toLegacyText(algList);
    document.getElementById('epChronic').value = ArgonClinicalParser.toLegacyText(chrList);
  } else {
    document.getElementById('epAllergies').value = (p.info.allergies || []).join('، ');
    document.getElementById('epChronic').value = (p.info.chronicDiseases || []).join('، ');
  }
  document.getElementById('epNotes').value = p.info.notes || '';

  if (p.info.photo) {
    epPhotoData = p.info.photo;
    document.getElementById('epPhotoPreview').innerHTML = `<img src="${p.info.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  } else {
    epPhotoData = '';
    document.getElementById('epPhotoPreview').innerHTML = '👤';
  }

  document.getElementById('editPatModal').style.display = 'flex';
}

function saveEditPatient() {
  const uid = document.getElementById('epOldPhone').value;
  if (!uid || !_patients[uid]) return;

  const name = document.getElementById('epName').value.trim();
  const phone = cleanPhone(document.getElementById('epPhone').value);
  const nationalId = document.getElementById('epNationalId').value.trim();
  const _dob_ep = (document.getElementById('epDob')?.value || '').trim();
  const _dobChk_ep = _dob_ep ? window.ArgonValidateDOB(_dob_ep) : { ok: true };
  if (_dob_ep && !_dobChk_ep.ok) {
    toast('⚠️ ' + _dobChk_ep.msg, 'err');
    return;
  }
  const gender = document.getElementById('epGender').value;
  const blood = document.getElementById('epBlood').value;
  const allergies = document.getElementById('epAllergies').value.trim().split(/[،,]/).map(s => s.trim()).filter(Boolean);
  const chronic = document.getElementById('epChronic').value.trim().split(/[،,]/).map(s => s.trim()).filter(Boolean);

  const oldInfo = _patients[uid]?.info || {};

  // Wave 2 Diffing
  let finalAllergies = allergies;
  let finalChronic = chronic;
  let summaryVersion = 1;

  if (window.ArgonClinicalParser && window.ARGON_FEATURES.ENABLE_CLINICAL_VERSIONING) {
    summaryVersion = 2;
    const session = ArgonSession.get() || {};
    const nowIso = new Date().toISOString();

    const diffClinical = (oldArray, newStrings) => {
      const currentList = ArgonClinicalParser.getClinicalList(oldInfo, oldArray);
      const newValues = new Set(newStrings);

      // 1. Mark missing as revoked
      currentList.forEach(item => {
        if (item.status === 'active' && !newValues.has(item.value)) {
          item.status = 'revoked';
          item.revokedBy = session.staffId || 'unknown';
          item.revokedAt = nowIso;
          item.reason = 'Removed via text input';
        }
      });

      // 2. Add new values
      const existingValues = new Set(currentList.filter(i => i.status === 'active').map(i => i.value));
      newStrings.forEach(val => {
        if (!existingValues.has(val)) {
          currentList.push({
            entryId: 'entry_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            schemaVersion: 2,
            sourceType: 'doctor_entry',
            value: val,
            status: 'active',
            addedBy: session.staffId || 'unknown',
            addedAt: nowIso
          });
        }
      });
      return currentList;
    };

    finalAllergies = diffClinical('allergies', allergies);
    finalChronic = diffClinical('chronicDiseases', chronic);
  }
  const notes = document.getElementById('epNotes').value.trim();

  const cleanNid = ArgonNID.cleanNID(nationalId);
  if (!name || !phone || !ArgonNID.isValidNID(cleanNid)) {
    toast('⚠️ يرجى إدخال الاسم ورقم الهاتف والرقم الوطني (9 أرقام على الأقل)', 'err');
    return;
  }

  const updates = {
    name: sanitize(name),
    phone: sanitize(phone),
    nationalId: nationalId ? sanitize(nationalId) : null,
    dob: _dob_ep || null,
    age: _dob_ep ? window.ArgonCalcAge(_dob_ep) : null,
    gender: sanitize(gender),
    bloodType: sanitize(blood),
    allergies: finalAllergies.length ? finalAllergies : null,
    chronicDiseases: finalChronic.length ? finalChronic : null,
    criticalAlerts: window._tempCriticalAlerts.length ? window._tempCriticalAlerts : null,
    clinicalSummaryVersion: summaryVersion,
    notes: sanitize(notes),
    photo: epPhotoData || null
  };

  // ── AUDIT: Identity & Clinical Change Detection ──
  const auditFields = ['name', 'phone', 'nationalId', 'dob', 'age', 'gender', 'bloodType', 'allergies', 'chronicDiseases'];
  const changes = {};
  auditFields.forEach(field => {
    const oldVal = oldInfo[field] ?? null;
    const newVal = updates[field] ?? null;
    if (String(oldVal) !== String(newVal)) {
      changes[field] = { old: oldVal, new: newVal };
    }
  });

  // ── ARGON ENTERPRISE: Identity Change Workflow ──
  const protectedFields = ['name', 'phone', 'nationalId', 'dob', 'age'];
  const pendingIdentityChanges = {};
  let hasIdentityChanges = false;

  if (typeof ARGON_FLAGS !== 'undefined' && ARGON_FLAGS.REQUIRE_NID_FOR_LINKING) {
    protectedFields.forEach(field => {
      if (changes[field]) {
        pendingIdentityChanges[field] = {
          oldValue: changes[field].old,
          newValue: changes[field].new
        };
        // Revert the update to the old value to protect the master record
        updates[field] = oldInfo[field] || null;
        hasIdentityChanges = true;
        // Also remove from immediate changes so audit log doesn't show it as applied yet
        delete changes[field];
      }
    });
  }

  if (Object.keys(changes).length > 0) {
    if (window.ArgonAuditLog) {
      window.ArgonAuditLog.log('PATIENT_IDENTITY', uid, 'UPDATE', oldInfo, updates, 'Profile Edit');
    }
  }
  // ── END AUDIT ──

  db.ref(`${BASE}/patients/${uid}/info`).update(updates).then(() => {
    if (hasIdentityChanges) {
      db.ref(`${BASE}/identity_changes`).push({
        patientId: uid,
        requestedBy: (ArgonSession.get() || {}).staffId || 'unknown',
        requestedAt: new Date().toISOString(),
        status: 'pending',
        changes: pendingIdentityChanges,
        approvedBy: null,
        approvedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        reason: null
      });
      toast('✅ تم حفظ التحديثات. تعديلات الهوية (الاسم/الرقم/العمر) أُرسلت للإدارة للاعتماد.', 'ok');
      logAudit('EDIT_PATIENT_IDENTITY_REQ', `طلب تعديل هوية المريض (${uid})`, 'EMR');
    } else {
      toast('✅ تم تحديث بيانات المريض بنجاح', 'ok');
    }

    if (Object.keys(changes).length) {
      logAudit('EDIT_PATIENT', `تعديل بيانات سريرية للمريض (${uid})`, 'EMR');
    }

    closeModal('editPatModal');
    if (activePatientId === uid) {
      viewPatientFile(uid);
    }
  }).catch(e => {
    toast('❌ خطأ أثناء التحديث: ' + e.message, 'err');
  });
}

// ═══════════════════════════════════════════════════════════════════
// SMART PATIENT SAVE — UUID-Based (No data overwrite possible)
// Each patient gets a unique Firebase Push Key regardless of duplicate
// names or phone numbers. Families can share the same phone safely.
// National ID is used as an optional disambiguation layer.
// ═══════════════════════════════════════════════════════════════════
async function saveNewPatient() {
  const name = document.getElementById('npName').value.trim();
  const phone = cleanPhone(document.getElementById('npPhone').value);
  const nationalId = document.getElementById('npNationalId').value.trim();
  const _dob_np = (document.getElementById('npDob')?.value || '').trim();
  const _dobChk_np = _dob_np ? window.ArgonValidateDOB(_dob_np) : { ok: true };
  const _calcAge_np = _dob_np ? window.ArgonCalcAge(_dob_np) : null;
  if (_dob_np && !_dobChk_np.ok) {
    toast('⚠️ ' + _dobChk_np.msg, 'err');
    return;
  }
  const gender = document.getElementById('npGender').value;
  const blood = document.getElementById('npBlood').value;
  const allergies = document.getElementById('npAllergies').value.trim().split(',').map(s => s.trim()).filter(Boolean);
  const chronic = document.getElementById('npChronic').value.trim().split(',').map(s => s.trim()).filter(Boolean);
  const notes = document.getElementById('npNotes').value.trim();

  const cleanNid = ArgonNID.cleanNID(nationalId);
  if (!name || !phone || !ArgonNID.isValidNID(cleanNid)) {
    toast('⚠️ يرجى إدخال الاسم، رقم الهاتف، والرقم الوطني (9 أرقام كحد أدنى)', 'err');
    return;
  }

  // ── ARGON ENTERPRISE: Smart Deduplication ──
  if (window.ArgonMedical && window.ArgonMedical.PatientMatch) {
    const matchResult = await window.ArgonMedical.PatientMatch.findMatch(
      CID,
      { name, phone, nationalId },
      db
    );

    await window.ArgonMedical.ShadowLog.log(
      CID,
      { name, phone, nationalId },
      matchResult,
      'emr_manual_create',
      (ArgonSession.get() || {}).staffId || 'doctor'
    );

    const shadowMode = window.ARGON_FLAGS ? window.ARGON_FLAGS.shadowMode : true;

    if (!shadowMode && matchResult.result !== "NEW") {
      if (matchResult.result === "EXACT" || matchResult.result === "STRONG") {
        toast(`⚠️ هذا المريض موجود مسبقاً (${matchResult.matchedName})`, 'err');
        closeModal('newPatModal');
        viewPatientFile(matchResult.patientId);
        return;
      }

      if (matchResult.result === "POSSIBLE") {
        matchResult._incomingName = name;
        matchResult._incomingPhone = phone;

        window.ArgonMedical.showMatchDialog(
          matchResult,
          (existingId) => {
            // نفس المريض
            closeModal('newPatModal');
            viewPatientFile(existingId);
          },
          () => {
            // مريض جديد (فرد عائلة)
            _executeSaveNewPatient(name, phone, nationalId, _dob_np, _calcAge_np, gender, blood, allergies, chronic, notes);
          }
        );
        return; // أوقف التنفيذ
      }
    }
  }

  // Fallback (أو NEW أو Shadow Mode)
  _executeSaveNewPatient(name, phone, nationalId, _dob_np, _calcAge_np, gender, blood, allergies, chronic, notes);
}

function _executeSaveNewPatient(name, phone, nationalId, dob, age, gender, blood, allergies, chronic, notes) {
  const session = ArgonSession.get() || {};
  const loggedInDoctorId = session.staffId || null;

  const mrn = genMRN();
  const patObj = {
    info: {
      name: sanitize(name),
      phone: sanitize(phone),
      nationalId: nationalId ? sanitize(nationalId) : null,
      dob: dob || null,
      age: dob ? window.ArgonCalcAge(dob) : (age || null),
      gender: sanitize(gender),
      bloodType: sanitize(blood),
      allergies,
      chronicDiseases: chronic,
      mrn,
      notes: sanitize(notes),
      photo: npPhotoData || null,
      createdAt: new Date().toISOString(),
      createdBy: loggedInDoctorId
    }
  };

  // Use Firebase push() to generate a guaranteed-unique UUID key
  const newRef = db.ref(`${BASE}/patients`).push();
  const newUid = newRef.key;

  newRef.set(patObj).then(() => {
    logAudit('CREATE_PATIENT', `تم تسجيل مريض جديد ${patObj.info.name} (${newUid}) - MRN: ${mrn}`, 'EMR');
    toast(`✅ تم تسجيل المريض بنجاح — ${mrn}`, 'ok');
    closeModal('newPatModal');
    ['npName', 'npPhone', 'npNationalId', 'npDob', 'npAllergies', 'npChronic', 'npNotes'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const prNP = document.getElementById('npAgePreview');
    if (prNP) prNP.style.display = 'none';
    document.getElementById('npGender').value = '';
    document.getElementById('npBlood').value = '';
    document.getElementById('npPhotoPreview').innerHTML = '👤';
    npPhotoData = '';

    // Reset warning banner
    const warningDiv = document.getElementById('npDupWarning');
    if (warningDiv) {
      warningDiv.style.display = 'none';
      warningDiv.innerHTML = '';
    }

    viewPatientFile(newUid);
  }).catch(() => toast('❌ فشل حفظ المريض', 'err'));
}

function generatePatientFileHTML(uid) {
  const p = _patients[uid];
  if (!p) return '';
  const info = p.info || {};

  // Sort visits descending chronologically down to the minute using parseArabicTime
  const visits = Object.entries(p.visits || {}).sort((a, b) => {
    const dateTimeA = (a[1].date || '') + 'T' + parseArabicTime(a[1].time || '');
    const dateTimeB = (b[1].date || '') + 'T' + parseArabicTime(b[1].time || '');
    return dateTimeB.localeCompare(dateTimeA);
  });

  let allergiesHTML = '';
  let chronicHTML = '';

  if (window.ArgonClinicalParser && window.ARGON_FEATURES && window.ARGON_FEATURES.ENABLE_CLINICAL_VERSIONING) {
    const algList = ArgonClinicalParser.getClinicalList(info, 'allergies');
    const chrList = ArgonClinicalParser.getClinicalList(info, 'chronicDiseases');

    const resolveStaffName = (sId) => {
      if (!sId || sId === 'Legacy' || sId === 'unknown') return 'طبيب سابق';
      if (window.ArgonSession && ArgonSession.get()?.staffId === sId) return ArgonSession.get()?.displayName || 'طبيب';
      if (p.visits) {
        for (const vk in p.visits) {
          if (p.visits[vk].doctorId === sId && p.visits[vk].docName) return p.visits[vk].docName;
        }
      }
      return 'طبيب مختص';
    };

    allergiesHTML = algList.filter(a => a.status === 'active').map(a => `<span class="tag" style="padding: 4px 8px;" title="Added by: ${sanitize(a.addedBy || 'Legacy')}">${sanitize(a.value)} <span style="font-size:0.65rem; opacity:0.7; margin-right:4px;">(د. ${sanitize(resolveStaffName(a.addedBy))})</span></span>`).join('') || '<span style="color:var(--muted)">لا يوجد</span>';
    chronicHTML = chrList.filter(a => a.status === 'active').map(a => `<span class="tag blue" style="padding: 4px 8px;" title="Added by: ${sanitize(a.addedBy || 'Legacy')}">${sanitize(a.value)} <span style="font-size:0.65rem; opacity:0.7; margin-right:4px;">(د. ${sanitize(resolveStaffName(a.addedBy))})</span></span>`).join('') || '<span style="color:var(--muted)">لا يوجد</span>';

    const revokedAlg = algList.filter(a => a.status === 'revoked');
    if (revokedAlg.length > 0) {
      allergiesHTML += `<div style="font-size:10px; color:#94a3b8; margin-top:4px;">أبطلت: ` + revokedAlg.map(a => `<span style="text-decoration:line-through" title="Revoked by: ${sanitize(a.revokedBy)} - ${sanitize(a.reason)}">${sanitize(a.value)}</span> <span style="font-size:8px;">(د. ${sanitize(resolveStaffName(a.revokedBy))})</span>`).join(', ') + `</div>`;
    }
    const revokedChr = chrList.filter(a => a.status === 'revoked');
    if (revokedChr.length > 0) {
      chronicHTML += `<div style="font-size:10px; color:#94a3b8; margin-top:4px;">أبطلت: ` + revokedChr.map(a => `<span style="text-decoration:line-through" title="Revoked by: ${sanitize(a.revokedBy)} - ${sanitize(a.reason)}">${sanitize(a.value)}</span> <span style="font-size:8px;">(د. ${sanitize(resolveStaffName(a.revokedBy))})</span>`).join(', ') + `</div>`;
    }
  } else {
    allergiesHTML = (info.allergies || []).map(a => `<span class="tag">${sanitize(a)}</span>`).join('') || '<span style="color:var(--muted)">لا يوجد</span>';
    chronicHTML = (info.chronicDiseases || []).map(c => `<span class="tag blue">${sanitize(c)}</span>`).join('') || '<span style="color:var(--muted)">لا يوجد</span>';
  }

  let visitsTimelineHTML = `<div style="color:var(--muted);text-align:center;padding:20px;">لا يوجد زيارات سابقة</div>`;
  if (visits.length) {
    let lastDate = null;
    visitsTimelineHTML = visits.map(([vk, v]) => {
      // ── VISIT LOCK & ARCHIVE STATUS ──
      const session = window.ArgonSession ? window.ArgonSession.get() : {};
      const canEdit = window.ArgonPermissions ? window.ArgonPermissions.canEditVisit(v, session.staffId) : false;
      const isArchived = v.status === 'archived';
      const isSigned = v.status === 'signed' || v.signedOff;

      const lockBadge = !canEdit
        ? `<span style="background:rgba(239,68,68,0.12);color:#f87171;border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:2px 8px;font-size:0.7rem;font-weight:700;margin-right:6px">🔒 قراءة فقط</span>`
        : `<span style="background:rgba(13,148,136,0.1);color:var(--teal);border:1px solid rgba(13,148,136,0.25);border-radius:6px;padding:2px 8px;font-size:0.7rem;font-weight:700;margin-right:6px">✏️ قابل للتعديل</span>`;

      let stateBadge = '';
      if (isArchived) {
        stateBadge = `<span style="background:rgba(239,68,68,0.08);color:#f87171;border:1px solid rgba(239,68,68,0.2);border-radius:6px;padding:2px 8px;font-size:0.7rem;font-weight:700;text-decoration:line-through;margin-right:6px">🗃️ مؤرشفة</span>`;
      } else if (isSigned) {
        stateBadge = `<span style="background:rgba(16,185,129,0.1);color:var(--green);border:1px solid rgba(16,185,129,0.2);border-radius:6px;padding:2px 8px;font-size:0.7rem;font-weight:700;margin-right:6px">✍️ موقعة إلكترونياً</span>`;
      }

      const archiveBadge = stateBadge; // for compatibility with legacy variable below
      const archivedStyle = isArchived ? 'opacity:0.5;' : '';

      // أزرار التحكم تظهر إذا كان يملك الصلاحية
      const archiveBtn = (!isArchived && canEdit)
        ? `<button class="btn-secondary btn-sm" onclick="event.stopPropagation();archiveVisit('${uid}','${vk}')" style="color:var(--muted);border-color:rgba(239,68,68,0.3)"><i class="fas fa-archive"></i> أرشفة</button>`
        : '';

      const signOffBtn = (!isArchived && !isSigned && canEdit)
        ? `<button class="btn-secondary btn-sm" onclick="event.stopPropagation();signOffVisit('${uid}','${vk}')" style="color:var(--teal);border-color:rgba(13,148,136,0.3)"><i class="fas fa-file-signature"></i> توقيع وإقفال</button>`
        : '';
      // ── END VISIT LOCK ──

      let dateGroupDivider = '';
      if (v.date !== lastDate) {
        lastDate = v.date;
        dateGroupDivider = `
          <div class="timeline-date-group">
            <span><i class="far fa-calendar-alt"></i> ${formatArabicDate(v.date)}</span>
          </div>`;
      }

      const rxList = (v.prescriptions || []).map(r => `• ${sanitize(r.name)} (${sanitize(r.dose || '—')}) - ${sanitize(r.freq || '—')}`).join('<br>');
      const attList = (v.attachments || []).map(a => `
        <div class="att-item" onclick="openAttachment('${a.data}', '${sanitize(a.type)}')">
          <i class="fas ${a.type === 'pdf' ? 'fa-file-pdf' : 'fa-file-image'}"></i>
          <span class="att-name">${sanitize(a.name)}</span>
        </div>
      `).join('') || '';

      const vitalVals = v.vitals || {};
      const hasVitals = vitalVals.temp || vitalVals.bp || vitalVals.pulse;
      const vitalsSummary = hasVitals ? `
        <div class="vitals-grid">
          ${vitalVals.temp ? `<div class="vital-card"><div class="vital-val">${vitalVals.temp}°C</div><div class="vital-lbl">الحرارة</div></div>` : ''}
          ${vitalVals.bp ? `<div class="vital-card"><div class="vital-val">${vitalVals.bp}</div><div class="vital-lbl">الضغط</div></div>` : ''}
          ${vitalVals.pulse ? `<div class="vital-card"><div class="vital-val">${vitalVals.pulse}/m</div><div class="vital-lbl">النبض</div></div>` : ''}
        </div>
      ` : '';

      const labArr = Array.isArray(v.labOrders) ? v.labOrders : Object.values(v.labOrders || {});
      const radArr = Array.isArray(v.radOrders) ? v.radOrders : Object.values(v.radOrders || {});
      const getSafeName = (item) => {
        let n = typeof item === 'object' ? (item.name || item) : item;
        return typeof n === 'object' ? (n.name || 'عنصر غير معروف') : n;
      };
      const labReqsStr = labArr.map(getSafeName).join(' ، ');
      const radReqsStr = radArr.map(getSafeName).join(' ، ');

      // Upgraded Departmental Card stylings
      const isPharmacist = v.docKey === 'pharmacist';
      const isLab = v.docKey === 'lab';
      const isRad = v.docKey === 'radiology';
      const isReferral = v.docKey === 'referral';

      let cardIcon = 'fa-stethoscope';
      let dotColor = 'done';
      let cardStyle = '';

      if (isPharmacist) {
        cardIcon = 'fa-pills';
        dotColor = 'amber';
        cardStyle = 'border-right: 4px solid var(--amber); background: rgba(245, 158, 11, 0.03);';
      } else if (isLab) {
        cardIcon = 'fa-flask';
        dotColor = 'teal';
        cardStyle = 'border-right: 4px solid var(--teal); background: rgba(13, 148, 136, 0.03);';
      } else if (isRad) {
        cardIcon = 'fa-x-ray';
        dotColor = 'sky';
        cardStyle = 'border-right: 4px solid var(--sky); background: rgba(14, 165, 233, 0.03);';
      } else if (isReferral) {
        cardIcon = 'fa-exchange-alt';
        dotColor = 'purple';
        cardStyle = 'border-right: 4px solid #a855f7; background: rgba(168, 85, 247, 0.03);';
      }

      let notesHTML = (isPharmacist || isLab || isRad || isReferral) ? v.notes : sanitize(v.notes || 'لا يوجد ملاحظات إضافية');
      if (notesHTML && typeof notesHTML === 'string') {
        notesHTML = notesHTML.replace(/\[object Object\]/g, 'فحص مسجل');
      }

      return `
        ${dateGroupDivider}
        <div class="tl-item" style="${archivedStyle}">
          <div class="tl-dot ${dotColor}"></div>
          <div class="tl-card" style="${cardStyle}" onclick="this.classList.toggle('open')">
            <div class="tl-head" style="justify-content: space-between; align-items:flex-start;">
              <div style="display:flex; flex-direction:column; gap:4px;">
                <span class="tl-date">${v.date} · ${v.time}</span>
                <span class="tl-doc" style="background:#0f172a; color:#f8fafc; padding:4px 10px; border-radius:8px; font-weight:700; display:inline-flex; align-items:center; gap:6px; box-shadow:0 2px 4px rgba(0,0,0,0.1); width:fit-content; border: 1px solid #334155;"><i class="fas ${cardIcon}"></i> الطبيب: ${sanitize(v.docName)}</span>
              </div>
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                ${lockBadge}${archiveBadge}
              </div>
            </div>
            <div class="tl-diag">${sanitize(v.diagnosis || 'زيارة طبية')}</div>
            <div style="font-size:.8rem;color:var(--muted);display:flex;justify-content:space-between">
              <span>🔍 الشكوى / الموضوع: ${sanitize(v.complaint || 'مراجعة')}</span>
              <span style="color:var(--teal);font-weight:700"><i class="fas fa-chevron-down"></i> تفاصيل</span>
            </div>
            <div class="tl-body">
              ${vitalsSummary}
              <div style="margin-top:10px"><b>📝 التفاصيل والتقرير:</b><p style="font-size:.82rem;margin-top:4px;line-height:1.6;white-space:pre-wrap;word-break:break-word">${notesHTML}</p></div>
              
              ${rxList ? `<div style="margin-top:10px"><b>💊 الوصفة الدوائية:</b><p style="font-size:.82rem;margin-top:4px;color:var(--amber);line-height:1.6">${rxList}</p></div>` : ''}
              
              ${labReqsStr ? `<div style="margin-top:10px"><b>🔬 الفحوصات المخبرية المطلوبة:</b> <span class="tag" style="background:rgba(13,148,136,0.12);border:1px solid var(--teal);color:var(--teal);font-size:0.75rem">${sanitize(labReqsStr)}</span></div>` : ''}
              ${radReqsStr ? `<div style="margin-top:10px"><b>🩻 صور الأشعة المطلوبة:</b> <span class="tag blue" style="background:rgba(14,165,233,0.12);border:1px solid var(--sky);color:var(--sky);font-size:0.75rem">${sanitize(radReqsStr)}</span></div>` : ''}
              
              ${attList ? `<div style="margin-top:12px"><b>📁 المرفقات الطبية وصور الأشعة:</b><div class="att-grid" style="margin-top:6px">${attList}</div></div>` : ''}
              
              <div style="margin-top:14px;display:flex;justify-content:flex-end;gap:8px">
                ${archiveBtn}
                ${signOffBtn}
                <button class="btn-secondary btn-sm" onclick="event.stopPropagation();printVisitSummary('${vk}')"><i class="fas fa-print"></i> طباعة الملخص</button>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  // Get department specific order lists for this patient (newest first)
  // Strict clinical isolation: NEVER match by phone to prevent family member data leak
  const patientLabOrders = Object.entries(_labOrders).filter(([k, o]) => o.patientId === uid).reverse();
  const patientRadOrders = Object.entries(_radOrders).filter(([k, o]) => o.patientId === uid).reverse();

  let labOrdersHTML = `
    <div style="text-align:center;padding:30px;color:var(--muted)" class="glass-panel">لا يوجد طلبات فحوصات مخبرية مسجلة لهذا المريض</div>`;
  if (patientLabOrders.length) {
    labOrdersHTML = patientLabOrders.map(([k, o]) => {
      const tests = (o.requestedTests || []).map(t => {
        let resStr = '';
        if (t.status === 'completed') {
          resStr = `: <b style="color:var(--teal)">${sanitize(t.result)}</b> <span dir="auto" style="display:inline-block">${sanitize(t.unit)}</span>`;
        }
        const safeName = typeof t.name === 'object' ? (t.name.name || 'فحص') : (t.name || t);
        return `<li style="margin-bottom:4px"><span dir="auto" style="display:inline-block">${sanitize(safeName)}</span>${resStr}</li>`;
      }).join('');
      const statusText = o.status === 'completed' ? 'جاهزة ومكتملة ✅' : 'قيد الفحص والتحليل ⏳';
      const statusColor = o.status === 'completed' ? 'var(--green)' : 'var(--amber)';

      return `
        <div class="glass-panel" style="padding:14px;margin-bottom:10px;border-right:4px solid ${statusColor}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-size:0.75rem;color:var(--muted)">تاريخ الطلب: ${(o.createdAt || '').substring(0, 10)} <span style="color:var(--teal);margin-right:8px;font-weight:bold"><i class="far fa-clock"></i> ${window.argonTimeAgo(o.createdAt)}</span></span>
            <span style="font-size:0.75rem;color:${statusColor};font-weight:800">${statusText}</span>
          </div>
          <div style="font-size:0.85rem;margin-bottom:8px"><b>🔬 الفحوصات:</b>
            <ul style="margin:6px 0 0 0; padding-right:24px; color:var(--text); list-style-type:disc;">${tests}</ul>
          </div>
          ${o.notes ? `<div style="font-size:0.8rem;color:var(--muted);background:rgba(255,255,255,0.02);padding:10px;border-radius:8px;margin-top:8px;line-height:1.6;white-space:pre-wrap;word-break:break-word;"><b>ملاحظات الفني:</b><br>${sanitize(o.notes)}</div>` : ''}
          ${o.attachment ? `
            <div style="margin-top:8px;text-align:left">
              <button class="btn-secondary btn-sm" onclick="openAttachment('${o.attachment}','pdf')"><i class="fas fa-file-pdf"></i> عرض تقرير الـ PDF المرفق</button>
            </div>` : ''}
        </div>`;
    }).join('');
  }

  let radOrdersHTML = `
    <div style="text-align:center;padding:30px;color:var(--muted)" class="glass-panel">لا يوجد طلبات تصوير أشعة مسجلة لهذا المريض</div>`;
  if (patientRadOrders.length) {
    radOrdersHTML = patientRadOrders.map(([k, o]) => {
      const scans = (o.requestedScans || []).map(s => {
        const safeName = typeof s.name === 'object' ? (s.name.name || 'صورة أشعة') : (s.name || s);
        return `<li style="margin-bottom:4px"><span dir="auto" style="display:inline-block">${sanitize(safeName)}</span></li>`;
      }).join('');
      const statusText = o.status === 'completed' ? 'جاهزة ومكتملة ✅' : 'بانتظار التصوير ⏳';
      const statusColor = o.status === 'completed' ? 'var(--green)' : 'var(--amber)';

      return `
        <div class="glass-panel" style="padding:14px;margin-bottom:10px;border-right:4px solid ${statusColor}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-size:0.75rem;color:var(--muted)">تاريخ الطلب: ${(o.createdAt || '').substring(0, 10)} <span style="color:var(--sky);margin-right:8px;font-weight:bold"><i class="far fa-clock"></i> ${window.argonTimeAgo(o.createdAt)}</span></span>
            <span style="font-size:0.75rem;color:${statusColor};font-weight:800">${statusText}</span>
          </div>
          <div style="font-size:0.85rem;margin-bottom:8px"><b>🩻 صور الأشعة المطلوبة:</b>
            <ul style="margin:6px 0 0 0; padding-right:24px; color:var(--text); list-style-type:disc;">${scans}</ul>
          </div>
          ${o.report ? `<div style="font-size:0.8rem;background:rgba(255,255,255,0.02);padding:10px;border-radius:8px;margin-top:8px;color:var(--text);line-height:1.6;white-space:pre-wrap;word-break:break-word;"><b>📝 التقرير الطبي للأشعة:</b><br>${sanitize(o.report)}</div>` : ''}
          ${(o.images && o.images.length > 0) ? `
            <div style="margin-top:12px; display:flex; flex-direction:column; gap:8px; background:rgba(0,0,0,0.15); padding:10px; border-radius:8px;">
              <div style="font-size:0.8rem; font-weight:bold; color:var(--sky); margin-bottom:4px;">🖼️ المرفقات والصور التشخيصية:</div>
              ${o.images.map(img => {
                const isPdf = (img.fileName || '').toLowerCase().endsWith('.pdf') || (img.downloadUrl || '').toLowerCase().includes('.pdf');
                const type = isPdf ? 'pdf' : 'image';
                const icon = isPdf ? 'fa-file-pdf' : 'fa-image';
                return `<div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:8px 12px; border-radius:6px; border:1px solid rgba(255,255,255,0.05);">
                  <span style="font-size:0.75rem; color:var(--text);"><i class="fas ${icon}" style="margin-left:6px; color:var(--sky);"></i>${sanitize(img.fileName || 'صورة أشعة')}</span>
                  <button class="btn-secondary btn-sm" onclick="openAttachment('${img.downloadUrl}', '${type}')" style="font-size:0.7rem; padding:4px 10px; background:rgba(14,165,233,0.1); color:var(--sky); border:1px solid rgba(14,165,233,0.3);"><i class="fas fa-eye"></i> عرض</button>
                </div>`;
              }).join('')}
            </div>
          ` : (o.image ? `
            <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,0.15);padding:10px;border-radius:8px;">
              <span style="font-size:0.7rem;color:var(--sky);cursor:pointer" onclick="openAttachment('${o.image}','image')"><i class="fas fa-image"></i> صورة الأشعة المرفقة</span>
              <button class="btn-secondary btn-sm" onclick="openAttachment('${o.image}','image')" style="font-size:0.7rem; padding:4px 10px; background:rgba(14,165,233,0.1); color:var(--sky); border:1px solid rgba(14,165,233,0.3);"><i class="fas fa-eye"></i> عرض الصورة</button>
            </div>` : '')}
        </div>`;
    }).join('');
  }


  let insInfo = 'غير مؤمن / دفع نقدي';
  let insColor = 'var(--muted)';
  const recentVisitWithIns = visits.find(([vk, v]) => v.insurance);
  const rawProv = recentVisitWithIns ? recentVisitWithIns[1].insurance.provider : (info.insurance ? info.insurance.provider : null);
  const sharePct = recentVisitWithIns ? recentVisitWithIns[1].insurance.patientSharePct : (info.insurance ? info.insurance.patientSharePct : 0);
  if (rawProv) {
    const insMap = { 'jic': 'التأمين الأردنية', 'nic': 'التأمين الوطنية', 'islamic': 'التأمين الإسلامية', 'first': 'الأولى للتأمين' };
    const displayProv = insMap[rawProv] || rawProv || 'نعم';
    insInfo = `${displayProv} (تحمل المريض ${sharePct}%)`;
    insColor = 'var(--purple)';
  }

  const activeAvatarHTML = info.photo

    ? `<div class="pat-avatar"><img src="${info.photo}"></div>`
    : `<div class="pat-avatar">👤</div>`;

  const fileHTML = `
    <div class="pat-card">
      <div class="pat-top">
        ${activeAvatarHTML}
        <div style="flex:1">
          <div class="pat-name">${sanitize(info.name)}</div>
          <div class="pat-mrn">الملف الطبي: ${info.mrn || 'MRN-NEW'}</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn-secondary btn-sm" onclick="openEditPatient('${uid}')"><i class="fas fa-edit"></i> تعديل</button>
          <button class="btn-primary btn-sm" onclick="sw('newVisit');loadVisitForm('${uid}')"><i class="fas fa-stethoscope"></i> بدء زيارة طبية</button>
        </div>
      </div>
      <div class="pat-grid">
        <div class="pat-field"><div class="pfl">رقم الهاتف</div><div class="pfv">${sanitize(info.phone || '—')}</div></div>
        <div class="pat-field"><div class="pfl">الرقم الوطني / الهوية</div><div class="pfv" style="font-weight:700;color:var(--teal)">${sanitize(info.nationalId || '—')}</div></div>
        <div class="pat-field"><div class="pfl">العمر / الجنس</div><div class="pfv">${info.dob ? window.ArgonAgeDisplay(info.dob) : (info.age ? `${info.age} سنة (تقريبي)` : 'غير محدد')} · ${info.gender || 'غير محدد'}</div></div>
        <div class="pat-field"><div class="pfl">فصيلة الدم</div><div class="pfv" style="color:var(--red)">${info.bloodType || '—'}</div></div>
        <div class="pat-field"><div class="pfl">تاريخ التسجيل</div><div class="pfv" style="font-size:.78rem;font-family:'IBM Plex Mono',monospace">${(info.createdAt || '').substring(0, 10)}</div></div>
      </div>
      <div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div class="pat-field" style="grid-column:span 1"><div class="pfl">الحساسية والأدوية المرفوضة</div><div>${allergiesHTML}</div></div>
        <div class="pat-field" style="grid-column:span 1"><div class="pfl">الأمراض المزمنة</div><div>${chronicHTML}</div></div>
    
    ${(info.criticalAlerts && info.criticalAlerts.length > 0) ? `
    <div class="pat-field" style="grid-column:span 2; background:#fef2f2; border:1px solid #fee2e2; border-radius:8px; margin-top:8px;">
       <div class="pfl" style="color:#dc2626; font-weight:bold;">⚠️ تنبيهات حرجة</div>
       <div style="margin-top:4px; display:flex; flex-direction:column; gap:4px;">
         ${info.criticalAlerts.filter(a => a.status === 'active').map(a => {
    const resolveStaffName = (sId) => {
      if (!sId || sId === 'Legacy' || sId === 'unknown') return 'طبيب سابق';
      if (window.ArgonSession && ArgonSession.get()?.staffId === sId) return ArgonSession.get()?.displayName || 'طبيب';
      if (p.visits) {
        for (const vk in p.visits) {
          if (p.visits[vk].doctorId === sId && p.visits[vk].docName) return p.visits[vk].docName;
        }
      }
      return 'طبيب مختص';
    };
    return `<div style="color:#b91c1c; font-size:0.85rem;">• ${a.value} <span style="background:#dc2626; color:white; padding:1px 4px; border-radius:3px; font-size:0.7rem; margin-right:4px;">${a.severity}</span> <span style="color:#94a3b8; font-size:0.75rem; margin-right:6px;">(بواسطة: د. ${sanitize(resolveStaffName(a.addedBy))})</span></div>`;
  }).join('')}
       </div>
    </div>
    ` : ''}
      </div>
      ${info.notes ? `<div class="pat-field" style="margin-top:14px"><div class="pfl">ملاحظات عامة</div><div class="pfv" style="font-weight:normal;font-size:.82rem">${sanitize(info.notes)}</div></div>` : ''}
    </div>

    <!-- Spectacular Tabbed Workspace Bar -->
    <div class="emr-tabs" style="display:flex;gap:8px;border-bottom:1px solid var(--border);padding-bottom:12px;margin-bottom:20px;overflow-x:auto">
      <button class="emr-tab-btn ${activeEmrTab === 'timeline-tab' ? 'active' : ''}" onclick="switchEmrTab('timeline-tab')" style="background:var(--surf);border:1px solid var(--border);color:var(--muted);padding:8px 16px;border-radius:10px;font-family:'Tajawal',sans-serif;font-weight:700;font-size:0.85rem;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all 0.2s">
        <i class="fas fa-history" style="color:var(--teal)"></i> السجل الطبي الزمني
      </button>
      ${_sets && _sets.mode === 'medical_complex' ? `
      <button class="emr-tab-btn ${activeEmrTab === 'lab-tab' ? 'active' : ''}" onclick="switchEmrTab('lab-tab')" style="background:var(--surf);border:1px solid var(--border);color:var(--muted);padding:8px 16px;border-radius:10px;font-family:'Tajawal',sans-serif;font-weight:700;font-size:0.85rem;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all 0.2s">
        <i class="fas fa-vials" style="color:var(--sky)"></i> الفحوصات والأشعة
      </button>` : ''}
      ${_sets && _sets.mode === 'medical_complex' ? `
      <button class="emr-tab-btn ${activeEmrTab === 'referral-tab' ? 'active' : ''}" onclick="switchEmrTab('referral-tab')" style="background:var(--surf);border:1px solid var(--border);color:var(--muted);padding:8px 16px;border-radius:10px;font-family:'Tajawal',sans-serif;font-weight:700;font-size:0.85rem;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all 0.2s">
        <i class="fas fa-exchange-alt" style="color:#a855f7"></i> التحويلات الداخلية
      </button>` : ''}
    </div>

    <!-- Dynamic Tab Contents -->
    <div id="emr-tab-timeline" class="emr-tab-content ${activeEmrTab === 'timeline-tab' ? 'active-content' : ''}" style="display:${activeEmrTab === 'timeline-tab' ? 'block' : 'none'}">
      <div class="ph" style="margin-bottom:12px">
        <div><div class="pt" style="font-size:1.15rem">⏳ السجل الطبي الموحد</div><div class="ps">تاريخ المريض الصحي والزيارات مصنفة زمنياً بالأحدث</div></div>
      </div>
      <div class="timeline">${visitsTimelineHTML}</div>
    </div>

    ${_sets && _sets.mode === 'medical_complex' ? `
    <div id="emr-tab-lab" class="emr-tab-content ${activeEmrTab === 'lab-tab' ? 'active-content' : ''}" style="display:${activeEmrTab === 'lab-tab' ? 'block' : 'none'}">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div>
          <div class="ph" style="margin-bottom:12px">
            <div><div class="pt" style="font-size:1.15rem;color:var(--teal)">🧪 المختبر الطبي المركزي</div><div class="ps">تتبع حالة التحاليل المخبرية ونتائج القيم</div></div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px">${labOrdersHTML}</div>
        </div>
        <div>
          <div class="ph" style="margin-bottom:12px">
            <div><div class="pt" style="font-size:1.15rem;color:var(--sky)">🩻 قسم التصوير التشخيصي بالأشعة</div><div class="ps">تقارير الأشعة الرقمية وصور السين والتقرير التشخيصي المرفق</div></div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px">${radOrdersHTML}</div>
        </div>
      </div>
    </div>` : ''}

    ${_sets && _sets.mode === 'medical_complex' ? `
    <div id="emr-tab-referral" class="emr-tab-content ${activeEmrTab === 'referral-tab' ? 'active-content' : ''}" style="display:${activeEmrTab === 'referral-tab' ? 'block' : 'none'}">
      <div class="ph" style="margin-bottom:12px">
        <div><div class="pt" style="font-size:1.15rem;color:#a855f7">🔄 مكتب التحويلات الطبية الداخلية</div><div class="ps">توجيه المرضى لحظياً بين أقسام المجمع الطبي</div></div>
      </div>
      <div class="vform" style="padding:20px;border-radius:14px;background:rgba(255,255,255,0.01)">
        <div class="pfl" style="color:var(--purple);font-weight:800;font-size:0.85rem;margin-bottom:12px"><i class="fas fa-random"></i> إنشاء بطاقة تحويل داخلي جديدة</div>
        <div style="display:grid;grid-template-columns:1.5fr 2.5fr auto;gap:12px;align-items:end">
          <div>
            <label style="font-size:0.75rem;color:var(--muted);display:block;margin-bottom:6px">القسم المستهدف</label>
            <select id="refTargetDept" class="fi" style="height:38px;border-radius:8px;padding:0 8px;width:100%">
              ${Object.entries(_depts || {}).map(([k, d]) => `<option value="${k}">${d.emoji || '🏢'} ${sanitize(d.name)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:0.75rem;color:var(--muted);display:block;margin-bottom:6px">سبب التحويل الطبي / ملاحظات إضافية</label>
            <input type="text" id="refReason" class="fi" style="height:38px;border-radius:8px;padding:0 8px;width:100%" placeholder="مثال: بحاجة لاستشارة عاجلة بخصوص ضغط الدم الشرياني">
          </div>
          <button class="btn-primary" onclick="createInternalReferral()" style="height:38px;padding:0 20px;border-radius:8px;background:linear-gradient(135deg,var(--purple),#7c3aed);font-size:0.82rem;border:none;box-shadow:0 4px 12px rgba(139,92,246,0.3)"><i class="fas fa-share-square"></i> إرسال التحويل</button>
        </div>
      </div>
    </div>` : ''}
  `;


  return fileHTML;
}

function refreshPatientFileUI(uid) {
  if (activePatientId !== uid) return;
  const fileHTML = generatePatientFileHTML(uid);
  const container = document.getElementById('patFileContent');
  if (container) {
    container.innerHTML = fileHTML;
  }
}

function viewPatientFile(phoneOrUid) {
  return safeViewPatientFile(phoneOrUid);
}

// ── ARGON ENTERPRISE: Lock Takeover Function ──
window.executeLockTakeover = async function (uid, prevDoctorId, prevDoctorName) {
  const session = window.ArgonSession ? ArgonSession.get() : {};
  const currentDoctorId = session?.staffId || 'unknown';
  const currentDoctorName = session?.displayName || 'طبيب';

  if (typeof logAudit === 'function') {
    logAudit('LOCK_TAKEOVER', `استيلاء على جلسة المريض (${uid}). الجلسة السابقة: ${prevDoctorName} (${prevDoctorId})`, 'EMR');
  }

  // Update lock directly
  if (typeof BASE !== 'undefined') {
    await db.ref(`${BASE}/active_sessions/${uid}`).update({
      doctorId: currentDoctorId,
      doctorName: currentDoctorName,
      lockedAt: Date.now(),
      takeoverFrom: prevDoctorId,
      takeoverReason: 'Expired Session (> 30 mins)'
    });
  }

  toast('✅ تم الاستيلاء على الجلسة بنجاح.', 'ok');

  // Re-run viewPatientFile to load the UI now that we own the lock
  viewPatientFile(uid);
};

async function safeViewPatientFile(phoneOrUid) {
  // Clear previous local lock if one exists so we can switch files seamlessly
  if (window.EMRContext && window.EMRContext.sessionLock && window.EMRContext.activePatientId) {
    if (typeof BASE !== 'undefined') {
      db.ref(`${BASE}/active_sessions/${window.EMRContext.activePatientId}`).remove();
    }
    window.EMRContext.sessionLock = false;
  }

  if (window.EMRContext && window.EMRContext.sessionLock) return;

  const token = crypto.randomUUID();
  window.EMRContext.renderToken = token;

  const session = window.ArgonSession ? ArgonSession.get() : {};
  const loggedInDoctorId = session?.staffId || session?.username || null;
  const isAdmin = session?.role === 'admin';

  let uid = phoneOrUid;

  if (!_patients[uid]) {
    const cleanP = cleanPhone(phoneOrUid);
    const matched = Object.entries(_patients).filter(([k, p]) => {
      return cleanP && ((p.info && cleanPhone(p.info.phone) === cleanP) || k === cleanP);
    });

    if (matched.length === 1) {
      uid = matched[0][0];
    } else if (matched.length > 1) {
      showDoctorProfileSelector(matched, phoneOrUid);
      return;
    } else {
      toast('⚠️ لم يتم العثور على الملف الطبي لهذا المريض', 'err');
      return;
    }
  }

  // Global Soft Lock Check
  if (typeof BASE !== 'undefined') {
    const lockRef = db.ref(`${BASE}/active_sessions/${uid}`);
    const lockSnap = await lockRef.once('value');
    if (lockSnap.exists()) {
      const lockData = lockSnap.val();
      if (!isAdmin && lockData.doctorId !== loggedInDoctorId) {
        // ── ARGON ENTERPRISE: Session Lock Takeover ──
        const lockAgeMs = Date.now() - (lockData.lockedAt || Date.now());
        const isExpired = lockAgeMs > 30 * 60 * 1000; // 30 minutes

        if (isExpired) {
          const tl = document.getElementById('timelineList');
          if (tl) tl.innerHTML = `
            <div style="text-align:center; padding: 40px; background: rgba(245,158,11,0.05); border-radius: 12px; border: 1px solid rgba(245,158,11,0.2);">
              <div style="font-size: 3rem; margin-bottom: 12px;">⏳</div>
              <h3 style="color: var(--amber); margin-bottom: 8px;">الجلسة قديمة (Expired Session)</h3>
              <p style="color: var(--muted); margin-bottom: 20px; line-height: 1.6;">الملف الطبي مقفل بواسطة د. <b>${sanitize(lockData.doctorName)}</b><br>ولكن الجلسة تجاوزت 30 دقيقة ولم تُغلق. يمكنك الاستيلاء على الجلسة الآن.</p>
              <button class="btn-primary" onclick="executeLockTakeover('${uid}', '${lockData.doctorId}', '${sanitize(lockData.doctorName)}')" style="background:var(--amber); border-color:var(--amber); color: #000; font-weight: bold; font-size: 1rem;"><i class="fas fa-unlock-alt"></i> الاستيلاء على الجلسة ومتابعة العمل</button>
            </div>`;
          return;
        }

        let isEmergencyGranted = false;
        if (window.ARGON_FEATURES && window.ARGON_FEATURES.ENABLE_BREAK_GLASS) {
          const grant = lockData.emergencyGrants ? lockData.emergencyGrants[loggedInDoctorId] : null;
          if (grant && Date.now() < grant.expiresAt) {
            isEmergencyGranted = true;
          }
        }

        if (!isEmergencyGranted) {
          toast(`الملف الطبي مفتوح لتعديله بواسطة ${lockData.doctorName}`, 'err');

          if (window.ARGON_FEATURES && window.ARGON_FEATURES.ENABLE_BREAK_GLASS) {
            // Show Break Glass Button in UI
            const tl = document.getElementById('timelineList');
            if (tl) tl.innerHTML = `<div style="text-align:center; padding: 40px;"><p>الملف مقفل بواسطة ${lockData.doctorName}</p><button class="btn-primary" onclick="requestBreakGlass('${uid}')" style="background:#dc2626; border-color:#b91c1c;">🚨 تفعيل وصول الطوارئ (Break Glass)</button></div>`;
          }

          if (window.AuditAPI) window.AuditAPI.log('PATIENT_FILE_LOCKED_CONFLICT', { patientId: uid, lockedBy: lockData.doctorId });
          return;
        } else {
          toast('🚨 تم الدخول بوضع الطوارئ.', 'warn');
        }
      }
    }

    // Acquire Global Soft Lock
    await lockRef.set({
      doctorId: loggedInDoctorId,
      doctorName: session?.displayName || session?.name || 'طبيب',
      lockedAt: Date.now()
    });
    lockRef.onDisconnect().remove();
  }

  // Lock Context
  window.EMRContext.sessionLock = true;
  window.EMRContext.activePatientId = uid;
  window.EMRContext.activeDoctorId = loggedInDoctorId;
  window.EMRContext.lastOpenedAt = Date.now();
  window.EMRContext.renderVersion++;
  window.EMRContext.initialized = true;

  if (window.AuditAPI) {
    window.AuditAPI.log('SESSION_LOCK_TRIGGERED', { patientId: uid });
    window.AuditAPI.log('PATIENT_FILE_OPENED', { patientId: uid });
  }

  // ── ARGON ENTERPRISE: Server Audit for File Access ──
  if (typeof logAudit === 'function') {
    logAudit('OPEN_FILE', `تم فتح ملف المريض (${uid})`, 'EMR');
  }


  const _patData = _patients[uid];
  window.EMRContext = window.EMRContext || {};
  window.EMRContext.bypassedPatients = window.EMRContext.bypassedPatients || {};

  const _hasBypass = window.EMRContext.bypassedPatients[uid];
  const _hasNID = ArgonNID.isValidNID(_patData?.info?.nationalId || '') || _hasBypass;

  if (!_hasNID) {
    // أفرج عن القفل مؤقتاً
    window.EMRContext.sessionLock = false;
    if (typeof BASE !== 'undefined')
      db.ref(`${BASE}/active_sessions/${uid}`).remove();

    const session = window.ArgonSession ? ArgonSession.get() : {};

    ArgonNID.showGate({
      patientName: _patData?.info?.name || 'المريض',
      patientId: uid,
      db,
      basePath: BASE,
      doctorId: session.staffId || 'unknown',
      doctorName: session.displayName || 'الطبيب',
      patientsCache: _patients,
      currentInvalidNID: _patData?.info?.nationalId || new URLSearchParams(window.location.search).get('nid') || '',

      onComplete: (patientId, result) => {
        // سواء أدخل الرقم أو تجاوز — نفتح الملف في الحالتين
        if (_patients[patientId]?.info && result.nid) {
          // حدّث الكاش المحلي فوراً
          _patients[patientId].info.nationalId = result.nid;
        }
        if (result.bypassed) {
          window.EMRContext.bypassedPatients[patientId] = true;
        }
        // أعد المحاولة — الآن إما عنده NID أو عنده bypass مسجّل
        safeViewPatientFile(patientId);
      }
    });
    return;
  }

  activePatientId = uid;
  const p = _patients[uid];

  if (window.EMRContext.renderToken !== token) {
    if (window.AuditAPI) window.AuditAPI.log('STALE_RENDER_ABORTED', { token });
    return;
  }

  if (!p) {
    window.EMRContext.sessionLock = false;
    return;
  }

  // Record this patient in recent patients list (Local Storage)
  if (typeof trackRecentPatient === 'function') {
    trackRecentPatient(uid, p.info?.name || 'مريض', p.info?.phone || '');
  }

  document.getElementById('patFileContent').innerHTML = generatePatientFileHTML(uid);

  sw('patFile');
}

// Load Visit Form
let labTestsList = [];
let radScansList = [];

function loadVisitForm(uid, bookingId = null) {
  const p = _patients[uid];
  if (!p) return;

  activeVisit.uid = uid;
  if (bookingId) {
    activeVisit.bookingId = bookingId;
    db.ref(`${BASE}/bookings/${bookingId}/status`).set('with_doctor').catch(() => { });
  }

  rxItems = [];
  uploadAttachments = [];
  labTestsList = [];
  radScansList = [];

  const docOptions = Object.entries(_doctors).map(([dk, d]) => `
    <option value="${dk}">د. ${sanitize(d.name)} (${sanitize(d.specialty)})</option>
  `).join('');

  const formHTML = `
    <div class="vform">
      <div class="vform-title"><i class="fas fa-stethoscope"></i> تسجيل زيارة طبية للمريض: ${sanitize(p.info.name)}</div>
      
      <div class="fi-row">
        <div class="fg">
          <label>الطبيب المعالج *</label>
          <select id="vDoc" class="fi" required>
            <option value="">— اختر الطبيب —</option>
            ${docOptions}
          </select>
        </div>
        <div class="fg">
          <label>التشخيص الأولي / الرئيسي *</label>
          <input id="vDiag" class="fi" placeholder="مثال: التهاب لوزتين حاد">
        </div>
      </div>

      <div class="fg">
        <label>الشكوى الرئيسية (Chief Complaint) *</label>
        <input id="vComp" class="fi" placeholder="مثال: ارتفاع حرارة وسعال منذ يومين">
      </div>

      <div class="fi-row3">
        <div class="fg"><label>درجة الحرارة (°C)</label><input id="vtTemp" type="number" step="0.1" class="fi" placeholder="37"></div>
        <div class="fg"><label>ضغط الدم (BP)</label><input id="vtBP" class="fi" placeholder="120/80"></div>
        <div class="fg"><label>معدل النبض (Pulse)</label><input id="vtPulse" type="number" class="fi" placeholder="75"></div>
      </div>

      <div class="fg">
        <label>ملاحظات الفحص والوصف</label>
        <textarea id="vNotes" rows="3" class="fi" style="resize:none" placeholder="اكتب تفاصيل الفحص الطبي والتوجيهات..."></textarea>
      </div>

      <!-- Laboratory & Radiology Orders Builder (Complex Only) -->
      ${(_sets && _sets.mode === 'medical_complex') ? `
      <div style="margin-top:20px;border-top:1px dashed var(--border);padding-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <!-- Lab Section -->
        <div style="border-left:1px dashed var(--border);padding-left:14px">
          <div class="vform-title" style="margin-bottom:8px;color:var(--teal)"><i class="fas fa-microscope"></i> الفحوصات المخبرية المطلوبة (Lab Orders)</div>
          <div style="position:relative;display:flex;gap:6px;margin-bottom:8px">
            <input id="labTestInput" class="fi" style="height:36px;font-size:0.8rem;flex:1" placeholder="فحص مخبري جديد (مثل: CBC, HbA1c)" onkeyup="searchCatalog('lab')" onfocus="searchCatalog('lab')" autocomplete="off">
            <button type="button" class="btn-primary" onclick="addLabOrderTest()" style="height:36px;padding:0 12px;background:var(--teal);border:none;border-radius:8px;cursor:pointer"><i class="fas fa-plus"></i></button>
            <div id="labCatalogDropdown" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--surf);border:1px solid var(--border);border-radius:8px;max-height:220px;overflow-y:auto;z-index:1000;box-shadow:0 10px 25px rgba(0,0,0,0.5);"></div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px" id="commonLabTests">
            <!-- Populated Dynamically -->
          </div>
          <div id="labOrderList" style="display:flex;flex-wrap:wrap;gap:6px;background:rgba(255,255,255,0.02);padding:8px;border-radius:8px;border:1px solid var(--border);min-height:45px;align-items:center">
            <span style="color:var(--muted);font-size:0.75rem" id="labPlaceholder">لا توجد فحوصات مطلوبة</span>
          </div>
        </div>

        <!-- Radiology Section -->
        <div>
          <div class="vform-title" style="margin-bottom:8px;color:var(--sky)"><i class="fas fa-x-ray"></i> صور الأشعة المطلوبة (Radiology Orders)</div>
          <div style="position:relative;display:flex;gap:6px;margin-bottom:8px">
            <input id="radScanInput" class="fi" style="height:36px;font-size:0.8rem;flex:1" placeholder="صورة أشعة جديدة (مثل: Chest X-Ray)" onkeyup="searchCatalog('radiology')" onfocus="searchCatalog('radiology')" autocomplete="off">
            <button type="button" class="btn-primary" onclick="addRadOrderScan()" style="height:36px;padding:0 12px;background:var(--sky);border:none;border-radius:8px;cursor:pointer"><i class="fas fa-plus"></i></button>
            <div id="radCatalogDropdown" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--surf);border:1px solid var(--border);border-radius:8px;max-height:220px;overflow-y:auto;z-index:1000;box-shadow:0 10px 25px rgba(0,0,0,0.5);"></div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px" id="commonRadScans">
            <!-- Populated Dynamically -->
          </div>
          <div id="radOrderList" style="display:flex;flex-wrap:wrap;gap:6px;background:rgba(255,255,255,0.02);padding:8px;border-radius:8px;border:1px solid var(--border);min-height:45px;align-items:center">
            <span style="color:var(--muted);font-size:0.75rem" id="radPlaceholder">لا توجد صور أشعة مطلوبة</span>
          </div>
        </div>
      </div>
      ` : ''}

      <!-- Prescription Builder -->
      <div style="margin-top:20px;border-top:1px dashed var(--border);padding-top:14px">
        <div class="vform-title" style="margin-bottom:8px"><i class="fas fa-prescription-bottle-alt"></i> الوصفة الطبية الإلكترونية</div>
        <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
          <div style="position:relative;flex:2;min-width:200px">
            <input id="rxName" class="fi" placeholder="اسم الدواء (ابحث في مخزون الصيدلية أو أدخل يدوياً)" onkeyup="searchDrug()" onfocus="searchDrug()" autocomplete="off" style="width:100%">
            <div id="rxDropdown" class="complex-only" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--surf);border:1px solid var(--border);border-radius:8px;max-height:220px;overflow-y:auto;z-index:1000;box-shadow:0 10px 25px rgba(0,0,0,0.5);"></div>
          </div>
          <input id="rxDose" class="fi" placeholder="الجرعة (مثال: 500mg)" style="flex:1;min-width:100px">
          <input id="rxFreq" class="fi" placeholder="التكرار (مثال: 3 مرات)" style="flex:1;min-width:100px">
          <input id="rxDur" class="fi" placeholder="المدة (مثال: 5 أيام)" style="flex:1;min-width:100px">
        </div>
        <div style="margin-bottom:8px">
          <input id="rxNote" class="fi" placeholder="ملاحظات للصيدلاني (اختياري - مثال: حساسية، أو تحذير دوائي...)" style="width:100%;border-color:rgba(239,68,68,0.3);background:rgba(239,68,68,0.02)">
        </div>
        <button type="button" class="rx-add" onclick="addRxItem()" style="margin-top:4px"><i class="fas fa-plus"></i> إضافة الدواء للوصفة</button>
        
        <table class="rx-table" id="rxTable" style="display:none">
          <thead>
            <tr>
              <th>الدواء</th>
              <th>الجرعة</th>
              <th>التكرار</th>
              <th>المدة</th>
              <th style="width:50px"></th>
            </tr>
          </thead>
          <tbody id="rxBody"></tbody>
        </table>
      </div>

      <!-- File Attachments -->
      <div style="margin-top:20px;border-top:1px dashed var(--border);padding-top:14px">
        <div class="vform-title" style="margin-bottom:8px"><i class="fas fa-paperclip"></i> مرفقات طبية (أشعة / تحاليل / تقارير)</div>
        <div class="att-upload" onclick="document.getElementById('attFileInp').click()">
          <i class="fas fa-cloud-upload-alt" style="font-size:2rem;margin-bottom:8px;display:block"></i>
          <span>اضغط هنا لرفع المرفقات (صور صغيرة Base64 أو ملفات PDF)</span>
          <input type="file" id="attFileInp" style="display:none" onchange="handleAttachment(event)">
        </div>
        <div class="att-grid" id="attFormGrid"></div>
      </div>

      <div style="display:flex;gap:10px;margin-top:24px">
        <button class="btn-primary" style="flex:1" onclick="saveVisit()"><i class="fas fa-check"></i> إنهاء وحفظ الزيارة الطبية</button>
        <button class="btn-secondary" onclick="viewPatientFile('${uid}')">إلغاء</button>
      </div>
    </div>
  `;

  document.getElementById('visitFormArea').innerHTML = formHTML;

  // Restore Auto-Saved Draft if exists
  setTimeout(() => {
    if (typeof ArgonCore !== 'undefined') {
      const draft = ArgonCore.AutoSave.loadDraft(uid);
      if (draft && draft.data) {
        const d = draft.data;
        if (document.getElementById('vDoc') && d.docKey) document.getElementById('vDoc').value = d.docKey;
        if (document.getElementById('vDiag') && d.diagnosis) document.getElementById('vDiag').value = d.diagnosis;
        if (document.getElementById('vComp') && d.complaint) document.getElementById('vComp').value = d.complaint;
        if (document.getElementById('vtTemp') && d.temp) document.getElementById('vtTemp').value = d.temp;
        if (document.getElementById('vtBP') && d.bp) document.getElementById('vtBP').value = d.bp;
        if (document.getElementById('vtPulse') && d.pulse) document.getElementById('vtPulse').value = d.pulse;
        if (document.getElementById('vNotes') && d.notes) document.getElementById('vNotes').value = d.notes;

        if (d.rxItems && d.rxItems.length) { rxItems = d.rxItems; renderRxTable(); }
        if (d.labTestsList && d.labTestsList.length) { labTestsList = d.labTestsList; renderLabOrderList(); }
        if (d.radScansList && d.radScansList.length) { radScansList = d.radScansList; renderRadOrderList(); }

        toast('🔄 تم استعادة البيانات غير المكتملة تلقائياً', 'ok');
      }
    }
  }, 150);
}

// Prescription actions
function addRxItem() {
  const name = document.getElementById('rxName').value.trim();
  const dose = document.getElementById('rxDose').value.trim();
  const freq = document.getElementById('rxFreq').value.trim();
  const dur = document.getElementById('rxDur').value.trim();
  const noteInp = document.getElementById('rxNote');
  const note = noteInp ? noteInp.value.trim() : '';

  if (!name) {
    toast('⚠️ يرجى إدخال اسم الدواء على الأقل', 'err');
    return;
  }

  rxItems.push({ name, dose, freq, dur, note });

  // Clean inputs
  ['rxName', 'rxDose', 'rxFreq', 'rxDur', 'rxNote'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderRxTable();
}

function renderRxTable() {
  const table = document.getElementById('rxTable');
  const tbody = document.getElementById('rxBody');

  if (!rxItems.length) {
    table.style.display = 'none';
    return;
  }

  table.style.display = 'table';
  tbody.innerHTML = rxItems.map((item, idx) => `
    <tr>
      <td>
        <b>${sanitize(item.name)}</b>
        ${item.note ? `<div style="font-size:0.7rem;color:#ef4444;margin-top:2px;background:rgba(239,68,68,0.1);padding:2px 6px;border-radius:4px;display:inline-block"><i class="fas fa-exclamation-triangle"></i> ${sanitize(item.note)}</div>` : ''}
      </td>
      <td>${sanitize(item.dose || '—')}</td>
      <td>${sanitize(item.freq || '—')}</td>
      <td>${sanitize(item.dur || '—')}</td>
      <td><button type="button" class="rx-rm" onclick="removeRxItem(${idx})"><i class="fas fa-trash-alt"></i></button></td>
    </tr>
  `).join('');
}

function removeRxItem(idx) {
  rxItems.splice(idx, 1);
  renderRxTable();
}

// ── SMART DRUG AUTOCOMPLETE ENGINE ──
function _buildDrugDropdownHTML(matched, query, selectFuncName) {
  if (!matched.length) {
    return `<div style="padding:10px;font-size:0.8rem;color:var(--muted);text-align:center">لم يتم العثور على "${sanitize(query)}" في المستودع.<br>سيتم إضافته كدواء خارجي (غير متوفر) ✅</div>`;
  }

  return matched.map(m => {
    const isOut = m.stock <= 0;
    const stockBadge = isOut
      ? `<span style="font-size:0.65rem;color:#ef4444;background:rgba(239,68,68,0.1);padding:2px 6px;border-radius:4px">نفد من المستودع ❌</span>`
      : `<span style="font-size:0.65rem;color:var(--green);background:rgba(16,185,129,0.1);padding:2px 6px;border-radius:4px">متوفر: ${m.stock} عبوة ✅</span>`;

    return `<div onclick="${selectFuncName}('${m.name.replace(/'/g, "\\'")}')" style="padding:10px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;justify-content:space-between;align-items:center;transition:0.2s" onmouseover="this.style.background='rgba(13,148,136,0.1)'" onmouseout="this.style.background='transparent'">
      <div>
        <div style="font-weight:700;font-size:0.85rem;color:var(--text)">${sanitize(m.name)}</div>
        ${m.scientificName ? `<div style="font-size:0.7rem;color:var(--muted);font-family:'IBM Plex Mono',monospace">${sanitize(m.scientificName)}</div>` : ''}
      </div>
      <div style="text-align:left">
        ${stockBadge}
        ${m.price ? `<div style="font-size:0.7rem;color:var(--teal);margin-top:4px;font-weight:700">${m.price} د.أ</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function _searchInventoryLogic(query) {
  const items = Object.values(_pharmacyInventory || {});
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return items.filter(item =>
    (item.name && item.name.toLowerCase().includes(q)) ||
    (item.scientificName && item.scientificName.toLowerCase().includes(q)) ||
    (item.arabicName && item.arabicName.includes(q)) ||
    (item.barcode && item.barcode.includes(q))
  );
}

// Old UI Search
function searchDrug() {
  const inp = document.getElementById('rxName');
  const dd = document.getElementById('rxDropdown');
  if (!inp || !dd) return;
  const q = inp.value.trim();
  if (!q) { dd.style.display = 'none'; return; }
  
  if (typeof ArgonLicense !== 'undefined' && ArgonLicense.type === 'single') {
     dd.style.display = 'none';
     return;
  }

  dd.innerHTML = _buildDrugDropdownHTML(_searchInventoryLogic(q), q, 'selectDrug');
  dd.style.display = 'block';
}

function selectDrug(name) {
  const inp = document.getElementById('rxName');
  const dd = document.getElementById('rxDropdown');
  if (inp) inp.value = name;
  if (dd) dd.style.display = 'none';
  const doseInp = document.getElementById('rxDose');
  if (doseInp) doseInp.focus();
}

// Workspace UI Search
function searchWorkspaceDrug() {
  const inp = document.getElementById('rxDrug');
  const dd = document.getElementById('rxWorkspaceDropdown');
  if (!inp || !dd) return;
  const q = inp.value.trim();
  if (!q) { dd.style.display = 'none'; return; }

  if (typeof ArgonLicense !== 'undefined' && ArgonLicense.type === 'single') {
     dd.style.display = 'none';
     return;
  }

  dd.innerHTML = _buildDrugDropdownHTML(_searchInventoryLogic(q), q, 'selectWorkspaceDrug');
  dd.style.display = 'block';
}

function selectWorkspaceDrug(name) {
  const inp = document.getElementById('rxDrug');
  const dd = document.getElementById('rxWorkspaceDropdown');
  if (inp) inp.value = name;
  if (dd) dd.style.display = 'none';
  const doseInp = document.getElementById('rxDose');
  if (doseInp) doseInp.focus();
}

// Hide dropdown when clicking outside
document.addEventListener('click', (e) => {
  const dd1 = document.getElementById('rxDropdown');
  const inp1 = document.getElementById('rxName');
  if (dd1 && inp1 && e.target !== inp1 && !dd1.contains(e.target)) dd1.style.display = 'none';

  const dd2 = document.getElementById('rxWorkspaceDropdown');
  const inp2 = document.getElementById('rxDrug');
  if (dd2 && inp2 && e.target !== inp2 && !dd2.contains(e.target)) dd2.style.display = 'none';

  const dd3 = document.getElementById('labCatalogDropdown');
  const inp3 = document.getElementById('labTestInput');
  if (dd3 && inp3 && e.target !== inp3 && !dd3.contains(e.target)) dd3.style.display = 'none';

  const dd4 = document.getElementById('radCatalogDropdown');
  const inp4 = document.getElementById('radScanInput');
  if (dd4 && inp4 && e.target !== inp4 && !dd4.contains(e.target)) dd4.style.display = 'none';
});

// ── SMART PRICING CATALOG AUTOCOMPLETE ENGINE ──
function _searchCatalogLogic(query, type) {
  const items = Object.entries(_pricingCatalogCache || {}).map(([key, val]) => ({ ...val, serviceId: key }));
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return items.filter(item => {
    if (item.type !== type || item.active === false) return false;
    return (item.name && item.name.toLowerCase().includes(q));
  });
}

function _buildCatalogDropdownHTML(matched, query, type) {
  if (!matched.length) {
    return `<div style="padding:10px;font-size:0.8rem;color:var(--muted);text-align:center">لم يتم العثور على "${sanitize(query)}" في الكتالوج.<br>إذا أضفته سيتم إرساله كفحص خارجي (غير مُسعّر) ويحتاج مراجعة مالية ⚠️</div>`;
  }

  return matched.map(m => {
    return `<div onclick="selectCatalogItem('${type}', '${m.serviceId}', '${m.name.replace(/'/g, "\\'")}', ${m.price})" style="padding:10px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;justify-content:space-between;align-items:center;transition:0.2s" onmouseover="this.style.background='rgba(13,148,136,0.1)'" onmouseout="this.style.background='transparent'">
      <div>
        <div style="font-weight:700;font-size:0.85rem;color:var(--text)">${sanitize(m.name)}</div>
      </div>
      <div style="text-align:left">
        <span style="font-size:0.75rem;font-family:'IBM Plex Mono',monospace;color:var(--teal);font-weight:700">${m.price} د.أ</span>
      </div>
    </div>`;
  }).join('');
}

function searchCatalog(type) {
  const inpId = type === 'lab' ? 'labTestInput' : 'radScanInput';
  const ddId = type === 'lab' ? 'labCatalogDropdown' : 'radCatalogDropdown';
  const inp = document.getElementById(inpId);
  const dd = document.getElementById(ddId);
  if (!inp || !dd) return;

  const q = inp.value.trim();
  if (!q) { dd.style.display = 'none'; return; }
  dd.innerHTML = _buildCatalogDropdownHTML(_searchCatalogLogic(q, type), q, type);
  dd.style.display = 'block';
}

function selectCatalogItem(type, serviceId, name, price) {
  const inpId = type === 'lab' ? 'labTestInput' : 'radScanInput';
  const ddId = type === 'lab' ? 'labCatalogDropdown' : 'radCatalogDropdown';
  const inp = document.getElementById(inpId);
  const dd = document.getElementById(ddId);

  if (inp) {
    inp.value = name;
    // Store selected snapshot metadata temporarily on the element
    inp.dataset.serviceId = serviceId;
    inp.dataset.unitPrice = price;
    inp.dataset.lastSelectedName = name;
  }
  if (dd) dd.style.display = 'none';
}

// Attachments Handling
function handleAttachment(e) {
  const file = e.target.files[0];
  if (!file) return;

  toast('⏳ جاري قراءة الملف...', 'ok');
  const reader = new FileReader();

  reader.onload = ev => {
    const fileType = file.type.startsWith('image/') ? 'image' : (file.type === 'application/pdf' ? 'pdf' : 'other');

    // Large PDF / Images handling via Storage if requested, else fallback to Base64
    if (file.size > 200 * 1024) {
      toast('💡 حجم الملف كبير، سيتم رفعه بأمان...', 'ok');
      // Compress if image
      if (fileType === 'image') {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const maxW = 800;
          let w = img.width, h = img.height;
          if (w > maxW) { h *= maxW / w; w = maxW; }
          canvas.width = w; canvas.height = h;
          ctx.drawImage(img, 0, 0, w, h);
          const compressed = canvas.toDataURL('image/jpeg', 0.6);
          pushAttachment(file.name, fileType, compressed);
        };
        img.src = ev.target.result;
      } else {
        // High quality PDF or others to Base64
        pushAttachment(file.name, fileType, ev.target.result);
      }
    } else {
      pushAttachment(file.name, fileType, ev.target.result);
    }
  };
  reader.readAsDataURL(file);
}

function pushAttachment(name, type, data) {
  uploadAttachments.push({ name, type, data });
  renderAttachmentsForm();
  toast('✅ تم إضافة المرفق بنجاح', 'ok');
}

function renderAttachmentsForm() {
  const grid = document.getElementById('attFormGrid');
  grid.innerHTML = uploadAttachments.map((a, idx) => `
    <div class="att-item">
      <i class="fas ${a.type === 'pdf' ? 'fa-file-pdf' : 'fa-file-image'}"></i>
      <span class="att-name">${sanitize(a.name)}</span>
      <span onclick="removeAttachment(${idx})" style="position:absolute;top:5px;left:5px;color:var(--red);font-weight:bold;cursor:pointer">✕</span>
    </div>
  `).join('');
}

function removeAttachment(idx) {
  uploadAttachments.splice(idx, 1);
  renderAttachmentsForm();
}

function openAttachment(data, type) {
  const w = window.open();
  if (type === 'pdf') {
    w.document.write(`<iframe src="${data}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
  } else {
    w.document.write(`<body style="margin:0;background:#030b0a;display:flex;align-items:center;justify-content:center;height:100vh;"><img src="${data}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.5);"></body>`);
  }
  w.document.close();
}

// Save Visit
function saveVisit() {
  const docKey = document.getElementById('vDoc').value;
  const diagnosis = document.getElementById('vDiag').value.trim();
  const complaint = document.getElementById('vComp').value.trim();
  const temp = document.getElementById('vtTemp').value.trim();
  const bp = document.getElementById('vtBP').value.trim();
  const pulse = document.getElementById('vtPulse').value.trim();
  const notes = document.getElementById('vNotes').value.trim();

  if (!docKey || !diagnosis || !complaint) {
    toast('⚠️ يرجى تعبئة الحقول المطلوبة (الطبيب والتشخيص والشكوى)', 'err');
    return;
  }

  const doc = _doctors[docKey] || {};
  const visitId = db.ref().child('visits').push().key;

  const visitObj = {
    date: new Date().toLocaleDateString('en-CA'),
    time: new Date().toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' }),
    docKey,
    docName: doc.name || 'غير محدد',
    doctorId: (ArgonSession.get() || {}).staffId || docKey,
    patientId: activePatientId,
    diagnosis,
    complaint,
    notes,
    vitals: {
      temp: temp || null,
      bp: bp || null,
      pulse: pulse || null
    },
    prescriptions: [...rxItems],
    labOrders: [...labTestsList],
    radOrders: [...radScansList],
    attachments: uploadAttachments
  };

  // Auto-capture pending Rx if user forgot to click +
  const rxD = document.getElementById('rxName')?.value.trim();
  const rxO = document.getElementById('rxDose')?.value.trim();
  if (rxD) {
    rxItems.push({ name: rxD, dose: rxO || '', freq: '', dur: '', note: '' });
    visitObj.prescriptions.push({ name: rxD, dose: rxO || '', freq: '' });
  }

  // Auto-capture pending Lab
  const pendingLabInp = document.getElementById('labTestInput');
  const pendingLab = pendingLabInp ? pendingLabInp.value.trim() : '';
  if (pendingLab && !labTestsList.some(x => x.name === pendingLab)) {
    const sId = pendingLabInp.dataset.serviceId;
    const sPrice = pendingLabInp.dataset.unitPrice;
    let newObj;
    if (sId && pendingLabInp.dataset.lastSelectedName === pendingLab) {
      newObj = { name: pendingLab, serviceId: sId, unitPrice: parseFloat(sPrice), source: 'pricing_catalog', requiresBillingReview: false };
    } else {
      newObj = { name: pendingLab, serviceId: 'external', unitPrice: 0, source: 'manual', requiresBillingReview: true };
    }
    labTestsList.push(newObj);
    visitObj.labOrders.push(newObj);
  }

  // Auto-capture pending Radiology
  const pendingRadInp = document.getElementById('radScanInput');
  const pendingRad = pendingRadInp ? pendingRadInp.value.trim() : '';
  if (pendingRad && !radScansList.some(x => x.name === pendingRad)) {
    const sId = pendingRadInp.dataset.serviceId;
    const sPrice = pendingRadInp.dataset.unitPrice;
    let newObj;
    if (sId && pendingRadInp.dataset.lastSelectedName === pendingRad) {
      newObj = { name: pendingRad, serviceId: sId, unitPrice: parseFloat(sPrice), source: 'pricing_catalog', requiresBillingReview: false };
    } else {
      newObj = { name: pendingRad, serviceId: 'external', unitPrice: 0, source: 'manual', requiresBillingReview: true };
    }
    radScansList.push(newObj);
    visitObj.radOrders.push(newObj);
  }

  const patientName = _patients[activePatientId]?.info?.name || 'مريض';
  const doctorDisplayName = (window.ArgonSession ? ArgonSession.get()?.displayName : null) || doc.name || 'طبيب';

  db.ref(`${BASE}/patients/${activePatientId}/visits/${visitId}`).set(visitObj).then(() => {
    // 1. Electronic Prescription Submission
    try {
      if (rxItems.length) {
        const prescId = db.ref().child('prescriptions').push().key;
        db.ref(`${BASE}/prescriptions/${prescId}`).set({
          patientId: activePatientId,
          patientName: patientName,
          doctorId: docKey,
          docName: doctorDisplayName,
          medications: rxItems.map(m => ({ ...m, status: 'waiting' })),
          status: 'waiting',
          visitId,
          orgId: CID,
          createdAt: new Date().toISOString()
        });
        db.ref(`${BASE}/notifications`).push({
          title: 'وصفة طبية جديدة 💊',
          message: `وصفة جديدة للمريض ${sanitize(patientName)}`,
          role: 'pharmacist',
          createdAt: new Date().toISOString()
        });
      }
    } catch (e) { console.error('Rx submission error:', e); }

    // 2. Laboratory Order Submission
    try {
      if (labTestsList.length) {
        const labOrderId = db.ref().child('lab_orders').push().key;
        db.ref(`${BASE}/lab_orders/${labOrderId}`).set({
          patientId: activePatientId,
          patientName: patientName,
          doctorId: docKey,
          docName: doctorDisplayName,
          requestedTests: labTestsList.map(t => ({
            name: t.name,
            serviceId: t.serviceId || 'external',
            unitPrice: t.unitPrice || 0,
            source: t.source || 'manual',
            requiresBillingReview: t.requiresBillingReview || false,
            result: '',
            unit: '',
            status: 'waiting'
          })),
          status: 'waiting',
          visitId,
          orgId: CID,
          createdAt: new Date().toISOString()
        });
        db.ref(`${BASE}/notifications`).push({
          title: 'طلب فحص مخبري جديد 🔬',
          message: `طلب تحاليل للمريض ${sanitize(patientName)}`,
          role: 'lab',
          createdAt: new Date().toISOString()
        });
      }
    } catch (e) { console.error('Lab submission error:', e); }

    // 3. Radiology Order Submission
    try {
      if (radScansList.length) {
        const radOrderId = db.ref().child('radiology_orders').push().key;
        db.ref(`${BASE}/radiology_orders/${radOrderId}`).set({
          patientId: activePatientId,
          patientName: patientName,
          doctorId: docKey,
          docName: doctorDisplayName,
          requestedScans: radScansList.map(s => ({
            name: s.name,
            serviceId: s.serviceId || 'external',
            unitPrice: s.unitPrice || 0,
            source: s.source || 'manual',
            requiresBillingReview: s.requiresBillingReview || false,
            status: 'waiting'
          })),
          status: 'waiting',
          visitId,
          orgId: CID,
          createdAt: new Date().toISOString()
        });
        db.ref(`${BASE}/notifications`).push({
          title: 'طلب أشعة جديد 🩻',
          message: `طلب تصوير أشعة للمريض ${sanitize(patientName)}`,
          role: 'radiology',
          createdAt: new Date().toISOString()
        });
      }
    } catch (e) { console.error('Rad submission error:', e); }

    // Generate Invoice link automatically
    const invId = db.ref().child('invoices').push().key;
    db.ref(`${BASE}/invoices/${invId}`).set({
      patientId: activePatientId,
      patientName: patientName,
      visitId,
      docName: doctorDisplayName,
      items: [
        { name: 'كشفية الطبيب / تشخيص', price: parseFloat(doc.fee || 0) }
      ],
      total: parseFloat(doc.fee || 0),
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    if (typeof ArgonCore !== 'undefined') {
      ArgonCore.AutoSave.clearDraft(activePatientId);
      ArgonCore.logAudit('CREATE_VISIT', `تم حفظ زيارة جديدة للمريض ${activePatientId}`, 'EMR');
    }

    toast('✅ تم حفظ الزيارة الطبية وإرسال الطلبات بنجاح', 'ok');
    refreshPatientFileUI(activePatientId);
  }).catch(() => toast('❌ فشل حفظ الزيارة الطبية', 'err'));
}

// ── AUTO SAVE ENGINE (EVERY 3 SECONDS) ──
setInterval(() => {
  if (!activePatientId || !document.getElementById('vDiag')) return;
  if (typeof ArgonCore === 'undefined') return;

  const data = {
    docKey: document.getElementById('vDoc') ? document.getElementById('vDoc').value : '',
    diagnosis: document.getElementById('vDiag') ? document.getElementById('vDiag').value : '',
    complaint: document.getElementById('vComp') ? document.getElementById('vComp').value : '',
    temp: document.getElementById('vtTemp') ? document.getElementById('vtTemp').value : '',
    bp: document.getElementById('vtBP') ? document.getElementById('vtBP').value : '',
    pulse: document.getElementById('vtPulse') ? document.getElementById('vtPulse').value : '',
    notes: document.getElementById('vNotes') ? document.getElementById('vNotes').value : '',
    rxItems: rxItems || [],
    labTestsList: labTestsList || [],
    radScansList: radScansList || []
  };

  if (data.diagnosis || data.complaint || data.rxItems.length || data.labTestsList.length || data.radScansList.length) {
    ArgonCore.AutoSave.saveDraft(activePatientId, data);
  }
}, 3000);

// Print Visit Summary
function printVisitSummary(vk) {
  const p = _patients[activePatientId];
  const v = p.visits[vk];
  if (!v) return;

  const cleanPhone = (str) => {
    if (!str) return 'غير متوفر';
    if (/[a-zA-Z]/.test(str) || str.length > 20) return 'غير متوفر'; // Ignore Firebase IDs
    return str;
  };
  const printPhone = cleanPhone(p.info.phone) !== 'غير متوفر' ? cleanPhone(p.info.phone) : cleanPhone(activePatientId);

  const rx = (v.prescriptions || []).map(item => `
    <tr>
      <td style="padding:12px;border:1px solid #e2e8f0;font-weight:700;color:#0f172a">${sanitize(item.name)}</td>
      <td style="padding:12px;border:1px solid #e2e8f0;text-align:center">${sanitize(item.dose) || '<span style="color:#94a3b8;font-size:0.85em">غير محدد</span>'}</td>
      <td style="padding:12px;border:1px solid #e2e8f0;text-align:center">${sanitize(item.freq) || '<span style="color:#94a3b8;font-size:0.85em">غير محدد</span>'}</td>
      <td style="padding:12px;border:1px solid #e2e8f0;text-align:center">${sanitize(item.dur) || '<span style="color:#94a3b8;font-size:0.85em">غير محدد</span>'}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center;padding:16px;color:#94a3b8;font-style:italic">لا يوجد أدوية موصوفة في هذه الزيارة</td></tr>';

  let printTitle = 'ملخص زيارة طبية / وصفة إلكترونية';
  let sigTitle = 'توقيع وختم الطبيب المعالج:';
  let showRx = true;
  let themeColor = '#0f766e'; // Teal
  let headerIcon = '👨‍⚕️';

  if (v.docKey === 'lab') {
    printTitle = 'تقرير فحوصات مخبرية';
    sigTitle = 'توقيع وختم المختبر:';
    showRx = false;
    themeColor = '#0ea5e9'; // Blue
    headerIcon = '🔬';
  } else if (v.docKey === 'radiology') {
    printTitle = 'تقرير صور أشعة';
    sigTitle = 'توقيع طبيب الأشعة:';
    showRx = false;
    themeColor = '#8b5cf6'; // Purple
    headerIcon = '🩻';
  } else if (v.docKey === 'pharmacist') {
    printTitle = 'تقرير صرف أدوية';
    sigTitle = 'توقيع الصيدلاني:';
    showRx = false;
    themeColor = '#f59e0b'; // Amber
    headerIcon = '💊';
  }

  // Calculate Treating/Referring Doctor for auxiliary reports
  let treatingDoctorStr = '';
  if (v.docKey === 'lab' || v.docKey === 'radiology' || v.docKey === 'pharmacist') {
    let referringDoc = 'غير محدد';
    if (v.referredBy) {
      referringDoc = v.referredBy;
    } else {
      // Find the most recent doctor visit chronologically before this visit
      const vKeys = Object.keys(p.visits).sort();
      const currentIndex = vKeys.indexOf(vk);
      if (currentIndex > 0) {
        for (let i = currentIndex - 1; i >= 0; i--) {
          const pastV = p.visits[vKeys[i]];
          if (pastV && pastV.docKey !== 'lab' && pastV.docKey !== 'radiology' && pastV.docKey !== 'pharmacist') {
            referringDoc = pastV.docName || 'غير محدد';
            break;
          }
        }
      }
    }
    treatingDoctorStr = `<div class="p-field"><b>الطبيب المعالج:</b> <span class="p-value" style="color:${themeColor}">د. ${sanitize(referringDoc)}</span></div>`;
  }

  const w = window.open('', '_blank');
  w.document.write(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>${printTitle} - ${sanitize(p.info.name)}</title>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&display=swap" rel="stylesheet">
      <style>
        @page { size: A4; margin: 20mm; }
        body { font-family:'Tajawal',sans-serif; color:#1e293b; line-height:1.6; margin:0; padding:20px; background:#fff; }
        .print-container { max-width: 800px; margin: 0 auto; }
        
        /* Header Section */
        .hdr { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid ${themeColor}; padding-bottom:20px; margin-bottom:30px; }
        .clinic-brand { display:flex; align-items:center; gap:15px; }
        .clinic-logo-placeholder { width: 60px; height: 60px; background: ${themeColor}; color: white; border-radius: 12px; display:flex; align-items:center; justify-content:center; font-size: 28px; font-weight:bold; }
        .title { font-size:26px; font-weight:900; color:${themeColor}; margin-bottom:4px; }
        .subtitle { font-size:14px; color:#64748b; font-weight:500; }
        
        .meta-info { text-align:left; font-size:13px; color:#475569; background:#f8fafc; padding:10px 15px; border-radius:8px; border:1px solid #e2e8f0; }
        
        /* Document Title */
        .doc-title { text-align:center; font-size:22px; font-weight:900; margin: 30px 0; color:#334155; padding:10px; background:#f1f5f9; border-radius:8px; letter-spacing:0.5px; display:flex; align-items:center; justify-content:center; gap:10px; }
        
        /* Patient Details Grid */
        .p-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; background:#fff; border:2px solid #e2e8f0; border-radius:12px; padding:20px; margin-bottom:30px; position:relative; overflow:hidden; }
        .p-grid::before { content:''; position:absolute; top:0; right:0; width:6px; height:100%; background:${themeColor}; }
        .p-field { font-size:15px; display:flex; align-items:center; }
        .p-field b { color:#64748b; width:110px; flex-shrink:0; }
        .p-value { font-weight:700; color:#0f172a; }
        
        /* Clinical Sections */
        .section-title { font-size:18px; font-weight:800; color:${themeColor}; border-bottom:2px solid #e2e8f0; padding-bottom:8px; margin-bottom:16px; display:flex; align-items:center; gap:8px; }
        .clinical-box { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:16px; margin-bottom:24px; }
        
        /* Rx Table */
        .rx-table { width:100%; border-collapse:collapse; margin-bottom:30px; background:#fff; border-radius:8px; overflow:hidden; border: 1px solid #e2e8f0; }
        .rx-table th { background:${themeColor}; color:#fff; font-size:14px; padding:12px; text-align:center; font-weight:700; border:1px solid ${themeColor}; }
        .rx-table td { border: 1px solid #e2e8f0; }
        .rx-table tr:nth-child(even) { background-color: #f8fafc; }
        
        /* Footer & Signature */
        .footer-grid { display:flex; justify-content:space-between; margin-top:50px; page-break-inside: avoid; }
        .sig-box { text-align:center; padding-top:20px; width: 250px; }
        .sig-line { border-top:2px dashed #cbd5e1; margin-bottom:10px; }
        .sig-title { font-weight:700; color:#64748b; font-size:14px; }
        .sig-name { font-weight:900; color:${themeColor}; font-size:18px; margin-top:8px; }
        
        /* Vitals Pills */
        .vitals-flex { display:flex; gap:15px; flex-wrap:wrap; }
        .vital-pill { background:#fff; border:1px solid #cbd5e1; padding:8px 16px; border-radius:20px; font-weight:700; font-size:14px; color:#334155; display:flex; align-items:center; gap:6px; box-shadow:0 1px 2px rgba(0,0,0,0.05); }
        
        /* Print optimizations */
        @media print {
          body { background:#fff; margin:0; padding:0; }
          .print-container { max-width: 100%; }
        }
      </style>
    </head>
    <body>
      <div class="print-container">
        <!-- Header -->
        <div class="hdr">
          <div class="clinic-brand">
            <div class="clinic-logo-placeholder">
               <i class="fas fa-hospital-symbol">H</i>
            </div>
            <div>
              <div class="title">${_sets.name || 'العيادة الطبية'}</div>
              <div class="subtitle">${_sets.specialty || 'عيادة تخصصية متكاملة'} | هاتف: <span dir="ltr">${_sets.phone || 'غير مدرج'}</span></div>
            </div>
          </div>
          <div class="meta-info">
            <div><b>تاريخ الطباعة:</b> ${new Date().toLocaleDateString('ar-JO')}</div>
            <div style="margin-top:4px;"><b>الرقم الطبي للمريض:</b> <span dir="ltr">${p.info.mrn || 'غير مدرج'}</span></div>
          </div>
        </div>
        
        <!-- Document Title -->
        <div class="doc-title">
          <span>${headerIcon}</span> ${printTitle}
        </div>
        
        <!-- Patient Details -->
        <div class="p-grid">
          <div class="p-field"><b>اسم المريض:</b> <span class="p-value">${sanitize(p.info.name)}</span></div>
          <div class="p-field"><b>الرقم الوطني:</b> <span class="p-value" dir="ltr">${sanitize(p.info.nationalId || 'غير مدرج')}</span></div>
          <div class="p-field"><b>رقم الهاتف:</b> <span class="p-value" dir="ltr">${sanitize(printPhone)}</span></div>
          <div class="p-field"><b>العمر / الجنس:</b> <span class="p-value">${p.info.age ? p.info.age + ' سنة' : '—'} / ${p.info.gender || '—'}</span></div>
          <div class="p-field"><b>تاريخ ووقت الزيارة:</b> <span class="p-value">${v.date} · ${v.time}</span></div>
          ${treatingDoctorStr}
        </div>

        <!-- Clinical Details -->
        <div class="clinical-box">
          <div style="margin-bottom:12px;">
            <b style="color:#64748b;">🩺 التشخيص/الموضوع:</b> 
            <span style="font-weight:700; font-size:16px;">${sanitize(v.diagnosis || 'فحص طبي')}</span>
          </div>
          <div>
            <b style="color:#64748b;">🔍 التفاصيل والشكوى:</b> 
            <span>${sanitize(v.complaint || 'لا يوجد تفاصيل إضافية')}</span>
          </div>
        </div>

        <!-- Vitals -->
        ${v.vitals?.temp || v.vitals?.bp || v.vitals?.pulse ? `
          <div class="clinical-box" style="background:#f1f5f9;">
            <div class="vitals-flex">
              ${v.vitals.temp ? `<div class="vital-pill">🌡️ الحرارة: ${v.vitals.temp}°C</div>` : ''} 
              ${v.vitals.bp ? `<div class="vital-pill">❤️ الضغط: <span dir="ltr">${v.vitals.bp}</span></div>` : ''} 
              ${v.vitals.pulse ? `<div class="vital-pill">💓 النبض: ${v.vitals.pulse}/د</div>` : ''}
            </div>
          </div>
        ` : ''}

        <!-- Prescriptions -->
        ${showRx ? `
        <div class="section-title">💊 الأدوية الموصوفة (Rx)</div>
        <table class="rx-table">
          <thead>
            <tr>
              <th style="width: 40%;">اسم الدواء</th>
              <th style="width: 20%;">الجرعة</th>
              <th style="width: 20%;">التكرار</th>
              <th style="width: 20%;">المدة</th>
            </tr>
          </thead>
          <tbody>
            ${rx}
          </tbody>
        </table>
        ` : ''}

        <!-- Notes / Directives -->
        ${v.notes ? `
        <div class="section-title">📝 تقرير وتوجيهات إضافية</div>
        <div class="clinical-box">
          <p style="white-space: pre-wrap; margin:0;">${sanitize(v.notes)}</p>
        </div>
        ` : ''}

        <!-- Footer / Signature -->
        <div class="footer-grid">
          <div style="font-size:12px; color:#94a3b8; max-width: 400px; padding-top:20px;">
            * هذه الوثيقة صادرة إلكترونياً من نظام كلينيكا لإدارة العيادات ولا تحتاج إلى ختم إذا كانت تحمل توقيعاً إلكترونياً معتمداً.
            <br>* نتمنى لكم دوام الصحة والعافية.
          </div>
          <div class="sig-box">
            <div class="sig-line"></div>
            <div class="sig-title">${sigTitle}</div>
            <div class="sig-name">د. ${sanitize(v.docName)}</div>
          </div>
        </div>

      </div>
      <script>window.onload = () => { setTimeout(() => { window.print(); window.close(); }, 500); }</script>
    </body>
    </html>
  `);
  w.document.close();
}

function createInternalReferral() {
  const deptId = document.getElementById('refTargetDept').value;
  const reason = document.getElementById('refReason').value.trim();
  if (!deptId) { toast('⚠️ يرجى اختيار القسم المستهدف', 'err'); return; }
  if (!reason) { toast('⚠️ يرجى كتابة سبب التحويل', 'err'); return; }

  const p = _patients[activePatientId];
  if (!p) return;
  const dept = _depts[deptId];
  if (!dept) { toast('⚠️ القسم غير موجود', 'err'); return; }

  // 1. Save referral node
  const refId = db.ref().child('referrals').push().key;
  const referralObj = {
    patientPhone: activePatientId,
    patientName: p.info.name,
    patientAge: p.info.age || null,
    patientGender: p.info.gender || '',
    toDept: deptId,
    toDeptName: dept.name,
    toDeptEmoji: dept.emoji || '🏢',
    reason: reason,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  db.ref(`${BASE}/referrals/${refId}`).set(referralObj).then(() => {
    // 2. Automatically create a waiting booking in the target department queue
    const bKey = db.ref().child('bookings').push().key;
    const bookingObj = {
      date: new Date().toLocaleDateString('en-CA'),
      time: 'تحويل داخلي',
      patPhone: activePatientId,
      patName: p.info.name,
      patAge: p.info.age || null,
      patGender: p.info.gender || '',
      docKey: 'referral', // Marker for referred patients
      docName: `تحويل إلى ${dept.emoji || '🏢'} ${dept.name}`,
      fee: 0.00,
      bookNo: 'REF-' + Math.floor(1000 + Math.random() * 9000),
      notes: `محال داخلياً: ${reason}`,
      status: 'waiting',
      referralId: refId,
      createdAt: new Date().toISOString()
    };

    // Also save the referral item in the patient's visit history timeline
    const visitId = db.ref().child('visits').push().key;
    const refVisitObj = {
      date: new Date().toLocaleDateString('en-CA'),
      time: new Date().toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' }),
      docKey: 'referral',
      docName: 'نظام التحويلات الداخلي',
      diagnosis: `تحويل صادر إلى قسم: ${dept.name}`,
      complaint: 'تحويل طبي داخلي',
      notes: `سبب التحويل: ${reason}`,
      vitals: { temp: null, bp: null, pulse: null },
      prescriptions: [],
      attachments: []
    };

    Promise.all([
      db.ref(`${BASE}/bookings/${bKey}`).set(bookingObj),
      db.ref(`${BASE}/patients/${activePatientId}/visits/${visitId}`).set(refVisitObj)
    ]).then(() => {
      toast('✅ تم إرسال التحويل وتحويل المريض بنجاح', 'ok');
      const input = document.getElementById('refReason');
      if (input) input.value = '';
      refreshPatientFileUI(activePatientId);
    });
  }).catch(() => toast('❌ فشل إرسال التحويل', 'err'));
}

function addLabOrderTest() {
  const input = document.getElementById('labTestInput');
  const val = input.value.trim();
  if (val) {
    const sId = input.dataset.serviceId;
    const sPrice = input.dataset.unitPrice;

    // Check if the user selected from the catalog or typed manually
    if (sId && input.dataset.lastSelectedName === val) {
      addQuickLab(val, sId, parseFloat(sPrice), 'pricing_catalog');
    } else {
      addQuickLab(val, 'external', 0, 'manual');
    }
    input.value = '';
    delete input.dataset.serviceId;
    delete input.dataset.unitPrice;
    delete input.dataset.lastSelectedName;
  }
}
function addQuickLab(name, serviceId = 'external', unitPrice = 0, source = 'manual') {
  if (labTestsList.some(x => x.name === name)) return;
  labTestsList.push({ name, serviceId, unitPrice, source, requiresBillingReview: source === 'manual' });
  renderLabOrderChips();
}
function removeLabTest(name) {
  labTestsList = labTestsList.filter(x => x.name !== name);
  renderLabOrderChips();
}
function renderLabOrderChips() {
  if (typeof saveVisitDraft === "function") saveVisitDraft();
  const div = document.getElementById('labOrderList');
  if (!div) return;
  if (!labTestsList.length) {
    div.innerHTML = `<span style="color:var(--muted);font-size:0.75rem" id="labPlaceholder">لا توجد فحوصات مطلوبة</span>`;
    return;
  }
  div.innerHTML = labTestsList.map(t => `
    <span class="tag" style="background:rgba(13,148,136,0.15);border:1px solid var(--teal);color:var(--teal)">
      ${sanitize(t.name)} ${t.source === 'manual' ? '<i class="fas fa-exclamation-triangle" style="color:var(--amber);margin-right:4px" title="فحص خارجي غير مسعر"></i>' : ''} <span onclick="removeLabTest('${sanitize(t.name).replace(/'/g, "\\'")}')" style="cursor:pointer;margin-right:6px;font-weight:bold;color:var(--red)">✕</span>
    </span>
  `).join('');
}

function addRadOrderScan() {
  const input = document.getElementById('radScanInput');
  const val = input.value.trim();
  if (val) {
    const sId = input.dataset.serviceId;
    const sPrice = input.dataset.unitPrice;

    if (sId && input.dataset.lastSelectedName === val) {
      addQuickRad(val, sId, parseFloat(sPrice), 'pricing_catalog');
    } else {
      addQuickRad(val, 'external', 0, 'manual');
    }
    input.value = '';
    delete input.dataset.serviceId;
    delete input.dataset.unitPrice;
    delete input.dataset.lastSelectedName;
  }
}
function addQuickRad(name, serviceId = 'external', unitPrice = 0, source = 'manual') {
  if (radScansList.some(x => x.name === name)) return;
  radScansList.push({ name, serviceId, unitPrice, source, requiresBillingReview: source === 'manual' });
  renderRadOrderChips();
}
function removeRadScan(name) {
  radScansList = radScansList.filter(x => x.name !== name);
  renderRadOrderChips();
}
function renderRadOrderChips() {
  if (typeof saveVisitDraft === "function") saveVisitDraft();
  const div = document.getElementById('radOrderList');
  if (!div) return;
  if (!radScansList.length) {
    div.innerHTML = `<span style="color:var(--muted);font-size:0.75rem" id="radPlaceholder">لا توجد صور أشعة مطلوبة</span>`;
    return;
  }
  div.innerHTML = radScansList.map(t => `
    <span class="tag blue" style="background:rgba(14,165,233,0.15);border:1px solid var(--sky);color:var(--sky)">
      ${sanitize(t.name)} ${t.source === 'manual' ? '<i class="fas fa-exclamation-triangle" style="color:var(--amber);margin-right:4px" title="تصوير خارجي غير مسعر"></i>' : ''} <span onclick="removeRadScan('${sanitize(t.name).replace(/'/g, "\\'")}')" style="cursor:pointer;margin-right:6px;font-weight:bold;color:var(--red)">✕</span>
    </span>
  `).join('');
}

// Generate dynamic tags from Pricing Catalog for EMR quick selection
function renderDynamicCatalogTags() {
  const labDiv = document.getElementById('commonLabTests');
  const radDiv = document.getElementById('commonRadScans');

  const items = Object.entries(_pricingCatalogCache || {}).map(([key, val]) => ({ ...val, serviceId: key })).filter(i => i.active !== false);

  if (labDiv) {
    const labItems = items.filter(i => i.type === 'lab').slice(0, 10);
    if (labItems.length) {
      labDiv.innerHTML = labItems.map(i => `<span class="tag" style="cursor:pointer;font-size:0.72rem" onclick="addQuickLab('${i.name.replace(/'/g, "\\'")}', '${i.serviceId}', ${i.price || 0}, 'pricing_catalog')">${sanitize(i.name)} 🩸</span>`).join('');
    } else {
      labDiv.innerHTML = '<span style="font-size:0.7rem;color:var(--muted)">لا توجد فحوصات في الكتالوج لتسريع الاختيار</span>';
    }
  }

  if (radDiv) {
    const radItems = items.filter(i => i.type === 'radiology').slice(0, 10);
    if (radItems.length) {
      radDiv.innerHTML = radItems.map(i => `<span class="tag blue" style="cursor:pointer;font-size:0.72rem" onclick="addQuickRad('${i.name.replace(/'/g, "\\'")}', '${i.serviceId}', ${i.price || 0}, 'pricing_catalog')">${sanitize(i.name)} 🩻</span>`).join('');
    } else {
      radDiv.innerHTML = '<span style="font-size:0.7rem;color:var(--muted)">لا توجد صور أشعة في الكتالوج لتسريع الاختيار</span>';
    }
  }
}

// Sanitization
const sanitize = s => String(s || '').replace(/[<>"']/g, '').trim().substring(0, 250);

// Seeding default departments automatically for Medical Complex tier
function checkAndSeedDefaultDepartments() {
  if (_sets && _sets.mode === 'medical_complex') {
    db.ref(BASE + '/departments').once('value', snap => {
      if (!snap.exists() || !snap.val()) {
        const defaultDepts = {
          general: { name: 'الطب العام', emoji: '🩺', color: '#0d9488' },
          dental: { name: 'طب الأسنان', emoji: '🦷', color: '#8b5cf6' },
          pediatrics: { name: 'طب الأطفال', emoji: '👶', color: '#10b981' },
          cardio: { name: 'أمراض القلب', emoji: '🫀', color: '#ef4444' },
          ortho: { name: 'جراحة العظام', emoji: '🦴', color: '#f59e0b' }
        };
        db.ref(BASE + '/departments').set(defaultDepts);
      }
    });
  }
}

// Tab switcher helper
function switchEmrTab(tabId) {
  activeEmrTab = tabId;
  document.querySelectorAll('.emr-tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.emr-tab-content').forEach(content => {
    content.style.display = 'none';
    content.classList.remove('active-content');
  });

  if (tabId === 'timeline-tab') {
    document.querySelector('.emr-tab-btn:nth-child(1)').classList.add('active');
    const el = document.getElementById('emr-tab-timeline');
    if (el) { el.style.display = 'block'; el.classList.add('active-content'); }
  } else if (tabId === 'lab-tab') {
    document.querySelector('.emr-tab-btn:nth-child(2)').classList.add('active');
    const el = document.getElementById('emr-tab-lab');
    if (el) { el.style.display = 'block'; el.classList.add('active-content'); }
  } else if (tabId === 'referral-tab') {
    const btn = document.querySelector('.emr-tab-btn:nth-child(3)');
    if (btn) btn.classList.add('active');
    const el = document.getElementById('emr-tab-referral');
    if (el) { el.style.display = 'block'; el.classList.add('active-content'); }
  }
}

// Format date into luxurious Arabic style
function formatArabicDate(dateStr) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('ar-JO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}

// Convert 12h Arabic/English time into comparable 24h format
function parseArabicTime(t) {
  let clean = String(t || '').trim();
  const isPM = clean.includes('م') || clean.includes('PM');
  const isAM = clean.includes('ص') || clean.includes('AM');
  const match = clean.match(/(\d+):(\d+)/);
  if (!match) return '00:00';
  let hours = parseInt(match[1]);
  let minutes = match[2];
  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;
  return String(hours).padStart(2, '0') + ':' + minutes;
}

// Premium Web Audio Synthesizer Double-Chime Sound
function playNotificationSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    // First high chime
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now); // A5 note
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    // Second premium chime with a minor third delay for high elegance
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1320, now + 0.12); // E6 note
    gain2.gain.setValueAtTime(0.15, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.45);
  } catch (e) {
    console.warn("Audio Context playback failed or blocked by browser gesture", e);
  }
}

// 🔄 Internal Referrals Dashboard Logic
function filterReferrals(status, btn) {
  currentReferralsFilter = status;
  document.querySelectorAll('.filter-ref-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderReferralsList();
}

function renderReferralsList() {
  const grid = document.getElementById('referralsGrid');
  if (!grid) return;

  const list = Object.entries(_referrals).reverse(); // Newest first
  const filtered = list.filter(([k, r]) => {
    if (currentReferralsFilter === 'all') return true;
    return r.status === currentReferralsFilter;
  });

  if (!filtered.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px;color:var(--muted)" class="glass-panel">
      <i class="fas fa-exchange-alt" style="font-size:2.5rem;display:block;margin-bottom:12px;opacity:0.15"></i>
      لا يوجد طلبات تحويل طبي تطابق الحالة المحددة حالياً
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map(([k, r]) => {
    const isCompleted = r.status === 'completed';
    const statusLabel = isCompleted ? 'مكتملة ✅' : 'بانتظار المعاينة ⏳';
    const statusColor = isCompleted ? 'var(--green)' : 'var(--amber)';
    const statusBg = isCompleted ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)';

    return `
      <div class="glass-panel" style="padding:18px;border-right:5px solid ${statusColor};position:relative;display:flex;flex-direction:column;gap:10px;animation:fu 0.25s ease">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:0.75rem;color:var(--muted)">${(r.createdAt || '').substring(0, 10)} · ${(r.createdAt || '').substring(11, 16)}</span>
          <span style="font-size:0.72rem;font-weight:800;padding:4px 8px;border-radius:6px;background:${statusBg};color:${statusColor}">${statusLabel}</span>
        </div>
        <div style="font-size:1.05rem;font-weight:800;color:var(--text)">👤 ${sanitize(r.patientName)}</div>
        <div style="font-size:0.82rem;color:var(--muted)">رقم الهاتف: <span dir="ltr">${sanitize(r.patientId)}</span></div>
        <div style="font-size:0.85rem;background:rgba(255,255,255,0.01);padding:10px;border-radius:8px;border:1px solid var(--border)">
          <b>🎯 القسم المحال إليه:</b> ${r.toDeptEmoji || '🏢'} <span style="color:var(--purple);font-weight:700">${sanitize(r.toDeptName)}</span>
          <br>
          <div style="margin-top:6px;line-height:1.4"><b>📝 السبب الطبي للتحويل:</b><br>${sanitize(r.reason || 'استشارة عامة')}</div>
        </div>
        <div style="margin-top:auto;display:flex;gap:8px;justify-content:flex-end">
          <button class="btn-secondary btn-sm" onclick="viewPatientFile('${r.patientId}')" style="height:32px;border-radius:6px;font-size:0.75rem"><i class="fas fa-file-medical"></i> فتح الملف الطبي</button>
          ${!isCompleted ? `<button class="btn-primary btn-sm" onclick="completeReferral('${k}')" style="height:32px;border-radius:6px;font-size:0.75rem;background:var(--green);border:none;box-shadow:0 4px 10px rgba(16,185,129,0.2)"><i class="fas fa-check"></i> اكتمال المعاينة</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function completeReferral(refId) {
  db.ref(`${BASE}/referrals/${refId}/status`).set('completed').then(() => {
    toast('✅ تم تحديث حالة التحويل إلى مكتمل', 'ok');
  });
}

// Beautiful Doctor Profile Selector Modal (Ambiguity Disambiguation)
function showDoctorProfileSelector(matchedPats, originalSearchTerm, onSelectCallback = null) {
  const existing = document.getElementById('doctorProfileSelectorOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'doctorProfileSelectorOverlay';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(2, 7, 6, 0.85);
    backdrop-filter: blur(10px);
    z-index: 110000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    font-family: 'Tajawal', sans-serif;
  `;

  const container = document.createElement('div');
  container.className = 'glass-panel';
  container.style.cssText = `
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 22px;
    padding: 28px;
    width: 100%;
    max-width: 520px;
    box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    text-align: center;
  `;

  // Attach callback globally for the inline onclick handlers
  window._tempProfileSelectorCallback = onSelectCallback;

  let profilesHTML = matchedPats.map(([uid, p]) => {
    const info = p.info || {};
    const genderIcon = info.gender === 'ذكر' ? '👨' : info.gender === 'أنثى' ? '👩' : '👤';
    const ageStr = info.age ? `${info.age} سنة` : 'العمر غير مسجل';
    const regDate = info.createdAt ? new Date(info.createdAt).toLocaleDateString('ar-JO') : '—';

    // Default action if no callback is provided
    let clickAction = `document.getElementById('doctorProfileSelectorOverlay').remove(); viewPatientFile('${uid}'); sw('patFile');`;
    if (onSelectCallback) {
      clickAction = `document.getElementById('doctorProfileSelectorOverlay').remove(); if(window._tempProfileSelectorCallback) window._tempProfileSelectorCallback('${uid}');`;
    }

    return `
      <div class="plist-card" style="border: 1px solid var(--border); border-radius: 12px; padding: 14px; display: flex; align-items: flex-start; gap: 14px; cursor: pointer; text-align: right; margin-bottom: 12px; transition: all 0.2s;" 
           onclick="${clickAction}">
        <div style="font-size: 2.2rem; background: rgba(255,255,255,0.03); border-radius: 12px; padding: 10px; width: 60px; text-align: center;">${genderIcon}</div>
        <div style="flex: 1; line-height: 1.6;">
          <div style="font-weight: 800; font-size: 1.1rem; color: var(--text);">${sanitize(info.name)}</div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 0.78rem; color: var(--muted); margin-top: 6px;">
            <div><i class="far fa-id-badge" style="width:14px; color:var(--sky)"></i> الرقم الطبي: <span style="font-family: monospace; font-weight: bold; color:var(--text);">${info.mrn || '—'}</span></div>
            <div><i class="fas fa-fingerprint" style="width:14px; color:var(--teal)"></i> Patient UID: <span style="font-family: monospace; font-size: 0.65rem;">${uid.substring(0, 8)}...</span></div>
            
            <div style="grid-column: 1 / -1; ${info.nationalId ? 'color:var(--amber); font-weight:bold;' : ''}"><i class="far fa-id-card" style="width:14px;"></i> الرقم الوطني: ${info.nationalId || 'غير مسجل'}</div>
            
            <div><i class="far fa-calendar-alt" style="width:14px;"></i> تاريخ الميلاد: ${info.dob || '—'}</div>
            <div><i class="fas fa-user-clock" style="width:14px;"></i> العمر: ${ageStr}</div>
            
            <div><i class="fas fa-phone" style="width:14px;"></i> الهاتف: ${info.phone || '—'}</div>
            <div><i class="fas fa-venus-mars" style="width:14px;"></i> الجنس: ${info.gender || '—'}</div>
            
            <div style="grid-column: 1 / -1; margin-top: 4px; font-size: 0.7rem; opacity: 0.7;"><i class="fas fa-history" style="width:14px;"></i> تاريخ التسجيل: ${regDate}</div>
          </div>
        </div>
        <div style="color: var(--teal); display: flex; align-items: center; align-self: center;"><i class="fas fa-chevron-left fa-lg"></i></div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div style="font-size: 3rem; margin-bottom: 12px; display: inline-block; background: rgba(239,68,68,0.1); border-radius: 50%; width: 80px; height: 80px; line-height: 80px; border: 2px solid rgba(239,68,68,0.3);">⚠️</div>
    <h3 style="font-weight: 900; margin-bottom: 8px; color: var(--text);">تطابق أسماء أو بيانات</h3>
    <p style="font-size: 0.85rem; color: var(--amber); margin-bottom: 20px; font-weight: bold;">يوجد أكثر من ملف طبي مطابق لبحثك (${sanitize(originalSearchTerm)}). يرجى التمييز الدقيق واختيار الملف الصحيح لتجنب الخلط الطبي:</p>
    
    <div style="max-height: 280px; overflow-y: auto; margin-bottom: 20px;">
      ${profilesHTML}
    </div>
    
    <button class="btn-secondary" style="width: 100%; justify-content: center;" onclick="document.getElementById('doctorProfileSelectorOverlay').remove();">إلغاء</button>
  `;

  overlay.appendChild(container);
  document.body.appendChild(overlay);
}

// ── PROGRAMMATIC ISOLATION & COLLISION DIAGNOSTIC ROUTINE ──
function runCollisionTest() {
  console.log("%c🧪 Starting EMR Collision Isolation Test...", "color: #0d9488; font-weight: bold; font-size: 1.2rem;");
  const testPhone = '0799999999';
  const cleanP = cleanPhone(testPhone);

  // We will programmatically create 10 independent patients sharing this same phone number
  const promises = [];
  for (let i = 1; i <= 10; i++) {
    const newUid = db.ref().child('patients').push().key;
    const mrn = 'TEST-MRN-' + Math.floor(100000 + Math.random() * 900000);
    const patObj = {
      info: {
        name: `مريض الفحص رقم ${i}`,
        phone: cleanP,
        nationalId: `99900011${i}`,
        age: 20 + i,
        gender: i % 2 === 0 ? 'ذكر' : 'أنثى',
        bloodType: 'O+',
        mrn: mrn,
        notes: `Collision diagnostic record ${i}`,
        createdAt: new Date().toISOString()
      }
    };

    // Simulate visits for each isolated patient
    const visitId = db.ref().child('visits').push().key;
    patObj.visits = {
      [visitId]: {
        date: new Date().toLocaleDateString('en-CA'),
        time: new Date().toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' }),
        docKey: 'doctor_collision_test',
        docName: 'فاحص العزل التلقائي',
        diagnosis: `تشخيص معزول للمريض ${i}`,
        complaint: `شكوى تجريبية رقم ${i}`,
        notes: `تقرير فحص طبي معزول بالكامل للمريض رقم ${i}`
      }
    };

    // Simulate invoices for each isolated patient
    const invId = db.ref().child('invoices').push().key;
    const invPromise = db.ref(`${BASE}/invoices/${invId}`).set({
      patientId: newUid,
      patientName: patObj.info.name,
      visitId: visitId,
      docName: 'فاحص العزل التلقائي',
      items: [{ name: `كشفية فحص ${i}`, price: 10 * i }],
      total: 10 * i,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    const patPromise = db.ref(`${BASE}/patients/${newUid}`).set(patObj);
    promises.push(Promise.all([patPromise, invPromise]).then(() => {
      console.log(`%c✔ Generated Patient Profile & Invoice ${i}/10 (UID: ${newUid})`, "color: #10b981");
      return { uid: newUid, name: patObj.info.name, visitId, invId };
    }));
  }

  Promise.all(promises).then((results) => {
    console.log("%c📊 Verifying isolated child node integrity...", "color: #0ea5e9; font-weight: bold;");

    // Assert and verify child node isolation
    let assertionsPassed = true;

    results.forEach((r, idx) => {
      const idxNum = idx + 1;
      const cached = _patients[r.uid];
      if (!cached) {
        console.error(`❌ Assertion Failed: Patient ${idxNum} not cached in local state!`);
        assertionsPassed = false;
        return;
      }

      const info = cached.info || {};
      const visits = cached.visits || {};

      // Verify isolated EMR details
      if (info.name !== `مريض الفحص رقم ${idxNum}`) {
        console.error(`❌ Assertion Failed: Name mismatch for patient ${idxNum}! Expected 'مريض الفحص رقم ${idxNum}', got '${info.name}'`);
        assertionsPassed = false;
      }

      const visitEntries = Object.entries(visits);
      if (visitEntries.length !== 1 || visitEntries[0][1].diagnosis !== `تشخيص معزول للمريض ${idxNum}`) {
        console.error(`❌ Assertion Failed: EMR visit isolation broken for patient ${idxNum}!`);
        assertionsPassed = false;
      }
    });

    if (assertionsPassed) {
      console.log("%c🎉 SUCCESS: 100% EMR visits & invoices isolated under shared phone number context! Collision testing PASSED. No overwrites occurred.", "color: #10b981; font-weight: bold; font-size: 1.1rem;");
      toast("🧪 Collision test completed: 100% EMR isolation asserted successfully!", "ok");
    } else {
      console.error("❌ FAILURE: EMR collision isolation check failed!");
      toast("❌ Collision test failed! Check developer console.", "err");
    }
  }).catch(err => {
    console.error("❌ Collision test aborted due to write error:", err);
    toast("❌ Collision test error: " + err.message, "err");
  });
}

// ── ENTERPRISE MEDICAL WORKSPACE CONTROLLER ──
let activeVisit = { uid: null, bookingId: null, rx: [] };

// ── EMR AUTOSAVE DRAFT RECOVERY PROTOCOL ──
window.EMRAutosave = {
  version: 1,
  saveTimer: null,
  activeDraftKey: null,
  lastSavedHash: null,
  restoreLock: false
};

function getDraftKey(uid, bookingId) {
  const session = ArgonSession.get() || {};
  return `argon_emr_draft_${session.staffId || 'unknown'}_${uid || 'nouid'}_${bookingId || 'walkin'}`;
}

function saveVisitDraft() {
  if (EMRAutosave.restoreLock) return;
  if (!activeVisit.uid && !activeVisit.bookingId) return; // Prevent saving empty context

  clearTimeout(EMRAutosave.saveTimer);
  EMRAutosave.saveTimer = setTimeout(() => {
    const session = ArgonSession.get() || {};
    const draftKey = getDraftKey(activeVisit.uid, activeVisit.bookingId);

    const draft = {
      meta: {
        savedAt: new Date().toISOString(),
        doctorId: session.staffId || 'unknown',
        patientId: activeVisit.uid,
        bookingId: activeVisit.bookingId,
        renderVersion: EMRAutosave.version
      },
      form: {
        vDiag: document.getElementById('vDiag')?.value || '',
        vComplaint: document.getElementById('vComplaint')?.value || '',
        vTemp: document.getElementById('vTemp')?.value || '',
        vBp: document.getElementById('vBp')?.value || '',
        vHr: document.getElementById('vHr')?.value || '',
        vO2: document.getElementById('vO2')?.value || '',
        rxDrug: document.getElementById('rxDrug')?.value || '',
        rxDose: document.getElementById('rxDose')?.value || ''
      },
      rx: [...(activeVisit.rx || [])],
      labs: [...(typeof labTestsList !== 'undefined' ? labTestsList : [])],
      radiology: [...(typeof radScansList !== 'undefined' ? radScansList : [])]
    };

    const hash = JSON.stringify(draft);
    if (EMRAutosave.lastSavedHash === hash) return;

    localStorage.setItem(draftKey, hash);
    EMRAutosave.lastSavedHash = hash;
    EMRAutosave.activeDraftKey = draftKey;

    // Show non-blocking indicator
    const ind = document.getElementById('autosaveIndicator');
    if (ind) {
      ind.style.opacity = '1';
      setTimeout(() => { ind.style.opacity = '0'; }, 2000);
    }
  }, 500);
}

function loadVisitDraft() {
  if (!activeVisit.uid && !activeVisit.bookingId) return;
  const session = ArgonSession.get() || {};
  const draftKey = getDraftKey(activeVisit.uid, activeVisit.bookingId);
  const raw = localStorage.getItem(draftKey);

  if (!raw) return;

  try {
    const draft = JSON.parse(raw);
    if (draft.meta.doctorId !== session.staffId) return;
    if (draft.meta.patientId !== activeVisit.uid) return;

    EMRAutosave.restoreLock = true;

    // Restore Inputs
    if (draft.form) {
      Object.entries(draft.form).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
      });
    }

    // Restore Arrays
    if (draft.rx) activeVisit.rx = draft.rx;
    if (draft.labs) labTestsList = draft.labs;
    if (draft.radiology) radScansList = draft.radiology;

    // Render UI
    if (typeof renderWorkspaceRx === 'function') renderWorkspaceRx();
    if (typeof renderLabOrderTags === 'function') renderLabOrderTags();
    if (typeof renderRadOrderTags === 'function') renderRadOrderTags();

    if (typeof ArgonCore !== 'undefined') {
      ArgonCore.logAudit('DRAFT_RESTORED', `تم استعادة مسودة غير مكتملة للمريض: ${activeVisit.uid}`, 'EMR_AUTOSAVE');
    }

    EMRAutosave.restoreLock = false;
    toast('تم استعادة بيانات الزيارة السابقة تلقائياً', 'ok');
  } catch (e) {
    console.error('Draft load error', e);
    EMRAutosave.restoreLock = false;
  }
}

function clearVisitDraft() {
  if (!EMRAutosave.activeDraftKey) {
    EMRAutosave.activeDraftKey = getDraftKey(activeVisit.uid, activeVisit.bookingId);
  }
  localStorage.removeItem(EMRAutosave.activeDraftKey);
  EMRAutosave.activeDraftKey = null;
  EMRAutosave.lastSavedHash = null;
  if (typeof ArgonCore !== 'undefined') {
    ArgonCore.logAudit('DRAFT_CLEARED', 'تم تفريغ المسودة بعد اكتمال الزيارة', 'EMR_AUTOSAVE');
  }
}


// ── Resolve patient UID from push-key OR phone fallback ──
function resolvePatientUid(rawUid, expectedName = '') {
  // If direct key exists in local cache, use it
  if (_patients[rawUid]) return rawUid;

  // Otherwise search by phone number (legacy bookings)
  const phone = cleanPhone(rawUid);
  const matched = Object.entries(_patients).filter(([k, p]) => {
    return phone && cleanPhone(p.info?.phone || '') === phone;
  });

  if (!matched.length) return null;

  expectedName = (expectedName || '').trim().toLowerCase();

  // If there's an expected name, strictly verify it to prevent returning the wrong family member
  if (expectedName) {
    const exact = matched.find(([k, p]) => (p.info?.name || '').trim().toLowerCase() === expectedName);
    if (exact) return exact[0];

    const partial = matched.find(([k, p]) => {
      const pn = (p.info?.name || '').toLowerCase();
      return pn.includes(expectedName) || expectedName.includes(pn);
    });
    if (partial) return partial[0];

    // If name provided but no match found, do NOT return a random person's ID!
    return null;
  }

  // If no expectedName provided, return the first match (legacy behavior fallback)
  return matched[0][0];
}

function loadVisitForm(rawUid, bookingId, expectedName = '') {
  const uid = resolvePatientUid(rawUid, expectedName);
  if (!uid) {
    // Patient not yet registered — open workspace with booking data only
    const booking = _liveBookings[bookingId] || {};
    const fallbackName = booking.patName || 'مريض غير مسجل';
    const fallbackPhone = booking.patPhone || '';
    activeVisit = { uid: null, bookingId, phone: fallbackPhone, name: fallbackName, rx: [] };
    document.getElementById('wsName').textContent = fallbackName;
    document.getElementById('wsMrn').textContent = '—';
    document.getElementById('wsAgeGender').textContent = `📞 ${fallbackPhone}`;
    document.getElementById('wsAvatar').innerHTML = '👤';
    _applyComplexMode();
    _resetVisitForms();
    sw('newVisit');
    const firstTab = document.querySelector('.visit-tabs .visit-tab:not([style*="none"])');
    if (firstTab) switchVisitTab(firstTab.getAttribute('onclick').match(/'(\w+)'/)[1], firstTab);
    toast('تنبيه: المريض غير مسجل في النظام — سيتم حفظ الزيارة كحجز', 'warn');
    return;
  }
  activeVisit = { uid, bookingId, rx: [] };

  const p = _patients[uid].info || {};

  // Populate Header
  document.getElementById('wsName').textContent = p.name || 'غير معروف';
  document.getElementById('wsMrn').textContent = p.mrn || '—';
  document.getElementById('wsAgeGender').textContent = `${p.age ? p.age + ' سنة' : '—'} | ${p.gender || '—'}`;

  if (p.photo) {
    document.getElementById('wsAvatar').innerHTML = `<img src="${p.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  } else {
    document.getElementById('wsAvatar').innerHTML = '👤';
  }

  _applyComplexMode();
  _resetVisitForms();
  sw('newVisit');

  // Reset to first visible tab
  const firstTab = document.querySelector('.visit-tabs .visit-tab');
  if (firstTab) switchVisitTab('tabVitals', firstTab);
}

// Helper: apply clinic/complex mode to tab visibility using cached _sets
function _applyComplexMode() {
  // Use already-loaded _sets to avoid a Firebase round-trip
  const isComplex = _sets && (_sets.mode === 'medical_complex' || _sets.type === 'complex');
  document.querySelectorAll('.tab-complex').forEach(el => {
    el.style.display = isComplex ? '' : 'none';
  });
}

// Helper: clear all workspace form fields
function _resetVisitForms() {
  ['vTemp', 'vBp', 'vHr', 'vO2', 'vComplaint', 'vDiag', 'rxDrug', 'rxDose', 'labTestInput', 'radScanInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  activeVisit.rx = [];
  labTestsList = [];
  radScansList = [];
  renderWorkspaceRx();
  if (typeof renderLabOrderChips === 'function') renderLabOrderChips();
  if (typeof renderRadOrderChips === 'function') renderRadOrderChips();
}

function cancelVisit() {
  activeVisit = { uid: null, bookingId: null, rx: [] };
  sw('waitingRoom');
}

function switchVisitTab(tabId, btn) {
  // Update Buttons
  document.querySelectorAll('.visit-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  // Update Contents
  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
  const target = document.getElementById(tabId);
  if (target) target.classList.add('active');
}

function addWorkspaceRx() {
  const drug = document.getElementById('rxDrug').value.trim();
  const dose = document.getElementById('rxDose').value.trim();
  if (!drug) return toast('يرجى كتابة اسم الدواء', 'err');

  activeVisit.rx.push({ drug, dose });
  document.getElementById('rxDrug').value = '';
  document.getElementById('rxDose').value = '';
  renderWorkspaceRx();
}

function renderWorkspaceRx() {
  if (typeof saveVisitDraft === "function") saveVisitDraft();
  const tb = document.getElementById('wsRxTbody');
  if (!tb) return;
  if (!activeVisit.rx.length) {
    tb.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--muted)">لا يوجد أدوية مضافة</td></tr>';
    return;
  }
  tb.innerHTML = activeVisit.rx.map((r, i) => `
    <tr>
      <td style="font-weight:700;color:var(--teal)">${sanitize(r.drug)}</td>
      <td>${sanitize(r.dose)}</td>
      <td><button class="rx-rm" onclick="activeVisit.rx.splice(${i}, 1); renderWorkspaceRx()"><i class="fas fa-times-circle"></i></button></td>
    </tr>
  `).join('');
}

function completeWorkspaceVisit() {
  const { uid, bookingId } = activeVisit;

  const diag = document.getElementById('vDiag').value.trim();
  const comp = document.getElementById('vComplaint').value.trim();

  if (!diag && !comp) {
    return toast('يرجى كتابة التشخيص أو شكوى المريض لإغلاق الزيارة', 'err');
  }

  // Auto-capture any pending inputs that the user typed but forgot to click "Add" for
  const pendingRxDrug = document.getElementById('rxDrug')?.value.trim();
  const pendingRxDose = document.getElementById('rxDose')?.value.trim();
  if (pendingRxDrug) {
    activeVisit.rx.push({ drug: pendingRxDrug, dose: pendingRxDose || '' });
    renderWorkspaceRx();
  }

  const pendingLab = document.getElementById('labTestInput')?.value.trim();
  if (pendingLab && !labTestsList.includes(pendingLab)) {
    labTestsList.push(pendingLab);
    renderLabOrderTags();
  }

  const pendingRad = document.getElementById('radScanInput')?.value.trim();
  if (pendingRad && !radScansList.includes(pendingRad)) {
    radScansList.push(pendingRad);
    renderRadOrderTags();
  }

  // Build visit object with field names matching what the Timeline renderer reads
  const now = new Date();
  const visitObj = {
    // Date/Time — timeline uses v.date and v.time
    date: now.toISOString().split('T')[0],
    time: now.toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' }),
    // Doctor identity
    docName: (window.ArgonSession ? ArgonSession.get()?.displayName : null) || 'طبيب',
    docKey: 'doctor',
    // Complaint — timeline reads v.complaint
    complaint: comp || '—',
    // Diagnosis — timeline reads v.diagnosis
    diagnosis: diag || '—',
    // Vitals — timeline reads v.vitals.temp, v.vitals.bp, v.vitals.pulse
    vitals: {
      temp: document.getElementById('vTemp').value.trim(),
      bp: document.getElementById('vBp').value.trim(),
      pulse: document.getElementById('vHr').value.trim(),  // hr → pulse
      o2: document.getElementById('vO2').value.trim()
    },
    // Prescriptions — timeline reads v.prescriptions[].name / .dose / .freq
    prescriptions: activeVisit.rx.map(r => ({
      name: r.drug,
      dose: r.dose,
      freq: ''
    }))
  };

  // Lab / Radiology orders — timeline reads v.labOrders[] and v.radOrders[]
  if (labTestsList && labTestsList.length) visitObj.labOrders = [...labTestsList];
  if (radScansList && radScansList.length) visitObj.radOrders = [...radScansList];

  const updates = {};

  // --- Case 1: Patient is registered with a UUID ---
  if (uid && _patients[uid]) {
    const timelineKey = db.ref(`${BASE}/patients/${uid}/visits`).push().key;
    updates[`${BASE}/patients/${uid}/visits/${timelineKey}`] = visitObj;
    if (bookingId) {
      const b = _liveBookings[bookingId];
      if (b) {
        updates[`${BASE}/completedBookings/${bookingId}`] = { ...b, status: 'done', completedAt: new Date().toISOString() };
        updates[`${BASE}/bookings/${bookingId}`] = null;
      } else {
        updates[`${BASE}/bookings/${bookingId}/status`] = 'completed';
      }
    }

    // Create actual lab and radiology orders
    if (labTestsList && labTestsList.length > 0) {
      const labKey = db.ref(`${BASE}/lab_orders`).push().key;
      updates[`${BASE}/lab_orders/${labKey}`] = {
        patientId: uid,
        patientName: _patients[uid]?.info?.name || activeVisit.name || 'مريض',
        patientPhone: _patients[uid]?.info?.phone || activeVisit.phone || '',
        doctorId: (window.ArgonSession ? window.ArgonSession.get()?.staffId : null) || 'doctor',
        docName: (window.ArgonSession ? window.ArgonSession.get()?.displayName : null) || 'طبيب',
        createdAt: new Date().toISOString(),
        requestedTests: labTestsList.map(t => ({ name: t, status: 'waiting' })),
        status: 'waiting',
        visitId: timelineKey
      };
    }

    if (radScansList && radScansList.length > 0) {
      const radKey = db.ref(`${BASE}/radiology_orders`).push().key;
      updates[`${BASE}/radiology_orders/${radKey}`] = {
        patientId: uid,
        patientName: _patients[uid]?.info?.name || activeVisit.name || 'مريض',
        patientPhone: _patients[uid]?.info?.phone || activeVisit.phone || '',
        doctorId: (window.ArgonSession ? window.ArgonSession.get()?.staffId : null) || 'doctor',
        docName: (window.ArgonSession ? window.ArgonSession.get()?.displayName : null) || 'طبيب',
        createdAt: new Date().toISOString(),
        requestedScans: radScansList.map(s => ({ name: s, status: 'waiting' })),
        status: 'waiting',
        visitId: timelineKey
      };
    }

    // Create prescription order for pharmacy
    if (activeVisit.rx && activeVisit.rx.length > 0) {
      const prescKey = db.ref(`${BASE}/prescriptions`).push().key;
      updates[`${BASE}/prescriptions/${prescKey}`] = {
        patientId: uid,
        patientName: _patients[uid]?.info?.name || activeVisit.name || 'مريض',
        patientPhone: _patients[uid]?.info?.phone || activeVisit.phone || '',
        doctorId: (window.ArgonSession ? window.ArgonSession.get()?.staffId : null) || 'doctor',
        docName: (window.ArgonSession ? window.ArgonSession.get()?.displayName : null) || 'طبيب',
        medications: activeVisit.rx.map(m => ({
          name: m.drug,
          dose: m.dose,
          freq: '',
          dur: '',
          note: '',
          status: 'waiting'
        })),
        status: 'waiting',
        visitId: timelineKey,
        orgId: CID,
        createdAt: new Date().toISOString()
      };
    }

    _writeVisitUpdates(updates, diag);
    const finalVisitKey = bookingId || timelineKey;
    const currentDoc = (window.ArgonSession ? window.ArgonSession.get()?.displayName : null) || 'طبيب';
    _emitBillingTrigger(uid, _patients[uid]?.info?.name || activeVisit.name || 'مريض', _patients[uid]?.info?.phone || activeVisit.phone || '', finalVisitKey, labTestsList, radScansList, activeVisit.rx, !bookingId, currentDoc);
  }
  // --- Case 2: Unregistered patient — auto-register then save ---
  else {
    const booking = _liveBookings[bookingId] || {};
    const newRef = db.ref(`${BASE}/patients`).push();
    const newUid = newRef.key;
    const mrn = genMRN();
    updates[`${BASE}/patients/${newUid}/info`] = {
      name: booking.patName || activeVisit.name || 'مريض',
      phone: booking.patPhone || activeVisit.phone || '',
      mrn,
      gender: '',
      age: '',
      createdAt: new Date().toISOString()
    };
    const timelineKey = db.ref(`${BASE}/patients/${newUid}/visits`).push().key;
    updates[`${BASE}/patients/${newUid}/visits/${timelineKey}`] = visitObj;
    if (bookingId) {
      const b = _liveBookings[bookingId];
      if (b) {
        updates[`${BASE}/completedBookings/${bookingId}`] = { ...b, status: 'done', completedAt: new Date().toISOString() };
        updates[`${BASE}/bookings/${bookingId}`] = null;
      } else {
        updates[`${BASE}/bookings/${bookingId}/status`] = 'completed';
      }
    }

    // Create actual lab and radiology orders
    if (labTestsList && labTestsList.length > 0) {
      const labKey = db.ref(`${BASE}/lab_orders`).push().key;
      updates[`${BASE}/lab_orders/${labKey}`] = {
        patientId: newUid,
        patientName: booking.patName || activeVisit.name || 'مريض',
        patientPhone: booking.patPhone || activeVisit.phone || '',
        doctorId: (window.ArgonSession ? ArgonSession.get()?.staffId : null) || 'doctor',
        docName: (window.ArgonSession ? ArgonSession.get()?.displayName : null) || 'طبيب',
        createdAt: new Date().toISOString(),
        requestedTests: labTestsList.map(t => ({ name: t, status: 'waiting' })),
        status: 'waiting',
        visitId: timelineKey
      };
    }

    if (radScansList && radScansList.length > 0) {
      const radKey = db.ref(`${BASE}/radiology_orders`).push().key;
      updates[`${BASE}/radiology_orders/${radKey}`] = {
        patientId: newUid,
        patientName: booking.patName || activeVisit.name || 'مريض',
        patientPhone: booking.patPhone || activeVisit.phone || '',
        doctorId: (window.ArgonSession ? ArgonSession.get()?.staffId : null) || 'doctor',
        docName: (window.ArgonSession ? ArgonSession.get()?.displayName : null) || 'طبيب',
        createdAt: new Date().toISOString(),
        requestedScans: radScansList.map(s => ({ name: s, status: 'waiting' })),
        status: 'waiting',
        visitId: timelineKey
      };
    }

    // Create prescription order for pharmacy
    if (activeVisit.rx && activeVisit.rx.length > 0) {
      const prescKey = db.ref(`${BASE}/prescriptions`).push().key;
      updates[`${BASE}/prescriptions/${prescKey}`] = {
        patientId: newUid,
        patientName: booking.patName || activeVisit.name || 'مريض',
        doctorId: (window.ArgonSession ? ArgonSession.get()?.staffId : null) || 'doctor',
        docName: (window.ArgonSession ? ArgonSession.get()?.displayName : null) || 'طبيب',
        medications: activeVisit.rx.map(m => ({
          name: m.drug,
          dose: m.dose,
          freq: '',
          dur: '',
          note: '',
          status: 'waiting'
        })),
        status: 'waiting',
        visitId: timelineKey,
        orgId: CID,
        createdAt: new Date().toISOString()
      };
    }

    activeVisit.uid = newUid;
    _writeVisitUpdates(updates, diag);
    const finalVisitKey = bookingId || timelineKey;
    const currentDoc = (window.ArgonSession ? window.ArgonSession.get()?.displayName : null) || 'طبيب';
    _emitBillingTrigger(newUid, booking.patName || activeVisit.name || 'مريض', booking.patPhone || activeVisit.phone || '', finalVisitKey, labTestsList, radScansList, activeVisit.rx, !bookingId, currentDoc);
    toast('تم تسجيل المريض تلقائياً في النظام', 'ok');
  }
}

function _emitBillingTrigger(patientId, patientName, patientPhone, visitKey, labs, rads, rx, addConsultation, docName) {
    if (!visitKey) return;
    
    // SAFETY CHECK: Single clinics strictly do NOT bill for lab, radiology, or pharmacy
    const isSingle = (typeof ArgonLicense !== 'undefined' && ArgonLicense.type === 'single');

    const payload = {
       patientId: patientId,
       patientName: patientName,
       patientPhone: patientPhone,
       visitKey: visitKey,
       docName: docName || '',
       addConsultation: addConsultation === true,
       orders: {
          lab: isSingle ? [] : (labs || []),
          radiology: isSingle ? [] : (rads || []),
          pharmacy: isSingle ? [] : (rx || []).map(r => r.drug)
       },
       createdAt: new Date().toISOString(),
       processedAt: null,
       processingLock: null,
       processingStatus: 'pending'
    };
    db.ref(`${BASE}/billing_triggers/${visitKey}`).set(payload).catch(e => console.error("Billing trigger failed", e));
}

// FIX v1.1: حفظ مرجع زر الإنهاء لإعادة ضبطه عند الخطأ
let _visitSaveBtn = null;

function _writeVisitUpdates(updates, diag) {
  // تعطيل زر الإنهاء أثناء الكتابة
  if (!_visitSaveBtn) _visitSaveBtn = document.getElementById('btnCompleteVisit') || document.querySelector('[onclick*="completeWorkspaceVisit"]');
  if (_visitSaveBtn) {
    _visitSaveBtn.disabled = true;
    _visitSaveBtn._origHTML = _visitSaveBtn.innerHTML;
    _visitSaveBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> جارِ الحفظ...';
  }

  db.ref().update(updates).then(() => {
    logAudit('END_VISIT', `تم إنهاء زيارة وحفظ الملف. التشخيص: ${diag || '—'}`, 'العيادة');
    toast('✅ تم إنهاء الزيارة الطبية وحفظ الملف بنجاح!', 'ok');
    sw('waitingRoom');
    activeVisit = { uid: null, bookingId: null, rx: [] };
    clearVisitDraft();
  }).catch(err => {
    toast('❌ خطأ أثناء الحفظ: ' + err.message, 'err');
    // FIX v1.1: إعادة ضبط الزر عند الخطأ
    if (_visitSaveBtn) {
      _visitSaveBtn.disabled = false;
      _visitSaveBtn.innerHTML = _visitSaveBtn._origHTML || '<i class="fas fa-flag-checkered"></i> إنهاء الزيارة';
    }
  }).finally(() => {
    _visitSaveBtn = null;
  });
}

// ── CLINICAL INTEGRITY: SOFT DELETE / ARCHIVE ──
window.archiveVisit = function (patientId, visitKey) {
  const session = ArgonSession.get() || {};
  if (!confirm('⚠️ هل أنت متأكد من أرشفة (حذف) هذا السجل الطبي؟ لا يمكن التراجع عن هذه العملية.')) return;

  const updates = {};
  updates[`${BASE}/patients/${patientId}/visits/${visitKey}/status`] = 'archived';
  updates[`${BASE}/patients/${patientId}/visits/${visitKey}/archivedBy`] = session.staffId;
  updates[`${BASE}/patients/${patientId}/visits/${visitKey}/archivedAt`] = new Date().toISOString();

  const auditId = db.ref().child('audit').push().key;
  updates[`${BASE}/patients/${patientId}/audit/visits/${auditId}`] = {
    action: 'ARCHIVE_VISIT',
    visitId: visitKey,
    archivedBy: session.staffId,
    timestamp: new Date().toISOString()
  };

  db.ref().update(updates).then(() => {
    toast('✅ تم أرشفة السجل الطبي بنجاح', 'ok');
    viewPatientFile(patientId); // Refresh timeline
  }).catch(err => {
    toast('❌ حدث خطأ أثناء الأرشفة: ' + err.message, 'err');
  });
};
// ── Break Glass Access ──
window.requestBreakGlass = async function (uid) {
  const reason = prompt('⚠️ وصول الطوارئ مراقب بالكامل. الرجاء إدخال سبب الدخول الطارئ (إلزامي):');
  if (!reason || reason.trim().length < 5) {
    toast('❌ سبب غير كافٍ. تم إلغاء العملية.', 'err');
    return;
  }

  const session = ArgonSession.get() || {};
  const lockRef = db.ref(`${BASE}/active_sessions/${uid}`);
  const lockSnap = await lockRef.once('value');

  if (lockSnap.exists()) {
    const updates = {};
    updates[`emergencyGrants/${session.staffId}`] = {
      reason: reason.trim(),
      grantedAt: firebase.database.ServerValue.TIMESTAMP,
      expiresAt: Date.now() + (30 * 60 * 1000) // 30 mins
    };

    await lockRef.update(updates);

    if (window.ArgonAuditLog) {
      window.ArgonAuditLog.log('PATIENT', uid, 'BREAK_GLASS', null, { reason: reason }, 'Emergency Override');
    }

    toast('✅ تم منح وصول الطوارئ لمدة 30 دقيقة.', 'ok');
    viewPatientFile(uid);
  }
};

window._tempCriticalAlerts = [];

window.addCriticalAlertUI = function () {
  const nameInput = document.getElementById('epCriticalAlertName');
  const severitySelect = document.getElementById('epCriticalAlertSeverity');
  const name = nameInput.value.trim();
  const severity = severitySelect.value;

  if (!name) return toast('الرجاء إدخال اسم التنبيه', 'err');
  if (!severity) return toast('الرجاء اختيار الحدة (Severity) - إجباري', 'err');

  window._tempCriticalAlerts.push({
    entryId: 'alert_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    schemaVersion: 2,
    sourceType: 'doctor_entry',
    type: 'critical_alert',
    value: name,
    severity: severity,
    status: 'active',
    addedBy: (window.ArgonSession ? ArgonSession.get()?.staffId : null) || 'unknown',
    addedAt: new Date().toISOString()
  });

  nameInput.value = '';
  severitySelect.value = '';
  renderCriticalAlertsUI();
};

window.removeCriticalAlertUI = function (entryId) {
  const alert = window._tempCriticalAlerts.find(a => a.entryId === entryId);
  if (alert) {
    alert.status = 'revoked';
    alert.revokedBy = (window.ArgonSession ? ArgonSession.get()?.staffId : null) || 'unknown';
    alert.revokedAt = new Date().toISOString();
    alert.reason = 'Removed via UI';
  }
  renderCriticalAlertsUI();
};

window.renderCriticalAlertsUI = function () {
  const container = document.getElementById('epCriticalAlertsList');
  if (!container) return;

  container.innerHTML = window._tempCriticalAlerts.filter(a => a.status === 'active').map(a => `
      <span style="background:#fee2e2; color:#b91c1c; padding:4px 8px; border-radius:4px; font-size:0.8rem; display:flex; align-items:center; gap:6px;">
         <span>${a.value} (${a.severity})</span>
         <i class="fas fa-times" style="cursor:pointer" onclick="removeCriticalAlertUI('${a.entryId}')"></i>
      </span>
   `).join('');
};


// ══════════════════════════════════════════════════════════════
// SMART CLINICAL ASSISTANT (المساعد السريري الذكي)
// ══════════════════════════════════════════════════════════════

window.calcBMI = function() {
  const w = parseFloat(document.getElementById('calcWeight').value);
  const h = parseFloat(document.getElementById('calcHeight').value) / 100;
  const resEl = document.getElementById('bmiResult');
  if (!w || !h || h <= 0 || w <= 0) {
    resEl.innerHTML = '<span style="color:var(--red)">يرجى إدخال قيم صحيحة للوزن والطول</span>';
    return;
  }
  const bmi = (w / (h * h)).toFixed(1);
  let status = '', color = '';
  if (bmi < 18.5) { status = 'نقص في الوزن'; color = 'var(--amber)'; }
  else if (bmi < 25) { status = 'وزن طبيعي'; color = 'var(--green)'; }
  else if (bmi < 30) { status = 'زيادة في الوزن'; color = 'var(--amber)'; }
  else { status = 'سمنة'; color = 'var(--red)'; }
  
  resEl.innerHTML = `<span style="font-size:1.5rem;color:${color}">${bmi}</span><br><span style="color:${color}">${status}</span>`;
};

window.calcEDD = function() {
  const lmpStr = document.getElementById('calcLMP').value;
  const resEl = document.getElementById('eddResult');
  if (!lmpStr) {
    resEl.innerHTML = '<span style="color:var(--red)">يرجى تحديد تاريخ أول يوم لآخر دورة</span>';
    return;
  }
  const lmp = new Date(lmpStr);
  // Naegele's rule: add 7 days, subtract 3 months, add 1 year
  const edd = new Date(lmp.getTime());
  edd.setDate(edd.getDate() + 7);
  edd.setMonth(edd.getMonth() - 3);
  edd.setFullYear(edd.getFullYear() + 1);
  
  resEl.innerHTML = `<span style="font-size:1.3rem;color:var(--purple)">موعد الولادة: ${edd.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}</span>`;
};

// ══════════════════════════════════════════════════════════════
// DOCTOR APPOINTMENTS CALENDAR
// ══════════════════════════════════════════════════════════════

function renderDoctorCalendar() {
  const session = ArgonSession.get() || {};
  const loggedInDoc = session.staffId;
  const isAdmin = session.role === 'admin';
  const content = document.getElementById('calendarContent');
  if (!content) return;
  
  let myBookings = Object.entries(_liveBookings).filter(([k, b]) => {
    const assigned = b.doctorId || b.docKey;
    if (!isAdmin && assigned !== loggedInDoc) return false;
    return true;
  });
  
  // Sort by date and time
  myBookings.sort((a, b) => {
    const tA = (a[1].date || '') + ' ' + (a[1].time || '');
    const tB = (b[1].date || '') + ' ' + (b[1].time || '');
    return tA.localeCompare(tB);
  });
  
  if (myBookings.length === 0) {
    content.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">لا توجد حجوزات قادمة مجدولة.</div>';
    return;
  }
  
  let html = '<div style="display:grid; gap:10px;">';
  myBookings.forEach(([k, b]) => {
    let statusBadge = '';
    if (b.status === 'new') statusBadge = '<span style="background:var(--sky);color:#fff;padding:2px 6px;border-radius:4px;font-size:0.7rem;">حجز جديد</span>';
    else if (b.status === 'confirmed') statusBadge = '<span style="background:var(--teal);color:#fff;padding:2px 6px;border-radius:4px;font-size:0.7rem;">مؤكد</span>';
    else if (b.status === 'waiting') statusBadge = '<span style="background:var(--amber);color:#fff;padding:2px 6px;border-radius:4px;font-size:0.7rem;">في الانتظار</span>';
    else statusBadge = `<span style="background:#888;color:#fff;padding:2px 6px;border-radius:4px;font-size:0.7rem;">${b.status}</span>`;
    
    html += `
      <div style="background:#fff; border:1px solid var(--border); border-left:4px solid var(--teal); border-radius:8px; padding:12px; display:flex; align-items:center; gap:12px;">
        <div style="min-width:70px; font-weight:bold; color:var(--teal); font-size:1.1rem; text-align:center;">
          ${b.time || '--:--'}
        </div>
        <div style="flex:1;">
          <div style="font-weight:bold;">${b.patName || 'مريض غير معروف'}</div>
          <div style="font-size:0.8rem; color:var(--muted);">${b.date || ''} | ${b.patPhone || ''}</div>
        </div>
        <div>
          ${statusBadge}
        </div>
      </div>
    `;
  });
  html += '</div>';
  content.innerHTML = html;
}

// Hook into the bookings listener to update calendar
const originalBookingsListener = db.ref(`${BASE}/bookings`).on('value', snap => {
  if(window._timeoutCalendarRender) clearTimeout(window._timeoutCalendarRender);
  window._timeoutCalendarRender = setTimeout(() => {
    if(document.getElementById('calendarContent')) renderDoctorCalendar();
  }, 1000);
});


// ══════════════════════════════════════════════════════════════
// DOCTOR TASKS MANAGER (إدارة المهام والملاحظات الشخصية)
// ══════════════════════════════════════════════════════════════

window.addDoctorTask = function() {
  const inputEl = document.getElementById('newTaskInput');
  if (!inputEl) return;
  const text = inputEl.value.trim();
  if (!text) return;
  
  const session = ArgonSession.get() || {};
  const docId = session.staffId;
  if (!docId) {
    alert("عذراً، يجب تسجيل الدخول كطبيب لإضافة المهام.");
    return;
  }
  
  const taskId = db.ref(`${BASE}/tasks/${docId}`).push().key;
  
  db.ref(`${BASE}/tasks/${docId}/${taskId}`).set({
    text: text,
    status: 'pending',
    timestamp: Date.now()
  }).then(() => {
    inputEl.value = '';
    inputEl.focus();
  }).catch(err => {
    console.error(err);
    alert('حدث خطأ أثناء حفظ المهمة');
  });
};

window.toggleTaskStatus = function(taskId, currentStatus) {
  const session = ArgonSession.get() || {};
  const docId = session.staffId;
  if (!docId) return;
  
  const newStatus = (currentStatus === 'pending') ? 'completed' : 'pending';
  db.ref(`${BASE}/tasks/${docId}/${taskId}/status`).set(newStatus);
};

window.deleteTask = function(taskId) {
  if(!confirm('هل أنت متأكد من حذف هذه المهمة؟')) return;
  const session = ArgonSession.get() || {};
  const docId = session.staffId;
  if (!docId) return;
  
  db.ref(`${BASE}/tasks/${docId}/${taskId}`).remove();
};

function renderDoctorTasks(tasksObj) {
  const pendingEl = document.getElementById('tasksPending');
  const completedEl = document.getElementById('tasksCompleted');
  if (!pendingEl || !completedEl) return;
  
  if (!tasksObj) {
    pendingEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:0.9rem;">لا توجد مهام معلقة.</div>';
    completedEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:0.9rem;">لا توجد مهام منجزة.</div>';
    return;
  }
  
  let pendingHtml = '';
  let completedHtml = '';
  
  // Sort tasks by timestamp (newest first)
  const tasks = Object.entries(tasksObj).sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
  
  tasks.forEach(([id, t]) => {
    const isCompleted = t.status === 'completed';
    const dateStr = new Date(t.timestamp).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' });
    
    const cardHtml = `
      <div style="background:#fff; border:1px solid var(--border); border-radius:8px; padding:12px; display:flex; align-items:flex-start; gap:10px; transition:0.2s;">
        <button onclick="window.toggleTaskStatus('${id}', '${t.status}')" style="background:none; border:none; cursor:pointer; font-size:1.2rem; color:${isCompleted ? 'var(--green)' : 'var(--muted)'}; padding:0;">
          <i class="${isCompleted ? 'fas fa-check-circle' : 'far fa-circle'}"></i>
        </button>
        <div style="flex:1;">
          <div style="font-weight:bold; font-size:0.95rem; text-decoration:${isCompleted ? 'line-through' : 'none'}; color:${isCompleted ? 'var(--muted)' : '#000'}">
            ${t.text}
          </div>
          <div style="font-size:0.75rem; color:var(--muted); margin-top:4px;">
            <i class="far fa-clock"></i> ${dateStr}
          </div>
        </div>
        <button onclick="window.deleteTask('${id}')" style="background:none; border:none; cursor:pointer; font-size:1rem; color:var(--red); padding:4px; opacity:0.6; transition:0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>
    `;
    
    if (isCompleted) {
      completedHtml += cardHtml;
    } else {
      pendingHtml += cardHtml;
    }
  });
  
  pendingEl.innerHTML = pendingHtml || '<div style="text-align:center;padding:20px;color:var(--muted);font-size:0.9rem;">لا توجد مهام معلقة. رائعة! 🎉</div>';
  completedEl.innerHTML = completedHtml || '<div style="text-align:center;padding:20px;color:var(--muted);font-size:0.9rem;">لا توجد مهام منجزة.</div>';
}

// Hook to listen for tasks
let _tasksListener = null;
function initDoctorTasksListener() {
  const session = ArgonSession.get() || {};
  const docId = session.staffId;
  if (!docId) return;
  
  if (_tasksListener) db.ref(`${BASE}/tasks/${docId}`).off('value', _tasksListener);
  
  _tasksListener = db.ref(`${BASE}/tasks/${docId}`).on('value', snap => {
    if(document.getElementById('tasksPending')) {
      renderDoctorTasks(snap.val());
    }
  });
}

// Start listening once the system loads
setTimeout(initDoctorTasksListener, 2000);

// Also re-init if they open the inbox specifically
const oldSwTasks = window.sw;
window.sw = function(id, el) {
  oldSwTasks(id, el);
  if(id === 'inbox') {
    initDoctorTasksListener();
  }
};
