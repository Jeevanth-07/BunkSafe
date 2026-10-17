import sqlite3
from contextlib import closing
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import restore_database


def make_db(path: Path, email: str):
    with closing(sqlite3.connect(str(path))) as conn, conn:
        conn.executescript("""
            CREATE TABLE users(id INTEGER PRIMARY KEY, email TEXT);
            CREATE TABLE user_data(user_id INTEGER PRIMARY KEY, payload TEXT);
            CREATE TABLE shared_calendar(id INTEGER PRIMARY KEY, events TEXT);
        """)
        conn.execute("INSERT INTO users(email) VALUES(?)", (email,))
        conn.execute("INSERT INTO user_data(user_id, payload) VALUES(1, '{}')")
        conn.execute("INSERT INTO shared_calendar(id, events) VALUES(1, '[]')")


class BackupRestoreTests(unittest.TestCase):
    def test_restore_replaces_database_and_keeps_safety_copy(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "backup.db"
            target = root / "bunksafe.db"
            backups = root / "backups"
            make_db(source, "restored@example.com")
            make_db(target, "current@example.com")
            with patch.object(restore_database, "BACKUP_DIR", backups):
                safety = restore_database.restore_database(source, target)
            self.assertIsNotNone(safety)
            with closing(sqlite3.connect(str(target))) as conn:
                self.assertEqual(conn.execute("SELECT email FROM users").fetchone()[0], "restored@example.com")
            with closing(sqlite3.connect(str(safety))) as conn:
                self.assertEqual(conn.execute("SELECT email FROM users").fetchone()[0], "current@example.com")

    def test_rejects_non_bunksafe_database_without_changing_target(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "bad.db"
            target = root / "bunksafe.db"
            with closing(sqlite3.connect(str(source))) as conn, conn:
                conn.execute("CREATE TABLE unrelated(id INTEGER)")
            make_db(target, "keep@example.com")
            with self.assertRaises(ValueError):
                restore_database.restore_database(source, target)
            with closing(sqlite3.connect(str(target))) as conn:
                self.assertEqual(conn.execute("SELECT email FROM users").fetchone()[0], "keep@example.com")

    def test_rejects_same_source_and_target(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "same.db"
            make_db(db, "same@example.com")
            with self.assertRaises(ValueError):
                restore_database.restore_database(db, db)


if __name__ == "__main__":
    unittest.main()
