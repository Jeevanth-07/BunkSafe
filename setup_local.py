import getpass
import secrets
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ENV_FILE = ROOT / ".env"

print("BunkSafe first-time local setup")
print("This creates a stable local secret and your administrator login.")
print("Keep the .env file private and do not upload it to GitHub.\n")
if ENV_FILE.exists():
    answer = input(".env already exists. Replace it? [y/N]: ").strip().lower()
    if answer != "y":
        print("Existing configuration kept.")
        raise SystemExit(0)

email = input("Administrator email: ").strip().lower()
while "@" not in email or "." not in email.split("@")[-1]:
    print("Enter a valid email address.")
    email = input("Administrator email: ").strip().lower()
password = getpass.getpass("Administrator password (minimum 14 characters): ")
while len(password) < 14:
    print("Password must contain at least 14 characters.")
    password = getpass.getpass("Administrator password: ")
confirm = getpass.getpass("Confirm administrator password: ")
while password != confirm:
    print("Passwords do not match.")
    password = getpass.getpass("Administrator password: ")
    confirm = getpass.getpass("Confirm administrator password: ")

secret = secrets.token_hex(32)
content = "\n".join([
    "BUNKSAFE_SECRET_KEY=" + secret,
    "BUNKSAFE_ADMIN_EMAIL=" + email,
    "BUNKSAFE_ADMIN_PASSWORD=" + password,
    "BUNKSAFE_HTTPS=0",
    "BUNKSAFE_ENV=development",
    "",
])
ENV_FILE.write_text(content, encoding="utf-8")
try:
    ENV_FILE.chmod(0o600)
except OSError:
    pass
print("\nLocal configuration saved to .env.")
print("The secret stays stable between launches. Keep .env private.")
print("BUNKSAFE_HTTPS=0 is correct for local HTTP; use HTTPS before public deployment.")
