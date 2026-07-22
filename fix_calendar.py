with open('d:/git__hub/clinica-system/emr.html', 'r', encoding='utf-8') as f:
    content = f.read()

old_str = "      <div class=\"ni\" onclick=\"sw('calendar',this)\"><i class=\"fas fa-calendar-alt\" style=\"color:var(--teal)\"></i>جدول المواعيد</div>"
new_str = "      <div class=\"ni\" onclick=\"sw('calendar',this); if(window.renderDoctorCalendar) window.renderDoctorCalendar();\"><i class=\"fas fa-calendar-alt\" style=\"color:var(--teal)\"></i>جدول المواعيد</div>"

if old_str in content:
    content = content.replace(old_str, new_str)
    with open('d:/git__hub/clinica-system/emr.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Updated calendar onClick')
else:
    print('Old string not found')
