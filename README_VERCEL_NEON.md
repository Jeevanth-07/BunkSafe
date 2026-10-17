# BunkSafe — Vercel + Neon (free-tier setup)

This deployment uses Vercel for the Flask application and Neon PostgreSQL for persistent records. Local Windows development continues to use SQLite unless `BUNKSAFE_DATABASE_URL` is set.

## Before deploying
- Push this project to GitHub. Never commit `.env`, database files, backups, or credentials.
- Create a Neon PostgreSQL project and copy its pooled connection string. Keep `sslmode=require`; do not publish the string.
- Import the GitHub repository in Vercel. The repository root must contain `app.py`, `requirements.txt`, `vercel.json`, and `public/`.
- In Vercel Project Settings → Environment Variables, set `BUNKSAFE_DATABASE_URL`, `BUNKSAFE_SECRET_KEY` (random, at least 32 characters), `BUNKSAFE_ENV=production`, `BUNKSAFE_HTTPS=1`, `BUNKSAFE_ADMIN_EMAIL`, and `BUNKSAFE_ADMIN_PASSWORD`. Set these for Production and Preview only as appropriate; use separate credentials for Preview.
- Redeploy after adding environment variables.

## Database behavior
On first app initialization, BunkSafe creates the PostgreSQL tables automatically. The database connection string selects PostgreSQL; without it, local SQLite is used. This does not automatically migrate old SQLite data. Do not point production at a database containing data you need without first exporting and migrating it deliberately.

## Static assets
Vercel serves files from `public/`. The `public/static/` directory mirrors `static/` so CSS, JavaScript, favicon, and branding assets are served as static CDN assets. Keep both copies synchronized when changing frontend assets.

## Local tests (Windows)
```bat
py -m pip install -r requirements.txt
py -m unittest discover -s tests -v
```

## Before sharing with students
1. Confirm `/api/health` returns `status: ok`.
2. Register two test accounts; verify attendance data remains private.
3. Sign out/in and verify records persist.
4. Verify admin-only shared calendar updates.
5. Confirm production environment variables are set and HTTPS cookies work.
6. Configure a separate export/backup process for Neon; do not treat the free plan's short restore history as a complete backup strategy.

## Limitations and security notes
- Neon free currently has quotas (including 0.5 GB storage and 100 compute-hours per project/month); check current limits before real use.
- Free-tier availability, quotas, and backup capabilities may change. Keep independent backups and test restore.
- This is a migration preparation, not a full security audit. Rate limiting is in-memory and CSRF defense is basic; review before broad public use.
