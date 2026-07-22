import re

with open('dashboard.html', 'r', encoding='utf-8') as f:
    content = f.read()

target = '''          info: {
            name: b.patName,
            phone: patPhone,
            age: b.patAge ? parseInt(b.patAge) : null,
            gender: b.patGender || '',
            mrn: 'MRN-' + Math.floor(100000 + Math.random() * 900000),
            createdAt: new Date().toISOString()'''
replacement = '''          info: {
            name: b.patName,
            phone: patPhone,
            nationalId: b.patNationalId || b.nationalId || '',
            age: b.patAge ? parseInt(b.patAge) : null,
            gender: b.patGender || '',
            mrn: 'MRN-' + Math.floor(100000 + Math.random() * 900000),
            createdAt: new Date().toISOString()'''

content = content.replace(target, replacement)

with open('dashboard.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('done')
