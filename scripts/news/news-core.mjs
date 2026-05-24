// shared news-pipeline core. consumed by both:
//   - worker/src/index.js     (live cloudflare worker, serves /news.json)
//   - scripts/news/fetch-news (regenerates the bundled fallback news.json)
//
// before this module existed, both files duplicated ~700 lines of parsers,
// utilities, dedup, and source list — drift between the two surfaced as
// "the live feed disagrees with the bundled fallback". now they pull the
// pipeline from one place and only differ in their environment glue
// (the worker has cors + edge cache; the script writes to disk).
//
// the runtime contract: this module assumes web-platform fetch, TextDecoder,
// and URL primitives are globally available. that's true on Node 18+ and on
// the cloudflare workers v8 runtime, which is the union of our consumers.

// ─── knobs ───────────────────────────────────────────────────────────────────

export const MAX_ENTRIES = 50;
export const EXCERPT_LEN = 220;

// real browser user-agent. some sources (pokebeach) block the default
// node/worker UA via cloudflare bot rules, so we pretend to be chrome.
export const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// ─── source list ─────────────────────────────────────────────────────────────
//
// each source entry describes one upstream site. the `kind` field selects
// which parser to use on the response body:
//   - 'rss'             → treats body as RSS 2.0 xml (parseRss)
//   - 'pokebeach-html'  → scrapes pokebeach's homepage html (parsePokebeach)
//   - 'serebii-html'    → scrapes serebii's homepage daily roundups (parseSerebii)
//
// `pokemonOnly: true` filters items whose title+excerpt doesn't mention pokemon.

export const SOURCES = [
  {
    id:   'pokebeach',
    name: 'pokebeach',
    url:  'https://www.pokebeach.com/',
    kind: 'pokebeach-html',
    // pokebeach's RSS feed endpoints (/feed, /rss, /news/feed, etc.) all
    // return 403 because they sit behind cloudflare bot protection. the
    // homepage html is not blocked, so we scrape the article listing there
    // instead. per-article pages are also blocked, so excerpts stay empty
    // for pokebeach entries — cards still render fine without them.
  },
  {
    id:   'serebii',
    name: 'serebii',
    url:  'https://www.serebii.net/',
    kind: 'serebii-html',
    // serebii's homepage posts one big daily news roundup per day, but each
    // roundup is structured internally as a series of `.pics` + `.subcat`
    // blocks — one sub-entry per topic. parseSerebii walks those sub-entries
    // and emits each as its own news item. serebii is hosted on nginx (not
    // behind cloudflare) so it's reachable from the worker reliably. the page
    // is ISO-8859-1 encoded so fetchSource decodes the raw bytes via TextDecoder.
  },
];

// keywords used by `pokemonOnly` filter. case-insensitive substring match.
export const POKEMON_KEYWORDS = ['pokemon', 'pokémon', 'pokeball', 'pokéball', 'pikachu', 'game freak'];

// ─── topic labels ────────────────────────────────────────────────────────────
//
// each news entry gets a small label/pill shown in the UI. this array is
// walked in declaration order, first match wins. ORDER MATTERS — more specific
// topics come before generic parents so "tcg pocket" isn't swallowed by bare
// "tcg", "pokemon go fest" isn't swallowed by bare "pokemon go", etc.

export const TOPIC_LABELS = [
  { label: 'pokémon tcg pocket', patterns: ['tcg pocket', 'tcg-pocket', 'pokemon pocket', 'pokémon pocket', 'tcgp'] },
  { label: 'pokémon tcg live',   patterns: ['tcg live', 'tcg-live', 'tcgl'] },

  { label: 'pokémon go',        patterns: ['pokemon go', 'pokémon go', 'niantic'] },
  { label: 'pokémon home',      patterns: ['pokemon home', 'pokémon home'] },
  { label: 'pokémon tcg',       patterns: ['tcg', 'trading card', 'card game', 'booster pack'] },
  { label: 'pokémon champions', patterns: ['pokemon champions', 'pokémon champions'] },
  { label: 'pokémon pokopia',   patterns: ['pokopia'] },
  { label: 'legends z-a',       patterns: ['legends z-a', 'legends: z-a', 'legends za'] },
  { label: 'legends arceus',    patterns: ['legends arceus', 'legends: arceus'] },
  { label: 'scarlet & violet',  patterns: ['scarlet and violet', 'scarlet & violet', 'scarlet/violet', 'paldea', 'indigo disk', 'teal mask'] },
  { label: 'sword & shield',    patterns: ['sword and shield', 'sword & shield', 'galar'] },
  { label: 'brilliant diamond', patterns: ['brilliant diamond', 'shining pearl', 'bdsp'] },
  { label: 'pokémon unite',     patterns: ['pokemon unite', 'pokémon unite'] },
  { label: 'pokémon sleep',     patterns: ['pokemon sleep', 'pokémon sleep'] },
  { label: 'pokémon masters',   patterns: ['pokemon masters', 'pokémon masters'] },
  { label: 'pokémon cafe',      patterns: ['pokemon cafe', 'pokémon café', 'pokémon cafe'] },
  { label: 'anime',             patterns: ['anime', 'horizons', 'ash ketchum'] },
  { label: 'pokémon presents',  patterns: ['pokemon presents', 'pokémon presents', 'pokemon direct'] },
  { label: 'competitive',       patterns: ['vgc', 'world championships', 'worlds 20'] },
  { label: 'merchandise',       patterns: ['plush', 'amiibo', 'merchandise', 'pokemon center', 'pokémon center'] },
];

// month name → zero-indexed month, used when parsing pokebeach's human dates.
const MONTH_MAP = {
  jan: 0, feb: 1, mar: 2, apr: 3, may:  4, jun:  5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// ─── html / xml helpers ──────────────────────────────────────────────────────

export function unwrapCdata(s) {
  if (!s) return '';
  const m = s.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return m ? m[1] : s;
}

// `&amp;` is intentionally LAST so we don't double-decode `&amp;lt;` into `<`.
export function decodeEntities(s) {
  if (!s) return '';
  return s
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g,         (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g,  '&');
}

// strip all html tags. inserts a space at every block-level closing tag
// (</p>, </div>, etc.) so adjacent paragraph words don't fuse.
export function stripHtml(html) {
  if (!html) return '';
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi,  '')
      .replace(/<\/(p|div|li|br|h[1-6]|tr|td|section|article|header|footer|blockquote)[^>]*>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
  ).replace(/\s+/g, ' ').trim();
}

// truncate to `max` chars on a word boundary if reasonable, else hard-cut.
export function truncate(s, max) {
  if (!s || s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

export function firstImage(html) {
  if (!html) return null;
  const img = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return img ? img[1] : null;
}

// grab text contents of a single tag, e.g. `<title>foo</title>` → "foo".
export function getTag(block, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  return m ? unwrapCdata(m[1]).trim() : '';
}

export function getAttr(block, tag, attr) {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}=["']([^"']+)["']`, 'i');
  const m = block.match(re);
  return m ? m[1] : null;
}

export function slugify(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// ─── rss 2.0 parser ──────────────────────────────────────────────────────────

export function parseRss(xml) {
  const items = [];
  const itemRe = /<item\b[\s\S]*?<\/item>/gi;
  const blocks = xml.match(itemRe) || [];

  for (const block of blocks) {
    const title       = stripHtml(getTag(block, 'title'));
    const link        = getTag(block, 'link');
    const pubDate     = getTag(block, 'pubDate');
    const description = getTag(block, 'description');
    const content     = getTag(block, 'content:encoded');
    const mediaUrl    = getAttr(block, 'media:content',   'url')
                     || getAttr(block, 'media:thumbnail', 'url')
                     || getAttr(block, 'enclosure',       'url');
    const categories = [...block.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi)]
      .map(m => stripHtml(unwrapCdata(m[1])))
      .filter(Boolean);

    items.push({ title, link, pubDate, description, content, mediaUrl, categories });
  }
  return items;
}

// ─── pokebeach scraper ───────────────────────────────────────────────────────

// pokebeach prints dates like "Apr 12, 2026 at 10:54 PM". their servers run
// on eastern time; we approximate by treating the date as UTC-4 (EDT), which
// is correct for most of the year. precision isn't critical for "X ago" display.
export function parsePokebeachDate(text) {
  if (!text) return null;
  const m = text.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})(?:\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM))?/i);
  if (!m) return null;

  const mon = MONTH_MAP[m[1].slice(0, 3).toLowerCase()];
  if (mon === undefined) return null;
  const day  = Number(m[2]);
  const year = Number(m[3]);
  let hour = m[4] ? Number(m[4]) : 12;
  const min  = m[5] ? Number(m[5]) : 0;
  const mer  = m[6] ? m[6].toUpperCase() : null;

  if (mer === 'PM' && hour < 12) hour += 12;
  if (mer === 'AM' && hour === 12) hour = 0;

  // shift eastern time → UTC by adding 4 hours before building the Date.
  const d = new Date(Date.UTC(year, mon, day, hour + 4, min, 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parsePokebeach(html) {
  const items = [];
  const articleRe = /<article\s+id="post-(\d+)"\s+class="([^"]*)">([\s\S]*?)<\/article>/gi;
  let match;

  while ((match = articleRe.exec(html)) !== null) {
    const postId    = match[1];
    const classAttr = match[2];
    const body      = match[3];

    const catMatch = classAttr.match(/category-([a-z0-9-]+)/i);
    const category = catMatch ? catMatch[1] : null;

    const titleMatch = body.match(/<h2[^>]*class="entry-title[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i);
    if (!titleMatch) continue;
    const url   = decodeEntities(titleMatch[1]);
    const title = stripHtml(titleMatch[2]);

    let image = null;
    const imgBlock = body.match(/class="xpress_articleImage--full"[\s\S]*?<img[^>]+src="([^"]+)"/i);
    if (imgBlock) image = decodeEntities(imgBlock[1]);
    if (!image) image = firstImage(body);

    let dateText = null;
    const dateBlock = body.match(/<span class="screen-reader-text">Posted on<\/span>\s*<a[^>]*>([^<]+)<\/a>/i);
    if (dateBlock) dateText = stripHtml(dateBlock[1]);
    const parsed = parsePokebeachDate(dateText);

    items.push({
      title,
      link:        url,
      pubDate:     parsed ? parsed.toUTCString() : null,
      description: '',
      content:     '',
      mediaUrl:    image,
      categories:  category ? [category.replace(/-/g, ' ')] : [],
      _postId:     postId,
    });
  }
  return items;
}

// ─── serebii scraper ─────────────────────────────────────────────────────────

const SEREBII_BASE = 'https://www.serebii.net';

export function resolveSerebiiUrl(u) {
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('/')) return SEREBII_BASE + u;
  return SEREBII_BASE + '/' + u;
}

export function parseSerebiiDate(text) {
  if (!text) return null;
  const m = text.match(/(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const day   = Number(m[1]);
  const month = Number(m[2]) - 1;
  const year  = Number(m[3]);
  const hour  = Number(m[4]);
  const min   = Number(m[5]);
  const d = new Date(Date.UTC(year, month, day, hour - 1, min, 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

const SEREBII_BOILERPLATE_PREFIXES = [
  /^the pok[eé]mon company(?: international)? has (?:announced|revealed|confirmed)(?: that)?\s+/i,
  /^niantic has (?:announced|revealed|confirmed)(?: that)?\s+/i,
  /^nintendo has (?:announced|revealed|confirmed)(?: that)?\s+/i,
  /^game freak has (?:announced|revealed|confirmed)(?: that)?\s+/i,
  /^it has (?:just )?been (?:officially )?(?:announced|revealed|confirmed)(?: that)?\s+/i,
  /^it's been (?:officially )?(?:announced|revealed|confirmed)(?: that)?\s+/i,
  /^following(?: on from)? (?:the )?(?:previous|recent|yesterday's).*?,\s+/i,
  /^as (?:was )?(?:announced|revealed|teased|confirmed)(?: previously| earlier| yesterday)?,\s+/i,
];

const SEREBII_GENERIC_OPENERS = [
  /has (?:announced|begun|started|revealed) (?:the )?(?:next|latest) (?:event|delivery focus|update|patch|run)$/i,
  /has (?:been )?(?:announced|revealed)$/i,
  /has received (?:a|an|its) (?:latest )?(?:bug[- ]fix )?(?:update|patch)$/i,
  /^(?:the )?(?:next|latest) .+ (?:event|update) has (?:been announced|begun|started)$/i,
  /has announced some(?: big)? changes/i,
  /has announced the next delivery focus$/i,
];

export function serebiiFirstSentenceEnd(text) {
  const m = text.match(/[.!?](?=\s+[A-Z]|\s*$)/);
  return m ? m.index + 1 : -1;
}

export function inferSerebiiTitle(topicTitle, bodyText) {
  if (!bodyText) return topicTitle;
  const stripTerminal = (s) => s.replace(/[.!?]+$/, '').trim();

  const end1 = serebiiFirstSentenceEnd(bodyText);
  let sentence = end1 >= 0 ? bodyText.slice(0, end1) : bodyText;
  let candidate = stripTerminal(sentence);

  if (SEREBII_GENERIC_OPENERS.some(re => re.test(candidate)) && end1 >= 0) {
    const rest = bodyText.slice(end1).replace(/^\s+/, '');
    const end2 = serebiiFirstSentenceEnd(rest);
    const tail = end2 >= 0 ? rest.slice(0, end2) : rest;
    candidate = stripTerminal(bodyText.slice(0, end1) + ' ' + tail);
  }

  let stripped = false;
  for (const re of SEREBII_BOILERPLATE_PREFIXES) {
    const next = candidate.replace(re, '');
    if (next !== candidate) { candidate = next; stripped = true; }
  }
  if (stripped && candidate.length > 0) {
    candidate = candidate.charAt(0).toUpperCase() + candidate.slice(1);
  }

  const MAX = 110;
  if (candidate.length > MAX) {
    const cut = candidate.slice(0, MAX);
    const lastSpace = cut.lastIndexOf(' ');
    candidate = (lastSpace > MAX * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
  }

  if (candidate.length < 18) return topicTitle;
  if (candidate.toLowerCase() === topicTitle.toLowerCase()) return topicTitle;
  return candidate;
}

export function parseSerebii(html) {
  const items = [];
  const dayRe = /<h2><a\s+href="(\/news\/\d{4}\/[^"]+\.shtml)"[^>]*>([\s\S]*?)<\/a><\/h2>([\s\S]*?)<!-- end_news -->/gi;

  let match;
  while ((match = dayRe.exec(html)) !== null) {
    const dayUrl  = resolveSerebiiUrl(match[1]);
    const dayBody = match[3];

    const dateMatch = dayBody.match(/<span class="date">([^<]+)<\/span>/i);
    const parsedDate = dateMatch ? parseSerebiiDate(dateMatch[1]) : null;

    const picsRe = /<div class="pics">([\s\S]*?)<\/div>\s*<div class="subcat"[^>]*>([\s\S]*?)<\/div>/gi;
    let picMatch;
    let subIndex = 0;
    while ((picMatch = picsRe.exec(dayBody)) !== null) {
      const picsBlock   = picMatch[1];
      const subcatBlock = picMatch[2];

      const hrefMatch = picsBlock.match(/<a[^>]+href="([^"]+)"/i);
      const imgMatch  = picsBlock.match(/<img[^>]+src="([^"]+)"/i);
      const picHref   = hrefMatch ? resolveSerebiiUrl(decodeEntities(hrefMatch[1])) : dayUrl;
      const image     = imgMatch  ? resolveSerebiiUrl(decodeEntities(imgMatch[1]))  : null;

      const titleMatch = subcatBlock.match(/<p class="title">([\s\S]*?)<\/p>/i);
      if (!titleMatch) { subIndex++; continue; }
      const topicTitle = stripHtml(titleMatch[1]);

      const deptMatch = subcatBlock.match(/<h3>([\s\S]*?)<\/h3>/i);
      const dept = deptMatch ? stripHtml(deptMatch[1]) : '';

      // skip serebii's recurring "Pokémon of the Week" feature — it's
      // a templated weekly write-up on a single mon (compiled by their
      // writer Mestorn) rather than actual pokemon news. each entry is
      // boilerplate-heavy and crowds out genuine news in the feed.
      // three reinforcing signals so we catch wording or markup tweaks:
      //   - department heading "In The Pokémon of the Week Department"
      //   - subcat title "Who's That Pokémon"
      //   - the /potw-champions/ url namespace these always link into
      const isPotW =
        /pok[eé]mon of the week/i.test(dept) ||
        /who'?s that pok[eé]mon/i.test(topicTitle) ||
        /\/potw-champions\//i.test(picHref || '') ||
        /\/potw-champions\//i.test(image  || '');
      if (isPotW) { subIndex++; continue; }

      let bodyHtml = subcatBlock
        .replace(/<h3>[\s\S]*?<\/h3>/i, '')
        .replace(/<p class="title">[\s\S]*?<\/p>/i, '');

      const derivedTitle = inferSerebiiTitle(topicTitle, stripHtml(bodyHtml));

      items.push({
        title:       derivedTitle,
        link:        picHref,
        pubDate:     parsedDate ? parsedDate.toUTCString() : null,
        description: stripHtml(bodyHtml),
        content:     bodyHtml,
        mediaUrl:    image,
        categories:  [dept, topicTitle].filter(Boolean),
        _subIndex:   subIndex++,
      });
    }
  }

  return items;
}

// ─── normalize ───────────────────────────────────────────────────────────────

export function deriveLabel(title, excerpt, tags = []) {
  const hay = `${title} ${excerpt} ${tags.join(' ')}`.toLowerCase();
  for (const t of TOPIC_LABELS) {
    if (t.patterns.some(p => hay.includes(p))) return t.label;
  }
  return 'pokémon news';
}

export function firstYoutubeId(html) {
  if (!html) return null;
  const patterns = [
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/,
    /youtube-nocookie\.com\/embed\/([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1];
  }
  return null;
}

export function matchesPokemon(title, excerpt) {
  const hay = `${title} ${excerpt}`.toLowerCase();
  return POKEMON_KEYWORDS.some(k => hay.includes(k));
}

export function normalize(source, raw) {
  const published = raw.pubDate ? new Date(raw.pubDate) : null;
  const iso = published && !Number.isNaN(published.getTime()) ? published.toISOString() : null;

  const body = raw.content || raw.description || '';
  const excerpt = truncate(stripHtml(body), EXCERPT_LEN);
  const image = raw.mediaUrl || firstImage(body) || null;
  const youtubeId = firstYoutubeId(body);

  const label = deriveLabel(raw.title || '', excerpt || '', raw.categories || []);

  // stable id = source + date (for daily uniqueness) + slugified title.
  // two runs produce the same id for the same article — enables cross-source
  // and cross-cache-window dedup.
  const dateKey = iso ? iso.slice(0, 10) : 'undated';
  const id = `${source.id}-${dateKey}-${slugify(raw.title) || 'untitled'}`;

  return {
    id,
    source:      source.id,
    source_name: source.name,
    label,
    title:       raw.title || '(untitled)',
    url:         raw.link  || null,
    published:   iso,
    excerpt,
    image,
    youtube_id:  youtubeId,
    tags:        (raw.categories || []).slice(0, 5),
  };
}

// ─── source fetching ─────────────────────────────────────────────────────────

export async function fetchSource(source) {
  const isHtml = source.kind === 'pokebeach-html' || source.kind === 'serebii-html';
  const accept = isHtml
    ? 'text/html,application/xhtml+xml'
    : 'application/rss+xml, application/xml, text/xml, */*';

  // the `cf:` field is a cloudflare-specific extension to fetch options. on
  // the workers runtime, `cacheTtl: 0` + `cacheEverything: false` tells
  // cloudflare NOT to cache the upstream response transparently — we control
  // caching ourselves in the worker's request handler. on Node this field is
  // silently ignored by the native fetch implementation, which is what we want.
  const res = await fetch(source.url, {
    headers: {
      'user-agent':      USER_AGENT,
      accept,
      'accept-language': 'en-US,en;q=0.9',
    },
    cf: { cacheTtl: 0, cacheEverything: false },
  });

  if (!res.ok) throw new Error(`${source.id}: ${res.status} ${res.statusText}`);

  // serebii is ISO-8859-1 encoded. read the raw bytes and decode using the
  // charset from the content-type header, falling back to utf-8 otherwise.
  let body;
  if (isHtml) {
    const buf = await res.arrayBuffer();
    const ct = res.headers.get('content-type') || '';
    const m = ct.match(/charset=([\w-]+)/i);
    const charset = (m ? m[1] : 'utf-8').toLowerCase();
    body = new TextDecoder(charset).decode(buf);
  } else {
    body = await res.text();
  }

  let raws;
  if      (source.kind === 'pokebeach-html') raws = parsePokebeach(body);
  else if (source.kind === 'serebii-html')   raws = parseSerebii(body);
  else                                       raws = parseRss(body);

  let items = raws.map(r => normalize(source, r));

  if (source.pokemonOnly) {
    items = items.filter(i => matchesPokemon(i.title, i.excerpt));
  }

  return items;
}

// ─── cross-source dedup ──────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the','a','an','and','or','is','are','was','were','be','been','being','to',
  'for','of','in','on','at','by','with','from','as','that','this','these',
  'those','it','its','but','not','if','then','so','has','have','had','will',
  'would','can','could','should','may','might','just','new','now','up','out',
]);

export function titleWords(s) {
  const out = new Set();
  if (!s) return out;
  const cleaned = s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  for (const w of cleaned.split(/\s+/)) {
    if (w.length < 3) continue;
    if (STOP_WORDS.has(w)) continue;
    if (/^\d+$/.test(w)) continue;
    out.add(w);
  }
  return out;
}

export function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return intersection / union;
}

export function qualityScore(e) {
  let s = 0;
  if (e.image)     s += 3;
  if (e.excerpt)   s += 2;
  if (e.published) s += 1;
  return s;
}

const SIMILARITY_THRESHOLD = 0.7;
const SIMILARITY_WINDOW_MS = 48 * 60 * 60 * 1000;

export function withinWindow(isoA, isoB) {
  if (!isoA || !isoB) return true; // can't disprove — allow jaccard to decide
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return true;
  return Math.abs(a - b) <= SIMILARITY_WINDOW_MS;
}

export function dedupeEntries(entries) {
  const kept = [];
  const keptWords = [];
  let collapsed = 0;
  for (const entry of entries) {
    const words = titleWords(entry.title);
    let dupIndex = -1;
    for (let i = 0; i < kept.length; i++) {
      // only compare entries from DIFFERENT sources. within one source the
      // id-based dedup is authoritative — legitimate same-day sub-entries
      // sharing topic names shouldn't get collapsed.
      if (entry.source === kept[i].source) continue;
      if (!withinWindow(entry.published, kept[i].published)) continue;
      if (jaccard(words, keptWords[i]) >= SIMILARITY_THRESHOLD) {
        dupIndex = i;
        break;
      }
    }
    if (dupIndex === -1) {
      kept.push(entry);
      keptWords.push(words);
    } else {
      collapsed++;
      if (qualityScore(entry) > qualityScore(kept[dupIndex])) {
        kept[dupIndex] = entry;
        keptWords[dupIndex] = words;
      }
    }
  }
  return { kept, collapsed };
}

// ─── orchestration ───────────────────────────────────────────────────────────

// fetches every source in parallel (Promise.allSettled — one bad source
// doesn't poison the batch), dedupes, sorts, caps at MAX_ENTRIES, returns
// the canonical payload object the worker serves and the bundled fallback
// stores. environment glue (writing to disk, building Response objects,
// edge cache) is left to the caller.
export async function buildPayload() {
  const settled = await Promise.allSettled(SOURCES.map(fetchSource));

  const all    = [];
  const failed = [];

  settled.forEach((s, i) => {
    const source = SOURCES[i];
    if (s.status === 'fulfilled') {
      all.push(...s.value);
    } else {
      failed.push({ id: source.id, error: String(s.reason && s.reason.message || s.reason) });
    }
  });

  // first-pass: dedupe by stable id (same article from one source twice).
  const seenIds = new Set();
  const byId = all.filter(e => {
    if (seenIds.has(e.id)) return false;
    seenIds.add(e.id);
    return true;
  });

  // second-pass: cross-source title-similarity dedup.
  const { kept: deduped, collapsed } = dedupeEntries(byId);

  // sort newest-first; iso strings sort correctly lexicographically. undated
  // entries sink to the bottom.
  deduped.sort((a, b) => {
    if (!a.published && !b.published) return 0;
    if (!a.published) return  1;
    if (!b.published) return -1;
    return b.published.localeCompare(a.published);
  });

  return {
    updated:   new Date().toISOString(),
    count:     Math.min(deduped.length, MAX_ENTRIES),
    collapsed,
    sources:   SOURCES.map(s => ({ id: s.id, name: s.name, url: s.url })),
    failed,
    entries:   deduped.slice(0, MAX_ENTRIES),
  };
}
