import re

with open('dashboard.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Add <script> tags before </body> if not present
init_script = """
  <script src="client-local-backup.js?v=2.1.0"></script>
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      // Initialize after a short delay to ensure CID is loaded
      setTimeout(() => {
        if (typeof LocalBackupEngine !== 'undefined' && typeof CID !== 'undefined') {
          LocalBackupEngine.init(CID);
        }
      }, 2000);
    });
  </script>
</body>"""

if 'client-local-backup.js' not in html:
    html = html.replace('</body>', init_script)

# 2. Add button in the topbar if not present
if 'LocalBackupEngine.showPanel()' not in html:
    html = html.replace('<div class="tr">', '<div class="tr">\n      <button class="tbtn" onclick="LocalBackupEngine.showPanel()" style="color:var(--green); border-color:var(--green)" title="النسخ الاحتياطي المحلي"><i class="fas fa-hdd"></i> النسخ المحلي</button>')

with open('dashboard.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Dashboard Patched Successfully!")
