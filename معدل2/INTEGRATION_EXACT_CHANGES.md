# 🔧 ARGON SECURITY v2.0 — التعديلات الدقيقة على emr-app.js
## كل تغيير بـ Before/After — لا اجتهاد، نسخ ولصق فقط

---

## ⚠️ ترتيب التنفيذ الإلزامي

```
1. أضف argon-patient-pager.js في emr.html
2. أضف emr-app-patches.js في emr.html
3. نفّذ التعديلات أدناه على emr-app.js
4. شغّل: ArgonPatchValidator.run() من Console
```

---

## STEP 0 — أضف متغيرات عالمية

**في emr-app.js، ابحث عن:**
```javascript
let rxItems = [];
```

**أضف بعده مباشرة:**
```javascript
let _pager = null;               // مثيل ArgonPatientPager
let _searchDebounceTimer = null; // debounce للبحث
```

---

## STEP 1 — استبدل initEMR() كاملة

**احذف دالة initEMR() الحالية بالكامل** واستبدلها بـ `initEMR()` من `emr-app-patches.js`.

> الدالة في الـ patch هي 230+ سطر وتحتوي تعليق `/* ══ STEP 1 */`.

---

## STEP 2 — استبدل filterPatients() كاملة

**احذف دالة filterPatients() الحالية** واستبدلها بـ `filterPatients()` من `emr-app-patches.js`.

---

## STEP 3 — استبدل renderPatientsList() كاملة

**احذف دالة renderPatientsList() الحالية** واستبدلها بـ `renderPatientsList()` من `emr-app-patches.js`.

---

## STEP 4 — استبدل loadMorePatients() واضف loadMorePatientsFromServer()

**احذف دالة loadMorePatients() الحالية** وضع بدلها:
```javascript
function loadMorePatients() {
  patPageLimit += 15;
  filterPatients();
}

async function loadMorePatientsFromServer() {
  if (!_pager) return;
  const btn = document.querySelector('#patServerLoadMore button');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> يُحمَّل...'; }
  try {
    await _pager.loadNextPage();
  } catch(e) {
    toast('❌ تعذّر تحميل المزيد: ' + e.message, 'err');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-cloud-download-alt"></i> إعادة المحاولة'; }
  }
}
```

---

## STEP 5 — تعديل safeViewPatientFile

**ابحث عن هذا السطر بالضبط:**
```javascript
async function safeViewPatientFile(phoneOrUid) {
```

**أضف هذه الأسطر الأربعة مباشرة بعده (قبل أي كود آخر):**
```javascript
  // ── Lazy Load: جلب المريض من السيرفر إذا لم يكن في الكاش المحلي ──
  if (!_patients[phoneOrUid] && _pager) {
    const loaded = await _pager.getPatient(phoneOrUid);
    if (loaded) _patients[phoneOrUid] = loaded;
  }
```

**النتيجة النهائية تبدو هكذا:**
```javascript
async function safeViewPatientFile(phoneOrUid) {
  // ── Lazy Load: جلب المريض من السيرفر إذا لم يكن في الكاش المحلي ──
  if (!_patients[phoneOrUid] && _pager) {
    const loaded = await _pager.getPatient(phoneOrUid);
    if (loaded) _patients[phoneOrUid] = loaded;
  }

  // Clear previous local lock if one exists...
  if (window.EMRContext && window.EMRContext.sessionLock && window.EMRContext.activePatientId) {
  // ... باقي الكود الأصلي
```

---

## STEP 6 — تعديل _executeSaveNewPatient

**ابحث عن هذه البلوكة بالضبط:**
```javascript
  newRef.set(patObj).then(() => {
    logAudit('CREATE_PATIENT',
```

**أضف سطراً واحداً داخل `then()` مباشرة بعد `newRef.set(patObj).then(() => {`:**
```javascript
  newRef.set(patObj).then(() => {
    // ── تحديث كاش الـ Pager فوراً بدون انتظار Firebase listener ──
    if (window._pager) window._pager.cache[newUid] = patObj;

    logAudit('CREATE_PATIENT',
```

---

## STEP 7 — أضف دالة getPatientSafe

**أضف هذه الدالة في أي مكان في emr-app.js** (مثلاً بعد loadMorePatients):

```javascript
async function getPatientSafe(uid) {
  if (!uid) return null;
  if (_patients[uid]) return _patients[uid];
  if (_pager?.cache[uid]) { _patients[uid] = _pager.cache[uid]; return _patients[uid]; }
  try {
    const p = await _pager?.getPatient(uid);
    if (p) { _patients[uid] = p; return p; }
  } catch(e) {}
  try {
    const snap = await db.ref(`${BASE}/patients/${uid}`).once('value');
    if (snap.exists()) { _patients[uid] = snap.val(); return _patients[uid]; }
  } catch(e) {}
  return null;
}
```

---

## STEP 8 — تنظيف عند الخروج

**ابحث في emr-app.js عن:** `ArgonSession.logout()` أو أي دالة logout.

**أضف قبلها:**
```javascript
if (window._pager) { window._pager.destroy(); window._pager = null; }
```

---

## STEP 9 — تعديل super-app.js (بعد Firebase init)

**ابحث في super-app.js عن:**
```javascript
const db = firebase.database();
```

**أضف مباشرة بعده:**
```javascript
ArgonAuthBridge.init(firebase.app(), db, FC);
```

---

## STEP 10 — استبدل 5 دوال في super-app.js

كل دالة في `super-app-patches.js` مُعلَّمة بـ `STEP 1`..`STEP 5`:

| الخطوة | الدالة | الفعل |
|--------|--------|-------|
| STEP 1 | `doLogin()` | استبدل كاملة |
| STEP 2 | `addClinic()` | استبدل كاملة |
| STEP 3 | `doPass()` | استبدل كاملة |
| STEP 4 | `updateMasterCreds()` | استبدل كاملة |
| STEP 5 | `logout()` | استبدل كاملة |

---

## STEP 11 — تحديث argon-auth-bridge.js لـ clinic_auth_settings

في `createClinicUser()` غيّر:
```javascript
// قديم:
await _db.ref(`clinics/${clinicId}/settings`).update({
  authEmail: email,
  authUid: uid,
  authEnabled: true
});

// جديد (FIX v2.1 — auth fields في مسار محمي):
await _db.ref(`clinic_auth_settings/${clinicId}`).set({
  authEmail: email,
  authUid: uid,
  authEnabled: true,
  createdAt: new Date().toISOString()
});
```

---

## STEP 12 — تحديث emr.html وsuper.html

### في emr.html (قبل `</body>`، بعد `emr-app.js`):
```html
<!-- ARGON Security & Pagination Layer -->
<script src="argon-patient-pager.js"></script>
<script src="emr-app-patches.js"></script>
```

### في super.html (قبل `</body>`، بعد Firebase SDKs وقبل `super-app.js`):
```html
<!-- ARGON Auth Bridge -->
<script src="argon-auth-bridge.js"></script>
```

---

## التحقق النهائي من Console المتصفح

```javascript
// في emr.html بعد تسجيل الدخول:
ArgonPatchValidator.run()

// النتيجة المتوقعة:
// ✅ ArgonPatientPager class
// ✅ _pager initialized
// ✅ _pager.cache exists
// ✅ _patients linked
// ✅ filterPatients updated
// ✅ loadMorePatientsFromServer
// ✅ getPatientSafe
// ✅ ArgonAuthBridge loaded
// نتيجة: 8/8 — ✅ جاهز للإنتاج
```

---

## اختبار Pagination من Console

```javascript
// اختبار الصفحة الأولى:
console.log('Patients cached:', Object.keys(_patients).length);
console.log('Has more:', _pager.hasMore);
console.log('Total cached:', _pager.totalCached);

// اختبار البحث server-side:
_pager.search('محمد').then(count => console.log('Found:', count));

// اختبار جلب مريض واحد:
getPatientSafe('-NxYzAbc123').then(p => console.log('Patient:', p?.info?.name));
```

---

## اختبار عزل العيادات

```javascript
// من console في emr.html لعيادة A:
// حاول قراءة بيانات عيادة B:
firebase.database()
  .ref('clinics/CLINIC_B_ID/patients')
  .once('value')
  .then(s => console.log('❌ ثغرة! يمكن قراءة عيادة أخرى'))
  .catch(e => console.log('✅ محمي بشكل صحيح:', e.message));
```

---

## ترتيب script tags النهائي في emr.html

```html
<!-- Firebase SDK -->
<script src="https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.1/firebase-database-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.1/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.1/firebase-storage-compat.js"></script>

<!-- ARGON Core -->
<script src="argon-core.js???v=7"></script>
<script src="argon-nid-gate.js"></script>
<script src="argon-enterprise.js???v=7"></script>
<script src="billing-engine.js?v=12.994"></script>

<!-- ✅ جديد: Auth Bridge + Pagination -->
<script src="argon-auth-bridge.js"></script>
<script src="argon-patient-pager.js"></script>

<!-- EMR Core -->
<script src="emr-app.js?v=11"></script>

<!-- ✅ جديد: Patches (بعد emr-app.js مباشرة) -->
<script src="emr-app-patches.js"></script>
```

---

## ترتيب script tags النهائي في super.html

```html
<!-- Firebase SDK -->
<script src="https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.1/firebase-database-compat.js"></script>

<!-- ✅ جديد: Auth Bridge -->
<script src="argon-auth-bridge.js"></script>

<!-- Super App -->
<script src="super-app.js"></script>
```

---

*ARGON MEDICAL OS — Integration Guide v2.0*
*خطوات دقيقة، صفر اجتهاد*
