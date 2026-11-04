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

# Least privilege: only the app's own role (and postgres) may connect to its database.
sudo -u postgres psql -q -v ON_ERROR_STOP=1 -c "REVOKE ALL ON DATABASE ${DB_NAME} FROM PUBLIC; GRANT CONNECT ON DATABASE ${DB_NAME} TO ${DB_USER};"
PG_LISTEN="$(sudo -u postgres psql -tAc 'SHOW listen_addresses')"
[[ "$PG_LISTEN" == "localhost" || "$PG_LISTEN" == "127.0.0.1" ]] \
  || echo "WARNING: PostgreSQL listens on '${PG_LISTEN}'; it should be 'localhost' so the database is not reachable from outside."

# ---------------------------------------------------------------- backend
log "Backend: venv, migrate, collectstatic"
sudo -u "$APP_USER" bash -c "
  set -e; cd '$BACKEND'
  [[ -d .venv ]] || python3 -m venv .venv
  .venv/bin/pip install -q --upgrade pip
  .venv/bin/pip install -q -r requirements.txt gunicorn
  export DJANGO_SETTINGS_MODULE=config.settings.prod
  .venv/bin/python manage.py migrate --noinput
  .venv/bin/python manage.py createcachetable   # shared rate-limit counters
  .venv/bin/python manage.py collectstatic --noinput -v 0
  .venv/bin/python manage.py seed_materials   # adds missing starter materials only
  mkdir -p media
  # Stamps gallery photos missing the watermark or logo; originals go to gallery_originals/. A bad photo mustn't stop the deploy.
  .venv/bin/python manage.py watermark_gallery || echo 'WARNING: watermark_gallery failed, some photos may be unstamped'
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
mkdir -p /etc/nginx/snippets

# Browser security headers for the pages nginx serves itself (Django sets its own on /api).
# CSP: only this site's scripts run (no inline scripts at all); styles and fonts also from Google
# Fonts; the contact-page map frame from Google; nothing may frame this site.
cat > /etc/nginx/snippets/mitra-security-headers.conf <<'NGINX'
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-src https://www.google.com https://maps.google.com; object-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests" always;
NGINX

cat > /etc/nginx/snippets/mitra-django-proxy.conf <<'NGINX'
proxy_pass http://127.0.0.1:8000;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_read_timeout 120s;
# Any add_header here stops the page headers above being added on top of Django's own.
add_header X-Robots-Tag "noindex, nofollow" always;
NGINX

cat > /etc/nginx/sites-available/mitra-events <<NGINX
# Rate limits per client IP: logins are slow by design, the rest of the API is generous.
limit_req_zone \$binary_remote_addr zone=mitra_login:10m rate=10r/m;
limit_req_zone \$binary_remote_addr zone=mitra_api:10m rate=20r/s;
limit_req_status 429;

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} ${WWW};

    root ${FRONTEND}/dist;
    client_max_body_size 25M;
    server_tokens off;   # don't advertise the nginx version

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml text/plain;

    include /etc/nginx/snippets/mitra-security-headers.conf;

    # Hidden files (.env, .git, ...) are never served; Let's Encrypt's .well-known stays reachable.
    location ~ /\.(?!well-known) { return 404; }

    # Login forms: 10 a minute per IP (a short burst of 5 is allowed for typos).
    location = /api/v1/auth/login/  { limit_req zone=mitra_login burst=5 nodelay; include /etc/nginx/snippets/mitra-django-proxy.conf; }
    location = /django-admin/login/  { limit_req zone=mitra_login burst=5 nodelay; include /etc/nginx/snippets/mitra-django-proxy.conf; }

    # Django: API and emergency admin
    location ~ ^/(api|django-admin)/ {
        limit_req zone=mitra_api burst=60 nodelay;
        include /etc/nginx/snippets/mitra-django-proxy.conf;
    }

    location /static/ { alias ${BACKEND}/staticfiles/; expires 30d; access_log off; }
    location /media/  { alias ${BACKEND}/media/;       expires 7d;  access_log off; }

    # Hashed Vite bundles (an add_header here replaces the server's, so the headers are included again)
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        include /etc/nginx/snippets/mitra-security-headers.conf;
        access_log off;
    }

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