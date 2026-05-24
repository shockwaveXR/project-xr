// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  pokedex-news worker                                                     ║
// ║  --------------------                                                    ║
// ║  cloudflare worker serving two endpoints:                                ║
// ║                                                                          ║
// ║    GET /news.json — live news feed                                       ║
// ║      1. check the per-region edge cache for a pre-built response         ║
// ║      2. cache HIT  → return it instantly (~60ms)                         ║
// ║      3. cache MISS → buildPayload() (parallel upstream fetches),         ║
// ║                      write back to the edge cache, return                ║
// ║                                                                          ║
// ║    GET /live — twitch streaming status                                   ║
// ║      1. check 60s edge cache                                             ║
// ║      2. miss → mint app access token (oauth client credentials),         ║
// ║                call helix /streams?user_login=$TWITCH_CHANNEL,           ║
// ║                return { isLive, title, viewers, started_at, ... }        ║
// ║      tokens are NOT cached on the worker (would need KV) — minted        ║
// ║      per cache miss (~once a minute peak) which is well under twitch's   ║
// ║      ~800 token requests/hour rate limit.                                ║
// ║                                                                          ║
// ║  the news parsing/dedup/normalization pipeline lives in                  ║
// ║  scripts/news/news-core.mjs — shared with the bundled-fallback           ║
// ║  generator at scripts/news/fetch-news.mjs so they can never drift.       ║
// ║  what's in this file is purely worker glue: CORS, edge cache, routing.  ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { buildPayload } from '../../scripts/news/news-core.mjs';

// edge cache TTL for /news.json. tuning balance: ~30 min keeps news fresh
// while keeping upstream fetches at most ~twice per cache window per
// cloudflare region. override per-request with ?refresh=1 to bypass.
const CACHE_TTL_SECONDS = 30 * 60;

// edge cache TTL for /live. shorter window because stream state can flip on/off
// in real time and the badge feels stale if the cache holds too long. 60s
// trades a small amount of freshness lag for keeping helix calls bounded.
const LIVE_CACHE_TTL_SECONDS = 60;

// the frontend lives at voltage770.github.io and the worker lives at
// *.workers.dev — cross-origin, so the browser blocks responses without
// these headers. '*' is fine because we serve public data with no credentials.
const CORS_HEADERS = {
  'access-control-allow-origin':  '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-max-age':       '86400',
};

function jsonResponse(obj, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: {
      'content-type':  'application/json; charset=utf-8',
      // BROWSER cache window — kept short (2 min) so a parser-side fix
      // doesn't get pinned in visitor browsers for half an hour. the
      // edge cache (CACHE_TTL_SECONDS, ~30 min) still handles the heavy
      // lifting of keeping upstream calls rare; browsers just re-check
      // freshness more often, which is cheap because the edge usually
      // returns within ~60ms.
      'cache-control': 'public, max-age=120',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    // CORS preflight — browsers send OPTIONS before cross-origin requests
    // that aren't simple GET/HEAD. respond 204 with the CORS headers.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('method not allowed', { status: 405, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '/health') {
      return jsonResponse({
        ok: true,
        service: 'pokedex-news',
        endpoint: '/news.json',
        cache_ttl_seconds: CACHE_TTL_SECONDS,
      });
    }

    if (url.pathname === '/live') {
      return handleLive(url, env, ctx);
    }

    if (url.pathname !== '/news.json') {
      return new Response('not found', { status: 404, headers: CORS_HEADERS });
    }

    // edge cache: caches.default is cloudflare's per-data-center cache, used
    // like a key/value store of Request → Response. cache key is the bare
    // origin + pathname + a CACHE_VERSION suffix — ?refresh=1 is stripped
    // so a refresh OVERWRITES the same entry the un-suffixed url reads.
    // bumping CACHE_VERSION effectively invalidates every region's cached
    // payload in one shot (old key no longer matches; next request misses
    // and rebuilds fresh). bump this when a parser change ships and we
    // can't wait for the 30-min ttl in each colo to expire naturally.
    const CACHE_VERSION = 'v2';
    const cache    = caches.default;
    const cacheKey = new Request(`${url.origin}${url.pathname}?cv=${CACHE_VERSION}`, { method: 'GET' });
    const bypass   = url.searchParams.get('refresh') === '1';

    if (!bypass) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const h = new Headers(cached.headers);
        h.set('x-cache', 'HIT');
        return new Response(cached.body, { status: cached.status, headers: h });
      }
    }

    // cache miss: build a fresh payload from the shared core.
    let payload;
    try {
      payload = await buildPayload();
    } catch (err) {
      // buildPayload only throws on truly unexpected bugs — failed sources
      // land in the returned `failed[]`, not in a thrown error. return a
      // non-cacheable error response so the next request retries clean.
      return jsonResponse(
        { error: 'fetch failed', detail: String(err && err.message || err) },
        { 'cache-control': 'no-store', 'x-cache': 'ERROR' },
      );
    }

    const response = jsonResponse(payload, { 'x-cache': 'MISS' });

    // ctx.waitUntil keeps the worker alive long enough to finish the cache
    // write AFTER we return — user gets the response immediately, no extra
    // latency. clone() because Response bodies can only be read once.
    ctx.waitUntil(cache.put(cacheKey, response.clone()));

    return response;
  },
};

// ─── /live handler ────────────────────────────────────────────────────────────
//
// returns:
//   { isLive: true,  channel, title, viewers, game, startedAt, thumbnail } when streaming
//   { isLive: false, channel } when offline (helix returns an empty data array)
//
// edge cache is identical to /news.json's pattern — Cache API keyed on the URL,
// with `?refresh=1` bypassing for force-fresh checks. failures (missing creds,
// twitch outage) return `{ isLive: false }` rather than 5xx so the frontend
// can keep rendering as "offline" without breaking — a bad worker shouldn't
// ever cause the page to think you're live when you aren't.
async function handleLive(url, env, ctx) {
  const cache    = caches.default;
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  const bypass   = url.searchParams.get('refresh') === '1';

  if (!bypass) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const h = new Headers(cached.headers);
      h.set('x-cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers: h });
    }
  }

  const channel      = env.TWITCH_CHANNEL;
  const clientId     = env.TWITCH_CLIENT_ID;
  const clientSecret = env.TWITCH_CLIENT_SECRET;

  if (!channel || !clientId || !clientSecret) {
    // missing config — return a cacheable "offline" so we don't hammer the
    // worker if the user forgot to wire the secrets. set 30s ttl so updates
    // pick up quickly once secrets are added.
    return jsonResponse(
      { isLive: false, channel: channel || null, error: 'twitch credentials not configured' },
      { 'cache-control': 'public, max-age=30', 'x-cache': 'CONFIG-MISS' },
    );
  }

  let payload;
  try {
    payload = await fetchTwitchLive(channel, clientId, clientSecret);
  } catch (err) {
    // any failure → treat as offline. log via response header so it shows up
    // in `wrangler tail` for debugging.
    return jsonResponse(
      { isLive: false, channel },
      { 'cache-control': 'no-store', 'x-cache': 'ERROR', 'x-error': String(err?.message || err).slice(0, 200) },
    );
  }

  const response = new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'content-type':  'application/json; charset=utf-8',
      'cache-control': `public, max-age=${LIVE_CACHE_TTL_SECONDS}`,
      ...CORS_HEADERS,
      'x-cache': 'MISS',
    },
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

// twitch oauth client-credentials flow + helix /streams call. returns the
// normalized live-status payload. throws on network / 4xx / 5xx so the caller
// can return a safe "offline" fallback.
//
// we mint a fresh app access token per cache miss instead of caching the token
// in KV. tokens last ~60 days but on a 60-second cache window the worker will
// only mint ~once a minute peak, well under twitch's documented oauth rate
// limit (~800/hr per client_id). simplicity > optimization here.
async function fetchTwitchLive(channel, clientId, clientSecret) {
  // 1. mint an app access token
  const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      grant_type:    'client_credentials',
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`twitch oauth ${tokenRes.status}`);
  }
  const tokenJson = await tokenRes.json();
  const accessToken = tokenJson.access_token;
  if (!accessToken) throw new Error('twitch oauth: no access_token in response');

  // 2. query helix /streams
  const streamsRes = await fetch(
    `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(channel)}`,
    {
      headers: {
        'authorization': `Bearer ${accessToken}`,
        'client-id':     clientId,
      },
    },
  );
  if (!streamsRes.ok) throw new Error(`twitch helix ${streamsRes.status}`);
  const streamsJson = await streamsRes.json();
  const stream = Array.isArray(streamsJson?.data) ? streamsJson.data[0] : null;

  if (!stream) {
    return { isLive: false, channel };
  }
  // helix thumbnail_url ships with `{width}` / `{height}` placeholders that the
  // caller substitutes. fill in a sensible default here so the frontend can
  // use the URL directly without re-templating.
  const thumbnail = stream.thumbnail_url
    ?.replace('{width}',  '440')
    ?.replace('{height}', '248') || null;

  return {
    isLive:    true,
    channel,
    title:     stream.title || '',
    viewers:   stream.viewer_count ?? 0,
    game:      stream.game_name || '',
    startedAt: stream.started_at || null,
    thumbnail,
  };
}
