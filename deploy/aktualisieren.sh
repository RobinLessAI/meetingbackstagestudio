#!/usr/bin/env bash
# MeetingBackstage Studio – neue Version vom GitHub holen, bauen und neu starten.
# Aufruf auf dem Server: mb-aktualisieren
# Achtung: Der Neustart trennt laufende Verbindungen kurz (Regie, OBS verbinden sich selbst neu).
# Deshalb nicht während eines Workshops ausführen.
set -euo pipefail
APP_USER="mbstudio"
APP_DIR="/opt/meetingbackstage"
if [[ $EUID -ne 0 ]]; then
  echo "Bitte mit sudo bzw. als root ausführen."
  exit 1
fi
old=$(sudo -u "$APP_USER" git -C "$APP_DIR" rev-parse --short HEAD)
sudo -u "$APP_USER" git -C "$APP_DIR" fetch -q origin main
sudo -u "$APP_USER" git -C "$APP_DIR" reset -q --hard origin/main
new=$(sudo -u "$APP_USER" git -C "$APP_DIR" rev-parse --short HEAD)
if [[ "$old" == "$new" && "${1:-}" != "--erzwingen" ]]; then
  echo "Schon aktuell ($new)."
  exit 0
fi
echo "Aktualisiere $old → $new …"
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && npm ci --no-audit --no-fund && npm run build"
cp "$APP_DIR/deploy/aktualisieren.sh" /usr/local/bin/mb-aktualisieren
systemctl restart meetingbackstage
sleep 2
curl -fsS http://127.0.0.1:4300/api/status && echo && echo "Läuft mit Version $new."
