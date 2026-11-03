// Integrationskatalog: was der Prototyp heute tut und was eine echte
// Anbindung voraussetzen würde. Die Angaben sind vor einer Umsetzung mit
// der jeweils aktuellen Herstellerdokumentation zu prüfen.

export type IntegrationId = 'zoom' | 'streamdeck' | 'osc' | 'ndi' | 'srt' | 'sdi' | 'audio';

export interface Integration {
  id: IntegrationId;
  name: string;
  category: string;
  status: 'nicht-verbunden' | 'demo';
  summary: string;
  today: string[];
  requires: Array<{ label: string; text: string }>;
  questions: string[];
}

export const INTEGRATIONS: Integration[] = [
  {
    id: 'zoom',
    name: 'Zoom Meetings',
    category: 'Konferenzplattform',
    status: 'demo',
    summary:
      'Der Chat kommt live über Zoom Realtime Media Streams (RTMS), Einrichtung oben. Teilnehmerliste, Handzeichen, Spotlight und Stummschalten sind weiterhin simuliert.',
    today: [
      'Live: Chat-Nachrichten aus dem laufenden Meeting über RTMS, sobald die Zoom-App eingerichtet ist.',
      'Simuliert: Teilnehmende, Handzeichen, Sprecherstatus, Spotlight und „Alle stummschalten“.',
      'Grafiken gehen über die OBS-Adressen hinaus, nicht in Zoom selbst.',
    ],
    requires: [
      {
        label: 'Live-Chat (eingebaut)',
        text: 'Zoom General App (vom Nutzer verwaltet) mit RTMS, Ereignissen meeting.rtms_started und meeting.rtms_stopped sowie dem Bereich meeting:read:meeting_chat. RTMS muss für das Konto freigeschaltet sein; Zoom vergibt den Zugang auf Anfrage.',
      },
      {
        label: 'Erreichbarkeit',
        text: 'Zoom meldet den Meeting-Start an eine öffentliche HTTPS-Adresse. Für den eigenen Rechner reicht ein Tunnel, z. B. ngrok mit fester Adresse oder Cloudflare Tunnel.',
      },
      {
        label: 'Steuerung (später)',
        text: 'Spotlight, „Alle stummschalten“ und Handzeichen mit Uhrzeit bietet eine Zoom App, die direkt in deinem Zoom-Client läuft (Zoom Apps SDK). Ein eigener Bot-Teilnehmer über das Meeting SDK ist laut Zoom nicht vorgesehen.',
      },
    ],
    questions: [
      'Ist RTMS für dein Zoom-Konto freigeschaltet?',
      'Wie werden Teilnehmende über die Auswertung des Chats informiert?',
      'Sollen später auch Webinare unterstützt werden (eigene Ereignisse webinar.rtms_started)?',
    ],
  },
  {
    id: 'streamdeck',
    name: 'Stream Deck und Controller',
    category: 'Bedienhardware',
    status: 'demo',
    summary:
      'Die Tastenfeld-Vorschau im Steuerpult zeigt die geplante Belegung. Ein angeschlossenes Gerät wird nicht angesprochen.',
    today: [
      'Tasten in der Vorschau lösen dieselben Aktionen aus wie das Steuerpult.',
      'Personen mit gehobener Hand belegen die Tasten in der Reihenfolge ihres Handzeichens.',
    ],
    requires: [
      {
        label: 'Unterstützte Erweiterung',
        text: 'Ein Plugin auf Basis des offiziellen Stream Deck SDK (läuft in der Stream-Deck-Software auf Windows oder macOS) oder eine Controller-Software wie Bitfocus Companion.',
      },
      {
        label: 'Lokale Verbindung',
        text: 'Das Plugin spricht mit dieser App über eine lokale Schnittstelle, zum Beispiel WebSocket oder HTTP auf demselben Rechner.',
      },
      {
        label: 'Alternative im Browser',
        text: 'Chromium-Browser können Geräte per WebHID direkt ansprechen. Das erfordert eine Freigabe durch die Person am Rechner und funktioniert nicht in allen Browsern.',
      },
      { label: 'Hardware', text: 'Ein Stream Deck oder kompatibles Tastenfeld.' },
    ],
    questions: ['Welches Modell (6, 15 oder 32 Tasten) wird eingesetzt?', 'Bedient eine Person allein oder ein Team mit mehreren Geräten?'],
  },
  {
    id: 'osc',
    name: 'OSC',
    category: 'Steuerprotokoll',
    status: 'nicht-verbunden',
    summary: 'Open Sound Control ist ein Protokoll für Steuerbefehle zwischen Produktionswerkzeugen. Im Prototyp werden keine Befehle gesendet.',
    today: ['Aktionen sind als Befehle modelliert und könnten später auf OSC-Adressen abgebildet werden.'],
    requires: [
      {
        label: 'Lokaler Dienst',
        text: 'Browser können kein UDP senden. Nötig ist ein kleiner lokaler Dienst oder eine Desktop-App (z. B. mit Node.js oder Electron), der OSC empfängt und weitergibt.',
      },
      { label: 'Gegenstelle', text: 'Eine Software, die OSC versteht, z. B. Lichtpult, Audiomischer oder Videomischer.' },
    ],
    questions: ['Welche Geräte sollen gesteuert werden und welche OSC-Adressen nutzen sie?'],
  },
  {
    id: 'ndi',
    name: 'NDI',
    category: 'Video über Netzwerk',
    status: 'nicht-verbunden',
    summary: 'NDI überträgt Video im lokalen Netzwerk. Der Prototyp erzeugt keine Videosignale.',
    today: ['Die Galerie ist eine Vorschau in dieser App und wird nicht ausgegeben.'],
    requires: [
      { label: 'SDK und Lizenz', text: 'NDI SDK mit Lizenzbedingungen des Herstellers; für eigene Hardware das NDI Advanced SDK.' },
      { label: 'Desktop-App', text: 'Die Ausgabe muss in einer nativen Anwendung laufen. Ein Browser kann kein NDI senden.' },
      {
        label: 'Zoom',
        text: 'Je nach Kontotyp bietet der Zoom-Desktop-Client selbst eine NDI-Ausgabe einzelner Videobilder. Verfügbarkeit im Konto prüfen.',
      },
    ],
    questions: ['Wird NDI im Netzwerk bereits eingesetzt (Bandbreite, getrenntes Produktionsnetz)?'],
  },
  {
    id: 'srt',
    name: 'SRT',
    category: 'Streaming-Protokoll',
    status: 'nicht-verbunden',
    summary: 'SRT überträgt Video zuverlässig über das Internet, zum Beispiel an ein Streaming-Ziel. Im Prototyp gibt es keine Übertragung.',
    today: ['Es wird nichts gestreamt oder aufgezeichnet.'],
    requires: [
      { label: 'Encoder', text: 'Ein Software-Encoder (z. B. auf Basis von FFmpeg mit libsrt) oder ein Hardware-Encoder.' },
      { label: 'Ziel', text: 'Ein SRT-Empfänger mit Adresse, Port und ggf. Passphrase.' },
    ],
    questions: ['Wohin soll gestreamt werden, und gibt es Freigaben aller Beteiligten für eine Übertragung?'],
  },
  {
    id: 'sdi',
    name: 'SDI',
    category: 'Video über Kabel',
    status: 'nicht-verbunden',
    summary: 'SDI ist ein Kabelstandard für professionelle Videotechnik. Der Prototyp spricht keine Hardware an.',
    today: ['Keine Ausgabe an Videokarten.'],
    requires: [
      { label: 'Hardware', text: 'Eine Ein- und Ausgabekarte, z. B. von Blackmagic Design oder AJA, mit passenden Treibern.' },
      { label: 'Software', text: 'Eine native Anwendung mit dem SDK des Kartenherstellers.' },
    ],
    questions: ['Gibt es vor Ort eine Regie mit SDI-Infrastruktur?'],
  },
  {
    id: 'audio',
    name: 'Audiohardware und Dante',
    category: 'Audio',
    status: 'nicht-verbunden',
    summary: 'Audiopegel sind simuliert. Es werden keine Mikrofone oder Audiogeräte geöffnet.',
    today: ['Pegel folgen dem simulierten Mikrofon- und Sprecherstatus.'],
    requires: [
      { label: 'Echte Pegel im Browser', text: 'Web Audio mit Mikrofonfreigabe durch die Person am Rechner; gilt nur für lokale Eingänge.' },
      { label: 'Dante', text: 'Dante-fähige Geräte oder Dante Virtual Soundcard (lizenzpflichtig); die App sieht Dante dann als Audiogerät des Betriebssystems.' },
      { label: 'Audiointerface', text: 'Ein Interface mit Treibern für Core Audio (macOS) oder ASIO/WASAPI (Windows).' },
    ],
    questions: ['Wie wird der Ton im Seminarraum abgenommen und an Zoom übergeben?'],
  },
];

/** Geplante Stream-Deck-Belegung für die Detailansicht. */
export const STREAMDECK_MAPPING: Array<{ key: string; action: string; feedback: string }> = [
  { key: 'Tasten 1 bis 10', action: 'Personen mit gehobener Hand, älteste zuerst. Drücken setzt ins Spotlight, erneut drücken entfernt.', feedback: 'Name, Platz, Wartezeit; leuchtet bei Spotlight' },
  { key: 'Taste 11', action: 'Nächste Hand ins Spotlight', feedback: 'Name der zuerst wartenden Person' },
  { key: 'Taste 12', action: 'Spotlight leeren', feedback: 'Anzahl im Spotlight' },
  { key: 'Taste 13', action: 'Alle Teilnehmenden stummschalten (mit Bestätigung)', feedback: 'Leuchtet, solange aktiv' },
  { key: 'Taste 14', action: 'Galerie wechseln', feedback: 'Aktuelles Layout' },
  { key: 'Taste 15', action: 'Nächste Seite der Warteschlange', feedback: 'Seite x von y' },
];
