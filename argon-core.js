/**
 * 🏥 ARGON Medical OS - Enterprise Core Architecture
 * Multi-Tenant Security, Session Management, License Provisioning, Maintenance Lockout, Zero Data Loss
 */

// ── Firebase Configuration (Single Source of Truth) ──
const ARGON_FIREBASE_CONFIG = {
    apiKey: "AIzaSyCDT_H-1klxbtuVR5n5GOVHKlxcmvY_2GA",
    authDomain: "clinica-system-e71b9.firebaseapp.com",
    databaseURL: "https://clinica-system-e71b9-default-rtdb.firebaseio.com",
    projectId: "clinica-system-e71b9",
    storageBucket: "clinica-system-e71b9.firebasestorage.app",
    messagingSenderId: "833103541884",
    appId: "1:833103541884:web:f8ee6ca4b3d8400cf0fbf9"
};

// Initialize only if not already initialized
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(ARGON_FIREBASE_CONFIG);
}

const _argonDb = typeof firebase !== 'undefined' ? firebase.database() : null;

// ══════════════════════════════════════════
// OFFLINE PERSISTENCE — يحفظ البيانات محلياً عند انقطاع الإنترنت
// ══════════════════════════════════════════
if (_argonDb) {
    try {
        _argonDb.goOnline(); // ensure we start online
        // Firebase RTDB has built-in disk persistence (enabled by default for web)
        // But we add explicit connection monitoring:
    } catch (e) { /* safe to ignore */ }
}

// ── Connection State Monitor ──
if (_argonDb) {
    const _connRef = _argonDb.ref('.info/connected');
    _connRef.on('value', function(snap) {
        const isOnline = snap.val() === true;
        // Update UI indicator
        let indicator = document.getElementById('argon-conn-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'argon-conn-indicator';
            indicator.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:99999;padding:4px 12px;border-radius:20px;font-size:0.7rem;font-weight:800;font-family:Tajawal,sans-serif;direction:rtl;transition:all 0.3s ease;pointer-events:none;';
            document.body.appendChild(indicator);
        }
        if (isOnline) {
            indicator.textContent = '🟢 متصل';
            indicator.style.background = 'rgba(16,185,129,0.15)';
            indicator.style.color = '#10b981';
            indicator.style.border = '1px solid rgba(16,185,129,0.3)';
            // Hide after 3 seconds when connected
            setTimeout(function() { if (indicator) indicator.style.opacity = '0'; }, 3000);
        } else {
            indicator.textContent = '🔴 غير متصل — البيانات محفوظة محلياً';
            indicator.style.background = 'rgba(239,68,68,0.15)';
            indicator.style.color = '#ef4444';
            indicator.style.border = '1px solid rgba(239,68,68,0.3)';
            indicator.style.opacity = '1';
        }
    });
}

// ── Global Time Formatter ──
window.argonTimeAgo = function (isoDate) {
    if (!isoDate) return '';
    const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
    if (diff < 10) return 'وصل للتو ⚡';
    if (diff < 60) return `قبل ${diff} ثانية`;
    const mins = Math.floor(diff / 60);
    if (mins === 1) return 'قبل دقيقة';
    if (mins < 60) return `قبل ${mins} دقيقة`;
    const hrs = Math.floor(mins / 60);
    if (hrs === 1) return 'قبل ساعة';
    if (hrs < 24) return `قبل ${hrs} ساعات`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'أمس';
    return `قبل ${days} أيام`;
};


// ── Context (Tenant Identification) ──
const urlParams = new URLSearchParams(window.location.search);
let CLINIC_ID = urlParams.get('id') || localStorage.getItem('argon_id') || '1';
if (urlParams.get('id')) localStorage.setItem('argon_id', CLINIC_ID);
const CLINIC_BASE = 'clinics/' + CLINIC_ID;

window.ArgonCore = {

    // ── 1. MEDICAL AUDIT LOG (Hardened — P0 Fix: userId + role) ──
    logAudit: function (action, details, moduleName = 'SYSTEM') {
        if (!_argonDb) return;
        const auditRef = _argonDb.ref(`${CLINIC_BASE}/audit_logs`).push();
        // PHASE 3 - 3.4: Audit Log with User Identity
        const session = window.ArgonSession ? window.ArgonSession.get() : null;
        const logEntry = {
            action: action,
            details: details,
            module: moduleName,
            userId: session?.staffId || session?.username || 'unknown',
            userRole: session?.role || 'unknown',
            userDisplayName: session?.displayName || '',
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            userAgent: navigator.userAgent,
            platform: navigator.platform
        };
        auditRef.set(logEntry).catch(err => {
            console.warn("ArgonCore: Failed to write audit log (will retry if offline).", err);
        });
    },

    // ── 2. ZERO DATA LOSS (AUTO-SAVE) ──
    AutoSave: {
        _dbPromise: null,
        _initDB: function () {
            if (!this._dbPromise) {
                this._dbPromise = new Promise((resolve, reject) => {
                    const request = indexedDB.open('ArgonDraftsDB', 1);
                    request.onupgradeneeded = (e) => {
                        e.target.result.createObjectStore('drafts');
                    };
                    request.onsuccess = (e) => resolve(e.target.result);
                    request.onerror = (e) => reject(e.target.error);
                });
            }
            return this._dbPromise;
        },
        saveDraft: async function (draftKey, dataObj) {
            try {
                const db = await this._initDB();
                const payload = { data: dataObj, savedAt: new Date().toISOString() };
                return new Promise((resolve, reject) => {
                    const tx = db.transaction('drafts', 'readwrite');
                    const store = tx.objectStore('drafts');
                    const request = store.put(payload, `argon_draft_${draftKey}`);
                    request.onsuccess = () => resolve();
                    request.onerror = (e) => reject(e.target.error);
                });
            } catch (e) {
                console.error("ArgonCore AutoSave: DB Error", e);
            }
        },
        loadDraft: async function (draftKey) {
            try {
                const db = await this._initDB();
                return new Promise((resolve) => {
                    const tx = db.transaction('drafts', 'readonly');
                    const store = tx.objectStore('drafts');
                    const request = store.get(`argon_draft_${draftKey}`);
                    request.onsuccess = () => resolve(request.result || null);
                    request.onerror = () => resolve(null);
                });
            } catch (e) { return null; }
        },
        clearDraft: async function (draftKey) {
            try {
                const db = await this._initDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction('drafts', 'readwrite');
                    const store = tx.objectStore('drafts');
                    const request = store.delete(`argon_draft_${draftKey}`);
                    request.onsuccess = () => resolve();
                    request.onerror = (e) => reject(e.target.error);
                });
            } catch (e) {
                console.error("ArgonCore AutoSave: Delete Error", e);
            }
        }
    },

    // ── 3. BACKGROUND SYNC MANAGER ──
    SyncManager: {
        init: function () {
            window.addEventListener('online', () => {
                console.log("🟢 ArgonCore: Network is ONLINE.");
                if (typeof toast === 'function') toast('عاد الاتصال بالإنترنت. جاري مزامنة البيانات...', 'ok');
            });
            window.addEventListener('offline', () => {
                console.warn("🔴 ArgonCore: Network is OFFLINE.");
                if (typeof toast === 'function') toast('⚠️ انقطع الاتصال! النظام يحفظ بياناتك محلياً بشكل آمن.', 'err');
            });
        }
    },

    // ── 3.5 APP CHECK ENFORCEMENT (PHASE 4 - PREPARATION) ──
    AppCheckManager: {
        init: function () {
            // TODO: Uncomment and add your reCAPTCHA v3 site key when Blaze is active
            /*
            if (typeof firebase !== 'undefined' && firebase.appCheck) {
                const appCheck = firebase.appCheck();
                appCheck.activate(
                    // Your reCAPTCHA v3 site key
                    'INSERT_RECAPTCHA_V3_SITE_KEY_HERE',
                    true // true = isTokenAutoRefreshEnabled
                );
                console.log("🛡️ ArgonCore: Firebase App Check initialized.");
            }
            */
        }
    },

    // ── 4. SMART NOTIFICATION CENTER ──
    NotificationCenter: {
        init: function () {
            if (!_argonDb) return;
            const notificationsRef = _argonDb.ref(`${CLINIC_BASE}/notifications`);
            const now = new Date().toISOString();
            notificationsRef.orderByChild('createdAt').startAt(now).on('child_added', snap => {
                const notif = snap.val();
                if (notif) {
                    const session = window.ArgonSession ? window.ArgonSession.get() : null;
                    if (!session) return;

                    let shouldNotify = false;
                    if (session.role === 'doctor' && notif.role === 'doctor' && notif.docKey === session.staffId) {
                        shouldNotify = true;
                    } else if (session.role === 'lab' && notif.role === 'lab') {
                        shouldNotify = true;
                    } else if (session.role === 'radiology' && notif.role === 'radiology') {
                        shouldNotify = true;
                    } else if (session.role === 'pharmacist' && notif.role === 'pharmacist') {
                        shouldNotify = true;
                    } else if (session.role === 'admin') {
                        shouldNotify = true;
                    }

                    if (shouldNotify) {
                        ArgonCore.NotificationCenter.playMedicalBeep();
                        ArgonCore.NotificationCenter.flashScreen();
                        if (typeof toast === 'function') {
                            toast(`🔔 إشعار: ${notif.title}\n${notif.message}`, 'ok');
                        }
                    }
                }
            });
        },
        playMedicalBeep: function () {
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) return;
                const ctx = new AudioContext();
                const playTone = (freq, startTime, duration) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);
                    gain.gain.setValueAtTime(0, ctx.currentTime + startTime);
                    gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + startTime + 0.05);
                    gain.gain.setValueAtTime(0.5, ctx.currentTime + startTime + duration - 0.05);
                    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + startTime + duration);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(ctx.currentTime + startTime);
                    osc.stop(ctx.currentTime + startTime + duration);
                };
                playTone(880, 0, 0.15);
                playTone(1046.5, 0.2, 0.2);
            } catch (e) { console.log("Audio blocked by browser."); }
        },
        flashScreen: function () {
            const flash = document.createElement('div');
            flash.style.position = 'fixed';
            flash.style.top = '0'; flash.style.left = '0';
            flash.style.width = '100vw'; flash.style.height = '100vh';
            flash.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
            flash.style.pointerEvents = 'none'; flash.style.zIndex = '999999';
            flash.style.transition = 'opacity 0.5s ease-out';
            document.body.appendChild(flash);
            setTimeout(() => {
                flash.style.opacity = '0';
                setTimeout(() => document.body.removeChild(flash), 500);
            }, 300);
        }
    }
};

// ── 5. SESSION MANAGEMENT & SECURITY ──
// ── 5. SESSION MANAGEMENT & ENTERPRISE SECURITY (V8.4) ──
window.ArgonSession = {
    KEY: 'argon_auth_session',
    
    // PHASE 3 - 3.1: Global Concurrency Lock
    monitorConcurrency: function () {
        if (!_argonDb) return;
        const s = this.get();
        if (!s || !s.staffId || !s.clinicId) return;

        const sessionRef = _argonDb.ref(`clinics/${s.clinicId}/active_logins/${s.staffId}`);
        sessionRef.on('value', snap => {
            const data = snap.val();
            if (data && data.sessionId !== s.sessionId) {
                // Another device logged in
                sessionRef.off('value'); // stop listening
                ArgonCore.logAudit('FORCE_LOGOUT', 'CONCURRENT_SESSION', 'AUTH');
                this.clear(); // clear local session

                // Show fixed un-closable red overlay
                const overlay = document.createElement('div');
                overlay.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(220,38,38,0.95);backdrop-filter:blur(10px);z-index:9999999;display:flex;align-items:center;justify-content:center;flex-direction:column;color:#fff;font-family:Tajawal,sans-serif;text-align:center;direction:rtl;";
                overlay.innerHTML = `
                    <i class="fas fa-exclamation-triangle" style="font-size:5rem;margin-bottom:20px;"></i>
                    <h1 style="font-size:2.5rem;font-weight:900;margin-bottom:10px">تم الدخول من جهاز آخر</h1>
                    <p style="font-size:1.2rem;max-width:500px;line-height:1.6;margin-bottom:30px">
                        تم تسجيل الدخول إلى هذا الحساب (${sanitize(s.displayName)}) من جهاز آخر. 
                        تم إنهاء هذه الجلسة فوراً حمايةً للبيانات ومنعاً للتداخل.
                    </p>
                    <button onclick="window.location.reload()" style="padding:12px 30px;background:#fff;color:#dc2626;border:none;border-radius:8px;font-size:1.1rem;font-weight:bold;cursor:pointer">إعادة تحميل الصفحة</button>
                `;
                document.body.appendChild(overlay);
            }
        });

        // Remove on window close
        window.addEventListener('beforeunload', () => {
            const current = this.get();
            if (current && current.sessionId) {
                // To avoid race conditions, only remove if we are still the active session
                sessionRef.once('value').then(snap => {
                    const d = snap.val();
                    if (d && d.sessionId === current.sessionId) {
                        sessionRef.remove();
                    }
                });
            }
        });
    },

    start: function (payload) {
        // PHASE 3 - 3.1: Unique session identifiers and Firebase sync
        payload.issuedAt = Date.now();
        payload.sessionId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : 'sess_' + Date.now() + Math.random().toString(36).substr(2);
        payload.deviceFingerprint = navigator.userAgent + "|" + window.screen.width + "x" + window.screen.height + "|" + Intl.DateTimeFormat().resolvedOptions().timeZone;
        
        sessionStorage.setItem(this.KEY, JSON.stringify(payload));

        if (_argonDb && payload.clinicId && payload.staffId) {
            _argonDb.ref(`clinics/${payload.clinicId}/active_logins/${payload.staffId}`).set({
                sessionId: payload.sessionId,
                deviceFingerprint: payload.deviceFingerprint,
                loginAt: new Date().toISOString(),
                displayName: payload.displayName || payload.staffId
            }).then(() => {
                this.monitorConcurrency();
            });
        }
    },
    get: function () {
        try { return JSON.parse(sessionStorage.getItem(this.KEY)); } catch (e) { return null; }
    },
    isValid: function (requiredRole = null) {
        const s = this.get();
        if (!s || s.clinicId !== CLINIC_ID) return false;
        if (Date.now() - s.issuedAt > 8 * 3600000) { this.clear(); return false; } // 8 hours
        if (requiredRole && s.role !== requiredRole && s.role !== 'admin') return false;
        return true;
    },
    clear: function () {
        sessionStorage.removeItem(this.KEY);
    },
    logout: function () {
        const s = this.get();
        if (s && _argonDb) {
            _argonDb.ref(`clinics/${s.clinicId}/active_logins/${s.staffId}`).remove();
        }
        if (window._pager) {
            window._pager.destroy();
            window._pager = null;
        }
        if (window.ArgonAuthBridge) window.ArgonAuthBridge.logout();
        this.clear();
        window.location.assign(window.location.pathname + window.location.search);
    }
};

window.ArgonEnterpriseAuth = {
    // P1 FIX: Per-user salt support with backward compatibility
    // Legacy hash (ARGON_SALT) still used for VERIFICATION of old passwords
    // New passwords always get a unique random salt
    _hashWithSalt: async function (rawPassword, salt) {
        const encoder = new TextEncoder();
        const data = encoder.encode(rawPassword + salt);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },
    // Backward-compatible: uses legacy salt if no salt provided
    hashPassword: async function (rawPassword, salt) {
        return this._hashWithSalt(rawPassword, salt || 'ARGON_SALT');
    },
    // PHASE 3 - 3.5: Random Unique Salt (32 bytes)
    _generateSalt: function () {
        const arr = new Uint8Array(32);
        crypto.getRandomValues(arr);
        return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    },
    setStaffCredentials: async function (uid, rawPassword, isDoctor = false) {
        // P1 FIX: Always use a unique salt for new passwords
        const salt = this._generateSalt();
        const hash = await this._hashWithSalt(rawPassword, salt);
        const basePath = isDoctor ? `${CLINIC_BASE}/doctors/${uid}` : `${CLINIC_BASE}/staff/${uid}`;
        await _argonDb.ref(`${basePath}/enterpriseAuth`).update({
            passwordHash: hash,
            passwordSalt: salt,
            sessionVersion: 1,
            updatedAt: Date.now()
        });
        ArgonCore.logAudit('PASSWORD_CHANGED', `Password updated for ${uid}`, 'AUTH');
    },
    login: async function (uid, rawPassword, role, isDoctor = false) {
        const basePath = isDoctor ? `${CLINIC_BASE}/doctors/${uid}` : `${CLINIC_BASE}/staff/${uid}`;
        const snap = await _argonDb.ref(basePath).once('value');
        const user = snap.val();
        if (!user) {
            ArgonCore.logAudit('LOGIN_FAILED', `User not found: ${uid}`, 'AUTH');
            return false;
        }

        if (!user.enterpriseAuth || !user.enterpriseAuth.passwordHash) {
            ArgonCore.logAudit('LOGIN_FAILED', `No enterprise auth setup for: ${uid}`, 'AUTH');
            // PHASE 3 - 3.3: Show Password Setup UI
            this.showSetupUI(uid, isDoctor);
            throw new Error('DEPT_PASSWORD_NOT_SET');
        }

        // P1 FIX: Try per-user salt first, then legacy salt for backward compat
        const storedHash = user.enterpriseAuth.passwordHash;
        const storedSalt = user.enterpriseAuth.passwordSalt || null;
        let matched = false;

        if (storedSalt) {
            // Modern path: per-user salt
            const inputHash = await this._hashWithSalt(rawPassword, storedSalt);
            matched = (storedHash === inputHash);
        } else {
            // Legacy path: fixed ARGON_SALT — auto-migrate on success
            const inputHash = await this.hashPassword(rawPassword);
            matched = (storedHash === inputHash);
            if (matched) {
                // AUTO-MIGRATE: upgrade to per-user salt silently
                const newSalt = this._generateSalt();
                const newHash = await this._hashWithSalt(rawPassword, newSalt);
                _argonDb.ref(`${basePath}/enterpriseAuth`).update({
                    passwordHash: newHash,
                    passwordSalt: newSalt,
                    migratedAt: Date.now()
                }).catch(() => {}); // Non-blocking — don't fail login on migration error
                ArgonCore.logAudit('SECURITY_UPGRADE', `Auto-migrated ${uid} to per-user salt`, 'AUTH');
            }
        }

        if (matched) {
            ArgonCore.logAudit('LOGIN_SUCCESS', `User logged in: ${uid}`, 'AUTH');
            ArgonSession.start({
                sessionId: 'sess_' + Date.now() + Math.floor(Math.random() * 1000),
                staffId: uid,
                role: role,
                displayName: user.displayName || user.name || uid,
                sessionVersion: user.enterpriseAuth.sessionVersion || 1,
                clinicId: CLINIC_ID
            });
            return true;
        }

        ArgonCore.logAudit('LOGIN_FAILED', `Invalid password for: ${uid}`, 'AUTH');
        return false;
    },
    
    // PHASE 3 - 3.3: Department Setup UI First-Run
    showSetupUI: function(uid, isDoctor) {
        const existing = document.getElementById('argon-setup-wizard');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'argon-setup-wizard';
        overlay.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(15,23,42,0.9);backdrop-filter:blur(8px);z-index:9999999;display:flex;align-items:center;justify-content:center;font-family:Tajawal,sans-serif;direction:rtl;";
        
        overlay.innerHTML = `
            <div style="background:#1e293b;padding:40px;border-radius:16px;border:1px solid var(--border);width:90%;max-width:400px;text-align:center;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5)">
                <i class="fas fa-shield-alt" style="font-size:3rem;color:var(--teal);margin-bottom:15px"></i>
                <h2 style="color:#fff;margin-bottom:10px">إعداد الأمان لأول مرة</h2>
                <p style="color:var(--muted);font-size:0.9rem;margin-bottom:25px">يجب تعيين كلمة مرور القسم أولاً قبل الاستخدام. هذه الخطوة تُنفذ مرة واحدة فقط.</p>
                
                <div style="text-align:right;margin-bottom:15px">
                    <label style="color:var(--sky);font-size:0.8rem;margin-bottom:5px;display:block">كلمة المرور الجديدة</label>
                    <input type="text" autocomplete="off" spellcheck="false" style="-webkit-text-security: disc;" id="arg-new-pass" class="vform-input" style="width:100%;margin-bottom:10px" placeholder="8 أحرف على الأقل">
                </div>
                <div style="text-align:right;margin-bottom:25px">
                    <label style="color:var(--sky);font-size:0.8rem;margin-bottom:5px;display:block">تأكيد كلمة المرور</label>
                    <input type="text" autocomplete="off" spellcheck="false" style="-webkit-text-security: disc;" id="arg-conf-pass" class="vform-input" style="width:100%" placeholder="تأكيد كلمة المرور">
                </div>
                
                <button id="arg-save-btn" class="btn-primary" style="width:100%;padding:12px;font-size:1.1rem"><i class="fas fa-check-circle"></i> حفظ كلمة المرور والدخول</button>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('arg-save-btn').onclick = async () => {
            const p1 = document.getElementById('arg-new-pass').value;
            const p2 = document.getElementById('arg-conf-pass').value;
            if (p1.length < 8) return alert('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
            if (p1 !== p2) return alert('كلمتا المرور غير متطابقتين');
            
            try {
                const btn = document.getElementById('arg-save-btn');
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
                btn.disabled = true;
                await this.setStaffCredentials(uid, p1, isDoctor);
                overlay.remove();
                alert('تم إعداد كلمة المرور بنجاح! يرجى تسجيل الدخول الآن.');
                window.location.reload();
            } catch (e) {
                console.error(e);
                alert('فشل حفظ كلمة المرور. تأكد من الاتصال بالإنترنت.');
                document.getElementById('arg-save-btn').disabled = false;
                document.getElementById('arg-save-btn').innerHTML = '<i class="fas fa-check-circle"></i> حفظ كلمة المرور والدخول';
            }
        };
    }
};

window.ArgonPortalACL = {
    authorizePortal: function (portalName) {
        let requiredRole = null;
        if (portalName === 'emr') requiredRole = 'doctor';
        else if (portalName === 'pharmacy') requiredRole = 'pharmacist';
        else if (portalName === 'lab') requiredRole = 'lab';
        else if (portalName === 'radiology') requiredRole = 'radiology';

        let valid = ArgonSession.isValid(requiredRole);
        
        // --- READ-ONLY OVERRIDE FOR EMR ---
        if (!valid && portalName === 'emr') {
            const isReadOnly = new URLSearchParams(window.location.search).get('readonly') === 'true';
            if (isReadOnly) {
                // If it's readonly, allow admin or reception to enter EMR
                const s = ArgonSession.get();
                if (s && (s.role === 'admin' || s.role === 'reception')) {
                    valid = true;
                }
            }
        }

        if (!valid) ArgonCore.logAudit('UNAUTHORIZED_ACCESS', `Attempted access to ${portalName}`, 'AUTH');
        return valid;
    }
};

window.ArgonPortalRuntime = {
    init: function (portalName) {
        const isAuth = ArgonPortalACL.authorizePortal(portalName);
        if (!isAuth) {
            this.injectEnterpriseLoginOverlay(portalName);
            return false;
        }
        ArgonCore.logAudit('PORTAL_ENTRY', `Entered portal ${portalName}`, 'AUTH');
        return true;
    },
    injectEnterpriseLoginOverlay: function (portalName) {
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

        const isDepartment = ['pharmacy', 'lab', 'radiology', 'reception'].includes(portalName);
        let contentHtml = '';

        if (isDepartment) {
            let deptName = portalName === 'pharmacy' ? 'الصيدلية المركزية' : (portalName === 'lab' ? 'المختبرات الطبية' : (portalName === 'reception' ? 'الاستقبال الرئيسي' : 'قسم الأشعة'));
            let icon = portalName === 'pharmacy' ? '💊' : (portalName === 'lab' ? '🧪' : (portalName === 'reception' ? '🏢' : '🩻'));
            contentHtml = `
            <div style="background: #0f172a; border: 1px solid #334155; border-radius: 24px; padding: 40px; width: 90%; max-width: 450px; text-align: center; box-shadow: 0 24px 64px rgba(0,0,0,0.5);">
                <div style="font-size: 3.5rem; margin-bottom: 12px;">${icon}</div>
                <h2 style="color: white; margin-bottom: 5px; font-weight: 900;">بوابة ${deptName}</h2>
                <p style="color: #94a3b8; margin-bottom: 24px; font-size: 0.9rem;">الرجاء إدخال كلمة مرور القسم للوصول</p>
                <div id="entLoginStep2">
                    <input type="text" autocomplete="off" spellcheck="false" style="-webkit-text-security: disc;" id="entPass" placeholder="كلمة المرور الخاصة بالقسم" style="width: 100%; padding: 12px; background: #1e293b; border: 1px solid #334155; border-radius: 10px; color: white; font-family: inherit; font-size: 1rem; margin-bottom: 15px; text-align: center; outline: none;" onkeyup="if(event.key==='Enter')ArgonPortalRuntime.doLogin('${portalName}', false)">
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
                    <input type="text" autocomplete="off" spellcheck="false" style="-webkit-text-security: disc;" id="entPass" placeholder="كلمة المرور الخاصة بك" style="width: 100%; padding: 12px; background: #1e293b; border: 1px solid #334155; border-radius: 10px; color: white; font-family: inherit; font-size: 1rem; margin-bottom: 15px; text-align: center; outline: none;" onkeyup="if(event.key==='Enter')ArgonPortalRuntime.doLogin('${portalName}', ${isDoctor})">
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
    nextStep: function () {
        const select = document.getElementById('entUserSelect');
        if (!select.value) return;
        const name = select.options[select.selectedIndex].text;
        document.getElementById('entUserName').textContent = 'دخول: ' + name;
        document.getElementById('entLoginStep1').style.display = 'none';
        document.getElementById('entLoginStep2').style.display = 'block';
        document.getElementById('entPass').focus();
    },
    prevStep: function () {
        document.getElementById('entLoginStep2').style.display = 'none';
        document.getElementById('entLoginStep1').style.display = 'block';
        document.getElementById('entErr').style.display = 'none';
        document.getElementById('entPass').value = '';
    },
    doLogin: async function (portalName, isDoctor) {
        const pass = document.getElementById('entPass').value;
        const reqRole = portalName === 'emr' ? 'doctor' : (portalName === 'pharmacy' ? 'pharmacist' : (portalName === 'lab' ? 'lab' : 'radiology'));

        let success = false;
        const isDepartment = ['pharmacy', 'lab', 'radiology'].includes(portalName);

        if (isDepartment) {
            // P0 FIX: Removed hardcoded '1122' fallback — password MUST be configured
            const snap = await _argonDb.ref(`${CLINIC_BASE}/settings/portalPasswords/${portalName}`).once('value');
            const storedHash = snap.val();
            const inputHash = await ArgonEnterpriseAuth.hashPassword(pass);

            if (!storedHash) {
                // No password configured — reject login and guide to Admin
                const errEl = document.getElementById('entErr');
                if (errEl) {
                    errEl.textContent = '⚠️ لم يتم تعيين كلمة مرور لهذا القسم. يرجى مراجعة الإدارة لإعدادها من لوحة التحكم.';
                    errEl.style.display = 'block';
                }
                ArgonCore.logAudit('LOGIN_BLOCKED', `No password configured for portal: ${portalName}`, 'AUTH');
                return; // Early return — don't proceed
            }

            if (storedHash === inputHash) {
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
                // P0 FIX: Admin password — hash-based comparison with auto-migration from plaintext
                const passSnap = await _argonDb.ref(`${CLINIC_BASE}/settings/password`).once('value');
                const hashSnap = await _argonDb.ref(`${CLINIC_BASE}/settings/passwordHash`).once('value');
                const saltSnap = await _argonDb.ref(`${CLINIC_BASE}/settings/passwordSalt`).once('value');
                const storedPlaintext = passSnap.val();
                const storedHash = hashSnap.val();
                const storedSalt = saltSnap.val();
                let adminMatched = false;

                if (storedHash) {
                    // Modern path: hash-based
                    const inputHash = storedSalt
                        ? await ArgonEnterpriseAuth._hashWithSalt(pass, storedSalt)
                        : await ArgonEnterpriseAuth.hashPassword(pass);
                    adminMatched = (storedHash === inputHash);
                } else if (storedPlaintext && storedPlaintext === pass) {
                    // Legacy plaintext match — AUTO-MIGRATE to hash NOW
                    adminMatched = true;
                    const newSalt = ArgonEnterpriseAuth._generateSalt();
                    const newHash = await ArgonEnterpriseAuth._hashWithSalt(pass, newSalt);
                    _argonDb.ref(`${CLINIC_BASE}/settings`).update({
                        passwordHash: newHash,
                        passwordSalt: newSalt,
                        password: null  // Remove plaintext permanently
                    }).catch(() => {});
                    ArgonCore.logAudit('SECURITY_UPGRADE', 'Admin password auto-migrated from plaintext to hash', 'AUTH');
                }

                if (adminMatched) {
                    ArgonSession.start({
                        sessionId: 'sess_admin_' + Date.now(),
                        staffId: 'admin',
                        role: 'admin',
                        displayName: 'الإدارة',
                        sessionVersion: 1,
                        clinicId: CLINIC_ID
                    });
                    success = true;
                    ArgonCore.logAudit('LOGIN_SUCCESS', 'Admin logged in', 'AUTH');
                } else {
                    ArgonCore.logAudit('LOGIN_FAILED', 'Invalid admin password', 'AUTH');
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
};

window.waitForArgonReady = function (portalName) {
    return new Promise((resolve) => {
        if (typeof _argonDb !== 'undefined' && ArgonPortalRuntime.init(portalName)) {
            resolve(ArgonSession.get());
            return;
        }

        window.addEventListener('argon-ready', () => {
            resolve(ArgonSession.get());
        }, { once: true });
    });
};

// ── 6. LICENSE ENGINE (Single vs Complex) ──
window.ArgonLicense = {
    type: 'single', // default
    init: function (callback) {
        if (!_argonDb) return;
        _argonDb.ref(`${CLINIC_BASE}/settings/type`).on('value', snap => {
            const t = snap.val();
            if (t) {
                this.type = t;
                document.body.classList.remove('license-single', 'license-complex');
                document.body.classList.add(`license-${t}`);
                if (callback) callback(t);
            }
        });
    },
    isComplex: function () { return this.type === 'complex'; }
};

// ── 7. MAINTENANCE LOCKOUT ENGINE ──
window.ArgonMaintenance = {
    init: function () {
        if (!_argonDb) return;
        const isInternalApp = window.location.pathname.includes('dashboard') ||
            window.location.pathname.includes('emr') ||
            window.location.pathname.includes('pharmacy') ||
            window.location.pathname.includes('lab') ||
            window.location.pathname.includes('radiology');
        if (!isInternalApp) return;

        _argonDb.ref(`${CLINIC_BASE}/settings/status`).on('value', snap => {
            const status = snap.val() || 'active';
            if (status === 'suspended' || status === 'maintenance') {
                this.showLockoutScreen(status);
            } else {
                this.hideLockoutScreen();
            }
        });
    },
    showLockoutScreen: function (status) {
        let overlay = document.getElementById('argon-lockout-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'argon-lockout-overlay';
            overlay.innerHTML = `
                <div class="lockout-content">
                    <div class="lockout-icon">🏥</div>
                    <div class="lockout-title">النظام متوقف حالياً</div>
                    <div class="lockout-sub">يرجى المحاولة لاحقاً أو التواصل مع الإدارة.</div>
                </div>
            `;
            const style = document.createElement('style');
            style.textContent = `
                #argon-lockout-overlay {
                    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                    background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    z-index: 9999999; display: flex; align-items: center; justify-content: center;
                    font-family: 'Tajawal', sans-serif; direction: rtl;
                }
                .lockout-content {
                    background: rgba(255, 255, 255, 0.05); padding: 50px 40px;
                    border-radius: 24px; border: 1px solid rgba(255, 255, 255, 0.1);
                    text-align: center; color: white; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
                    max-width: 400px; width: 90%;
                }
                .lockout-icon { font-size: 80px; margin-bottom: 20px; filter: drop-shadow(0 0 20px rgba(255,255,255,0.2)); }
                .lockout-title { font-size: 28px; font-weight: 800; margin-bottom: 15px; color: #f87171; }
                .lockout-sub { font-size: 16px; color: #cbd5e1; line-height: 1.6; }
            `;
            document.head.appendChild(style);
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    },
    hideLockoutScreen: function () {
        const overlay = document.getElementById('argon-lockout-overlay');
        if (overlay) overlay.style.display = 'none';
    }
};

// ── 7. ENTERPRISE PERFORMANCE: VIRTUAL SCROLLING (PHASE 4) ──
window.ArgonVirtualList = class {
    /**
     * @param {HTMLElement} container - The scrollable container
     * @param {Array} items - The data array
     * @param {Function} renderFn - Function returning HTML string or DOM node for an item
     * @param {number} itemHeight - Fixed height of each row in px
     */
    constructor(container, items, renderFn, itemHeight = 60) {
        this.container = container;
        this.items = items;
        this.renderFn = renderFn;
        this.itemHeight = itemHeight;
        this.visibleNodes = new Map();
        
        // Create an inner wrapper to enforce scroll height
        this.wrapper = document.createElement('div');
        this.wrapper.style.position = 'relative';
        this.wrapper.style.height = `${this.items.length * this.itemHeight}px`;
        this.container.innerHTML = '';
        this.container.appendChild(this.wrapper);
        
        this.container.addEventListener('scroll', () => this.render());
        // Use IntersectionObserver for viewport resizes/changes if needed
        this.render();
    }

    updateData(newItems) {
        this.items = newItems;
        this.wrapper.style.height = `${this.items.length * this.itemHeight}px`;
        this.render();
    }

    render() {
        const scrollTop = this.container.scrollTop;
        const containerHeight = this.container.clientHeight;
        
        const startIndex = Math.max(0, Math.floor(scrollTop / this.itemHeight) - 2);
        const endIndex = Math.min(this.items.length - 1, Math.floor((scrollTop + containerHeight) / this.itemHeight) + 2);

        // Remove out-of-bounds nodes
        for (let [index, node] of this.visibleNodes.entries()) {
            if (index < startIndex || index > endIndex) {
                this.wrapper.removeChild(node);
                this.visibleNodes.delete(index);
            }
        }

        // Add new in-bounds nodes
        for (let i = startIndex; i <= endIndex; i++) {
            if (!this.visibleNodes.has(i)) {
                const item = this.items[i];
                const content = this.renderFn(item, i);
                
                let node;
                if (typeof content === 'string') {
                    const temp = document.createElement('div');
                    temp.innerHTML = content.trim();
                    node = temp.firstChild;
                } else {
                    node = content;
                }
                
                node.style.position = 'absolute';
                node.style.top = `${i * this.itemHeight}px`;
                node.style.left = '0';
                node.style.right = '0';
                
                this.wrapper.appendChild(node);
                this.visibleNodes.set(i, node);
            }
        }
    }
};

// Initialize Core Systems
document.addEventListener('DOMContentLoaded', () => {
    ArgonCore.AppCheckManager.init();
    ArgonCore.SyncManager.init();
    ArgonCore.NotificationCenter.init();
    ArgonMaintenance.init();
    ArgonLicense.init();
});
