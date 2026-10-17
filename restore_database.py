"""Safely restore a BunkSafe SQLite backup after stopping the application.

Usage:
    python restore_database.py path/to/backup.db

The current database is copied to backups/pre_restore_*.db before replacement.
"""
import os
import sqlite3
import sys
import tempfile
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TARGET = Path(os.environ.get("BUNKSAFE_DB_PATH", str(ROOT / "bunksafe.db"))).expanduser().resolve()
BACKUP_DIR = ROOT / "backups"
REQUIRED_TABLES = {"users", "user_data", "shared_calendar"}


@contextmanager
def open_database(path: Path):
    """Open a SQLite connection and always close it, including on Windows."""
    connection = sqlite3.connect(str(path), timeout=10)
    try:
        yield connection
    finally:
        connection.close()


def check_database(path: Path) -> None:
    if not path.is_file():
        raise ValueError(f"Database file does not exist: {path}")
    with open_database(path) as conn:
        result = conn.execute("PRAGMA integrity_check").fetchone()
        if not result or result[0] != "ok":
            raise ValueError(f"SQLite integrity check failed: {result[0] if result else 'no result'}")
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        missing = REQUIRED_TABLES - tables
        if missing:
            raise ValueError("This file does not look like a BunkSafe database; missing tables: " + ", ".join(sorted(missing)))


def restore_database(backup_path: Path, target_path: Path = TARGET) -> Path | None:
    backup_path = Path(backup_path).expanduser().resolve()
    target_path = Path(target_path).expanduser().resolve()
    if backup_path == target_path:
        raise ValueError("Backup and destination must be different files.")
    check_database(backup_path)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    safety_copy = None
    if target_path.exists():
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        safety_copy = BACKUP_DIR / f"pre_restore_{stamp}.db"
        with open_database(target_path) as current, open_database(safety_copy) as safety:
            current.backup(safety)
        check_database(safety_copy)

    fd, temp_name = tempfile.mkstemp(prefix="bunksafe_restore_", suffix=".db", dir=str(target_path.parent))
    os.close(fd)
    temp_path = Path(temp_name)
    try:
        with open_database(backup_path) as source, open_database(temp_path) as destination:
            source.backup(destination)
        check_database(temp_path)
        os.replace(temp_path, target_path)
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise
    return safety_copy


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] in {"-h", "--help"}:
        print("Usage: py restore_database.py PATH_TO_BACKUP.db")
        print(f"Destination database: {TARGET}")
        print("Stop BunkSafe before restoring. If a current database exists, a safety copy is created first.")
        return 0 if len(sys.argv) == 2 else 2
    try:
        safety_copy = restore_database(Path(sys.argv[1]))
    except (ValueError, OSError, sqlite3.Error) as exc:
        print(f"Restore failed: {exc}", file=sys.stderr)
        return 1
    print("Restore completed and integrity-checked.")
    print(f"Restored database: {TARGET}")
    if safety_copy:
        print(f"Previous database saved to: {safety_copy}")
    print("Restart BunkSafe and verify a student account and attendance records.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
