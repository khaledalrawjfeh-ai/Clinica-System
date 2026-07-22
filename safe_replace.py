import os
import shutil
import json
import py_compile
import traceback
import sys

root_dir = r"d:\git__hub\clinica-system"
mod_dir = os.path.join(root_dir, "ملفات معدلة مطورة")
backup_dir = os.path.join(root_dir, "backup_original_files")

files_to_replace = [
    "billing-engine.js",
    "dashboard.html",
    "emr-app.js",
    "firebase-rules.json",
    "index.html"
]

# 1. Create backup dir
if not os.path.exists(backup_dir):
    os.makedirs(backup_dir)

# 2. Backup
print("--- Backing up original files ---")
for f in files_to_replace:
    src = os.path.join(root_dir, f)
    dst = os.path.join(backup_dir, f)
    if os.path.exists(src):
        shutil.copy2(src, dst)
        print(f"Backed up: {f}")
    else:
        print(f"Warning: {f} not found in root to backup.")

# 3. Syntax Check
print("\n--- Performing Syntax Check ---")
errors_found = False

for f in files_to_replace:
    filepath = os.path.join(mod_dir, f)
    if not os.path.exists(filepath):
        print(f"Error: Modified file {f} does not exist in {mod_dir}")
        errors_found = True
        continue
        
    if f.endswith(".json"):
        try:
            with open(filepath, "r", encoding="utf-8") as file:
                json.load(file)
            print(f"{f}: JSON syntax is valid.")
        except Exception as e:
            print(f"Error in {f} JSON syntax: {e}")
            errors_found = True
            
    elif f.endswith(".js"):
        # Very basic syntax check using node if available, otherwise just warn.
        # We'll use a quick node command since this is a JS project.
        res = os.system(f'node -c "{filepath}"')
        if res == 0:
            print(f"{f}: JS syntax is valid.")
        else:
            print(f"Error in {f} JS syntax.")
            errors_found = True

if errors_found:
    print("\n[!] Errors found during syntax check. Aborting replacement to prevent breaking the system.")
    sys.exit(1)

# 4. Replace
print("\n--- Replacing Files ---")
for f in files_to_replace:
    src = os.path.join(mod_dir, f)
    dst = os.path.join(root_dir, f)
    shutil.copy2(src, dst)
    print(f"Replaced: {f}")

print("\nAll files replaced successfully. System is safe.")
sys.exit(0)
