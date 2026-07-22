
/**
 * يحسب العمر بالسنوات من تاريخ الميلاد حتى اليوم
 * @param {string} dob — "YYYY-MM-DD"
 * @returns {number|null}
 */
window.ArgonCalcAge = function(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : null;
};

/**
 * يعرض العمر بشكل لطيف: "22 سنة" أو "8 أشهر" للرضع
 * @param {string} dob — "YYYY-MM-DD"
 * @returns {string}
 */
window.ArgonAgeDisplay = function(dob) {
  if (!dob) return '—';
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return '—';
  const today = new Date();
  let years  = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth()    - birth.getMonth();
  if (today.getDate() < birth.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  if (years < 0) return '—';
  if (years === 0 && months === 0) return 'أقل من شهر';
  if (years === 0) return `${months} شهر`;
  if (years <  2) return `${years} سنة و${months} شهر`;
  return `${years} سنة`;
};

/**
 * يتحقق أن تاريخ الميلاد منطقي (لا مستقبلي، لا أكثر من 130 سنة)
 */
window.ArgonValidateDOB = function(dob) {
  if (!dob) return { ok: false, msg: 'تاريخ الميلاد مطلوب' };
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return { ok: false, msg: 'تاريخ غير صالح' };
  const today = new Date();
  if (birth > today) return { ok: false, msg: 'تاريخ الميلاد لا يمكن أن يكون في المستقبل' };
  const age = ArgonCalcAge(dob);
  if (age > 130) return { ok: false, msg: 'تاريخ الميلاد غير منطقي (أكثر من 130 سنة)' };
  return { ok: true, age };
};

﻿window.ARGON_TEXT_ENCODING = 'UTF-8'; // Phase 5: Permanent Protection

/**
 * ARGON MEDICAL OS — Enterprise Features v4.0

 * PDF Generation (RTL), Excel Export, Advanced Optimizations
 */

const ArgonEnterprise = {
    // ── 1. PDF INVOICING (RTL) ──
    PDF: {
        async generateInvoice(clinicSettings, patientData, items, total, invoiceNo) {
            // Create a hidden div for the invoice
            const div = document.createElement('div');
            div.style.position = 'absolute';
            div.style.left = '-9999px';
            div.style.top = '0';
            div.style.width = '800px';
            div.style.background = '#fff';
            div.style.color = '#000';
            div.style.fontFamily = "'Tajawal', sans-serif";
            div.dir = 'rtl';
            
            const dateStr = new Date().toLocaleDateString('ar-JO');
            const itemsHtml = items.map((i, idx) => `
                <tr style="border-bottom:1px solid #ddd">
                    <td style="padding:10px">${idx+1}</td>
                    <td style="padding:10px">${i.name}</td>
                    <td style="padding:10px">${i.qty}</td>
                    <td style="padding:10px">${i.price} JOD</td>
                    <td style="padding:10px">${(i.qty * i.price).toFixed(2)} JOD</td>
                </tr>
            `).join('');

            div.innerHTML = `
                <div style="padding:40px;border:2px solid #0d9488;border-radius:12px;margin:20px">
                    <div style="display:flex;justify-content:space-between;border-bottom:2px solid #0d9488;padding-bottom:20px;margin-bottom:20px">
                        <div>
                            <h1 style="color:#0d9488;margin:0">${clinicSettings.name}</h1>
                            <p style="margin:5px 0;color:#555">${clinicSettings.address || ''} | ${clinicSettings.phone || ''}</p>
                        </div>
                        <div style="text-align:left">
                            <h2 style="margin:0;color:#333">فاتورة ضريبية</h2>
                            <p style="margin:5px 0;color:#555">رقم: ${invoiceNo}</p>
                            <p style="margin:5px 0;color:#555">التاريخ: ${dateStr}</p>
                        </div>
                    </div>
                    
                    <div style="margin-bottom:30px;background:#f8f9fa;padding:15px;border-radius:8px">
                        <h3 style="margin:0 0 10px;color:#0d9488">بيانات المريض:</h3>
                        <p style="margin:0"><strong>الاسم:</strong> ${patientData.name}</p>
                        <p style="margin:5px 0 0"><strong>الهاتف:</strong> ${patientData.phone}</p>
                    </div>

                    <table style="width:100%;border-collapse:collapse;margin-bottom:30px;text-align:right">
                        <thead>
                            <tr style="background:#0d9488;color:#fff">
                                <th style="padding:10px">#</th>
                                <th style="padding:10px">البيان</th>
                                <th style="padding:10px">الكمية</th>
                                <th style="padding:10px">السعر الإفرادي</th>
                                <th style="padding:10px">المجموع</th>
                            </tr>
                        </thead>
                        <tbody>${itemsHtml}</tbody>
                    </table>

                    <div style="display:flex;justify-content:flex-end">
                        <div style="width:300px;background:#f8f9fa;padding:20px;border-radius:8px;border:1px solid #ddd">
                            <h2 style="margin:0;color:#0d9488;display:flex;justify-content:space-between">
                                <span>الإجمالي:</span>
                                <span>${total.toFixed(2)} JOD</span>
                            </h2>
                        </div>
                    </div>
                    
                    <div style="margin-top:50px;text-align:center;color:#777;font-size:12px;border-top:1px solid #ddd;padding-top:20px">
                        شكراً لثقتكم بنا. مع تمنياتنا لكم بالصحة والعافية.
                        <br>تم إنشاء هذه الفاتورة بواسطة ARGON Medical OS
                    </div>
                </div>
            `;
            
            document.body.appendChild(div);

            // Load html2pdf script dynamically
            if (typeof window.html2pdf === 'undefined') {
                await this._loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
            }

            const opt = {
                margin: 0,
                filename: `Invoice_${invoiceNo}_${patientData.name}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
            };

            await window.html2pdf().set(opt).from(div).save();
            document.body.removeChild(div);
        },

        _loadScript(src) {
            return new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = src;
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
        },

        async generatePrescription(clinicSettings, patientData, medications, prescNotes, docName) {
            const div = document.createElement('div');
            div.style.position = 'absolute';
            div.style.left = '-9999px';
            div.style.top = '0';
            div.style.width = '800px';
            div.style.background = '#fff';
            div.style.color = '#000';
            div.style.fontFamily = "'Tajawal', sans-serif";
            div.dir = 'rtl';
            
            const dateStr = new Date().toLocaleDateString('ar-JO');
            const medsHtml = medications.map((m, idx) => `
                <tr style="border-bottom:1px solid #eee">
                    <td style="padding:15px;font-weight:bold;color:#334155">${idx+1}</td>
                    <td style="padding:15px;font-weight:bold;color:#0f172a;font-size:1.1rem">${m.name}</td>
                    <td style="padding:15px;color:#475569">${m.dose || '-'}</td>
                    <td style="padding:15px;color:#475569">${m.freq || '-'}</td>
                    <td style="padding:15px;color:#475569">${m.dur || '-'}</td>
                </tr>
            `).join('');

            div.innerHTML = `
                <div style="padding:40px;border:2px solid #0d9488;border-radius:12px;margin:20px;position:relative">
                    <!-- Watermark -->
                    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%, -50%) rotate(-45deg);font-size:120px;color:rgba(13, 148, 136, 0.03);z-index:0;font-weight:900;pointer-events:none;white-space:nowrap">${clinicSettings.name}</div>
                    
                    <div style="position:relative;z-index:1">
                        <div style="display:flex;justify-content:space-between;border-bottom:2px solid #0d9488;padding-bottom:20px;margin-bottom:20px">
                            <div>
                                <h1 style="color:#0d9488;margin:0;font-size:2rem">${clinicSettings.name}</h1>
                                <p style="margin:8px 0 0;color:#64748b;font-weight:600">د. ${docName}</p>
                                <p style="margin:5px 0 0;color:#94a3b8;font-size:0.9rem">${clinicSettings.address || ''} | ${clinicSettings.phone || ''}</p>
                            </div>
                            <div style="text-align:left">
                                <h2 style="margin:0;color:#1e293b;font-size:1.5rem">وصفة طبية (Rx)</h2>
                                <p style="margin:8px 0 0;color:#64748b">التاريخ: ${dateStr}</p>
                            </div>
                        </div>
                        
                        <div style="margin-bottom:30px;background:#f8fafc;padding:15px 20px;border-radius:8px;border:1px solid #e2e8f0;display:flex;justify-content:space-between">
                            <div>
                                <h3 style="margin:0 0 10px;color:#0d9488;font-size:1.1rem">المريض:</h3>
                                <p style="margin:0;font-weight:700;color:#1e293b;font-size:1.2rem">${patientData.name}</p>
                            </div>
                            <div style="text-align:left">
                                <p style="margin:0;color:#64748b">العمر: ${patientData.age || '-'} سنة</p>
                                <p style="margin:5px 0 0;color:#64748b">الجنس: ${patientData.gender === 'male' ? 'ذكر' : (patientData.gender === 'female' ? 'أنثى' : '-')}</p>
                            </div>
                        </div>

                        <div style="font-size:4rem;color:#0d9488;line-height:1;margin-bottom:10px;font-family:serif;opacity:0.2">Rx</div>

                        <table style="width:100%;border-collapse:collapse;margin-bottom:30px;text-align:right">
                            <thead>
                                <tr style="background:#f1f5f9;color:#475569">
                                    <th style="padding:12px 15px;border-radius:0 8px 8px 0">#</th>
                                    <th style="padding:12px 15px">اسم العلاج</th>
                                    <th style="padding:12px 15px">الجرعة</th>
                                    <th style="padding:12px 15px">التكرار</th>
                                    <th style="padding:12px 15px;border-radius:8px 0 0 8px">المدة</th>
                                </tr>
                            </thead>
                            <tbody>${medsHtml}</tbody>
                        </table>

                        ${prescNotes ? `
                        <div style="margin-top:20px;padding:15px;border-right:4px solid #f59e0b;background:#fffbeb;border-radius:8px;color:#b45309">
                            <h4 style="margin:0 0 5px">تعليمات إضافية:</h4>
                            <p style="margin:0">${prescNotes.replace(/\n/g, '<br>')}</p>
                        </div>
                        ` : ''}

                        <div style="margin-top:60px;display:flex;justify-content:space-between;align-items:flex-end">
                            <div style="color:#94a3b8;font-size:0.85rem">
                                ملاحظة: هذه الوصفة صالحة لمدة 3 أيام من تاريخ الإصدار.
                            </div>
                            <div style="text-align:center;width:200px">
                                <div style="border-bottom:1px dashed #cbd5e1;margin-bottom:10px;height:40px"></div>
                                <div style="color:#475569;font-weight:700">توقيع الطبيب وختم العيادة</div>
                            </div>
                        </div>
                        
                        <div style="margin-top:40px;text-align:center;color:#94a3b8;font-size:0.8rem;border-top:1px solid #e2e8f0;padding-top:20px">
                            مع تمنياتنا لكم بالشفاء العاجل<br>تم إنشاء هذه الوصفة بواسطة ARGON EMR
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(div);

            if (typeof window.html2pdf === 'undefined') {
                await this._loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
            }

            const opt = {
                margin: 0,
                filename: `Prescription_${patientData.name}_${dateStr}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
            };

            await window.html2pdf().set(opt).from(div).save();
            document.body.removeChild(div);
        },

        async generateTimeline(clinicSettings, patientData, visitsArray) {
            const div = document.createElement('div');
            div.style.position = 'absolute';
            div.style.left = '-9999px';
            div.style.top = '0';
            div.style.width = '800px';
            div.style.background = '#fff';
            div.style.color = '#000';
            div.style.fontFamily = "'Tajawal', sans-serif";
            div.dir = 'rtl';
            
            const dateStr = new Date().toLocaleDateString('ar-JO');
            
            const visitsHtml = visitsArray.map(v => `
                <div style="margin-bottom:20px;border:1px solid #e2e8f0;border-radius:12px;padding:20px;page-break-inside:avoid">
                    <div style="display:flex;justify-content:space-between;border-bottom:1px solid #f1f5f9;padding-bottom:10px;margin-bottom:15px">
                        <div style="font-weight:800;color:#0d9488">${v.date} - ${v.time}</div>
                        <div style="color:#64748b;font-weight:700">د. ${v.docName}</div>
                    </div>
                    
                    ${v.complaint ? `<div style="margin-bottom:10px"><strong style="color:#475569">الشكوى الرئيسية:</strong><p style="margin:5px 0 0;color:#1e293b">${v.complaint}</p></div>` : ''}
                    ${v.diagnosis ? `<div style="margin-bottom:10px"><strong style="color:#475569">التشخيص النهائي:</strong><p style="margin:5px 0 0;color:#1e293b">${v.diagnosis}</p></div>` : ''}
                    ${v.notes ? `<div style="margin-bottom:10px"><strong style="color:#475569">الملاحظات الطبية:</strong><p style="margin:5px 0 0;color:#1e293b">${v.notes}</p></div>` : ''}
                    
                    ${(v.vitals && (v.vitals.bp || v.vitals.temp || v.vitals.pulse)) ? `
                    <div style="display:flex;gap:15px;margin-top:15px;background:#f8fafc;padding:10px;border-radius:8px">
                        ${v.vitals.bp ? `<div><span style="color:#64748b;font-size:0.9rem">الضغط:</span> <strong style="color:#ef4444">${v.vitals.bp}</strong></div>` : ''}
                        ${v.vitals.temp ? `<div><span style="color:#64748b;font-size:0.9rem">الحرارة:</span> <strong style="color:#f59e0b">${v.vitals.temp} °C</strong></div>` : ''}
                        ${v.vitals.pulse ? `<div><span style="color:#64748b;font-size:0.9rem">النبض:</span> <strong style="color:#3b82f6">${v.vitals.pulse} bpm</strong></div>` : ''}
                    </div>` : ''}
                </div>
            `).join('');

            div.innerHTML = `
                <div style="padding:40px;border:2px solid #0d9488;border-radius:12px;margin:20px">
                    <div style="display:flex;justify-content:space-between;border-bottom:2px solid #0d9488;padding-bottom:20px;margin-bottom:20px">
                        <div>
                            <h1 style="color:#0d9488;margin:0">${clinicSettings.name}</h1>
                            <p style="margin:5px 0;color:#555">${clinicSettings.address || ''} | ${clinicSettings.phone || ''}</p>
                        </div>
                        <div style="text-align:left">
                            <h2 style="margin:0;color:#333">السجل الطبي الموحد (EMR)</h2>
                            <p style="margin:5px 0;color:#555">تاريخ الطباعة: ${dateStr}</p>
                        </div>
                    </div>
                    
                    <div style="margin-bottom:30px;background:#f8f9fa;padding:20px;border-radius:8px;border:1px solid #ddd;display:grid;grid-template-columns:1fr 1fr;gap:15px">
                        <div>
                            <h3 style="margin:0 0 15px;color:#0d9488;grid-column:1/-1">الملف الشخصي للمريض</h3>
                            <p style="margin:0 0 8px"><strong>الاسم:</strong> ${patientData.name}</p>
                            <p style="margin:0 0 8px"><strong>الهاتف:</strong> ${patientData.phone}</p>
                            <p style="margin:0"><strong>الرقم الوطني/الهوية:</strong> ${patientData.natId || '-'}</p>
                        </div>
                        <div>
                            <h3 style="margin:0 0 15px;color:transparent;user-select:none">.</h3>
                            <p style="margin:0 0 8px"><strong>العمر:</strong> ${patientData.age || '-'}</p>
                            <p style="margin:0 0 8px"><strong>الجنس:</strong> ${patientData.gender === 'male' ? 'ذكر' : (patientData.gender === 'female' ? 'أنثى' : '-')}</p>
                            <p style="margin:0"><strong>فصيلة الدم:</strong> <span style="color:#ef4444;font-weight:800;direction:ltr;display:inline-block">${patientData.bloodType || '-'}</span></p>
                        </div>
                        
                        ${(patientData.allergies || patientData.chronic) ? `
                        <div style="grid-column:1/-1;margin-top:10px;padding-top:15px;border-top:1px dashed #cbd5e1">
                            ${patientData.allergies ? `<p style="margin:0 0 8px;color:#ef4444"><strong><i class="fas fa-exclamation-triangle"></i> حساسية:</strong> ${patientData.allergies}</p>` : ''}
                            ${patientData.chronic ? `<p style="margin:0;color:#f59e0b"><strong><i class="fas fa-notes-medical"></i> أمراض مزمنة:</strong> ${patientData.chronic}</p>` : ''}
                        </div>` : ''}
                    </div>

                    <h3 style="margin:0 0 20px;color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:10px">التاريخ الطبي والزيارات السابقة:</h3>
                    
                    <div style="display:flex;flex-direction:column;gap:10px">
                        ${visitsArray.length > 0 ? visitsHtml : '<p style="text-align:center;color:#94a3b8;padding:30px">لا يوجد سجل زيارات سابق لهذا المريض</p>'}
                    </div>

                    <div style="margin-top:50px;text-align:center;color:#777;font-size:12px;border-top:1px solid #ddd;padding-top:20px">
                        وثيقة طبية معتمدة من نظام ARGON Enterprise Medical OS
                    </div>
                </div>
            `;
            
            document.body.appendChild(div);

            if (typeof window.html2pdf === 'undefined') {
                await this._loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
            }

            const opt = {
                margin: 0,
                filename: `Medical_Record_${patientData.name}_${dateStr}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
            };

            await window.html2pdf().set(opt).from(div).save();
            document.body.removeChild(div);
        }
    },

    // ── 2. EXCEL EXPORT (RTL) ──
    Excel: {
        async exportTable(dataArray, filename, sheetName = 'Sheet1') {
            if (typeof window.XLSX === 'undefined') {
                await ArgonEnterprise.PDF._loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
            }

            // Phase 4: Export Validation - Check first 20 records for Mojibake
            const sample = dataArray.slice(0, 20);
            const mojibakePatterns = ['ط§', 'ط¹', 'ظ…', 'ظٹ', 'Ø', 'Ù', 'Ã', 'Â'];
            for (const row of sample) {
                const rowStr = JSON.stringify(row);
                for (const pattern of mojibakePatterns) {
                    if (rowStr.includes(pattern)) {
                        console.error(`🛑 Arabic Encoding Validation Failed in Export: ${pattern} detected.`);
                        throw new Error('Arabic Encoding Validation Failed');
                    }
                }
            }

            const wb = window.XLSX.utils.book_new();
            wb.Workbook = { Views: [{ RTL: true }] }; // Force RTL view in Excel

            const ws = window.XLSX.utils.json_to_sheet(dataArray);
            
            // Auto-size columns based on content length
            const colWidths = [];
            dataArray.forEach(row => {
                Object.keys(row).forEach((key, i) => {
                    const valStr = String(row[key]);
                    colWidths[i] = Math.max(colWidths[i] || 0, valStr.length, key.length);
                });
            });
            ws['!cols'] = colWidths.map(w => ({ wch: w + 5 })); // Add padding

            window.XLSX.utils.book_append_sheet(wb, ws, sheetName);
            window.XLSX.writeFile(wb, `${filename}.xlsx`);
        },

        async exportComprehensiveReport(clinicId) {
            if (!window.firebase || !window.firebase.database) throw new Error("Firebase not ready");
            
            if (typeof toast === 'function') toast("جاري سحب وتجميع البيانات الشاملة... يرجى الانتظار", "info");
            
            if (typeof window.XLSX === 'undefined') {
                await ArgonEnterprise.PDF._loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
            }

            const db = window.firebase.database();
            const snap = await db.ref(`clinics/${clinicId}`).once('value');
            const data = snap.val();
            
            if (!data) {
                if (typeof toast === 'function') toast("لم يتم العثور على بيانات العيادة", "err");
                return;
            }

            const wb = window.XLSX.utils.book_new();
            wb.Workbook = { Views: [{ RTL: true }] };
            const dateStr = new Date().toLocaleDateString('ar-JO', { year: 'numeric', month: '2-digit', day: '2-digit' });
            const clinicName = (data.settings && data.settings.name) ? data.settings.name : "العيادة";

            const appendSheet = (dataArray, sheetName) => {
                if (!dataArray || dataArray.length === 0) {
                    dataArray = [{"ملاحظة": "لا يوجد بيانات"}];
                }
                const ws = window.XLSX.utils.json_to_sheet(dataArray);
                const colWidths = [];
                dataArray.forEach(row => {
                    Object.keys(row).forEach((key, i) => {
                        const valStr = String(row[key]);
                        colWidths[i] = Math.max(colWidths[i] || 0, valStr.length, key.length);
                    });
                });
                ws['!cols'] = colWidths.map(w => ({ wch: w + 5 }));
                window.XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));
            };

            // 1. Summary
            const patientsCount = data.patients ? Object.keys(data.patients).length : 0;
            const aptsCount = (data.bookings ? Object.keys(data.bookings).length : 0) + (data.completedBookings ? Object.keys(data.completedBookings).length : 0);
            const docCount = data.doctors ? Object.keys(data.doctors).length : 0;
            const staffCount = data.staff ? Object.keys(data.staff).length : 0;
            
            const summaryData = [{
                "اسم العيادة": clinicName,
                "رقم الهاتف": data.settings?.phone || "-",
                "إجمالي المرضى": patientsCount,
                "إجمالي المواعيد": aptsCount,
                "عدد الأطباء": docCount,
                "طاقم العمل": staffCount,
                "تاريخ التقرير": dateStr
            }];
            appendSheet(summaryData, "ملخص وإحصائيات");

            // 2. Patients
            const ptsData = [];
            if (data.patients) {
                const genderMap = { 'male': 'ذكر', 'female': 'أنثى', 'ذكر': 'ذكر', 'أنثى': 'أنثى' };
                Object.values(data.patients).forEach(p => {
                    ptsData.push({
                        "اسم المريض": p.info?.name || "-",
                        "رقم الهاتف": p.info?.phone || "-",
                        "الرقم الوطني / الهوية": p.info?.nationalId || "",
                        "تاريخ الميلاد / العمر": p.info?.age || "-",
                        "الجنس": genderMap[p.info?.gender] || p.info?.gender || "-",
                        "تاريخ التسجيل": p.info?.createdAt ? new Date(p.info.createdAt).toLocaleDateString('ar-JO') : "-"
                    });
                });
            }
            appendSheet(ptsData, "سجل المرضى");

            // 3. Appointments & Bookings
            const aptData = [];
            const allApts = [];
            if (data.bookings) Object.values(data.bookings).forEach(b => allApts.push(b));
            if (data.completedBookings) Object.values(data.completedBookings).forEach(b => allApts.push(b));
            
            if (allApts.length > 0) {
                allApts.sort((a,b) => new Date(`${a.date || '1970-01-01'}T${a.time || '00:00'}`) - new Date(`${b.date || '1970-01-01'}T${b.time || '00:00'}`));
                
                const statusMap = { 'waiting': 'قيد الانتظار', 'in-progress': 'في الداخل', 'done': 'مكتمل', 'cancelled': 'ملغي' };
                allApts.forEach(a => {
                    aptData.push({
                        "التاريخ": a.date || "-",
                        "الوقت": a.time || "-",
                        "رقم الدور": a.queueNum || a.queue || "-",
                        "اسم المريض": a.patName || a.patientName || "-",
                        "الحالة": a.status ? (statusMap[a.status] || a.status) : "-",
                        "نوع الحجز": a.type === 'consultation' ? 'كشفية' : (a.type === 'followup' ? 'مراجعة' : a.type || '-')
                    });
                });
            }
            appendSheet(aptData, "المواعيد والحجوزات");

            // 4. Doctors
            const docData = [];
            if (data.doctors) {
                Object.values(data.doctors).forEach(d => {
                    docData.push({
                        "اسم الطبيب": d.name || "",
                        "التخصص": d.specialty || "",
                        "الرسوم (كشفية)": d.fee || "-",
                        "أيام الدوام": d.workDays ? d.workDays.map(x => ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'][x]).join(', ') : "",
                        "ساعات العمل": (d.workStart || "") + " - " + (d.workEnd || "")
                    });
                });
            }
            appendSheet(docData, "الكادر الطبي");

            // 5. Staff
            const staffData = [];
            if (data.staff) {
                Object.values(data.staff).forEach(s => {
                    staffData.push({
                        "الاسم": s.name || "",
                        "الهاتف": s.phone || "",
                        "الرقم الوطني": s.nationalId || "",
                        "الصلاحية (الدور)": s.role || ""
                    });
                });
            }
            appendSheet(staffData, "طاقم العمل");

            // 6. Invoices Detail (تفاصيل الفواتير)
            const invData = [];
            if (data.invoices) {
                Object.entries(data.invoices).forEach(([invId, inv]) => {
                    const patName = (data.patients && data.patients[inv.patientId]) ? data.patients[inv.patientId].info?.name : (inv.patientName || '-');
                    const patPhone = (data.patients && data.patients[inv.patientId]) ? data.patients[inv.patientId].info?.phone : (inv.patientPhone || '-');
                    const items = inv.items || [];
                    const invDate = inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('ar-JO') : '-';

                    // Calculate paid for this invoice
                    let invPaid = 0;
                    if (data.financial_transactions) {
                        Object.values(data.financial_transactions).forEach(tx => {
                            if (tx.invoiceId === invId && tx.status !== 'voided') {
                                if (tx.type === 'PAYMENT') invPaid += (parseFloat(tx.amount) || 0);
                                if (tx.type === 'REVERSAL') invPaid -= (parseFloat(tx.amount) || 0);
                            }
                        });
                    }
                    const invTotal = parseFloat(inv.total) || 0;
                    const invRemaining = parseFloat((invTotal - invPaid).toFixed(2));
                    let payStatus = 'غير مدفوعة';
                    if (invRemaining <= 0) payStatus = 'مدفوعة بالكامل';
                    else if (invPaid > 0) payStatus = 'دفع جزئي';

                    if (items.length === 0) {
                        invData.push({
                            "رقم الفاتورة": invId, "التاريخ": invDate,
                            "اسم المريض": patName, "الهاتف": patPhone,
                            "البند": "-", "القسم": "-", "السعر (د.أ)": 0,
                            "إجمالي الفاتورة": invTotal, "المدفوع": invPaid,
                            "المتبقي": invRemaining, "حالة الدفع": payStatus
                        });
                    } else {
                        items.forEach((item, idx) => {
                            const n = (item.name || '').toLowerCase();
                            let dept = 'أخرى';
                            if (n.includes('كشفية')) dept = 'كشفية طبية';
                            else if (n.includes('تحليل')) dept = 'مختبر';
                            else if (n.includes('تصوير') || n.includes('أشعة')) dept = 'أشعة';
                            else if (n.includes('صيدل') || n.includes('دواء')) dept = 'صيدلية';

                            invData.push({
                                "رقم الفاتورة": idx === 0 ? invId : '',
                                "التاريخ": idx === 0 ? invDate : '',
                                "اسم المريض": idx === 0 ? patName : '',
                                "الهاتف": idx === 0 ? patPhone : '',
                                "البند": item.name || '-',
                                "القسم": dept,
                                "السعر (د.أ)": parseFloat(item.price) || 0,
                                "إجمالي الفاتورة": idx === 0 ? invTotal : '',
                                "المدفوع": idx === 0 ? invPaid : '',
                                "المتبقي": idx === 0 ? invRemaining : '',
                                "حالة الدفع": idx === 0 ? payStatus : ''
                            });
                        });
                    }
                });
            }
            appendSheet(invData, "تفاصيل الفواتير");

            // 7. Unpaid Accounts (الذمم المدينة)
            const unpaidData = [];
            if (data.invoices) {
                const patBal = {};
                Object.entries(data.invoices).forEach(([invId, inv]) => {
                    const pid = inv.patientId;
                    if (!pid) return;
                    if (!patBal[pid]) {
                        const pn = (data.patients && data.patients[pid]) ? data.patients[pid].info?.name : (inv.patientName || '-');
                        const pp = (data.patients && data.patients[pid]) ? data.patients[pid].info?.phone : (inv.patientPhone || '-');
                        patBal[pid] = { name: pn, phone: pp, total: 0, paid: 0 };
                    }
                    patBal[pid].total += parseFloat(inv.total) || 0;
                    // Calc paid
                    if (data.financial_transactions) {
                        Object.values(data.financial_transactions).forEach(tx => {
                            if (tx.invoiceId === invId && tx.status !== 'voided') {
                                if (tx.type === 'PAYMENT') patBal[pid].paid += (parseFloat(tx.amount) || 0);
                                if (tx.type === 'REVERSAL') patBal[pid].paid -= (parseFloat(tx.amount) || 0);
                            }
                        });
                    }
                });
                Object.values(patBal).forEach(p => {
                    const rem = parseFloat((p.total - p.paid).toFixed(2));
                    if (rem > 0) {
                        unpaidData.push({
                            "اسم المريض": p.name, "الهاتف": p.phone,
                            "إجمالي المطالبات": p.total.toFixed(2),
                            "المبلغ المدفوع": p.paid.toFixed(2),
                            "الرصيد المتبقي (ذمة)": rem.toFixed(2),
                            "الحالة": p.paid > 0 ? "دفع جزئي" : "غير مدفوع"
                        });
                    }
                });
            }
            appendSheet(unpaidData.length ? unpaidData : [{"ملاحظة": "لا توجد ذمم مدينة مستحقة"}], "الذمم المدينة");

            // 8. Financial Transactions (الحركات المالية)
            const txData = [];
            if (data.financial_transactions) {
                Object.values(data.financial_transactions).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || '')).forEach(tx => {
                    const pn = (data.patients && data.patients[tx.patientId]) ? data.patients[tx.patientId].info?.name : '-';
                    txData.push({
                        "التاريخ": tx.timestamp ? new Date(tx.timestamp).toLocaleString('ar-JO') : '-',
                        "اسم المريض": pn,
                        "النوع": tx.type === 'PAYMENT' ? 'دفعة' : (tx.type === 'REVERSAL' ? 'إلغاء/استرجاع' : tx.type || '-'),
                        "المبلغ (د.أ)": parseFloat(tx.amount).toFixed(2),
                        "رقم الفاتورة": tx.invoiceId || 'بدون فاتورة',
                        "الملاحظات": tx.reason || '-',
                        "الحالة": tx.status === 'voided' ? 'ملغاة' : 'نشطة'
                    });
                });
            }
            appendSheet(txData.length ? txData : [{"ملاحظة": "لا توجد حركات مالية مسجلة"}], "الحركات المالية");

            window.XLSX.writeFile(wb, `تقرير_شامل_${clinicName}_${dateStr.replace(/\//g,'-')}.xlsx`);
            if (typeof toast === 'function') toast("تم تصدير التقرير بنجاح!", "ok");
        }
    },

    // ── 3. ADVANCED CACHING & PERFORMANCE (IndexedDB fallback) ──
    Cache: {
        async init() {
            // Simple LRU cache wrapper over localStorage for extremely fast reads of static clinical data
            // (e.g. catalog, templates) to prevent waiting for Firebase on reload
            if (!window._argonCache) window._argonCache = {};
        },
        set(key, data) {
            try {
                localStorage.setItem(`ARGON_CACHE_${key}`, JSON.stringify({
                    ts: Date.now(), data
                }));
                window._argonCache[key] = data;
            } catch(e) {}
        },
        get(key, maxAgeHours = 24) {
            if (window._argonCache[key]) return window._argonCache[key];
            try {
                const raw = localStorage.getItem(`ARGON_CACHE_${key}`);
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                if (Date.now() - parsed.ts > maxAgeHours * 3600000) return null; // expired
                window._argonCache[key] = parsed.data;
                return parsed.data;
            } catch(e) { return null; }
        }
    },

    // ── 4. ENTERPRISE LIVE UPDATE ENGINE ──
    LiveUpdate: {
        _initialized: false,
        init(dbRef, basePath) {
            if (this._initialized) return;
            this._initialized = true;
            
            const verRef = dbRef.ref(`${basePath}/system_version`);
            verRef.on('value', snap => {
                const newVer = snap.val();
                if (!newVer) return; // Not set yet
                
                const currentVer = localStorage.getItem('ARGON_VERSION');
                if (!currentVer) {
                    // First time, just record it
                    localStorage.setItem('ARGON_VERSION', newVer);
                } else if (currentVer !== newVer) {
                    // Version changed! Trigger professional auto-refresh
                    this.triggerUpdate(newVer);
                }
            });
        },
        triggerUpdate(newVersion) {
            const toastDiv = document.createElement('div');
            toastDiv.innerHTML = `
                <div style="position:fixed;bottom:25px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg, #2563eb, #3b82f6);color:white;padding:15px 35px;border-radius:30px;box-shadow:0 15px 30px rgba(37,99,235,0.4);z-index:999999;font-weight:bold;display:flex;align-items:center;gap:12px;font-family:'Tajawal', sans-serif;animation: slideUpArgon 0.6s cubic-bezier(0.16, 1, 0.3, 1);">
                    <i class="fas fa-sync fa-spin" style="font-size:1.3rem"></i> 
                    <span style="font-size:1.1rem;letter-spacing:0.5px">تم إطلاق تحديث جديد للنظام! جاري التحديث التلقائي...</span>
                </div>
            `;
            document.body.appendChild(toastDiv);
            
            if(!document.getElementById('liveUpdateStyle')) {
                const style = document.createElement('style');
                style.id = 'liveUpdateStyle';
                style.innerHTML = `@keyframes slideUpArgon { from { bottom: -60px; opacity: 0; transform: translateX(-50%) scale(0.9); } to { bottom: 25px; opacity: 1; transform: translateX(-50%) scale(1); } }`;
                document.head.appendChild(style);
            }

            // Lock the screen slightly to prevent data entry during refresh
            const overlay = document.createElement('div');
            overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(255,255,255,0.4);z-index:999998;backdrop-filter:blur(2px);";
            document.body.appendChild(overlay);

            setTimeout(() => {
                localStorage.setItem('ARGON_VERSION', newVersion);
                window.location.reload(true); // Force clear cache reload
            }, 3500);
        }
    }
};

window.ArgonEnterprise = ArgonEnterprise;

// Auto-initialize LiveUpdate when Firebase is globally ready
const liveUpdateCheck = setInterval(() => {
    if (typeof db !== 'undefined' && typeof BASE !== 'undefined' && typeof db.ref === 'function') {
        clearInterval(liveUpdateCheck);
        ArgonEnterprise.LiveUpdate.init(db, BASE);
    }
}, 1500);

/**
 * ============================================================
 *  ARGON Medical OS — Smart Patient Deduplication Engine
 *  argon-patient-match.js
 *
 *  ⚠️  READ-ONLY SHADOW MODE BY DEFAULT
 *  لا يعدّل أي بيانات حقيقية حتى تفعّل FLAG يدوياً
 * ============================================================
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🚦 LAYER 1 — Feature Flags (افتح / اقفل كل ميزة مستقلة)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const ARGON_FLAGS = {
  /**
   * 🛡️ SECURITY CHANGE v4.0
   * shadowMode: false
   * ← النظام ينتقل الآن من وضع الظل (تسجيل فقط) إلى وضع الاعتراض الفعلي.
   * عند EXACT أو STRONG match → يُعيد توجيه المستخدم للملف الموجود تلقائياً.
   * عند POSSIBLE match       → يعرض نافذة تأكيد للطبيب (showMatchDialog).
   * عند NEW                  → يسمح بالإنشاء.
   * لا تُعيد تفعيل true إلا لأغراض تشخيص مؤقتة مع توثيق السبب.
   */
  shadowMode: false,           // ← CHANGED: false = Active Blocking Mode

  /** تفعيل محرك المطابقة الذكية */
  enableSmartMatch: true,

  /** تفعيل فهرس MPI للبحث السريع */
  enableMPI: false,

  /** تفعيل فلترة زيارات الطبيب */
  enableDoctorFilter: false,

  /** مستوى التسجيل: 'verbose' | 'normal' | 'errors_only' */
  logLevel: "verbose",

  /**
   * ══════════════════════════════════════════════════════════════
   * 🛡️ PATIENT IDENTITY PROTECTION — Wave 2
   * ══════════════════════════════════════════════════════════════
   *
   * REQUIRE_NID_FOR_LINKING:
   * يبقى true — الرقم الوطني إلزامي لربط الحجز بملف مريض
   */
  REQUIRE_NID_FOR_LINKING: true,
  ENFORCEMENT_MODE: false,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔧 LAYER 2 — Smart Match Engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * نتائج المطابقة الممكنة
 * EXACT     → تطابق مؤكد 100%، لا تنشئ ملفاً جديداً
 * STRONG    → تطابق قوي جداً، على الأرجح نفس الشخص
 * POSSIBLE  → تشابه، يحتاج تأكيد بشري
 * NEW       → لا يوجد تطابق، آمن لإنشاء ملف جديد
 */
const MatchResult = Object.freeze({
  EXACT: "EXACT",
  STRONG: "STRONG",
  POSSIBLE: "POSSIBLE",
  NEW: "NEW",
});

window.ArgonMedical = window.ArgonMedical || {};

window.ArgonMedical.PatientMatch = (() => {
  // ─────────────────────────────────────────────────────────
  // 🔤 Text Normalization — تطبيع النص العربي
  // ─────────────────────────────────────────────────────────

  function normalizeArabic(str) {
    if (!str || typeof str !== "string") return "";
    return str
      .trim()
      // حذف التشكيل (فتحة، ضمة، كسرة، شدة، سكون، إلخ)
      .replace(/[\u0610-\u061A\u064B-\u065F\u0670]/g, "")
      .replace(/^ال/, "")           // حذف ال التعريف من البداية
      .replace(/[أإآا]/g, "ا")      // توحيد الهمزات
      .replace(/ة/g, "ه")           // توحيد التاء المربوطة
      .replace(/ى/g, "ي")           // توحيد الألف المقصورة
      .replace(/\s+/g, " ")         // مسافات زائدة
      .toLowerCase();
  }

  function nameSimilarity(name1, name2) {
    const a = normalizeArabic(name1);
    const b = normalizeArabic(name2);

    if (!a || !b) return 0;
    if (a === b) return 1.0;

    const getTrigrams = (s) => {
      const trigrams = new Set();
      for (let i = 0; i < s.length - 2; i++) {
        trigrams.add(s.slice(i, i + 3));
      }
      return trigrams;
    };

    const tA = getTrigrams(a);
    const tB = getTrigrams(b);

    let trigramScore = 0;
    if (tA.size > 0 && tB.size > 0) {
      let intersection = 0;
      tA.forEach((t) => { if (tB.has(t)) intersection++; });
      trigramScore = (2 * intersection) / (tA.size + tB.size);
    }

    const charScore = (() => {
      const shorter = a.length <= b.length ? a : b;
      const longer  = a.length <= b.length ? b : a;
      let matches = 0;
      const used = new Array(longer.length).fill(false);
      for (const ch of shorter) {
        const idx = longer.split("").findIndex((c, i) => c === ch && !used[i]);
        if (idx !== -1) { matches++; used[idx] = true; }
      }
      return (2 * matches) / (a.length + b.length);
    })();

    return Math.max(trigramScore, charScore);
  }

  function normalizePhone(phone) {
    if (!phone) return "";
    return String(phone)
      .replace(/\s+/g, "")
      .replace(/^\+/, "00")
      .replace(/^00962/, "0")
      .replace(/[^\d]/g, "");
  }

  // ─────────────────────────────────────────────────────────
  // 🔍 الدالة الرئيسية: findMatch
  // ─────────────────────────────────────────────────────────

      async function findMatch(clinicId, incoming, db) {
    if (!ARGON_FLAGS.enableSmartMatch) {
      return { result: MatchResult.NEW, confidence: 0, reason: "SmartMatch disabled" };
    }

    const inNID   = ArgonNID.cleanNID(incoming.nationalId || '');
    const inPhone = (incoming.phone || '').replace(/\D/g,'');
    const inName  = incoming.name || '';

    // ══════════════════════════════════════════════════════════
    // 🔒 ABSOLUTE RULE #1 — رقم وطني موجود = EXACT فوري
    // ══════════════════════════════════════════════════════════
    if (ArgonNID.isValidNID(inNID)) {
      try {
        const nidSnap = await db
          .ref(`clinics/${clinicId}/patients`)
          .orderByChild('info/nationalId')
          .equalTo(inNID)
          .once('value');

        let matchedByNID = null;
        nidSnap.forEach(child => {
          if (!matchedByNID) {
            matchedByNID = { id: child.key, ...child.val().info };
          }
        });

        if (matchedByNID) {
          return {
            result:      MatchResult.EXACT,
            confidence:  1.0,
            matchedId:   matchedByNID.id,
            matchedName: matchedByNID.name,
            reason:      '🔒 National ID exact match — ملف موجود مسجل بهذا الرقم الوطني',
            nidMatch:    true
          };
        }
      } catch (err) {
        console.error('[ARGON:Match] NID query error:', err);
      }
    }

    // ══════════════════════════════════════════════════════════
    // 🔒 ABSOLUTE RULE #2 — لا رقم وطني = لا ملف جديد
    // ══════════════════════════════════════════════════════════
    if (!ArgonNID.isValidNID(inNID)) {
      return {
        result:      'NEEDS_NID',
        confidence:  0,
        reason:      '🚫 الرقم الوطني غير موجود — يجب إدخاله قبل المتابعة',
        needsNID:    true
      };
    }

    // ══════════════════════════════════════════════════════════
    // البحث بالهاتف
    // ══════════════════════════════════════════════════════════
    let candidates = [];
    try {
      const snap = await db
        .ref(`clinics/${clinicId}/patients`)
        .orderByChild('info/phone')
        .equalTo(incoming.phone)
        .once('value');
      snap.forEach(child => {
        candidates.push({ id: child.key, ...child.val().info });
      });
    } catch (err) {
      console.error('[ARGON:Match] Phone query error:', err);
      return { result: MatchResult.NEW, confidence: 0, reason: 'DB error' };
    }

    if (!candidates.length) {
      return { result: MatchResult.NEW, confidence: 0, reason: 'No phone match' };
    }

    let best = null, bestScore = 0;
    for (const c of candidates) {
      const score = nameSimilarity(inName, c.name);
      if (score > bestScore) { bestScore = score; best = c; }
    }

    if (bestScore >= 0.85) {
      return {
        result:      MatchResult.STRONG,
        confidence:  bestScore,
        matchedId:   best.id,
        matchedName: best.name,
        reason:      `Phone + name similarity ${(bestScore*100).toFixed(1)}%`
      };
    }
    if (bestScore >= 0.5) {
      return {
        result:      MatchResult.POSSIBLE,
        confidence:  bestScore,
        matchedId:   best.id,
        matchedName: best.name,
        reason:      `Phone match, name similarity ${(bestScore*100).toFixed(1)}% — needs confirmation`
      };
    }

    return {
      result:      MatchResult.POSSIBLE,
      confidence:  0.3,
      matchedId:   candidates[0].id,
      matchedName: candidates[0].name,
      reason:      'Same phone, different name — possible family member'
    };
  }
  return { findMatch, normalizeArabic, normalizePhone, nameSimilarity, MatchResult };
})();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📋 LAYER 3 — Shadow Engine (التسجيل الصامت)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

window.ArgonMedical.ShadowLog = (() => {
  async function log(clinicId, matchResult, context, db) {
    if (!ARGON_FLAGS.shadowMode && ARGON_FLAGS.logLevel === "errors_only") return;

    const entry = {
      timestamp:   Date.now(),
      isoTime:     new Date().toISOString(),
      source:      context.source || "unknown",
      triggeredBy: context.userId || "unknown",
      incoming: {
        name:       context.incoming?.name || "",
        phone:      context.incoming?.phone || "",
        nationalId: context.incoming?.nationalId || "",
      },
      decision: {
        result:      matchResult.result,
        confidence:  matchResult.confidence,
        matchedId:   matchResult.matchedId   || null,
        matchedName: matchResult.matchedName || null,
        reason:      matchResult.reason,
      },
      shadowMode: ARGON_FLAGS.shadowMode,
      wouldHaveCreatedDuplicate:
        matchResult.result !== "NEW" && ARGON_FLAGS.shadowMode,
    };

    try {
      await db.ref(`clinics/${clinicId}/smart_log`).push(entry);
      if (ARGON_FLAGS.logLevel === "verbose") {
        console.log(
          `[ARGON:Shadow] ${entry.decision.result} | ${entry.decision.reason}`
        );
      }
    } catch (err) {
      console.error("[ARGON:Shadow] Log write failed:", err);
    }
  }

  return { log };
})();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🪟 نافذة التأكيد — showArgonMatchDialog()
// تظهر فقط عند POSSIBLE وshadowMode = false
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

window.ArgonMedical = window.ArgonMedical || {};

/**
 * يعرض نافذة تأكيد للمستخدم عند نتيجة POSSIBLE
 *
 * @param {object} matchResult   - نتيجة findMatch
 * @param {Function} onUseExisting - callback إذا اختار "نفس الشخص"
 * @param {Function} onCreateNew   - callback إذا اختار "فرد عائلة جديد"
 */
window.ArgonMedical.showMatchDialog = function(matchResult, onUseExisting, onCreateNew) {
  // أزل أي نافذة سابقة
  const old = document.getElementById('_argonMatchOverlay');
  if (old) old.remove();

  const conf = Math.round((matchResult.confidence || 0) * 100);
  const isFamily = matchResult.reason && matchResult.reason.includes('family member');
  const reasonText = isFamily
    ? 'نفس رقم الهاتف — قد يكون فرداً من العائلة'
    : `نسبة تشابه الاسم: ${conf}%`;

  const overlay = document.createElement('div');
  overlay.id = '_argonMatchOverlay';
  overlay.style.cssText = `
    position: fixed; inset: 0;
    background: rgba(3,11,10,0.75);
    backdrop-filter: blur(8px);
    z-index: 999999;
    display: flex; align-items: center; justify-content: center;
    padding: 20px; font-family: 'Tajawal', sans-serif;
    animation: _argonFadeIn 0.2s ease;
  `;

  // أضف animation keyframe مرة واحدة
  if (!document.getElementById('_argonMatchStyle')) {
    const style = document.createElement('style');
    style.id = '_argonMatchStyle';
    style.textContent = `
      @keyframes _argonFadeIn { from { opacity:0; } to { opacity:1; } }
      @keyframes _argonSlideUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
      #_argonMatchCard { animation: _argonSlideUp 0.25s ease; }
      #_argonMatchCard .am-btn { transition: opacity 0.15s, transform 0.15s; cursor: pointer; border-radius: 10px; padding: 11px 0; font-family: 'Tajawal', sans-serif; font-size: 0.92rem; font-weight: 700; width: 100%; border: none; }
      #_argonMatchCard .am-btn:hover { opacity: 0.88; transform: translateY(-1px); }
      #_argonMatchCard .am-btn:active { transform: scale(0.98); }
    `;
    document.head.appendChild(style);
  }

  overlay.innerHTML = `
    <div id="_argonMatchCard" style="
      background: var(--panel, #0f172a);
      border: 1px solid var(--border, #334155);
      border-radius: 20px;
      padding: 28px 24px;
      width: 100%; max-width: 430px;
      box-shadow: 0 24px 60px rgba(0,0,0,0.5);
      direction: rtl;
    ">
      <!-- Header -->
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px;">
        <div style="
          width:42px; height:42px; border-radius:50%;
          background:rgba(245,158,11,0.12);
          display:flex; align-items:center; justify-content:center;
          font-size:1.3rem; flex-shrink:0;
        ">⚠️</div>
        <div>
          <div style="font-size:1rem; font-weight:800; color:var(--text,#f8fafc)">تم العثور على ملف مشابه</div>
          <div style="font-size:0.78rem; color:var(--muted,#94a3b8); margin-top:2px">${reasonText}</div>
        </div>
        <span style="
          margin-right:auto; font-size:0.7rem; font-weight:800;
          background:rgba(245,158,11,0.1); color:#f59e0b;
          border:1px solid rgba(245,158,11,0.25);
          padding:3px 10px; border-radius:20px;
        ">${conf}% تشابه</span>
      </div>

      <!-- مقارنة البيانات -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:20px;">
        <!-- الملف الموجود -->
        <div style="
          padding:12px 14px;
          border-radius:10px;
          border:2px solid rgba(14,165,233,0.35);
          background:rgba(14,165,233,0.05);
        ">
          <div style="font-size:0.7rem; color:#0ea5e9; font-weight:700; margin-bottom:6px; display:flex; align-items:center; gap:5px;">
            <span>📂</span> الملف الموجود
          </div>
          <div style="font-size:0.95rem; font-weight:800; color:var(--text,#f8fafc)">${window.ArgonMedical._escHtml(matchResult.matchedName || '—')}</div>
          <div style="font-size:0.75rem; color:var(--muted,#94a3b8); margin-top:3px; font-family:'IBM Plex Mono',monospace; direction:ltr;">${window.ArgonMedical._escHtml(matchResult.matchedId || '')}</div>
        </div>
        <!-- البيانات الواردة -->
        <div style="
          padding:12px 14px;
          border-radius:10px;
          border:1px solid var(--border,#334155);
          background:rgba(255,255,255,0.02);
        ">
          <div style="font-size:0.7rem; color:var(--muted,#94a3b8); font-weight:700; margin-bottom:6px; display:flex; align-items:center; gap:5px;">
            <span>🆕</span> الطلب الحالي
          </div>
          <div style="font-size:0.95rem; font-weight:800; color:var(--text,#f8fafc)">${window.ArgonMedical._escHtml(matchResult.incoming?.name || matchResult._incomingName || '—')}</div>
          <div style="font-size:0.75rem; color:var(--muted,#94a3b8); margin-top:3px; font-family:'IBM Plex Mono',monospace; direction:ltr;">${window.ArgonMedical._escHtml(matchResult.incoming?.phone || matchResult._incomingPhone || '')}</div>
        </div>
      </div>

      <!-- سبب المحرك -->
      <div style="
        padding:8px 12px; border-radius:8px; margin-bottom:20px;
        background:rgba(255,255,255,0.03);
        border:1px solid var(--border,#334155);
        font-size:0.78rem; color:var(--muted,#94a3b8);
        display:flex; align-items:center; gap:7px;
      ">
        <span style="font-size:1rem">🤖</span>
        <span>${window.ArgonMedical._escHtml(matchResult.reason || '')}</span>
      </div>

      <!-- أزرار القرار -->
      <div style="display:flex; flex-direction:column; gap:8px;">
        <button class="am-btn" id="_argonBtnUse" style="background:var(--teal,#0d9488); color:#fff;">
          ✅ نفس الشخص — استخدم الملف الموجود
        </button>
        <button class="am-btn" id="_argonBtnNew" style="background:rgba(255,255,255,0.04); color:var(--text,#f8fafc); border:1px solid var(--border,#334155) !important;">
          👨‍👩‍👧 فرد عائلة جديد — أنشئ ملفاً مستقلاً
        </button>
        <button class="am-btn" id="_argonBtnCancel" style="background:transparent; color:var(--muted,#94a3b8); font-size:0.82rem; padding:7px 0;">
          إلغاء
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // ربط الأزرار
  document.getElementById('_argonBtnUse').onclick = () => {
    overlay.remove();
    if (typeof onUseExisting === 'function') onUseExisting(matchResult.matchedId);
  };
  document.getElementById('_argonBtnNew').onclick = () => {
    overlay.remove();
    if (typeof onCreateNew === 'function') onCreateNew();
  };
  document.getElementById('_argonBtnCancel').onclick = () => {
    overlay.remove();
  };
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });
};

// دالة مساعدة لتنظيف HTML
window.ArgonMedical._escHtml = function(str) {
  return String(str || '').replace(/[<>"'&]/g, c =>
    ({ '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":"&#39;", '&':'&amp;' }[c])
  );
};


// ═══════════════════════════════════════════════════════════════════
// 🛡️ ARGON CLINICAL INTEGRITY - WAVE 1
// ═══════════════════════════════════════════════════════════════════

window.ARGON_FEATURES = {
  ENABLE_VISIT_OWNERSHIP: true,
  ENABLE_SIGNOFF_LOCK: true,
  ENABLE_AUDIT_LOG: true,
  ENABLE_BREAK_GLASS: true
};

// ── 1. Argon Permissions ──
window.ArgonPermissions = {
  getVisitOwner: function(visit) {
    if (!visit) return null;
    // Layer of backward compatibility to resolve ownership
    return visit.docKey || visit.doctorId || visit.uid || visit.staffId || null;
  },

  canEditVisit: function(visit, currentStaffId) {
    if (!window.ARGON_FEATURES.ENABLE_VISIT_OWNERSHIP) return true;
    if (!visit || !currentStaffId) return false;

    const owner = this.getVisitOwner(visit);
    if (!owner) return false; // legacyReadOnly fallback

    const isCreator = (owner === currentStaffId);
    
    // Check lock status
    if (visit.status === 'locked' || visit.signedOff) return false;
    if (visit.lockedAt) return false;

    // Check server timestamp-based 24h auto-lock
    // Assuming server timestamp is populated in visit.signedAt or visit.createdAt
    // Note: Firebase ServerValue.TIMESTAMP gives epoch MS.
    if (visit.createdAt && typeof visit.createdAt === 'number') {
      const now = Date.now();
      if ((now - visit.createdAt) > 86400000) return false;
    }

    return isCreator;
  }
};

// ── 2. Argon Audit Log ──
window.ArgonAuditLog = {
  _currentCorrelationId: null,

  startTransaction: function() {
    this._currentCorrelationId = 'txn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    return this._currentCorrelationId;
  },

  getCorrelationId: function() {
    if (!this._currentCorrelationId) this.startTransaction();
    return this._currentCorrelationId;
  },

  log: function(entityType, entityId, action, oldValue, newValue, reason = '') {
    if (!window.ARGON_FEATURES.ENABLE_AUDIT_LOG) return;
    if (!window.firebase || !window.ArgonSession) return;

    const session = window.ArgonSession.get() || {};
    const db = window.firebase.database();
    
    const auditRecord = {
      correlationId: this.getCorrelationId(),
      entityType: entityType,
      entityId: entityId,
      action: action,
      oldValue: oldValue || null,
      newValue: newValue || null,
      performedBy: session.staffId || 'unknown',
      timestamp: new Date().toISOString(), // Use client ISO for UI sorting
      serverTime: window.firebase.database.ServerValue.TIMESTAMP, // Use server time for rigid timeline
      reason: reason
    };

    // Push to a centralized, append-only audit path
    const auditRef = db.ref('audit_logs').push();
    auditRef.set(auditRecord).catch(err => console.error('Audit Log failed:', err));
  }
};

// ── 3. Clinical Summary Versioning (Wave 2) ──
window.ArgonClinicalParser = {
  getClinicalList: function(patientData, fieldName) {
    if (!patientData || !patientData[fieldName]) return [];
    const data = patientData[fieldName];
    
    // 1. New Format (Array of Objects)
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
      return data;
    }
    
    const encodeStableId = (item, index) => {
      // Create a stable ID using base64 without relying on math.random for legacy items
      try {
        return 'legacy_' + btoa(encodeURIComponent(item)).substring(0, 15) + '_' + index;
      } catch (e) {
        return 'legacy_' + index;
      }
    };

    // 2. Legacy Format (Array of Strings)
    if (Array.isArray(data)) {
      return data.map((item, index) => ({
        entryId: encodeStableId(item, index),
        value: item,
        status: 'active',
        sourceType: 'legacy_import',
        isLegacy: true,
        schemaVersion: 2
      }));
    }
    
    // 3. Legacy Format (String)
    if (typeof data === 'string') {
      return data.split(/[,،]/).map(item => item.trim()).filter(Boolean).map((item, index) => ({
        entryId: encodeStableId(item, index),
        value: item,
        status: 'active',
        sourceType: 'legacy_import',
        isLegacy: true,
        schemaVersion: 2
      }));
    }
    
    return [];
  },

  toLegacyText: function(entries) {
    if (!Array.isArray(entries)) return '';
    return entries.filter(e => e.status === 'active').map(e => e.value).join('، ');
  }
};
