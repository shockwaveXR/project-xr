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
// cry audio: PokeAPI cries hosted via jsdelivr (github raw doesn't set
// CORS headers needed by Web Audio's createMediaElementSource). played
// on click of the speaker icon, never autoplayed. routed through a
// GainNode for true volume control on iOS where HTMLAudioElement.volume
// is a no-op.
//
// minimize: card *defaults to collapsed* on first visit and whenever the
// date rolls over (less intrusive; expansion is a deliberate engagement).
// once the user expands or re-collapses, that preference is persisted in
// localStorage for the rest of the day. next day it resets to collapsed.
//
// transition: collapsed/expanded share the same DOM. body wraps in a
// grid-template-rows 1fr ↔ 0fr animation (modern CSS trick that lets us
// transition to/from intrinsic height without measuring at runtime).

import { useEffect, useMemo, useRef, useState } from 'react';
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

// djb2 hash + a murmur3 fmix32 avalanche → non-negative 32-bit int.
// deterministic per date string (so the pick is universal for a given day).
//
// the avalanche is the important part: consecutive day strings differ only
// in the final character ("…-02" → "…-03"), and plain djb2 maps those to
// hashes differing by *exactly 1*, so `% POOL.length` returned ADJACENT
// pokédex ids on consecutive days — that's why cosmog/solgaleo/lunala
// (789/791/792) showed up back-to-back. fmix32 scrambles near-identical
// seeds into unrelated buckets so consecutive days look unrelated.
function hashDate(yyyy_mm_dd) {
  let h = 5381;
  for (let i = 0; i < yyyy_mm_dd.length; i++) {
    h = ((h << 5) + h) + yyyy_mm_dd.charCodeAt(i);
    h |= 0;
  }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
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

// jsdelivr cdn mirror of PokeAPI/cries (github raw doesn't set
// Access-Control-Allow-Origin: *, which is required when routing the
// audio through Web Audio API's createMediaElementSource).
const CRY_URL = (id) =>
  `https://cdn.jsdelivr.net/gh/PokeAPI/cries@main/cries/pokemon/latest/${id}.ogg`;

// cries are mastered very hot — even at 0.375 (37.5% of source) they
// still read as loud in casual contexts. current default of 0.4 × 0.25
// = 0.1 (~10% of source) errs on the side of caution for headphone
// listeners. adjust the modifier (or base) if you need finer tuning;
// the gain is re-read on every play, so changes hot-reload immediately.
const CRY_BASE_VOLUME = 0.4;
const CRY_VOLUME_MODIFIER = 0.25;
const CRY_VOLUME = CRY_BASE_VOLUME * CRY_VOLUME_MODIFIER;

export default function Spotlight() {
  const dateKey     = useMemo(todayKey, []);
  const dateDisplay = useMemo(formatDisplay, []);
  const todayId     = useMemo(() => pickTodayId(dateKey), [dateKey]);

  const [pokemon, setPokemon] = useState(null);
  // drives the cry button's "now playing" visual — flipped by the audio
  // element's own play/ended events so it reflects real playback, not just
  // the click (which matters when device volume makes the sound inaudible).
  const [playing, setPlaying] = useState(false);
  // audio + ctx + gain all live in refs since none of them drive renders
  // — they exist only to be reused across cry-button clicks.
  const audioRef    = useRef(null);
  const audioCtxRef = useRef(null);
  const gainRef     = useRef(null);

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
    let a = audioRef.current;
    if (!a) {
      a = new Audio();
      a.crossOrigin = 'anonymous';
      a.src = CRY_URL(todayId);

      // reflect actual playback state on the button. attached once (the
      // element is created once and reused across clicks). 'ended' returns it
      // to rest; 'pause'/'error' cover the interrupted/failed cases.
      a.addEventListener('playing', () => setPlaying(true));
      a.addEventListener('ended',   () => setPlaying(false));
      a.addEventListener('pause',   () => setPlaying(false));
      a.addEventListener('error',   () => setPlaying(false));

      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
        const ctx = audioCtxRef.current;
        const source = ctx.createMediaElementSource(a);
        gainRef.current = ctx.createGain();
        source.connect(gainRef.current).connect(ctx.destination);
      }
      audioRef.current = a;
    }
    // re-apply volume on every play so constant changes (HMR or full
    // refresh) actually take effect — without this the gain value gets
    // baked in on first creation and stale forever after.
    if (gainRef.current) {
      gainRef.current.gain.value = CRY_VOLUME;
    } else {
      // no Web Audio support — fall back to HTMLAudio's .volume (no-op
      // on ios but at least respected elsewhere).
      a.volume = CRY_VOLUME;
    }
    // ios suspends the audio context until a user gesture explicitly
    // resumes it. the button click IS a gesture; resume here defensively
    // in case the context auto-suspended between plays.
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    a.currentTime = 0;
    a.play().catch(() => {});
  }

  if (!pokemon) return null;

  const artwork     = pokemon.home_url || pokemon.artwork_url || pokemon.sprite_url;
  const displayName = formatName(pokemon.name);
  const region      = REGION_OVERRIDES[pokemon.name] || GEN_TO_REGION[pokemon.generation];
  const originText  = pokemon.generation
    ? `gen ${pokemon.generation}${region ? ` · ${region}` : ''}`
    : null;

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
              {originText && <span className="spotlight__origin">{originText}</span>}
              <button
                type="button"
                className={`spotlight__cry${playing ? ' spotlight__cry--playing' : ''}`}
                onClick={playCry}
                aria-label={playing ? `playing ${displayName} cry` : `play ${displayName} cry`}
                title={playing ? 'playing…' : 'play cry'}
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
      <path className="spotlight__cry-wave spotlight__cry-wave--1" d="M10.5 5.5c.8.6 1.3 1.5 1.3 2.5s-.5 1.9-1.3 2.5l-.6-.8c.6-.4.9-1 .9-1.7s-.3-1.3-.9-1.7l.6-.8z" />
      <path className="spotlight__cry-wave spotlight__cry-wave--2" d="M12 3.5c1.8 1.1 3 3 3 4.5s-1.2 3.4-3 4.5l-.6-.8c1.5-.9 2.4-2.3 2.4-3.7s-.9-2.8-2.4-3.7l.6-.8z" />
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
