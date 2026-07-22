with open("emr-app.js", "r", encoding="utf-8") as f:
    text = f.read()

target = """  const chronic = document.getElementById('epChronic').value.trim().split(/[،,]/).map(s => s.trim()).filter(Boolean);
  
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
            entryId: 'entry_' + Date.now() + '_' + Math.random().toString(36).substr(2,5),
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
    dob: _dob_np || null,
      age: _calcAge_np,
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
  const oldInfo = _patients[uid]?.info || {};"""

replacement = """  const chronic = document.getElementById('epChronic').value.trim().split(/[،,]/).map(s => s.trim()).filter(Boolean);
  
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
            entryId: 'entry_' + Date.now() + '_' + Math.random().toString(36).substr(2,5),
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

  // ── AUDIT: Identity & Clinical Change Detection ──"""

if target in text:
    text = text.replace(target, replacement)
    with open("emr-app.js", "w", encoding="utf-8") as f:
        f.write(text)
    print("Fixed emr-app.js!")
else:
    print("Not found.")
