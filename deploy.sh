#!/usr/bin/env bash
#
# deploy.sh — update the live Mitra Events site on a Linux server (no Docker).
#
# Run it on the server, from the project checkout:
#
#   ./deploy.sh                  pull the latest code, update the backend, rebuild the website
#   ./deploy.sh --backend-only   API/admin only (Python deps, migrations, static files, restart)
#   ./deploy.sh --frontend-only  rebuild the website only (e.g. so search engines see new content)
#   ./deploy.sh --no-pull        deploy what is already checked out, without `git pull`
#   ./deploy.sh --rollback       switch the website back to the previous build
#
# Settings (environment variables; defaults in brackets):
#   BRANCH          git branch to deploy                       [main]
#   SERVICE         systemd unit running gunicorn, or "none"   [mitra-events]
#   WEB_ROOT        where website builds are kept              [/var/www/mitra-events]
#   KEEP_RELEASES   how many website builds to keep            [5]
#   PRERENDER_API_URL  API the build reads content from        [$VITE_SITE_URL/api/v1]
#
# ─── One-time server setup (Ubuntu/Debian) ─────────────────────────────────────────────
#
#  1. Packages:  python3-venv, PostgreSQL, nginx, Node.js 22, and Pango for PDF invoices:
#       sudo apt install python3-venv postgresql nginx libpango-1.0-0 libpangoft2-1.0-0
#  2. Create the database and user, then copy and fill in the two env files:
#       backend/.env    (from backend/.env.example) — DJANGO_DEBUG=False, a long random
#                       DJANGO_SECRET_KEY, DATABASE_URL, DJANGO_ALLOWED_HOSTS=<your domain>,
#                       CORS_ALLOWED_ORIGINS and CSRF_TRUSTED_ORIGINS=https://<your domain>
#       frontend/.env   (from frontend/.env.example) — VITE_SITE_URL=https://<your domain>
#  3. A systemd unit, /etc/systemd/system/mitra-events.service:
#
#       [Unit]
#       Description=Mitra Events API (gunicorn)
#       After=network.target postgresql.service
#
#       [Service]
#       User=<deploy user>
#       WorkingDirectory=/path/to/mitra-events/backend
#       Environment=DJANGO_SETTINGS_MODULE=config.settings.prod
#       ExecStart=/path/to/mitra-events/backend/.venv/bin/gunicorn config.wsgi:application \
#                 --bind 127.0.0.1:8000 --workers 3 --timeout 60
#       Restart=always
#
#       [Install]
#       WantedBy=multi-user.target
#
#     then: sudo systemctl daemon-reload && sudo systemctl enable mitra-events
#  4. An nginx site (then add HTTPS with certbot: sudo certbot --nginx -d <your domain>):
#
#       server {
#         server_name <your domain>;
#         root /var/www/mitra-events/current;
#         client_max_body_size 10M;                      # photo uploads
#
#         location ~ ^/(api|django-admin)/ {
#           proxy_pass http://127.0.0.1:8000;
#           proxy_set_header Host $host;
#           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
#           proxy_set_header X-Forwarded-Proto $scheme;
#         }
#         location /static/ { alias /path/to/mitra-events/backend/staticfiles/; }
#         location /media/  { alias /path/to/mitra-events/backend/media/; }
#         location /admin   { try_files $uri /spa.html; }   # the admin is a single-page app
#         location /        { try_files $uri $uri/index.html $uri/ =404; }
#         error_page 404 /404.html;
#       }
#
#  5. First deploy: ./deploy.sh — then create the owner login:
#       cd backend && DJANGO_SETTINGS_MODULE=config.settings.prod .venv/bin/python manage.py createsuperuser
#
# The website build reads live content through the public HTTPS address, so nginx and the
# certificate must be working first. (Production settings redirect plain HTTP to HTTPS.)
# ──────────────────────────────────────────────────────────────────────────────────────

set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$APP_DIR/backend"
FRONTEND="$APP_DIR/frontend"
BRANCH="${BRANCH:-main}"
SERVICE="${SERVICE:-mitra-events}"
WEB_ROOT="${WEB_ROOT:-/var/www/mitra-events}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
export DJANGO_SETTINGS_MODULE=config.settings.prod

DO_PULL=1 DO_BACKEND=1 DO_FRONTEND=1 ROLLBACK=0
for arg in "$@"; do
  case "$arg" in
    --backend-only) DO_FRONTEND=0 ;;
    --frontend-only) DO_BACKEND=0 ;;
    --no-pull) DO_PULL=0 ;;
    --rollback) ROLLBACK=1 ;;
    -h | --help) sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (see ./deploy.sh --help)" >&2; exit 2 ;;
  esac
done

# ─── Output helpers ───────────────────────────────────────────────────────────────────
STEP="starting"
step() { STEP="$1"; printf '\n\033[1;35m▸ %s\033[0m\n' "$1"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }
trap 'printf "\n\033[31m✗ Deploy failed during: %s\033[0m\n  Nothing after this step was changed.\n" "$STEP" >&2' ERR

need() { command -v "$1" >/dev/null 2>&1 || die "'$1' is not installed."; }

restart_service() {
  if [[ "$SERVICE" == "none" ]]; then
    warn "SERVICE=none — restart gunicorn yourself"
    return
  fi
  if [[ $EUID -eq 0 ]]; then systemctl restart "$SERVICE"; else sudo systemctl restart "$SERVICE"; fi
  ok "Restarted $SERVICE"
}

# Waits until the API answers, so the website build doesn't read from a half-started server.
wait_for_api() {
  local url="$1/website/settings/"
  for _ in $(seq 1 30); do
    if curl -fsS -o /dev/null "$url"; then
      ok "API is answering at $1"
      return
    fi
    sleep 1
  done
  die "The API didn't answer at $url within 30s. Check: sudo journalctl -u $SERVICE -n 50"
}

# ─── Rollback (website only) ──────────────────────────────────────────────────────────
if [[ $ROLLBACK -eq 1 ]]; then
  step "Rolling the website back"
  [[ -L "$WEB_ROOT/current" ]] || die "No current release at $WEB_ROOT/current."
  current="$(readlink "$WEB_ROOT/current")"
  # The build just before the one being served (so repeated rollbacks keep stepping back).
  previous="$(ls -1d "$WEB_ROOT"/releases/*/ 2>/dev/null | sed 's:/$::' | sort | awk -v cur="$current" '$0 == cur { print prev; exit } { prev = $0 }')"
  [[ -n "$previous" ]] || die "There is no earlier build to go back to."
  ln -sfn "$previous" "$WEB_ROOT/current.tmp" && mv -Tf "$WEB_ROOT/current.tmp" "$WEB_ROOT/current"
  ok "Website now serves $(basename "$previous")"
  warn "This only rolls back the website. To roll back the API: git checkout <commit> && ./deploy.sh --backend-only --no-pull"
  exit 0
fi

# ─── Pre-flight ───────────────────────────────────────────────────────────────────────
step "Checking the server"
need git
[[ $DO_BACKEND -eq 1 ]] && need python3
[[ $DO_FRONTEND -eq 1 ]] && { need node; need npm; need curl; }
[[ -f "$BACKEND/.env" ]] || die "backend/.env is missing — copy backend/.env.example and fill it in."
if grep -qiE '^\s*DJANGO_DEBUG\s*=\s*(true|1|yes)' "$BACKEND/.env"; then
  die "backend/.env has DJANGO_DEBUG=True. Production must run with DJANGO_DEBUG=False."
fi
if [[ -f "$FRONTEND/.env" ]]; then
  # The build's pre-render step is a plain Node script, so it doesn't read .env itself.
  set -a
  # shellcheck disable=SC1091
  source "$FRONTEND/.env"
  set +a
elif [[ $DO_FRONTEND -eq 1 ]]; then
  die "frontend/.env is missing — copy frontend/.env.example and set VITE_SITE_URL."
fi
if [[ $DO_FRONTEND -eq 1 ]]; then
  [[ "${VITE_SITE_URL:-}" == https://* ]] || die "Set VITE_SITE_URL in frontend/.env to the live https:// address."
  [[ "$VITE_SITE_URL" != *your-domain.example* ]] || die "VITE_SITE_URL in frontend/.env is still the example domain."
fi
# The public API address: used to check the API is up, and by the website build.
if [[ -n "${VITE_SITE_URL:-}" ]]; then
  export PRERENDER_API_URL="${PRERENDER_API_URL:-${VITE_SITE_URL%/}/api/v1}"
fi
ok "Settings look right"

# ─── Code ─────────────────────────────────────────────────────────────────────────────
cd "$APP_DIR"
OLD_REV="$(git rev-parse --short HEAD)"
if [[ $DO_PULL -eq 1 ]]; then
  step "Getting the latest code ($BRANCH)"
  # Refuse to deploy over edits made directly on the server; they'd be lost or merged badly.
  if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    git status --short --untracked-files=no
    die "There are uncommitted changes on the server (listed above). Commit or discard them first."
  fi
  git fetch --quiet origin "$BRANCH"
  git checkout --quiet "$BRANCH"
  git merge --ff-only --quiet "origin/$BRANCH" || die "Can't fast-forward to origin/$BRANCH (the server copy has diverged)."
fi
NEW_REV="$(git rev-parse --short HEAD)"
if [[ "$OLD_REV" == "$NEW_REV" ]]; then ok "At $NEW_REV (no new commits)"; else ok "Updated $OLD_REV → $NEW_REV"; fi

# ─── Backend ──────────────────────────────────────────────────────────────────────────
if [[ $DO_BACKEND -eq 1 ]]; then
  step "Updating the API"
  cd "$BACKEND"
  [[ -d .venv ]] || { python3 -m venv .venv && ok "Created the Python environment"; }
  .venv/bin/pip install --quiet --upgrade pip
  .venv/bin/pip install --quiet -r requirements.txt
  ok "Python packages installed"

  .venv/bin/python manage.py check --deploy --fail-level ERROR
  .venv/bin/python manage.py migrate --noinput
  ok "Database migrated"
  .venv/bin/python manage.py collectstatic --noinput --verbosity 0
  ok "Static files collected"
  # Adds any missing starter materials; never changes or re-adds ones the client edited.
  .venv/bin/python manage.py seed_materials
  mkdir -p media

  step "Restarting the API"
  restart_service
  if [[ -n "${PRERENDER_API_URL:-}" ]]; then wait_for_api "$PRERENDER_API_URL"; else warn "No VITE_SITE_URL set — skipped the API check"; fi
fi

# ─── Website ──────────────────────────────────────────────────────────────────────────
if [[ $DO_FRONTEND -eq 1 ]]; then
  step "Building the website"
  [[ $DO_BACKEND -eq 1 ]] || wait_for_api "$PRERENDER_API_URL"
  cd "$FRONTEND"
  npm ci --no-audit --no-fund --loglevel=error
  npm run build
  ok "Built and pre-rendered"

  step "Publishing the website"
  release="$WEB_ROOT/releases/$(date +%Y%m%d-%H%M%S)-$NEW_REV"
  mkdir -p "$WEB_ROOT/releases"
  cp -a dist "$release"
  # Swap the `current` link in one step, so visitors never see a half-copied site.
  ln -sfn "$release" "$WEB_ROOT/current.tmp"
  mv -Tf "$WEB_ROOT/current.tmp" "$WEB_ROOT/current"
  ok "Now serving $(basename "$release")"
  # Keep the last few builds for --rollback.
  ls -1d "$WEB_ROOT"/releases/*/ | sed 's:/$::' | sort | head -n "-$KEEP_RELEASES" | xargs -r rm -rf
fi

trap - ERR
printf '\n\033[1;32m✓ Deployed %s\033[0m\n' "$NEW_REV"
