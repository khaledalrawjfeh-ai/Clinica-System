import json
import sys

transcript_path = r"C:\Users\96277\.gemini\antigravity-ide\brain\3a25cabe-5a0e-44d1-a517-b95a70bf3e2b\.system_generated\logs\transcript.jsonl"
dashboard_path = r"d:\git__hub\clinica-system\dashboard.html"

try:
    with open(transcript_path, 'r', encoding='utf-8') as f:
        for line in f:
            data = json.loads(line)
            if data.get('type') == 'USER_INPUT' and data.get('source') == 'USER_EXPLICIT':
                pasted_html = data.get('content', '')
                break
except Exception as e:
    print(f"Error reading transcript: {e}")
    sys.exit(1)

# Clean up <USER_REQUEST> tags if they exist
if "<USER_REQUEST>" in pasted_html:
    pasted_html = pasted_html.split("<USER_REQUEST>")[1].split("</USER_REQUEST>")[0].strip()

with open(r"d:\git__hub\clinica-system\pasted.html", 'w', encoding='utf-8') as f:
    f.write(pasted_html)

print("Extracted pasted.html successfully.")
