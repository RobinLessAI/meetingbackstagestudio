// Beim Start des Servers: Antworten der letzten Sitzung entfernen, Einstellungen behalten.
//
// Entfernt werden Chat-Nachrichten und alles, was daraus entstanden ist (Orte, Stimmen,
// ausgeblendete Begriffe, gewähltes Highlight, eingeblendete Grafik). Erhalten bleiben
// Titel, Team-Namen, Fragen, Umfrage-Antworten, Kartenausschnitt, Aussehen und Vorlagen.

export function resetAnswers(state, now = Date.now()) {
  if (!state || typeof state !== 'object') return state;
  const collect = (w) => (w ? { ...w, status: 'laeuft', startedAt: now, pausedAt: null, gaps: [] } : w);
  return {
    ...state,
    chat: [],
    highlightId: null,
    program: { graphic: null, reaction: null },
    log: [],
    joinCursor: 0,
    spotlight: [],
    muteAll: null,
    map: state.map ? { ...collect(state.map), decisions: {}, flagged: [] } : state.map,
    cloud: state.cloud ? { ...collect(state.cloud), hidden: [] } : state.cloud,
    poll: state.poll ? { ...state.poll, status: 'entwurf', startedAt: null, closedAt: null, gaps: [], decisions: {} } : state.poll,
    session: state.session ? { ...state.session, startedAt: now, endedAt: null, status: 'laeuft' } : state.session,
  };
}
