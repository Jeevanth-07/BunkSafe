"""Basic clean-install verification for the BunkSafe project folder."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
REQUIRED = [
    "app.py", "requirements.txt", "README.md", "run.bat",
    "static/index.html", "static/style.css", "static/script.js",
    "schedule_engine.py", "timetable_rules.py", "restore_database.py",
]
missing = [name for name in REQUIRED if not (ROOT / name).is_file()]
if missing:
    print("Installation check failed. Missing files:")
    for name in missing:
        print(f" - {name}")
    raise SystemExit(1)
print("Project files: OK")
print("Python executable:", sys.executable)
try:
    import flask
    print("Flask import: OK", getattr(flask, "__version__", ""))
except Exception as exc:
    print("Flask import: FAILED -", exc)
    print("Run: python -m pip install -r requirements.txt")
    raise SystemExit(1)
print("Clean-install check passed. Start with run.bat.")
