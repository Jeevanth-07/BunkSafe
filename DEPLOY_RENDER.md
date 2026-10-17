# BunkSafe public deployment (Render + persistent SQLite disk)

This deployment keeps SQLite on a Render persistent disk mounted at `/var/data`. The blueprint uses a paid web-service plan because persistent disks are not available on Render's free web services. Confirm current pricing before creating resources.

## Before publishing

- Review the application and tests; this is deployment preparation, not a formal security audit.
- Do not commit `.env`, `bunksafe.db`, backups, student data, or real passwords.
- Use a unique administrator email and a password of at least 14 characters. Store credentials in a password manager.
- The configured disk is persistent but is not itself an off-site backup. Periodically create backups and download/copy them to secure storage outside the service.

## Deploy with the Render Blueprint

1. Put the contents of the `BunkSafe` folder in a private GitHub repository. Do not upload `.env`, any `*.db` file, or the `backups/` folder. The included `.gitignore` excludes them.
2. In Render, choose **New + → Blueprint** and connect that repository. Render reads `render.yaml`.
3. Review the service plan and persistent disk cost before confirming. The disk is mounted at `/var/data`; the SQLite database is `/var/data/bunksafe.db`.
4. When prompted for `BUNKSAFE_ADMIN_EMAIL`, enter the administrator email. For `BUNKSAFE_ADMIN_PASSWORD`, use a unique password at least 14 characters long. Do not use local demo credentials.
5. Deploy and wait for `/api/health` to report `{"status":"ok","app":"BunkSafe"}`.
6. Open the HTTPS URL. Register a separate student test account, add sample attendance, sign out, sign in again, and verify it persists.
7. Sign in with the configured admin account and verify the shared calendar. Check that a normal student account cannot edit the shared calendar.
8. Change the admin password after initial verification, then store it securely.

## Backup on the hosted service

Use the provider's service shell/console and run from the application directory:

```sh
python backup_database.py
```

The `BUNKSAFE_BACKUP_DIR` setting sends backups to `/var/data/backups`. Confirm the command reports an integrity-checked backup. Download/copy the resulting `.db` file to secure storage outside Render regularly; a backup on the same disk does not protect against disk loss or account deletion.

For a local Windows backup, from the `BunkSafe` folder run:

```bat
backup_database.bat
```

This creates a local integrity-checked backup. Copy it somewhere separate and private. Never commit it to GitHub.

## Restore a backup

For a hosted restore, first stop or otherwise place the service in maintenance so no writes occur. Preserve a current backup, upload the verified backup to the persistent disk, then replace `/var/data/bunksafe.db` only after confirming the target path. Restart the service and test login, student data, and shared calendar. Do not restore while requests are writing to the database.

For local Windows restore, stop BunkSafe and run:

```bat
restore_database.bat "C:\\path\\to\\verified-backup.db"
```

## Operational notes

- One Gunicorn worker is configured deliberately for SQLite. Threads allow concurrent requests while keeping a single worker process; do not increase workers without reviewing SQLite locking and the in-memory login throttle.
- The login throttle is in memory and resets when the process restarts. It is a basic safeguard, not a shared distributed rate limiter.
- HTTPS cookies are enabled in production. The app also rejects state-changing browser requests with a mismatched HTTPS Origin. This is defense-in-depth, not a complete independent security audit.
- The administrator account is created from the environment variables at startup if it does not exist. If it already exists, startup ensures its role is admin but does not reset its existing password.
- Public users must use individual accounts. Do not share one student login among multiple people.
- Do not collect VIT passwords or other unnecessary sensitive information in BunkSafe.
