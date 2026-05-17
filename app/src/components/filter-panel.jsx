import { useTypes } from '../hooks/use-pokemon';
import { useRetroSprites } from '../hooks/use-retro-sprites';

const GENERATIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const CLASSES = [
  { value: 'legendary',        label: 'legendary' },
  { value: 'mythical',         label: 'mythical' },
  { value: 'ultra-beast',      label: 'ultra beast' },
  { value: 'paradox',          label: 'paradox' },
  { value: 'pseudo-legendary', label: 'pseudo-legendary' },
  { value: 'baby',             label: 'baby' },
  { value: 'has-mega',         label: 'mega evolution' },
  { value: 'has-gmax',         label: 'gigantamax' },
  { value: 'has-regional',     label: 'regional variant' },
  { value: 'regional-alola',   label: 'alolan form' },
  { value: 'regional-galar',   label: 'galarian form' },
  { value: 'regional-hisui',   label: 'hisuian form' },
  { value: 'regional-paldea',  label: 'paldean form' },
  { value: 'has-forms',        label: 'has alternate forms' },
];
const SORT_OPTIONS = [
  { value: 'id',               label: 'number' },
  { value: 'name',             label: 'name' },
  { value: 'total',            label: 'total stats' },
  { value: 'hp',               label: 'hp' },
  { value: 'attack',           label: 'attack' },
  { value: 'defense',          label: 'defense' },
  { value: 'special-attack',   label: 'sp. atk' },
  { value: 'special-defense',  label: 'sp. def' },
  { value: 'speed',            label: 'speed' },
];

export default function FilterPanel({ filters, onChange, shiny, onShinyToggle, inlineForms = '', onInlineFormsChange }) {
  const types = useTypes();
  const { retro, setRetro } = useRetroSprites();

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
    <aside className="filter-panel">
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

        <select value={filters.cls || ''} onChange={e => update('cls', e.target.value)}>
          <option value="">all categories</option>
          {CLASSES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
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
            onChange={e => onChange({ ...filters, sort: e.target.value })}
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            type="button"
            className="sort-control__direction"
            onClick={() => onChange({ ...filters, sortDir: sortDir === 'asc' ? 'desc' : 'asc' })}
            aria-label={`sort ${sortDir === 'asc' ? 'ascending — tap to switch to descending' : 'descending — tap to switch to ascending'}`}
          >
            {sortDir === 'asc' ? '↑' : '↓'}
          </button>
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
    </aside>
  );
}
