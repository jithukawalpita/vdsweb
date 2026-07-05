from pathlib import Path
import re

root = Path(r"d:\Users\wjith\OneDrive\Desktop\My programms")
needle = '<script src="auth-system.js"></script>'

def should_update(text):
    return bool(re.search(r'openAuth\(|[?&]openAuth=|[?&]auth=', text))

for path in sorted(root.glob('*.html')):
    if path.name.startswith('google5'):
        continue
    text = path.read_text(encoding='utf-8')
    if needle in text:
        continue
    if not should_update(text):
        continue
    if '</body>' in text:
        new_text = text.replace('</body>', f'  {needle}\n</body>', 1)
    else:
        new_text = text.rstrip() + f'\n{needle}\n'
    if new_text != text:
        path.write_text(new_text, encoding='utf-8')
        print(path.name)
