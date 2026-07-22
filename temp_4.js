
    /* ═══════════════════════════════════════════════════════
       ARGON SYSTEM — Patient Booking Interface v2.0
       Security: Anonymous Auth + Rate Limiting + Input Validation
       ═══════════════════════════════════════════════════════ */

    // ── FIREBASE CONFIG ──
    const FB = {
      apiKey: "AIzaSyCDT_H-1klxbtuVR5n5GOVHKlxcmvY_2GA",
      authDomain: "clinica-system-e71b9.firebaseapp.com",
      databaseURL: "https://clinica-system-e71b9-default-rtdb.firebaseio.com",
      projectId: "clinica-system-e71b9",
      storageBucket: "clinica-system-e71b9.firebasestorage.app",
      messagingSenderId: "833103541884",
      appId: "1:833103541884:web:f8ee6ca4b3d8400cf0fbf9"
    };
    firebase.initializeApp(FB);
    const db = firebase.database();
    const auth = firebase.auth();

    // ── CLINIC ID ──
    const uP = new URLSearchParams(window.location.search);
    let CID = uP.get('id');
    if (!CID) {
      CID = localStorage.getItem('argon_id');
    }
    if (!CID) {
      try {
        const globalList = JSON.parse(localStorage.getItem('clinica_all_bookings_global') || '[]');
        if (globalList.length > 0 && globalList[0].cid) {
          CID = globalList[0].cid;
        }
      } catch (e) {}
    }
    if (!CID) {
      CID = '1';
    }
    localStorage.setItem('argon_id', CID);
    const BASE = 'clinics/' + CID;

    // ── STATE ──
    let clinicSets = {};
    let allDocs = [], selDoc = null, selDate = '', selTime = '';
    let currentKey = null, trkListener = null, curRating = 0;
    let isConn = true, isBooked = false, _anonUid = null;
    let _liveBookings = {}, _liveSlotLocks = {};
    
    // ── MULTI-LANGUAGE (i18n) ENGINE ──
    const i18n = {
      ar: {
        heroTitle: "احجز موعدك<br>بكل سهولة",
        heroSub: "اختر طبيبك، حدد الموعد المناسب، وتمتع بتجربة حجز طبية فائقة السهولة.",
        step1Title: "اختر الطبيب والتخصص", step1Sub: "الرجاء اختيار الطبيب المناسب لحالتك",
        step2Title: "اختر الموعد المناسب", step2Sub: "تأكد من اختيار يوم ووقت يناسبك",
        step3Title: "بيانات المريض", step3Sub: "يرجى تعبئة بياناتك بدقة لتأكيد الحجز",
        searchDoc: "ابحث عن طبيب أو تخصص...", allDocs: "الكل", noDocs: "لا يوجد أطباء",
        closedBtn: "الحجز متوقف حالياً", bookBtn: "احجز موعد", notAvailBtn: "غير متاح",
        selectDateFirst: "اختر تاريخاً أولاً", today: "اليوم",
        patNameLabel: "الاسم الكريم", patNamePh: "مثال: أحمد خالد",
        patNationalIdLabel: "الرقم الوطني / الهوية *", patNationalIdPh: "أدخل الرقم الوطني",
        patAgeLabel: "العمر", patAgePh: "سنة",
        patGenderLabel: "الجنس", genderM: "ذكر", genderF: "أنثى",
        patPhoneLabel: "رقم الهاتف", patPhonePh: "مثال: 0791234567",
        patNotesLabel: "ملاحظات للطبيب (اختياري)", patNotesPh: "أي أعراض أو ملاحظات تود إضافتها...",
        btnBack: "رجوع", btnNext: "متابعة", btnConfirm: "تأكيد الحجز",
        myBookings: "حجوزاتي", bookingNo: "حجز رقم",
        statusNew: "جديد 🔔", statusConf: "مؤكد ✅", statusWait: "بالانتظار ⏳", statusDone: "مكتمل 🏁", statusCancel: "ملغي ❌",
        cancelBookBtn: "إلغاء الحجز", editBookBtn: "تعديل الملاحظات",
        rateExp: "قيم تجربتك مع الطبيب", submitRate: "إرسال التقييم",
        errLimit: "لقد وصلت للحد الأقصى المسموح به (5 حجوزات في الساعة).\\nيرجى الانتظار قليلاً ثم المحاولة مجدداً.",
        errSlot: "قام شخص آخر بحجز هذا الموعد في نفس اللحظة.\\nيرجى اختيار موعد آخر من القائمة المتاحة.",
        errClosed: "استقبال الحجوزات الإلكترونية متوقف مؤقتاً.\\nيرجى المحاولة لاحقاً أو التواصل مع العيادة مباشرة.",
        errData: "⚠️ يرجى التحقق من البيانات المدخلة", errNid: "⚠️ يرجى إدخال رقم وطني صحيح", errSelectDT: "⚠️ يرجى اختيار تاريخ ووقت الحجز",
        succBooked: "✅ تم تأكيد حجزك بنجاح!", succCancel: "✅ تم إلغاء الحجز", succEdit: "✅ تم تحديث بيانات الحجز", succRate: "✅ شكراً لتقييمك!",
        hMetaOpen: "مفتوح الآن", hMetaClosed: "مغلق مؤقتاً",
        sysStopMain: "⛔ الحجز متوقف حالياً", sysStopSub: "نعتذر منكم، العيادة لا تستقبل حجوزات إلكترونية في الوقت الحالي.<br>يرجى التواصل معنا عبر واتساب للمساعدة."
      },
      en: {
        heroTitle: "Book Appointment<br>With Ease",
        heroSub: "Select your doctor, pick a suitable time, and enjoy a seamless booking experience.",
        step1Title: "Select Doctor & Specialty", step1Sub: "Please select the appropriate doctor for your case",
        step2Title: "Select Appointment Time", step2Sub: "Ensure you pick a convenient day and time",
        step3Title: "Patient Details", step3Sub: "Please fill in your details accurately to confirm booking",
        searchDoc: "Search for a doctor or specialty...", allDocs: "All", noDocs: "No doctors found",
        closedBtn: "Booking Suspended", bookBtn: "Book Appointment", notAvailBtn: "Not Available",
        selectDateFirst: "Please select a date first", today: "Today",
        patNameLabel: "Full Name", patNamePh: "e.g., John Doe",
        patAgeLabel: "Age", patAgePh: "Years",
        patGenderLabel: "Gender", genderM: "Male", genderF: "Female",
        patPhoneLabel: "Phone Number", patPhonePh: "e.g., 0791234567",
        patNotesLabel: "Notes for Doctor (Optional)", patNotesPh: "Any symptoms or notes you'd like to add...",
        btnBack: "Back", btnNext: "Continue", btnConfirm: "Confirm Booking",
        myBookings: "My Bookings", bookingNo: "Booking No",
        statusNew: "New 🔔", statusConf: "Confirmed ✅", statusWait: "Waiting ⏳", statusDone: "Completed 🏁", statusCancel: "Cancelled ❌",
        cancelBookBtn: "Cancel Booking", editBookBtn: "Edit Notes",
        rateExp: "Rate your experience", submitRate: "Submit Rating",
        errLimit: "Maximum allowed limit reached (5 bookings per hour).\\nPlease wait a while and try again.",
        errSlot: "Someone else just booked this time slot at the exact same moment.\\nPlease select another available time.",
        errClosed: "Online booking is temporarily suspended.\\nPlease try again later or contact the clinic.",
        errData: "⚠️ Please check the entered data", errSelectDT: "⚠️ Please select a date and time",
        succBooked: "✅ Appointment confirmed successfully!", succCancel: "✅ Booking cancelled", succEdit: "✅ Booking details updated", succRate: "✅ Thank you for your rating!",
        hMetaOpen: "Open Now", hMetaClosed: "Closed",
        sysStopMain: "⛔ Booking Suspended", sysStopSub: "We apologize, but online booking is currently suspended.<br>Please contact us via WhatsApp for assistance."
      },
      fr: {
        heroTitle: "Réservez Votre RDV<br>Facilement",
        heroSub: "Sélectionnez votre médecin, choisissez l'heure, et profitez d'une expérience fluide.",
        step1Title: "Choisir un Médecin", step1Sub: "Veuillez sélectionner le médecin approprié",
        step2Title: "Choisir l'heure", step2Sub: "Sélectionnez un jour et une heure",
        step3Title: "Détails du Patient", step3Sub: "Remplissez vos coordonnées pour confirmer",
        searchDoc: "Rechercher un médecin...", allDocs: "Tous", noDocs: "Aucun médecin trouvé",
        closedBtn: "Réservation fermée", bookBtn: "Prendre RDV", notAvailBtn: "Non Disponible",
        selectDateFirst: "Sélectionnez d'abord une date", today: "Aujourd'hui",
        patNameLabel: "Nom Complet", patNamePh: "ex: Jean Dupont",
        patAgeLabel: "Âge", patAgePh: "Ans",
        patGenderLabel: "Genre", genderM: "Homme", genderF: "Femme",
        patPhoneLabel: "Téléphone", patPhonePh: "ex: 0791234567",
        patNotesLabel: "Notes (Optionnel)", patNotesPh: "Symptômes ou notes supplémentaires...",
        btnBack: "Retour", btnNext: "Continuer", btnConfirm: "Confirmer la Réservation",
        myBookings: "Mes Rendez-vous", bookingNo: "Rendez-vous N°",
        statusNew: "Nouveau 🔔", statusConf: "Confirmé ✅", statusWait: "En Attente ⏳", statusDone: "Terminé 🏁", statusCancel: "Annulé ❌",
        cancelBookBtn: "Annuler", editBookBtn: "Modifier Notes",
        rateExp: "Évaluez votre expérience", submitRate: "Soumettre",
        errLimit: "Limite maximale atteinte (5/heure).\\nVeuillez patienter.",
        errSlot: "Ce créneau vient d'être réservé par quelqu'un d'autre.\\nVeuillez en choisir un autre.",
        errClosed: "La réservation en ligne est suspendue.\\nVeuillez contacter la clinique.",
        errData: "⚠️ Veuillez vérifier les données", errSelectDT: "⚠️ Veuillez sélectionner la date et l'heure",
        succBooked: "✅ Rendez-vous confirmé !", succCancel: "✅ Réservation annulée", succEdit: "✅ Détails mis à jour", succRate: "✅ Merci pour votre évaluation !",
        hMetaOpen: "Ouvert", hMetaClosed: "Fermé",
        sysStopMain: "⛔ Réservation Suspendue", sysStopSub: "Nous sommes désolés, la réservation en ligne est actuellement suspendue.<br>Veuillez nous contacter via WhatsApp."
      }
    };
    
    let curLang = localStorage.getItem('argon_lang_' + CID) || 'ar';
    function T(key) { return (i18n[curLang] && i18n[curLang][key]) || i18n['ar'][key] || key; }
    
    function setLang(lang) {
      curLang = lang;
      localStorage.setItem('argon_lang_' + CID, lang);
      document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
      document.documentElement.lang = lang;
      document.getElementById('langBtn').innerHTML = `🌐 ${lang==='ar'?'العربية':lang==='en'?'English':'Français'}`;
      document.getElementById('langMenu').classList.remove('show');
      
      // Update UI texts dynamically without data-i18n tags for cleaner code
      const q = (sel, txt) => { const el = document.querySelector(sel); if(el) el.innerHTML = txt; };
      q('.hero-title', T('heroTitle')); q('.hero-sub', T('heroSub'));
      q('#s0 .step-title', T('step1Title')); q('#s0 .step-sub', T('step1Sub'));
      q('#s1 .step-title', T('step2Title')); q('#s1 .step-sub', T('step2Sub'));
      q('#s2 .step-title', T('step3Title')); q('#s2 .step-sub', T('step3Sub'));
      
      const sBox = document.getElementById('searchBox'); if(sBox) sBox.placeholder = T('searchDoc');
      const pN = document.getElementById('pName'); if(pN) pN.placeholder = T('patNamePh');
      const pNid = document.getElementById('pNationalId'); if(pNid) pNid.placeholder = T('patNationalIdPh');
      const pA = document.getElementById('pAge'); if(pA) pA.placeholder = T('patAgePh');
      const pP = document.getElementById('pPhone'); if(pP) pP.placeholder = T('patPhonePh');
      const pNo = document.getElementById('pNotes'); if(pNo) pNo.placeholder = T('patNotesPh');
      
      const lbls = document.querySelectorAll('#s1 .fg label');
      if(lbls.length>=5) {
        lbls[0].textContent = T('patNameLabel');
        lbls[1].textContent = T('patNationalIdLabel');
        lbls[2].textContent = T('patPhoneLabel');
        lbls[3].textContent = T('patAgeLabel');
        lbls[4].textContent = T('patGenderLabel');
        if(lbls[5]) lbls[5].textContent = T('patNotesLabel');
      }
      
      q('#genM', T('genderM')); q('#genF', T('genderF'));
      q('#s0Next', T('btnNext')+' <i class="fas fa-chevron-left"></i>');
      q('#s1Next', T('btnNext')+' <i class="fas fa-chevron-left"></i>');
      q('#sendBtn', '<i class="fas fa-check-circle" style="margin-left:6px"></i>'+T('btnConfirm'));
      const backs = document.querySelectorAll('.btn-back');
      if(backs[0]) backs[0].innerHTML = '<i class="fas fa-chevron-right"></i> '+T('btnBack');
      if(backs[1]) backs[1].innerHTML = '<i class="fas fa-chevron-right"></i> '+T('btnBack');
      
      q('#mybtnText', T('myBookings'));
      
      // Re-render dynamic lists
      if(allDocs.length) renderDocs(allDocs);
      if(selDate) buildTimes(selDate, true);
    }
    
    // Close lang menu if clicked outside
    document.addEventListener('click', e => {
      if(!e.target.closest('.lang-sel')) document.getElementById('langMenu').classList.remove('show');
    });
    
    // Init Language
    setLang(curLang);

    // ── RATE LIMIT (client-side guard) ──
    const RATE_KEY = 'argon_rate_' + CID;
    function checkRateLimit() {
      const data = JSON.parse(localStorage.getItem(RATE_KEY) || '{"count":0,"ts":0}');
      const now = Date.now();
      if (now - data.ts > 3600000) { // reset per hour
        localStorage.setItem(RATE_KEY, JSON.stringify({ count: 1, ts: now }));
        return true;
      }
      if (data.count >= 5) { // max 5 bookings/hour
        return false;
      }
      data.count++;
      localStorage.setItem(RATE_KEY, JSON.stringify(data));
      return true;
    }

    // ── INPUT SANITIZER ──
    const sanitize = s => String(s || '').replace(/[<>"'&]/g, '').trim().substring(0, 200);
    const toEngNum = s => String(s).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
    const isPhone = p => /^[0-9+\s\-]{7,15}$/.test(p.trim());
    const isName = n => n.trim().length >= 2 && n.trim().length <= 80;

    // ── ANONYMOUS AUTH & STATS ──
    auth.signInAnonymously().then(r => {
      _anonUid = r.user.uid;
      if (!sessionStorage.getItem('clinica_visited')) {
        db.ref(BASE + '/stats/visitors').transaction(v => (v || 0) + 1);
        sessionStorage.setItem('clinica_visited', '1');
      }
    }).catch(() => { });

    // ── CONNECTION MONITOR ──
    db.ref('.info/connected').on('value', snap => {
      const was = !isConn;
      isConn = snap.val() === true;
      const bar = document.getElementById('connBar');
      if (isConn) {
        bar.className = 'c-ok'; bar.style.display = 'flex';
        bar.innerHTML = curLang === 'ar' ? '<i class="fas fa-wifi"></i> متصل' : '<i class="fas fa-wifi"></i> Connected';
        setTimeout(() => { if (isConn) bar.style.display = 'none'; }, 2000);
        if (was) toast(curLang === 'ar' ? '✅ تم استعادة الاتصال' : '✅ Connection Restored', 'ok');
      } else {
        bar.style.display = 'flex'; bar.className = 'c-off';
        bar.innerHTML = curLang === 'ar' ? '<i class="fas fa-exclamation-triangle"></i> لا يوجد اتصال، جاري المحاولة...' : '<i class="fas fa-exclamation-triangle"></i> Reconnecting...';
      }
    });
    window.addEventListener('offline', () => { isConn = false; db.goOffline(); });
    window.addEventListener('online', () => setTimeout(() => db.goOnline(), 1000));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !isConn) { db.goOffline(); setTimeout(() => db.goOnline(), 1000); } });

    // ── LIVE VISITOR COUNTER (Presence System) ──
    (function initVisitorPresence() {
      const vId = sessionStorage.getItem('argon_vid') || ('v_' + Math.random().toString(36).substr(2, 5));
      sessionStorage.setItem('argon_vid', vId);
      const presRef = db.ref(BASE + '/presence/' + vId);
      
      db.ref('.info/connected').on('value', snap => {
        if (snap.val() === true) {
          presRef.set(true);
          presRef.onDisconnect().remove();
        }
      });
      // Fallback Heartbeat
      setInterval(() => { if(isConn) presRef.set(true); }, 15000);
      window.addEventListener('beforeunload', () => presRef.remove());
    })();

    // ── LIVE CACHE LISTENERS ──
    db.ref(BASE + '/bookings').on('value', snap => {
      _liveBookings = snap.val() || {};
      if (selDate && selDoc) buildTimes(selDate, true); // true = live update (no spinner)
    });
    db.ref(BASE + '/slotLocks').on('value', snap => {
      _liveSlotLocks = snap.val() || {};
      if (selDate && selDoc) buildTimes(selDate, true);
    });

    // ── LOAD SETTINGS ──
    db.ref(BASE + '/settings').on('value', snap => {
      const s = snap.val();
      if (!s) return;
      clinicSets = s;

      const ls = document.getElementById('lockScreen');
      const mc = document.getElementById('mainContent');

      // Suspended (Super Admin) or Closed (Clinic Admin) → Patient sees professional clinic stop screen
      if (s.status === 'suspended' || s.status === 'closed') {
        const waPhone = (s.phone || '').replace(/\D/g, '');
        const waLink  = waPhone ? `https://wa.me/${waPhone}` : null;
        const mainMsg = s.status === 'suspended' ? '⛔ ' + T('sysStopMain') : T('sysStopMain');
        const subMsg  = s.status === 'suspended' 
          ? T('sysStopSub')
          : T('sysStopSub');

        ls.innerHTML = `
          <div style="max-width:440px;margin:auto;text-align:center;padding:20px">
            <div style="margin-bottom:18px">
              ${s.logoUrl
                ? `<img src="${s.logoUrl}" alt="logo" style="width:100px;height:100px;object-fit:contain;border-radius:20px;box-shadow:0 8px 30px rgba(0,0,0,0.4)">`
                : `<div style="font-size:5rem">${s.emoji || '🏥'}</div>`
              }
            </div>
            <div style="font-size:1.9rem;font-weight:900;margin-bottom:10px;color:#fff">${sanitize(s.name || 'ARGON CLINIC')}</div>
            <div style="width:60px;height:3px;background:var(--teal);border-radius:3px;margin:0 auto 24px"></div>
            <div style="font-size:1.1rem;font-weight:700;color:#fff;margin-bottom:12px">${mainMsg}</div>
            <div style="color:rgba(255,255,255,0.65);line-height:1.9;font-size:0.95rem;margin-bottom:32px">
              ${subMsg}
            </div>
            ${waLink ? `
            <a href="${waLink}" target="_blank" style="
              display:inline-flex;align-items:center;gap:10px;
              background:#25d366;color:#fff;
              padding:15px 32px;border-radius:16px;
              font-size:1.05rem;font-weight:800;
              text-decoration:none;
              box-shadow:0 8px 28px rgba(37,211,102,0.35);
              margin-bottom:14px;
            ">
              <i class="fab fa-whatsapp" style="font-size:1.3rem"></i>
              WhatsApp
            </a><br>
            <div style="color:rgba(255,255,255,0.4);font-size:0.8rem;margin-top:8px;font-family:'IBM Plex Mono',monospace">${s.phone}</div>
            ` : ''}
          </div>`;
        ls.classList.add('show');
        mc.style.display = 'none';
        return;
      }

      // 'open' status ensures the page is unlocked
      ls.classList.remove('show');
      mc.style.display = 'block';

      if (s.status === 'open' && !s.is24Hours && s.clinicStart && s.clinicEnd) {
        const now = new Date();
        const curTime = now.getHours() * 60 + now.getMinutes();
        const [sh, sm] = s.clinicStart.split(':').map(Number);
        const [eh, em] = s.clinicEnd.split(':').map(Number);
        const stTime = sh * 60 + sm;
        const enTime = eh * 60 + em;
        
        let isOutside = false;
        if (stTime < enTime) {
          // Normal day shift (e.g., 08:00 to 17:00)
          if (curTime < stTime || curTime >= enTime) isOutside = true;
        } else if (stTime > enTime) {
          // Overnight shift (e.g., 18:00 to 02:00)
          // Outside if current time is between end and start
          if (curTime >= enTime && curTime < stTime) isOutside = true;
        } else {
          // stTime == enTime (24 hours fallback, but handled by is24Hours anyway)
          isOutside = false;
        }

        if (isOutside) {
          const ls = document.getElementById('lockScreen');
          const formatAMPM = (mins) => {
            let h = Math.floor(mins / 60);
            let m = mins % 60;
            let ampm = '';
            if (curLang === 'ar') ampm = h >= 12 ? 'مساءً' : 'صباحاً';
            else if (curLang === 'fr') ampm = h >= 12 ? 'Soir' : 'Matin';
            else ampm = h >= 12 ? 'PM' : 'AM';
            h = h % 12; h = h ? h : 12;
            return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
          };
          
          const outTitle = curLang === 'ar' ? 'خارج أوقات الدوام' : (curLang === 'fr' ? 'Fermé' : 'Outside Working Hours');
          const outSub = curLang === 'ar' 
            ? `أوقات استقبال الحجوزات الرسمية للعيادة تبدأ من الساعة <b style="color:var(--teal)">${formatAMPM(stTime)}</b> وحتى <b style="color:var(--teal)">${formatAMPM(enTime)}</b>.<br>نستقبل حجوزاتكم خلال هذه الأوقات فقط.`
            : (curLang === 'fr' ? `Heures d'ouverture de <b style="color:var(--teal)">${formatAMPM(stTime)}</b> à <b style="color:var(--teal)">${formatAMPM(enTime)}</b>.` : `Working hours are from <b style="color:var(--teal)">${formatAMPM(stTime)}</b> to <b style="color:var(--teal)">${formatAMPM(enTime)}</b>.`);

          ls.innerHTML = `<div class="ls-icon" style="font-size:4.5rem;margin-bottom:10px">🌙</div>
                      <div class="ls-title" style="font-size:2rem;font-weight:900;margin-bottom:12px">${outTitle}</div>
                      <div class="ls-sub" style="color:rgba(255,255,255,0.6);margin-bottom:30px;line-height:1.7">${outSub}</div>
                      <button onclick="openMyBookings(); document.getElementById('lockScreen').classList.remove('show');" style="background:var(--teal);color:#fff;border:none;padding:14px 30px;border-radius:16px;font-family:inherit;font-weight:800;font-size:1rem;cursor:pointer;box-shadow:0 8px 24px rgba(13,148,136,0.3);"><i class="fas fa-calendar-check"></i> ${T('myBookings')}</button>
                      <div style="font-family:'IBM Plex Mono',monospace;font-size:0.6rem;color:rgba(255,255,255,0.3);letter-spacing:4px;margin-top:40px">POWERED BY ARGON SYSTEM</div>`;
          ls.classList.add('show');
          mc.style.display = 'none';
          return;
        }
      }

      ls.classList.remove('show');
      mc.style.display = '';

      document.getElementById('hName').textContent = s.name || 'ARGON';
      if(s.logoUrl) {
        document.getElementById('hLogo').innerHTML = `<img src="${s.logoUrl}" alt="Clinic Logo">`;
      } else {
        document.getElementById('hLogo').textContent = s.emoji || '🏥';
      }
      document.title = (s.name || 'ARGON') + ' | Booking';
      const sc = document.getElementById('statusChip');
      if (s.status === 'closed') {
        sc.className = 'chip c-closed'; sc.innerHTML = `<i class="fas fa-circle" style="font-size:.38rem"></i> ${T('hMetaClosed')}`;
      } else {
        sc.className = 'chip c-open'; sc.innerHTML = `<i class="fas fa-circle" style="font-size:.38rem"></i> ${T('hMetaOpen')}`;
      }
      if (s.clinicStart && s.clinicEnd) {
        document.getElementById('hoursChip').style.display = 'inline-flex';
        document.getElementById('hoursText').textContent = `${s.clinicStart} - ${s.clinicEnd}`;
      } else if (s.hours) {
        document.getElementById('hoursChip').style.display = 'inline-flex';
        document.getElementById('hoursText').textContent = s.hours;
      }
      if (s.color) {
        document.documentElement.style.setProperty('--teal', s.color);
        document.documentElement.style.setProperty('--teal-dark', s.color);
        const tm = document.querySelector('meta[name="theme-color"]');
        if (tm) tm.content = s.color;
      }
      document.getElementById('manifest-color')?.setAttribute('content', s.color || '#0d9488');
    });

    let allDepts = [];
    let curDept = 'all';
    let curSpec = 'all';

    // ── LOAD DEPARTMENTS ──
    db.ref(BASE + '/departments').on('value', snap => {
      const depts = snap.val() || {};
      allDepts = Object.entries(depts).map(([k, v]) => ({ key: k, ...v }));
      buildFilters();
    });

    // ── LOAD DOCTORS ──
    db.ref(BASE + '/doctors').on('value', snap => {
      const d = snap.val() || {};
      allDocs = Object.entries(d).map(([k, v]) => ({ key: k, ...v }));
      renderDocs(allDocs);
      buildFilters();
      // Update local count
      const myB = JSON.parse(localStorage.getItem('clinica_bks_' + CID) || '[]');
      document.getElementById('mybtnCnt').textContent = myB.length;
      
      // If a doctor is currently selected, update their data and re-render slots seamlessly
      if (selDoc) {
        const updatedDoc = allDocs.find(x => x.key === selDoc.key);
        if (updatedDoc) {
          selDoc = updatedDoc;
          if (selDate) buildTimes(selDate, true);
        } else {
          closeModal('bookModal');
        }
      }
    });

    function buildFilters() {
      const bar = document.getElementById('specBar');
      if (!bar) return;
      if (clinicSets && clinicSets.mode === 'medical_complex') {
        const deptChips = allDepts.map((d) => {
          const isAct = curDept === d.key;
          return `
            <div class="spec-chip${isAct ? ' act' : ''}" style="${isAct ? `background:${d.color || 'var(--teal)'};border-color:${d.color || 'var(--teal)'};color:#fff` : `border-color:rgba(13,148,136,0.15)`}" onclick="filterByDept('${d.key}',this)">
              <span style="margin-left:4px">${d.emoji || '🏢'}</span> ${sanitize(d.name)}
            </div>
          `;
        }).join('');
        
        bar.innerHTML = `
          <div class="spec-chip${curDept === 'all' ? ' act' : ''}" onclick="filterByDept('all',this)">🩺 الكل</div>
          ${deptChips}
        `;
      } else {
        const specs = ['all', ...new Set(allDocs.map(d => d.specialty).filter(Boolean))];
        bar.innerHTML = specs.map((s) => `
          <div class="spec-chip${curSpec === s ? ' act' : ''}" onclick="filterBySpec('${sanitize(s)}',this)">
            ${s === 'all' ? '🩺 الكل' : s}
          </div>`).join('');
      }
    }

    function filterByDept(deptId, el) {
      curDept = deptId;
      document.querySelectorAll('.spec-chip').forEach(c => {
        c.classList.remove('act');
        c.style.background = '';
        c.style.borderColor = '';
        c.style.color = '';
      });
      el.classList.add('act');
      
      // Apply department color if active
      if (deptId !== 'all') {
        const dept = allDepts.find(d => d.key === deptId);
        if (dept && dept.color) {
          el.style.background = dept.color;
          el.style.borderColor = dept.color;
          el.style.color = '#fff';
        }
      }
      
      applyComplexFilter();
    }

    function filterBySpec(spec, el) {
      curSpec = spec;
      document.querySelectorAll('.spec-chip').forEach(c => c.classList.remove('act'));
      el.classList.add('act');
      applyComplexFilter();
    }

    function filterDocs() {
      applyComplexFilter();
    }

    function applyComplexFilter() {
      const q = document.getElementById('searchBox').value.toLowerCase().trim();
      let f = allDocs;
      
      if (clinicSets && clinicSets.mode === 'medical_complex') {
        if (curDept !== 'all') {
          f = f.filter(d => d.departmentId === curDept);
        }
      } else {
        if (curSpec !== 'all') {
          f = f.filter(d => d.specialty === curSpec);
        }
      }
      
      if (q) {
        f = f.filter(d => 
          (d.name || '').toLowerCase().includes(q) || 
          (d.specialty || '').toLowerCase().includes(q)
        );
      }
      
      renderDocs(f);
    }

    function renderDocs(docs) {
      const g = document.getElementById('docsGrid');
      if (!docs.length) { g.innerHTML = `<div class="empty" style="grid-column:1/-1"><i class="fas fa-user-md"></i><p>${T('noDocs')}</p></div>`; return; }
      const isClosed = clinicSets.status === 'closed';
      g.innerHTML = docs.map(d => {
        const avail = d.available !== false && !isClosed;
        const btnLabel = isClosed ? T('closedBtn') : (d.available !== false ? T('bookBtn') : T('notAvailBtn'));
        
        // Artistic Rating Display
        const avg = d.avgRating ? Number(d.avgRating).toFixed(1) : '0.0';
        const rCnt = d.ratingCount || 0;
        const stars = '★'.repeat(Math.floor(avg)) + '☆'.repeat(5 - Math.floor(avg));

        return `
    <div class="dcard" onclick="${avail ? `pickDoc('${d.key}')` : ''}">
      <div class="dcard-top">
        ${d.img ? `<img src="${d.img}" alt="${d.name}" onerror="this.parentElement.innerHTML='<span style=font-size:2.8rem>${d.emoji || '👨‍⚕️'}</span>'">` : `<span>${d.emoji || '👨‍⚕️'}</span>`}
        <div class="avail-dot ${avail ? 'av-yes' : 'av-no'}"></div>
      </div>
      <div class="dcard-body">
        <div class="dname">د. ${sanitize(d.name)}</div>
        <div class="dspec">${sanitize(d.specialty || '')}</div>
        <div style="display:flex;align-items:center;gap:6px;margin:4px 0">
          <div style="font-size:0.75rem;color:var(--amber);letter-spacing:1px">${stars}</div>
          <span style="font-size:0.65rem;color:var(--muted);font-weight:700">${avg} (${rCnt})</span>
        </div>
        <div class="dfee">${parseFloat(d.fee || 0).toFixed(2)} د.أ</div>
        <button class="dbookbtn" ${avail ? '' : `disabled`} onclick="event.stopPropagation();pickDoc('${d.key}')">
          <i class="fas fa-${isClosed ? 'pause-circle' : 'calendar-plus'}"></i>${btnLabel}
        </button>
      </div>
    </div>`;
      }).join('');
    }

    // ── PICK DOCTOR ──
    function pickDoc(key) {
      const d = allDocs.find(x => x.key === key);
      if (!d || d.available === false) return;
      selDoc = d; selDate = ''; selTime = '';
      document.getElementById('dp-icon').textContent = d.emoji || '👨‍⚕️';
      document.getElementById('dp-name').textContent = 'د. ' + sanitize(d.name);
      document.getElementById('dp-spec').textContent = sanitize(d.specialty || '');
      document.getElementById('dp-fee').textContent = parseFloat(d.fee || 0).toFixed(2) + ' د.أ';
      document.getElementById('s0Next').disabled = true;
      buildDates();
      goStep(0);
      openModal('bookModal');
    }

    // ── DATE SLOTS ──
    function buildDates() {
      const r = document.getElementById('dateRow');
      const today = new Date(); today.setHours(0, 0, 0, 0);
      let DAY_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
      if(curLang === 'en') DAY_AR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      if(curLang === 'fr') DAY_AR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
      let html = '';

      const allowSameDay = clinicSets.sameDayBooking !== false;
      const daysToShow = clinicSets.bookingDays || 14;
      const startOff = allowSameDay ? 0 : 1;

      const docWorkDays = (selDoc && selDoc.workDays) || [0, 1, 2, 3, 4, 6];
      let renderedDays = 0;
      let checkOffset = 0;
      
      while (renderedDays < daysToShow && checkOffset < 60) {
        const d = new Date(today); d.setDate(today.getDate() + startOff + checkOffset);
        checkOffset++;
        
        // Skip days the doctor is not on duty
        if (!docWorkDays.includes(d.getDay())) {
          continue;
        }
        
        const localD = new Date(d.getTime() - (d.getTimezoneOffset() * 60000));
        const ds = localD.toISOString().split('T')[0];
        const dn = DAY_AR[d.getDay()];
        const isToday = ds === new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        
        html += `<div class="d-chip" id="dc-${ds}" onclick="pickDate('${ds}',this)">
          <div class="d-day">${isToday ? T('today') : dn}</div>
          <div class="d-num">${d.getDate()}</div>
        </div>`;
        renderedDays++;
      }
      
      r.innerHTML = html;
      document.getElementById('timeGrid').innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--muted);font-size:0.82rem;padding:12px">${T('selectDateFirst')}</div>`;
    }

    async function pickDate(ds, el) {
      selDate = ds; selTime = '';
      document.getElementById('s0Next').disabled = true;
      document.querySelectorAll('.d-chip').forEach(c => c.classList.remove('sel'));
      el.classList.add('sel');
      await buildTimes(ds);
    }

    async function buildTimes(ds, isLiveUpdate = false) {
      const tg = document.getElementById('timeGrid');
      if (!isLiveUpdate) {
        tg.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:12px"><i class="fas fa-spinner fa-spin" style="color:var(--teal)"></i></div>`;
      }
      const doc = selDoc;
      const ws = doc.workStart || '09:00', we = doc.workEnd || '17:00', sm = doc.slotDuration || 30;
      const [sh, smm] = ws.split(':').map(Number), [eh, emm] = we.split(':').map(Number);
      let cur = sh * 60 + smm; const end = eh * 60 + emm;

      // Use live caches instead of fetching
      const bookedSet = new Set();
      
      // Add confirmed bookings
      Object.values(_liveBookings).forEach(b => {
        if (b.docKey === doc.key && b.date === ds && b.status !== 'cancelled') {
          bookedSet.add(b.time);
        }
      });
      // Add active slot locks for this doctor+date
      Object.entries(_liveSlotLocks).forEach(([key, val]) => {
        // key format: {docKey}_{date}_{time-with-dash}
        const prefix = `${doc.key}_${ds}_`;
        if (key.startsWith(prefix)) {
          const timePart = key.replace(prefix, '').replace('-', ':');
          bookedSet.add(timePart);
        }
      });

      const now = new Date(); const nowMins = now.getHours() * 60 + now.getMinutes();
      const isToday = ds === new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
      const slots = [];
      while (cur + sm <= end) {
        const hh = String(Math.floor(cur / 60)).padStart(2, '0'), mm = String(cur % 60).padStart(2, '0');
        slots.push(`${hh}:${mm}`);
        cur += sm;
      }
      if (!slots.length) { 
        const noTimes = curLang === 'ar' ? 'لا توجد أوقات متاحة' : (curLang === 'fr' ? 'Aucun créneau disponible' : 'No available times');
        tg.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--muted);font-size:0.82rem;padding:12px">${noTimes}</div>`; 
        return; 
      }

      tg.innerHTML = slots.map(t => {
        const [th, tm] = t.split(':').map(Number); const tMins = th * 60 + tm;
        const isBooked = bookedSet.has(t);
        const isPast = isToday && tMins <= nowMins;
        const cls = isBooked ? 'bkd' : isPast ? 'past' : '';
        const clickable = !isBooked && !isPast;
        const bookedLbl = curLang === 'ar' ? 'محجوز' : (curLang === 'fr' ? 'Réservé' : 'Booked');
        return `<div class="t-chip ${cls}" id="tc-${t}" ${clickable ? `onclick="pickTime('${t}',this)"` : ''}>
      ${t}${isBooked ? `<br><small>${bookedLbl}</small>` : ''}
    </div>`;
      }).join('');
    }

    function pickTime(t, el) {
      selTime = t;
      document.querySelectorAll('.t-chip').forEach(c => c.classList.remove('sel'));
      el.classList.add('sel');
      document.getElementById('s0Next').disabled = false;
    }

    // ── STEPS ──
    function goStep(n) {
      [0, 1, 2, 3].forEach(i => {
        const el = document.getElementById('s' + i);
        if (el) el.style.display = i === n ? 'block' : 'none';
      });
      // Update step indicators
      [0, 1, 2].forEach(i => {
        const si = document.getElementById('si' + i);
        if (si) si.className = 'si' + (i === n ? ' on' : '');
      });
      const titles = ['📅 اختر موعدك', '👤 بيانات المريض', '🧾 مراجعة وتأكيد'];
      if (titles[n]) document.getElementById('sheetTitle').textContent = titles[n];
      if (n === 2) buildBill();
    }

    function buildBill() {
      const d = selDoc;
      const name = sanitize(document.getElementById('pName').value);
      const notes = sanitize(document.getElementById('pNotes').value);
      document.getElementById('billBox').innerHTML = `
    <div class="brow"><span class="bl">الطبيب</span><span class="bv">د. ${sanitize(d.name)}</span></div>
    <div class="brow"><span class="bl">التخصص</span><span class="bv">${sanitize(d.specialty || '—')}</span></div>
    <div class="brow"><span class="bl">التاريخ</span><span class="bv" style="font-family:'IBM Plex Mono',monospace">${selDate}</span></div>
    <div class="brow"><span class="bl">الوقت</span><span class="bv" style="font-family:'IBM Plex Mono',monospace">${selTime}</span></div>
    <div class="brow"><span class="bl">المريض</span><span class="bv">${name}</span></div>
    ${notes ? `<div class="brow" style="flex-direction:column;align-items:flex-start;gap:4px"><span class="bl">ملاحظات</span><span class="bv" style="font-size:.82rem;word-wrap:break-word;overflow-wrap:anywhere;white-space:pre-wrap;max-width:100%">${notes}</span></div>` : ''}
    <div class="btotal"><span class="bl">رسوم الكشف</span><span class="bv">${parseFloat(d.fee || 0).toFixed(2)} د.أ</span></div>`;
    }

    // ── VALIDATE STEP 1 ──
    function validateStep1() {
      const name  = document.getElementById('pName').value.trim();
      const phone = toEngNum(document.getElementById('pPhone').value).trim();
      const rawNid = toEngNum(document.getElementById('pNationalId').value).replace(/\D/g, '').trim();
      const _dobVal   = document.getElementById('pDob')?.value || '';

      let ok = true;

      // ── الاسم ──
      if (!isName(name)) {
        document.getElementById('pName').classList.add('err');
        document.getElementById('pNameErr').style.display = 'block';
        ok = false;
      } else {
        document.getElementById('pName').classList.remove('err');
        document.getElementById('pNameErr').style.display = 'none';
      }

      // ── الهاتف ──
      if (!isPhone(phone)) {
        document.getElementById('pPhone').classList.add('err');
        document.getElementById('pPhoneErr').style.display = 'block';
        ok = false;
      } else {
        document.getElementById('pPhone').classList.remove('err');
        document.getElementById('pPhoneErr').style.display = 'none';
      }

      // ── الرقم الوطني: 3 شروط ──
      //   1. طوله 9+ أرقام
      //   2. ليس كله أصفاراً (00000000)
      //   3. ليس تاريخ ميلاد مكتوب بدون شرطات (19991231)
      const nidErr = document.getElementById('pNationalIdErr');
      const nidInp = document.getElementById('pNationalId');

      const isAllZeros = /^0+$/.test(rawNid);
      const looksLikeBirthdate = rawNid.length === 8 && /^(19|20)\d{6}$/.test(rawNid);

      if (rawNid.length < 9) {
        nidInp.classList.add('err');
        nidErr.textContent = 'الرقم الوطني يجب أن لا يقل عن 9 أرقام';
        nidErr.style.display = 'block';
        ok = false;
      } else if (isAllZeros) {
        nidInp.classList.add('err');
        nidErr.textContent = '⚠️ الرقم الوطني لا يمكن أن يكون أصفاراً';
        nidErr.style.display = 'block';
        ok = false;
      } else if (looksLikeBirthdate) {
        nidInp.classList.add('err');
        nidErr.textContent = '⚠️ يبدو هذا تاريخ ميلاد — الرجاء إدخال الرقم الوطني الصحيح';
        nidErr.style.display = 'block';
        ok = false;
      } else {
        nidInp.classList.remove('err');
        nidErr.style.display = 'none';
      }

            // تاريخ الميلاد اختياري — لكن إن أُدخل يجب أن يكون صحيحاً
      const _dobCheck = window.ArgonValidateDOB(_dobVal);
      const _dobInp   = document.getElementById('pDob');
      const _dobErr   = document.getElementById('pDobErr');
      if (_dobVal && !_dobCheck.ok) {
        _dobInp?.classList.add('err');
        if (_dobErr) { _dobErr.textContent = _dobCheck.msg; _dobErr.style.display = 'block'; }
        ok = false;
      } else {
        _dobInp?.classList.remove('err');
        if (_dobErr) _dobErr.style.display = 'none';
      }

      if (ok) goStep(2);
    }
    document.getElementById('s1').querySelectorAll && document.querySelectorAll && (function () {
      // Attach validation to step 1 next button
      const s1btn = document.querySelector('#s1 .btn-next');
      if (s1btn) { s1btn.onclick = validateStep1; }
    })();

    // ── SEND BOOKING (Atomic / Race-condition proof) ──
    let sending = false;
    function sendBooking() {
      if (sending) return;
      if (!checkRateLimit()) {
        toast(T('errLimit'), 'err');
        return;
      }
      if (clinicSets && clinicSets.status !== 'open') { toast(T('errClosed'), 'err'); return; }
      if (!selDoc || !selDate || !selTime) { toast(T('errSelectDT'), 'err'); return; }

      const name = sanitize(document.getElementById('pName').value);
      const phone = sanitize(toEngNum(document.getElementById('pPhone').value));
      const _nidFinal = sanitize(toEngNum(document.getElementById('pNationalId').value).replace(/\D/g, ''));
      const _dobValFinal = document.getElementById('pDob')?.value || '';

      // المزيد من التحقق الأمني قبل الإرسال
      if (!isName(name) || !isPhone(phone)) { toast(T('errData'), 'err'); return; }
      if (_nidFinal.length < 9 || /^0+$/.test(_nidFinal)) {
        toast(T('errNid') || '⚠️ يرجى إدخال رقم وطني صحيح', 'err');
        return;
      }

      sending = true;
      const btn = document.getElementById('sendBtn');
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...';
      btn.disabled = true;

      // ══════════════════════════════════════════════════════════
      // STEP 1: Atomically LOCK the slot (prevents double-booking)
      // If two patients click at the same millisecond, Firebase
      // Transaction guarantees only ONE succeeds.
      // ══════════════════════════════════════════════════════════
      const slotKey = `${selDoc.key}_${selDate}_${selTime.replace(':', '-')}`;
      const slotRef = db.ref(BASE + '/slotLocks/' + slotKey);

      slotRef.transaction(currentValue => {
        // If slot already locked → ABORT (return undefined)
        if (currentValue !== null) return undefined;
        // Slot is free → LOCK IT
        return { at: Date.now(), uid: _anonUid || 'guest' };
      }).then(result => {
        if (!result.committed) {
          // ✋ Someone else booked this slot a split second before us
          toast(T('errSlot'), 'err');
          sending = false;
          btn.innerHTML = '<i class="fas fa-check-circle" style="margin-left:8px"></i> ' + T('btnConfirm');
          btn.disabled = false;
          // Refresh slots so the taken slot shows as booked
          buildTimes(selDate);
          return Promise.reject('SLOT_TAKEN');
        }

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...';

        // ══════════════════════════════════════════════════════
        // STEP 2: Get unique daily booking number (atomic)
        // Transaction ensures #D01, #D02... never duplicate
        // ══════════════════════════════════════════════════════
        return db.ref(BASE + '/dailyCounters/' + selDate)
          .transaction(cur => (cur || 0) + 1);

      }).then(counterResult => {
        if (!counterResult) return Promise.reject('SLOT_TAKEN');

        const bno = '#D' + String(counterResult.snapshot.val()).padStart(2, '0');

        const booking = {
          bookNo: bno,
          slotKey: slotKey, // stored so we can release lock on cancel
          docKey: selDoc.key, docName: sanitize(selDoc.name), docSpec: sanitize(selDoc.specialty || ''),
          patName: name, patPhone: phone, patNationalId: _nidFinal,
          patDob: sanitize(_dobValFinal),
          patAge: _dobValFinal ? String(window.ArgonCalcAge(_dobValFinal) || '') : '',
          patGender: sanitize(document.getElementById('pGender').value),
          notes: sanitize(document.getElementById('pNotes').value),
          date: selDate, time: selTime,
          fee: parseFloat(selDoc.fee || 0).toFixed(2),
          status: 'new',
          createdAt: new Date().toISOString(),
          anonUid: _anonUid || 'guest'
        };

        // Increment lifetime stats counter
        db.ref(BASE + '/stats/totalBookings').transaction(c => (c || 0) + 1).catch(() => {});

        return db.ref(BASE + '/bookings').push(booking).then(ref => ({ ref, bno, booking }));

      }).then(({ ref, bno, booking }) => {
        currentKey = ref.key;
        document.getElementById('sno').textContent = bno;
        const dL = curLang === 'ar' ? 'الطبيب' : (curLang === 'fr' ? 'Médecin' : 'Doctor');
        const dtL = curLang === 'ar' ? 'التاريخ' : (curLang === 'fr' ? 'Date' : 'Date');
        const tL = curLang === 'ar' ? 'الوقت' : (curLang === 'fr' ? 'Heure' : 'Time');
        const fL = curLang === 'ar' ? 'الرسوم' : (curLang === 'fr' ? 'Frais' : 'Fee');
        document.getElementById('sinfo').innerHTML = `
          <div class="sinfo-row"><span class="lbl">👨‍⚕️ ${dL}</span><span style="font-weight:800">د. ${sanitize(selDoc.name)}</span></div>
          <div class="sinfo-row"><span class="lbl">📅 ${dtL}</span><span style="font-weight:800">${selDate}</span></div>
          <div class="sinfo-row"><span class="lbl">🕐 ${tL}</span><span style="font-weight:800">${selTime}</span></div>
          <div class="sinfo-row"><span class="lbl">💰 ${fL}</span><span>${booking.fee}</span></div>`;
        startTracking(ref.key);
        saveLocal(ref.key, bno);
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#0d9488', '#0ea5e9', '#ffffff'] });
        const myB = JSON.parse(localStorage.getItem('clinica_bks_' + CID) || '[]');
        document.getElementById('mybtnCnt').textContent = myB.length;
        sending = false;
        isBooked = true;
        goStep(3);
        btn.innerHTML = '<i class="fas fa-check-circle" style="margin-left:8px"></i> تأكيد الحجز';
        btn.disabled = false;

      }).catch(err => {
        if (err === 'SLOT_TAKEN') return; // already handled above
        // ════════════════════════════════════════════
        // On any error → RELEASE the slot lock
        // so the slot doesn't stay locked forever
        // ════════════════════════════════════════════
        slotRef.remove().catch(() => {});
        
        let errMsg = err.message || String(err);
        let userTitle = '⚠️ لم يكتمل الحجز';
        let userBody = 'حدث خطأ أثناء محاولة تأكيد الحجز. يرجى التأكد من اتصالك بالإنترنت والمحاولة مجدداً.';
        
        if (errMsg.includes('PERMISSION_DENIED') || errMsg.includes('permission_denied')) {
            userBody = 'تم رفض الحجز بسبب سياسات الحماية. تأكد من إدخال بياناتك بشكل صحيح (الاسم الكامل، رقم الهاتف الصالح، والرقم الوطني).';
        } else if (errMsg.includes('network') || errMsg.includes('offline') || errMsg.includes('Failed to fetch')) {
            userBody = 'يبدو أنك غير متصل بالإنترنت أو الاتصال ضعيف. يرجى التحقق من الشبكة والمحاولة مجدداً.';
        } else if (errMsg.includes('timeout')) {
            userBody = 'انتهى وقت الاتصال بالخادم. يرجى المحاولة مرة أخرى.';
        } else {
            userBody = `عذراً، فشل النظام في معالجة طلبك لأسباب تقنية. (الكود: ${errMsg.substring(0,50)})`;
        }
        
        showErrModal('❌', userTitle, userBody);
        
        sending = false;
        btn.innerHTML = '<i class="fas fa-check-circle" style="margin-left:8px"></i> ' + T('btnConfirm');
        btn.disabled = false;
      });
    }

    // ── TRACKING ──
    function startTracking(key) {
      if (trkListener && currentKey) db.ref(BASE + '/bookings/' + currentKey).off('value', trkListener);
      const statusMap = { new: 0, confirmed: 1, waiting: 2, done: 3, completed: 3 };
      const labelMap = { new: T('statusNew'), confirmed: T('statusConf'), waiting: T('statusWait'), done: T('statusDone'), completed: T('statusDone'), cancelled: T('statusCancel') };
      trkListener = db.ref(BASE + '/bookings/' + key).on('value', snap => {
        const v = snap.val();
        if (!v) { // moved to completed
          db.ref(BASE + '/completedBookings/' + key).once('value').then(cs => {
            if (cs.exists()) {
              updateTrack('done');
              document.getElementById('ratingBox').style.display = 'block';
            }
          });
          return;
        }
        updateTrack(v.status || 'new');
        if (v.status === 'done' || v.status === 'completed') document.getElementById('ratingBox').style.display = 'block';
      });
      function updateTrack(st) {
        const idx = statusMap[st] || 0;
        document.getElementById('trkProg').style.width = (idx / 3 * 100) + '%';
        document.getElementById('trkTxt').textContent = labelMap[st] || '...';
        [0, 1, 2, 3].forEach(i => {
          const el = document.getElementById('ts' + i);
          el.classList.toggle('on', i <= idx);
          el.classList.toggle('done-st', i < idx);
        });
      }
    }

    // ── RATING ──
    function setStar(n) {
      curRating = n;
      document.querySelectorAll('.star').forEach((s, i) => s.classList.toggle('on', i < n));
      document.getElementById('rateBtn').style.display = 'block';
    }
    function sendRating() {
      if (!curRating || !currentKey) return;
      const btn = document.getElementById('rateBtn');
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';
      btn.disabled = true;

      const p1 = db.ref(BASE + '/bookings/' + currentKey).once('value');
      const p2 = db.ref(BASE + '/completedBookings/' + currentKey).once('value');

      Promise.all([p1, p2]).then(snaps => {
        let bData = null, path = '';
        if (snaps[0].exists()) { bData = snaps[0].val(); path = '/bookings/'; }
        else if (snaps[1].exists()) { bData = snaps[1].val(); path = '/completedBookings/'; }

        if (bData) {
          db.ref(BASE + path + currentKey).update({ rating: curRating });
          const dk = bData.docKey;
          if (dk) {
            // High-performance Transaction for live averaging
            db.ref(BASE + '/doctors/' + dk).transaction(doc => {
              if (doc) {
                const oldR = doc.avgRating || 0;
                const oldC = doc.ratingCount || 0;
                const newC = oldC + 1;
                doc.avgRating = ((oldR * oldC) + curRating) / newC;
                doc.ratingCount = newC;
              }
              return doc;
            });
          }
          document.getElementById('ratingBox').innerHTML = '<div style="color:var(--green);font-weight:800;text-align:center;padding:15px;background:rgba(16,185,129,0.05);border-radius:12px">✅ شكراً على تقييمك! ⭐</div>';
          toast('✅ تم إرسال تقييمك بنجاح', 'ok');
        } else {
          toast('❌ لم يتم العثور على بيانات الحجز', 'err');
          btn.innerHTML = 'إرسال التقييم';
          btn.disabled = false;
        }
      }).catch(e => {
        toast('❌ حدث خطأ أثناء الإرسال', 'err');
        btn.innerHTML = 'إرسال التقييم';
        btn.disabled = false;
      });
    }

    // ── LOCAL STORAGE ──
    function saveLocal(key, no) {
      const newItem = { key, no, docName: selDoc.name, date: selDate, time: selTime, ts: Date.now(), cid: CID };
      
      // Clinic-specific list
      let list = JSON.parse(localStorage.getItem('clinica_bks_' + CID) || '[]');
      list.unshift(newItem);
      if (list.length > 10) list = list.slice(0, 10);
      localStorage.setItem('clinica_bks_' + CID, JSON.stringify(list));
      
      // Global cross-clinic list (keeps up to 30 items)
      let globalList = JSON.parse(localStorage.getItem('clinica_all_bookings_global') || '[]');
      globalList.unshift(newItem);
      if (globalList.length > 30) globalList = globalList.slice(0, 30);
      localStorage.setItem('clinica_all_bookings_global', JSON.stringify(globalList));
    }

    // ── SHOW BOOKING DETAILS & LIVE TRACKING ──
    function showBookingDetails(key, bno, docName, date, time, fee) {
      closeModal('myModal');
      currentKey = key;
      document.getElementById('sno').textContent = bno;
      
      const dL = curLang === 'ar' ? 'الطبيب' : (curLang === 'fr' ? 'Médecin' : 'Doctor');
      const dtL = curLang === 'ar' ? 'التاريخ' : (curLang === 'fr' ? 'Date' : 'Date');
      const tL = curLang === 'ar' ? 'الوقت' : (curLang === 'fr' ? 'Heure' : 'Time');
      const fL = curLang === 'ar' ? 'الرسوم' : (curLang === 'fr' ? 'Frais' : 'Fee');
      
      let feeHtml = fee ? `<div class="sinfo-row"><span class="lbl">💰 ${fL}</span><span style="font-weight:800">${fee} د.أ</span></div>` : '';
      
      document.getElementById('sinfo').innerHTML = `
        <div class="sinfo-row"><span class="lbl">👨‍⚕️ ${dL}</span><span style="font-weight:800">د. ${docName}</span></div>
        <div class="sinfo-row"><span class="lbl">📅 ${dtL}</span><span style="font-weight:800">${date}</span></div>
        <div class="sinfo-row"><span class="lbl">🕐 ${tL}</span><span style="font-weight:800">${time}</span></div>
        ${feeHtml}`;
      
      startTracking(key);
      goStep(3);
      openModal('bookModal');
      document.getElementById('sheetTitle').textContent = curLang === 'ar' ? 'تتبع الحجز والتقييم' : (curLang === 'fr' ? 'Suivi et Évaluation' : 'Tracking & Rating');
    }

    // ── MY BOOKINGS ──
    async function openMyBookings() {
      openModal('myModal');
      const el = document.getElementById('myBooksList');
      
      // Merge clinic-specific and matching global list items
      const localKey = 'clinica_bks_' + CID;
      let list = JSON.parse(localStorage.getItem(localKey) || '[]');
      try {
        const globalList = JSON.parse(localStorage.getItem('clinica_all_bookings_global') || '[]');
        const matches = globalList.filter(b => b.cid === CID);
        for (const gb of matches) {
          if (!list.some(mb => mb.key === gb.key)) {
            list.push(gb);
          }
        }
        list.sort((a, b) => (b.ts || 0) - (a.ts || 0));
        list = list.slice(0, 10);
      } catch (e) {}

      if (!list.length) {
        el.innerHTML = '<div class="empty"><i class="fas fa-calendar-xmark"></i><p>لا توجد حجوزات سابقة</p></div>';
        return;
      }
      el.innerHTML = '<div style="text-align:center;padding:20px"><i class="fas fa-spinner fa-spin" style="color:var(--teal)"></i></div>';
      const stLabels = { new: 'جديد', confirmed: 'مؤكد', waiting: 'بالانتظار', done: 'مكتمل', completed: 'مكتمل', cancelled: 'ملغي' };
      const stCls = { new: 'st-new', confirmed: 'st-confirmed', waiting: 'st-waiting', done: 'st-done', completed: 'st-done', cancelled: 'st-cancelled' };
      let html = '';
      for (const b of list) {
        let status = 'new';
        let bData = null;
        try {
          const s = await db.ref(BASE + '/bookings/' + b.key).once('value');
          if (s.exists()) { bData = s.val(); status = bData.status || 'new'; }
          else {
            const cs = await db.ref(BASE + '/completedBookings/' + b.key).once('value');
            if (cs.exists()) { bData = cs.val(); status = bData.status || 'done'; }
            else { status = 'new'; }
          }
        } catch (e) { }

        let eBtn = '';
        if (status === 'new' && bData) {
          const nm = (bData.patName || '').replace(/'/g, "\\'");
          const ph = (bData.patPhone || '').replace(/'/g, "\\'");
          const nt = (bData.notes || '').replace(/'/g, "\\'");
          eBtn = `<div style="display:flex;gap:8px;margin-top:10px">
        <button onclick="editB('${b.key}','${nm}','${ph}','${nt}')" style="flex:1;padding:7px;background:rgba(13,148,136,.1);border:1px dashed var(--teal);color:var(--teal);border-radius:10px;font-family:'Tajawal',sans-serif;font-size:.78rem;cursor:pointer;transition:all 0.2s"><i class="fas fa-edit"></i> تعديل</button>
        <button onclick="cancelB('${b.key}', this)" style="flex:1;padding:7px;background:rgba(239,68,68,.1);border:1px dashed var(--red);color:var(--red);border-radius:10px;font-family:'Tajawal',sans-serif;font-size:.78rem;cursor:pointer;transition:all 0.2s"><i class="fas fa-times-circle"></i> إلغاء الحجز</button>
      </div>`;
        } else if ((status === 'done' || status === 'completed') && bData && !bData.rating) {
          const bno = (b.no || '').replace(/'/g, "\\'");
          const dN = (b.docName || '').replace(/'/g, "\\'");
          const dD = (b.date || '').replace(/'/g, "\\'");
          const dT = (b.time || '').replace(/'/g, "\\'");
          eBtn = `<button onclick="closeModal('myModal'); currentKey='${b.key}'; document.getElementById('sno').textContent='${bno}'; document.getElementById('sinfo').innerHTML='<div class=\\'sinfo-row\\'><span class=\\'lbl\\'>👨‍⚕️ الطبيب</span><span style=\\'font-weight:800\\'>د. ${dN}</span></div><div class=\\'sinfo-row\\'><span class=\\'lbl\\'>📅 التاريخ</span><span style=\\'font-weight:800\\'>${dD}</span></div><div class=\\'sinfo-row\\'><span class=\\'lbl\\'>🕐 الوقت</span><span style=\\'font-weight:800\\'>${dT}</span></div>'; startTracking('${b.key}'); goStep(3); openModal('bookModal'); document.getElementById('sheetTitle').textContent='تتبع الحجز والتقييم';" style="margin-top:10px;width:100%;padding:7px;background:rgba(245,158,11,.1);border:1px dashed var(--amber);color:var(--amber);border-radius:10px;font-family:'Tajawal',sans-serif;font-size:.78rem;cursor:pointer;transition:all 0.2s"><i class="fas fa-star"></i> قيم الطبيب الآن</button>`;
        }

        const bno = (b.no || b.bookNo || '').replace(/'/g, "\\'");
        const dN = (b.docName || '').replace(/'/g, "\\'");
        const dD = (b.date || '').replace(/'/g, "\\'");
        const dT = (b.time || '').replace(/'/g, "\\'");
        const fee = bData ? bData.fee : '';

        // Permanent primary "Show Details" button for every active card (unless cancelled)
        let trackingBtn = '';
        if (status !== 'cancelled') {
          trackingBtn = `<button onclick="showBookingDetails('${b.key}','${bno}','${dN}','${dD}','${dT}','${fee}')" style="width:100%;margin-top:10px;padding:8px;background:rgba(13,148,136,.1);border:1px solid var(--teal);color:var(--teal);border-radius:10px;font-family:'Tajawal',sans-serif;font-size:.8rem;font-weight:700;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;justify-content:center;gap:6px"><i class="fas fa-eye"></i> عرض تفاصيل وتتبع الحجز</button>`;
        }

        html += `<div class="bi-card">
      <div class="bi-head">
        <div>
          <div style="font-weight:800;font-size:0.95rem">د. ${sanitize(b.docName)}</div>
          <div style="font-size:0.75rem;color:var(--muted);margin-top:2px">${b.date} — ${b.time}</div>
        </div>
        <span class="bi-st ${stCls[status] || 'st-new'}">${stLabels[status] || status}</span>
      </div>
      <div class="bi-no" dir="ltr">${b.no || b.bookNo || ''}</div>
      ${trackingBtn}
      ${eBtn}
    </div>`;
      }
      el.innerHTML = html;
    }

    // ── EDIT BOOKING ──
    function editB(k, n, p, nt) {
      document.getElementById('eKey').value = k;
      document.getElementById('eName').value = n;
      document.getElementById('ePhone').value = p;
      document.getElementById('eNotes').value = nt;
      openModal('editModal');
    }
    function saveEditBook() {
      const k = document.getElementById('eKey').value;
      const n = sanitize(document.getElementById('eName').value);
      const p = sanitize(toEngNum(document.getElementById('ePhone').value));
      const nt = sanitize(document.getElementById('eNotes').value);
      if (!isName(n) || !isPhone(p)) { toast('الاسم أو الرقم غير صحيح', 'err'); return; }

      const b = document.getElementById('editSaveBtn');
      b.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...'; b.disabled = true;
      db.ref(BASE + '/bookings/' + k).update({ patName: n, patPhone: p, notes: nt }).then(() => {
        toast('✅ تم التعديل', 'ok'); closeModal('editModal'); b.innerHTML = '<i class="fas fa-save"></i> حفظ'; b.disabled = false;
        openMyBookings();
      }).catch(e => { toast('❌ خطأ', 'err'); b.innerHTML = '<i class="fas fa-save"></i> حفظ'; b.disabled = false; });
    }

    // ── CANCEL BOOKING ──
    function cancelB(key, el) {
      const og = el.innerHTML;
      el.innerHTML = '<i class="fas fa-exclamation-triangle"></i> متأكد؟ للإلغاء اضغط مجدداً';
      el.style.background = 'var(--red)';
      el.style.color = '#fff';
      el.style.border = 'none';
      el.onclick = () => {
        el.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإلغاء...';
        db.ref(BASE + '/bookings/' + key).update({ status: 'cancelled' }).then(() => {
          toast('✅ تم إلغاء الحجز', 'ok');
          openMyBookings();
        }).catch(e => toast('❌ حدث خطأ', 'err'));
      };
      setTimeout(() => {
        if (el.innerHTML.includes('متأكد')) {
          el.innerHTML = og;
          el.style.background = 'rgba(239,68,68,.1)';
          el.style.color = 'var(--red)';
          el.style.border = '1px dashed var(--red)';
          el.onclick = () => cancelB(key, el);
        }
      }, 3500);
    }

    // ── FAB ──
    function fabAction() {
      if (allDocs.length > 0) toast('👆 اختر طبيباً من القائمة');
      else toast('جاري تحميل الأطباء...');
    }

    // ── MODAL HELPERS ──
    function openModal(id) {
      document.getElementById(id).classList.add('show');
      document.body.style.overflow = 'hidden';
    }
    function closeModal(id) {
      document.getElementById(id).classList.remove('show');
      document.body.style.overflow = '';
      if (id === 'bookModal') {
        setTimeout(() => {
          if (trkListener && currentKey) {
            db.ref(BASE + '/bookings/' + currentKey).off('value', trkListener);
            trkListener = null;
          }
          selDoc = null; selDate = ''; selTime = '';
          sending = false;
          isBooked = false;
          currentKey = null;
          curRating = 0;
          goStep(0);
          ['pName', 'pPhone', 'pDob', 'pNotes'].forEach(i => document.getElementById(i).value = '');
          document.getElementById('pGender').value = '';
    const _disp = document.getElementById('pAgeDisplay');
    if (_disp) _disp.style.display = 'none';
          ['pName', 'pPhone'].forEach(i => { document.getElementById(i).classList.remove('err'); });
          ['pNameErr', 'pPhoneErr'].forEach(i => { document.getElementById(i).style.display = 'none'; });
          const sb = document.getElementById('sendBtn');
          if (sb) { sb.innerHTML = '<i class="fas fa-check-circle" style="margin-left:8px"></i> تأكيد الحجز'; sb.disabled = false; }
          document.querySelectorAll('.star').forEach(s => s.classList.remove('on'));
          const rb = document.getElementById('ratingBox');
          if (rb) { rb.style.display = 'none'; rb.innerHTML = `<div style="font-weight:800;font-size:0.9rem;margin-bottom:6px">قيّم تجربتك مع الطبيب</div><div class="stars"><span class="star" onclick="setStar(1)">★</span><span class="star" onclick="setStar(2)">★</span><span class="star" onclick="setStar(3)">★</span><span class="star" onclick="setStar(4)">★</span><span class="star" onclick="setStar(5)">★</span></div><button id="rateBtn" onclick="sendRating()" style="display:none;width:100%;padding:10px;background:var(--amber);border:none;border-radius:10px;font-weight:800;cursor:pointer;font-family:'Tajawal',sans-serif;color:#000;margin-top:6px">إرسال التقييم</button>`; }
        }, 300);
      }
    }
    document.getElementById('bookModal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('bookModal'); });
    document.getElementById('myModal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('myModal'); });

    // ── THEME ──
    function toggleTheme() {
      const dark = document.body.getAttribute('data-theme') === 'dark';
      document.body.setAttribute('data-theme', dark ? 'light' : 'dark');
      document.getElementById('themeBtn').textContent = dark ? '🌙' : '☀️';
      localStorage.setItem('clinica_theme', dark ? 'light' : 'dark');
    }
    const savedTheme = localStorage.getItem('clinica_theme');
    if (savedTheme) { document.body.setAttribute('data-theme', savedTheme); document.getElementById('themeBtn').textContent = savedTheme === 'dark' ? '☀️' : '🌙'; }

    // ── TOAST / ERROR MODAL ──
    // Critical errors (rate limit, slot taken, closed) → full modal
    // Info/success → small toast pill
    const CRITICAL_CODES = ['RATE', 'SLOT', 'STOP', 'ERR'];
    function showErrModal(icon, title, body) {
      document.getElementById('errIcon').textContent  = icon;
      document.getElementById('errTitle').textContent = title;
      document.getElementById('errBody').textContent  = body;
      document.getElementById('errModal').classList.add('show');
    }
    function toast(msg, type = '') {
      // Route critical errors to the full modal
      if (type === 'err') {
        if (msg.includes('تجاوزت الحد')) {
          showErrModal('🚫', 'تجاوزت عدد الحجوزات المسموح بها', 'لقد وصلت للحد الأقصى المسموح به (5 حجوزات في الساعة).\nيرجى الانتظار قليلاً ثم المحاولة مجدداً.');
          return;
        }
        if (msg.includes('تم حجز هذا الموعد للتو')) {
          showErrModal('⏱️', 'الموعد محجوز للتو!', 'قام شخص آخر بحجز هذا الموعد في نفس اللحظة.\nيرجى اختيار موعد آخر من القائمة المتاحة.');
          return;
        }
        if (msg.includes('متوقف')) {
          showErrModal('⛔', 'الحجز متوقف حالياً', 'استقبال الحجوزات الإلكترونية متوقف مؤقتاً.\nيرجى المحاولة لاحقاً أو التواصل مع العيادة مباشرة.');
          return;
        }
      }
      // Default: small pill toast
      const w = document.getElementById('toastWrap');
      const t = document.createElement('div');
      t.className = 'toast' + (type ? ' ' + type : ''); t.textContent = msg; w.appendChild(t);
      setTimeout(() => t.classList.add('show'), 10);
      setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3500);
    }

    // ── PWA INSTALL ──
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault(); deferredPrompt = e;
      if (!localStorage.getItem('clinica_pwa_dismissed')) {
        setTimeout(() => document.getElementById('installBanner').classList.add('show'), 3000);
      }
    });
    document.getElementById('installBtn').onclick = async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') { toast('✅ تمت الإضافة! ابحث عن أيقونة كلينيكا في شاشتك', 'ok'); dismissInstall(); }
      deferredPrompt = null;
    };
    function dismissInstall() {
      document.getElementById('installBanner').classList.remove('show');
      localStorage.setItem('clinica_pwa_dismissed', '1');
    }
    window.addEventListener('appinstalled', () => { toast('🎉 تم تثبيت التطبيق بنجاح!', 'ok'); dismissInstall(); });

    // ── SERVICE WORKER ──
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(reg => {
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                toast('🔄 تحديث متاح — أعد تحميل الصفحة');
              }
            });
          });
        }).catch(() => { });
      });
    }

    // Fix step 1 button
    document.querySelector('#s1 .btn-next').onclick = validateStep1;
  