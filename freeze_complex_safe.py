import re

def freeze_dashboard():
    with open('dashboard.html', 'r', encoding='utf-8') as f:
        html = f.read()

    # Force single_clinic mode in dashboard settings listener
    html = html.replace(
        "_sets.mode = (s.type === 'complex' || s.mode === 'medical_complex') ? 'medical_complex' : 'single_clinic';\n  checkAndSeedDefaultDepartments();",
        "_sets.mode = 'single_clinic'; // Forced by system update\n  // checkAndSeedDefaultDepartments(); // Disabled"
    )

    # Hide DEPARTMENTS PANEL
    html = html.replace(
        '<div id="deptsPanel" style="display:none;margin:20px 0 14px 0;border-top:1px dashed var(--border);padding-top:16px">',
        '<div id="deptsPanel" style="display:none !important;margin:20px 0 14px 0;border-top:1px dashed var(--border);padding-top:16px">'
    )
    
    # Hide RBAC PASSWORDS PANEL
    html = html.replace(
        '<!-- RBAC PASSWORDS PANEL -->\n        <div style="margin:20px 0 14px 0;border-top:1px dashed var(--border);padding-top:16px">',
        '<!-- RBAC PASSWORDS PANEL -->\n        <div style="display:none !important;margin:20px 0 14px 0;border-top:1px dashed var(--border);padding-top:16px">'
    )

    # Hide Operational Mode selection
    html = html.replace(
        '<label class="setl">نظام التشغيل (Operational Mode) *</label>',
        '<label class="setl" style="display:none">نظام التشغيل (Operational Mode) *</label>'
    )

    # Hide "إدارة تسعيرة الفحوصات" button (complex-only)
    html = html.replace(
        '<button class="complex-only" onclick="sw(\'pricing\',document.getElementById(\'mPricing\'))"',
        '<button class="complex-only" style="display:none !important;" onclick="sw(\'pricing\',document.getElementById(\'mPricing\'))"'
    )

    with open('dashboard.html', 'w', encoding='utf-8') as f:
        f.write(html)
        
freeze_dashboard()
print("Frozen complex UI in dashboard.html safely")
