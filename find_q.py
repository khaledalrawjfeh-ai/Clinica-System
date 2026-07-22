with open('dashboard.html', encoding='utf-8') as f:
    lines = f.readlines()
    
with open('fix_lines.txt', 'w', encoding='utf-8') as out:
    for i, line in enumerate(lines):
        if 'q(\'#hist button\',' in line:
            out.write(f'Line {i+1}: {line.strip()}\n')
