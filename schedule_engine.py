"""Deterministic dated-session estimator used by BunkSafe preview API.

This evaluates only the timetable rules supplied by the user/admin. It does not
infer official VIT day orders or guarantee that a supplied mapping is correct.
"""
from datetime import date, timedelta
import re

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
ORDER_TYPES = {
    "monday-order": 0, "tuesday-order": 1, "wednesday-order": 2,
    "thursday-order": 3, "friday-order": 4,
}
HOLIDAY_TYPES = {"holiday", "no-class"}
EXPLICIT_TYPES = {"class-session", "class-cancelled"}

def _codes(value):
    raw = value if isinstance(value, list) else re.split(r"[+,;|/\s]+", str(value or ""))
    return [str(x).strip().upper() for x in raw if str(x).strip()]

def _event_date(event):
    try:
        return date.fromisoformat(str(event.get("date", "")))
    except (ValueError, TypeError):
        return None


# Default VIT slot grid transcribed from the user's timetable image.
DEFAULT_SLOT_DAYS = {
    'A1': ['Monday', 'Wednesday'],
    'A2': ['Monday', 'Wednesday'],
    'B1': ['Tuesday', 'Thursday'],
    'B2': ['Tuesday', 'Thursday'],
    'C1': ['Wednesday', 'Friday'],
    'C2': ['Wednesday', 'Friday'],
    'D1': ['Monday', 'Thursday'],
    'D2': ['Monday', 'Thursday'],
    'E1': ['Tuesday', 'Friday'],
    'E2': ['Tuesday', 'Friday'],
    'F1': ['Monday', 'Wednesday'],
    'F2': ['Monday', 'Wednesday'],
    'G1': ['Tuesday', 'Thursday'],
    'G2': ['Tuesday', 'Thursday'],
    'L1': ['Monday'],
    'L10': ['Tuesday'],
    'L11': ['Tuesday'],
    'L12': ['Tuesday'],
    'L13': ['Wednesday'],
    'L14': ['Wednesday'],
    'L15': ['Wednesday'],
    'L16': ['Wednesday'],
    'L17': ['Wednesday'],
    'L18': ['Wednesday'],
    'L19': ['Thursday'],
    'L2': ['Monday'],
    'L20': ['Thursday'],
    'L21': ['Thursday'],
    'L22': ['Thursday'],
    'L23': ['Thursday'],
    'L24': ['Thursday'],
    'L25': ['Friday'],
    'L26': ['Friday'],
    'L27': ['Friday'],
    'L28': ['Friday'],
    'L29': ['Friday'],
    'L3': ['Monday'],
    'L30': ['Friday'],
    'L31': ['Monday'],
    'L32': ['Monday'],
    'L33': ['Monday'],
    'L34': ['Monday'],
    'L35': ['Monday'],
    'L36': ['Monday'],
    'L37': ['Tuesday'],
    'L38': ['Tuesday'],
    'L39': ['Tuesday'],
    'L4': ['Monday'],
    'L40': ['Tuesday'],
    'L41': ['Tuesday'],
    'L42': ['Tuesday'],
    'L43': ['Wednesday'],
    'L44': ['Wednesday'],
    'L45': ['Wednesday'],
    'L46': ['Wednesday'],
    'L47': ['Wednesday'],
    'L48': ['Wednesday'],
    'L49': ['Thursday'],
    'L5': ['Monday'],
    'L50': ['Thursday'],
    'L51': ['Thursday'],
    'L52': ['Thursday'],
    'L53': ['Thursday'],
    'L54': ['Thursday'],
    'L55': ['Friday'],
    'L56': ['Friday'],
    'L57': ['Friday'],
    'L58': ['Friday'],
    'L59': ['Friday'],
    'L6': ['Monday'],
    'L60': ['Friday'],
    'L7': ['Tuesday'],
    'L8': ['Tuesday'],
    'L9': ['Tuesday'],
    'TA1': ['Friday'],
    'TA2': ['Friday'],
    'TAA1': ['Tuesday'],
    'TAA2': ['Tuesday'],
    'TB1': ['Monday'],
    'TB2': ['Monday'],
    'TBB2': ['Wednesday'],
    'TC1': ['Tuesday'],
    'TC2': ['Tuesday'],
    'TCC1': ['Thursday'],
    'TCC2': ['Thursday'],
    'TD1': ['Friday'],
    'TD2': ['Wednesday'],
    'TDD2': ['Friday'],
    'TE1': ['Thursday'],
    'TE2': ['Thursday'],
    'TF1': ['Friday'],
    'TF2': ['Friday'],
    'TG1': ['Monday'],
    'TG2': ['Monday'],
    'V1': ['Wednesday'],
    'V2': ['Wednesday'],
    'V3': ['Monday'],
    'V4': ['Tuesday'],
    'V5': ['Wednesday'],
    'V6': ['Thursday'],
    'V7': ['Friday'],
}

def _weekly_days(subject):
    configured = subject.get("weeklyDays", [])
    if isinstance(configured, list) and configured:
        return configured
    inferred = set()
    for slot in _codes(subject.get("slot", "")):
        inferred.update(DEFAULT_SLOT_DAYS.get(slot, []))
    return sorted(inferred, key=DAY_NAMES.index)

def decide_date(subject, day, events):
    code = str(subject.get("code", "")).strip().upper()
    same_day = [e for e in events if _event_date(e) == day]
    holiday = next((e for e in same_day if e.get("type") in HOLIDAY_TYPES), None)
    if holiday:
        return {"counted": False, "reason": f"Excluded: {holiday.get('type')}", "source": "Calendar exclusion"}
    explicit = [e for e in same_day if e.get("type") in EXPLICIT_TYPES and str(e.get("courseCode", "")).strip().upper() == code]
    if explicit:
        event = explicit[-1]
        is_class = event.get("type") == "class-session"
        return {"counted": is_class, "reason": "Included: subject-specific class session" if is_class else "Excluded: subject-specific class cancelled", "source": "Subject override"}
    slot_events = [e for e in same_day if e.get("type") == "slot-day"]
    if slot_events:
        subject_slots = set(_codes(subject.get("slot", "")))
        active_slots = set(_codes(slot_events[-1].get("title", "")))
        match = bool(subject_slots and subject_slots.intersection(active_slots))
        return {"counted": match, "reason": "Included: active slot matches" if match else "Excluded: active slot does not match", "source": "Active slots"}
    orders = [e for e in same_day if e.get("type") in ORDER_TYPES]
    effective_day = ORDER_TYPES[orders[-1]["type"]] if orders else day.weekday()
    configured = _weekly_days(subject)
    match = DAY_NAMES[effective_day] in configured
    if orders:
        source = "Weekday substitution"
        reason = f"{'Included' if match else 'Excluded'}: {DAY_NAMES[effective_day]} timetable substitution"
    else:
        source = "Weekly mapping"
        reason = f"{'Included' if match else 'Excluded'}: {DAY_NAMES[effective_day]} weekly mapping"
    return {"counted": match, "reason": reason, "source": source}

def build_timeline(subject, events, start_date, exam_date, max_days=550):
    """Build [start_date, exam_date) timeline; exam date itself is excluded."""
    try:
        start = date.fromisoformat(start_date)
        end = date.fromisoformat(exam_date)
    except (TypeError, ValueError):
        raise ValueError("Dates must use YYYY-MM-DD format.")
    if end <= start:
        raise ValueError("Exam date must be after the start date.")
    if (end - start).days > max_days:
        raise ValueError(f"Date range cannot exceed {max_days} days.")
    if not isinstance(subject, dict) or not isinstance(events, list):
        raise ValueError("Subject must be an object and events must be a list.")
    rows = []
    day = start
    while day < end:
        decision = decide_date(subject, day, events)
        rows.append({"date": day.isoformat(), "day": DAY_NAMES[day.weekday()], **decision})
        day += timedelta(days=1)
    return {"subjectCode": str(subject.get("code", "")), "startDate": start.isoformat(), "examDateExclusive": end.isoformat(), "daysChecked": len(rows), "sessionsCounted": sum(row["counted"] for row in rows), "rows": rows}
