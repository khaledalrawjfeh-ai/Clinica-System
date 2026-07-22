with open('d:/git__hub/clinica-system/emr.html', 'r', encoding='utf-8') as f:
    content = f.read()

old_str = "      <div class=\"ni\" onclick=\"sw('inbox',this)\"><i class=\"fas fa-inbox\" style=\"color:var(--sky)\"></i>المهام والنتائج</div>"
new_str = "      <div class=\"ni\" onclick=\"sw('inbox',this)\"><i class=\"fas fa-inbox\" style=\"color:var(--sky)\"></i>المهام والملاحظات</div>"

if old_str in content:
    content = content.replace(old_str, new_str)
    with open('d:/git__hub/clinica-system/emr.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Updated inbox sidebar text')
else:
    print('Old string not found')
