import re

def freeze_dashboard():
    with open('dashboard.html', 'r', encoding='utf-8') as f:
        html = f.read()

    # Force single_clinic mode in dashboard settings listener
    html = html.replace(
        "_sets.mode = (s.type === 'complex' || s.mode === 'medical_complex') ? 'medical_complex' : 'single_clinic';\n  checkAndSeedDefaultDepartments();",
        "_sets.mode = 'single_clinic'; // Forced by system update\n  // checkAndSeedDefaultDepartments(); // Disabled"
    )

    # Remove the HTML blocks for deptsPanel and complexPasscodes entirely
    # The regex targets the start comment until the matching closing div of the parent block.
    # We can be safe by just replacing the innerHTML with a notice or commenting it out.
    html = re.sub(
        r'<!-- DEPARTMENTS PANEL -->.*?</div>\s*</div>\s*</div>', 
        '<!-- DEPARTMENTS PANEL (FROZEN) -->', 
        html, flags=re.DOTALL
    )
    
    html = re.sub(
        r'<!-- RBAC PASSWORDS PANEL -->.*?</div>\s*</div>\s*</div>', 
        '<!-- RBAC PASSWORDS PANEL (FROZEN) -->', 
        html, flags=re.DOTALL
    )

    with open('dashboard.html', 'w', encoding='utf-8') as f:
        f.write(html)
        
freeze_dashboard()
print("Frozen complex UI in dashboard.html")
