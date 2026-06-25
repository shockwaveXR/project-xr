import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useModalAnimation } from '../hooks/use-modal-animation';
import { useModalCycleNav } from '../hooks/use-modal-cycle-nav';
import { pulseElement } from '../utils/pulse';
import { STORAGE_KEYS, getString } from '../utils/storage';
import Img from '../components/img';
import TcgpJumpNav from '../components/tcgp-jump-nav';
import cards from '../data/tcg-pocket.json';

// flat list of sets in newest-first order. used by:
//   - the set filter dropdown (always shows sets in this order)
//   - the progressive disclosure path (default mode reveals one older set at
//     a time when groupBy === 'set' and no explicit set filter is active)
// label format `[CODE] Set Name` matches the dropdown rendering so the
// section heading and the filter pill stay in sync.
const SECTIONED_CARDS = (() => {
  const bySet = new Map();
  for (const c of cards) {
    if (!bySet.has(c.set)) {
      bySet.set(c.set, {
        slug: c.set,
        label: `[${c.set}] ${c.set_name}`,
        release: c.set_release,
        items: [],
      });
    }
    bySet.get(c.set).items.push(c);
  }
  return [...bySet.values()].sort((a, b) => b.release.localeCompare(a.release));
})();

// quick lookup of set→release used by the "card number" sort (which falls
// back to set release date when items span multiple sets, e.g. when grouping
// by rarity or with grouping off).
const SET_RELEASE = (() => {
  const m = new Map();
  for (const c of cards) m.set(c.set, c.set_release);
  return m;
})();

const RARITY_LABELS = {
  C:   'Common',         U:  'Uncommon',         R:  'Rare',
  RR:  'Double Rare',    AR: 'Art Rare',         SR: 'Super Rare',
  SAR: 'Special Art Rare', IM: 'Immersive Rare', UR: 'Crown Rare',
  S:   'Shiny',          SSR:'Shiny Super Rare',
};

// canonical orders for filter dropdown — rarity ascends from common to crown,
// element follows the energy-color sequence used everywhere in tcg pocket
// (fire→water→…) so the filter feels predictable.
const RARITY_ORDER  = ['C','U','R','RR','AR','SR','SAR','IM','UR','S','SSR'];
const ELEMENT_ORDER = ['fire','water','grass','lightning','psychic','fighting','darkness','metal','colorless','dragon','fairy'];

const RARITY_OPTIONS  = RARITY_ORDER.filter(r  => cards.some(c => c.rarity === r));
const ELEMENT_OPTIONS = ELEMENT_ORDER.filter(e => cards.some(c => c.element === e));

// attribute filter groups — second dropdown. options encode as `{group}:{value}`
// strings inside selectedAttrs so a single Set can hold a mix of categories.
// filter logic is AND across groups, OR within each group.
const ATTR_GROUPS = [
  {
    key:   'rarity',
    label: 'rarity',
    options: RARITY_OPTIONS.map(r => ({ value: r, label: `[${r}] ${RARITY_LABELS[r] || r}` })),
  },
  {
    key:   'element',
    label: 'type',
    options: ELEMENT_OPTIONS.map(e => ({ value: e, label: e })),
  },
  {
    key:   'special',
    label: 'tags',
    // ex / mega derived from card.name patterns (no explicit flag in the
    // scraped data). regex tightened in cardMatchesAttrs below.
    options: [
      { value: 'ex',   label: 'ex cards' },
      { value: 'mega', label: 'mega cards' },
    ],
  },
];

// matches a single card against the active attribute filter — AND across
// groups, OR inside each group. caller should short-circuit when the
// attribute set is empty (treat as "no filter").
function cardMatchesAttrs(card, selected) {
  // group selected ids by their category prefix
  const byGroup = new Map();
  for (const id of selected) {
    const idx = id.indexOf(':');
    const g   = id.slice(0, idx);
    const v   = id.slice(idx + 1);
    if (!byGroup.has(g)) byGroup.set(g, new Set());
    byGroup.get(g).add(v);
  }
  for (const [group, values] of byGroup) {
    let match = false;
    if (group === 'rarity')        match = values.has(card.rarity);
    else if (group === 'element')  match = card.element != null && values.has(card.element);
    else if (group === 'special') {
      // "ex" matches names ending with " ex" / " EX"; "mega" matches names
      // starting with "Mega " or "M " (limitless renders mega cards both ways)
      const isEx   = / ex$/i.test(card.name);
      const isMega = /^mega\b/i.test(card.name) || /^m\s+[A-Z]/.test(card.name);
      if (values.has('ex')   && isEx)   match = true;
      if (values.has('mega') && isMega) match = true;
    }
    if (!match) return false;
  }
  return true;
}

// element/cost letter → display word. limitless uses single-letter codes
// inside <span class="ptcg-symbol"> markup (R=fire, W=water, G=grass,
// L=lightning, P=psychic, F=fighting, D=darkness, M=metal, C=colorless,
// Y=fairy — fairy was retired but still appears in some legacy text, N=dragon).
const COST_LETTER = {
  R: 'fire', W: 'water', G: 'grass', L: 'lightning', P: 'psychic',
  F: 'fighting', D: 'darkness', M: 'metal', C: 'colorless', Y: 'fairy', N: 'dragon',
};

// official TCG energy symbols committed under public/assets/energy/<element>.png
// (sourced from bulbagarden archives). letters that map to one of these get the
// real icon; anything else (e.g. "0" free-cost attacks) falls back to text.
// fairy isn't in pocket yet so it has no icon — it'd fall back to text too.
const ENERGY_ICONS = new Set([
  'fire', 'water', 'grass', 'lightning', 'psychic',
  'fighting', 'darkness', 'metal', 'colorless', 'dragon',
]);
const ENERGY_BASE = `${import.meta.env?.BASE_URL || '/'}assets/energy/`;

function EnergyIcon({ element, className }) {
  if (!ENERGY_ICONS.has(element)) return null;
  return (
    <img
      className={className}
      src={`${ENERGY_BASE}${element}.png`}
      alt={element}
      title={element}
      width="18"
      height="18"
      loading="lazy"
    />
  );
}

// group + sort options for the page-level controls. options labels match the
// <option> rendering — keep these arrays as the single source of truth.
const GROUP_OPTIONS = [
  { value: 'set',     label: 'by set' },
  { value: 'rarity',  label: 'by rarity' },
  { value: 'element', label: 'by type' },
  { value: 'none',    label: 'no grouping' },
];

const SORT_OPTIONS = [
  { value: 'number',  label: 'card number' },
  { value: 'name',    label: 'name' },
  { value: 'rarity',  label: 'rarity' },
  { value: 'hp',      label: 'hp' },
];

// partition a flat array of cards into sections according to groupBy.
// sections come back in a stable canonical order per dimension (sets newest
// first, rarity ascending, element following the energy-color sequence).
function groupCards(items, by) {
  if (by === 'none') {
    return [{ slug: 'all', label: null, items }];
  }

  if (by === 'set') {
    const m = new Map();
    for (const c of items) {
      if (!m.has(c.set)) {
        m.set(c.set, { slug: c.set, label: `[${c.set}] ${c.set_name}`, release: c.set_release, items: [] });
      }
      m.get(c.set).items.push(c);
    }
    return [...m.values()].sort((a, b) => b.release.localeCompare(a.release));
  }

  if (by === 'rarity') {
    const m = new Map();
    for (const c of items) {
      if (!m.has(c.rarity)) {
        m.set(c.rarity, {
          slug:  c.rarity,
          label: `[${c.rarity}] ${RARITY_LABELS[c.rarity] || c.rarity}`,
          items: [],
        });
      }
      m.get(c.rarity).items.push(c);
    }
    return RARITY_ORDER.map(r => m.get(r)).filter(Boolean);
  }

  if (by === 'element') {
    const m = new Map();
    const NONE_KEY = '_none';
    for (const c of items) {
      const k = c.element || NONE_KEY;
      if (!m.has(k)) m.set(k, { slug: k, label: c.element || 'no type', items: [] });
      m.get(k).items.push(c);
    }
    const ordered = ELEMENT_ORDER.map(e => m.get(e)).filter(Boolean);
    if (m.has(NONE_KEY)) ordered.push(m.get(NONE_KEY));
    return ordered;
  }

  return [];
}

// sort items inside a single section. base sort always produces canonical
// ascending order (older set first / a→z / common→crown / low→high hp);
// dir==='desc' just reverses. matches the pokedex's filter-panel sort
// semantics so the asc/desc arrow toggle reads predictably.
function sortItems(items, by, dir) {
  const arr = [...items];
  switch (by) {
    case 'number':
      arr.sort((a, b) => {
        const setCmp = (SET_RELEASE.get(a.set) || '').localeCompare(SET_RELEASE.get(b.set) || '');
        if (setCmp !== 0) return setCmp;          // older set first
        return a.number - b.number;
      });
      break;
    case 'name':
      arr.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'rarity':
      arr.sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
      break;
    case 'hp':
      arr.sort((a, b) => (a.hp ?? -1) - (b.hp ?? -1));   // ascending; null = -1 sinks to bottom
      break;
  }
  return dir === 'desc' ? arr.reverse() : arr;
}

function CardModal({ card, modalRef, onClose, onPrev, onNext, closing, bump }) {
  // cycle-pulse on every prev/next via WAAPI — same pattern as the other modals.
  useEffect(() => {
    if (bump.n === 0) return;
    const anim = pulseElement(modalRef.current);
    return () => anim?.cancel();
  }, [bump.n, modalRef]);

  const isPokemon = card.card_type === 'pokemon';
  const stageLabel = card.stage === 'basic'
    ? 'Basic'
    : (typeof card.stage === 'number' ? `Stage ${card.stage}` : null);

  return (
    <div className={`ability-modal-overlay${closing ? ' closing' : ''}`} onClick={onClose}>
      <div ref={modalRef} className="ball-modal tcgp-modal" onClick={e => e.stopPropagation()}>
        {/* only the title bar pins to the top — everything below (hero + stats
            + ability + attacks + flavor + illustrator) is in the scroll
            region. previously the hero was also pinned, which left only ~30%
            of the modal height for the actual card details. */}
        <div className="ball-modal__header">
          <button className="modal-cycle-arrow modal-cycle-arrow--prev" onClick={onPrev} aria-label="previous">‹</button>
          <div className="tcgp-modal__title">
            <h2>{card.name}</h2>
            <span className="tcgp-modal__sub">
              {card.set_name} · #{card.number} · {RARITY_LABELS[card.rarity] || card.rarity}
            </span>
          </div>
          <button className="modal-cycle-arrow modal-cycle-arrow--next" onClick={onNext} aria-label="next">›</button>
        </div>

        <div className="tcgp-modal__scroll">
          <div className="tcgp-modal__hero">
            <Img src={card.image_full} alt={card.name} loading="eager" />
          </div>

          {isPokemon && (
            <div className="tcgp-stat-row">
              {card.hp != null && (
                <span className="tcgp-stat">
                  <span className="tcgp-stat__label">hp</span>
                  <span className="tcgp-stat__value">{card.hp}</span>
                </span>
              )}
              {card.element && (
                <span className="tcgp-stat">
                  <span className="tcgp-stat__label">type</span>
                  <span className="tcgp-stat__value tcgp-stat__value--type">
                    <EnergyIcon element={card.element} className="tcgp-energy-icon" />
                    {card.element}
                  </span>
                </span>
              )}
              {stageLabel && (
                <span className="tcgp-stat">
                  <span className="tcgp-stat__label">stage</span>
                  <span className="tcgp-stat__value">{stageLabel}</span>
                </span>
              )}
              {card.evolves_from && (
                <span className="tcgp-stat">
                  <span className="tcgp-stat__label">evolves from</span>
                  <span className="tcgp-stat__value">{card.evolves_from}</span>
                </span>
              )}
              {card.weakness && (
                <span className="tcgp-stat">
                  <span className="tcgp-stat__label">weakness</span>
                  <span className="tcgp-stat__value tcgp-stat__value--type">
                    <EnergyIcon element={card.weakness} className="tcgp-energy-icon" />
                    {card.weakness}
                  </span>
                </span>
              )}
              {card.retreat != null && (
                <span className="tcgp-stat">
                  <span className="tcgp-stat__label">retreat</span>
                  <span className="tcgp-stat__value">{card.retreat}</span>
                </span>
              )}
            </div>
          )}

          {card.ability && (
            <div className="tcgp-ability">
              <span className="tcgp-ability__name">{card.ability.name}</span>
              {card.ability.effect && <p className="tcgp-ability__effect">{card.ability.effect}</p>}
            </div>
          )}

          {card.attacks?.length > 0 && (
            <div className="tcgp-attacks">
              {card.attacks.map((a, i) => (
                <div key={i} className="tcgp-attack">
                  <div className="tcgp-attack__row">
                    <span className="tcgp-attack__cost">
                      {a.cost.map((letter, j) => {
                        const el = COST_LETTER[letter];
                        return ENERGY_ICONS.has(el)
                          ? <EnergyIcon key={j} element={el} className="tcgp-energy-icon" />
                          : <span key={j} className="tcgp-energy">{letter}</span>;
                      })}
                    </span>
                    <span className="tcgp-attack__name">{a.name}</span>
                    {a.damage && <span className="tcgp-attack__damage">{a.damage}</span>}
                  </div>
                  {a.effect && <p className="tcgp-attack__effect">{a.effect}</p>}
                </div>
              ))}
            </div>
          )}

          {card.flavor_text && <p className="tcgp-flavor">{card.flavor_text}</p>}

          {card.illustrator && <p className="tcgp-illustrator">illus. {card.illustrator}</p>}
        </div>
      </div>
    </div>
  );
}

export default function TCGPocketPage() {
  // selectedSets empty = default progressive mode (newest set + "show previous"
  //                       button to walk older sets in one at a time)
  // selectedSets has codes = explicit filter to those sets only
  // selectedAttrs filters items WITHIN the visible sections — applied on top
  // of whichever set scope is active.
  const [selectedSets, setSelectedSets]   = useState(() => new Set());
  const [selectedAttrs, setSelectedAttrs] = useState(() => new Set());
  const [groupBy, setGroupBy]             = useState('set');
  const [sortBy, setSortBy]               = useState('number');
  // sort direction matches the pokedex filter-panel — asc = canonical order
  // (older set first / a→z / common→crown / low hp → high hp); desc reverses.
  const [sortDir, setSortDir]             = useState('desc');
  const [loadedCount, setLoadedCount]     = useState(1);
  const [openDropdown, setOpenDropdown]   = useState(null);  // 'sets' | 'attrs' | null
  const setsRef  = useRef(null);
  const attrsRef = useRef(null);

  const isSetFiltered  = selectedSets.size  > 0;
  const isAttrFiltered = selectedAttrs.size > 0;

  const visibleSections = useMemo(() => {
    // 1. flatten through filters
    let pool = cards;
    if (isSetFiltered)  pool = pool.filter(c => selectedSets.has(c.set));
    if (isAttrFiltered) pool = pool.filter(c => cardMatchesAttrs(c, selectedAttrs));

    // 2. group + sort within group
    let sections = groupCards(pool, groupBy);
    sections = sections.map(s => ({ ...s, items: sortItems(s.items, sortBy, sortDir) }));

    // 3. progressive disclosure only kicks in for the default set-grouped
    //    view with no explicit set filter. any other group dimension —
    //    rarity, element, none — shows everything that survives the filters.
    if (groupBy === 'set' && !isSetFiltered) {
      sections = sections.slice(0, loadedCount);
    }

    return sections;
  }, [isSetFiltered, selectedSets, isAttrFiltered, selectedAttrs, groupBy, sortBy, sortDir, loadedCount]);

  const visibleCardCount = useMemo(
    () => visibleSections.reduce((n, s) => n + s.items.length, 0),
    [visibleSections],
  );

  // "show previous set" button only meaningful in the default set-grouped
  // mode (no set filter). attribute filter is independent of this — it just
  // narrows items inside whichever sets are loaded.
  const canShowPrevious = groupBy === 'set'
    && !isSetFiltered
    && loadedCount < SECTIONED_CARDS.length;
  const nextOlderSet    = canShowPrevious ? SECTIONED_CARDS[loadedCount] : null;

  // cross-page modal auto-open: consume location.state.openId on first
  // render (same handshake badges + gym-leaders use). lets the global
  // search jump straight to a card's modal without per-card routes.
  const location = useLocation();
  const navigate = useNavigate();
  const initialOpenId = location.state?.openId ?? null;
  const { current: currentCard, bump, modalRef, open, close, prev, next } =
    useModalCycleNav(visibleSections, initialOpenId);
  const { displayed: shownCard, isClosing } = useModalAnimation(currentCard);

  useEffect(() => {
    if (!initialOpenId) return;
    navigate(location.pathname, { replace: true, state: null });
    const mode = getString(STORAGE_KEYS.XFADE_MODE, 'snap');
    if (mode !== 'view') {
      setTimeout(() => { if (modalRef.current) pulseElement(modalRef.current); }, 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // close whichever dropdown is open on outside-click or Esc — same pattern
  // as the burger / visuals dropdowns in app.jsx. uses openDropdown to know
  // which ref to test against.
  useEffect(() => {
    if (!openDropdown) return;
    const ref = openDropdown === 'sets' ? setsRef : attrsRef;
    const onMouse = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpenDropdown(null);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpenDropdown(null); };
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown', onKey);
    };
  }, [openDropdown]);

  // ── set filter helpers ───────────────────────────────────────────
  const toggleSet = (slug) => {
    setSelectedSets(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
    setLoadedCount(1);
  };
  const selectAllSets = () => {
    setSelectedSets(new Set(SECTIONED_CARDS.map(s => s.slug)));
    setLoadedCount(1);
  };
  const clearSets = () => {
    setSelectedSets(new Set());
    setLoadedCount(1);
  };

  // ── attribute filter helpers ─────────────────────────────────────
  const toggleAttr = (group, value) => {
    setSelectedAttrs(prev => {
      const next = new Set(prev);
      const id   = `${group}:${value}`;
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearAttrs = () => setSelectedAttrs(new Set());

  // ── reset everything to defaults ─────────────────────────────────
  // true when any filter / group / sort differs from the page's initial
  // state — drives both the reset button's visibility and what it undoes.
  const isNonDefault =
    isSetFiltered || isAttrFiltered ||
    groupBy !== 'set' || sortBy !== 'number' || sortDir !== 'desc';
  const resetAll = () => {
    setSelectedSets(new Set());
    setSelectedAttrs(new Set());
    setGroupBy('set');
    setSortBy('number');
    setSortDir('desc');
    setLoadedCount(1);
    setOpenDropdown(null);
  };

  // ── dropdown summary labels ──────────────────────────────────────
  const setsTriggerLabel = (() => {
    if (selectedSets.size === 0) return 'all sets · newest first';
    if (selectedSets.size === 1) {
      const only = SECTIONED_CARDS.find(s => selectedSets.has(s.slug));
      return only?.label ?? '';
    }
    if (selectedSets.size === SECTIONED_CARDS.length) return 'all sets · selected';
    return `${selectedSets.size} sets selected`;
  })();

  const attrsTriggerLabel = (() => {
    if (selectedAttrs.size === 0) return 'any';
    if (selectedAttrs.size === 1) {
      const [first] = selectedAttrs;
      const idx = first.indexOf(':');
      const g   = first.slice(0, idx);
      const v   = first.slice(idx + 1);
      const grp = ATTR_GROUPS.find(gp => gp.key === g);
      const opt = grp?.options.find(o => o.value === v);
      return opt?.label || v;
    }
    return `${selectedAttrs.size} selected`;
  })();

  return (
    <div className="items-page">
      <h1>tcg pocket</h1>
      <p className="items-page__sub">
        {visibleCardCount} cards
        {groupBy === 'set' && !isSetFiltered && loadedCount < SECTIONED_CARDS.length
          && ` (showing ${loadedCount} of ${SECTIONED_CARDS.length} sets)`}
        {isNonDefault && (
          <button type="button" className="tcgp-reset" onClick={resetAll}>
            reset filters
          </button>
        )}
      </p>

      <div className="tcgp-filters">
        {/* layout: left column = set filter / attribute filter (stacked).
            right column = group / sort (stacked). JSX order matches the
            grid's column-first auto-flow so the two filters fill column 1
            and the two controls fill column 2. */}
        <div className="tcgp-filter" ref={setsRef}>
          <span className="tcgp-control__label">filter by set</span>
          <button
            type="button"
            className={`tcgp-filter__trigger${openDropdown === 'sets' ? ' is-open' : ''}`}
            onClick={() => setOpenDropdown(o => o === 'sets' ? null : 'sets')}
            aria-expanded={openDropdown === 'sets'}
            aria-haspopup="listbox"
          >
            <span className="tcgp-filter__current">{setsTriggerLabel}</span>
            <span className="tcgp-filter__chevron" aria-hidden="true">▾</span>
          </button>

          {openDropdown === 'sets' && (
            <div className="tcgp-filter__panel" role="listbox" aria-multiselectable="true">
              <div className="tcgp-filter__actions">
                <button type="button" className="tcgp-filter__action" onClick={selectAllSets}>select all</button>
                <button type="button" className="tcgp-filter__action" onClick={clearSets}>clear</button>
              </div>
              {SECTIONED_CARDS.map(section => {
                const checked = selectedSets.has(section.slug);
                return (
                  <label
                    key={section.slug}
                    className={`tcgp-filter__option${checked ? ' is-checked' : ''}`}
                    role="option"
                    aria-selected={checked}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggleSet(section.slug)} />
                    <span className="tcgp-filter__option-label">{section.label}</span>
                    <span className="tcgp-filter__option-count">{section.items.length}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* attribute filter — rarity / type / tags. multi-select with grouped sections. */}
        <div className="tcgp-filter" ref={attrsRef}>
          <span className="tcgp-control__label">filter by attribute</span>
          <button
            type="button"
            className={`tcgp-filter__trigger${openDropdown === 'attrs' ? ' is-open' : ''}`}
            onClick={() => setOpenDropdown(o => o === 'attrs' ? null : 'attrs')}
            aria-expanded={openDropdown === 'attrs'}
            aria-haspopup="listbox"
          >
            <span className="tcgp-filter__current">{attrsTriggerLabel}</span>
            <span className="tcgp-filter__chevron" aria-hidden="true">▾</span>
          </button>

          {openDropdown === 'attrs' && (
            <div className="tcgp-filter__panel" role="listbox" aria-multiselectable="true">
              <div className="tcgp-filter__actions">
                <button type="button" className="tcgp-filter__action" onClick={clearAttrs}>clear</button>
              </div>
              {ATTR_GROUPS.map(group => (
                <div key={group.key} className="tcgp-filter__group">
                  <div className="tcgp-filter__group-label">{group.label}</div>
                  {group.options.map(opt => {
                    const id      = `${group.key}:${opt.value}`;
                    const checked = selectedAttrs.has(id);
                    return (
                      <label
                        key={id}
                        className={`tcgp-filter__option${checked ? ' is-checked' : ''}`}
                        role="option"
                        aria-selected={checked}
                      >
                        <input type="checkbox" checked={checked} onChange={() => toggleAttr(group.key, opt.value)} />
                        <span className="tcgp-filter__option-label">{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* group + sort controls — single-select natives. right column of
            the filters grid: group on top, sort below. */}
        <label className="tcgp-control">
          <span className="tcgp-control__label">group</span>
          <select
            className="tcgp-control__select"
            value={groupBy}
            onChange={e => { setGroupBy(e.target.value); setLoadedCount(1); }}
          >
            {GROUP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="tcgp-control tcgp-control--sort">
          <span className="tcgp-control__label">sort</span>
          <div className="tcgp-control__sort-wrap">
            <select
              className="tcgp-control__select"
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button
              type="button"
              className="tcgp-control__sort-arrow"
              onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
              aria-label={`sort ${sortDir === 'asc' ? 'ascending — tap to switch to descending' : 'descending — tap to switch to ascending'}`}
            >
              {sortDir === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </label>
      </div>

      {visibleSections.map((section, sectionIdx) => (
        <div key={section.slug} id={`tcgp-section-${section.slug}`} className="items-section">
          {section.label && <h2 className="items-section__label">{section.label}</h2>}
          <div className="tcgp-grid">
            {section.items.map((c, index) => (
              <button
                key={c.uid}
                className="tcgp-card-thumb"
                onClick={(e) => {
                  const t = e.currentTarget;
                  pulseElement(t, { scale: 1.05, duration: 220, offset: 0.3 });
                  setTimeout(() => open(sectionIdx, index), 70);
                }}
              >
                <Img src={c.image_url} alt={c.name} loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      ))}

      {canShowPrevious && (
        <button
          className="load-more-btn"
          onClick={() => setLoadedCount(c => c + 1)}
        >
          show previous set ({nextOlderSet.label})
        </button>
      )}

      {/* hidden while a card modal is open so it doesn't sit over the backdrop */}
      {!shownCard && <TcgpJumpNav sections={visibleSections} />}

      {shownCard && (
        <CardModal
          card={shownCard}
          modalRef={modalRef}
          onClose={close}
          onPrev={prev}
          onNext={next}
          closing={isClosing}
          bump={bump}
        />
      )}
    </div>
  );
}
