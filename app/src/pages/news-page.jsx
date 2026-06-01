// ─── NewsPage ────────────────────────────────────────────────────────────────
//
// on mount we show a loading state and fetch live data from the cloudflare
// worker. if the fetch fails (network error, timeout, bad payload) we fall
// back to the bundled news.json and show a "using cached copy" pill.

import { useCallback, useEffect, useState } from 'react';
import PullToRefresh from '../components/pull-to-refresh';
import Spotlight from '../components/spotlight';
import bundledNews from '../data/news.json';

// the live news endpoint served by the cloudflare worker. the worker's
// source lives at worker/src/index.js in this repo; `wrangler deploy`
// from the worker/ directory prints the real url when it finishes. paste
// it in here after the first deploy.
//
// you can override this at build time by setting VITE_NEWS_API in
// app/.env.local, which is handy when testing a local `wrangler dev`:
//
//   VITE_NEWS_API=http://localhost:8787/news.json
//
// if both the constant and the env var are wrong/unreachable, the bundled
// news.json takes over transparently.
const NEWS_API_URL =
  import.meta.env.VITE_NEWS_API ||
  'https://pokedex-news.voltage770.workers.dev/news.json';

// how long we'll wait for the worker before giving up and showing the
// bundled fallback. the worker's cold-start + upstream fetch on a cache
// miss takes ~2–4 sec worst case, so 6 sec leaves headroom without making
// the page feel stuck on a slow network.
const FETCH_TIMEOUT_MS = 6000;

// "apr 13, 2026" — lowercased to match the rest of the interface. the browser's
// Intl.DateTimeFormat gives us "Apr 13, 2026" with a titlecased month abbrev,
// so we .toLowerCase() the result on the way out.
function formatDate(iso) {
  if (!iso) return 'undated';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'undated';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).toLowerCase();
}

function formatRelative(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const day  = 86400000;
  if (diff < 60000)      return 'just now';
  if (diff < 3600000)    return `${Math.floor(diff / 60000)}m ago`;
  if (diff < day)        return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 7 * day)    return `${Math.floor(diff / day)}d ago`;
  if (diff < 30 * day)   return `${Math.floor(diff / (7 * day))}w ago`;
  return null;
}

function NewsMedia({ entry }) {
  if (entry.youtube_id) {
    return (
      <div className="news-media news-media--youtube">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${entry.youtube_id}`}
          title={entry.title}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  if (entry.image) {
    return (
      <div className="news-media news-media--image">
        <a href={entry.url || '#'} target="_blank" rel="noopener noreferrer">
          <img
            src={entry.image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </a>
      </div>
    );
  }
  return null;
}

function NewsEntry({ entry }) {
  const rel = formatRelative(entry.published);
  return (
    <article className="news-entry">
      <div className="news-entry__head">
        <span className="news-entry__label">{entry.label}</span>
        <span className="news-entry__dot" aria-hidden="true">•</span>
        <span className="news-entry__source">{entry.source_name}</span>
        <span className="news-entry__spacer" />
        <time className="news-entry__date" dateTime={entry.published || undefined}>
          {formatDate(entry.published)}
          {rel && <span className="news-entry__rel"> ({rel})</span>}
        </time>
      </div>

      <h2 className="news-entry__title">
        <a href={entry.url || '#'} target="_blank" rel="noopener noreferrer">
          {entry.title}
        </a>
      </h2>

      <NewsMedia entry={entry} />

      {entry.excerpt && <p className="news-entry__excerpt">{entry.excerpt}</p>}

      <div className="news-entry__foot">
        <a
          className="news-entry__read"
          href={entry.url || '#'}
          target="_blank"
          rel="noopener noreferrer"
        >
          read on {entry.source_name} →
        </a>
      </div>
    </article>
  );
}

// fetches the live feed from the cloudflare worker with a short timeout. on
// any failure (network error, non-ok response, bad json, empty entries) the
// caller falls back to the bundled copy — the page always renders something.
// `bypassCache` appends ?refresh=1 which the worker honors to skip its 30-min
// edge cache — used by user-initiated pull-to-refresh so the gesture actually
// returns fresh data instead of the same cached payload.
async function fetchLiveNews(signal, bypassCache = false) {
  const url = bypassCache ? `${NEWS_API_URL}?refresh=1` : NEWS_API_URL;
  const res = await fetch(url, {
    signal,
    headers: { accept: 'application/json' },
    // worker responds with `cache-control: max-age=1800` so the browser caches
    // the response too. on a user-initiated pull we explicitly bypass that
    // — otherwise the second pull within 30 min returns the same browser-cached
    // payload and the page's "last updated" timestamp never moves.
    cache: bypassCache ? 'no-store' : 'default',
  });
  if (!res.ok) throw new Error(`worker ${res.status}`);
  const data = await res.json();
  if (!data || !Array.isArray(data.entries)) throw new Error('bad payload');
  return data;
}

const INITIAL_VISIBLE = 10;
const PAGE_STEP = 10;

export default function NewsPage() {
  const [data, setData]     = useState(null);
  const [status, setStatus] = useState('loading');
  const [visible, setVisible] = useState(INITIAL_VISIBLE);

  // shared refresh function — used both for the initial mount load and for
  // pull-to-refresh in standalone webapp mode. AbortController gives us
  // a 6-second timeout. on success the live payload replaces whatever
  // we're showing; on failure we fall back to the bundled copy.
  // `bypassCache=true` (passed by pull-to-refresh) skips the worker's edge
  // cache so the user sees fresh data, not the same 30-min-cached response.
  const refresh = useCallback(async (bypassCache = false) => {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const live = await fetchLiveNews(controller.signal, bypassCache);
      setData(live);
      setStatus('live');
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setData(bundledNews);
      setStatus('fallback');
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  const refreshFresh = useCallback(() => refresh(true), [refresh]);

  // explicit spin state so the refresh button has a guaranteed feedback
  // window (≥1.2s) even when the worker's edge cache returns in 60ms.
  // without this the icon would flash briefly and the user wouldn't see
  // any visual ack of their click.
  const [spinning, setSpinning] = useState(false);
  const handleRefreshClick = useCallback(async () => {
    if (spinning) return;
    setSpinning(true);
    const t0 = Date.now();
    try { await refreshFresh(); }
    finally {
      const elapsed = Date.now() - t0;
      const MIN_SPIN_MS = 1200;
      if (elapsed < MIN_SPIN_MS) {
        await new Promise(r => setTimeout(r, MIN_SPIN_MS - elapsed));
      }
      setSpinning(false);
    }
  }, [spinning, refreshFresh]);

  const { entries = [], updated, sources = [] } = data || {};
  const updatedText = updated
    ? new Date(updated).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }).toLowerCase()
    : null;

  return (
    <div className="news-page">
      <PullToRefresh onRefresh={refreshFresh} />
      <Spotlight />
      <header className="news-page__header">
        <h1>news</h1>
        <button
          type="button"
          className="news-page__refresh"
          onClick={handleRefreshClick}
          disabled={spinning || status === 'loading'}
          aria-label={spinning || status === 'loading' ? 'fetching news' : 'refresh news'}
          title="refresh"
        >
          <span className="news-page__refresh-label">
            {spinning || status === 'loading' ? 'fetching' : 'refresh'}
          </span>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M13.5 2.5v4h-4" />
            <path d="M13.5 6.5a5.5 5.5 0 1 0-1.5 5.7" />
          </svg>
        </button>
        {sources.length > 0 && (
          <p className="news-page__sources">
            sources: {sources.map(s => s.name).join(', ')}
          </p>
        )}
        {status === 'loading' ? (
          <span className="news-page__updated news-page__tag">refreshing…</span>
        ) : updatedText ? (
          <p className="news-page__updated">
            updated {updatedText}
            {status === 'fallback' && (
              <> · <span className="news-page__tag news-page__tag--warn">using cached copy</span></>
            )}
          </p>
        ) : null}
      </header>

      {status === 'loading' ? (
        <div className="news-page__loading">
          <div className="news-page__loading-dots">
            <span /><span /><span />
          </div>
          <p>fetching latest news…</p>
        </div>
      ) : entries.length === 0 ? (
        <p className="news-page__empty">
          no entries yet — run <code>node news/fetch-news.mjs</code> from <code>scripts/</code>.
        </p>
      ) : (
        <>
          <div className="news-list">
            {entries.slice(0, visible).map((e, i) => (
              <div key={e.id} className="news-list__item">
                {i > 0 && <hr className="news-divider" />}
                <NewsEntry entry={e} />
              </div>
            ))}
          </div>

          {visible < entries.length && (
            <button className="load-more-btn" onClick={() => setVisible(v => v + PAGE_STEP)}>
              show more
            </button>
          )}
        </>
      )}

    </div>
  );
}
