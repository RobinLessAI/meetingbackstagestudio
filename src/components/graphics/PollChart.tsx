import type { PollView } from '../../sync/snapshot.ts';
import type { PollState } from '../../state/types.ts';

const SHADES = ['#c9d0d8', '#8f99a5', '#6b7480', '#4d555f', '#b3bcc6', '#7c8691'];

/** Zeichnet Umfrage-Ergebnisse. Bekommt nur die aufbereiteten Daten, damit auch die OBS-Ausgabe sie nutzen kann. */
export function PollChart({
  data,
  variant = 'preview',
  chart,
}: {
  data: PollView;
  variant?: 'preview' | 'present' | 'overlay';
  chart?: PollState['chart'];
}) {
  const kind = chart ?? data.chart;
  const leaders = new Set(data.leaderIds);
  const analysis = data;

  if (data.kind === 'offen') {
    const answers = data.openAnswers.slice().reverse();
    const max = variant === 'present' ? 9 : variant === 'overlay' ? 4 : 6;
    return (
      <div className={`open-answers open-answers--${variant}`}>
        {answers.length === 0 ? (
          <p className="graphic-empty">Noch keine Antworten im Chat.</p>
        ) : (
          answers.slice(0, max).map((answer) => (
            <blockquote key={answer.id} className="open-answer">
              <p>{answer.text}</p>
              <cite>{answer.sender}</cite>
            </blockquote>
          ))
        )}
        {answers.length > max && <p className="open-answers__more">+{answers.length - max} weitere Antworten</p>}
      </div>
    );
  }

  if (kind === 'kreis') {
    const total = analysis.totalVotes;
    const R = 40;
    const C = 2 * Math.PI * R;
    let offset = 0;
    return (
      <div className={`poll-donut poll-donut--${variant}`}>
        <svg viewBox="0 0 100 100" role="img" aria-label={`Kreisdiagramm, ${total} Stimmen`}>
          <circle cx="50" cy="50" r={R} className="poll-donut__track" />
          {total > 0 &&
            analysis.totals.map((t, i) => {
              const len = (t.count / total) * C;
              const el = (
                <circle
                  key={t.option.id}
                  cx="50"
                  cy="50"
                  r={R}
                  fill="none"
                  stroke={leaders.has(t.option.id) ? 'var(--accent)' : SHADES[i % SHADES.length]}
                  strokeWidth="16"
                  strokeDasharray={`${Math.max(0, len - 0.6)} ${C}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 50 50)"
                />
              );
              offset += len;
              return el;
            })}
          <text x="50" y="47" textAnchor="middle" className="poll-donut__total">
            {total}
          </text>
          <text x="50" y="60" textAnchor="middle" className="poll-donut__unit">
            Stimmen
          </text>
        </svg>
        <ul className="poll-legend">
          {analysis.totals.map((t, i) => (
            <li key={t.option.id} className={leaders.has(t.option.id) ? 'is-leader' : ''}>
              <span
                className="poll-legend__swatch"
                style={{ background: leaders.has(t.option.id) ? 'var(--accent)' : SHADES[i % SHADES.length] }}
              />
              <span className="poll-key">{t.key}</span>
              <span className="poll-legend__text">{t.option.text}</span>
              <span className="poll-legend__val tabular">
                {t.count} · {t.pct} %
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <ol className={`poll-bars poll-bars--${variant}`} aria-label="Ergebnisse als Balkendiagramm">
      {analysis.totals.map((t) => (
        <li key={t.option.id} className={`poll-bar${leaders.has(t.option.id) ? ' is-leader' : ''}`}>
          <div className="poll-bar__label">
            <span className="poll-key">{t.key}</span>
            <span className="poll-bar__text">{t.option.text}</span>
            <span className="poll-bar__val tabular">
              <strong>{t.pct} %</strong>
              <span className="poll-bar__count">
                {t.count} {t.count === 1 ? 'Stimme' : 'Stimmen'}
              </span>
            </span>
          </div>
          <div className="poll-bar__track" aria-hidden>
            <div className="poll-bar__fill" style={{ width: `${t.pct}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}
