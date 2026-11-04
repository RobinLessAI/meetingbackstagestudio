# MeetingBackstage Studio

Produktionspult für Online-Workshops: Der Chat kommt live aus deinem Zoom-Meeting, daraus entstehen Weltkarte, Umfrage, Wortwolke und Chat-Highlight, und diese Grafiken laufen als Browserquellen in OBS.

## Was live funktioniert und was simuliert ist

| Live | Simuliert (Demo) |
| --- | --- |
| Chat aus dem laufenden Zoom-Meeting über das Regie-Fenster (Zoom Meeting SDK, kostenfrei) | Teilnehmerliste, Handzeichen, Sprecherstatus |
| Weltkarte, Umfrage, Wortwolke, Chat-Highlight aus diesem Chat | Spotlight und „Alle stummschalten“ (wirken nicht in Zoom) |
| Ausgabe der Grafiken an OBS (Browserquelle, transparent) | Galerie-Videobilder, Audiopegel, Stream-Deck-Tasten |
| Automatisches Speichern einer eigenen Veranstaltung | NDI, SRT, SDI, Dante |

Live-Video der Teilnehmenden ist bewusst nicht enthalten. Für das Zoom-Bild in OBS eignet sich eine Fensteraufnahme des Zoom-Clients; die Grafiken liegen per Browserquelle darüber.

## Starten

Voraussetzung: Node.js 20.19 oder neuer (empfohlen: aktuelle LTS-Version von nodejs.org). Zoom, OBS und MeetingBackstage Studio laufen auf demselben Rechner.

```bash
git clone https://github.com/RobinLessAI/meetingbackstagestudio.git
cd meetingbackstagestudio
npm install
npm start
```

Ohne Git: auf GitHub „Code“ → „Download ZIP“, entpacken und im Terminal in den Ordner wechseln.

`npm start` baut die App und startet den lokalen Server. Danach:

- **Steuerung:** http://localhost:4300 im Browser öffnen.
- **OBS:** Adressen unter „OBS-Ausgabe“ kopieren (siehe unten).

Die App startet leer und zeigt nur drei Bereiche: **Live Grafiken** (Ausklappmenü mit Chat, Weltkarte, Umfrage, Wortwolke und Chat-Highlight), **OBS-Ausgabe** und **Zoom & Einstellungen**. Die simulierten Bereiche (Teilnehmende, Galerie, Steuerpult & Stream Deck, Audio, Veranstaltungsübersicht) lassen sich unter „Zoom & Einstellungen“ → „Weitere Bereiche (Demo) zeigen“ einblenden. Beispieldaten gibt es dort auf Knopfdruck.

Der Server ist nur auf diesem Rechner erreichbar. Eine eigene Veranstaltung („Veranstaltung“ → „Neue Veranstaltung“) wird automatisch unter `daten/veranstaltung.json` gespeichert und nach einem Neustart wiederhergestellt.

## Grafiken in OBS einbinden

1. In OBS: Quelle hinzufügen → **Browser**.
2. Adresse einfügen, Breite **1920**, Höhe **1080**.
3. Der Hintergrund ist transparent; die Grafik liegt über dem Zoom-Bild.

| Adresse | Inhalt |
| --- | --- |
| `http://localhost:4300/ausgabe.html?grafik=programm` | Die gerade eingeblendete Grafik (Einblendung rechts bzw. Bauchbinde), sonst leer |
| `http://localhost:4300/ausgabe.html?grafik=karte` | Weltkarte, Vollbild |
| `http://localhost:4300/ausgabe.html?grafik=umfrage` | Umfrage, Vollbild |
| `http://localhost:4300/ausgabe.html?grafik=wortwolke` | Wortwolke, Vollbild |
| `http://localhost:4300/ausgabe.html?grafik=highlight&stil=einblendung` | Chat-Highlight als Bauchbinde |

Weitere Optionen: `stil=einblendung|vollbild`, `hintergrund=transparent|dunkel`, `sichtbar=programm` (nur zeigen, wenn eingeblendet), `debug=1` (Verbindungsstatus anzeigen). In der Steuerung blendet „Einblenden“ eine Grafik in der Ausgabe „Programm“ ein.

## Live-Chat aus Zoom einrichten (einmalig)

Der Chat kommt über ein **Regie-Fenster**: MeetingBackstage öffnet ein Browserfenster mit dem **Zoom Meeting SDK**, das deinem Meeting als sichtbarer Teilnehmer **„MeetingBackstage (Regie)“** beitritt, ohne Kamera und Mikrofon. Jede Chat-Nachricht an alle geht sofort an die App. Das ist kostenfrei; Realtime Media Streams (RTMS) werden nicht verwendet.

1. **Meeting SDK einschalten:** marketplace.zoom.us → Manage → deine App → „Funktionen“ → „Einbetten“ (Embed) → **Meeting SDK** einschalten → Speichern. Es geht auch eine neue **General App** (User-managed) nur dafür.
2. **Zugangsdaten eintragen:** In `.env.local` stehen Client-ID und Client-Geheimnis dieser App (Mac: `open -e .env.local`). Andere Einträge (Subscription ID, Redirect, Webhook) werden nicht mehr gebraucht.
3. **Installieren:** `npm install` lädt das Zoom Meeting SDK (einmalig nach dem Update), danach `npm start`.

**Pro Meeting:**
1. Meeting in Zoom als Host starten.
2. In MeetingBackstage unter „Zoom & Einstellungen“ (oder oben im Chat) den Meeting-Link einfügen und **„Regie beitreten“** klicken. Es öffnet sich das Regie-Fenster.
3. In Zoom die Regie aus dem Warteraum **zulassen**, falls ein Warteraum aktiv ist.
4. Das Regie-Fenster offen lassen. Beenden mit „Regie verlassen“ oder durch Schließen des Fensters.

Grenzen: Ohne eine von Zoom geprüfte und veröffentlichte App tritt die Regie nur Meetings deines **eigenen Zoom-Kontos** bei. Die Regie ist für alle sichtbar und belegt einen Teilnehmerplatz. Private Nachrichten werden nicht übernommen. Wenn Zoom den Beitritt wegen des Kenncodes ablehnt, den Kenncode im Feld „Kenncode“ eintragen.

**Notlösung ohne Regie:** In der App unter „Zoom & Einstellungen“ den Zoom-Ordner beobachten lassen. Nach jedem Klick auf „Chat speichern“ in Zoom übernimmt MeetingBackstage die neuen Nachrichten (nicht live). Nur Nachrichten an alle werden übernommen.

## Regeln der Chat-Auswertung

- **Team-Namen:** Beiträge der eingetragenen Team-Namen (z. B. deine eigenen Fragen) werden nicht ausgewertet. „Robin“ erfasst auch „Robin Weniger“.
- **Weltkarte:** Nur Orte, die Personen selbst nennen, erkannt über ein lokales Ortsverzeichnis (`src/data/places.ts`). Eindeutige Orte werden bestätigt (optional automatisch), mehrdeutige und unbekannte landen in der Prüfliste. Pro Person zählt der zuletzt bestätigte Ort.
- **Umfrage:** Gültig ist genau eine Kennung (A, B … oder 1, 2 …) oder genau der Antworttext. „eher B“ oder „B oder C“ gehen zur Prüfung. Pro Person zählt die zuletzt abgegebene gültige Antwort.
- **Wortwolke:** Jeder Begriff zählt pro Nachricht einmal; Filter für Füllwörter, Kurzwörter, unangemessene Begriffe und Umfrage-Stimmen.
- Jede Frage sammelt Beiträge ab ihrem Start („Neu starten“ setzt den Startpunkt auf jetzt).

## Entwicklung

| Befehl | Zweck |
| --- | --- |
| `npm start` | Bauen und Server starten (Port 4300) |
| `npm run server` | Nur den Server starten (nutzt den letzten Build) |
| `npm run dev` | Entwicklungsserver mit Hot Reload (http://localhost:5173); dazu `npm run server` in einem zweiten Terminal |
| `npm run typecheck` | TypeScript prüfen |
| `npm test` | Tests: Chat-Auswertung, Zoom-Chat-Format, Server, Regie-Ablauf (Node 22.18 oder neuer) |
| `npm run map:generate` | Weltkarte aus Natural-Earth-Daten neu erzeugen |

Der Regie-Test prüft Signatur, Chat-Format und den Weg Regie-Fenster → Server → Steuerung. Er ersetzt nicht den ersten Test mit einem echten Meeting; Meldungen dazu (auch die ersten Chat-Rohdaten von Zoom) stehen im Terminal des Servers.

## Aufbau

```
meetingbackstagestudio/
├── server/
│   ├── server.mjs        # lokaler Server: App, OBS-Abgleich, Speichern, Regie, Zoom-Ordner
│   └── meetingSdk.mjs    # Beitritts-Signatur und Chat-Format des Zoom Meeting SDK
├── public/regie.*        # Regie-Fenster (tritt dem Meeting über das Meeting SDK bei)
├── ausgabe.html          # OBS-Ausgabeseite
├── src/
│   ├── ausgabe/          # Darstellung für OBS (transparent, 1920 × 1080)
│   ├── sync/             # Verbindung Steuerung ↔ Server, Momentaufnahmen für OBS
│   ├── state/            # Datenmodell, Auswertung von Karte, Umfrage, Wortwolke
│   ├── lib/              # Ortserkennung, Abstimmung, Wortwolke, Zoom-Chat-Datei
│   ├── components/       # Grafiken, Chat, Live-Chat-Einrichtung, OBS-Adressen
│   └── views/            # Bereiche (sichtbar: Live Grafiken, OBS-Ausgabe, Zoom & Einstellungen; weitere als Demo zuschaltbar)
└── tests/
```

## Quellen und Lizenzen

- Kartendaten: [Natural Earth](https://www.naturalearthdata.com) (gemeinfrei) über `world-atlas`.
- Schriften: Barlow, Barlow Semi Condensed, IBM Plex Mono (SIL Open Font License), lokal eingebunden.
- Symbole: Lucide (ISC). WebSocket: `ws` (MIT).
- Zoom Meeting SDK für Web (`@zoom/meetingsdk`), es gelten die Nutzungsbedingungen von Zoom.
- Personen und Inhalte der Beispieldaten sind erfunden.
