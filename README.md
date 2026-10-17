# BunkSafe v17 — Authentication Hardening

This release replaces the login-mode lexical variable with a single explicit `window.BunkSafeAuth` state object, guards against duplicate submissions, disables the button during requests, updates the password autocomplete mode, and keeps cache-busting versioned assets.

# BunkSafe v14 — Timetable & Attendance Validation

## What's new in v14
- Added data-quality validation for invalid attendance counts and thresholds, duplicate course codes, missing timetable mappings, invalid calendar event types/dates, duplicate events, and conflicting calendar entries.
- Shows actionable findings and allows exporting a validation report to CSV.
- Validation checks local BunkSafe data; it does not verify entries against VIT's official timetable.

## Earlier features

- Improved parsing of pasted VTOP course-list text.
- Duplicate course codes are detected rather than silently creating duplicate subjects.
- Course code, course name, class type, and slot code are validated before saving.
- Existing subjects are updated with reviewed course details while preserving attendance values and weekly mappings.
- Export the reviewed course list as CSV.
- Download a slot-mapping CSV template to record verified weekday mappings from the official VIT timetable.
- ZIP top-level folder is exactly `BunkSafe`.

## Run on Windows
1. Install Python 3.10 or newer.
2. Extract the ZIP.
3. Run `run.bat` from the extracted `BunkSafe` folder.
4. Open http://127.0.0.1:5000.

Demo admin login:
- Email: `admin@bunksafe.local`
- Password: `ChangeThisAdminPassword123!`

Change demo credentials before using real data.

## Timetable import workflow
1. Sign in to BunkSafe and open **Import your timetable**.
2. Copy the registered course list text from VTOP and paste it into the text area. Do not enter your VTOP password into BunkSafe.
3. Parse the text and review every course code, name, class type, and slot code.
4. Correct fields marked for review. Duplicate course codes and missing fields must be fixed before saving.
5. Use the reviewed courses to add/update subjects. Existing attendance totals are preserved when an imported course matches an existing course code.
6. Export the reviewed courses CSV or download the slot-mapping template. Fill weekday values only after checking the official timetable.
7. Update each subject's attendance totals and save its weekly class-day mapping.

## Important limitations
- This parser works on pasted text; it does not sign in to VTOP, access private portal data, or automatically extract data from screenshots/PDFs.
- A course slot such as `D2+TD2` is not itself a calendar date or a verified weekday. The slot-mapping template is a review aid, not an automatic VIT day-order decoder.
- Accurate class counts still depend on verified weekday mappings, active slot dates, holidays, and subject-specific overrides.
- Class counts are estimates, not official VIT attendance guarantees. Check VTOP attendance before making decisions.
- This is a local development build, not production-ready for public deployment. Public hosting requires a production WSGI server, HTTPS, persistent secret key, CSRF protection, rate limiting, backups, and deployment hardening.


## v9: Attendance CSV import/export

Students can export their current subject attendance as CSV or import a CSV after validating its rows. Download the template from **My subjects**. Required headers are `courseCode,courseName,attended,total`; `required`, `kind`, and `slot` are optional. Existing subjects are matched by course code and updated while their weekly day mappings are preserved. New subjects start with an empty weekly mapping, which must be configured from the official timetable.

CSV imports are client-reviewed and only applied after pressing **Apply validated attendance**. Use attendance figures from official records; BunkSafe does not connect directly to VTOP.

## v10: Attendance decision engine

The dashboard quick-check now evaluates a plan against both the official minimum entered for the subject and a user-configurable safety buffer above that minimum. The default buffer is 3 percentage points; it can be changed to 0, 2, 3, 5, 8, or 10 points. This is a user preference, not an official VIT requirement.

The result includes:
- projected attendance after the proposed absences;
- whether the plan meets the subject's required percentage;
- whether it meets the safety target (required percentage plus the selected buffer);
- an estimated maximum number of absences within the specified future-class horizon;
- the remaining absence margin after the proposed plan;
- estimated consecutive classes to attend to recover to the required minimum and safety target when current attendance is below those levels.

The engine assumes the future class count supplied by the user is accurate. The exam planner uses the scheduled-session estimate from the configured calendar. The calculations do not override official attendance records, rounding policies, or course-specific regulations. Verify against VTOP before acting.


## v11: Semester-wide risk simulator

The dashboard now includes a semester-wide simulator. Choose a target exam date and safety buffer, then analyze all configured subjects together. The table ranks subjects by risk, shows current attendance, estimated future class sessions before the date, projected attendance if all future sessions are attended, estimated safe absences under the selected target, and consecutive classes needed to recover to the minimum and safety target.

The analysis can be exported as `BunkSafe_semester_risk_analysis.csv`. It uses the same calendar-session estimation function as the exam planner, so results depend on verified weekly mappings and calendar events. Subjects with no valid future sessions are flagged in the summary. The safety buffer is a user preference, not an official VIT rule. Verify calculations against VTOP before making attendance decisions.


## v12: Personalized attendance action planner

The dashboard includes a personalized action-plan panel. First run the semester-wide simulator for a target exam date; then select **Build my action plan**. The planner sorts subjects by urgency and gives practical guidance for subjects projected below the minimum, subjects that need attendance recovery, subjects with a low safety buffer, and subjects whose future class count is zero. Export the resulting recommendations as `BunkSafe_personalized_action_plan.csv`.

The action plan is advisory, not an official attendance decision. It uses the same projected future-session counts and safety targets as the semester simulator. If a subject has zero future sessions counted, verify its timetable mapping and calendar before acting. If projections suggest the minimum cannot be reached before the exam, contact the relevant faculty or academic office rather than relying on the estimate.


## v13: Dated class-session timeline

The exam planner includes a dated timeline for a selected subject and exam date. It evaluates each calendar date from the local current date up to (but excluding) the exam date and explains whether the date is counted as a class session or excluded. Reasons identify the rule used: holiday/no-class exclusion, subject-specific class session/cancellation, active-slot-code match or mismatch, weekday timetable substitution, or ordinary weekly mapping. Users can toggle between all dates and counted class sessions only and export the explanation as `BunkSafe_dated_class_timeline.csv`.

The timeline follows the scheduled-class counter's rule precedence. A holiday/no-class event excludes the date; a subject-specific class event takes precedence over the weekly mapping; an active-slot event takes precedence over weekday substitution and weekly mapping. If no active-slot event is configured, the timeline falls back to the subject's configured weekly-day mapping. This is an explainability aid, not an automatic decoder of VIT day orders. Verify the calendar, slot mappings, and official VTOP attendance.

## v18: backend regression tests

Run `run_tests.bat` on Windows or `./run_tests.sh` on macOS/Linux to exercise the Flask API tests for health checks, registration validation, duplicate accounts, login/logout, authentication requirements, private student data persistence, and malformed data rejection. Tests use a temporary SQLite database and do not modify the normal `bunksafe.db` file.

The database path can now be configured with `BUNKSAFE_DB_PATH`, which is useful for isolated testing. These are automated API tests, not a substitute for a complete browser/manual acceptance test.

## v19: timetable mapping audit endpoint

The authenticated `POST /api/timetable/validate` endpoint accepts JSON with `subjects` and `events` lists and returns a structured report of mapping issues. It checks duplicate course codes, missing names/slot codes, suspicious slot-code formatting, missing or invalid weekday mappings, malformed event dates, unknown event types, and repeated same-date/same-type events. Errors and warnings include machine-readable codes to support the UI or CSV reporting. It does not silently modify data.

Example request body:

```json
{
  "subjects": [
    {"code":"BCSE302L","name":"Database Systems","slot":"D2+TD2","weeklyDays":["Monday","Thursday"]}
  ],
  "events": [
    {"date":"2026-11-02","type":"holiday","title":"Holiday"}
  ]
}
```

This endpoint validates user-entered mappings only. It does not infer VIT day orders from slot codes or claim to verify official VIT timetable data.


## v20 — Validation UI integration

The Timetable & Attendance Validation panel now includes **Run server audit**. It submits the currently loaded subjects and calendar events to `POST /api/timetable/validate` and displays the server's findings in the same panel. The existing local validation remains available. The server audit validates configured data only; it does not decode or verify official VIT day-order rules.

## v21: dated schedule preview and regression tests

This release adds a deterministic server-side schedule preview endpoint:

- `POST /api/schedule/preview` (authenticated)
- JSON body example:

```json
{
  "subject": {"code":"CSE100", "slot":"D2+TD2", "weeklyDays":["Monday"]},
  "events": [{"date":"2026-10-20", "type":"class-session", "courseCode":"CSE100"}],
  "startDate":"2026-10-19",
  "examDate":"2026-10-30"
}
```

The exam date is exclusive: sessions on the exam date are not counted. Supported rules include weekly weekday mapping, holiday/no-class exclusions, subject-specific class-session/cancellation overrides, active slot dates, and weekday substitution events. The endpoint only evaluates the mappings supplied to BunkSafe; it does not independently determine official VIT day orders.

Run `run_tests.bat` (Windows) or `./run_tests.sh` (macOS/Linux) to run the full unit/API suite. The new `tests/test_schedule_engine.py` covers core date-counting rules. Install dependencies from `requirements.txt` first.


## v22: Server-side timeline integration

The Dated Class-Session Timeline now calls the authenticated `POST /api/schedule/preview` endpoint and renders the server's dated rows. It no longer silently substitutes the separate browser-side estimator when the API request fails; instead, it shows an error and asks the user to sign in again or retry. The request sends the selected subject, current calendar events, today's local date, and the exclusive exam date.

The engine still evaluates only configured mappings and events; it does not independently decode or verify VIT's official day-order timetable.


## v23: Server-backed semester risk simulator

The semester-wide risk simulator now requests `/api/schedule/preview` for each configured subject and derives its future-session count from the server-side dated schedule engine. If any request fails, the simulator displays an error instead of silently falling back to the browser's separate weekday-counting logic. Calculations still depend on user-configured timetable mappings and do not independently verify official VIT day orders.

## v24 — End-to-end workflow regression coverage

This release expands API-level regression coverage across authentication, student data persistence/isolation, schedule preview, and shared calendar permissions. Tests now use a fresh SQLite database per test, avoiding failures caused by test execution order. The data endpoint also validates admin calendar payload shapes before writing the student's private payload, preventing partial writes on malformed requests.

### Run tests

- Windows: `run_tests.bat`
- macOS/Linux: `./run_tests.sh`

Install dependencies first with `py -m pip install -r requirements.txt`. The full API suite requires Flask. The schedule-engine unit tests can be run separately with `py -m unittest tests.test_schedule_engine -v` (or from the `tests` directory with `py -m unittest test_schedule_engine -v`).

Automated tests are included but should be run in your local environment before treating the application as verified. This is not a production deployment certification.

## v25 Windows test-database cleanup fix

The API test log from Windows showed `PermissionError: [WinError 32]` while removing each temporary SQLite database. The cause was that `sqlite3.Connection` used as a context manager commits or rolls back but does **not** close the connection. The database helper now explicitly closes every connection in a `finally` block, so temporary test databases can be removed during test teardown. Run `run_tests.bat` again after installing `requirements.txt`; if any assertions fail after cleanup succeeds, the test output should now expose the underlying failure instead of being masked by teardown errors.

## v26 — Windows cleanup and database backup

- Fixed the test client's open response in `test_health_and_home`, removing the `ResourceWarning` caused by leaving the home-page response body open.
- Added `backup_database.py` and `backup_database.bat` to create a consistent SQLite backup using SQLite's backup API, then run `PRAGMA integrity_check` on the copy.
- Backups are written to `backups/` with a timestamp. If `BUNKSAFE_DB_PATH` is set, that database is backed up; otherwise the default is `bunksafe.db` in the project folder.

### Create a database backup (Windows)
1. Stop the BunkSafe server before taking a routine backup if convenient.
2. Run `backup_database.bat` from the `BunkSafe` folder.
3. Confirm the output says the backup was created and integrity-checked.
4. Copy a backup to a separate, secure location. Do not commit database backups containing student information to a public Git repository.

The backup utility does not automatically restore or overwrite databases. To restore, stop the server, preserve a copy of the current database, and replace the configured database file with a verified backup. Confirm the target path carefully before replacing anything.

### Deployment reminder
This is still a local development build. Before public hosting, configure a persistent secret key, HTTPS, CSRF protection for state-changing requests, login rate limiting, a production WSGI server, restricted admin provisioning, and a tested backup/restore process. Do not use the demo admin password for real student data.


## v27 deployment configuration check

Before hosting BunkSafe publicly, configure environment variables using `.env.example` as a reference. Do not publish real secrets or commit them to source control.

Run `check_deployment.bat` on Windows to check that a stable secret key and administrator credentials are configured, the administrator password is sufficiently long, and HTTPS cookie settings are enabled. This check is a basic configuration guard, not a full security audit.

For public deployment:
- Use a unique random `BUNKSAFE_SECRET_KEY` of at least 32 characters and keep it stable between restarts.
- Set `BUNKSAFE_ADMIN_EMAIL` and a unique `BUNKSAFE_ADMIN_PASSWORD` before first startup.
- Set `BUNKSAFE_HTTPS=1` only when the site is served over HTTPS.
- Use a persistent disk for `BUNKSAFE_DB_PATH`; ephemeral hosting storage can lose the SQLite database on redeploy.
- Run behind a production WSGI server and HTTPS reverse proxy; do not expose Flask's development server directly to the internet.
- Make and test backups before upgrades. Never upload a real database backup into a public repository.

The local `run.bat` intentionally sets demo admin credentials for local development. Do not use those credentials for a publicly accessible deployment.

## v28: Clean-install and restore verification

1. Extract the ZIP into a new folder named `BunkSafe`.
2. Run `verify_install.bat` to check required files and confirm Flask can be imported. If it fails on Flask, run `py -m pip install -r requirements.txt` and retry.
3. Run `run_tests.bat` to execute the regression suite, including backup-restore tests.
4. To restore a backup, **stop the BunkSafe server first**, then run `restore_database.bat "path\to\backup.db"`. The file must be a valid BunkSafe SQLite database.
5. If a current database exists, the restore utility first creates and integrity-checks a safety copy in `backups/`. It validates the selected backup before replacing the current database.
6. Restart BunkSafe and manually verify login, a student's subjects/attendance, and the shared academic calendar.

The restore command is destructive to the current database after validation, so keep an additional copy of the backup outside this computer. Never restore while the server is running; SQLite files may be locked or the application may continue writing to the old database handle.


### v30 Windows SQLite cleanup fix

The restore utility now explicitly closes every SQLite connection after use. This prevents Windows from locking temporary database files during test cleanup. The home-page API test also closes its response to avoid an unclosed-file ResourceWarning. Run `py -m unittest discover -s tests -v` or `run_tests.bat` to verify.


## v31 security hardening

- Session cookies are HTTP-only and SameSite=Lax; HTTPS cookies can be enabled with `BUNKSAFE_HTTPS=1`.
- Set `BUNKSAFE_ENV=production`, a unique `BUNKSAFE_SECRET_KEY` of at least 32 characters, and `BUNKSAFE_HTTPS=1` in the hosting environment before deployment. Production requests are blocked with HTTP 503 if these requirements are missing.
- Login attempts are throttled per process/IP after 10 attempts in five minutes. This in-memory limiter is a basic local safeguard; use a shared rate-limit store or reverse proxy for multi-worker hosting.
- Authenticated users can change their password with `POST /api/account/password` using JSON fields `currentPassword` and `newPassword`. New passwords must be at least 12 characters. A successful change clears the session, requiring sign-in again.
- Never use the demo credentials from `run.bat` on a public deployment. Configure a unique administrator account through deployment environment variables and change the password after initial setup.

### Password change API

Send an authenticated `POST /api/account/password` request with:

```json
{"currentPassword":"your-current-password","newPassword":"your-new-password-at-least-12-characters"}
```

The app verifies the current password, updates the password hash, and signs the user out. Do not send credentials over plain HTTP on a public network.

Security hardening is not a claim of production certification. Before public hosting, add CSRF protection appropriate to the deployment, use HTTPS, configure a production WSGI server, review logging and rate limiting, and complete browser-based security tests.


## First-time local setup (Windows)

1. Extract the ZIP and open the `BunkSafe` folder.
2. Run `setup_local.bat` once. Enter your own admin email and a unique password of at least 14 characters.
3. Run `run.bat` to start BunkSafe.
4. Keep `.env` private; it contains the stable session secret and admin bootstrap credentials. Do not commit or share it.
5. `check_deployment.bat` reads `.env`. It may warn that HTTPS is disabled, which is expected for local `http://127.0.0.1` development. Do not use HTTP for public deployment.

The local setup wizard replaces the previous hardcoded demo administrator credentials. If an admin was already initialized in an existing database, changing the bootstrap environment variables does not change that existing account's password.


### Local HTTP warning

When running on `http://127.0.0.1:5000`, the deployment checker reports an informational message about secure cookies rather than a deployment warning. This is expected for local development. For public hosting, set `BUNKSAFE_ENV=production` and `BUNKSAFE_HTTPS=1` only behind correctly configured HTTPS; production checks will fail if secure cookies are not enabled.


## VTOP import parser update (v34)

The VTOP course importer now groups multiline course records, extracts slot codes from nearby lines, recognizes `NIL` for courses without a weekly slot, and restricts course-code matching to four-letter course prefixes to avoid importing room codes such as `SJT402` and `PRP231` as courses. Review all imported rows before saving.


## v36: Subject table display updates
- Renamed the subject table column from Conducted to Total class and moved it before Attended.
- The subject table attendance percentage now rounds upward to the next whole percentage point using ceiling rounding. Other calculations retain their unrounded values.


### Default VIT slot mapping (v51)

When a subject has a slot code but no saved weekly weekday mapping, BunkSafe now uses the default Monday-Friday VIT slot grid transcribed from the timetable provided by the user. Explicitly saved weekly mappings take precedence. Day-order substitutions, holidays, active-slot events, and subject-specific overrides still take precedence according to the schedule engine. Verify the mapping against your current official timetable before relying on projections.


### v55 dashboard default exam

The dashboard opens with FAT selected by default for the current FAT phase. CAT-I and CAT-II remain available through the exam selector. The JavaScript cache version is bumped so browsers fetch the updated script.


### VIT lab attendance calculation (v56)

BunkSafe counts each scheduled lab meeting as two class periods when estimating future attendance, matching paired VIT lab slots such as `L5+L6` and `L23+L24`. Existing attended/total values are not automatically changed; enter those exactly as shown in the official attendance record. The percentage remains attended ÷ total × 100.


### VIT combined lab attendance calculation

VIT lab slots such as `L15+L16` are treated as one indivisible lab meeting that contributes two periods to the attended/total counters. The dashboard's safe-bunk calculation reports whole lab meetings, not independently bunkable periods. For example, at 18/22 with three future lab meetings (six periods) and a 75% requirement, only one complete lab meeting can be missed if the other two are attended: `(18 + 6 - 2) / (22 + 6) = 22/28 = 78.57%`. Missing two would leave `20/28 = 71.43%`, below the requirement.


## Public deployment (v60)

See `DEPLOY_RENDER.md` for the Render Blueprint deployment, persistent disk, production environment variables, and backup/restore workflow. The included `render.yaml` defines a paid web service with a persistent SQLite disk. Review provider pricing and deployment settings before creating resources. Do not commit `.env`, database files, or backups.
