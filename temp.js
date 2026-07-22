
window.onerror = function(msg, url, line, col, error) {
  alert('Global Error: ' + msg + '\nLine: ' + line + '\n' + (error ? error.stack : ''));
};
/* ═══════════════════════════════════════════════════
   ARGON INVOICE PRINT ENGINE
   File: invoice-print.html (inline script)

   Data sources (priority order):
   1. URL param ?inv=INVOICE_KEY&id=CLINIC_ID  →  direct Firebase fetch
   2. localStorage key: argon_invoice_payload   →  JSON payload from billing-engine
   3. Demo data (fallback)
═══════════════════════════════════════════════════ */

const FB_CONFIG = {
  apiKey: "AIzaSyCDT_H-1klxbtuVR5n5GOVHKlxcmvY_2GA",
  authDomain: "clinica-system-e71b9.firebaseapp.com",
  databaseURL: "https://clinica-system-e71b9-default-rtdb.firebaseio.com",
  projectId: "clinica-system-e71b9",
  storageBucket: "clinica-system-e71b9.firebasestorage.app",
  messagingSenderId: "833103541884",
  appId: "1:833103541884:web:f8ee6ca4b3d8400cf0fbf9"
};

if (!firebase.apps.length) firebase.initializeApp(FB_CONFIG);
const db = firebase.database();

const uP = new URLSearchParams(window.location.search);
const CLINIC_ID = uP.get('id') || localStorage.getItem('argon_id') || '1';
const INV_KEY   = uP.get('inv') || null;
const BASE      = 'clinics/' + CLINIC_ID;

const sanitize = s => String(s || '').replace(/[<>"'`]/g, '').trim().substring(0, 300);
const fmt = n => parseFloat(n || 0).toFixed(3);

// ── STATUS CONFIG ──
const STATUS_CONFIG = {
  paid:    { label: 'مدفوع بالكامل · Paid in Full', ribbon: 'ribbon-paid',    chip: 'chip-paid',    icon: 'fa-check-circle' },
  unpaid:  { label: 'غير مدفوع · Unpaid',           ribbon: 'ribbon-unpaid',  chip: 'chip-unpaid',  icon: 'fa-exclamation-circle' },
  partial: { label: 'مدفوع جزئياً · Partial',       ribbon: 'ribbon-partial', chip: 'chip-partial', icon: 'fa-adjust' },
  overdue: { label: 'متأخر الدفع · Overdue',         ribbon: 'ribbon-overdue', chip: 'chip-overdue', icon: 'fa-clock' },
};

const TYPE_MAP = {
  exam:        { label: 'كشف',   cls: 'badge-exam',  icon: 'fa-stethoscope' },
  lab:         { label: 'مختبر', cls: 'badge-lab',   icon: 'fa-flask' },
  radiology:   { label: 'أشعة',  cls: 'badge-rad',   icon: 'fa-x-ray' },
  medication:  { label: 'دواء',  cls: 'badge-med',   icon: 'fa-pills' },
  pharmacy:    { label: 'دواء',  cls: 'badge-med',   icon: 'fa-pills' },
  other:       { label: 'أخرى',  cls: 'badge-other', icon: 'fa-circle' },
};

// ── RENDER ──
function renderInvoice(inv, settings) {
  const s   = inv.status || 'unpaid';
  const cfg = STATUS_CONFIG[s] || STATUS_CONFIG.unpaid;
  const now = new Date().toLocaleString('ar-JO', { dateStyle: 'medium', timeStyle: 'short' });
  const invDate = inv.createdAt
    ? new Date(inv.createdAt).toLocaleDateString('ar-JO', { dateStyle: 'full' })
    : new Date().toLocaleDateString('ar-JO', { dateStyle: 'full' });

  // ── Clinic branding ──
  document.getElementById('clinicName').textContent  = sanitize(settings.name || 'العيادة');
  document.getElementById('clinicMeta').textContent  = `ARGON MEDICAL OS · ID: ${CLINIC_ID}`;
  document.getElementById('clinicContact').textContent = settings.phone ? `📞 ${sanitize(settings.phone)}` : '';
  document.getElementById('footerClinic').textContent = `${sanitize(settings.name || 'العيادة')} · ARGON MEDICAL OS · argonforfun.com`;

  if (settings.logoUrl) {
    document.getElementById('clinicLogoWrap').innerHTML =
      `<img src="${sanitize(settings.logoUrl)}" alt="logo">`;
  } else {
    document.getElementById('clinicLogoWrap').textContent = settings.emoji || '🏥';
  }

  // ── Invoice meta ──
  const invId = inv.displayId || inv.id || INV_KEY || `INV-${Date.now()}`;
  document.getElementById('invNumber').textContent = sanitize(invId);
  document.getElementById('invMeta').innerHTML =
    `التاريخ: ${invDate}<br>الزيارة: ${sanitize(inv.visitId || '—')}`;
  document.getElementById('stampTs').textContent   = `Generated: ${now} · ARGON v2.0`;
  document.getElementById('footerDate').textContent = `طُبع في: ${now}`;

  // ── Status ──
  const ribbon = document.getElementById('statusRibbon');
  ribbon.className = 'inv-ribbon ' + cfg.ribbon;
  document.getElementById('ribbonText').textContent = cfg.label;
  document.getElementById('ribbonDate').textContent = inv.paidAt
    ? `· تاريخ التسديد: ${new Date(inv.paidAt).toLocaleDateString('ar-JO')}`
    : '';

  const chip = document.getElementById('statusChip');
  chip.className = 'status-chip ' + cfg.chip;
  document.getElementById('statusLabel').textContent = cfg.label.split(' · ')[0];

  // ── Patient ──
  document.getElementById('patName').textContent  = sanitize(inv.patientName || '—');
  document.getElementById('patNID').textContent   = `الرقم الوطني: ${sanitize(inv.patientNID || '—')}`;
  document.getElementById('patPhone').textContent = `الهاتف: ${sanitize(inv.patientPhone || '—')}`;
  document.getElementById('patAge').textContent   = inv.patientAge
    ? `العمر: ${sanitize(String(inv.patientAge))} سنة · ${sanitize(inv.patientGender || '—')}`
    : '—';
  document.getElementById('nidPill').textContent  = `NID: ${sanitize(inv.patientNID || '—')}`;
  document.getElementById('mrnPill').textContent  = `MRN: ${sanitize(inv.patientMRN || '—')}`;

  // ── Visit ──
  document.getElementById('docName').textContent   = `د. ${sanitize(inv.docName || '—')}`;
  document.getElementById('docSpec').textContent   = sanitize(inv.docSpec || '—');
  document.getElementById('visitTime').textContent = `الوقت: ${sanitize(inv.visitTime || '—')}`;
  document.getElementById('visitDept').textContent = `القسم: ${sanitize(inv.department || '—')}`;
  document.getElementById('visitBkNo').textContent = `رقم الحجز: ${sanitize(inv.visitId || '—')}`;

  // ── Items ──
  const items = inv.items || [];
  let subtotal = 0;
  const itemsHtml = items.length
    ? items.map(item => {
        const qty     = parseFloat(item.qty || 1);
        const price   = parseFloat(item.price || 0);
        const total   = qty * price;
        subtotal     += total;
        const typeKey = (item.type || 'other').toLowerCase();
        const tm      = TYPE_MAP[typeKey] || TYPE_MAP.other;
        return `
          <div class="item-row">
            <div>
              <div class="item-name-main">${sanitize(item.name || '—')}</div>
              ${item.note ? `<div class="item-name-sub">${sanitize(item.note)}</div>` : ''}
            </div>
            <div class="item-cell">
              <span class="item-badge ${tm.cls}">
                <i class="fas ${tm.icon}" style="font-size:.6rem"></i> ${tm.label}
              </span>
            </div>
            <div class="item-cell">${qty}</div>
            <div class="item-cell">${fmt(price)} د.أ</div>
            <div class="item-total-cell">${fmt(total)} د.أ</div>
          </div>`;
      }).join('')
    : `<div class="item-row" style="justify-content:center;color:var(--muted);font-size:.84rem">لا توجد بنود</div>`;
  document.getElementById('itemsBody').innerHTML = itemsHtml;

  // ── Totals ──
  const discount = parseFloat(inv.discount || 0);
  const tax      = parseFloat(inv.tax || 0);
  const grandTotal = subtotal - discount + tax;
  const paidAmt    = parseFloat(inv.paidAmount || (s === 'paid' ? grandTotal : 0));
  const remaining  = grandTotal - paidAmt;

  document.getElementById('tSubtotal').textContent = `${fmt(subtotal)} د.أ`;
  document.getElementById('tDiscount').textContent = discount ? `- ${fmt(discount)} د.أ` : `0.000 د.أ`;
  document.getElementById('tTax').textContent      = `${fmt(tax)} د.أ`;
  document.getElementById('tPaid').textContent     = `${fmt(paidAmt)} د.أ`;

  const remEl = document.getElementById('tRemaining');
  remEl.textContent = `${fmt(remaining)} د.أ`;
  if (remaining <= 0)        remEl.className = 'totals-value green';
  else if (remaining < grandTotal) remEl.className = 'totals-value amber';
  else                        remEl.className = 'totals-value red';

  // ── Payment log ──
  const payments = inv.payments || [];
  const payHtml = payments.length
    ? payments.map(p => `
        <div class="pay-log-row">
          <div>
            <div class="pay-log-date">${sanitize(p.date || '—')}</div>
            <div class="pay-log-note">${sanitize(p.note || 'دفع نقدي')}</div>
          </div>
          <div class="pay-log-amount">+ ${fmt(p.amount)} د.أ</div>
        </div>`).join('')
    : `<div class="pay-log-row"><div class="pay-log-date" style="color:var(--muted)">لا توجد دفعات مسجلة</div></div>`;
  document.getElementById('payLogBody').innerHTML = payHtml;

  // ── Notes ──
  if (inv.notes) {
    document.getElementById('invNotes').textContent = sanitize(inv.notes);
  }

  // Store for WhatsApp
  window._invData = { inv, settings, grandTotal, paidAmt, remaining };
}

// ── WHATSAPP NOTIFICATION ──
function sendWhatsApp() {
  const d = window._invData;
  if (!d) return;
  const phone = (d.inv.patientPhone || '').replace(/\\D/g, '');
  if (!phone) { alert('رقم هاتف المريض غير متوفر'); return; }
  const statusAr = {
    paid: 'مدفوعة بالكامل ✅',
    unpaid: 'بانتظار التسديد ⏳',
    partial: `مدفوع جزئياً - متبقي ${fmt(d.remaining)} د.أ 💳`,
    overdue: 'متأخر الدفع ⚠️'
  };
  const msg = `🏥 *${sanitize(d.settings.name || 'العيادة')}*\\n\\nمرحباً ${sanitize(d.inv.patientName || '')},\\n\\n` +
    `📄 *فاتورة رقم:* ${sanitize(d.inv.id || INV_KEY || '—')}\\n` +
    `👨⚕️ *الطبيب:* د. ${sanitize(d.inv.docName || '—')}\\n` +
    `💰 *الإجمالي:* ${fmt(d.grandTotal)} د.أ\\n` +
    `✅ *المسدد:* ${fmt(d.paidAmt)} د.أ\\n` +
    `📊 *الحالة:* ${statusAr[d.inv.status] || 'غير محددة'}\\n\\n` +
    `شكراً لثقتكم بعيادتنا 🌿\\n_ARGON Medical OS_`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ── DATA LOADING ──
async function loadAndRender() {
  let inv = null;
  let settings = {};

  // 1. Try Firebase direct fetch
  if (INV_KEY) {
    try {
      const [invSnap, setSnap] = await Promise.all([
        db.ref(`${BASE}/invoices/${INV_KEY}`).once('value'),
        db.ref(`${BASE}/settings`).once('value')
      ]);
      if (invSnap.exists()) {
        inv = { ...invSnap.val(), id: INV_KEY };
        settings = setSnap.val() || {};
      }
    } catch (e) { console.warn('Firebase fetch failed:', e); }
  }

  // 2. Try localStorage payload
  if (!inv) {
    try {
      const raw = localStorage.getItem('argon_invoice_payload');
      if (raw) {
        const payload = JSON.parse(raw);
        inv = payload.invoice || payload;
        settings = payload.settings || {};
      }
    } catch (e) { console.warn('localStorage parse failed:', e); }
  }

// ── NO DEMO FALLBACK ──
  if (!inv) {
    document.body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#f8fafc;font-family:'Tajawal',sans-serif;color:var(--text);text-align:center;">
        <i class="fas fa-exclamation-triangle" style="font-size:4rem;color:var(--amber);margin-bottom:20px;"></i>
        <h2 style="font-weight:900;margin-bottom:10px;">انتهت صلاحية جلسة الطباعة</h2>
        <p style="color:var(--muted);max-width:400px;line-height:1.6;">لأسباب أمنية وحماية خصوصية المرضى، تنتهي صلاحية الرابط بعد 30 ثانية من فتحه. الرجاء العودة إلى النظام والضغط على زر الطباعة مرة أخرى.</p>
        <button onclick="window.close()" style="margin-top:20px;padding:10px 20px;background:var(--teal);color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-family:'Tajawal',sans-serif;">إغلاق الصفحة</button>
      </div>
    `;
    return;
  }

  renderInvoice(inv, settings);
}

// Start
try {
  loadAndRender();
} catch (e) {
  alert('Critical Error in invoice-print.html: ' + e.message + '\n\n' + e.stack);
}
