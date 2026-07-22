with open("dashboard.html", "r", encoding="utf-8") as f:
    text = f.read()

target = "age: b.patAge ? parseInt(b.patAge) : null,"
replacement = "dob: b.patDob || null,\n            age: b.patDob ? window.ArgonCalcAge(b.patDob) : (b.patAge ? parseInt(b.patAge) : null),"

if target in text:
    text = text.replace(target, replacement)
    with open("dashboard.html", "w", encoding="utf-8") as f:
        f.write(text)
    print("Fixed dashboard.html!")
else:
    print("Not found.")
