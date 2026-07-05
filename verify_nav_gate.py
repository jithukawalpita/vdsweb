from pathlib import Path
root = Path(r'd:/Users/wjith/OneDrive/Desktop/My programms')
for path in sorted(root.glob('*.html')):
    text = path.read_text(encoding='utf-8')
    if 'data-role-gate="student,teacher"' in text:
        missing = []
        if '<script src="nav-gate.js"></script>' not in text:
            missing.append('nav-gate.js')
        if '<script src="auth-system.js"></script>' not in text:
            missing.append('auth-system.js')
        if missing:
            print(path.name, missing)
