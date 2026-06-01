// ─── Spotlight ───────────────────────────────────────────────────────────────
//
// daily-rotating spotlight on the news page. pick is deterministic per
// LOCAL calendar day — universal pick given a date string, but each
// visitor's "today" is computed in their own timezone via local Date
// getters. result: a Japan visitor sees their May-31 pick (universally
// shared with anyone else on May 31 locally) before a US visitor on the
// same UTC moment but still on May 30. each visitor still sees their own
// today consistently.
//
// pool is base-species ids 1..N (forms collapsed under their base species).
// data fetched via getPokemonById so flavor text + genus + jp/romaji are
// all there.
//
// cry audio: PokeAPI hosts ogg files at a stable github raw url per id.
// played on click of the speaker icon, never autoplayed.
//
// minimize: card *defaults to collapsed* on first visit and whenever the
// date rolls over (less intrusive; expansion is a deliberate engagement).
// once the user expands or re-collapses, that preference is persisted in
// localStorage for the rest of the day. next day it resets to collapsed.
//
// transition: collapsed/expanded share the same DOM. body wraps in a
// grid-template-rows 1fr ↔ 0fr animation (modern CSS trick that lets us
// transition to/from intrinsic height without measuring at runtime).
// header content reflows from stacked → inline via flex-direction.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ALL from '../data/pokemon.json';
import { getPokemonById } from '../utils/api';
import { formatName } from '../utils/format-name';

const POOL = ALL.filter(p => p.id <= 1025).map(p => p.id);

const STORAGE_KEY = 'spotlight-minimize';

// gen → region. nothing else in the app needs this mapping (region maps
// page is still a deferred TODO), so it lives locally rather than as a
// shared util. update if a new gen ever ships.
const GEN_TO_REGION = {
  1: 'kanto',
  2: 'johto',
  3: 'hoenn',
  4: 'sinnoh',
  5: 'unova',
  6: 'kalos',
  7: 'alola',
  8: 'galar',
  9: 'paldea',
};

// region overrides for species whose native region differs from their
// generation's default. PokeAPI tags PLA-introduced species as gen 8
// (Switch / SwSh release era) but their native region is Hisui (ancient
// Sinnoh), not Galar. keyed by the stored species name in pokemon.json.
const REGION_OVERRIDES = {
  'wyrdeer':            'hisui',
  'kleavor':            'hisui',
  'ursaluna':           'hisui',
  'basculegion-male':   'hisui',
  'sneasler':           'hisui',
  'overqwil':           'hisui',
  'enamorus-incarnate': 'hisui',
};

// djb2 hash → non-negative int. small + deterministic.
function hashDate(yyyy_mm_dd) {
  let h = 5381;
  for (let i = 0; i < yyyy_mm_dd.length; i++) {
    h = ((h << 5) + h) + yyyy_mm_dd.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

// local date as YYYY-MM-DD. used as both the seed input and the
// "lastSeenDate" comparison key for the minimize override.
function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// "May 31, 2026" — display only; not used for storage or hashing.
function formatDisplay() {
  return new Date().toLocaleDateString('en-US', {
    year:  'numeric',
    month: 'long',
    day:   'numeric',
  });
}

function pickTodayId(dateKey) {
  return POOL[hashDate(dateKey) % POOL.length];
}

function readMinimizeState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { minimized: true, lastSeenDate: null };
    const parsed = JSON.parse(raw);
    return {
      minimized:    !!parsed.minimized,
      lastSeenDate: parsed.lastSeenDate || null,
    };
  } catch {
    return { minimized: true, lastSeenDate: null };
  }
}

function writeMinimizeState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

const CRY_URL = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg`;

// cries are mastered hot — even at 0.5 (50% of source) they read as "a bit
// loud" in casual listening contexts. apply a 0.75 modifier on top so the
// effective playback is 0.5 × 0.75 = 0.375 (~37.5% of source). errs on the
// side of caution for headphone listeners.
const CRY_BASE_VOLUME = 0.5;
const CRY_VOLUME_MODIFIER = 0.75;
const CRY_VOLUME = CRY_BASE_VOLUME * CRY_VOLUME_MODIFIER;

export default function Spotlight() {
  const dateKey     = useMemo(todayKey, []);
  const dateDisplay = useMemo(formatDisplay, []);
  const todayId     = useMemo(() => pickTodayId(dateKey), [dateKey]);

  const [pokemon, setPokemon] = useState(null);
  const [audio,   setAudio]   = useState(null);

  // default-to-minimized: if the stored lastSeenDate isn't today's, the
  // card greets the user COLLAPSED — same behavior for first visit ever +
  // for any day-rollover. only respect the persisted minimized=false (an
  // explicit expansion) when the user has already interacted today.
  const [minimized, setMinimized] = useState(() => {
    const s = readMinimizeState();
    if (s.lastSeenDate !== dateKey) return true;
    return s.minimized;
  });

  useEffect(() => {
    let cancelled = false;
    getPokemonById(todayId)
      .then(p => { if (!cancelled) setPokemon(p); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [todayId]);

  function toggleMinimize() {
    const next = !minimized;
    setMinimized(next);
    writeMinimizeState({ minimized: next, lastSeenDate: dateKey });
  }

  function playCry() {
    let a = audio;
    if (!a) {
      a = new Audio(CRY_URL(todayId));
      a.volume = CRY_VOLUME;
      setAudio(a);
    }
    a.currentTime = 0;
    a.play().catch(() => {});
  }

  if (!pokemon) return null;

  const primary     = pokemon.types?.[0] || 'normal';
  const secondary   = pokemon.types?.[1] || primary;
  const artwork     = pokemon.home_url || pokemon.artwork_url || pokemon.sprite_url;
  const displayName = formatName(pokemon.name);

  return (
    <article className={`spotlight ${minimized ? 'spotlight--minimized' : ''}`}>
      {/* whole header is the toggle button. minimized: clicking anywhere
          on the strip expands (more forgiving target than a tiny chevron-
          only hit area). expanded: clicking the title bar collapses, while
          body interactive children (artwork link, cry, cta) keep their
          own click handlers because they live outside this button. */}
      <button
        type="button"
        className="spotlight__header"
        onClick={toggleMinimize}
        aria-label={minimized ? 'expand daily pokémon spotlight' : 'minimize daily pokémon spotlight'}
        title={minimized ? 'expand' : 'minimize'}
      >
        <span className="spotlight__chev spotlight__chev--left" aria-hidden="true">
          <ChevronDown />
        </span>
        <span className="spotlight__header-text">
          <span className="spotlight__title">daily pokémon spotlight</span>
        </span>
        <span className="spotlight__date">{dateDisplay}</span>
        <span className="spotlight__chev spotlight__chev--right" aria-hidden="true">
          {minimized ? <ChevronDown /> : <ChevronUp />}
        </span>
      </button>

      {/* grid-template-rows 1fr ↔ 0fr animates to/from intrinsic height.
          inner min-height:0 + overflow:hidden are critical — without them
          the row track ignores grid-template-rows on collapse. */}
      <div className="spotlight__body-wrap">
        <div className="spotlight__body">
          <Link
            to={`/pokemon/${pokemon.id}`}
            className="spotlight__artwork-link"
            aria-label={`open ${displayName} full pokédex page`}
            tabIndex={minimized ? -1 : 0}
          >
            {artwork && (
              <img
                src={artwork}
                alt={displayName}
                className="spotlight__artwork"
                loading="lazy"
              />
            )}
          </Link>

          <div className="spotlight__info">
            <div className="spotlight__id-row">
              <span className="spotlight__id">
                #{String(pokemon.id).padStart(3, '0')}
              </span>
              {pokemon.generation && (() => {
                const region = REGION_OVERRIDES[pokemon.name] || GEN_TO_REGION[pokemon.generation];
                return (
                  <span className="spotlight__origin">
                    gen {pokemon.generation}{region && ` · ${region}`}
                  </span>
                );
              })()}
              <button
                type="button"
                className="spotlight__cry"
                onClick={playCry}
                aria-label={`play ${displayName} cry`}
                title="play cry"
                tabIndex={minimized ? -1 : 0}
              >
                <SpeakerIcon />
              </button>
            </div>

            <div className="spotlight__name-row">
              <h2 className="spotlight__name">{displayName}</h2>
              <div className="spotlight__types">
                {pokemon.types?.map(t => (
                  <span key={t} className={`type-badge type-${t}`}>{t}</span>
                ))}
              </div>
            </div>

            {(pokemon.name_jp || pokemon.romaji || pokemon.genus) && (
              <div className="spotlight__subtitle">
                {pokemon.name_jp && <span>{pokemon.name_jp}</span>}
                {pokemon.romaji  && <span>· {pokemon.romaji}</span>}
                {pokemon.genus   && <span>· {pokemon.genus}</span>}
              </div>
            )}

            {pokemon.flavor_text && (
              <p className="spotlight__flavor">"{pokemon.flavor_text}"</p>
            )}

            <Link
              to={`/pokemon/${pokemon.id}`}
              className="spotlight__cta"
              tabIndex={minimized ? -1 : 0}
            >
              view full pokédex →
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function SpeakerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 2.5L4.5 5.5H2v5h2.5L8 13.5V2.5z" />
      <path d="M10.5 5.5c.8.6 1.3 1.5 1.3 2.5s-.5 1.9-1.3 2.5l-.6-.8c.6-.4.9-1 .9-1.7s-.3-1.3-.9-1.7l.6-.8z" />
      <path d="M12 3.5c1.8 1.1 3 3 3 4.5s-1.2 3.4-3 4.5l-.6-.8c1.5-.9 2.4-2.3 2.4-3.7s-.9-2.8-2.4-3.7l.6-.8z" />
    </svg>
  );
}

function ChevronUp() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3,10 8,5 13,10" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3,6 8,11 13,6" />
    </svg>
  );
}
