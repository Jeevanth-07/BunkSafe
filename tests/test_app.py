import os
import tempfile
import unittest
from pathlib import Path

TMP = tempfile.TemporaryDirectory()
os.environ["BUNKSAFE_DB_PATH"] = str(Path(TMP.name) / "test.db")
os.environ["BUNKSAFE_SECRET_KEY"] = "test-secret-key"

import app

class BunkSafeAPITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.app.config.update(TESTING=True)

    def setUp(self):
        # Give every test a fresh database so test order cannot affect results.
        self._db_dir = tempfile.TemporaryDirectory()
        app.DB_PATH = Path(self._db_dir.name) / "test.db"
        app.init_db()
        self.client = app.app.test_client()

    def tearDown(self):
        self._db_dir.cleanup()

    def register(self, email="student@example.com", name="Student", password="StrongPass123"):
        return self.client.post("/api/register", json={"email": email, "name": name, "password": password})

    def test_health_and_home(self):
        self.assertEqual(self.client.get("/api/health").status_code, 200)
        home_response = self.client.get("/")
        try:
            self.assertEqual(home_response.status_code, 200)
        finally:
            home_response.close()

    def test_registration_and_me(self):
        response = self.register()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["user"]["role"], "student")
        self.assertEqual(self.client.get("/api/me").json["user"]["email"], "student@example.com")

    def test_rejects_invalid_registration(self):
        self.assertEqual(self.register(email="bad", name="Student").status_code, 400)
        self.assertEqual(self.register(email="short@example.com", password="123").status_code, 400)
        self.assertEqual(self.register(email="noname@example.com", name=" ").status_code, 400)

    def test_duplicate_registration(self):
        self.assertEqual(self.register().status_code, 200)
        self.assertEqual(self.register().status_code, 409)

    def test_login_logout(self):
        self.register()
        self.client.post("/api/logout")
        bad = self.client.post("/api/login", json={"email": "student@example.com", "password": "wrongpass"})
        self.assertEqual(bad.status_code, 401)
        good = self.client.post("/api/login", json={"email": "student@example.com", "password": "StrongPass123"})
        self.assertEqual(good.status_code, 200)
        self.assertEqual(self.client.post("/api/logout").status_code, 200)

    def test_password_change_requires_login_and_current_password(self):
        response = self.client.post("/api/account/password", json={
            "currentPassword": "StrongPass123", "newPassword": "NewSecurePass123!"
        })
        self.assertEqual(response.status_code, 401)
        self.register()
        weak = self.client.post("/api/account/password", json={
            "currentPassword": "StrongPass123", "newPassword": "short"
        })
        self.assertEqual(weak.status_code, 400)
        wrong = self.client.post("/api/account/password", json={
            "currentPassword": "wrong", "newPassword": "NewSecurePass123!"
        })
        self.assertEqual(wrong.status_code, 400)
        changed = self.client.post("/api/account/password", json={
            "currentPassword": "StrongPass123", "newPassword": "NewSecurePass123!"
        })
        self.assertEqual(changed.status_code, 200)
        self.assertIsNone(self.client.get("/api/me").json["user"])
        login = self.client.post("/api/login", json={
            "email": "student@example.com", "password": "NewSecurePass123!"
        })
        self.assertEqual(login.status_code, 200)

    def test_data_requires_login(self):
        self.assertEqual(self.client.get("/api/data").status_code, 401)
        self.assertEqual(self.client.put("/api/data", json={"subjects": [], "plans": []}).status_code, 401)

    def test_student_data_is_private_and_persists(self):
        self.register()
        payload = {"subjects": [{"code": "CSE100", "attended": 8, "total": 10}], "plans": [{"name": "CAT-I"}]}
        self.assertEqual(self.client.put("/api/data", json=payload).status_code, 200)
        got = self.client.get("/api/data").json
        self.assertEqual(got["subjects"], payload["subjects"])
        self.assertEqual(got["plans"], payload["plans"])
        self.client.post("/api/logout")
        self.register(email="other@example.com")
        self.assertEqual(self.client.get("/api/data").json["subjects"], [])


    def test_schedule_preview_requires_login_and_counts_sessions(self):
        payload = {
            "subject": {"code": "CSE100", "slot": "D2+TD2", "weeklyDays": ["Monday"]},
            "events": [], "startDate": "2026-10-19", "examDate": "2026-10-22"
        }
        self.assertEqual(self.client.post("/api/schedule/preview", json=payload).status_code, 401)
        self.register()
        response = self.client.post("/api/schedule/preview", json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["sessionsCounted"], 1)
        self.assertEqual(response.json["rows"][-1]["date"], "2026-10-21")

    def test_schedule_preview_rejects_invalid_dates(self):
        self.register()
        response = self.client.post("/api/schedule/preview", json={
            "subject": {"code": "CSE100", "weeklyDays": ["Monday"]},
            "events": [], "startDate": "not-a-date", "examDate": "2026-10-22"
        })
        self.assertEqual(response.status_code, 400)

    def test_student_cannot_publish_shared_calendar(self):
        self.register()
        response = self.client.put("/api/data", json={
            "subjects": [], "plans": [],
            "exams": [{"name": "Injected exam", "date": "2026-11-01"}],
            "events": [{"type": "holiday", "date": "2026-11-01"}]
        })
        self.assertEqual(response.status_code, 200)
        data = self.client.get("/api/data").json
        self.assertEqual(data["exams"], [])
        self.assertEqual(data["events"], [])

    def test_admin_can_publish_shared_calendar(self):
        with app.db() as conn:
            conn.execute("INSERT INTO users(email,name,password_hash,role) VALUES(?,?,?,'admin')",
                         ("admin@example.com", "Admin", app.hash_password("AdminPass123")))
        self.assertEqual(self.client.post("/api/login", json={
            "email": "admin@example.com", "password": "AdminPass123"
        }).status_code, 200)
        payload = {
            "subjects": [], "plans": [],
            "exams": [{"name": "CAT-I", "date": "2026-11-01"}],
            "events": [{"type": "holiday", "date": "2026-10-30", "title": "Holiday"}]
        }
        self.assertEqual(self.client.put("/api/data", json=payload).status_code, 200)
        data = self.client.get("/api/data").json
        self.assertEqual(data["exams"], payload["exams"])
        self.assertEqual(data["events"], payload["events"])

    def test_timetable_validation_endpoint(self):
        unauthenticated = self.client.post("/api/timetable/validate", json={"subjects": [], "events": []})
        self.assertEqual(unauthenticated.status_code, 401)
        self.register()
        response = self.client.post("/api/timetable/validate", json={
            "subjects": [
                {"code": "CSE100", "name": "Networks", "slot": "D2+TD2", "weeklyDays": ["Monday"]},
                {"code": "CSE100", "name": "Duplicate", "slot": "", "weeklyDays": []}
            ],
            "events": [{"date": "2026-11-02", "type": "holiday", "title": "Holiday"},
                       {"date": "2026-11-02", "type": "holiday", "title": "Holiday duplicate"}]
        })
        self.assertEqual(response.status_code, 200)
        result = response.json
        self.assertFalse(result["ok"])
        codes = {finding["code"] for finding in result["findings"]}
        self.assertIn("DUPLICATE_COURSE_CODE", codes)
        self.assertIn("MISSING_SLOT", codes)
        self.assertIn("NO_WEEKLY_MAPPING", codes)
        self.assertIn("DUPLICATE_CALENDAR_EVENT", codes)

    def test_timetable_validation_rejects_wrong_shape(self):
        self.register()
        response = self.client.post("/api/timetable/validate", json={"subjects": {}, "events": []})
        self.assertEqual(response.status_code, 400)

    def test_rejects_non_list_data(self):
        self.register()
        self.assertEqual(self.client.put("/api/data", json={"subjects": {}, "plans": []}).status_code, 400)

if __name__ == "__main__":
    unittest.main(verbosity=2)
