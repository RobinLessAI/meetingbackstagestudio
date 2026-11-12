// Regie-Fenster: tritt dem Zoom-Meeting über das Zoom Meeting SDK (Web, Client View)
// als „MeetingBackstage (Regie)“ bei und gibt jede Chat-Nachricht an den lokalen
// Server weiter. Das Fenster bleibt sichtbar und wird von dir bedient.
(function () {
  'use strict';

  /** Stand dieses Fensters; muss mit REGIE_STAND in server/server.mjs übereinstimmen. */
  const REGIE_STAND = 7;
  const params = new URLSearchParams(window.location.search);
  const ui = {
    box: document.getElementById('mb-regie'),
    status: document.getElementById('mb-status'),
    error: document.getElementById('mb-error'),
    retry: document.getElementById('mb-retry'),
  };
  let ws = null;
  let joined = false;
  let sdkReady = false;

  function show(text, error) {
    ui.box.hidden = false;
    const root = document.getElementById('zmmtg-root');
    if (root) root.style.display = 'none';
    ui.status.textContent = text;
    ui.error.hidden = !error;
    ui.error.textContent = error || '';
    ui.retry.hidden = !error;
  }

  /** Version unten im Fenster und im Fenstertitel anzeigen. */
  function showVersion(v) {
    const text = `MeetingBackstage ${v.app} · Zoom SDK ${v.sdk || '?'} · Regie-Fenster Stand ${REGIE_STAND}`;
    const el = document.getElementById('mb-version');
    if (el) el.textContent = text;
    document.title = `MeetingBackstage Regie · SDK ${v.sdk || '?'}`;
  }

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  function status(state, error) {
    send({ type: 'regie-status', state: state, error: error || null });
  }

  /** Häufige Fehler von Zoom verständlich erklären. */
  function explain(err) {
    const code = Number(err && (err.errorCode ?? err.code));
    const text = String((err && (err.errorMessage || err.reason || err.message)) || '').trim();
    const hints = {
      3712: 'Die Signatur wurde abgelehnt. Prüfe, ob in deiner Zoom-App das Meeting SDK eingeschaltet ist und Client-ID und Client-Geheimnis stimmen (lokal in .env.local, auf dem Server in /etc/meetingbackstage/studio.env).',
      3705: 'Die Signatur ist abgelaufen. Bitte erneut versuchen.',
      3004: 'Falscher Kenncode. Trage den Kenncode des Meetings in MeetingBackstage ein und öffne die Regie erneut.',
      3008: 'Das Meeting hat noch nicht begonnen. Starte zuerst das Meeting als Host.',
      3001: 'Meeting nicht gefunden. Prüfe Link oder Meeting-ID.',
      3707: 'Zoom findet diese Meeting-ID nicht. Kopiere den Link des laufenden Meetings neu (in Zoom: Info-Symbol oben links → Link kopieren) und ersetze damit den alten Eintrag. Gehört das Meeting zu einem anderen Zoom-Konto als die Zoom-App im Marketplace, lehnt Zoom den Beitritt ebenfalls so ab.',
      3000: 'Zoom hat den Beitritt abgelehnt.',
      63: 'Die Zoom-App darf nur Meetings deines eigenen Zoom-Kontos betreten. Ist das Meeting von deinem Konto?',
      4011: 'Zoom erlaubt der Regie noch keine Meetings anderer Zoom-Konten. Das geht erst, wenn die MeetingBackstage-App im Zoom Marketplace freigegeben ist.',
      4012: 'Für dieses Meeting braucht die Regie die Erlaubnis deines Zoom-Kontos. Verbinde in MeetingBackstage unter „Meeting“ dein Zoom-Konto und öffne die Regie erneut.',
      4013: 'Die Zoom-Erlaubnis fehlt oder ist abgelaufen. Bist du selbst mit dem verbundenen Zoom-Konto im Meeting? Dann die Regie erneut öffnen.',
    };
    const notInMeeting = /AUTHORIZED_USER|user.*not.*in.*meeting/i.test(text)
      ? 'Die Regie darf erst hinein, wenn du selbst mit deinem verbundenen Zoom-Konto im Meeting bist. Tritt zuerst bei, dann die Regie erneut öffnen.'
      : '';
    const hint =
      notInMeeting ||
      hints[code] ||
      'Prüfe: Läuft das Meeting schon, gehört es zu deinem eigenen Zoom-Konto, und ist in deiner Zoom-App das Meeting SDK eingeschaltet?';
    return [hint, text && text !== hint ? `Zoom: ${text}${code ? ` (${code})` : ''}` : code ? `Fehlercode ${code}` : ''].filter(Boolean).join(' ');
  }

  function safeData(data) {
    try {
      return JSON.parse(JSON.stringify(data));
    } catch (e) {
      return { text: String(data && data.message) };
    }
  }

  /** Zoom SDK und seine React-/Redux-Dateien aus /zoom-sdk/<version>/ nacheinander laden. */
  // ------------------------------------------------ Teilnehmende und Spotlight

  /** SDK-Aufruf mit success/error als Promise (manche Aufrufe liefern auch direkt ein Ergebnis). */
  function callZ(name, args) {
    return new Promise(function (resolve, reject) {
      const Z = window.ZoomMtg;
      if (!Z || typeof Z[name] !== 'function') {
        reject(new Error(name + ' gibt es in dieser SDK-Version nicht'));
        return;
      }
      let done = false;
      const ok = function (res) {
        if (!done) {
          done = true;
          resolve(res);
        }
      };
      const fail = function (err) {
        if (!done) {
          done = true;
          reject(err);
        }
      };
      try {
        const ret = Z[name](Object.assign({}, args || {}, { success: ok, error: fail }));
        if (ret && typeof ret.then === 'function') ret.then(ok, fail);
        else if (ret !== undefined) setTimeout(function () { ok(ret); }, 0);
      } catch (e) {
        fail(e);
      }
      setTimeout(function () { fail(new Error(name + ': keine Antwort')); }, 8000);
    });
  }

  /** Eine Zahlenliste aus beliebig verpackten Ergebnissen holen. */
  function idList(res) {
    const cands = [res, res && res.result, res && res.result && res.result.spotlightList, res && res.spotlightList, res && res.result && res.result.userIds];
    for (let i = 0; i < cands.length; i++) if (Array.isArray(cands[i])) return cands[i].map(function (x) { return Number(x && typeof x === 'object' ? x.userId : x); }).filter(function (n) { return !isNaN(n); });
    return [];
  }

  let peopleTimer = null;
  let peopleBusy = false;
  function refreshPeople() {
    if (!joined || peopleBusy) return;
    peopleBusy = true;
    Promise.all([
      callZ('getAttendeeslist', {}).then(function (r) { return (r && r.result && r.result.attendeesList) || (r && r.attendeesList) || []; }),
      callZ('getCurrentUser', {}).then(function (r) { return (r && r.result && r.result.currentUser) || (r && r.currentUser) || null; }).catch(function () { return null; }),
      callZ('getSpotlightList', {}).then(idList).catch(function () { return null; }),
    ])
      .then(function (r) {
        send({ type: 'regie-teilnehmende', list: safeData(r[0]), self: safeData(r[1]), spotlight: r[2] });
      })
      .catch(function (e) {
        send({ type: 'regie-log', text: 'Teilnehmerliste nicht lesbar: ' + (e && (e.reason || e.message || JSON.stringify(e))) });
      })
      .then(function () { peopleBusy = false; });
  }
  function schedulePeople(ms) {
    clearTimeout(peopleTimer);
    peopleTimer = setTimeout(refreshPeople, ms === undefined ? 400 : ms);
  }

  /** Befehle von MeetingBackstage an Zoom (nur als Host oder Co-Host möglich). */
  function runCommand(msg) {
    if (msg.type === 'regie-leave' && window.ZoomMtg) {
      window.ZoomMtg.leaveMeeting({});
      return true;
    }
    if (msg.type !== 'regie-spotlight') return false;
    const ops = Array.isArray(msg.ops) ? msg.ops : [];
    let chain = Promise.resolve();
    ops.forEach(function (op) {
      chain = chain.then(function () { return callZ('operateSpotlight', { operate: op.operate, userId: Number(op.userId) }); });
    });
    chain
      .then(function () {
        send({ type: 'regie-ergebnis', requestId: msg.requestId, ok: true });
      })
      .catch(function (err) {
        const text = String((err && (err.errorMessage || err.reason || err.message)) || '').trim();
        const code = err && (err.errorCode !== undefined ? err.errorCode : err.code);
        send({ type: 'regie-ergebnis', requestId: msg.requestId, ok: false, error: text || 'unbekannt', code: code === undefined ? null : code, raw: safeData(err) });
      })
      .then(function () { schedulePeople(300); });
    return true;
  }

  function loadSdk(version) {
    if (window.ZoomMtg) return Promise.resolve();
    const base = `/zoom-sdk/${version}`;
    const files = [
      'lib/vendor/react.min.js',
      'lib/vendor/react-dom.min.js',
      'lib/vendor/redux.min.js',
      'lib/vendor/redux-thunk.min.js',
      'lib/vendor/react-redux.min.js',
      'lib/vendor/lodash.min.js',
      'zoom-meeting.min.js',
    ];
    return files.reduce(
      (chain, file) =>
        chain.then(
          () =>
            new Promise((resolve, reject) => {
              const s = document.createElement('script');
              s.src = `${base}/${file}`;
              s.onload = () => resolve();
              s.onerror = () => reject(new Error(`${file} nicht gefunden`));
              document.body.appendChild(s);
            }),
        ),
      Promise.resolve(),
    );
  }

  let sdkVersion = '';

  function initSdk(join) {
    const Z = window.ZoomMtg;
    if (!Z) {
      show('Zoom konnte nicht geladen werden.', 'Das Zoom Meeting SDK fehlt. Bitte im Terminal „npm install“ ausführen und den Server neu starten.');
      status('fehler', 'Zoom Meeting SDK konnte im Regie-Fenster nicht geladen werden.');
      return;
    }
    show('Verbinde mit dem Meeting …');
    try {
      Z.setZoomJSLib(`${window.location.origin}/zoom-sdk/${sdkVersion}/lib`, '/av');
      if (!sdkReady) {
        Z.preLoadWasm();
        Z.prepareWebSDK();
      }
      try {
        Z.i18n.load('de-DE');
      } catch (e) {
        /* Sprache ist optional */
      }
    } catch (e) {
      send({ type: 'regie-log', text: `Vorbereitung: ${e && e.message}` });
    }

    Z.init({
      leaveUrl: window.location.origin + '/regie.html?verlassen=1',
      disableCORP: !window.crossOriginIsolated,
      // Audio/Video-Unterstützung muss an bleiben: Das SDK nutzt sie als Bedingung für die
      // aktuelle Chat-Verschlüsselung (AES-GCM). Ohne sie kommen Nachrichten nur als
      // „[This is an encrypted message]“ an. Mikrofon und Kamera werden trotzdem nicht genutzt.
      isSupportAV: true,
      disableJoinAudio: true,
      audioPanelAlwaysOpen: false,
      disablePreview: true,
      disableInvite: true,
      disableRecord: true,
      disableCallOut: true,
      isSupportPolling: false,
      isSupportBreakout: false,
      isSupportQA: false,
      screenShare: false,
      leaveOnPageUnload: true,
      isShowJoiningErrorDialog: false,
      theme: 'dark',
      success: function () {
        // Für die Fehlersuche: SDK-Version und Browser ins Terminal schreiben.
        try {
          send({ type: 'regie-log', text: `Zoom Web SDK ${Z.getWebSDKVersion ? JSON.stringify(Z.getWebSDKVersion()) : '?'} · ${navigator.userAgent}` });
        } catch (e) {
          /* nur Hinweis */
        }
        if (!sdkReady) {
          sdkReady = true;
          Z.inMeetingServiceListener('onReceiveChatMsg', function (data) {
            send({ type: 'regie-chat', data: safeData(data) });
          });
          // Eigene gesendete Nachrichten und Chat-Fehler ebenfalls protokollieren (Fehlersuche Verschlüsselung).
          try {
            Z.inMeetingServiceListener('onChatMsgSent', function (data) {
              send({ type: 'regie-log', text: `Chat gesendet: ${JSON.stringify(safeData(data)).slice(0, 300)}` });
            });
          } catch (e) {
            /* Ereignis gibt es nicht in jeder Version */
          }
          // Wer gerade spricht (Zoom meldet den bzw. die aktiven Sprecher bei jedem Wechsel).
          let lastSpeakers = '';
          try {
            Z.inMeetingServiceListener('onActiveSpeaker', function (data) {
              const list = (Array.isArray(data) ? data : [data]).map(function (x) { return Number(x && x.userId); }).filter(function (n) { return !isNaN(n); });
              const key = list.join(',');
              if (key === lastSpeakers) return;
              lastSpeakers = key;
              send({ type: 'regie-sprecher', userIds: list });
            });
          } catch (e) {
            /* Ereignis gibt es nicht in jeder Version */
          }
          ['onUserJoin', 'onUserLeave', 'onUserUpdate'].forEach(function (ev) {
            try {
              Z.inMeetingServiceListener(ev, function () { schedulePeople(); });
            } catch (e) {
              /* Ereignis gibt es nicht in jeder Version */
            }
          });
          // Sicherheitsnetz: regelmäßig neu lesen (Spotlight-Änderungen in Zoom melden nicht immer ein Ereignis).
          setInterval(function () { schedulePeople(0); }, 8000);
          Z.inMeetingServiceListener('onUserIsInWaitingRoom', function () {
            status('wartet');
          });
          Z.inMeetingServiceListener('onMeetingStatus', function (data) {
            const s = Number(data && data.meetingStatus);
            if (s === 2 && joined) status('verbunden');
            if (s === 3 && joined) {
              joined = false;
              status('bereit');
            }
          });
        }
        ui.box.hidden = true;
        const root = document.getElementById('zmmtg-root');
        if (root) root.style.display = 'block';
        Z.join({
          sdkKey: join.sdkKey,
          signature: join.signature,
          meetingNumber: join.meetingNumber,
          passWord: join.passWord || '',
          userName: join.userName,
          // Im Namen des verbundenen Zoom-Kontos (nötig für Meetings anderer Konten)
          ...(join.obfToken ? { obfToken: join.obfToken } : {}),
          success: function () {
            joined = true;
            status('verbunden');
            schedulePeople(1500);
          },
          error: function (err) {
            const message = [explain(err), join.obfProblem ? `Hinweis: ${join.obfProblem}` : ''].filter(Boolean).join(' ');
            show('Beitritt nicht möglich.', message);
            status('fehler', message);
          },
        });
      },
      error: function (err) {
        const message = explain(err) || 'Zoom konnte nicht gestartet werden.';
        show('Zoom konnte nicht gestartet werden.', message);
        status('fehler', message);
      },
    });
  }

  function connect() {
    if (params.get('verlassen')) {
      show('Du hast das Meeting verlassen. Das Fenster kann geschlossen werden.');
    } else if (!params.get('meeting')) {
      show('Kein Meeting angegeben.', 'Bitte das Regie-Fenster aus MeetingBackstage heraus öffnen.');
      return;
    }
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${window.location.host}/sync?rolle=regie`);
    ws.onopen = function () {
      if (params.get('verlassen')) return;
      send({ type: 'regie-hello', meeting: params.get('meeting'), passcode: params.get('kenncode') || '' });
    };
    ws.onmessage = function (e) {
      let msg;
      try {
        msg = JSON.parse(String(e.data));
      } catch (err) {
        return;
      }
      if (msg.version) showVersion(msg.version);
      if (msg.version && msg.version.regieStand !== REGIE_STAND) {
        show(
          'Veraltete Version im Browser-Zwischenspeicher.',
          'Bitte dieses Fenster mit cmd + shift + R neu laden (Windows: Strg + Umschalt + R). Danach „Regie beitreten“ erneut klicken.',
        );
        return;
      }
      if (msg.type === 'regie-join') {
        sdkVersion = (msg.version && msg.version.sdk) || '';
        show('Lade Zoom …');
        loadSdk(sdkVersion)
          .then(() => initSdk(msg.join))
          .catch((e) => {
            show('Zoom konnte nicht geladen werden.', `${e.message}. Bitte im Terminal „npm install“ ausführen und den Server neu starten.`);
            status('fehler', `Zoom Meeting SDK konnte nicht geladen werden (${e.message}).`);
          });
      }
      else if (msg.type === 'regie-error') show('Beitritt nicht möglich.', msg.message);
      else if (msg.type === 'regie-teilnehmende-lesen') schedulePeople(0);
      else runCommand(msg);
    };
    ws.onclose = function () {
      if (!joined) show('Keine Verbindung zu MeetingBackstage.', 'Läuft der Server noch („npm start“)? Dann dieses Fenster neu laden.');
      // Bei laufendem Meeting erneut verbinden, damit der Chat weiter ankommt.
      setTimeout(reconnect, 2000);
    };
  }

  function reconnect() {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    if (!joined) return;
    ws = new WebSocket(`${proto}://${window.location.host}/sync?rolle=regie`);
    ws.onopen = function () {
      status('verbunden');
    };
    ws.onclose = function () {
      setTimeout(reconnect, 2000);
    };
    ws.onmessage = function (e) {
      try {
        const msg = JSON.parse(String(e.data));
        if (msg.type === 'regie-teilnehmende-lesen') schedulePeople(0);
        else runCommand(msg);
      } catch (err) {
        /* ignorieren */
      }
    };
  }

  ui.retry.addEventListener('click', function () {
    window.location.reload();
  });
  connect();
})();
