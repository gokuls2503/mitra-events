#!/usr/bin/env bash
# Mitra Events — one-shot deploy for a fresh Ubuntu 24.04 VPS (run as root).
# Safe to re-run: the first run installs everything, later runs pull + rebuild + restart.
#
#   ssh root@187.126.124.241
#   bash deploy.sh
#
set -euo pipefail

DOMAIN="mitraevents.in"
WWW="www.${DOMAIN}"
REPO="https://github.com/gokuls2503/mitra-events.git"
BRANCH="main"
APP_USER="mitra"
APP_DIR="/var/www/mitra-events"
BACKEND="${APP_DIR}/backend"
FRONTEND="${APP_DIR}/frontend"
DB_NAME="mitra_events"
DB_USER="mitra"
LE_EMAIL="${LE_EMAIL:-gokuls2503@gmail.com}"   # Let's Encrypt expiry notices

log() { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }
[[ $EUID -eq 0 ]] || { echo "Run as root"; exit 1; }
export DEBIAN_FRONTEND=noninteractive

# ---------------------------------------------------------------- packages
log "System packages"
apt-get update -y
apt-get install -y git curl ca-certificates nginx postgresql \
  python3 python3-venv python3-dev build-essential \
  libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b fonts-dejavu-core \
  certbot python3-certbot-nginx ufw

if ! command -v node >/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]]; then
  log "Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# ---------------------------------------------------------------- user + code
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$APP_USER"
mkdir -p "$APP_DIR"; chown "$APP_USER:$APP_USER" "$APP_DIR"

log "Code"
if [[ -d "$APP_DIR/.git" ]]; then
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
  sudo -u "$APP_USER" git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  sudo -u "$APP_USER" git clone --depth 1 -b "$BRANCH" "$REPO" "$APP_DIR"
fi

# ---------------------------------------------------------------- database + .env
if [[ ! -f "$BACKEND/.env" ]]; then
  log "PostgreSQL database + backend/.env (first run)"
  DB_PASS="$(openssl rand -hex 24)"
  SECRET="$(openssl rand -base64 48 | tr -d '\n=/+')"
  sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';
  ELSE
    ALTER ROLE ${DB_USER} PASSWORD '${DB_PASS}';
  END IF;
END \$\$;
SQL
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 \
    || sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"

  cat > "$BACKEND/.env" <<ENV
DJANGO_SECRET_KEY=${SECRET}
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=${DOMAIN},${WWW},127.0.0.1,localhost
DATABASE_URL=postgres://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}
CORS_ALLOWED_ORIGINS=https://${DOMAIN},https://${WWW}
CSRF_TRUSTED_ORIGINS=https://${DOMAIN},https://${WWW}
ENV
  chown "$APP_USER:$APP_USER" "$BACKEND/.env"; chmod 600 "$BACKEND/.env"
fi

# ---------------------------------------------------------------- backend
log "Backend: venv, migrate, collectstatic"
sudo -u "$APP_USER" bash -c "
  set -e; cd '$BACKEND'
  [[ -d .venv ]] || python3 -m venv .venv
  .venv/bin/pip install -q --upgrade pip
  .venv/bin/pip install -q -r requirements.txt gunicorn
  export DJANGO_SETTINGS_MODULE=config.settings.prod
  .venv/bin/python manage.py migrate --noinput
  .venv/bin/python manage.py collectstatic --noinput -v 0
  .venv/bin/python manage.py seed_materials   # adds missing starter materials only
  mkdir -p media
"

cat > /etc/systemd/system/mitra-backend.service <<UNIT
[Unit]
Description=Mitra Events Django (gunicorn)
After=network.target postgresql.service

[Service]
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${BACKEND}
Environment=DJANGO_SETTINGS_MODULE=config.settings.prod
ExecStart=${BACKEND}/.venv/bin/gunicorn config.wsgi:application \\
  --bind 127.0.0.1:8000 --workers 3 --timeout 120 \\
  --access-logfile - --error-logfile -
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now mitra-backend
systemctl restart mitra-backend

# ---------------------------------------------------------------- frontend
# The prerenderer fetches content from Django over plain HTTP. Prod settings force an
# HTTPS redirect, so a throwaway gunicorn on :8001 with base settings serves the build.
log "Frontend: npm ci + prerendered build"
sudo -u "$APP_USER" bash -c "
  set -e; cd '$BACKEND'
  DJANGO_SETTINGS_MODULE=config.settings.base .venv/bin/gunicorn config.wsgi:application \
    --bind 127.0.0.1:8001 --workers 1 --daemon --pid /tmp/mitra-build.pid
  for i in \$(seq 1 30); do curl -sf http://127.0.0.1:8001/api/v1/website/services/ >/dev/null && break; sleep 1; done
  cd '$FRONTEND'
  export VITE_SITE_URL=https://${DOMAIN} PRERENDER_API_URL=http://127.0.0.1:8001/api/v1
  npm ci --no-audit --no-fund
  status=0; npm run build || status=\$?
  kill \$(cat /tmp/mitra-build.pid) 2>/dev/null || true
  exit \$status
"

# ---------------------------------------------------------------- nginx
log "Nginx"
cat > /etc/nginx/sites-available/mitra-events <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} ${WWW};

    root ${FRONTEND}/dist;
    client_max_body_size 25M;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml text/plain;

    # Django: API, docs, emergency admin
    location ~ ^/(api|django-admin)/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }

    location /static/ { alias ${BACKEND}/staticfiles/; expires 30d; access_log off; }
    location /media/  { alias ${BACKEND}/media/;       expires 7d;  access_log off; }

    # Hashed Vite bundles
    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; access_log off; }

    # React admin — never prerendered
    location = /admin { try_files /spa.html =404; }
    location /admin/  { try_files /spa.html =404; }

    # Prerendered public pages, else real 404 page
    location / {
        try_files \$uri \$uri/index.html =404;
    }
    error_page 404 /404.html;
}
NGINX
ln -sf /etc/nginx/sites-available/mitra-events /etc/nginx/sites-enabled/mitra-events
rm -f /etc/nginx/sites-enabled/default
# nginx (www-data) must be able to traverse into the app dir
chmod o+x /var/www "$APP_DIR" "$BACKEND" "$FRONTEND"
chmod -R o+rX "$FRONTEND/dist" "$BACKEND/staticfiles" "$BACKEND/media"
nginx -t && systemctl reload nginx

# ---------------------------------------------------------------- firewall
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null

# ---------------------------------------------------------------- HTTPS
SERVER_IP="$(curl -s4 https://api.ipify.org || hostname -I | awk '{print $1}')"
DNS_IP="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)"
if [[ -d "/etc/letsencrypt/live/${DOMAIN}" ]]; then
  certbot --nginx -d "$DOMAIN" -d "$WWW" --non-interactive --reinstall --redirect >/dev/null || true
  log "HTTPS already set up"
elif [[ "$DNS_IP" == "$SERVER_IP" ]]; then
  log "HTTPS certificate"
  certbot --nginx -d "$DOMAIN" -d "$WWW" --non-interactive --agree-tos -m "$LE_EMAIL" --redirect
else
  log "SKIPPED HTTPS: ${DOMAIN} resolves to '${DNS_IP:-nothing}', this server is ${SERVER_IP}."
  echo "    Point DNS A records (@ and www) to ${SERVER_IP}, wait for it to resolve, then re-run this script."
fi

# ---------------------------------------------------------------- done
log "Health check"
systemctl is-active mitra-backend
if [[ -d "/etc/letsencrypt/live/${DOMAIN}" ]]; then
  curl -s -o /dev/null -w "Home page:  HTTP %{http_code}\n" --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/"
  curl -s -o /dev/null -w "API:        HTTP %{http_code}\n" --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/api/v1/website/services/"
else
  curl -s -o /dev/null -w "Home page:  HTTP %{http_code}\n" -H "Host: ${DOMAIN}" http://127.0.0.1/
fi

cat <<DONE

Deployed.
  First time only — create the owner login for /admin:
    cd ${BACKEND} && sudo -u ${APP_USER} DJANGO_SETTINGS_MODULE=config.settings.prod .venv/bin/python manage.py createsuperuser

  Logs:     journalctl -u mitra-backend -f
  Update:   bash deploy.sh   (pulls ${BRANCH}, migrates, rebuilds, restarts)
DONE