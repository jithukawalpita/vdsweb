from pathlib import Path
import re

root = Path(r"d:\Users\wjith\OneDrive\Desktop\My programms")
pattern = re.compile(r'<a\s+href="Daily Attendance\.html"([^>]*)>')

for path in root.glob('*.html'):
    text = path.read_text(encoding='utf-8')
    new_text = pattern.sub(lambda m: f'<a href="Daily Attendance.html" data-role-gate="student,teacher" style="display:none;"{m.group(1)}>', text)
    if new_text != text:
        path.write_text(new_text, encoding='utf-8')
        print(path.name)
