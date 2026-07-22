# ═══════════════════════════════════════════════════════════
# CLINICA PRO — دليل الإعداد الكامل
# نظام حجز العيادات الاحترافي
# ═══════════════════════════════════════════════════════════

## 1️⃣ إنشاء مشروع Firebase جديد

1. اذهب إلى: https://console.firebase.google.com
2. انقر "Add project" → اسمه: `clinica-pro`
3. فعّل Google Analytics (اختياري)
4. انتظر إنشاء المشروع

## 2️⃣ تفعيل Realtime Database

1. في القائمة الجانبية → "Realtime Database"
2. "Create Database" → اختر "United States" (أو Europe)
3. اختر "Start in test mode" (مؤقتاً)

## 3️⃣ قواعد الأمان — انسخ هذا في Rules

```json
{
  "rules": {
    "clinics": {
      "$clinicId": {
        ".read": true,
        ".write": true,
        "settings": {
          ".read": true,
          ".write": true
        },
        "doctors": {
          ".read": true,
          ".write": true
        },
        "bookings": {
          ".read": true,
          ".write": true
        },
        "completedBookings": {
          ".read": true,
          ".write": true
        }
      }
    },
    "admins": {
      ".read": false,
      ".write": false
    }
  }
}
```

## 4️⃣ الحصول على بيانات الاتصال

1. في الصفحة الرئيسية للمشروع → "Add app" → Web (</>)
2. اسم التطبيق: "clinica-web"
3. انسخ الـ firebaseConfig الذي يظهر

## 5️⃣ استبدال بيانات Firebase في الملفات

في كل ملف (index.html, dashboard.html, super.html)، استبدل:
```javascript
const firebaseConfig = {
  apiKey: "YOUR_CLINIC_API_KEY",           // ← ضع apiKey الخاص بك
  authDomain: "YOUR_CLINIC_PROJECT.firebaseapp.com",  // ← اسم مشروعك
  databaseURL: "https://YOUR_CLINIC_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_CLINIC_PROJECT",
  storageBucket: "YOUR_CLINIC_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

## 6️⃣ إنشاء GitHub Repository جديد

1. اذهب إلى: https://github.com/new
2. اسم المستودع: `clinica-system`
3. اجعله Public (للنشر المجاني على Vercel/GitHub Pages)
4. أضف الملفات الأربعة:
   - index.html
   - dashboard.html
   - super.html
   - README.md (هذا الملف)

## 7️⃣ النشر على Vercel (مجاني)

1. اذهب إلى: https://vercel.com
2. "Import Project" → اربطه بـ GitHub
3. اختر `clinica-system`
4. انشر — ستحصل على رابط مثل: `clinica-system.vercel.app`

أو النشر على GitHub Pages:
1. Settings → Pages
2. Source: Deploy from branch → main
3. رابطك: `username.github.io/clinica-system`

## 8️⃣ render.yaml للنشر التلقائي

```yaml
services:
  - type: static
    name: clinica-system
    env: static
    buildCommand: ""
    publishPath: "."
```

# ═══════════════════════════════════════════════════════════
## هيكل قاعدة البيانات

```
clinics/
  {clinicId}/
    settings/
      name: "عيادة د. أحمد"
      password: "1122"
      phone: "+962791234567"
      specialty: "طب عام"
      color: "#0d9488"
      emoji: "🏥"
      status: "open" | "closed" | "suspended"
      acceptBookings: true
      hours: "9ص - 5م"
    
    doctors/
      {doctorKey}/
        name: "أحمد محمد"
        specialty: "طب عام"
        fee: 15
        slotDuration: 30
        workStart: "09:00"
        workEnd: "17:00"
        emoji: "👨‍⚕️"
        available: true
    
    bookings/
      {bookingKey}/
        bookNo: "#1234"
        docKey: "..."
        docName: "أحمد"
        docSpec: "طب عام"
        patName: "محمد عبدالله"
        patPhone: "0791234567"
        patAge: "35"
        patGender: "ذكر"
        notes: "..."
        date: "2026-04-17"
        time: "10:00"
        fee: "15.00"
        status: "new"|"confirmed"|"waiting"|"done"|"cancelled"
        createdAt: "2026-04-17T..."
    
    completedBookings/
      {bookingKey}/ ... (نفس بنية الحجز + rating)
```

# ═══════════════════════════════════════════════════════════
## الروابط والاستخدام

| الصفحة | الرابط | الاستخدام |
|--------|--------|-----------|
| حجز المريض | index.html?id=CLINIC_ID | يُرسل للمريض |
| لوحة العيادة | dashboard.html?id=CLINIC_ID | للطبيب/المدير |
| Super Admin | super.html | لإدارة كل العيادات |

## بيانات Super Admin
- المستخدم: `admin`
- كلمة المرور: `clinica2024`

## كلمة مرور Dashboard الافتراضية
- `1122`
- (تغيّر من الإعدادات بعد الدخول)

# ═══════════════════════════════════════════════════════════
## الميزات الأمنية

✅ كلمة مرور منفصلة لكل عيادة
✅ Super Admin منفصل ومحمي
✅ إيقاف العيادة بضغطة زر
✅ إغلاق استقبال الحجوزات بدون إيقاف العيادة
✅ شاشة lockout عند الإيقاف
✅ لا يمكن الحجز عند الإيقاف
✅ مراقبة الاتصال في الوقت الحقيقي
✅ الوضع الليلي

## الميزات الطبية
✅ تقييم الطبيب بعد الزيارة (5 نجوم)
✅ منع حجز وقت محجوز مسبقاً
✅ تتبع حالة الحجز (جديد→مؤكد→انتظار→مكتمل)
✅ إرسال واتساب للمريض
✅ سجل كامل بالحجوزات
✅ تحليل أداء الأطباء
✅ إحصاءات مالية كاملة

## الميزات الإدارية
✅ إضافة أطباء مع صورة/إيموجي
✅ تحديد أوقات عمل كل طبيب
✅ تحديد مدة الكشف (بالدقائق)
✅ تفعيل/إيقاف طبيب بضغطة
✅ QR Code لكل عيادة
✅ لوحة Super Admin مع كل العيادات
