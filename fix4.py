import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

target = '''      } else {
        _dobInp?.classList.remove('err');
        if (_dobErr) _dobErr.style.display = 'none';
      }'''

replacement = '''      } else {
        _dobInp?.classList.remove('err');
        if (_dobErr) _dobErr.style.display = 'none';
      }

      if (ok) goStep(2);
    }'''

if target in html:
    html = html.replace(target, replacement)
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(html)
    print("Fixed!")
else:
    print("Target not found.")
