import os

files = ['dashboard.html', 'super.html', 'argon-core.js']
for f in files:
    if os.path.exists(f):
        with open(f, 'r', encoding='utf-8') as file:
            content = file.read()
        
        # Replace type="password" with the stealth version
        content = content.replace('type="password"', 'type="text" autocomplete="off" spellcheck="false" style="-webkit-text-security: disc;"')
        
        with open(f, 'w', encoding='utf-8') as file:
            file.write(content)
        print(f"Patched {f}")
