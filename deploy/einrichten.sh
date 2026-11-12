#!/usr/bin/env bash
# MeetingBackstage Studio – Server einrichten (Ubuntu 24.04, frisch, als root)
#
# Aufruf (vom Mac aus hochladen, dann auf dem Server starten):
#   scp deploy/einrichten.sh root@<server-ip>:
#   ssh root@<server-ip>
#   bash einrichten.sh studio.meetingbackstage.de deine@adresse.de [meetingbackstage.de]
#
# 1. Parameter: Adresse des Studios (DNS-Eintrag muss schon auf diesen Server zeigen)
# 2. Parameter: deine E-Mail-Adresse (Verwaltung + Kontakt für das https-Zertifikat)
# 3. Parameter (optional): Hauptdomain, zeigt vorerst eine einfache „Bald verfügbar“-Seite
#
# Das Skript lässt sich gefahrlos erneut ausführen.
set -euo pipefail

STUDIO_DOMAIN="${1:-}"
ADMIN_EMAIL="${2:-}"
MAIN_DOMAIN="${3:-}"
REPO="${MB_REPO:-git@github.com:RobinLessAI/meetingbackstagestudio.git}"
APP_USER="mbstudio"
APP_DIR="/opt/meetingbackstage"
DATA_DIR="/var/lib/meetingbackstage"
ENV_DIR="/etc/meetingbackstage"
ENV_FILE="$ENV_DIR/studio.env"

if [[ -z "$STUDIO_DOMAIN" || -z "$ADMIN_EMAIL" ]]; then
  echo "Aufruf: bash einrichten.sh <studio-domain> <deine-email> [hauptdomain]"
  exit 1
fi
if [[ $EUID -ne 0 ]]; then
  echo "Bitte als root ausführen."
  exit 1
fi

step() { echo; echo "==> $*"; }

step "System aktualisieren und Grundpakete installieren"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -yq
apt-get install -yq git curl ufw fail2ban unattended-upgrades debian-keyring debian-archive-keyring apt-transport-https gnupg

step "Auslagerungsdatei (2 GB), damit das Bauen auch auf kleinen Servern klappt"
if ! swapon --show | grep -q '/swapfile'; then
  if [[ ! -f /swapfile ]]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
  fi
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
free -h | sed -n '1,3p'

step "Automatische Sicherheitsupdates einschalten"
dpkg-reconfigure -f noninteractive unattended-upgrades

step "Firewall: nur SSH, http und https"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null

step "Node.js installieren (mindestens Version 22)"
node_ok() { command -v node >/dev/null && [[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ]]; }
if ! node_ok; then
  # Zuerst die offizielle Node-Quelle; klappt das nicht (z. B. bei ganz neuen Ubuntu-Versionen), das Paket von Ubuntu.
  if ! { curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -yq nodejs; }; then
    echo "Node-Quelle nicht verfügbar, nehme das Paket von Ubuntu …"
    rm -f /etc/apt/sources.list.d/nodesource.list
    apt-get update -q
    apt-get install -yq nodejs npm
  fi
fi
node_ok || { echo "Node.js 22 oder neuer ließ sich nicht installieren. Bitte die Meldungen oben an Claude schicken."; exit 1; }
node -v

step "Caddy (Webserver mit automatischem https) installieren"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -yq caddy
fi

step "Benutzer und Ordner anlegen"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir "/home/$APP_USER" --shell /bin/bash "$APP_USER"
mkdir -p "$APP_DIR" "$DATA_DIR" "$ENV_DIR"
chown "$APP_USER:$APP_USER" "$APP_DIR" "$DATA_DIR"
chmod 750 "$DATA_DIR"

step "Zugang zum GitHub-Repository (nur lesen)"
KEY="/home/$APP_USER/.ssh/id_ed25519"
if [[ ! -f "$KEY" ]]; then
  sudo -u "$APP_USER" mkdir -p "/home/$APP_USER/.ssh"
  sudo -u "$APP_USER" ssh-keygen -q -t ed25519 -N '' -C "meetingbackstage-server" -f "$KEY"
fi
sudo -u "$APP_USER" bash -c "ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts 2>/dev/null; sort -u -o ~/.ssh/known_hosts ~/.ssh/known_hosts"
if ! sudo -u "$APP_USER" git ls-remote "$REPO" >/dev/null 2>&1; then
  echo
  echo "------------------------------------------------------------------"
  echo " Bitte diesen Schlüssel bei GitHub hinterlegen:"
  echo "   Repository → Settings → Deploy keys → Add deploy key"
  echo "   Titel: Hetzner-Server · Haken bei „Allow write access“ NICHT setzen"
  echo
  cat "$KEY.pub"
  echo "------------------------------------------------------------------"
  read -r -p "Wenn erledigt, Enter drücken … " _
  sudo -u "$APP_USER" git ls-remote "$REPO" >/dev/null || { echo "Zugriff klappt noch nicht. Schlüssel prüfen und Skript erneut starten."; exit 1; }
fi

step "Programm holen und bauen"
if [[ ! -d "$APP_DIR/.git" ]]; then
  sudo -u "$APP_USER" git clone -q "$REPO" "$APP_DIR"
else
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch -q origin main
  sudo -u "$APP_USER" git -C "$APP_DIR" reset -q --hard origin/main
fi
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && npm ci --no-audit --no-fund && npm run build"

step "Einstellungen (Zugangsdaten bleiben nur auf diesem Server)"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Die Eingaben werden nicht angezeigt. Leer lassen = später in $ENV_FILE eintragen."
  read -r -p "Zoom Client-ID: " ZID
  read -r -s -p "Zoom Client-Geheimnis: " ZSECRET; echo
  read -r -s -p "Brevo-API-Schlüssel für E-Mails (optional): " BREVO; echo
  cat > "$ENV_FILE" <<CONF
MB_WEB=1
PORT=4300
MB_HOST=127.0.0.1
MB_TRUST_PROXY=1
MB_PUBLIC_URL=https://$STUDIO_DOMAIN
MB_ADMIN_EMAILS=$ADMIN_EMAIL
MB_DATA_DIR=$DATA_DIR
MB_MAIL_FROM=MeetingBackstage <no-reply@${MAIN_DOMAIN:-$STUDIO_DOMAIN}>
MB_MAIL_BREVO_KEY=$BREVO
ZOOM_CLIENT_ID=$ZID
ZOOM_CLIENT_SECRET=$ZSECRET
CONF
fi
chown root:"$APP_USER" "$ENV_FILE"
chmod 640 "$ENV_FILE"

step "Dienst einrichten (startet automatisch, auch nach Absturz oder Neustart)"
cat > /etc/systemd/system/meetingbackstage.service <<UNIT
[Unit]
Description=MeetingBackstage Studio
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server/server.mjs
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$DATA_DIR

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable meetingbackstage >/dev/null
systemctl restart meetingbackstage

step "Webserver mit https"
{
  echo "{"
  echo "  email $ADMIN_EMAIL"
  echo "}"
  echo
  echo "$STUDIO_DOMAIN {"
  echo "  encode zstd gzip"
  echo "  reverse_proxy 127.0.0.1:4300"
  echo "  header {"
  echo "    Strict-Transport-Security \"max-age=31536000\""
  echo "    -Server"
  echo "  }"
  echo "}"
  if [[ -n "$MAIN_DOMAIN" ]]; then
    echo
    echo "$MAIN_DOMAIN, www.$MAIN_DOMAIN {"
    echo "  root * /var/www/meetingbackstage"
    echo "  file_server"
    echo "  header -Server"
    echo "}"
  fi
} > /etc/caddy/Caddyfile
if [[ -n "$MAIN_DOMAIN" && ! -f /var/www/meetingbackstage/index.html ]]; then
  mkdir -p /var/www/meetingbackstage
  cat > /var/www/meetingbackstage/index.html <<HTML
<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MeetingBackstage</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0d0f12;color:#e8ebee;font:16px system-ui,sans-serif;text-align:center">
<div><h1 style="font-size:28px">MeetingBackstage</h1><p>Live-Grafiken und Regie für Zoom-Workshops. Bald verfügbar.</p>
<p><a style="color:#f0b43c" href="https://$STUDIO_DOMAIN">Zum Studio</a></p></div></body></html>
HTML
fi
systemctl reload caddy || systemctl restart caddy

step "Befehl für Updates: mb-aktualisieren"
cp "$APP_DIR/deploy/aktualisieren.sh" /usr/local/bin/mb-aktualisieren
chmod 755 /usr/local/bin/mb-aktualisieren

sleep 2
if curl -fsS http://127.0.0.1:4300/api/status >/dev/null; then
  echo
  echo "Fertig. MeetingBackstage läuft."
  echo "  Studio:        https://$STUDIO_DOMAIN  (Zertifikat kann beim ersten Aufruf ein paar Sekunden dauern)"
  echo "  Konto anlegen: mit $ADMIN_EMAIL – das ist die Verwaltung"
  echo "  Protokoll:     journalctl -u meetingbackstage -f"
  echo "  Mails ohne Brevo stehen in: $DATA_DIR/web/mails.log"
  echo "  Update:        mb-aktualisieren"
else
  echo "Der Dienst antwortet nicht. Protokoll ansehen: journalctl -u meetingbackstage -n 50"
  exit 1
fi
