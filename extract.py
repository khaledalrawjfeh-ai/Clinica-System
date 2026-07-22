from bs4 import BeautifulSoup
import sys

try:
    with open('index.html', 'r', encoding='utf-8') as f:
        html = f.read()
    soup = BeautifulSoup(html, 'html.parser')
    for idx, script in enumerate(soup.find_all('script')):
        if script.string:
            with open(f'temp_script_{idx}.js', 'w', encoding='utf-8') as sf:
                sf.write(script.string)
            print(f"Extracted script {idx}")
except Exception as e:
    print(e)
