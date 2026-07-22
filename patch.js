const fs = require('fs');

console.log("--- argon-enterprise.js ---");
let ae = fs.readFileSync('argon-enterprise.js', 'utf8');
const utils = `
/**
 * يحسب العمر بالسنوات من تاريخ الميلاد حتى اليوم
 * @param {string} dob — "YYYY-MM-DD"
 * @returns {number|null}
 */
window.ArgonCalcAge = function(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : null;
};

/**
 * يعرض العمر بشكل لطيف: "22 سنة" أو "8 أشهر" للرضع
 * @param {string} dob — "YYYY-MM-DD"
 * @returns {string}
 */
window.ArgonAgeDisplay = function(dob) {
  if (!dob) return '—';
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return '—';
  const today = new Date();
  let years  = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth()    - birth.getMonth();
  if (today.getDate() < birth.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  if (years < 0) return '—';
  if (years === 0 && months === 0) return 'أقل من شهر';
  if (years === 0) return \`\${months} شهر\`;
  if (years <  2) return \`\${years} سنة و\${months} شهر\`;
  return \`\${years} سنة\`;
};

/**
 * يتحقق أن تاريخ الميلاد منطقي (لا مستقبلي، لا أكثر من 130 سنة)
 */
window.ArgonValidateDOB = function(dob) {
  if (!dob) return { ok: false, msg: 'تاريخ الميلاد مطلوب' };
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return { ok: false, msg: 'تاريخ غير صالح' };
  const today = new Date();
  if (birth > today) return { ok: false, msg: 'تاريخ الميلاد لا يمكن أن يكون في المستقبل' };
  const age = ArgonCalcAge(dob);
  if (age > 130) return { ok: false, msg: 'تاريخ الميلاد غير منطقي (أكثر من 130 سنة)' };
  return { ok: true, age };
};
`;

if (!ae.includes('ArgonCalcAge')) {
    fs.writeFileSync('argon-enterprise.js', utils + '\n' + ae);
}

console.log("--- index.html ---");
let ix = fs.readFileSync('index.html', 'utf8');

ix = ix.replace(/<div class="fg">\s*<label>.*?العمر.*?<\/label>\s*<input[^>]+id="pAge"[^>]+>\s*<\/div>/g, `<div class="fg">
  <label>
    تاريخ الميلاد
    <span id="pAgeDisplay" style="
      margin-right: 8px;
      font-size: 0.75rem;
      font-weight: 800;
      color: var(--teal);
      background: rgba(13,148,136,0.08);
      padding: 2px 9px;
      border-radius: 20px;
      display: none;
    "></span>
  </label>
  <input
    type="date"
    id="pDob"
    class="finp"
    max=""
    min="1900-01-01"
    oninput="
      const v = window.ArgonValidateDOB(this.value);
      const disp = document.getElementById('pAgeDisplay');
      if (v.ok) {
        disp.textContent = window.ArgonAgeDisplay(this.value);
        disp.style.display = 'inline';
        this.classList.remove('err');
        document.getElementById('pDobErr').style.display = 'none';
      } else {
        disp.style.display = 'none';
        if (this.value) {
          this.classList.add('err');
          document.getElementById('pDobErr').textContent = v.msg;
          document.getElementById('pDobErr').style.display = 'block';
        }
      }
    "
  >
  <div class="err-msg" id="pDobErr">يرجى إدخال تاريخ ميلاد صحيح</div>
</div>`);

ix = ix.replace(
  `const ageRaw = toEngNum(document.getElementById('pAge').value || '').trim();`,
  `const _dobVal   = document.getElementById('pDob')?.value || '';`
);

ix = ix.replace(
  `      // ── العمر: اختياري لكن إذا أُدخل يجب أن يكون منطقياً ──
      const ageNum = parseInt(ageRaw, 10);
      const ageInp = document.getElementById('pAge');

      if (ageRaw !== '') {
        // تحقق: إذا أدخل سنة ميلاد (4 أرقام تبدأ بـ 19 أو 20)
        if (/^(19|20)\\d{2}$/.test(ageRaw)) {
          ageInp.classList.add('err');
          ageInp.style.outline = '2px solid var(--red)';
          // احسب العمر الصحيح وضعه تلقائياً
          const calculatedAge = new Date().getFullYear() - parseInt(ageRaw, 10);
          if (calculatedAge > 0 && calculatedAge < 130) {
            ageInp.value = calculatedAge;
            ageInp.classList.remove('err');
            ageInp.style.outline = '';
            // أظهر تلميح لطيف
            _showAgeHint(ageInp, \`تم التحويل تلقائياً: \${calculatedAge} سنة\`);
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
      }`,
  `      // تاريخ الميلاد اختياري — لكن إن أُدخل يجب أن يكون صحيحاً
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
      }`
);

ix = ix.replace(
  `      const _ageRawFinal = toEngNum(document.getElementById('pAge').value || '').trim();
      let _ageFinal = null;

      if (_ageRawFinal !== '') {
        const _ageNum = parseInt(_ageRawFinal, 10);
        // تحويل تلقائي إذا أدخل سنة ميلاد
        if (/^(19|20)\\d{2}$/.test(_ageRawFinal)) {
          _ageFinal = new Date().getFullYear() - _ageNum;
        } else if (_ageNum >= 1 && _ageNum <= 120) {
          _ageFinal = _ageNum;
        }
      }`,
  `      const _dobValFinal = document.getElementById('pDob')?.value || '';`
);

ix = ix.replace(
  `patAge: _ageFinal ? String(_ageFinal) : '',`,
  `patDob: sanitize(_dobValFinal),
          patAge: _dobValFinal ? String(window.ArgonCalcAge(_dobValFinal) || '') : '',`
);

ix = ix.replace(
  `['pName', 'pPhone', 'pAge', 'pNotes'].forEach(i => {`,
  `['pName', 'pPhone', 'pDob', 'pNotes'].forEach(i => {`
);

ix = ix.replace(
  `document.getElementById('pGender').value = '';`,
  `document.getElementById('pGender').value = '';
    const _disp = document.getElementById('pAgeDisplay');
    if (_disp) _disp.style.display = 'none';`
);

ix = ix.replace(/\\/\\/ دالة مساعدة: تعرض تلميح تحت حقل العمر[\\s\\S]*?function _removeAgeHint\\(inp\\) \\{[\\s\\S]*?\\n    \\}/g, '');

fs.writeFileSync('index.html', ix);


console.log("--- emr.html ---");
let emr = fs.readFileSync('emr.html', 'utf8');

emr = emr.replace(/<div class="fg">\\s*<label>العمر<\\/label>\\s*<input type="number" id="npAge"[^>]+>\\s*<\\/div>/g, `<div class="fg">
  <label style="display:flex; align-items:center; justify-content:space-between;">
    <span>تاريخ الميلاد</span>
    <span id="npAgePreview" style="
      font-size: 0.72rem; font-weight: 800; color: var(--teal);
      background: rgba(13,148,136,0.08); padding: 2px 9px;
      border-radius: 20px; display: none;
    "></span>
  </label>
  <input
    type="date"
    id="npDob"
    class="fi"
    max=""
    min="1900-01-01"
    placeholder="YYYY-MM-DD"
    oninput="
      const v = window.ArgonValidateDOB(this.value);
      const pr = document.getElementById('npAgePreview');
      if (v.ok && this.value) {
        pr.textContent = window.ArgonAgeDisplay(this.value);
        pr.style.display = 'inline';
        this.style.borderColor = '';
      } else {
        pr.style.display = 'none';
        if(this.value) this.style.borderColor = '#ef4444';
      }
    "
  >
</div>`);

emr = emr.replace(/<div class="fg">\\s*<label>العمر<\\/label>\\s*<input type="number" id="epAge"[^>]+>\\s*<\\/div>/g, `<div class="fg">
  <label style="display:flex; align-items:center; justify-content:space-between;">
    <span>تاريخ الميلاد</span>
    <span id="epAgePreview" style="
      font-size: 0.72rem; font-weight: 800; color: var(--teal);
      background: rgba(13,148,136,0.08); padding: 2px 9px;
      border-radius: 20px; display: none;
    "></span>
  </label>
  <input
    type="date"
    id="epDob"
    class="fi"
    max=""
    min="1900-01-01"
    oninput="
      const v = window.ArgonValidateDOB(this.value);
      const pr = document.getElementById('epAgePreview');
      if (v.ok && this.value) {
        pr.textContent = window.ArgonAgeDisplay(this.value);
        pr.style.display = 'inline';
        this.style.borderColor = '';
      } else {
        pr.style.display = 'none';
        if(this.value) this.style.borderColor = '#ef4444';
      }
    "
  >
</div>`);

fs.writeFileSync('emr.html', emr);

console.log("--- emr-app.js ---");
let emrapp = fs.readFileSync('emr-app.js', 'utf8');

emrapp = emrapp.replace(
  `  const age = document.getElementById('npAge').value.trim();`,
  `  const _dob_np     = (document.getElementById('npDob')?.value || '').trim();
  const _dobChk_np  = _dob_np ? window.ArgonValidateDOB(_dob_np) : { ok: true };
  const _calcAge_np = _dob_np ? window.ArgonCalcAge(_dob_np) : null;
  if (_dob_np && !_dobChk_np.ok) {
    toast('⚠️ ' + _dobChk_np.msg, 'err');
    return;
  }`
);

emrapp = emrapp.replace(
  `age: age ? parseInt(age) : null,`,
  `dob: _dob_np || null,
      age: _calcAge_np,`
);

emrapp = emrapp.replace(
  `  document.getElementById('epAge').value = p.info.age || '';`,
  `  const _epDobEl = document.getElementById('epDob');
  if (_epDobEl) {
    _epDobEl.value = p.info.dob || '';
    if (!p.info.dob && p.info.age) {
      _epDobEl.placeholder = \`عمر سابق: \${p.info.age} سنة\`;
    }
  }`
);

emrapp = emrapp.replace(
  `  const age = document.getElementById('epAge').value.trim();`,
  `  const _dob_ep    = (document.getElementById('epDob')?.value || '').trim();
  const _dobChk_ep = _dob_ep ? window.ArgonValidateDOB(_dob_ep) : { ok: true };
  if (_dob_ep && !_dobChk_ep.ok) {
    toast('⚠️ ' + _dobChk_ep.msg, 'err');
    return;
  }`
);

emrapp = emrapp.replace(
  `age: age ? parseInt(age) : null,`,
  `dob: _dob_ep || null,
      age: _dob_ep ? window.ArgonCalcAge(_dob_ep) : (p.info.age || null),`
);

emrapp = emrapp.replace(
  `\${info.age || 'غير محدد'} سنة`,
  `\${info.dob ? window.ArgonAgeDisplay(info.dob) : (info.age ? \`\${info.age} سنة (تقريبي)\` : 'غير محدد')}`
);

fs.writeFileSync('emr-app.js', emrapp);

console.log("--- dashboard.html ---");
let dash = fs.readFileSync('dashboard.html', 'utf8');

dash = dash.replace(
  `age: b.patAge ? parseInt(b.patAge) : null,`,
  `dob: b.patDob || null,
            age: b.patDob ? window.ArgonCalcAge(b.patDob) : (b.patAge ? parseInt(b.patAge) : null),`
);

fs.writeFileSync('dashboard.html', dash);

function injectMaxDate(htmlFile) {
    let html = fs.readFileSync(htmlFile, 'utf8');
    const inj = `<script>
(function setMaxDates() {
  const today = new Date().toISOString().split('T')[0];
  ['pDob', 'npDob', 'epDob'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.max = today;
  });
})();
</script>
</body>`;
    fs.writeFileSync(htmlFile, html.replace('</body>', inj));
}

injectMaxDate('index.html');
injectMaxDate('emr.html');
injectMaxDate('dashboard.html');

console.log("Done");

