from pathlib import Path
root = Path(r'd:/Users/wjith/OneDrive/Desktop/My programms')
needle = '<script src="nav-gate.js"></script>'
for path in sorted(root.glob('*.html')):
    text = path.read_text(encoding='utf-8')
    text = text.replace('data-role-gate="student,teacher" style="display:none;" data-role-gate="student,teacher" style="display:none;"', 'data-role-gate="student,teacher" style="display:none;"')
    if 'data-role-gate="student,teacher"' in text and needle not in text:
        if '</body>' in text:
            text = text.replace('</body>', f'  {needle}\n</body>', 1)
        else:
            text = text.rstrip() + f'\n{needle}\n'
    path.write_text(text, encoding='utf-8')
    if 'data-role-gate="student,teacher"' in text and needle not in text:
        print('still missing:', path.name)
