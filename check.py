import re

print("--- argon-enterprise.js ---")
with open('argon-enterprise.js', 'r', encoding='utf-8') as f:
    ae = f.read()
    if 'ArgonCalcAge' not in ae:
        print("Need to add utilities to argon-enterprise.js")

print("--- index.html ---")
with open('index.html', 'r', encoding='utf-8') as f:
    ix = f.read()
    # Find pAge
    m = re.search(r'<div class="fg">.*?id="pAge".*?</div>', ix, re.DOTALL)
    if m: print("Found pAge HTML")
    else: print("Could not find pAge HTML")

    if 'const ageRaw = toEngNum(document.getElementById(\'pAge\').value || \'\').trim();' in ix:
        print("Found validateStep1 age parsing")

    if 'patAge: _ageFinal ? String(_ageFinal) : \'\',' in ix:
        print("Found sendBooking age parsing")

    if '[\'pName\', \'pPhone\', \'pAge\', \'pNotes\'].forEach' in ix:
        print("Found closeModal")

print("--- emr.html ---")
with open('emr.html', 'r', encoding='utf-8') as f:
    emr = f.read()
    if 'id="npAge"' in emr: print("Found npAge HTML")
    if 'id="epAge"' in emr: print("Found epAge HTML")

print("--- emr-app.js ---")
with open('emr-app.js', 'r', encoding='utf-8') as f:
    emrapp = f.read()
    if 'const age = document.getElementById(\'npAge\').value.trim();' in emrapp:
        print("Found saveNewPatient age")
    if 'document.getElementById(\'epAge\').value = p.info.age || \'\';' in emrapp:
        print("Found openEditPatient age")
    if 'info.age || \'غير محدد\'' in emrapp:
        print("Found generatePatientFileHTML age")

print("--- dashboard.html ---")
with open('dashboard.html', 'r', encoding='utf-8') as f:
    dash = f.read()
    if 'age: b.patAge ? parseInt(b.patAge) : null,' in dash:
        print("Found dashboard age")

