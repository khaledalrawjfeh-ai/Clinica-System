import re

def modify_dashboard_tax():
    with open('dashboard.html', 'r', encoding='utf-8') as f:
        html = f.read()

    # Add UI field
    if 'sTaxNumber' not in html:
        html = html.replace(
            '<div class="setg"><label class="setl">هاتف العيادة</label><input type="text" id="sP" class="seti" placeholder="+962..."></div>',
            '<div class="setg"><label class="setl">هاتف العيادة</label><input type="text" id="sP" class="seti" placeholder="+962..."></div>\n            <div class="setg"><label class="setl">الرقم الضريبي (Tax Number)</label><input type="text" id="sTaxNumber" class="seti" placeholder="National Tax Number"></div>'
        )

    # Add save logic
    if 'taxNumber:' not in html:
        html = html.replace(
            'name:sanitize(sN),\n    phone:sanitize(sP),',
            'name:sanitize(sN),\n    phone:sanitize(sP),\n    taxNumber:sanitize(document.getElementById(\'sTaxNumber\').value),'
        )

    # Add load logic
    if 's.taxNumber' not in html:
        html = html.replace(
            "document.getElementById('sP').value = s.phone || '';",
            "document.getElementById('sP').value = s.phone || '';\n  if (document.getElementById('sTaxNumber')) document.getElementById('sTaxNumber').value = s.taxNumber || '';"
        )

    with open('dashboard.html', 'w', encoding='utf-8') as f:
        f.write(html)

modify_dashboard_tax()
print("Tax Number field injected successfully!")
