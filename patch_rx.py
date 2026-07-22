import re

with open('emr-app.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = """              <div style="margin-top:14px;display:flex;justify-content:flex-end;gap:8px">
                ${archiveBtn}
                ${signOffBtn}
                <button class="btn-secondary btn-sm" onclick="event.stopPropagation();printVisitSummary('${vk}')"><i class="fas fa-print"></i> طباعة الملخص</button>
              </div>"""

replacement = """              <div style="margin-top:14px;display:flex;justify-content:flex-end;gap:8px">
                ${archiveBtn}
                ${signOffBtn}
                ${(v.prescriptions && v.prescriptions.length > 0) ? `<button class="btn-primary btn-sm" style="background:#10b981;border-color:#10b981;color:white" onclick="event.stopPropagation();printPrescription('${vk}')"><i class="fas fa-file-prescription"></i> طباعة الوصفة</button>` : ''}
                <button class="btn-secondary btn-sm" onclick="event.stopPropagation();printVisitSummary('${vk}')"><i class="fas fa-print"></i> طباعة الملخص</button>
              </div>"""

if target in content:
    content = content.replace(target, replacement)
    print('Button injected successfully.')
else:
    print('Target for button not found.')

print_summary_func_def = "function printVisitSummary(vk) {"

print_prescription_func = """function printPrescription(vk) {
  const p = _patients[activePatientId];
  const v = p.visits[vk];
  if (!v || !v.prescriptions || v.prescriptions.length === 0) return;

  const session = window.ArgonSession ? ArgonSession.get() || {} : {};
  let clinicName = session.clinicName || 'العيادة الطبية';
  if (typeof _settings !== 'undefined' && _settings.clinicName) clinicName = _settings.clinicName;

  const cleanPhone = (str) => {
    if (!str) return 'غير متوفر';
    if (/[a-zA-Z]/.test(str) || str.length > 20) return 'غير متوفر';
    return str;
  };
  const printPhone = p.info && p.info.phone && cleanPhone(p.info.phone) !== 'غير متوفر' ? cleanPhone(p.info.phone) : cleanPhone(activePatientId);

  const rxRows = v.prescriptions.map((item, idx) => `
    <tr>
      <td style="padding:12px; border-bottom:1px solid #e2e8f0; font-weight:700; color:#0f172a; font-size:1.1rem;">
         <span style="display:inline-block; width:24px; color:#10b981; font-weight:normal; font-size:0.9rem;">${idx + 1}.</span>
         ${sanitize(item.name)}
      </td>
      <td style="padding:12px; border-bottom:1px solid #e2e8f0; font-size:1.05rem; color:#334155;">
         ${sanitize(item.dose) || ''}
         ${item.freq ? `<br><span style="font-size:0.9rem; color:#64748b;">الجرعة: ${sanitize(item.freq)}</span>` : ''}
         ${item.dur ? `<br><span style="font-size:0.9rem; color:#64748b;">المدة: ${sanitize(item.dur)}</span>` : ''}
      </td>
    </tr>
  `).join('');

  const w = window.open('', '_blank');
  w.document.write(`
    <html dir="rtl">
      <head>
        <title>وصفة طبية - ${sanitize(p.info ? p.info.name : 'مريض')}</title>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>
          body { font-family: 'Tajawal', sans-serif; direction: rtl; margin: 0; padding: 40px; color: #0f172a; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #10b981; padding-bottom: 20px; margin-bottom: 30px; }
          .clinic-info h1 { margin: 0 0 5px 0; color: #0f172a; font-size: 1.8rem; font-weight: 800; }
          .clinic-info p { margin: 0; color: #475569; font-size: 1.1rem; }
          .doc-info { text-align: left; }
          .doc-info h2 { margin: 0 0 5px 0; color: #10b981; font-size: 1.5rem; }
          .doc-info p { margin: 0; color: #475569; }
          .patient-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 30px; display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
          .p-field { font-size: 1.1rem; }
          .p-field span { color: #64748b; margin-left: 5px; }
          .rx-symbol { font-size: 4rem; color: #10b981; opacity: 0.15; position: absolute; top: 250px; left: 50px; font-family: serif; font-style: italic; font-weight: bold; z-index:-1; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { text-align: right; border-bottom: 2px solid #10b981; padding: 12px; color: #10b981; font-size: 1.2rem; }
          .footer { margin-top: 60px; display: flex; justify-content: space-between; align-items: flex-end; }
          .sig-box { text-align: center; width: 250px; }
          .sig-line { border-top: 1px dashed #cbd5e1; margin-top: 50px; padding-top: 10px; color: #64748b; font-weight: bold; }
          .qr-placeholder { width: 80px; height: 80px; border: 1px solid #e2e8f0; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #cbd5e1; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
            .rx-symbol { color: #10b981 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 20px; text-align: left;">
          <button onclick="window.print()" style="background:#10b981; color:white; border:none; padding:10px 20px; border-radius:8px; font-family:'Tajawal'; font-size:1.1rem; cursor:pointer; box-shadow:0 4px 6px rgba(16,185,129,0.2);"><i class="fas fa-print"></i> طباعة الوصفة</button>
        </div>
        
        <div class="header">
          <div class="clinic-info">
            <h1><i class="fas fa-clinic-medical" style="color:#10b981; margin-left:8px;"></i>${sanitize(clinicName)}</h1>
            <p>سجل طبي إلكتروني معتمد - ARGON EMR</p>
          </div>
          <div class="doc-info">
            <h2>د. ${sanitize(v.docName)}</h2>
            <p>التاريخ: <bdi>${sanitize(v.date)}</bdi></p>
          </div>
        </div>

        <div class="patient-card">
          <div class="p-field"><span>اسم المريض:</span> <b>${sanitize(p.info && p.info.name ? p.info.name : 'مريض')}</b></div>
          <div class="p-field"><span>رقم الهاتف:</span> <b><bdi>${printPhone}</bdi></b></div>
          <div class="p-field"><span>العمر:</span> <b>${p.info && p.info.age ? p.info.age + ' سنة' : 'غير محدد'}</b></div>
          <div class="p-field"><span>الجنس:</span> <b>${p.info && p.info.gender ? p.info.gender : 'غير محدد'}</b></div>
          ${v.diagnosis && v.diagnosis !== '—' ? `<div class="p-field" style="grid-column: span 2; border-top:1px dashed #cbd5e1; padding-top:10px; margin-top:5px;"><span>التشخيص:</span> <b style="color:#0f172a">${sanitize(v.diagnosis)}</b></div>` : ''}
        </div>

        <div style="position: relative; z-index:1;">
          <div class="rx-symbol">Rx</div>
          <h3 style="color:#0f172a; font-size:1.4rem; margin-bottom:10px;"><i class="fas fa-pills" style="color:#10b981; margin-left:8px;"></i>الوصفة الطبية (الأدوية)</h3>
          <table>
            <thead>
              <tr>
                <th>اسم الدواء</th>
                <th>الجرعة والتعليمات</th>
              </tr>
            </thead>
            <tbody>
              ${rxRows}
            </tbody>
          </table>
        </div>

        <div class="footer">
          <div>
             <div class="qr-placeholder"><i class="fas fa-qrcode fa-2x"></i></div>
             <div style="font-size:0.8rem; color:#94a3b8; margin-top:8px;">رقم الزيارة: ${vk.substring(0,8)}</div>
          </div>
          <div class="sig-box">
            <div class="sig-line">توقيع الطبيب والختم الرسمي</div>
          </div>
        </div>
      </body>
    </html>
  `);
  w.document.close();
  setTimeout(() => w.focus(), 200);
}
"""

if print_summary_func_def in content:
    content = content.replace(print_summary_func_def, print_prescription_func + '\\n' + print_summary_func_def)
    print('Function injected successfully.')
else:
    print('Target for function not found.')

with open('emr-app.js', 'w', encoding='utf-8') as f:
    f.write(content)
