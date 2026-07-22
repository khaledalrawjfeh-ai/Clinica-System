# خطة تنفيذ مفكرة الطبيب الشخصية (Task Manager)

- [x] تعديل `emr.html`: تحديث قسم `#inbox` ليحتوي على حقل إدخال (Input) وزر "إضافة مهمة".
- [x] تعديل `emr.html`: تقسيم قسم المهام إلى قسمين: "المهام المعلقة" (Pending) و "المهام المنجزة" (Completed).
- [x] تعديل `emr-app.js`: إنشاء دالة `addTask(text)` لحفظ المهمة في Firebase تحت مسار `${BASE}/tasks/${loggedInDoctorId}`.
- [x] تعديل `emr-app.js`: إنشاء دالة لجلب وعرض المهام `renderTasks(tasksData)` بشكل فوري (Real-time listener).
- [x] تعديل `emr-app.js`: إنشاء دالة `toggleTask(taskId, isDone)` لتغيير حالة المهمة.
- [x] تعديل `emr-app.js`: إنشاء دالة `deleteTask(taskId)` لحذف المهمة.
