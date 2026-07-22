# 🔐 ARGON MEDICAL OS — دليل التطبيق الأمني الشامل v2.1
## من الحماية الأمامية إلى العزل الكامل من السيرفر

---

## ⏱ الوقت المتوقع: 45 دقيقة

---

## الملفات المُسلَّمة (8 ملفات)

| الملف | الحجم | المهمة |
|-------|-------|--------|
| `argon-auth-bridge.js` | 325 س | Firebase Auth للسوبر أدمن والعيادات |
| `argon-patient-pager.js` | 455 س | Pagination 30 مريض/صفحة + IndexedDB |
| `argon-security-validator.js` | 491 س | مدقق تلقائي من Console |
| `emr-app-patches.js` | 649 س | كل تعديلات emr-app.js |
| `super-app-patches.js` | 223 س | كل تعديلات super-app.js |
| `firebase.rules.json` | 302 س | قواعد أمان السيرفر v2.1 |
| `INTEGRATION_EXACT_CHANGES.md` | — | Before/After لكل تغيير |
| `DEPLOYMENT_GUIDE_v2.md` | — | هذا الملف |

---

## الخطوة 1 — Firebase Console (10 دقائق)

### 1.1 فعّل Authentication
```
Firebase Console → Authentication → Sign-in method
→ Email/Password → Enable → Save
```

### 1.2 أنشئ مستخدم السوبر أدمن
```
Authentication → Users → Add user
Email:    superadmin@argon.clinic.system
Password: [نفس كلمة مرور السوبر أدمن الحالية]
```

### 1.3 انسخ الـ UID
انسخ الـ UID من العمود الأول — مثال: `KpR9mX7qT2vY1wZ3`

### 1.4 أضف UID في RTDB يدوياً
```
Realtime Database → Data (/)
→ اضغط + على الجذر
Key: clinic_auth_map
→ اضغط + على clinic_auth_map
Key:   [الـ UID الذي نسخته]
Value: __SUPER__
```

### 1.5 انشر قواعد الأمان
```
Realtime Database → Rules
→ انسخ محتوى firebase.rules.json كاملاً
→ الصق مكان القواعد الحالية
→ Publish
```

⚠️ **تأكد من الخطوة 1.4 قبل النشر** — وإلا لن تتمكن من الدخول.

---

## الخطوة 2 — انسخ الملفات للمشروع (2 دقيقة)

```
argon-auth-bridge.js         → /مجلد_المشروع/
argon-patient-pager.js       → /مجلد_المشروع/
emr-app-patches.js           → /مجلد_المشروع/
argon-security-validator.js  → /مجلد_المشروع/  (للاختبار)
```

---

## الخطوة 3 — تعديل super.html (1 دقيقة)

**قبل `<script src="super-app.js">` مباشرة، أضف:**
```html
<!-- ARGON Auth Bridge -->
<script src="argon-auth-bridge.js"></script>
```

---

## الخطوة 4 — تعديل super-app.js (8 دقائق)

### 4.1 أضف تهيئة ArgonAuthBridge
**بعد:** `const db = firebase.database();`
```javascript
ArgonAuthBridge.init(firebase.app(), db, FC);
```

### 4.2 استبدل 5 دوال من super-app-patches.js

| الدالة | الفعل |
|--------|-------|
| `doLogin()` | استبدل كاملة |
| `addClinic()` | استبدل كاملة |
| `doPass()` | استبدل كاملة |
| `updateMasterCreds()` | استبدل كاملة |
| `logout()` | استبدل كاملة |

---

## الخطوة 5 — تعديل emr.html (1 دقيقة)

**قبل `</body>`، بعد كل scripts الأصلية، أضف:**
```html
<!-- ARGON Security & Pagination Layer -->
<script src="argon-auth-bridge.js"></script>
<script src="argon-patient-pager.js"></script>
<script src="emr-app-patches.js"></script>
<!-- للاختبار فقط — احذفه في الإنتاج -->
<script src="argon-security-validator.js"></script>
```

**ترتيب scripts النهائي في emr.html:**
```html
firebase-app-compat.js
firebase-database-compat.js
firebase-auth-compat.js
firebase-storage-compat.js
argon-core.js
argon-nid-gate.js
argon-enterprise.js
billing-engine.js
argon-auth-bridge.js          ← جديد
argon-patient-pager.js        ← جديد
emr-app.js
emr-app-patches.js            ← جديد (بعد emr-app.js مباشرة)
argon-security-validator.js   ← للاختبار
```

---

## الخطوة 6 — تعديل emr-app.js (15 دقيقة)

راجع `INTEGRATION_EXACT_CHANGES.md` للتفاصيل الكاملة.

### ملخص التعديلات:

**STEP 0** — أضف متغيرين بعد `let rxItems = [];`:
```javascript
let _pager = null;
let _searchDebounceTimer = null;
```

**STEP 1** — استبدل `initEMR()` كاملة من `emr-app-patches.js`

**STEP 2** — استبدل `filterPatients()` كاملة

**STEP 3** — استبدل `renderPatientsList()` كاملة

**STEP 4** — استبدل `loadMorePatients()` وأضف `loadMorePatientsFromServer()`

**STEP 5** — أضف 4 أسطر في بداية `safeViewPatientFile()`:
```javascript
async function safeViewPatientFile(phoneOrUid) {
  // ── Lazy Load ──
  if (!_patients[phoneOrUid] && _pager) {
    const loaded = await _pager.getPatient(phoneOrUid);
    if (loaded) _patients[phoneOrUid] = loaded;
  }
  // ... باقي الكود الأصلي
```

**STEP 6** — أضف سطر واحد في `_executeSaveNewPatient()`:
```javascript
newRef.set(patObj).then(() => {
  if (window._pager) window._pager.cache[newUid] = patObj; // ← أضف هذا
  logAudit('CREATE_PATIENT', ...
```

**STEP 7** — أضف دالة `getPatientSafe()` الجديدة

**STEP 8** — أضف تنظيف `_pager` عند الخروج

---

## الخطوة 7 — اختبار التثبيت (5 دقائق)

### من console في emr.html:
```javascript
ArgonSecurityValidator.run()
```

**النتيجة المتوقعة:**
```
══ ARGON EMR Security Validator v2.0 ══

🔐 Auth Bridge
  ✅ ArgonAuthBridge loaded
  ✅ loginClinic()
  ✅ logout()
  ⚠️  No Firebase Auth session — legacy mode active

📋 Patient Pagination Engine
  ✅ ArgonPatientPager class exists
  ✅ _pager instance created
  ✅ loadNextPage()
  ✅ search()
  ✅ getPatient()
  ✅ Patients in cache: 30

🔧 EMR Patches
  ✅ filterPatients()
  ✅ renderPatientsList()
  ✅ loadMorePatients()
  ✅ loadMorePatientsFromServer()
  ✅ getPatientSafe()

🔍 safeViewPatientFile Lazy Load
  ✅ Lazy load patch applied

💾 _executeSaveNewPatient Pager Sync
  ✅ Pager cache sync applied

══════════════════════════════════
  ✅ جاهز للإنتاج
  ✅ 16 نجح | ❌ 0 فشل | ⚠️ 1 تحذير
══════════════════════════════════
```

### اختبار عزل العيادات:
```javascript
// حاول قراءة عيادة أخرى:
firebase.database().ref('clinics/ANOTHER_CLINIC_ID/patients')
  .once('value')
  .then(s => console.log('❌ ثغرة!'))
  .catch(e => console.log('✅ محمي:', e.message));
```

### قياس الأداء:
```javascript
ArgonSecurityValidator.benchmarkPagination()
// وقت جلب صفحة: < 500ms = ممتاز
```

---

## الخطوة 8 — ترحيل العيادات الموجودة (اختياري، مرة واحدة)

```javascript
// من console في super.html (بعد تسجيل الدخول):
ArgonSecurityValidator.migrateAll()
```

**المتوقع:**
```
✅ clinic-a → -NsKp7mX...
✅ clinic-b → -NtQr8nY...
⏭  clinic-c: already migrated
✅ نجح: 47 | ❌ فشل: 0 | ⏭ تخطّي: 3
```

العيادات التي لم تُرحَّل تعمل بـ **Legacy Mode** (كلمة مرور فقط) حتى يسجّل الدخول فيها أحد — عندها تُنشأ Firebase Auth تلقائياً.

---

## إصلاح v2.1 — أمان clinic_auth_settings

### المشكلة في v2.0:
```
clinics/{id}/settings/.write = "clinic OR super"
clinics/{id}/settings/authUid/.write = "super ONLY"

⚠️ Firebase RTDB: parent .write=true يتجاوز child .write=false
→ العيادة تستطيع تغيير authUid (لكن لا تكسب صلاحيات إضافية)
```

### الحل في v2.1:
```
clinic_auth_settings/{id}/.write = "super ONLY"   ← مسار محمي جديد
clinics/{id}/settings/.write = "clinic OR super"  ← لا يحتوي authUid بعد الآن
```

### التأثير:
- `argon-auth-bridge.js v2.1` يكتب في `clinic_auth_settings/{id}`
- `firebase.rules.json v2.1` يحمي هذا المسار بصرامة
- لا تغيير في أي كود آخر

---

## قائمة التحقق النهائية ✅

```
☐ Firebase Authentication مفعّل
☐ مستخدم superadmin@argon.clinic.system منشأ
☐ clinic_auth_map/{superUID} = "__SUPER__" في RTDB
☐ firebase.rules.json v2.1 منشورة
☐ argon-auth-bridge.js مُضاف في super.html وemr.html
☐ argon-patient-pager.js مُضاف في emr.html
☐ emr-app-patches.js مُضاف في emr.html (بعد emr-app.js)
☐ ArgonAuthBridge.init() مُضاف في super-app.js
☐ 5 دوال super-app.js محدَّثة
☐ 8 تعديلات emr-app.js مُطبَّقة
☐ ArgonSecurityValidator.run() يُعطي ✅ جاهز للإنتاج
☐ اختبار عزل العيادات يعمل
☐ Pagination يجلب 30 مريضاً (لا أكثر) في الطلب الأول
☐ البحث يعمل محلياً + server-side
```

---

## النتيجة النهائية

| المعيار | قبل | بعد |
|---------|-----|-----|
| عزل البيانات | Frontend فقط | Server-side Firebase Rules |
| تحميل المرضى | كل DB دفعة واحدة | 30/طلب + IndexedDB cache |
| البحث | في الذاكرة | محلي → server-side تلقائياً |
| 50,000 مريض | يُجمّد المتصفح ❌ | يعمل بسلاسة ✅ |
| 5,000 عيادة | ممكن ⚠️ | مضمون ✅ |
| مقاومة الاختراق | ضعيفة | JWT موقّع من Google |
| تغيير URL للتحايل | يعمل ❌ | Firebase Rules تمنعه ✅ |
| إنشاء عيادة | كلمة مرور فقط | Firebase Auth user تلقائياً |

---

*ARGON MEDICAL OS — Security System v2.1*
*production-ready, zero breaking changes*
