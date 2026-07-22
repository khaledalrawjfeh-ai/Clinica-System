
with open("invoice-print.html", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace("\\`", "`")
text = text.replace("\\${", "${")

with open("invoice-print.html", "w", encoding="utf-8") as f:
    f.write(text)
print("Fixed syntax errors in invoice-print.html")

