import difflib

with open(r"d:\git__hub\clinica-system\dashboard.html", "r", encoding="utf-8") as f:
    dashboard_lines = f.readlines()

with open(r"d:\git__hub\clinica-system\pasted.html", "r", encoding="utf-8") as f:
    pasted_lines = f.readlines()

diff = list(difflib.unified_diff(dashboard_lines, pasted_lines, fromfile="dashboard.html", tofile="pasted.html", n=3))

with open(r"d:\git__hub\clinica-system\diff_result.txt", "w", encoding="utf-8") as f:
    f.writelines(diff)
print(f"Diff lines generated: {len(diff)}")
