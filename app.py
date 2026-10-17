import os
import json
import sqlite3
import secrets
import hashlib
import hmac
import time
from collections import defaultdict, deque
from contextlib import contextmanager
from functools import wraps
from pathlib import Path
from flask import Flask, request, jsonify, session, send_from_directory
from timetable_rules import validate_timetable
from schedule_engine import build_timeline

ROOT = Path(__file__).resolve().parent

# Load simple KEY=VALUE settings from the local .env file before app configuration.
# Environment variables already set by the host take precedence.
def load_local_env(path):
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key.replace("_", "").isalnum():
            os.environ.setdefault(key, value)

load_local_env(ROOT / ".env")
DATABASE_URL = os.environ.get("BUNKSAFE_DATABASE_URL", "").strip()
DB_PATH = Path(os.environ.get("BUNKSAFE_DB_PATH", str(ROOT / "bunksafe.db"))).expanduser()
if not DATABASE_URL:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
app = Flask(__name__, static_folder="static", static_url_path="/static")

@app.after_request
def add_cache_safety_headers(response):
    # Ensure browser does not reuse stale authentication JavaScript after updates.
    if response.mimetype in ("text/html", "text/javascript", "application/javascript", "text/css"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response
_configured_secret = os.environ.get("BUNKSAFE_SECRET_KEY", "").strip()
app.secret_key = _configured_secret or secrets.token_hex(32)
_is_production = os.environ.get("BUNKSAFE_ENV", "development").strip().lower() == "production"
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=(os.environ.get("BUNKSAFE_HTTPS", "0") == "1"),
    PERMANENT_SESSION_LIFETIME=60 * 60 * 24 * 7,
    MAX_CONTENT_LENGTH=2 * 1024 * 1024,
)

# Lightweight per-process throttling. For multi-worker public deployments, use
# a shared rate-limit store/proxy instead of relying on this in-memory guard.
_auth_attempts = defaultdict(deque)
_AUTH_WINDOW_SECONDS = 300
_AUTH_MAX_ATTEMPTS = 10

def auth_rate_limited(key):
    now = time.monotonic()
    attempts = _auth_attempts[key]
    while attempts and now - attempts[0] > _AUTH_WINDOW_SECONDS:
        attempts.popleft()
    if len(attempts) >= _AUTH_MAX_ATTEMPTS:
        return True
    attempts.append(now)
    return False

@app.before_request
def require_production_secrets():
    if _is_production:
        if not _configured_secret or len(_configured_secret) < 32:
            return jsonify(error="Production requires BUNKSAFE_SECRET_KEY with at least 32 characters."), 503
        if not app.config["SESSION_COOKIE_SECURE"]:
            return jsonify(error="Production requires BUNKSAFE_HTTPS=1 so session cookies are secure."), 503

@app.before_request
def protect_state_changes_from_cross_origin_requests():
    """Reject browser state-changing requests initiated by a different origin.

    The API is same-origin and does not enable cross-origin credentials. Requests
    without an Origin header remain available for command-line clients and tests;
    this is a defense-in-depth check, not a replacement for a full security audit.
    """
    if not _is_production or request.method not in ("POST", "PUT", "PATCH", "DELETE"):
        return None
    origin = request.headers.get("Origin")
    if origin:
        from urllib.parse import urlsplit
        parsed = urlsplit(origin)
        origin_authority = parsed.netloc.lower()
        request_authority = (request.host or "").lower()
        if parsed.scheme != "https" or origin_authority != request_authority:
            return jsonify(error="Cross-origin state changes are not allowed."), 403
    elif request.headers.get("Sec-Fetch-Site", "").lower() in ("cross-site", "same-site"):
        return jsonify(error="Cross-origin state changes are not allowed."), 403
    return None


class DatabaseConnection:
    """Small compatibility wrapper so the app can use SQLite locally and PostgreSQL in production."""
    def __init__(self, connection, postgres=False):
        self.connection = connection
        self.postgres = postgres

    def execute(self, sql, params=()):
        if self.postgres:
            sql = sql.replace("?", "%s")
        return self.connection.execute(sql, params)

    def commit(self):
        return self.connection.commit()

    def rollback(self):
        return self.connection.rollback()

    def close(self):
        return self.connection.close()

@contextmanager
def db():
    """Open and close a short-lived SQLite or PostgreSQL connection."""
    if DATABASE_URL:
        import psycopg
        from psycopg.rows import dict_row
        raw = psycopg.connect(DATABASE_URL, row_factory=dict_row, connect_timeout=10)
        conn = DatabaseConnection(raw, postgres=True)
    else:
        raw = sqlite3.connect(DB_PATH, timeout=10)
        raw.row_factory = sqlite3.Row
        conn = DatabaseConnection(raw, postgres=False)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def hash_password(password, salt=None):
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310000)
    return salt.hex() + ":" + digest.hex()

def verify_password(password, stored):
    try:
        salt_hex, digest_hex = stored.split(":", 1)
        candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 310000).hex()
        return hmac.compare_digest(candidate, digest_hex)
    except Exception:
        return False

def init_db():
    with db() as conn:
        if DATABASE_URL:
            conn.execute("""CREATE TABLE IF NOT EXISTS users(
                id BIGSERIAL PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL DEFAULT '',
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'student',
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )""")
            conn.execute("""CREATE TABLE IF NOT EXISTS user_data(
                user_id BIGINT PRIMARY KEY REFERENCES users(id),
                payload TEXT NOT NULL DEFAULT '{}',
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )""")
            conn.execute("""CREATE TABLE IF NOT EXISTS shared_calendar(
                id INTEGER PRIMARY KEY CHECK(id=1),
                semester TEXT NOT NULL DEFAULT 'Current semester',
                exams TEXT NOT NULL DEFAULT '[]',
                events TEXT NOT NULL DEFAULT '[]',
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )""")
            conn.execute("INSERT INTO shared_calendar(id) VALUES(1) ON CONFLICT(id) DO NOTHING")
        else:
            conn.execute("""CREATE TABLE IF NOT EXISTS users(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL DEFAULT '',
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'student',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )""")
            conn.execute("""CREATE TABLE IF NOT EXISTS user_data(
                user_id INTEGER PRIMARY KEY,
                payload TEXT NOT NULL DEFAULT '{}',
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )""")
            conn.execute("""CREATE TABLE IF NOT EXISTS shared_calendar(
                id INTEGER PRIMARY KEY CHECK(id=1),
                semester TEXT NOT NULL DEFAULT 'Current semester',
                exams TEXT NOT NULL DEFAULT '[]',
                events TEXT NOT NULL DEFAULT '[]',
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )""")
            conn.execute("INSERT OR IGNORE INTO shared_calendar(id) VALUES(1)")

def user_view(row):
    return {"id": row["id"], "email": row["email"], "name": row["name"], "role": row["role"]}

def current_user():
    uid = session.get("user_id")
    if not uid:
        return None
    with db() as conn:
        row = conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    return user_view(row) if row else None

def login_required(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        if not current_user():
            return jsonify(error="Please sign in first."), 401
        return fn(*args, **kwargs)
    return wrapped

def admin_required(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        user = current_user()
        if not user:
            return jsonify(error="Please sign in first."), 401
        if user["role"] != "admin":
            return jsonify(error="Administrator access required."), 403
        return fn(*args, **kwargs)
    return wrapped

@app.get("/manifest.json")
def twa_manifest():
    """Serve the web app manifest at the root URL expected by TWA tooling."""
    return send_from_directory(Path(app.static_folder) / "branding", "twa-manifest.json", mimetype="application/manifest+json")

@app.get("/.well-known/assetlinks.json")
def digital_asset_links():
    """Serve Android Digital Asset Links for Trusted Web Activity verification."""
    return send_from_directory(ROOT / ".well-known", "assetlinks.json", mimetype="application/json")

@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")

@app.get("/api/me")
def me():
    return jsonify(user=current_user())

@app.post("/api/register")
def register():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    name = str(data.get("name", "")).strip()[:80]
    password = str(data.get("password", ""))
    if "@" not in email or len(email) > 254:
        return jsonify(error="Enter a valid email address."), 400
    if len(password) < 8:
        return jsonify(error="Password must be at least 8 characters."), 400
    if not name:
        return jsonify(error="Enter your name."), 400
    with db() as conn:
        try:
            insert_sql = "INSERT INTO users(email,name,password_hash,role) VALUES(?,?,?,'student')"
            if DATABASE_URL:
                cur = conn.execute(insert_sql + " RETURNING id", (email, name, hash_password(password)))
                uid = cur.fetchone()["id"]
            else:
                cur = conn.execute(insert_sql, (email, name, hash_password(password)))
                uid = cur.lastrowid
            conn.execute("INSERT INTO user_data(user_id,payload) VALUES(?,?)", (uid, json.dumps({"subjects": [], "plans": []})))
        except Exception as exc:
            is_duplicate = isinstance(exc, sqlite3.IntegrityError)
            if DATABASE_URL:
                try:
                    import psycopg
                    is_duplicate = isinstance(exc, psycopg.errors.UniqueViolation)
                except ImportError:
                    pass
            if is_duplicate:
                return jsonify(error="An account with that email already exists."), 409
            raise
    session.clear()
    session["user_id"] = uid
    session.permanent = True
    return jsonify(user={"id": uid, "email": email, "name": name, "role": "student"})

@app.post("/api/login")
def login():
    key = "login:" + (request.remote_addr or "unknown")
    if auth_rate_limited(key):
        return jsonify(error="Too many attempts. Wait five minutes and try again."), 429
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    with db() as conn:
        row = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    if not row or not verify_password(password, row["password_hash"]):
        return jsonify(error="Email or password is incorrect."), 401
    session.clear()
    session["user_id"] = row["id"]
    session.permanent = True
    return jsonify(user=user_view(row))

@app.post("/api/logout")
@login_required
def logout():
    session.clear()
    return jsonify(ok=True)


@app.post("/api/account/password")
@login_required
def change_password():
    data = request.get_json(silent=True) or {}
    current_password = str(data.get("currentPassword", ""))
    new_password = str(data.get("newPassword", ""))
    if len(new_password) < 12:
        return jsonify(error="New password must be at least 12 characters."), 400
    user = current_user()
    with db() as conn:
        row = conn.execute("SELECT password_hash FROM users WHERE id=?", (user["id"],)).fetchone()
        if not row or not verify_password(current_password, row["password_hash"]):
            return jsonify(error="Current password is incorrect."), 400
        conn.execute("UPDATE users SET password_hash=? WHERE id=?", (hash_password(new_password), user["id"]))
    # Rotate session after a credential change.
    session.clear()
    return jsonify(ok=True, message="Password changed. Please sign in again.")

@app.get("/api/data")
@login_required
def get_data():
    user = current_user()
    with db() as conn:
        row = conn.execute("SELECT payload FROM user_data WHERE user_id=?", (user["id"],)).fetchone()
        shared = conn.execute("SELECT semester,exams,events FROM shared_calendar WHERE id=1").fetchone()
    payload = json.loads(row["payload"]) if row else {}
    payload.setdefault("subjects", [])
    payload.setdefault("plans", [])
    payload["exams"] = json.loads(shared["exams"])
    payload["events"] = json.loads(shared["events"])
    payload["semester"] = shared["semester"]
    return jsonify(payload)

@app.put("/api/data")
@login_required
def put_data():
    user = current_user()
    data = request.get_json(silent=True) or {}
    subjects = data.get("subjects", [])
    plans = data.get("plans", [])
    if not isinstance(subjects, list) or not isinstance(plans, list):
        return jsonify(error="Subjects and plans must be lists."), 400
    # Validate shared-calendar shapes before writing any student data, so a bad
    # admin request cannot partially update the account payload.
    if user["role"] == "admin":
        if not isinstance(data.get("exams", []), list) or not isinstance(data.get("events", []), list):
            return jsonify(error="Exams and events must be lists."), 400
    # Calendar data is shared and only writable by admin.
    with db() as conn:
        row = conn.execute("SELECT payload FROM user_data WHERE user_id=?", (user["id"],)).fetchone()
        payload = json.loads(row["payload"]) if row else {}
        payload["subjects"] = subjects
        payload["plans"] = plans
        conn.execute("""INSERT INTO user_data(user_id,payload) VALUES(?,?)
            ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,updated_at=CURRENT_TIMESTAMP""",
            (user["id"], json.dumps(payload)))
        if user["role"] == "admin":
            exams = data.get("exams", [])
            events = data.get("events", [])
            conn.execute("UPDATE shared_calendar SET exams=?,events=?,updated_at=CURRENT_TIMESTAMP WHERE id=1",
                         (json.dumps(exams), json.dumps(events)))
    return jsonify(ok=True)

@app.post("/api/timetable/validate")
@login_required
def validate_timetable_api():
    data = request.get_json(silent=True) or {}
    subjects = data.get("subjects", [])
    events = data.get("events", [])
    if not isinstance(subjects, list) or not isinstance(events, list):
        return jsonify(error="Subjects and events must be lists."), 400
    return jsonify(validate_timetable(subjects, events))

@app.post("/api/schedule/preview")
@login_required
def schedule_preview_api():
    data = request.get_json(silent=True) or {}
    try:
        result = build_timeline(data.get("subject"), data.get("events", []), data.get("startDate"), data.get("examDate"))
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    return jsonify(result)

@app.get("/api/health")
def health():
    return jsonify(status="ok", app="BunkSafe")

def create_initial_admin():
    email = os.environ.get("BUNKSAFE_ADMIN_EMAIL", "").strip().lower()
    password = os.environ.get("BUNKSAFE_ADMIN_PASSWORD", "")
    if not email or not password:
        return
    with db() as conn:
        row = conn.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()
        if row:
            conn.execute("UPDATE users SET role='admin' WHERE email=?", (email,))
        else:
            conn.execute("INSERT INTO users(email,name,password_hash,role) VALUES(?,?,?,'admin')",
                         (email, "BunkSafe Admin", hash_password(password)))

init_db()
create_initial_admin()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "5000")), debug=False)
