from pathlib import Path

root = Path(r"d:\Users\wjith\OneDrive\Desktop\My programms")
remove_tag = '<script src="auth-system.js"></script>'
keep_tag = '<script src="auth-gate.js"></script>'

for path in sorted(root.glob('*.html')):
    text = path.read_text(encoding='utf-8')
    text = text.replace(remove_tag, '')

    if keep_tag not in text:
        if '</body>' in text:
            new_text = text.replace('</body>', f'  {keep_tag}\n</body>', 1)
        else:
            new_text = text.rstrip() + '\n' + keep_tag + '\n'
    else:
        new_text = text

    if new_text != text:
        path.write_text(new_text, encoding='utf-8')
        print(path.name)
