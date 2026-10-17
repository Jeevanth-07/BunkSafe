"""Validation helpers for BunkSafe timetable mappings.

These checks validate user-entered mappings; they do not decode official VIT day orders.
"""
import re
from collections import Counter

VALID_WEEKDAYS = {"Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"}
SLOT_RE = re.compile(r"^[A-Z]{1,3}\d{1,2}$")


def split_codes(value):
    if isinstance(value, list):
        raw = value
    else:
        raw = re.split(r"[+,;|/\s]+", str(value or ""))
    return [str(item).strip().upper() for item in raw if str(item).strip()]


def validate_timetable(subjects, events):
    findings = []
    seen = Counter()
    for index, subject in enumerate(subjects, start=1):
        if not isinstance(subject, dict):
            findings.append({"severity": "error", "code": "SUBJECT_NOT_OBJECT", "subject": str(index), "message": "Subject record must be an object."})
            continue
        code = str(subject.get("code", "")).strip().upper() or f"row {index}"
        seen[code] += 1
        if not str(subject.get("name", "")).strip():
            findings.append({"severity": "error", "code": "MISSING_NAME", "subject": code, "message": "Course name is missing."})
        slots = split_codes(subject.get("slot", ""))
        if not slots:
            findings.append({"severity": "warning", "code": "MISSING_SLOT", "subject": code, "message": "No slot code is configured; active-slot matching cannot be trusted."})
        else:
            invalid = [slot for slot in slots if not SLOT_RE.fullmatch(slot)]
            if invalid:
                findings.append({"severity": "warning", "code": "INVALID_SLOT_FORMAT", "subject": code, "message": "Review slot code(s): " + ", ".join(invalid)})
        days = subject.get("weeklyDays", [])
        if not isinstance(days, list):
            findings.append({"severity": "error", "code": "INVALID_WEEKDAYS", "subject": code, "message": "Weekly class days must be a list."})
        else:
            bad_days = [str(day) for day in days if str(day) not in VALID_WEEKDAYS]
            if bad_days:
                findings.append({"severity": "error", "code": "INVALID_WEEKDAYS", "subject": code, "message": "Unknown weekday(s): " + ", ".join(bad_days)})
            if not days:
                findings.append({"severity": "warning", "code": "NO_WEEKLY_MAPPING", "subject": code, "message": "No weekly weekday mapping is configured; dates without active-slot events may be undercounted."})
    for code, count in seen.items():
        if code and count > 1:
            findings.append({"severity": "error", "code": "DUPLICATE_COURSE_CODE", "subject": code, "message": f"Course code appears {count} times."})
    valid_event_types = {"instructional", "slot-day", "holiday", "no-class", "monday-order", "tuesday-order", "wednesday-order", "thursday-order", "friday-order", "class-session", "class-cancelled"}
    date_events = Counter()
    for index, event in enumerate(events, start=1):
        if not isinstance(event, dict):
            findings.append({"severity": "error", "code": "EVENT_NOT_OBJECT", "subject": f"event {index}", "message": "Calendar event must be an object."})
            continue
        date = str(event.get("date", "")).strip()
        kind = str(event.get("type", "")).strip()
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
            findings.append({"severity": "error", "code": "INVALID_EVENT_DATE", "subject": f"event {index}", "message": "Date must use YYYY-MM-DD format."})
        if kind not in valid_event_types:
            findings.append({"severity": "warning", "code": "UNKNOWN_EVENT_TYPE", "subject": date or f"event {index}", "message": f"Unrecognized event type: {kind or '(empty)'}."})
        date_events[(date, kind)] += 1
    for (date, kind), count in date_events.items():
        if date and kind and count > 1:
            findings.append({"severity": "warning", "code": "DUPLICATE_CALENDAR_EVENT", "subject": date, "message": f"{count} events share this date and type ({kind}). Review for duplicates."})
    return {"ok": not any(f["severity"] == "error" for f in findings), "summary": {"errors": sum(f["severity"] == "error" for f in findings), "warnings": sum(f["severity"] == "warning" for f in findings), "subjects_checked": len(subjects), "events_checked": len(events)}, "findings": findings}
