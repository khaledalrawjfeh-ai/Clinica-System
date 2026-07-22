import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

html = re.sub(r'// ── العمر: اختياري لكن إذا أُدخل يجب أن يكون منطقياً ──[\s\S]*?function _removeAgeHint\(inp\) \{[\s\S]*?\n    \}', '''      // تاريخ الميلاد اختياري — لكن إن أُدخل يجب أن يكون صحيحاً
      const _dobCheck = window.ArgonValidateDOB(_dobVal);
      const _dobInp   = document.getElementById('pDob');
      const _dobErr   = document.getElementById('pDobErr');
      if (_dobVal && !_dobCheck.ok) {
        _dobInp?.classList.add('err');
        if (_dobErr) { _dobErr.textContent = _dobCheck.msg; _dobErr.style.display = 'block'; }
        ok = false;
      } else {
        _dobInp?.classList.remove('err');
        if (_dobErr) _dobErr.style.display = 'none';
      }''', html)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("Done")
