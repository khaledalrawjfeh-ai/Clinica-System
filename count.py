with open('temp_4.js', 'r', encoding='utf-8') as f:
    text = f.read()

brace = 0
paren = 0
for i, c in enumerate(text):
    if c == '{': brace += 1
    elif c == '}': brace -= 1
    elif c == '(': paren += 1
    elif c == ')': paren -= 1
print(f"Braces: {brace}, Parens: {paren}")
