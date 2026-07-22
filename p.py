import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# --- PATCH 1: validateStep1 ---
target1 = '''    function validateStep1() {
      const name = document.getElementById('pName').value.trim();
      const phone = toEngNum(document.getElementById('pPhone').value).trim();
      const nid = toEngNum(document.getElementById('pNationalId').value).replace(/\D/g, '').trim();
      let ok = true;
      if (!isName(name)) { document.getElementById('pName').classList.add('err'); document.getElementById('pNameErr').style.display = 'block'; ok = false; }
      else { document.getElementById('pName').classList.remove('err'); document.getElementById('pNameErr').style.display = 'none'; }
      if (!isPhone(phone)) { document.getElementById('pPhone').classList.add('err'); document.getElementById('pPhoneErr').style.display = 'block'; ok = false; }
      else { document.getElementById('pPhone').classList.remove('err'); document.getElementById('pPhoneErr').style.display = 'none'; }
      if (nid.length < 9) { document.getElementById('pNationalId').classList.add('err'); document.getElementById('pNationalIdErr').style.display = 'block'; ok = false; }
      else { document.getElementById('pNationalId').classList.remove('err'); document.getElementById('pNationalIdErr').style.display = 'none'; }
      if (ok) goStep(2);
    }'''

replacement1 = '''    function validateStep1() {
      const name  = document.getElementById('pName').value.trim();
      const phone = toEngNum(document.getElementById('pPhone').value).trim();
      const rawNid = toEngNum(document.getElementById('pNationalId').value).replace(/\D/g, '').trim();
      const ageRaw = toEngNum(document.getElementById('pAge').value || '').trim();

      let ok = true;

      // ── الاسم ──
      if (!isName(name)) {
        document.getElementById('pName').classList.add('err');
        document.getElementById('pNameErr').style.display = 'block';
        ok = false;
      } else {
        document.getElementById('pName').classList.remove('err');
        document.getElementById('pNameErr').style.display = 'none';
      }

      // ── الهاتف ──
      if (!isPhone(phone)) {
        document.getElementById('pPhone').classList.add('err');
        document.getElementById('pPhoneErr').style.display = 'block';
        ok = false;
      } else {
        document.getElementById('pPhone').classList.remove('err');
        document.getElementById('pPhoneErr').style.display = 'none';
      }

      // ── الرقم الوطني: 3 شروط ──
      //   1. طوله 9+ أرقام
      //   2. ليس كله أصفاراً (00000000)
      //   3. ليس تاريخ ميلاد مكتوب بدون شرطات (19991231)
      const nidErr = document.getElementById('pNationalIdErr');
      const nidInp = document.getElementById('pNationalId');

      const isAllZeros = /^0+$/.test(rawNid);
      const looksLikeBirthdate = rawNid.length === 8 && /^(19|20)\d{6}$/.test(rawNid);

      if (rawNid.length < 9) {
        nidInp.classList.add('err');
        nidErr.textContent = 'الرقم الوطني يجب أن لا يقل عن 9 أرقام';
        nidErr.style.display = 'block';
        ok = false;
      } else if (isAllZeros) {
        nidInp.classList.add('err');
        nidErr.textContent = '⚠️ الرقم الوطني لا يمكن أن يكون أصفاراً';
        nidErr.style.display = 'block';
        ok = false;
      } else if (looksLikeBirthdate) {
        nidInp.classList.add('err');
        nidErr.textContent = '⚠️ يبدو هذا تاريخ ميلاد — الرجاء إدخال الرقم الوطني الصحيح';
        nidErr.style.display = 'block';
        ok = false;
      } else {
        nidInp.classList.remove('err');
        nidErr.style.display = 'none';
      }

      // ── العمر: اختياري لكن إذا أُدخل يجب أن يكون منطقياً ──
      const ageNum = parseInt(ageRaw, 10);
      const ageInp = document.getElementById('pAge');

      if (ageRaw !== '') {
        // تحقق: إذا أدخل سنة ميلاد (4 أرقام تبدأ بـ 19 أو 20)
        if (/^(19|20)\d{2}$/.test(ageRaw)) {
          ageInp.classList.add('err');
          ageInp.style.outline = '2px solid var(--red)';
          // احسب العمر الصحيح وضعه تلقائياً
          const calculatedAge = new Date().getFullYear() - parseInt(ageRaw, 10);
          if (calculatedAge > 0 && calculatedAge < 130) {
            ageInp.value = calculatedAge;
            ageInp.classList.remove('err');
            ageInp.style.outline = '';
            // أظهر تلميح لطيف
            _showAgeHint(ageInp, تم التحويل تلقائياً:  سنة);
          } else {
            ok = false;
            _showAgeHint(ageInp, '⚠️ أدخل العمر بالسنوات وليس سنة الميلاد');
          }
        } else if (isNaN(ageNum) || ageNum < 1 || ageNum > 120) {
          ageInp.classList.add('err');
          _showAgeHint(ageInp, '⚠️ العمر يجب أن يكون بين 1 و120 سنة');
          ok = false;
        } else {
          ageInp.classList.remove('err');
          ageInp.style.outline = '';
          _removeAgeHint(ageInp);
        }
      }

      if (ok) goStep(2);
    }
    
    // دالة مساعدة: تعرض تلميح تحت حقل العمر
    function _showAgeHint(inp, msg) {
      let hint = inp.parentElement.querySelector('._age-hint');
      if (!hint) {
        hint = document.createElement('div');
        hint.className = '_age-hint';
        hint.style.cssText = 'font-size:.72rem;margin-top:4px;padding:5px 9px;border-radius:7px;';
        inp.parentElement.appendChild(hint);
      }
      const isOk = !msg.includes('⚠️');
      hint.style.background = isOk ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.07)';
      hint.style.color = isOk ? 'var(--green)' : 'var(--red)';
      hint.textContent = msg;
    }
    function _removeAgeHint(inp) {
      const hint = inp.parentElement.querySelector('._age-hint');
      if (hint) hint.remove();
    }'''

if target1 not in content:
    print("target1 not found")
else:
    content = content.replace(target1, replacement1)
    
# --- PATCH 2: sendBooking ---
target2 = '''      const name = sanitize(document.getElementById('pName').value);
      const phone = sanitize(toEngNum(document.getElementById('pPhone').value));
      const nid = sanitize(toEngNum(document.getElementById('pNationalId').value).replace(/\D/g, ''));
      if (!isName(name) || !isPhone(phone) || nid.length < 9) { toast(T('errData'), 'err'); return; }'''

replacement2 = '''      const name = sanitize(document.getElementById('pName').value);
      const phone = sanitize(toEngNum(document.getElementById('pPhone').value));
      const _nidFinal = sanitize(toEngNum(document.getElementById('pNationalId').value).replace(/\D/g, ''));
      const _ageRawFinal = toEngNum(document.getElementById('pAge').value || '').trim();
      let _ageFinal = null;

      if (_ageRawFinal !== '') {
        const _ageNum = parseInt(_ageRawFinal, 10);
        // تحويل تلقائي إذا أدخل سنة ميلاد
        if (/^(19|20)\d{2}$/.test(_ageRawFinal)) {
          _ageFinal = new Date().getFullYear() - _ageNum;
        } else if (_ageNum >= 1 && _ageNum <= 120) {
          _ageFinal = _ageNum;
        }
      }

      // المزيد من التحقق الأمني قبل الإرسال
      if (!isName(name) || !isPhone(phone)) { toast(T('errData'), 'err'); return; }
      if (_nidFinal.length < 9 || /^0+$/.test(_nidFinal)) {
        toast(T('errNid') || '⚠️ يرجى إدخال رقم وطني صحيح', 'err');
        return;
      }'''

if target2 not in content:
    print("target2 not found")
else:
    content = content.replace(target2, replacement2)
    
target3 = '''          patName: name, patPhone: phone, patNationalId: nid,
          patAge: sanitize(document.getElementById('pAge').value),'''

replacement3 = '''          patName: name, patPhone: phone, patNationalId: _nidFinal,
          patAge: _ageFinal ? String(_ageFinal) : '','''

if target3 not in content:
    print("target3 not found")
else:
    content = content.replace(target3, replacement3)

# --- PATCH 3: pAge input in HTML ---
target4 = '''<input type="number" id="pAge" class="finp" placeholder="25" min="1" max="120">'''
replacement4 = '''<input
  type="text"
  id="pAge"
  class="finp"
  placeholder="عمرك بالسنوات (مثال: 25)"
  inputmode="numeric"
  maxlength="3"
  autocomplete="off"
  oninput="
    this.value = this.value.replace(/[^\d]/g,'').slice(0,4);
    const v = parseInt(this.value,10);
    if(this.value.length===4 && /^(19|20)/.test(this.value)){
      const age = new Date().getFullYear()-v;
      if(age>0&&age<130){ this.value=age; _showAgeHint(this,'✅ تم التحويل: '+age+' سنة'); }
    }
  "
>'''

if target4 not in content:
    print("target4 not found")
else:
    content = content.replace(target4, replacement4)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('index.html done')

with open('argon-nid-gate.js', 'r', encoding='utf-8') as f:
    nidgate = f.read()
    
target5 = '''ArgonNID.isValidNID   = (nid) => /^\d{9,12}$/.test(String(nid||'').replace(/[\s\-]/g,''));'''
replacement5 = '''ArgonNID.isValidNID = function(nid) {
  const clean = String(nid || '').replace(/[\s\-]/g, '');

  // طول 9 أرقام على الأقل
  if (clean.length < 9 || !/^\d+$/.test(clean)) return false;

  // ليس كله أصفاراً
  if (/^0+$/.test(clean)) return false;

  // ليس تاريخ ميلاد مكتوب بدون شرطات (مثل 19991231)
  if (clean.length === 8 && /^(19|20)\d{6}$/.test(clean)) return false;

  return true;
};'''

if target5 not in nidgate:
    print("target5 not found")
else:
    nidgate = nidgate.replace(target5, replacement5)
    with open('argon-nid-gate.js', 'w', encoding='utf-8') as f:
        f.write(nidgate)
    print('argon-nid-gate.js done')

