import re

with open(r'd:\git__hub\clinica-system\argon-core.js', 'r', encoding='utf-8') as f:
    content = f.read()

overlay_replacement = """    injectEnterpriseLoginOverlay: function(portalName) {
        let overlay = document.getElementById('enterprise-login-overlay');
        if (overlay) return;

        let roleLabel = "موظف";
        let isDoctor = false;
        if (portalName === 'emr') { roleLabel = "طبيب"; isDoctor = true; }
        else if (portalName === 'pharmacy') roleLabel = "صيدلي";
        else if (portalName === 'lab') roleLabel = "فني مختبر";
        else if (portalName === 'radiology') roleLabel = "فني أشعة";

        overlay = document.createElement('div');
        overlay.id = 'enterprise-login-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(3, 11, 10, 0.95); z-index: 999999; display: flex;
            align-items: center; justify-content: center; font-family: 'Tajawal', sans-serif; direction: rtl;
        `;
        
        const isDepartment = ['pharmacy', 'lab', 'radiology'].includes(portalName);
        let contentHtml = '';

        if (isDepartment) {
            let deptName = portalName === 'pharmacy' ? 'الصيدلية المركزية' : (portalName === 'lab' ? 'المختبرات الطبية' : 'قسم الأشعة');
            let icon = portalName === 'pharmacy' ? '💊' : (portalName === 'lab' ? '🧪' : '🩻');
            contentHtml = `
            <div style="background: #0f172a; border: 1px solid #334155; border-radius: 24px; padding: 40px; width: 90%; max-width: 450px; text-align: center; box-shadow: 0 24px 64px rgba(0,0,0,0.5);">
                <div style="font-size: 3.5rem; margin-bottom: 12px;">${icon}</div>
                <h2 style="color: white; margin-bottom: 5px; font-weight: 900;">بوابة ${deptName}</h2>
                <p style="color: #94a3b8; margin-bottom: 24px; font-size: 0.9rem;">الرجاء إدخال كلمة مرور القسم للوصول</p>
                <div id="entLoginStep2">
                    <input type="password" id="entPass" placeholder="كلمة المرور الخاصة بالقسم" style="width: 100%; padding: 12px; background: #1e293b; border: 1px solid #334155; border-radius: 10px; color: white; font-family: inherit; font-size: 1rem; margin-bottom: 15px; text-align: center; outline: none;" onkeyup="if(event.key==='Enter')ArgonPortalRuntime.doLogin('${portalName}', false)">
                    <button onclick="ArgonPortalRuntime.doLogin('${portalName}', false)" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #0d9488, #0ea5e9); border: none; border-radius: 10px; color: white; font-family: inherit; font-weight: 800; cursor: pointer; font-size: 1rem; margin-bottom: 10px;">دخول البوابة</button>
                    <div id="entErr" style="display: none; color: #fca5a5; font-size: 0.85rem; margin-top: 10px; background: rgba(239,68,68,0.1); padding: 8px; border-radius: 8px;">كلمة المرور غير صحيحة.</div>
                </div>
            </div>`;
        } else {
            contentHtml = `
            <div style="background: #0f172a; border: 1px solid #334155; border-radius: 24px; padding: 40px; width: 90%; max-width: 450px; text-align: center; box-shadow: 0 24px 64px rgba(0,0,0,0.5);">
                <div style="font-size: 3.5rem; margin-bottom: 12px;">🏥</div>
                <h2 style="color: white; margin-bottom: 5px; font-weight: 900;">تسجيل دخول الطاقم</h2>
                <p style="color: #94a3b8; margin-bottom: 24px; font-size: 0.9rem;">بوابة وصول: ${roleLabel}</p>
                
                <div id="entLoginStep1">
                    <select id="entUserSelect" style="width: 100%; padding: 12px; background: #1e293b; border: 1px solid #334155; border-radius: 10px; color: white; font-family: inherit; font-size: 1rem; margin-bottom: 15px; outline: none;">
                        <option value="">جاري تحميل القائمة...</option>
                    </select>
                    <button onclick="ArgonPortalRuntime.nextStep()" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #0d9488, #0ea5e9); border: none; border-radius: 10px; color: white; font-family: inherit; font-weight: 800; cursor: pointer; font-size: 1rem;">متابعة</button>
                </div>

                <div id="entLoginStep2" style="display: none;">
                    <h3 id="entUserName" style="color: #5eead4; margin-bottom: 15px; font-size: 1.1rem;"></h3>
                    <input type="password" id="entPass" placeholder="كلمة المرور الخاصة بك" style="width: 100%; padding: 12px; background: #1e293b; border: 1px solid #334155; border-radius: 10px; color: white; font-family: inherit; font-size: 1rem; margin-bottom: 15px; text-align: center; outline: none;" onkeyup="if(event.key==='Enter')ArgonPortalRuntime.doLogin('${portalName}', ${isDoctor})">
                    <button onclick="ArgonPortalRuntime.doLogin('${portalName}', ${isDoctor})" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #0d9488, #0ea5e9); border: none; border-radius: 10px; color: white; font-family: inherit; font-weight: 800; cursor: pointer; font-size: 1rem; margin-bottom: 10px;">تسجيل الدخول</button>
                    <button onclick="ArgonPortalRuntime.prevStep()" style="width: 100%; padding: 10px; background: rgba(255,255,255,0.05); border: none; border-radius: 10px; color: white; font-family: inherit; cursor: pointer; font-size: 0.9rem;">رجوع</button>
                    <div id="entErr" style="display: none; color: #fca5a5; font-size: 0.85rem; margin-top: 10px; background: rgba(239,68,68,0.1); padding: 8px; border-radius: 8px;">كلمة المرور غير صحيحة أو غير معينة.</div>
                </div>
            </div>`;
        }
        
        overlay.innerHTML = contentHtml;
        document.body.appendChild(overlay);

        if (isDepartment) {
            setTimeout(() => {
                const passInput = document.getElementById('entPass');
                if (passInput) passInput.focus();
            }, 100);
            return;
        }

        const reqRole = portalName === 'emr' ? 'doctor' : (portalName === 'pharmacy' ? 'pharmacist' : (portalName === 'lab' ? 'lab' : 'radiology'));
        const basePath = isDoctor ? `${CLINIC_BASE}/doctors` : `${CLINIC_BASE}/staff`;
        
        _argonDb.ref(basePath).once('value', snap => {
            const data = snap.val() || {};
            const select = document.getElementById('entUserSelect');
            select.innerHTML = '<option value="">-- اختر هويتك --</option>';
            select.innerHTML += '<option value="admin">الإدارة (Admin)</option>'; 
            
            Object.entries(data).forEach(([id, user]) => {
                if (!isDoctor && user.role !== reqRole) return;
                const name = user.displayName || user.name || id;
                select.innerHTML += `<option value="${id}">${name}</option>`;
            });
        });
    },
    nextStep: function() {"""

login_replacement = """    doLogin: async function(portalName, isDoctor) {
        const pass = document.getElementById('entPass').value;
        const reqRole = portalName === 'emr' ? 'doctor' : (portalName === 'pharmacy' ? 'pharmacist' : (portalName === 'lab' ? 'lab' : 'radiology'));

        let success = false;
        const isDepartment = ['pharmacy', 'lab', 'radiology'].includes(portalName);

        if (isDepartment) {
            const snap = await _argonDb.ref(`${CLINIC_BASE}/settings/portalPasswords/${portalName}`).once('value');
            const storedHash = snap.val();
            const inputHash = await ArgonEnterpriseAuth.hashPassword(pass);
            
            if (storedHash === inputHash || (!storedHash && pass === '1122')) {
                let deptName = portalName === 'pharmacy' ? 'الصيدلية المركزية' : (portalName === 'lab' ? 'المختبرات الطبية' : 'قسم الأشعة');
                ArgonSession.start({
                    sessionId: 'sess_' + portalName + '_' + Date.now(),
                    staffId: portalName,
                    role: portalName,
                    portal: portalName,
                    sessionType: 'department',
                    displayName: deptName,
                    sessionVersion: 1,
                    clinicId: CLINIC_ID
                });
                success = true;
                ArgonCore.logAudit('LOGIN_SUCCESS', `Department Portal Accessed: ${portalName}`, 'AUTH');
            } else {
                ArgonCore.logAudit('LOGIN_FAILED', `Invalid password for portal: ${portalName}`, 'AUTH');
            }
        } else {
            const select = document.getElementById('entUserSelect');
            const uid = select ? select.value : 'admin';
            
            if (uid === 'admin') {
                const snap = await _argonDb.ref(`${CLINIC_BASE}/settings/password`).once('value');
                if (snap.val() === pass) {
                    ArgonSession.start({
                        sessionId: 'sess_admin_' + Date.now(),
                        staffId: 'admin',
                        role: 'admin',
                        displayName: 'الإدارة',
                        sessionVersion: 1,
                        clinicId: CLINIC_ID
                    });
                    success = true;
                }
            } else {
                success = await ArgonEnterpriseAuth.login(uid, pass, reqRole, isDoctor);
            }
        }

        if (success) {
            document.getElementById('enterprise-login-overlay').remove();
            window.dispatchEvent(new Event('argon-ready'));
        } else {
            document.getElementById('entErr').style.display = 'block';
        }
    }
};"""

content = re.sub(r"    injectEnterpriseLoginOverlay:\s*function\(portalName\)\s*\{[\s\S]*?nextStep:\s*function\(\)\s*\{", overlay_replacement, content, count=1)
content = re.sub(r"    doLogin:\s*async function\(portalName,\s*isDoctor\)\s*\{[\s\S]*?\}\s*\n\};", login_replacement, content, count=1)

with open(r'd:\git__hub\clinica-system\argon-core.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("done")
