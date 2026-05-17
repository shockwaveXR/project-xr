import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchAll } from '../utils/global-search';

// header-mounted search input. live-filters across every entity type (pokemon,
// abilities, moves, gym leaders, types, tcg pocket cards, berries, pokeballs)
// and shows a grouped dropdown of top hits. clicking a result navigates; Esc
// or outside-click closes. on mobile the dropdown grows to fill the viewport
// width while the input itself stays inline in the header.
export default function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // grouped results — memoized so re-renders during typing only recompute
  // when the query actually changes.
  const groups = useMemo(() => searchAll(query), [query]);

  // close on outside click. listening on mousedown rather than click avoids
  // the open-then-immediately-close race when a user clicks straight on a
  // dropdown result (the click would fire on a popup that's already gone).
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleResultClick = (entry) => {
    setOpen(false);
    setQuery('');
    // routeState is set for entries that open a modal on arrival (leaders,
    // tcgp cards) — same state.openId convention the destination pages
    // already understand for cross-page modal nav.
    navigate(entry.route, entry.routeState ? { state: entry.routeState } : undefined);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      e.currentTarget.blur();
    } else if (e.key === 'Enter') {
      // enter takes the user to the full search-results page; clicking an
      // individual dropdown entry still routes to that entity's destination.
      const q = query.trim();
      if (!q) return;
      setOpen(false);
      setQuery('');
      navigate(`/search?q=${encodeURIComponent(q)}`);
    }
  };

  return (
    <div className="global-search" ref={wrapRef}>
      <input
        type="text"
        className="global-search__input"
        placeholder="search…"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        aria-label="search site"
      />
      {open && query.trim().length > 0 && (
        <div className="global-search__dropdown" role="listbox">
          {groups.length === 0 ? (
            <div className="global-search__empty">no matches</div>
          ) : (
            groups.map((g) => (
              <div key={g.type} className="global-search__group">
                <div className="global-search__group-label">{g.label}</div>
                {g.results.map((entry) => (
                  <button
                    key={`${entry.type}-${entry.slug}`}
                    type="button"
                    className="global-search__result"
                    onClick={() => handleResultClick(entry)}
                  >
                    {entry.sprite && (
                      <img
                        src={entry.sprite}
                        alt=""
                        className="global-search__result-sprite"
                        loading="lazy"
                      />
                    )}
                    <span className="global-search__result-text">
                      <span className="global-search__result-name">{entry.displayName}</span>
                      {entry.subtitle && (
                        <span className="global-search__result-subtitle">{entry.subtitle}</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
