# MeetingBackstage Studio

Produktionspult für Online-Workshops: Der Chat kommt live aus deinem Zoom-Meeting, daraus entstehen Weltkarte, Umfrage, Wortwolke, Chat-Highlight und Glücksrad, und diese Grafiken laufen als Browserquellen in OBS.

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

**Neustart:** Die App startet immer ohne Beispieldaten. Bei jedem Start des Servers (`npm start`) werden die Antworten der letzten Sitzung gelöscht: Chat, bestätigte Orte, Stimmen, ausgeblendete Begriffe, Highlight und Programm; die Umfrage steht wieder auf Entwurf. Erhalten bleiben Titel, Team-Namen, Fragen, Umfrage-Antworten, Kartenausschnitt, Aussehen und Vorlagen. Nur ein Neuladen der Seite ohne Server-Neustart behält die Antworten (Schutz während des Workshops).

Die App startet leer mit der Seite **Meeting** (Zoom-Link eingeben) und zeigt daneben nur drei weitere Bereiche: **Live Grafiken** (Klick zeigt eine Übersicht aller vier Grafiken; Ausklappmenü mit Chat-Highlight, Umfrage, Weltkarte und Wortwolke; die Liste der Chat-Nachrichten öffnet sich beim Chat-Highlight über „Als Pop-up öffnen“ als eigenes Fenster), **OBS-Ausgabe** und **Zoom & Einstellungen**. Die simulierten Bereiche (Teilnehmende, Galerie, Steuerpult & Stream Deck, Audio, Veranstaltungsübersicht) lassen sich unter „Zoom & Einstellungen“ → „Weitere Bereiche (Demo) zeigen“ einblenden. Beispieldaten gibt es dort auf Knopfdruck.

Der Server ist nur auf diesem Rechner erreichbar. Eine eigene Veranstaltung („Veranstaltung“ → „Neue Veranstaltung“) wird automatisch unter `daten/veranstaltung.json` gespeichert und nach einem Neustart wiederhergestellt.

## Web-Modus mit Kundenkonten (in Arbeit)

Für den späteren Betrieb unter `studio.meetingbackstage.de` gibt es einen Web-Modus: Kundinnen und Kunden legen ein Konto an,
bestätigen ihre E-Mail-Adresse, du schaltest sie frei, und jedes Konto hat seine eigenen Veranstaltungen, Vorlagen, OBS-Adressen
und Stream-Deck-Tasten. Die lokale Version (`npm start`) bleibt davon unberührt.

Auf dem eigenen Rechner ausprobieren (Daten landen getrennt in `daten/web/` und `daten/konten/`):

```
MB_WEB=1 MB_ADMIN_EMAILS=deine@adresse.de npm start
```

1. `http://localhost:4300` öffnen, **Konto anlegen** mit der Adresse aus `MB_ADMIN_EMAILS`.
2. Mails werden noch nicht verschickt: Der Bestätigungslink steht im Terminal-Hinweis bzw. in `daten/web/mails.log`. Link öffnen,
   dann anmelden. Diese Adresse ist die **Verwaltung** und sofort freigeschaltet.
3. In einem zweiten Browser (oder privaten Fenster) ein weiteres Konto anlegen und bestätigen. Es wartet dann auf Freischaltung:
   unter **Verwaltung** freischalten, sperren, entsperren oder löschen.

Was der Web-Modus anders macht:
- Ohne Anmeldung kein Zugriff. Sitzungen gelten 30 Tage, Passwörter werden nur als Hash gespeichert, nach 8 falschen Versuchen ist
  15 Minuten Pause.
- OBS-Adressen enthalten einen geheimen Schlüssel (`…&k=…`), Stream-Deck-Adressen ebenso. Unter „OBS-Ausgabe → Geheime Adressen“
  lassen sie sich erneuern.
- **Sperren** trennt sofort alle Fenster des Kontos (Steuerung, Regie, OBS, Stream Deck), **Löschen** entfernt auch alle Daten.
- Chatnachrichten werden nicht gespeichert, nur während der Sitzung gehalten.
- Chat-Export aus dem Zoom-Ordner und Microsoft Teams gibt es nur in der lokalen Version.

Online bringen auf einem eigenen Server: Schritt-für-Schritt in [`deploy/ANLEITUNG.md`](deploy/ANLEITUNG.md) (Einrichtungsskript `deploy/einrichten.sh`, Updates mit `mb-aktualisieren`). E-Mails über ein Postfach per SMTP (`MB_MAIL_SMTP_HOST/PORT/USER/PASS`, `MB_MAIL_FROM`), alternativ Brevo mit `MB_MAIL_BREVO_KEY`; ohne beides landen sie in `mails.log`.

Weitere Einstellungen für den Server: `MB_PUBLIC_URL` (öffentliche Adresse, z. B. `https://studio.meetingbackstage.de`),
`MB_TRUST_PROXY=1` (hinter einem Proxy mit https), `MB_HOST`, `PORT`.

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
| `http://localhost:4300/ausgabe.html?grafik=gluecksrad` | Glücksrad, Vollbild |
| `http://localhost:4300/ausgabe.html?grafik=highlight&stil=einblendung` | Chat-Highlight als Bauchbinde |

Weitere Optionen: `stil=einblendung|vollbild`, `hintergrund=transparent|dunkel`, `sichtbar=programm` (nur zeigen, wenn eingeblendet), `debug=1` (Verbindungsstatus anzeigen). In der Steuerung blendet „Einblenden“ eine Grafik in der Ausgabe „Programm“ ein.

## Ohne OBS: Bildschirm teilen in Zoom oder Teams

Unter „OBS-Ausgabe“ (oder über das Symbol an der kleinen Programm-Vorschau links unten) **Präsentationsfenster öffnen**.
Das Fenster zeigt immer das Programm als Vollbild-Grafik auf dunklem Hintergrund, ohne Programm den Titel der Veranstaltung.
In Zoom „Bildschirm freigeben“ → Fenster „MeetingBackstage · Präsentation“ wählen. Die Bedienleiste schließt du mit **X**
(sie kommt in diesem Fenster nicht wieder), der Mauszeiger verschwindet von selbst. Taste **F** schaltet Vollbild um. Adresse: `http://localhost:4300/ausgabe.html?modus=praesentation`
(mit `&leer=schwarz` bleibt das Fenster ohne Programm ganz dunkel).

## Programm und Stream Deck

Am einfachsten ist eine einzige OBS-Browserquelle **„Programm“** (`ausgabe.html?grafik=programm`) über dem Zoom-Bild. Sie ist durchsichtig, bis du in der App bei einer Grafik auf **„Ins Programm“** klickst; eine andere Grafik ersetzt die laufende, „Im Programm“ oder „Ausblenden“ nimmt sie heraus. Die kleine Vorschau links unten (und groß unter „OBS-Ausgabe“) zeigt genau, was die Quelle gerade zeigt.

Stream Deck: Aktion „Website“ mit „GET-Anfrage im Hintergrund“ und einer Adresse wie `http://localhost:4300/aktion/karte-anzeigen?schluessel=…`. Alle Adressen mit deinem Schlüssel stehen in der App unter „OBS-Ausgabe → Fernsteuerung“ (der Schlüssel liegt in `daten/aktion-schluessel.txt`). Tastenkürzel: K Weltkarte, U Umfrage, W Wortwolke, H Chat-Highlight, D Glücksrad drehen, X ausblenden (nur wenn das App-Fenster vorne ist). Spotlight siehe unten; „Alle stummschalten“ (`alle-stumm`) wirkt noch nicht in Zoom.

## Spotlight in Zoom (Tasten 1–9, Stream Deck)

Die Seite **Spotlight** zeigt live, wer im Zoom-Meeting ist (gelesen über das Regie-Fenster), mit Handzeichen, Video und Mikrofon.
Umschalter **Mehrere gleichzeitig** (Standard): Klick oder Taste nimmt eine Person dazu, nochmal nimmt nur sie heraus, bis zu 9 Personen; das Zielkreuz-Symbol setzt nur diese Person. **Nur eine Person**: Klick oder Taste ersetzt die vorige, „+“ nimmt doch jemanden dazu. Oben stehen alle, die gerade im Spotlight sind, mit × zum Herausnehmen. Für schnelle Wechsel gibt es **feste Plätze 1–9**: Name eintragen
(oder in der Liste „Platz …“ wählen); „Anna“ findet auch „Anna Schulz (sie/ihr)“. Die Plätze bleiben gespeichert.

- **Meldet sich gerade** (oben auf „Spotlight“, auf „Wer war dran“ und im Pop-up): wer gerade spricht (von Zoom gemeldet),
  wer die Hand hebt (mit Wartezeit) und wer das Mikrofon an hat, jeweils mit Spotlight-Knopf. Sprechende stehen oben, dann Hände,
  dann offene Mikrofone; wer in der letzten Minute gesprochen hat, bleibt kurz stehen. Der Host ist ausgenommen.
- **Tasten** (App-Fenster vorne): `1`–`9` Platz ins Spotlight (je nach Umschalter dazu oder statt der vorigen), nochmal drücken nimmt ihn heraus; `0` hebt jedes Spotlight auf; `N` holt die
  Hand, die am längsten oben ist.
- **Stream Deck:** `http://localhost:4300/aktion/spotlight-1?schluessel=…` bis `spotlight-9`, dazu `spotlight-leeren` und `naechste-hand`.
- **Überall auf dem Mac:** In „Kurzbefehle“ die Aktion „Inhalte von URL abrufen“ mit dieser Adresse anlegen und einen Tastaturkurzbefehl vergeben.

Voraussetzung: Zoom lässt Spotlight nur Host und Co-Host setzen. In Zoom unter **Teilnehmer** bei „MeetingBackstage (Regie)“ auf
**Mehr → Zum Co-Host machen** (Co-Host muss in den Zoom-Einstellungen eingeschaltet sein). Zoom verlangt außerdem mindestens drei
Personen im Meeting, und die Person im Spotlight braucht eingeschaltetes Video.

## Wer war dran (persönliche Liste)

Die Seite **Wer war dran** listet alle aus dem Zoom-Meeting (ohne Host und Team-Namen) zum Abhaken, nur für dich, nicht in OBS oder Zoom:
**Gefragt**, **Gesprochen**, **Merken** (jeweils mit Uhrzeit) und eine kurze Notiz. Wer im Spotlight war, zählt automatisch als
„schon dran“. Wer das Meeting verlässt, bleibt mit seinen Markierungen in der Liste; Wiedereintritte landen in derselben Zeile.
„Wen als Nächstes?“ schlägt zufällig jemanden vor, der gerade im Meeting ist und noch nicht dran war (mit Spotlight-Knopf).
Filter: Noch nicht dran, Schon dran, Gemerkt, nur Anwesende, Suche. Personen ohne Zoom (Telefon, Raum) lassen sich von Hand
hinzufügen. „Als Pop-up öffnen“ zeigt die Liste als eigenes Fenster neben Zoom. Nach einem Neustart der App beginnt die Liste leer.

## Live-Chat aus Zoom einrichten (einmalig)

Der Chat kommt über ein **Regie-Fenster**: MeetingBackstage öffnet ein Browserfenster mit dem **Zoom Meeting SDK**, das deinem Meeting als sichtbarer Teilnehmer **„MeetingBackstage (Regie)“** beitritt, ohne Kamera und Mikrofon. Jede Chat-Nachricht an alle geht sofort an die App. Das ist kostenfrei; Realtime Media Streams (RTMS) werden nicht verwendet.

1. **Meeting SDK einschalten:** marketplace.zoom.us → Manage → deine App → „Funktionen“ → „Einbetten“ (Embed) → **Meeting SDK** einschalten → Speichern. Es geht auch eine neue **General App** (User-managed) nur dafür.
2. **Zugangsdaten eintragen:** In `.env.local` stehen Client-ID und Client-Geheimnis dieser App (Mac: `open -e .env.local`). Andere Einträge (Subscription ID, Redirect, Webhook) werden nicht mehr gebraucht.
3. **Installieren:** `npm install` lädt das Zoom Meeting SDK (einmalig nach dem Update), danach `npm start`.

**Pro Meeting:**
1. Meeting in Zoom als Host starten.
2. MeetingBackstage öffnet mit der Seite **„Meeting“**: Zoom-Link einfügen und **„Meeting beitreten“** klicken. Es öffnet sich das Regie-Fenster; der Ablauf (beitreten, im Warteraum zulassen, verbunden) wird dort Schritt für Schritt angezeigt.
3. In Zoom die Regie aus dem Warteraum **zulassen**, falls ein Warteraum aktiv ist.
4. Das Regie-Fenster offen lassen. Beenden mit „Regie verlassen“ oder durch Schließen des Fensters.

Grenzen: Ohne eine von Zoom geprüfte und veröffentlichte App tritt die Regie nur Meetings deines **eigenen Zoom-Kontos** bei. Die Regie ist für alle sichtbar und belegt einen Teilnehmerplatz. Private Nachrichten werden nicht übernommen. Wenn Zoom den Beitritt wegen des Kenncodes ablehnt, den Kenncode im Feld „Kenncode“ eintragen.

**Meine Meetings (Seite „Meeting“):** Unter dem Eingabefeld lassen sich eigene Veranstaltungen mit Name, Zoom-Link und optional Kenncode speichern (ein Klick auf „Beitreten“ genügt dann). Der Reiter „Aus meinem Zoom-Konto“ zeigt geplante und wiederkehrende Meetings sowie den persönlichen Meetingraum. Dafür einmalig: im Marketplace die Scopes `meeting:read:list_meetings` und `user:read:user` ergänzen, in `.env.local` `ZOOM_REDIRECT_URI` (gleiche Adresse wie „OAuth Redirect URL“) eintragen, neu starten, „Bei Zoom erlauben“ und die Adresse nach dem Erlauben einfügen. Die Zugangs-Token liegen nur lokal in `daten/zoom-anmeldung.json`. Im Web-Modus (Server) genügt ein Klick auf „Mit Zoom verbinden“: Zoom leitet auf `/api/zoom/zurueck` zurück, die Anmeldung liegt je Kundenkonto auf dem Server, die Regie bekommt pro Meeting ein OBF-Token (Scope `user:read:token`), und `/api/zoom/ereignis` löscht die Anmeldung, wenn ein Kunde die App bei Zoom entfernt (`ZOOM_WEBHOOK_SECRET_TOKEN`). Einrichtung: `deploy/ANLEITUNG.md`, Abschnitt 7.

**Kategorien:** Jedem Meeting (gespeichert oder aus dem Zoom-Konto) lassen sich über „Kategorie“ eigene, farbige Kategorien zuordnen; neue Kategorien entstehen direkt dort. Beide Listen lassen sich nach Kategorie filtern; „Kategorien verwalten“ ändert Farben oder löscht Kategorien. Die Zuordnung hängt an der Meeting-ID und liegt in `daten/vorlagen.json`.

**Notlösung ohne Regie:** In der App unter „Zoom & Einstellungen“ den Zoom-Ordner beobachten lassen. Nach jedem Klick auf „Chat speichern“ in Zoom übernimmt MeetingBackstage die neuen Nachrichten (nicht live). Nur Nachrichten an alle werden übernommen.

## Live-Chat aus Microsoft Teams einrichten (einmalig, kostenlos)

Funktioniert mit einem Microsoft-365-Konto (Firma, Schule, Verein), nicht mit dem privaten Teams. MeetingBackstage liest den
Chat über Microsoft Graph mit deinem eigenen Konto. Es erscheint kein zusätzlicher Teilnehmer, du selbst musst im Meeting sein.

1. Auf <https://entra.microsoft.com> mit dem Vereinskonto anmelden: **App-Registrierungen** → **Neue Registrierung**.
   Name „MeetingBackstage“, Kontotyp „Nur Konten in diesem Organisationsverzeichnis“.
   Umleitungs-URI: Plattform **Öffentlicher Client/nativ (mobil und Desktop)**, Adresse `http://localhost:4300/teams/anmeldung`.
2. In der App unter **Authentifizierung**: „Öffentliche Clientflows zulassen“ auf **Ja**.
3. Unter **API-Berechtigungen** → Microsoft Graph → **Delegierte Berechtigungen**: `Calendars.Read` und `Chat.Read` hinzufügen
   (`User.Read` ist schon da). Ein Geheimnis wird nicht gebraucht.
4. In `.env.local` eintragen (beide Werte stehen auf der Übersichtsseite der App):
   ```
   TEAMS_CLIENT_ID=Anwendungs-ID
   TEAMS_TENANT_ID=Verzeichnis-ID
   ```
5. Tunnel-Programm installieren: `brew install cloudflared` (kostenlos, ohne Konto). Ist stattdessen `ngrok` installiert, wird das genutzt.
6. App neu starten, auf der Seite „Meeting“ den Reiter **Aus Microsoft Teams** öffnen und **Mit Microsoft anmelden**.

Im Workshop: Meeting in der Liste wählen, **Starten** öffnet es in der Teams-App, **Chat mitlesen** startet die Live-Verbindung.
Warum ein Tunnel? Microsoft erlaubt kein ständiges Nachfragen nach neuen Nachrichten, sondern schickt sie an eine öffentliche
https-Adresse. Der Tunnel führt nur zu einem kleinen Empfänger (Port 4302), der ausschließlich Benachrichtigungen mit dem
geheimen Schlüssel des aktuellen Abos annimmt. Die App selbst bleibt nur auf deinem Mac erreichbar.

Blockiert dein Verein das Registrieren eigener Apps oder die Zustimmung zu Berechtigungen, muss ein Admin des Vereins Schritt 1
bis 3 erledigen bzw. die Berechtigungen bestätigen.

## Regeln der Chat-Auswertung

- **Team-Namen:** Beiträge der eingetragenen Team-Namen (z. B. deine eigenen Fragen) werden nicht ausgewertet. „Robin“ erfasst auch „Robin Weniger“.
- **Weltkarte:** Nur Orte, die Personen selbst nennen, erkannt über ein lokales Ortsverzeichnis: alle deutschen Orte ab 1.000 Einwohnern, kleinere Orte und Ortsteile aus dem Postleitzahlenverzeichnis (zusammen rund 15.000), alle Postleitzahlen, Bundesländer, bekannte Regionen (Allgäu, Ruhrgebiet, Sylt …) und eine kleine Liste von Orten außerhalb Deutschlands. Schreibweisen wie „Muenchen“, „Frankfurt a.M.“ oder „St. Ingbert“ werden erkannt. Bei gleichnamigen Orten gewinnt ein deutlich größerer Ort („Frankfurt“ → Frankfurt am Main), sonst landet die Angabe mit Auswahl in der Prüfliste; Zusätze wie „in Sachsen“ oder „bei Coburg“ grenzen ein. Wörter, die auch Orte sind („Essen“), zählen nur mit Ortsbezug („aus Essen“) oder als alleinige Nachricht. Tippfehler werden vorgeschlagen, nie automatisch gesetzt. Eindeutige Orte werden bestätigt (optional automatisch). Pro Person zählt der zuletzt bestätigte Ort. Ausschnitte: Welt, Europa, D-A-CH, Deutschland (nur Deutschland mit Bundesländern, ohne Nachbarländer und Meer). Darstellung „Nur Umrisse“ zeigt nur Küsten und Grenzen ohne Hintergrund; die OBS-Ausgabe ist dann transparent (außer bei `hintergrund=dunkel` in der Adresse).
- **Umfrage:** Gültig ist genau eine Kennung (A, B … oder 1, 2 …) oder genau der Antworttext. „eher B“ oder „B oder C“ gehen zur Prüfung. Pro Person zählt die zuletzt abgegebene gültige Antwort.
- **Darstellung für OBS (Weltkarte, Umfrage, Wortwolke):** Unter jeder Grafik im Bereich „Aussehen“ mit Live-Vorschau im 16:9-Format: Vorlagen (Dunkel, Hell, Glas, Ohne Box, Akzent), Platzierung der Einblendung (3 × 3 Raster, Breite, Höhe, Randabstand), Box (Hintergrund, Deckkraft, Rahmen, Ecken, Schatten, Innenabstand), Text (Schrift, Größe, Farben, eigener Titel, Ausrichtung, Zusatzzeile), Vollbild-Hintergrund sowie Grafik-eigene Optionen: Karte (Farben für Länder, Meer, Grenzen, Punkte, Ortsnamen; Punktgröße), Umfrage (Balkenfarben, bunt, Sortierung, Prozent/Stimmen/Kennungen, Balkenstärke), Wortwolke (Farbmodus, Anzahl, Größen, Abstand, Schriftstärke, Großbuchstaben). Wird mit der Veranstaltung gespeichert.
- **Umfrage:** Darstellung als Balken, Säulen, Ring, Torte oder Kacheln. Umfrage-Vorlagen speichern Frage, Antworten, Kennungen und Darstellung; laden lässt sich eine Vorlage auf der Umfrage-Seite (mit Rückfrage, wenn schon abgestimmt wird) oder beim Anlegen einer neuen Frage.
- **Vorlagen und Zurücksetzen:** Jede Gestaltung (Chat-Highlight, Umfrage, Weltkarte, Wortwolke) hat „Auf Standard zurücksetzen“, die Abschnitte der Darstellung zusätzlich je einen eigenen. „Aktuelles Aussehen als Vorlage speichern“ legt eigene Vorlagen an (gleicher Name überschreibt); in der Übersicht gibt es Design-Vorlagen für alle vier Grafiken zusammen. Vorlagen liegen in `daten/vorlagen.json` und bleiben auch bei einer neuen Veranstaltung erhalten.
- **Chat-Highlight:** Aussehen frei einstellbar (Vorlagen, Farben für Hintergrund, Text, Akzent und Name, Deckkraft, Schriftgröße, Schriftart, Ecken, Position links/Mitte/rechts, Überschrift, Name und Uhrzeit ein/aus). Gilt für App, Präsentation und OBS und wird mit der Veranstaltung gespeichert.
- **Wortwolke:** Jeder Begriff zählt pro Nachricht einmal; Filter für Füllwörter, Kurzwörter, unangemessene Begriffe und Umfrage-Stimmen.
- **Glücksrad:** Felder sind entweder alle Namen, die seit dem Start im Chat geschrieben haben (ohne Team-Namen, optional nur mit einem
  Stichwort wie „dabei“), oder eine eigene Liste (auch als Vorlage speicherbar). „Drehen“ (Taste D, Stream Deck `rad-drehen`) wählt
  zufällig, blendet das Rad ins Programm und zeigt danach den Namen groß. Alle Ausgaben drehen gleich, weil Gewinner und Winkel beim
  Drehen festgelegt werden. „Gewählte aus dem Rad nehmen“ nimmt den Namen beim nächsten Drehen heraus; einzelne Namen lassen sich per
  Klick heraus- und wieder hineinnehmen. Aussehen: Farben der Felder (bunt, zwei Farben, eine Farbe), Rand, Zeiger, Namensfeld.
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

- Ortsverzeichnis Deutschland: [GeoNames](https://www.geonames.org) (CC BY 4.0), erzeugt mit `node scripts/generate-places-de.mjs <cities.pbf> <zipcodes.de.csv>` aus dem npm-Paket `all-the-cities` und den Postleitzahlen von `zauberware/postal-codes-json-xml-csv` (beide aus GeoNames).
- Kartendaten: [Natural Earth](https://www.naturalearthdata.com) (gemeinfrei) über `world-atlas`; Bundesländer aus Natural Earth Admin 1 (`scripts/data/de-bundeslaender.geojson`).
- Schriften: Barlow, Barlow Semi Condensed, IBM Plex Mono (SIL Open Font License), lokal eingebunden.
- Symbole: Lucide (ISC). WebSocket: `ws` (MIT).
- Zoom Meeting SDK für Web (`@zoom/meetingsdk`), es gelten die Nutzungsbedingungen von Zoom.
- Personen und Inhalte der Beispieldaten sind erfunden.

## Hauptseite (meetingbackstage.de)

Im Web-Modus liefert der Server auch die Hauptseite aus (Anfragen an `MB_MAIN_DOMAIN`, sonst die Studio-Adresse ohne `studio.`).
Bearbeitet wird sie in der Verwaltung unter **Website**: Seiten aus Abschnitten (Blöcken), Texteditor, Bilder (im Browser verkleinert),
Favicon, SEO je Seite, Menü und Fußzeile, Entwurf mit Vorschau, Veröffentlichen und frühere Fassungen.

- `server/website/render.mjs` – Blöcke → HTML, strenger HTML-Filter (sanitize-html), Symbole, Sitemap, robots.txt
- `server/website/store.mjs` – Entwurf, veröffentlichter Stand, Versionen, Mediathek (`DATA_DIR/website/`)
- `src/web/website/` – Bearbeitungsoberfläche (Tiptap als Texteditor)
- `website/inhalt-start.json` – Inhalt beim ersten Start, `website/assets/` – Stil, Schrift (Urbanist), Logos, unter `/_web/`
- `npm run website` – Startinhalt als statische Vorschau nach `website/dist`

## MeetingBackstage Slides

Folien für OBS mit fester Adresse, unabhängig von Zoom. Editor auf `slide.<Hauptdomain>` (lokal unter `/folien`), im Studio die Kategorie „Slides“.

- `server/slides.mjs` – Folien je Konto, Kanal („auf Sendung“), Medien-Upload als Datenstrom mit Grenzen und Prüfung des Dateityps, Live-Aktualisierung per Server-Sent Events
- `src/slides/` – Datenmodell, Darstellung (`SlideRender.tsx`), OBS-Seite (`ausgabe.tsx`, `folie.html`), Editor (`Editor.tsx`, `Canvas.tsx`, `Inspector.tsx`)
- Öffentliche Adressen: `/s/<key>`, `/kanal/<key>` (je `.json` und `/live`), Medien unter `/m/<name>` mit Bereichsanfragen
- Schriften (frei lizenziert) in `public/folien-schriften/`
