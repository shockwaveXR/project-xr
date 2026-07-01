// ─── ChangelogPage ───────────────────────────────────────────────────────────
//
// on-site changelog at /changelog. reads the static app/src/data/changelog.json
// (generated from git history by scripts/gen-changelog.mjs) and renders
// date-segmented entries — a date header followed by a bulleted list of what
// shipped that day — newest-first, in the same line-segmented style as the
// news page.

import changelog from '../data/changelog.json';

// "jun 23, 2026" — lowercased to match the rest of the interface. the stored
// date is a bare YYYY-MM-DD; append a midday time so it parses in local time
// without a timezone roll-back shifting it to the previous day.
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d
    .toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    .toLowerCase();
}

export default function ChangelogPage() {
  return (
    <div className="changelog-page">
      <header className="changelog-page__header">
        <p className="changelog-page__sub">
          everything that's shipped, newest first — drawn straight from the project's commit history.
        </p>
      </header>

      {changelog.length === 0 ? (
        <p className="changelog-page__empty">no entries yet.</p>
      ) : (
        <div className="changelog-list">
          {changelog.map((entry, i) => (
            <div key={entry.date} className="changelog-list__item">
              {i > 0 && <hr className="news-divider" />}
              <article className="changelog-entry">
                <time className="changelog-entry__date" dateTime={entry.date}>
                  {formatDate(entry.date)}
                </time>
                <ul className="changelog-entry__list">
                  {entry.changes.map((change, j) => (
                    <li key={j} className="changelog-entry__item">{change}</li>
                  ))}
                </ul>
              </article>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
