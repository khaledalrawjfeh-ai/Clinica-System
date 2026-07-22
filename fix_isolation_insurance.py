import re

with open('d:/git__hub/clinica-system/emr-app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Fix filterPatients isolation
isolation_fix = '''
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
'''
content = re.sub(
    r'const info = p\.info \|\| \{\};\s*if \(\!q\) return true;',
    'const info = p.info || {};' + isolation_fix,
    content,
    flags=re.DOTALL
)

# 2. Add Insurance to patient details
insurance_logic = '''
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
'''
content = content.replace('  const activeAvatarHTML = info.photo', insurance_logic)

patient_fields_replace = '''
        <div class="pat-field"><div class="pfl">تاريخ التسجيل</div><div class="pfv" style="font-size:.78rem;font-family:\\'IBM Plex Mono\\',monospace">${(info.createdAt || \\'\\').substring(0, 10)}</div></div>
      </div>
'''
patient_fields_new = '''
        <div class="pat-field"><div class="pfl">تاريخ التسجيل</div><div class="pfv" style="font-size:.78rem;font-family:\\'IBM Plex Mono\\',monospace">${(info.createdAt || \\'\\').substring(0, 10)}</div></div>
        <div class="pat-field"><div class="pfl">معلومات التأمين</div><div class="pfv" style="color:${insColor};font-weight:700"><i class="fas fa-shield-halved"></i> ${insInfo}</div></div>
      </div>
'''
content = content.replace(patient_fields_replace, patient_fields_new)

with open('d:/git__hub/clinica-system/emr-app.js', 'w', encoding='utf-8') as f:
    f.write(content)
print('Patched emr-app.js')
