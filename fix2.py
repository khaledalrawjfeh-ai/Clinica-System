import re

with open('dashboard.html', 'r', encoding='utf-8') as f:
    content = f.read()

target1 = '''          age: b.patAge ? parseInt(b.patAge) : null,
          gender: b.patGender || '',
          mrn: 'MRN-' + Math.floor(100000 + Math.random() * 900000),
          createdAt: new Date().toISOString()'''
replacement1 = '''          nationalId: b.patNationalId || b.nationalId || '',
          age: b.patAge ? parseInt(b.patAge) : null,
          gender: b.patGender || '',
          mrn: 'MRN-' + Math.floor(100000 + Math.random() * 900000),
          createdAt: new Date().toISOString()'''

content = content.replace(target1, replacement1)

with open('dashboard.html', 'w', encoding='utf-8') as f:
    f.write(content)

with open('emr-app.js', 'r', encoding='utf-8') as f:
    content_emr = f.read()

target2 = '''      phone:      cleanPhoneStr,
      age:        booking.patAge ? parseInt(booking.patAge) : null,
      gender:     booking.patGender || '',
      mrn:        'MRN-' + Math.floor(100000 + Math.random() * 900000),'''
replacement2 = '''      phone:      cleanPhoneStr,
      nationalId: booking.patNationalId || booking.nationalId || '',
      age:        booking.patAge ? parseInt(booking.patAge) : null,
      gender:     booking.patGender || '',
      mrn:        'MRN-' + Math.floor(100000 + Math.random() * 900000),'''

content_emr = content_emr.replace(target2, replacement2)

with open('emr-app.js', 'w', encoding='utf-8') as f:
    f.write(content_emr)

print('done')
