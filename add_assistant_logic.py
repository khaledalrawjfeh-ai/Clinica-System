import re

with open('d:/git__hub/clinica-system/emr-app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Add logic for BMI and EDD calculators
assistant_logic = '''
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
'''

# We append the logic at the end of the file.
content = content + "\n" + assistant_logic

with open('d:/git__hub/clinica-system/emr-app.js', 'w', encoding='utf-8') as f:
    f.write(content)
print('Appended logic to emr-app.js')
