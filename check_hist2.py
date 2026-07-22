with open('dashboard.html', encoding='utf-8') as f:
    lines = f.readlines()
    with open('check_hist2.txt', 'w', encoding='utf-8') as out:
        for i, line in enumerate(lines):
            if 'id="hist"' in line:
                for j in range(i, i+15):
                    out.write(lines[j])
                break
