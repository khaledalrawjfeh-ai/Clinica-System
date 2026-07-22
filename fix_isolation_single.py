with open('d:/git__hub/clinica-system/emr-app.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_logic = '''  // Build the set of patient IDs/phones that have at least one booking for THIS doctor
  let allowedPatients = null;
  if (loggedInDoctorId && !isAdmin) {'''

new_logic = '''  // Build the set of patient IDs/phones that have at least one booking for THIS doctor
  let allowedPatients = null;
  const isComplex = _sets && (_sets.mode === 'medical_complex' || _sets.type === 'complex');
  
  // Only apply strict doctor isolation in Polyclinic (Medical Complex) mode.
  // In a Single Clinic, the doctor should see all patients in the database.
  if (isComplex && loggedInDoctorId && !isAdmin) {'''

if old_logic in content:
    content = content.replace(old_logic, new_logic)
    with open('d:/git__hub/clinica-system/emr-app.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Fixed isolation logic for single clinics')
else:
    print('Old logic not found')
