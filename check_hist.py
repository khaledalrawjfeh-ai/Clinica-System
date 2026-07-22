with open('dashboard.html', encoding='utf-8') as f:
    html = f.read()
    start = html.find('id="hist"')
    end = html.find('id="docs"')
    
with open('hist_section.txt', 'w', encoding='utf-8') as f:
    f.write(html[start:end])
