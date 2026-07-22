import re

with open('d:/git__hub/clinica-system/emr-app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Add logic for Doctor Tasks Manager
tasks_logic = '''
// ══════════════════════════════════════════════════════════════
// DOCTOR TASKS MANAGER (إدارة المهام والملاحظات الشخصية)
// ══════════════════════════════════════════════════════════════

window.addDoctorTask = function() {
  const inputEl = document.getElementById('newTaskInput');
  if (!inputEl) return;
  const text = inputEl.value.trim();
  if (!text) return;
  
  const session = ArgonSession.get() || {};
  const docId = session.staffId;
  if (!docId) {
    alert("عذراً، يجب تسجيل الدخول كطبيب لإضافة المهام.");
    return;
  }
  
  const taskId = db.ref(`${BASE}/tasks/${docId}`).push().key;
  
  db.ref(`${BASE}/tasks/${docId}/${taskId}`).set({
    text: text,
    status: 'pending',
    timestamp: Date.now()
  }).then(() => {
    inputEl.value = '';
    inputEl.focus();
  }).catch(err => {
    console.error(err);
    alert('حدث خطأ أثناء حفظ المهمة');
  });
};

window.toggleTaskStatus = function(taskId, currentStatus) {
  const session = ArgonSession.get() || {};
  const docId = session.staffId;
  if (!docId) return;
  
  const newStatus = (currentStatus === 'pending') ? 'completed' : 'pending';
  db.ref(`${BASE}/tasks/${docId}/${taskId}/status`).set(newStatus);
};

window.deleteTask = function(taskId) {
  if(!confirm('هل أنت متأكد من حذف هذه المهمة؟')) return;
  const session = ArgonSession.get() || {};
  const docId = session.staffId;
  if (!docId) return;
  
  db.ref(`${BASE}/tasks/${docId}/${taskId}`).remove();
};

function renderDoctorTasks(tasksObj) {
  const pendingEl = document.getElementById('tasksPending');
  const completedEl = document.getElementById('tasksCompleted');
  if (!pendingEl || !completedEl) return;
  
  if (!tasksObj) {
    pendingEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:0.9rem;">لا توجد مهام معلقة.</div>';
    completedEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:0.9rem;">لا توجد مهام منجزة.</div>';
    return;
  }
  
  let pendingHtml = '';
  let completedHtml = '';
  
  // Sort tasks by timestamp (newest first)
  const tasks = Object.entries(tasksObj).sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
  
  tasks.forEach(([id, t]) => {
    const isCompleted = t.status === 'completed';
    const dateStr = new Date(t.timestamp).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' });
    
    const cardHtml = `
      <div style="background:#fff; border:1px solid var(--border); border-radius:8px; padding:12px; display:flex; align-items:flex-start; gap:10px; transition:0.2s;">
        <button onclick="window.toggleTaskStatus('${id}', '${t.status}')" style="background:none; border:none; cursor:pointer; font-size:1.2rem; color:${isCompleted ? 'var(--green)' : 'var(--muted)'}; padding:0;">
          <i class="${isCompleted ? 'fas fa-check-circle' : 'far fa-circle'}"></i>
        </button>
        <div style="flex:1;">
          <div style="font-weight:bold; font-size:0.95rem; text-decoration:${isCompleted ? 'line-through' : 'none'}; color:${isCompleted ? 'var(--muted)' : '#000'}">
            ${t.text}
          </div>
          <div style="font-size:0.75rem; color:var(--muted); margin-top:4px;">
            <i class="far fa-clock"></i> ${dateStr}
          </div>
        </div>
        <button onclick="window.deleteTask('${id}')" style="background:none; border:none; cursor:pointer; font-size:1rem; color:var(--red); padding:4px; opacity:0.6; transition:0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>
    `;
    
    if (isCompleted) {
      completedHtml += cardHtml;
    } else {
      pendingHtml += cardHtml;
    }
  });
  
  pendingEl.innerHTML = pendingHtml || '<div style="text-align:center;padding:20px;color:var(--muted);font-size:0.9rem;">لا توجد مهام معلقة. رائعة! 🎉</div>';
  completedEl.innerHTML = completedHtml || '<div style="text-align:center;padding:20px;color:var(--muted);font-size:0.9rem;">لا توجد مهام منجزة.</div>';
}

// Hook to listen for tasks
let _tasksListener = null;
function initDoctorTasksListener() {
  const session = ArgonSession.get() || {};
  const docId = session.staffId;
  if (!docId) return;
  
  if (_tasksListener) db.ref(`${BASE}/tasks/${docId}`).off('value', _tasksListener);
  
  _tasksListener = db.ref(`${BASE}/tasks/${docId}`).on('value', snap => {
    if(document.getElementById('tasksPending')) {
      renderDoctorTasks(snap.val());
    }
  });
}

// Start listening once the system loads
setTimeout(initDoctorTasksListener, 2000);

// Also re-init if they open the inbox specifically
const oldSwTasks = window.sw;
window.sw = function(id, el) {
  oldSwTasks(id, el);
  if(id === 'inbox') {
    initDoctorTasksListener();
  }
};
'''

content = content + "\n" + tasks_logic

with open('d:/git__hub/clinica-system/emr-app.js', 'w', encoding='utf-8') as f:
    f.write(content)
print('Appended Doctor Tasks Logic to emr-app.js')
