import unittest
from datetime import date
from schedule_engine import build_timeline

class ScheduleEngineTests(unittest.TestCase):
    def setUp(self):
        self.subject = {"code": "CSE100", "slot": "D2+TD2", "weeklyDays": ["Monday"]}

    def test_weekly_mapping_counts_only_matching_weekday(self):
        result = build_timeline(self.subject, [], "2026-10-19", "2026-10-22")
        self.assertEqual(result["sessionsCounted"], 1)
        self.assertEqual([r["date"] for r in result["rows"] if r["counted"]], ["2026-10-19"])

    def test_holiday_excludes_weekly_class(self):
        events = [{"date": "2026-10-19", "type": "holiday"}]
        result = build_timeline(self.subject, events, "2026-10-19", "2026-10-22")
        self.assertEqual(result["sessionsCounted"], 0)
        self.assertEqual(result["rows"][0]["source"], "Calendar exclusion")

    def test_explicit_class_overrides_weekday(self):
        events = [{"date": "2026-10-20", "type": "class-session", "courseCode": "cse100"}]
        result = build_timeline(self.subject, events, "2026-10-20", "2026-10-21")
        self.assertEqual(result["sessionsCounted"], 1)
        self.assertEqual(result["rows"][0]["source"], "Subject override")

    def test_cancellation_overrides_weekly_class(self):
        events = [{"date": "2026-10-19", "type": "class-cancelled", "courseCode": "CSE100"}]
        result = build_timeline(self.subject, events, "2026-10-19", "2026-10-20")
        self.assertEqual(result["sessionsCounted"], 0)

    def test_active_slot_match(self):
        events = [{"date": "2026-10-20", "type": "slot-day", "title": "D2, TD2"}]
        result = build_timeline(self.subject, events, "2026-10-20", "2026-10-21")
        self.assertEqual(result["sessionsCounted"], 1)

    def test_exam_date_is_exclusive(self):
        result = build_timeline(self.subject, [], "2026-10-19", "2026-10-20")
        self.assertEqual(result["daysChecked"], 1)
        self.assertEqual(result["rows"][-1]["date"], "2026-10-19")

    def test_invalid_range_rejected(self):
        with self.assertRaises(ValueError):
            build_timeline(self.subject, [], "2026-10-20", "2026-10-20")

    def test_default_vit_slot_mapping_is_used_when_weekly_days_missing(self):
        from schedule_engine import decide_date
        subject = {"code": "BCSE302L", "slot": "D2+TD2"}
        self.assertTrue(decide_date(subject, date(2026, 10, 19), []).get("counted"))  # Monday D2
        self.assertTrue(decide_date(subject, date(2026, 10, 21), []).get("counted"))  # Wednesday TD2
        self.assertTrue(decide_date(subject, date(2026, 10, 22), []).get("counted"))  # Thursday D2
        self.assertFalse(decide_date(subject, date(2026, 10, 20), []).get("counted")) # Tuesday

if __name__ == "__main__":
    unittest.main(verbosity=2)
