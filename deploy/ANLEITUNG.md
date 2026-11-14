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
2. **Zoom Client-ID und Client-Geheimnis** (aus deiner Zoom-App im Marketplace) und optional das Passwort des Postfachs für E-Mails (Schritt 6).
   Die Eingabe bleibt auf dem Server und ist nicht sichtbar. **Nie in einen Chat kopieren.**

Am Ende steht „Fertig. MeetingBackstage läuft.“

## 5. Erstes Konto

1. `https://studio.meetingbackstage.de` öffnen → **Konto anlegen** mit der Adresse aus Schritt 4.
2. Solange Schritt 6 nicht erledigt ist, kommt keine Mail. Den Bestätigungslink auf dem Server ansehen:
   ```
   tail -n 20 /var/lib/meetingbackstage/web/mails.log
   ```
3. Link öffnen, anmelden. Du bist die Verwaltung.

## 6. E-Mails verschicken (über das Postfach im Webhosting)

Die Mails (Adresse bestätigen, Passwort vergessen, Freischaltung) gehen über ein normales Postfach deines Hetzner-Webhostings.
Kein zusätzlicher Dienst, keine Kosten.

1. In der **konsoleH** (Webhosting S) → **E-Mail → Postfächer → Neues Postfach**: `no-reply@meetingbackstage.de`,
   ein langes Passwort vergeben (Passwort-Manager). **Das Passwort nie in einen Chat kopieren.**
2. Auf dem Server die Einstellungen öffnen:
   ```
   nano /etc/meetingbackstage/studio.env
   ```
   Diese Zeilen ergänzen (eine Zeile `MB_MAIL_BREVO_KEY=…` kann gelöscht werden):
   ```
   MB_MAIL_SMTP_HOST=mail.your-server.de
   MB_MAIL_SMTP_PORT=465
   MB_MAIL_SMTP_USER=no-reply@meetingbackstage.de
   MB_MAIL_SMTP_PASS=das-postfach-passwort
   MB_MAIL_FROM=MeetingBackstage <no-reply@meetingbackstage.de>
   ```
   Speichern mit `Ctrl+O`, Enter, `Ctrl+X`.
3. Neue Version holen und neu starten:
   ```
   mb-aktualisieren
   journalctl -u meetingbackstage -n 20      # zeigt „E-Mails: Versand über mail.your-server.de …“
   ```
4. Testen: abmelden → **Passwort vergessen** mit deiner Adresse. Die Mail sollte nach wenigen Sekunden da sein
   (beim ersten Mal auch im Spam-Ordner nachsehen).
5. Damit Mails nicht im Spam landen: In der konsoleH unter **DNS** prüfen, dass es einen TXT-Eintrag für `meetingbackstage.de`
   mit `v=spf1 … include:spf.your-server.de …` gibt (legt Hetzner normalerweise selbst an). DKIM kann in der konsoleH beim
   Postfach bzw. der Domain eingeschaltet werden.

Wenn etwas nicht klappt, steht der Grund im Protokoll (`journalctl -u meetingbackstage -n 50`), z. B.
„E-Mail-Versand fehlgeschlagen (Anmeldung, Passwort)“ → Benutzer oder Passwort in `studio.env` prüfen.

## 7. „Mit Zoom verbinden“ für Kunden (Zoom-App im Marketplace)

Kunden verbinden auf der Seite **Meeting** mit einem Klick ihr Zoom-Konto. Danach sehen sie ihre Meetings, und die Regie darf
ihren Meetings beitreten, solange der Kunde selbst im Meeting ist (Zoom nennt das OBF-Token).

Einmalig in deiner Zoom-App auf <https://marketplace.zoom.us> → **Manage** → deine App:

1. **Basic Information → OAuth Information**
   - **OAuth Redirect URL:** `https://studio.meetingbackstage.de/api/zoom/zurueck`
   - Dieselbe Adresse unter **OAuth Allow List** hinzufügen.
2. **Scopes → Add Scopes**: `meeting:read:list_meetings`, `user:read:user`, `user:read:token`.
3. **Features → Access → Event Subscription** einschalten:
   - Endpoint URL: `https://studio.meetingbackstage.de/api/zoom/ereignis`
   - Event: **App Deauthorized** (Bereich „App“). Gibt es bei dir stattdessen ein Feld „Deauthorization Notification“,
     dort dieselbe Adresse eintragen.
   - Oben auf der Seite steht ein **Secret Token**. Auf dem Server eintragen (nie in einen Chat kopieren):
     ```
     nano /etc/meetingbackstage/studio.env      # Zeile ZOOM_WEBHOOK_SECRET_TOKEN=… ergänzen
     systemctl restart meetingbackstage
     ```
   - Erst danach in Zoom **Validate** klicken (der Server muss das Secret Token schon kennen), dann speichern.
4. In MeetingBackstage: Seite **Meeting** → Reiter **Aus meinem Zoom-Konto** → **Mit Zoom verbinden**.
   Wer schon vorher verbunden war: einmal **Zoom-Konto trennen** und neu verbinden, damit die neuen Scopes gelten.

**Wichtig:** Solange die App nicht im Zoom Marketplace veröffentlicht ist, erlaubt Zoom das Verbinden und den Regie-Beitritt
nur für dein eigenes Zoom-Konto. Für Kunden mit eigenem Zoom-Konto muss die App veröffentlicht werden (auf Wunsch nicht öffentlich
gelistet). Ohne Veröffentlichung meldet die Regie „Zoom erlaubt der Regie noch keine Meetings anderer Zoom-Konten“.

## 8. Hauptseite meetingbackstage.de bearbeiten

Die Hauptseite bearbeitest du im Studio: als Verwaltung anmelden → links **Website**.

- **Seiten:** bestehende Seiten ändern, neue anlegen (z. B. /preise/), duplizieren, löschen. Jede Seite besteht aus Abschnitten
  (Bühne, Seitenkopf, Karten mit Symbolen, Schritte, Liste mit Kasten, Häufige Fragen, Aufruf, Text, Bild, Bild und Text),
  die du hinzufügst, verschiebst und füllst. Texte mit Formatierung schreibst du im eingebauten Editor.
- **SEO:** pro Seite Titel und Beschreibung für Google (mit Vorschau und Zeichenzähler), Vorschaubild beim Teilen, „In
  Suchmaschinen anzeigen“. Unter **Allgemein & SEO**: Name, Titel-Vorlage, allgemeine Beschreibung, **Favicon**, Logos.
- **Menü & Fußzeile:** Menüpunkte, Knöpfe oben rechts, Links und Texte unten.
- **Bilder:** hochladen (Fotos werden automatisch verkleinert), Adresse kopieren, löschen.
- **E-Mail-Vorlagen:** alle Mails des Systems (Adresse bestätigen, Passwort zurücksetzen, Konto freigeschaltet, neues
  Konto an die Verwaltung) mit eigenem Betreff, Überschrift, Text und Knopf; Platzhalter wie `{{name}}`, `{{link}}`;
  Vorschau, Testmail an dich, gemeinsame Fußzeile. Gilt sofort nach „Speichern“ (gespeichert in `web/mail-vorlagen.json`).
- **Entwurf → Vorschau → Veröffentlichen:** Änderungen werden laufend als Entwurf gespeichert und sind erst nach
  **Veröffentlichen** öffentlich. Unter **Frühere Fassungen** lassen sich die letzten 40 Stände zurückholen.

Technik: Der MeetingBackstage-Dienst liefert die Hauptseite selbst aus; Caddy leitet `meetingbackstage.de` an ihn weiter
(`deploy/webserver.sh`, wird von `mb-aktualisieren` aufgerufen). Inhalte und Bilder liegen in `/var/lib/meetingbackstage/website/`.
Beim allerersten Start wird der Inhalt aus `website/inhalt-start.json` übernommen; danach gilt nur noch, was du in der Verwaltung
speicherst. Design (Farben, Schrift, Aufbau der Abschnitte) liegt im Code: `website/assets/site.css`, `server/website/render.mjs`.

## 9. Rollen und Rechte

In der **Verwaltung** weist du jedem Konto eine Rolle zu (Spalte „Rolle“). **Admin** sieht alles, inklusive Verwaltung und Website;
Adressen aus `MB_ADMIN_EMAILS` bleiben immer Admin. Darunter unter **Rollen & Rechte**:

- Rollen anlegen, umbenennen, löschen (z. B. „Nutzer“, „Basis“, „Pro“) und eine **Standard-Rolle** für neue Konten wählen.
- Je Rolle die Bereiche anhaken: Meeting, jede Live-Grafik einzeln, Spotlight, Wer war dran, OBS-Ausgabe, Zoom & Einstellungen, Weitere Produkte.
- **„Fehlende Bereiche ausgegraut im Menü zeigen“**: gesperrte Bereiche erscheinen grau mit Schloss; ein Klick zeigt deinen Hinweis
  (z. B. „Gibt es in MeetingBackstage Pro – schreib uns an info@meetingbackstage.de.“). Aus: fehlende Bereiche sind unsichtbar.
- Änderungen wirken sofort, auch in bereits geöffneten Studio-Fenstern. Gesperrt werden auch Tastenkürzel und Stream-Deck-Aktionen;
  Spotlight-Befehle lehnt zusätzlich der Server ab.

## 10. MeetingBackstage Slides (slide.meetingbackstage.de)

Folien mit Text, Formen, Bildern und Videos für OBS – unabhängig von Zoom. Gestaltet wird auf `slide.meetingbackstage.de`
(Anmeldung wie im Studio), im Studio gibt es die Kategorie **Slides** mit Vorschau, Kanal und „Bearbeiten“.

**Einmalig einrichten:**

1. DNS: In der Hetzner Console → **DNS** → Zone `meetingbackstage.de` einen Eintrag anlegen:
   Typ **A**, Name **slide**, Wert **2.31.157.102**.
2. Auf dem Server `mb-aktualisieren` (und, falls die Webserver-Meldung fehlt, `bash /opt/meetingbackstage/deploy/webserver.sh`).
   Caddy holt das https-Zertifikat für `slide.` automatisch, sobald der DNS-Eintrag wirkt (meist wenige Minuten).
3. Einmal neu anmelden: Die Anmeldung gilt ab jetzt für Studio und Slides gemeinsam.

**OBS:** Je Folie eine feste Adresse `https://slide.meetingbackstage.de/s/…`, dazu ein **Kanal** `…/kanal/…`, der immer die
Folie „auf Sendung“ zeigt. Quelle „Browser“, 1920 × 1080. Änderungen erscheinen sofort. Der Knopf **„Mit Ton“** neben den
Adressen hängt `?ton=1` an, dann spielen Videos mit Ton (zusätzlich beim Video „Ton abspielen“ einschalten).

**Ordner (z. B. ein Ordner je Kurs):** Im Folien-Editor links über der Folienliste den Ordner wählen; das Ordner-Symbol legt
einen neuen an, Stift und Papierkorb benennen um bzw. löschen (die Folien bleiben dann unter „Ohne Ordner“ erhalten). Neue Folien
und Präsentationen landen im gewählten Ordner; verschieben über „Ordner“ rechts bei der Folie bzw. Präsentation. Die Suche
findet Folien über alle Ordner (Name, Texte, Notizen). Präsentationen dürfen Folien aus jedem Ordner verwenden.

**Speichern und Export:** Alles liegt auf dem Server im eigenen Konto (Folien, Ordner, Präsentationen, Bilder, Videos,
Veranstaltung und Vorlagen aus dem Studio) und wird automatisch gespeichert. „Exportieren“ (im Folien-Editor oben, im Studio
unter „Slides“, im Kontomenü) lädt herunter:
- **Alle Daten als ZIP** – inklusive Bilder und Videos in Originalqualität, mit `LIESMICH.txt`; oder nur einen Ordner.
- **Folien als Bilder (PNG, 1920 × 1080)** – je Ordner ein Unterordner, z. B. für PowerPoint oder Handouts.

**3D-Perspektive:** Bei einer Folie rechts unter „3D-Perspektive“ die Folie räumlich neigen: seitlich drehen, nach hinten
kippen, in der Ebene drehen, Tiefenwirkung (Verzerrung), Größe und Position, wahlweise mit Schatten und mit oder ohne
Hintergrund. Vier Vorlagen (links/rechts gedreht, nach hinten gekippt, schräg im Raum) als Startpunkt. Einzelne Elemente
lassen sich unter „Position und Größe“ zusätzlich in 3D kippen. Die Fläche um die geneigte Folie bleibt in OBS durchsichtig.

**Präsentationen:** Im Folien-Editor oben auf **Präsentationen** umschalten, Präsentation anlegen und Folien in die gewünschte
Reihenfolge bringen (ziehen oder Pfeile). Pro Folie stellst du rechts unter „Präsentation“ den **Übergang** (Überblenden,
Schieben, Zoom, Wischen …) und die **Notizen** ein; bei einem Element legt „Erscheint → Beim 1. Klick“ fest, dass es erst nach
einem Klick auf „Weiter“ erscheint. Optional: automatisch weiter (z. B. alle 10 Sekunden) und Endlosschleife für Pausen.
Gezeigt wird die Präsentation über die **Kanal-Adresse** – in OBS ändert sich nichts.

- **Starten und weiterschalten:** im Studio unter „Slides“, im Editor oder in der **Referentenansicht**
  (`slide.meetingbackstage.de/?ansicht=referent`: aktuelle und nächste Folie, Notizen, Uhr, Laufzeit).
- **Tasten:** Pfeil rechts / Bild ab = weiter, Pfeil links / Bild auf = zurück, Pos1 = Anfang, B = schwarz. Ein Presenter
  (Klicker) sendet genau diese Tasten. In der Referentenansicht zusätzlich Leertaste und Enter.
- **Stream Deck:** Adressen für Weiter, Zurück, Anfang und Schwarz stehen im Studio unter „Slides“ → „Präsentation“.
  Sie wirken direkt auf dem Server, auch wenn kein Browserfenster offen ist.

**Grenzen:** Bilder bis 15 MB (große Fotos werden im Browser verkleinert), Videos (MP4, WebM) bis 200 MB, insgesamt 2 GB je Konto.
Dateien liegen in `/var/lib/meetingbackstage/folien-medien/`, die Folien je Konto in `konten/<id>/folien.json`.
In der Verwaltung lässt sich „Slides“ je Rolle freischalten.

## Im Alltag

| Was | Befehl auf dem Server |
| --- | --- |
| Neue Version einspielen (nicht während eines Workshops) | `mb-aktualisieren` |
| Webserver-Konfiguration neu schreiben | `bash /opt/meetingbackstage/deploy/webserver.sh` |
| Läuft es? | `systemctl status meetingbackstage` |
| Protokoll live ansehen | `journalctl -u meetingbackstage -f` |
| Einstellungen ändern | `nano /etc/meetingbackstage/studio.env`, danach `systemctl restart meetingbackstage` |

Daten liegen in `/var/lib/meetingbackstage` (Konten, Vorlagen, Veranstaltungen, Website); Hetzner sichert den Server täglich.
