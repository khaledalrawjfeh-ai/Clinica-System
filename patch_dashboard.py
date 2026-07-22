import re

with open(r'd:\git__hub\clinica-system\dashboard.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update saveSettings()
saveSettings_old = """function saveSettings() {
  const sN = document.getElementById('sN').value.trim();
  const sP = document.getElementById('sP').value.trim();
  if(!sN) { toast('⚠️ يجب إدخال اسم العيادة', 'err'); return; }

  const color=document.getElementById('sC').value||'#0d9488';
  const newPass=document.getElementById('sPw').value.trim();
  
  const whatsappConf = {
    enabled: document.getElementById('waEnabled').checked,
    signature: document.getElementById('waSignature').value.trim(),
    remind30: document.getElementById('waRemind30').checked,
    remind10: document.getElementById('waRemind10').checked,
    phar: document.getElementById('waPhar').checked,
    lab: document.getElementById('waLab').checked,
    rad: document.getElementById('waRad').checked,
    bill: document.getElementById('waBill').checked
  };

  const update={
    name:sanitize(sN),
    phone:sanitize(sP),
    status:document.getElementById('sSt').value,
    is24Hours:document.getElementById('s24h').checked,
    clinicStart:document.getElementById('sWs').value,
    clinicEnd:document.getElementById('sWe').value,
    specialty:sanitize(document.getElementById('sSpec').value),
    emoji:sanitize(document.getElementById('sEm').value),
    sameDayBooking: document.getElementById('sSameDay').value === 'true',
    bookingDays: parseInt(document.getElementById('sBookingDays').value) || 10,
    mode: document.getElementById('sMode').value || 'single_clinic',
    passcodes: {
      doctor: document.getElementById('sPassDoc').value.trim(),
      pharmacist: document.getElementById('sPassPhar').value.trim(),
      lab: document.getElementById('sPassLab').value.trim(),
      radiology: document.getElementById('sPassRad').value.trim()
    },
    whatsapp: whatsappConf,
    color
  };
  if(newPass.length>=4) update.password=newPass;
  db.ref(`${BASE}/settings`).update(update).then(()=>{
    toast('✅ تم حفظ الإعدادات بنجاح','ok');
    document.getElementById('sPw').value='';
  }).catch(e => toast('❌ فشل الحفظ','err'));
}"""

saveSettings_new = """async function saveSettings() {
  const sN = document.getElementById('sN').value.trim();
  const sP = document.getElementById('sP').value.trim();
  if(!sN) { toast('⚠️ يجب إدخال اسم العيادة', 'err'); return; }

  const color=document.getElementById('sC').value||'#0d9488';
  const newPass=document.getElementById('sPw').value.trim();
  
  const whatsappConf = {
    enabled: document.getElementById('waEnabled').checked,
    signature: document.getElementById('waSignature').value.trim(),
    remind30: document.getElementById('waRemind30').checked,
    remind10: document.getElementById('waRemind10').checked,
    phar: document.getElementById('waPhar').checked,
    lab: document.getElementById('waLab').checked,
    rad: document.getElementById('waRad').checked,
    bill: document.getElementById('waBill').checked
  };

  const update={
    name:sanitize(sN),
    phone:sanitize(sP),
    status:document.getElementById('sSt').value,
    is24Hours:document.getElementById('s24h').checked,
    clinicStart:document.getElementById('sWs').value,
    clinicEnd:document.getElementById('sWe').value,
    specialty:sanitize(document.getElementById('sSpec').value),
    emoji:sanitize(document.getElementById('sEm').value),
    sameDayBooking: document.getElementById('sSameDay').value === 'true',
    bookingDays: parseInt(document.getElementById('sBookingDays').value) || 10,
    mode: document.getElementById('sMode').value || 'single_clinic',
    passcodes: {
      doctor: document.getElementById('sPassDoc').value.trim()
    },
    whatsapp: whatsappConf,
    color
  };
  
  if(newPass.length>=4) update.password=newPass;

  const pharPass = document.getElementById('sPassPhar');
  if (pharPass && !pharPass.disabled) {
      if (document.getElementById('sPassPhar').value.trim().length >= 4) {
          update['portalPasswords/pharmacy'] = await ArgonEnterpriseAuth.hashPassword(document.getElementById('sPassPhar').value.trim());
      }
      if (document.getElementById('sPassLab').value.trim().length >= 4) {
          update['portalPasswords/lab'] = await ArgonEnterpriseAuth.hashPassword(document.getElementById('sPassLab').value.trim());
      }
      if (document.getElementById('sPassRad').value.trim().length >= 4) {
          update['portalPasswords/radiology'] = await ArgonEnterpriseAuth.hashPassword(document.getElementById('sPassRad').value.trim());
      }
  }

  db.ref(`${BASE}/settings`).update(update).then(()=>{
    toast('✅ تم حفظ الإعدادات بنجاح','ok');
    document.getElementById('sPw').value='';
  }).catch(e => toast('❌ فشل الحفظ','err'));
}

async function unlockRbacPasswords() {
    const adminPass = prompt('الرجاء إدخال كلمة مرور الإدارة العليا للعيادة (Admin Password) لفتح قفل الأقسام:');
    if (!adminPass) return;
    
    const snap = await db.ref(`${BASE}/settings/password`).once('value');
    if (snap.val() === adminPass) {
        document.getElementById('rbacLockOverlay').style.display = 'none';
        ['sPassPhar', 'sPassLab', 'sPassRad'].forEach(id => {
            document.getElementById(id).disabled = false;
        });
        toast('🔓 تم فتح قفل التعديل', 'ok');
        if(window.ArgonCore) ArgonCore.logAudit('RBAC_UNLOCK', 'Admin unlocked department passwords', 'SECURITY');
    } else {
        toast('❌ كلمة المرور غير صحيحة', 'err');
        if(window.ArgonCore) ArgonCore.logAudit('RBAC_UNLOCK_FAIL', 'Failed to unlock department passwords', 'SECURITY');
    }
}"""

content = content.replace(saveSettings_old, saveSettings_new)

# 2. Update RBAC PASSWORDS PANEL HTML
rbac_panel_old = """        <!-- RBAC PASSWORDS PANEL -->
        <div style="margin:20px 0 14px 0;border-top:1px dashed var(--border);padding-top:16px">
          <label class="setl" style="color:var(--sky);font-weight:800"><i class="fas fa-user-shield"></i> كلمات مرور الطاقم الطبي وصلاحيات الوصول (RBAC)</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px">
            <div>
              <label class="mfl">كلمة مرور الأطباء (EMR)</label>
              <input type="password" id="sPassDoc" class="mfi" placeholder="الافتراضية: نفس كلمة مرور العيادة">
            </div>
            <!-- Complex Only Passwords -->
            <div id="complexPasscodes" style="display:none; grid-column: 1 / -1; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
              <div>
                <label class="mfl">كلمة مرور الصيدلي (Pharmacy)</label>
                <input type="password" id="sPassPhar" class="mfi" placeholder="الافتراضية: 1122">
              </div>
              <div>
                <label class="mfl">كلمة مرور المختبر (Lab)</label>
                <input type="password" id="sPassLab" class="mfi" placeholder="الافتراضية: 1122">
              </div>
              <div>
                <label class="mfl">كلمة مرور الأشعة (Radiology)</label>
                <input type="password" id="sPassRad" class="mfi" placeholder="الافتراضية: 1122">
              </div>
            </div>
          </div>
        </div>"""

rbac_panel_new = """        <!-- RBAC PASSWORDS PANEL -->
        <div style="margin:20px 0 14px 0;border-top:1px dashed var(--border);padding-top:16px">
          <label class="setl" style="color:var(--sky);font-weight:800"><i class="fas fa-user-shield"></i> كلمات مرور الطاقم الطبي وصلاحيات الوصول (RBAC)</label>
          <div style="margin-top:10px; background: rgba(15,23,42,0.3); border: 1px solid var(--border); border-radius: 12px; padding: 15px; position: relative;">
            <div id="rbacLockOverlay" style="position: absolute; top:0; left:0; width:100%; height:100%; background: rgba(15,23,42,0.8); backdrop-filter: blur(4px); border-radius: 12px; display: flex; align-items: center; justify-content: center; z-index: 10;">
                <button onclick="unlockRbacPasswords()" class="btn btn-teal" style="padding: 10px 20px; font-weight: bold; border: none; border-radius: 8px; cursor: pointer; background: linear-gradient(135deg, #0ea5e9, #0284c7); color: white;"><i class="fas fa-unlock"></i> إظهار وتعديل كلمات مرور الأقسام</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div>
                <label class="mfl">كلمة مرور الأطباء (EMR)</label>
                <input type="password" id="sPassDoc" class="mfi" placeholder="الافتراضية: نفس كلمة مرور العيادة">
              </div>
              <!-- Complex Only Passwords -->
              <div id="complexPasscodes" style="display:none; grid-column: 1 / -1; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                <div>
                  <label class="mfl">بوابة الصيدلية (Pharmacy)</label>
                  <input type="password" id="sPassPhar" class="mfi" placeholder="تم التشفير. أدخل جديد للتغيير" disabled>
                </div>
                <div>
                  <label class="mfl">بوابة المختبر (Lab)</label>
                  <input type="password" id="sPassLab" class="mfi" placeholder="تم التشفير. أدخل جديد للتغيير" disabled>
                </div>
                <div>
                  <label class="mfl">بوابة الأشعة (Radiology)</label>
                  <input type="password" id="sPassRad" class="mfi" placeholder="تم التشفير. أدخل جديد للتغيير" disabled>
                </div>
              </div>
            </div>
          </div>
        </div>"""

content = content.replace(rbac_panel_old, rbac_panel_new)

# 3. Update <select id="sftR"> options
select_old = """<select id="sftR" class="mfi" style="background:var(--surf);color:var(--text);border:1px solid var(--border);height:38px;padding:0 8px;border-radius:9px;width:100%">
              <option value="pharmacist">صيدلي (Pharmacist)</option>
              <option value="lab">فني مختبر (Lab Tech)</option>
              <option value="radiology">فني أشعة (Radiology Tech)</option>
              <option value="reception">موظف استقبال (Reception)</option>
              <option value="admin">إدارة (Admin)</option>
            </select>"""
            
select_new = """<select id="sftR" class="mfi" style="background:var(--surf);color:var(--text);border:1px solid var(--border);height:38px;padding:0 8px;border-radius:9px;width:100%">
              <option value="reception">موظف استقبال (Reception)</option>
              <option value="admin">إدارة (Admin)</option>
            </select>"""

content = content.replace(select_old, select_new)

with open(r'd:\git__hub\clinica-system\dashboard.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("done")
