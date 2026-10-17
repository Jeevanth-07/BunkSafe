import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
# Read local .env settings for diagnostics; hosting environment variables take precedence.
for raw_line in (ROOT / ".env").read_text(encoding="utf-8").splitlines() if (ROOT / ".env").exists() else []:
    line = raw_line.strip()
    if line and not line.startswith("#") and "=" in line:
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
errors = []
warnings = []

secret = os.environ.get("BUNKSAFE_SECRET_KEY", "")
if len(secret) < 32:
    errors.append("BUNKSAFE_SECRET_KEY must be set to a stable random value of at least 32 characters.")

admin_email = os.environ.get("BUNKSAFE_ADMIN_EMAIL", "").strip()
admin_password = os.environ.get("BUNKSAFE_ADMIN_PASSWORD", "")
if not admin_email or not admin_password:
    errors.append("Set BUNKSAFE_ADMIN_EMAIL and BUNKSAFE_ADMIN_PASSWORD before first admin initialization.")
elif len(admin_password) < 14:
    errors.append("BUNKSAFE_ADMIN_PASSWORD must be at least 14 characters for deployment.")

https_enabled = os.environ.get("BUNKSAFE_HTTPS", "0") == "1"
env_mode = os.environ.get("BUNKSAFE_ENV", "development").strip().lower()
if not https_enabled and env_mode == "production":
    errors.append("Production requires BUNKSAFE_HTTPS=1 so session cookies are secure.")
elif not https_enabled:
    print("INFO: Local development uses HTTP; secure session cookies are disabled. This is expected on localhost. Set BUNKSAFE_ENV=production and BUNKSAFE_HTTPS=1 only after HTTPS is configured.")

if os.environ.get("FLASK_DEBUG", "0").lower() in ("1", "true", "yes"):
    errors.append("Debug mode must not be enabled for deployment.")

if not errors and not warnings:
    print("Configuration checks passed.")
else:
    for item in errors:
        print("ERROR: " + item)
    for item in warnings:
        print("WARNING: " + item)

if errors:
    sys.exit(1)
