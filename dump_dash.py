with open('dashboard.html', encoding='utf-8') as f:
    lines = f.readlines()
    
with open('dash_dump.txt', 'w', encoding='utf-8') as out:
    for i in range(850, 1000):
        if i < len(lines):
            out.write(f"{i+1}: {lines[i]}")
    for i in range(1360, 1530):
        if i < len(lines):
            out.write(f"{i+1}: {lines[i]}")
