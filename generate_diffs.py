import os
import difflib

root_dir = r"d:\git__hub\clinica-system"
mod_dir = os.path.join(root_dir, "ملفات معدلة مطورة")

files_to_compare = [
    "billing-engine.js",
    "dashboard.html",
    "emr-app.js",
    "firebase-rules.json",
    "index.html"
]

report_path = os.path.join(root_dir, "diff_report.txt")
with open(report_path, "w", encoding="utf-8") as out:
    for file in files_to_compare:
        orig_path = os.path.join(root_dir, file)
        mod_path = os.path.join(mod_dir, file)
        
        orig_lines = []
        if os.path.exists(orig_path):
            with open(orig_path, "r", encoding="utf-8") as f:
                orig_lines = f.readlines()
        else:
            out.write(f"--- Original file {file} does not exist!\n")
            
        mod_lines = []
        if os.path.exists(mod_path):
            with open(mod_path, "r", encoding="utf-8") as f:
                mod_lines = f.readlines()
        else:
            out.write(f"--- Modified file {file} does not exist!\n")
            
        diff = list(difflib.unified_diff(orig_lines, mod_lines, fromfile=f"Original {file}", tofile=f"Modified {file}", n=3))
        out.write(f"\n====================================\n")
        out.write(f"Diff for {file} (Lines: {len(diff)})\n")
        out.write(f"====================================\n\n")
        out.writelines(diff)
        
print("Diff report generated successfully.")
