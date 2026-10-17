#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
export BUNKSAFE_ADMIN_EMAIL="${BUNKSAFE_ADMIN_EMAIL:-admin@bunksafe.local}"
export BUNKSAFE_ADMIN_PASSWORD="${BUNKSAFE_ADMIN_PASSWORD:-ChangeThisAdminPassword123!}"
python app.py
