"""Create a consistent SQLite backup of the BunkSafe database.

Run from the BunkSafe folder:
    python backup_database.py

The source database is selected by BUNKSAFE_DB_PATH or defaults to
BunkSafe/bunksafe.db. Backups are written to BunkSafe/backups/.
"""
import os
import sqlite3
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = Path(os.environ.get("BUNKSAFE_DB_PATH", str(ROOT / "bunksafe.db"))).expanduser().resolve()
BACKUP_DIR = Path(os.environ.get("BUNKSAFE_BACKUP_DIR", str(ROOT / "backups"))).expanduser()


def main():
    if not SOURCE.exists():
        raise SystemExit(f"Database not found: {SOURCE}\nStart BunkSafe once or set BUNKSAFE_DB_PATH correctly.")

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    destination = BACKUP_DIR / f"bunksafe_backup_{stamp}.db"

    source_conn = sqlite3.connect(str(SOURCE), timeout=10)
    target_conn = sqlite3.connect(str(destination), timeout=10)
    try:
        source_conn.backup(target_conn)
        result = target_conn.execute("PRAGMA integrity_check").fetchone()
        if not result or result[0] != "ok":
            destination.unlink(missing_ok=True)
            raise SystemExit(f"Backup integrity check failed: {result[0] if result else 'no result'}")
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        target_conn.close()
        source_conn.close()

    print("Backup created and integrity-checked:")
    print(destination)
    print("Keep a copy outside this computer for disaster recovery.")


if __name__ == "__main__":
    main()
