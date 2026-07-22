import re

with open('dashboard.html', encoding='utf-8') as f:
    lines = f.readlines()

with open('search_results.txt', 'w', encoding='utf-8') as out:
    for i, line in enumerate(lines):
        if 'مسح' in line:
            # Replace non-BMP characters to avoid powershell issues if needed,
            # but writing to file is safe if we use view_file.
            out.write(f'Line {i+1}: {line.strip()}\n')
