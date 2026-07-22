with open("emr-app.js", "r", encoding="utf-8") as f:
    text = f.read()
target = """    ['npName', 'npPhone', 'npNationalId', 'npAge', 'npAllergies', 'npChronic', 'npNotes'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });"""
replacement = """    ['npName', 'npPhone', 'npNationalId', 'npDob', 'npAllergies', 'npChronic', 'npNotes'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const prNP = document.getElementById('npAgePreview');
    if (prNP) prNP.style.display = 'none';"""

if target in text:
    text = text.replace(target, replacement)
    with open("emr-app.js", "w", encoding="utf-8") as f:
        f.write(text)
    print("Fixed emr-app.js!")
else:
    print("Not found.")
