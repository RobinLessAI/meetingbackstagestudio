# MeetingBackstage Studio online bringen (Hetzner)

Ziel: `https://studio.meetingbackstage.de` läuft auf einem eigenen Server in Deutschland, mit https,
Kundenkonten und automatischem Neustart. Dauer beim ersten Mal: ca. 30–45 Minuten.

Was du brauchst: die Domain (z. B. `meetingbackstage.de`), ein Hetzner-Konto, dein Mac mit dem Projektordner.

## 1. SSH-Schlüssel auf dem Mac (einmalig)

Im Terminal:

```
ls ~/.ssh/id_ed25519.pub || ssh-keygen -t ed25519
cat ~/.ssh/id_ed25519.pub
```

Die ausgegebene Zeile (beginnt mit `ssh-ed25519`) kopieren. Das ist der **öffentliche** Schlüssel, den darfst du weitergeben.
Die Datei ohne `.pub` bleibt geheim auf deinem Mac.

## 2. Server bei Hetzner anlegen

1. <https://console.hetzner.cloud> → Projekt anlegen → **Server hinzufügen**.
2. Standort: **Nürnberg** oder **Falkenstein**.
3. Image **Ubuntu** (24.04 oder 26.04). Typ: **CPX02** (1 GB) reicht zum Testen, **CPX12** (2 GB) für die ersten Kunden; später per Klick hochstufen. Das Skript legt eine Auslagerungsdatei an, damit das Bauen auch mit wenig Arbeitsspeicher klappt.
4. **SSH-Key**: den kopierten Schlüssel aus Schritt 1 einfügen.
5. **Backups** einschalten.
6. Name z. B. `meetingbackstage-1` → **Erstellen**. Die **IPv4-Adresse** notieren.

## 3. Domain auf den Server zeigen lassen

Beim Anbieter der Domain in der DNS-Verwaltung:

| Typ | Name | Wert |
| --- | --- | --- |
| A | `studio` | IPv4 des Servers |
| A | `@` (Hauptdomain) | IPv4 des Servers |
| A | `www` | IPv4 des Servers |

Optional zusätzlich AAAA-Einträge mit der IPv6-Adresse. Prüfen (kann einige Minuten dauern):

```
ping -c 1 studio.meetingbackstage.de
```

Die angezeigte Adresse muss die Server-IP sein.

## 4. Einrichtungsskript starten

Auf dem Mac im Projektordner (vorher `git pull`):

```
scp deploy/einrichten.sh root@<server-ip>:
ssh root@<server-ip>
bash einrichten.sh studio.meetingbackstage.de deine@adresse.de meetingbackstage.de
```

Das Skript fragt unterwegs zwei Dinge:

1. **Deploy Key für GitHub:** Es zeigt einen Schlüssel an. Auf GitHub im Repository **Settings → Deploy keys → Add deploy key**,
   Titel „Hetzner-Server“, Schlüssel einfügen, **„Allow write access“ nicht anhaken**, speichern. Dann im Terminal Enter.
2. **Zoom Client-ID und Client-Geheimnis** (aus deiner Zoom-App im Marketplace) und optional den Brevo-Schlüssel.
   Die Eingabe bleibt auf dem Server und ist nicht sichtbar. **Nie in einen Chat kopieren.**

Am Ende steht „Fertig. MeetingBackstage läuft.“

## 5. Erstes Konto

1. `https://studio.meetingbackstage.de` öffnen → **Konto anlegen** mit der Adresse aus Schritt 4.
2. Ohne Brevo kommt keine Mail. Den Bestätigungslink auf dem Server ansehen:
   ```
   tail -n 20 /var/lib/meetingbackstage/web/mails.log
   ```
3. Link öffnen, anmelden. Du bist die Verwaltung.

## 6. E-Mails verschicken (Brevo, kostenloser Einstieg)

1. Konto bei <https://www.brevo.com> anlegen.
2. **Absender und Domains → Domain hinzufügen**: `meetingbackstage.de`. Brevo zeigt DNS-Einträge (SPF, DKIM, ggf. DMARC);
   diese beim Domain-Anbieter eintragen und in Brevo bestätigen.
3. **SMTP & API → API-Schlüssel erzeugen**.
4. Auf dem Server eintragen und neu starten:
   ```
   nano /etc/meetingbackstage/studio.env      # Zeile MB_MAIL_BREVO_KEY=… ausfüllen
   systemctl restart meetingbackstage
   ```

## Im Alltag

| Was | Befehl auf dem Server |
| --- | --- |
| Neue Version einspielen (nicht während eines Workshops) | `mb-aktualisieren` |
| Läuft es? | `systemctl status meetingbackstage` |
| Protokoll live ansehen | `journalctl -u meetingbackstage -f` |
| Einstellungen ändern | `nano /etc/meetingbackstage/studio.env`, danach `systemctl restart meetingbackstage` |

Daten liegen in `/var/lib/meetingbackstage` (Konten, Vorlagen, Veranstaltungen); Hetzner sichert den Server täglich.
