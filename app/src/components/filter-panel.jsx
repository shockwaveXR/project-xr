import { useEffect, useState } from 'react';
import { useTypes } from '../hooks/use-pokemon';
import { useRetroSprites } from '../hooks/use-retro-sprites';
import { useBodyScrollLock } from '../hooks/use-body-scroll-lock';
import { STORAGE_KEYS, getBool, setBool } from '../utils/storage';

const GENERATIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// the `cls` URL param holds a single category-style filter. it's split
// across three dropdowns (categories / regionals / forms) so each select
// shows a semantically coherent slice. only one value can be active at
// any time — picking from one dropdown clears the others. each list's
// "all" entry maps back to `cls = undefined`.
const CATEGORIES = [
  { value: 'legendary',        label: 'legendary' },
  { value: 'mythical',         label: 'mythical' },
  { value: 'ultra-beast',      label: 'ultra beast' },
  { value: 'paradox',          label: 'paradox' },
  { value: 'pseudo-legendary', label: 'pseudo-legendary' },
  { value: 'baby',             label: 'baby' },
  { value: 'starter',          label: 'starter' },
];
const REGIONALS = [
  // "all regionals" surfaces any species with at least one regional
  // form, regardless of which region — sits at the top of the list
  // since it's the umbrella option and reads naturally above the
  // region-specific entries.
  { value: 'has-regional',     label: 'all regionals' },
  { value: 'regional-alola',   label: 'alolan' },
  { value: 'regional-galar',   label: 'galarian' },
  { value: 'regional-hisui',   label: 'hisuian' },
  { value: 'regional-paldea',  label: 'paldean' },
];
const FORMS = [
  { value: 'has-mega',         label: 'has mega' },
  { value: 'has-gmax',         label: 'has gigantamax' },
];
const CATEGORY_VALUES  = new Set(CATEGORIES.map(o => o.value));
const REGIONAL_VALUES  = new Set(REGIONALS.map(o => o.value));
const FORM_VALUES      = new Set(FORMS.map(o => o.value));
// disabled `__sep__` option renders as a horizontal-bar string in the
// native dropdown — works as a visual separator across browsers without
// needing <hr> (not universally supported inside <select> yet) or the
// extra heading row that <optgroup> would inject. user can't pick it
// because of the disabled attribute on the rendered <option>.
const SORT_OPTIONS = [
  { value: 'id',               label: 'number' },
  { value: 'name',             label: 'name' },
  { value: 'total',            label: 'stat total' },
  { value: 'random',           label: 'random' },
  { value: '__sep__',          label: '──────────',           disabled: true },
  { value: 'hp',               label: 'hp' },
  { value: 'attack',           label: 'attack' },
  { value: 'defense',          label: 'defense' },
  { value: 'special-attack',   label: 'sp. atk' },
  { value: 'special-defense',  label: 'sp. def' },
  { value: 'speed',            label: 'speed' },
];

// fresh uint32 seed for the deterministic 'random' sort. handed to the URL
// (filters.randomSeed) so the order survives re-renders, show-more, and
// route round-trips; clicking the reshuffle button regenerates it.
function genRandomSeed() {
  return Math.floor(Math.random() * 0xffffffff);
}

export default function FilterPanel({ filters, onChange, shiny, onShinyToggle, inlineForms = '', onInlineFormsChange }) {
  const types = useTypes();
  const { retro, setRetro } = useRetroSprites();
  // mobile-only collapsed/expanded state. on desktop the panel always renders
  // its controls (the toggle header is hidden via css), so this state only
  // matters at narrow viewports. persisted so the user's preference survives
  // a reload.
  const [mobileOpen, setMobileOpen] = useState(() => getBool(STORAGE_KEYS.FILTERS_OPEN, false));
  const toggleMobile = () => setMobileOpen(v => { setBool(STORAGE_KEYS.FILTERS_OPEN, !v); return !v; });

  // track whether we're at the mobile breakpoint so the scroll lock below
  // only engages when the panel is actually presented as a collapsible
  // overlay (desktop renders the full panel inline as a sidebar — locking
  // there would freeze the page for no visible reason).
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(max-width: 640px)').matches
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(max-width: 640px)');
    const handler = () => setIsMobile(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // while the expanded panel is showing on mobile, freeze .app-scroll so
  // finger swipes inside the panel don't chain through to the page scroll
  // beneath. matches the lock pattern used by the header dropdowns.
  useBodyScrollLock(mobileOpen && isMobile);

  // small badge that appears in the mobile toggle header when one or more
  // filters / sort overrides are active. gives the user a glanceable cue
  // that the panel below is currently narrowing or reordering the grid
  // even while it's collapsed.
  const activeCount =
    (filters.generation ? 1 : 0) +
    (filters.type       ? 1 : 0) +
    (filters.cls        ? 1 : 0) +
    (filters.sort && filters.sort !== 'id' ? 1 : 0) +
    (filters.sortDir === 'desc' ? 1 : 0) +
    (shiny ? 1 : 0) +
    (retro ? 1 : 0) +
    (inlineForms ? 1 : 0);

  const update = (key, value) => onChange({ ...filters, [key]: value || undefined });
  const sort    = filters.sort    || 'id';
  const sortDir = filters.sortDir || 'asc';

  // toggle = the universal sliding-pill on/off control. previously this
  // panel used outlined "chips" that flipped fill color to indicate state,
  // but at a glance the active/inactive treatments still looked too
  // similar — a sliding thumb removes any ambiguity (off = thumb left
  // over a muted pill, on = thumb right over an accent pill).
  const Toggle = ({ active, onClick, children, title }) => (
    <button
      type="button"
      className={`filter-toggle${active ? ' is-active' : ''}`}
      onClick={onClick}
      title={title}
      aria-pressed={!!active}
    >
      <span className="filter-toggle__switch" aria-hidden="true" />
      <span className="filter-toggle__label">{children}</span>
    </button>
  );

  return (
    <aside className={`filter-panel${mobileOpen ? ' is-mobile-open' : ''}`}>
      {/* mobile-only collapse/expand header. hidden on desktop where the
          panel is always fully expanded as a left sidebar. */}
      <button
        type="button"
        className={`filter-panel__toggle${mobileOpen ? ' is-open' : ''}`}
        onClick={toggleMobile}
        aria-expanded={mobileOpen}
        aria-controls="filter-panel-body"
      >
        <span>filters{activeCount > 0 && <span className="filter-panel__toggle-count">{activeCount}</span>}</span>
        <span className="filter-panel__toggle-chevron" aria-hidden="true">›</span>
      </button>

      <div id="filter-panel-body" className="filter-panel__body">
      {/* ─── filters: narrow the visible set ─────────────────────────── */}
      <div className="filter-panel__group">
        <span className="filter-panel__label">filters</span>
        <select value={filters.generation || ''} onChange={e => update('generation', e.target.value)}>
          <option value="">all generations</option>
          {GENERATIONS.map(g => <option key={g} value={g}>gen {g}</option>)}
        </select>

        <select value={filters.type || ''} onChange={e => update('type', e.target.value)}>
          <option value="">all types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* category / regional / form dropdowns all bind to the single
            `cls` filter — picking from any one clears the other two so
            we never present an impossible combination. */}
        <select
          value={CATEGORY_VALUES.has(filters.cls) ? filters.cls : ''}
          onChange={e => update('cls', e.target.value)}
        >
          <option value="">all categories</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>

        <select
          value={REGIONAL_VALUES.has(filters.cls) ? filters.cls : ''}
          onChange={e => update('cls', e.target.value)}
        >
          <option value="">all regions</option>
          {REGIONALS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>

        <select
          value={FORM_VALUES.has(filters.cls) ? filters.cls : ''}
          onChange={e => update('cls', e.target.value)}
        >
          <option value="">all forms</option>
          {FORMS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {/* ─── sort: how to order the visible set ──────────────────────── */}
      <div className="filter-panel__group">
        <span className="filter-panel__label">sort</span>
        {/* sort select + direction toggle merged into one box. select native
            dropdown chrome is suppressed via CSS (appearance: none) and the
            direction button is absolutely positioned on the right where the
            native caret used to live. */}
        <div className="sort-control">
          <select
            value={sort}
            onChange={e => {
              const next = e.target.value;
              // switching INTO random mints a fresh seed; otherwise the
              // URL would carry an empty randomSeed and seededShuffle
              // would fall back to seed=1 (boring same-every-time order).
              const patch = next === 'random'
                ? { sort: next, randomSeed: String(genRandomSeed()) }
                : { sort: next };
              // leaving random clears the seed so the URL doesn't carry
              // a stale param around when it no longer matters.
              if (sort === 'random' && next !== 'random') patch.randomSeed = undefined;
              onChange({ ...filters, ...patch });
            }}
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
            ))}
          </select>
          {sort === 'random' ? (
            <button
              type="button"
              className="sort-control__direction"
              onClick={() => onChange({ ...filters, randomSeed: String(genRandomSeed()) })}
              aria-label="reshuffle"
              title="reshuffle"
            >
              ⟳
            </button>
          ) : (
            <button
              type="button"
              className="sort-control__direction"
              onClick={() => onChange({ ...filters, sortDir: sortDir === 'asc' ? 'desc' : 'asc' })}
              aria-label={`sort ${sortDir === 'asc' ? 'ascending — tap to switch to descending' : 'descending — tap to switch to ascending'}`}
            >
              {sortDir === 'asc' ? '↑' : '↓'}
            </button>
          )}
        </div>
      </div>

      {/* ─── display: how to render each card ────────────────────────── */}
      <div className="filter-panel__group">
        <span className="filter-panel__label">display</span>
        {/* shiny art and retro art are mutually exclusive — turning either
            on flips the other off in the same click. there's no curated
            shiny variant in the retro set, and falling back to official
            shiny art alongside retro normals would mix art styles. */}
        <Toggle
          active={shiny}
          onClick={() => {
            if (retro) setRetro(false);
            onShinyToggle();
          }}
          title="show shiny color variants instead of normal art"
        >
          shiny art
        </Toggle>
        <Toggle
          active={retro}
          onClick={() => {
            if (shiny) onShinyToggle();
            setRetro(v => !v);
          }}
          title="render gen-2 pixel sprites instead of official artwork"
        >
          retro art
        </Toggle>
        {onInlineFormsChange && (
          <>
            <Toggle
              active={inlineForms === 'regional'}
              onClick={() => onInlineFormsChange(inlineForms === 'regional' ? '' : 'regional')}
              title="show regional form variants (alolan, galarian, hisuian, paldean) as their own grid cards"
            >
              inline regional forms
            </Toggle>
            <Toggle
              active={inlineForms === 'all'}
              onClick={() => onInlineFormsChange(inlineForms === 'all' ? '' : 'all')}
              title="show every form variant (mega, gmax, regional, alt) as its own grid card"
            >
              inline all forms
            </Toggle>
          </>
        )}
      </div>

      {/* zero-height row break — only renders on mobile (CSS) where the
          filter-panel is a flex-wrap row. forces reset onto its own line. */}
      <span className="filter-panel__break" aria-hidden="true" />

      <button className="reset-btn" onClick={() => {
        onChange({});
        if (shiny) onShinyToggle();
        if (retro) setRetro(false);
        if (inlineForms && onInlineFormsChange) onInlineFormsChange('');
      }}>reset</button>
      </div>
    </aside>
  );
}
