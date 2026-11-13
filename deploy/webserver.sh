#!/usr/bin/env bash
# MeetingBackstage – Webserver (Caddy) für Studio und Hauptseite einrichten.
# Wird von einrichten.sh und mb-aktualisieren aufgerufen; lässt sich gefahrlos wiederholen.
#
# Liest aus /etc/meetingbackstage/studio.env:
#   MB_PUBLIC_URL    Adresse des Studios, z. B. https://studio.meetingbackstage.de
#   MB_ADMIN_EMAILS  erste Adresse = Kontakt für die https-Zertifikate
#   MB_MAIN_DOMAIN   (optional) Hauptdomain; sonst die Studio-Adresse ohne „studio.“
set -euo pipefail
ENV_FILE="/etc/meetingbackstage/studio.env"
CADDYFILE="/etc/caddy/Caddyfile"

env_value() { grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- || true; }
STUDIO_DOMAIN="$(env_value MB_PUBLIC_URL | sed -E 's#^https?://##; s#/.*$##')"
ADMIN_EMAIL="$(env_value MB_ADMIN_EMAILS | cut -d, -f1 | tr -d ' ')"
MAIN_DOMAIN="$(env_value MB_MAIN_DOMAIN)"
if [[ -z "$MAIN_DOMAIN" && "$STUDIO_DOMAIN" == studio.* ]]; then MAIN_DOMAIN="${STUDIO_DOMAIN#studio.}"; fi
if [[ -z "$STUDIO_DOMAIN" ]]; then
  echo "MB_PUBLIC_URL fehlt in $ENV_FILE – Webserver bleibt unverändert."
  exit 0
fi

# Die Hauptseite wird vom MeetingBackstage-Dienst ausgeliefert (Inhalte bearbeitest du im Studio unter „Website“).
# Caddy leitet beide Adressen an den Dienst weiter; /var/www/meetingbackstage wird nicht mehr gebraucht.

# Caddy-Konfiguration erzeugen; nur bei Änderung übernehmen
new="$(mktemp)"
{
  if [[ -n "$ADMIN_EMAIL" ]]; then
    echo "{"
    echo "	email $ADMIN_EMAIL"
    echo "}"
    echo
  fi
  cat <<CADDY
$STUDIO_DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:4300
	header {
		Strict-Transport-Security "max-age=31536000"
		-Server
	}
}
CADDY
  if [[ -n "$MAIN_DOMAIN" ]]; then
    cat <<CADDY

www.$MAIN_DOMAIN {
	redir https://$MAIN_DOMAIN{uri} permanent
}

$MAIN_DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:4300
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Referrer-Policy "strict-origin-when-cross-origin"
		Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
		-Server
	}
}
CADDY
  fi
} > "$new"

if [[ -f "$CADDYFILE" ]] && cmp -s "$new" "$CADDYFILE"; then
  rm -f "$new"
  exit 0
fi
if ! caddy validate --adapter caddyfile --config "$new" >/dev/null 2>&1; then
  echo "Neue Webserver-Konfiguration ist fehlerhaft – die bisherige bleibt aktiv:"
  caddy validate --adapter caddyfile --config "$new" || true
  rm -f "$new"
  exit 1
fi
[[ -f "$CADDYFILE" ]] && cp "$CADDYFILE" "$CADDYFILE.vorher"
install -m 644 "$new" "$CADDYFILE"
rm -f "$new"
systemctl reload caddy || systemctl restart caddy
echo "Webserver neu geladen (Studio: $STUDIO_DOMAIN${MAIN_DOMAIN:+, Hauptseite: $MAIN_DOMAIN})."
