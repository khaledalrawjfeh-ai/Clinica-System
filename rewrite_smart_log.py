import os

html_content = """<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ARGON | السجل السريري الشامل</title>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&family=IBM+Plex+Mono:wght@400;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <script src="https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.2/firebase-database-compat.js"></script>
  <style>
    :root {
      --bg: #0f172a;
      --panel: #1e293b;
      --surf: #334155;
      --text: #f8fafc;
      --muted: #94a3b8;
      --border: #334155;
      --teal: #0d9488;
      --teal-light: #14b8a6;
      --sky: #0ea5e9;
      --amber: #f59e0b;
      --red: #ef4444;
      --purple: #8b5cf6;
      --green: #10b981;
    }
    body {
      margin: 0; padding: 0;
      background: var(--bg); color: var(--text);
      font-family: 'Tajawal', sans-serif;
      min-height: 100vh;
      overflow-y: scroll;
    }
    /* Header */
    .header {
      position: sticky; top: 0; z-index: 100;
      background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      padding: 15px 30px;
      display: flex; justify-content: space-between; align-items: center;
    }
    .h-logo { font-weight: 900; font-size: 1.4rem; color: var(--sky); letter-spacing: 1px; display: flex; align-items: center; gap: 10px; }
    .h-logo span { color: var(--text); font-weight: 800; }
    .live-indicator {
      display: flex; align-items: center; gap: 8px;
      background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2);
      color: var(--green); padding: 6px 12px; border-radius: 20px;
      font-size: 0.85rem; font-weight: bold;
    }
    .pulse {
      width: 8px; height: 8px; border-radius: 50%; background: var(--green);
      animation: pulseAnim 1.5s infinite;
    }
    @keyframes pulseAnim {
      0% { box-shadow: 0 0 0 0 rgba(16,185,129,0.7); }
      70% { box-shadow: 0 0 0 10px rgba(16,185,129,0); }
      100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
    }
    
    /* Container */
    .container {
      max-width: 1000px; margin: 30px auto; padding: 0 20px;
    }
    
    /* Timeline */
    .timeline {
      position: relative; padding-right: 40px; margin-top: 20px;
    }
    .timeline::before {
      content: ''; position: absolute; top: 0; bottom: 0; right: 15px; width: 2px;
      background: linear-gradient(to bottom, var(--sky), var(--purple), var(--teal), transparent);
      opacity: 0.3;
    }
    
    /* Event Card */
    .t-event {
      position: relative; margin-bottom: 25px;
      background: var(--panel); border: 1px solid var(--border);
      border-radius: 16px; padding: 20px;
      box-shadow: 0 10px 30px -10px rgba(0,0,0,0.5);
      transition: transform 0.2s, box-shadow 0.2s;
      animation: slideIn 0.4s ease-out backwards;
    }
    .t-event:hover {
      transform: translateY(-2px); box-shadow: 0 12px 40px -10px rgba(0,0,0,0.7);
      border-color: rgba(14, 165, 233, 0.4);
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateX(20px); }
      to { opacity: 1; transform: translateX(0); }
    }
    
    /* Dot */
    .t-dot {
      position: absolute; right: -36px; top: 20px;
      width: 24px; height: 24px; border-radius: 50%;
      background: var(--bg); border: 3px solid var(--sky);
      display: flex; justify-content: center; align-items: center;
      z-index: 2; box-shadow: 0 0 10px rgba(14, 165, 233, 0.4);
    }
    .t-dot i { font-size: 0.6rem; color: var(--sky); }
    
    /* Header of Card */
    .e-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
    .e-title { font-weight: 800; font-size: 1.15rem; color: var(--text); display: flex; align-items: center; gap: 8px; }
    .e-time { font-family: 'IBM Plex Mono', monospace; font-size: 0.8rem; color: var(--muted); background: var(--surf); padding: 4px 8px; border-radius: 6px; }
    
    /* Content */
    .e-body { display: flex; flex-direction: column; gap: 10px; }
    .e-row { display: flex; align-items: center; gap: 10px; font-size: 0.95rem; }
    .e-label { color: var(--muted); font-size: 0.85rem; width: 80px; }
    
    .status-badge {
      padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: bold;
    }
    .st-new { background: rgba(14,165,233,0.1); color: var(--sky); border: 1px solid rgba(14,165,233,0.2); }
    .st-in { background: rgba(245,158,11,0.1); color: var(--amber); border: 1px solid rgba(245,158,11,0.2); }
    .st-done { background: rgba(16,185,129,0.1); color: var(--green); border: 1px solid rgba(16,185,129,0.2); }
    .st-ins { background: rgba(139,92,246,0.1); color: var(--purple); border: 1px solid rgba(139,92,246,0.2); }
    
    .diag-box {
      margin-top: 10px; background: rgba(0,0,0,0.2); border-right: 3px solid var(--teal);
      padding: 12px; border-radius: 8px; font-size: 0.9rem; line-height: 1.5; color: #cbd5e1;
    }
    .rx-tag {
      display: inline-flex; align-items: center; gap: 5px; background: rgba(139,92,246,0.15);
      color: #c4b5fd; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; margin: 3px; border: 1px solid rgba(139,92,246,0.3);
    }
    .empty-state { text-align: center; padding: 50px; color: var(--muted); font-size: 1.1rem; }
    
  </style>
</head>
<body>

  <div class="header">
    <div class="h-logo"><i class="fas fa-heartbeat"></i> ARGON <span>Clinical Log</span></div>
    <div class="live-indicator"><div class="pulse"></div> بث مباشر للنشاط السريري</div>
  </div>

  <div class="container">
    <div style="margin-bottom: 20px; padding: 20px; background: linear-gradient(135deg, rgba(14,165,233,0.1), rgba(139,92,246,0.1)); border: 1px solid rgba(14,165,233,0.2); border-radius: 16px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h2 style="margin:0 0 5px 0; color: var(--sky);"><i class="fas fa-clipboard-list"></i> السجل السريري الشامل</h2>
        <p style="margin:0; color: var(--muted); font-size: 0.9rem;">مراقبة حية وشاملة لرحلة المرضى: الحجوزات، التشخيصات، الأدوية، والفوترة.</p>
      </div>
      <div>
        <button onclick="clearLog()" style="background: var(--surf); color: var(--text); border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-family: 'Tajawal'; font-weight: bold;"><i class="fas fa-eraser"></i> مسح السجل المحلي</button>
      </div>
    </div>

    <div class="timeline" id="logContainer">
      <div class="empty-state"><i class="fas fa-spinner fa-spin"></i> جاري الاتصال بالعيادة وجمع البيانات المباشرة...</div>
    </div>
  </div>

  <script>
    const FB = {
      apiKey: "AIzaSyArgonKeyDemoOnlyDoNotUse",
      authDomain: "clinica-system-default.firebaseapp.com",
      databaseURL: "https://clinica-system-default-rtdb.firebaseio.com",
      projectId: "clinica-system-default",
      storageBucket: "clinica-system-default.appspot.com",
      messagingSenderId: "833103541884",
      appId: "1:833103541884:web:f8ee6ca4b3d8400cf0fbf9"
    };
    if (!firebase.apps.length) firebase.initializeApp(FB);
    const db = firebase.database();

    const uP = new URLSearchParams(window.location.search);
    let CID = uP.get('id') || localStorage.getItem('argon_id') || '1';
    const BASE = 'clinics/' + CID;

    let _events = [];

    function renderLogs() {
      const c = document.getElementById('logContainer');
      if (_events.length === 0) {
        c.innerHTML = '<div class="empty-state"><i class="fas fa-mug-hot"></i> لا توجد نشاطات سريرية اليوم حتى الآن.</div>';
        return;
      }

      // Sort by time descending
      _events.sort((a,b) => b.ts - a.ts);
      
      let html = '';
      for (const ev of _events) {
        const timeStr = new Date(ev.ts).toLocaleTimeString('ar-JO', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
        
        let dotColor = 'var(--sky)';
        let dotIcon = 'fa-user';
        let stHtml = '';
        let contentHtml = '';
        
        if (ev.type === 'NEW_BOOKING') {
          dotColor = 'var(--sky)'; dotIcon = 'fa-calendar-plus';
          stHtml = '<span class="status-badge st-new">حجز جديد</span>';
          contentHtml = `
            <div class="e-row"><span class="e-label">المريض:</span> <b>${ev.data.patName}</b> (${ev.data.patPhone || 'بدون رقم'})</div>
            <div class="e-row"><span class="e-label">الطبيب:</span> ${ev.data.docName || 'عام'}</div>
          `;
          if (ev.data.insurance) {
            contentHtml += `<div class="e-row" style="margin-top:5px"><span class="status-badge st-ins"><i class="fas fa-shield-halved"></i> تأمين: ${ev.data.insurance.provider || 'نعم'} (تحمل المريض ${ev.data.insurance.patientSharePct || 0}%)</span></div>`;
          }
        } 
        else if (ev.type === 'IN_SESSION') {
          dotColor = 'var(--amber)'; dotIcon = 'fa-stethoscope';
          stHtml = '<span class="status-badge st-in">في الداخل (يفحص)</span>';
          contentHtml = `
            <div class="e-row"><span class="e-label">المريض:</span> <b>${ev.data.patName}</b> الآن داخل العيادة.</div>
          `;
        }
        else if (ev.type === 'COMPLETED_VISIT') {
          dotColor = 'var(--green)'; dotIcon = 'fa-check-double';
          stHtml = '<span class="status-badge st-done">تمت الزيارة بنجاح</span>';
          
          let rxHtml = '';
          if (ev.data.rx && ev.data.rx.length > 0) {
            rxHtml = '<div style="margin-top:8px"><b>الأدوية المصروفة:</b><br>' + ev.data.rx.map(r => `<span class="rx-tag"><i class="fas fa-pills"></i> ${r.drug || r.name}</span>`).join('') + '</div>';
          }
          
          contentHtml = `
            <div class="e-row"><span class="e-label">المريض:</span> <b>${ev.data.name || ev.data.patName}</b> غادر العيادة.</div>
            <div class="diag-box">
              <i class="fas fa-file-medical"></i> <b>التشخيص (Diagnosis):</b><br>
              ${ev.data.diag || 'لم يتم كتابة تفاصيل تشخيصية.'}
            </div>
            ${rxHtml}
          `;
        }

        html += `
          <div class="t-event">
            <div class="t-dot" style="border-color:${dotColor}; box-shadow: 0 0 10px ${dotColor}66;"><i class="fas ${dotIcon}" style="color:${dotColor}"></i></div>
            <div class="e-head">
              <div class="e-title">${stHtml}</div>
              <div class="e-time">${timeStr}</div>
            </div>
            <div class="e-body">
              ${contentHtml}
            </div>
          </div>
        `;
      }
      c.innerHTML = html;
    }

    function addEvent(type, data, timestamp) {
      // Prevent exact duplicates
      const exists = _events.find(e => e.type === type && e.data.patName === data.patName && Math.abs(e.ts - timestamp) < 60000);
      if (!exists) {
        _events.push({ type, data, ts: timestamp });
        if (_events.length > 100) _events = _events.slice(-100);
        renderLogs();
      }
    }

    // 1. Listen to New Bookings & Status Changes
    db.ref(BASE + '/bookings').orderByChild('createdAt').startAt(new Date(Date.now() - 24*60*60*1000).toISOString()).on('child_added', snap => {
      const v = snap.val();
      if (!v) return;
      const ts = new Date(v.createdAt || Date.now()).getTime();
      addEvent('NEW_BOOKING', v, ts);
      
      if (v.status === 'in') {
        addEvent('IN_SESSION', v, ts + 1000);
      }
    });

    db.ref(BASE + '/bookings').on('child_changed', snap => {
      const v = snap.val();
      if (!v) return;
      if (v.status === 'in') {
        addEvent('IN_SESSION', v, Date.now());
      }
    });

    // 2. Listen to Completed Visits (Archived)
    db.ref(BASE + '/completedBookings').orderByChild('completedAt').limitToLast(50).on('child_added', snap => {
      const v = snap.val();
      if (!v) return;
      const ts = new Date(v.completedAt || Date.now()).getTime();
      addEvent('COMPLETED_VISIT', v, ts);
    });

    function clearLog() {
      _events = [];
      renderLogs();
    }

  </script>
</body>
</html>
"""

    with open('smart-log.html', 'w', encoding='utf-8') as f:
        f.write(html_content)

modify_smart_log()
print("Smart Log completely rewritten as a Clinical Timeline!")
