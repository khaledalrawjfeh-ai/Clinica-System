const fs = require('fs');

let content = fs.readFileSync('emr-app.js', 'utf-8');

const target1 = `(info.age ? \\`\\${info.age} سنة (تقريبي)\\` : 'غير محدد')`;
const replacement1 = `(info.age ? \`\${info.age} سنة (تقريبي)\` : 'غير محدد')`;
content = content.replace(target1, replacement1);

const target2 = `return \\`<div style="color:#b91c1c; font-size:0.85rem;">• \\${a.value} <span style="background:#dc2626; color:white; padding:1px 4px; border-radius:3px; font-size:0.7rem; margin-right:4px;">\\${a.severity}</span> <span style="color:#94a3b8; font-size:0.75rem; margin-right:6px;">(بواسطة: د. \\${sanitize(resolveStaffName(a.addedBy))})</span></div>\\`;`;
const replacement2 = `return \`<div style="color:#b91c1c; font-size:0.85rem;">• \${a.value} <span style="background:#dc2626; color:white; padding:1px 4px; border-radius:3px; font-size:0.7rem; margin-right:4px;">\${a.severity}</span> <span style="color:#94a3b8; font-size:0.75rem; margin-right:6px;">(بواسطة: د. \${sanitize(resolveStaffName(a.addedBy))})</span></div>\`;`;
content = content.replace(target2, replacement2);

const target3 = `\\`<div class="pat-field" style="margin-top:14px"><div class="pfl">ملاحظات عامة</div><div class="pfv" style="font-weight:normal;font-size:.82rem">\\${sanitize(info.notes)}</div></div>\\``;
const replacement3 = `\`<div class="pat-field" style="margin-top:14px"><div class="pfl">ملاحظات عامة</div><div class="pfv" style="font-weight:normal;font-size:.82rem">\${sanitize(info.notes)}</div></div>\``;
content = content.replace(target3, replacement3);

const target4 = `\\`<option value="\\${k}">\\${d.emoji || '🏢'} \\${sanitize(d.name)}</option>\\``;
const replacement4 = `\`<option value="\${k}">\${d.emoji || '🏢'} \${sanitize(d.name)}</option>\``;
content = content.replace(target4, replacement4);

fs.writeFileSync('emr-app.js', content, 'utf-8');
console.log("Fixed backslashes!");
