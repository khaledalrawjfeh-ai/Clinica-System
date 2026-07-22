import re

with open('emr-app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Define the precise start and end lines we want to replace
# Looking for "const fileHTML = `" up to the "return fileHTML;"
start_marker = "const fileHTML = `"
end_marker = "return fileHTML;"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker, start_idx) + len(end_marker)

replacement = """const fileHTML = `
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
        <div class="pat-field"><div class="pfl">العمر / الجنس</div><div class="pfv">${info.dob ? window.ArgonAgeDisplay(info.dob) : (info.age ? \`\${info.age} سنة (تقريبي)\` : 'غير محدد')} · ${info.gender || 'غير محدد'}</div></div>
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
    return \`<div style="color:#b91c1c; font-size:0.85rem;">• \${a.value} <span style="background:#dc2626; color:white; padding:1px 4px; border-radius:3px; font-size:0.7rem; margin-right:4px;">\${a.severity}</span> <span style="color:#94a3b8; font-size:0.75rem; margin-right:6px;">(بواسطة: د. \${sanitize(resolveStaffName(a.addedBy))})</span></div>\`;
  }).join('')}
       </div>
    </div>
    ` : ''}
      </div>
      ${info.notes ? \`<div class="pat-field" style="margin-top:14px"><div class="pfl">ملاحظات عامة</div><div class="pfv" style="font-weight:normal;font-size:.82rem">\${sanitize(info.notes)}</div></div>\` : ''}
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
      ${window.ArgonSpecialtyLoader && window.ArgonSpecialtyLoader.hasFeature('dentalChart') ? `
      <button class="emr-tab-btn ${activeEmrTab === 'dental-chart-tab' ? 'active' : ''}" onclick="switchEmrTab('dental-chart-tab')" style="background:var(--surf);border:1px solid var(--border);color:var(--muted);padding:8px 16px;border-radius:10px;font-family:'Tajawal',sans-serif;font-weight:700;font-size:0.85rem;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all 0.2s">
        <i class="fas fa-tooth" style="color:#3b82f6"></i> 🦷 الرسم البياني للأسنان
      </button>` : ''}
      ${window.ArgonSpecialtyLoader && window.ArgonSpecialtyLoader.hasFeature('growthCharts') ? `
      <button class="emr-tab-btn ${activeEmrTab === 'growth-chart-tab' ? 'active' : ''}" onclick="switchEmrTab('growth-chart-tab')" style="background:var(--surf);border:1px solid var(--border);color:var(--muted);padding:8px 16px;border-radius:10px;font-family:'Tajawal',sans-serif;font-weight:700;font-size:0.85rem;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all 0.2s">
        <i class="fas fa-chart-line" style="color:#0ea5e9"></i> 📈 منحنيات النمو
      </button>` : ''}
      ${window.ArgonSpecialtyLoader && (window.ArgonSpecialtyLoader.hasFeature('ecgReport') || window.ArgonSpecialtyLoader.hasFeature('bpLogChart') || window.ArgonSpecialtyLoader.hasFeature('framinghamRisk')) ? `
      <button class="emr-tab-btn ${activeEmrTab === 'cardio-tab' ? 'active' : ''}" onclick="switchEmrTab('cardio-tab')" style="background:var(--surf);border:1px solid var(--border);color:var(--muted);padding:8px 16px;border-radius:10px;font-family:'Tajawal',sans-serif;font-weight:700;font-size:0.85rem;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all 0.2s">
        <i class="fas fa-heartbeat" style="color:#ef4444"></i> ❤️ القسم القلبي
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
              ${Object.entries(_depts || {}).map(([k, d]) => \`<option value="\${k}">\${d.emoji || '🏢'} \${sanitize(d.name)}</option>\`).join('')}
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

    ${window.ArgonSpecialtyLoader && window.ArgonSpecialtyLoader.hasFeature('dentalChart') ? `
    <div id="emr-tab-dental-chart" class="emr-tab-content ${activeEmrTab === 'dental-chart-tab' ? 'active-content' : ''}" style="display:${activeEmrTab === 'dental-chart-tab' ? 'block' : 'none'}">
      <div class="ph" style="margin-bottom:12px">
        <div><div class="pt" style="font-size:1.15rem;color:#3b82f6">🦷 الرسم البياني للأسنان — FDI (ISO 3950)</div><div class="ps">خريطة تفاعلية لأسنان المريض — اضغط على أي سن لتعديل حالته</div></div>
      </div>
      <div id="_patFileDentalChart" style="padding:10px"></div>
    </div>` : ''}

    ${window.ArgonSpecialtyLoader && window.ArgonSpecialtyLoader.hasFeature('growthCharts') ? `
    <div id="emr-tab-growth-chart" class="emr-tab-content ${activeEmrTab === 'growth-chart-tab' ? 'active-content' : ''}" style="display:${activeEmrTab === 'growth-chart-tab' ? 'block' : 'none'}">
      <div class="ph" style="margin-bottom:12px">
        <div><div class="pt" style="font-size:1.15rem;color:#0ea5e9">📈 منحنيات النمو المعتمدة من WHO</div><div class="ps">متابعة نمو الطفل وتتبع القياسات بدقة عالية</div></div>
      </div>
      <div id="_growthChartContainer" style="padding:10px"></div>
    </div>` : ''}

    ${window.ArgonSpecialtyLoader && (window.ArgonSpecialtyLoader.hasFeature('ecgReport') || window.ArgonSpecialtyLoader.hasFeature('bpLogChart') || window.ArgonSpecialtyLoader.hasFeature('framinghamRisk')) ? `
    <div id="emr-tab-cardio" class="emr-tab-content ${activeEmrTab === 'cardio-tab' ? 'active-content' : ''}" style="display:${activeEmrTab === 'cardio-tab' ? 'block' : 'none'}">
      <div class="ph" style="margin-bottom:12px">
        <div><div class="pt" style="font-size:1.15rem;color:#ef4444">❤️ القسم القلبي المتقدم</div><div class="ps">سجل ضغط الدم، تخطيط القلب، الإيكو، وحاسبات المخاطر الطبية</div></div>
      </div>
      <div id="_cardioContainer" style="padding:10px"></div>
    </div>` : ''}
  \`;

  return fileHTML;"""

new_content = content[:start_idx] + replacement + content[end_idx:]

with open('emr-app.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Replacement successful")
