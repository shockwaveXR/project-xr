/**
 * fetch-tcgp-obtain-methods.js
 *
 * patches `obtain_method` onto each item in app/src/data/tcgp-accessories.json
 * by pairing items with strings scraped from game8.co (primary) and
 * serebii.net (fallback). bulbagarden — our image source — doesn't expose
 * how-to-get strings, so this script lives separately and runs over the
 * already-scraped accessories file.
 *
 * source preference (per agent research):
 *   icons / sleeves / coins / playmats / backdrops → game8 first, serebii fallback
 *   binder-covers / emblems                       → serebii first, game8 fallback
 *
 * pairing: items match by a 5-stage normalized name key:
 *   1. strip category suffix ("Card Sleeve", "Coin", "Playmat", etc.)
 *   2. NFKD normalize, drop diacritics, lowercase
 *   3. drop noise tokens (the/and/pokemon/ver/version/tcg/pocket)
 *   4. token-set sort so reorderings match ("Adaman Irida" ≡ "Irida Adaman")
 *   5. fall back to a key without leading event prefixes (mega rising / pulsing
 *      aura / etc.) for bulbagarden's event-prefixed names
 *
 * usage:
 *   node db/fetch-tcgp-obtain-methods.js                # patch all categories
 *   node db/fetch-tcgp-obtain-methods.js --verbose      # log unmatched names
 */

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const ACCESSORIES_PATH = path.join(__dirname, '../../app/src/data/tcgp-accessories.json');
const UA               = 'Mozilla/5.0 (compatible; pokedex-scraper)';
const DELAY_MS         = 800;

// game8 hub pages — one "List of X" article per category
const GAME8_URLS = {
  icons:           'https://game8.co/games/Pokemon-TCG-Pocket/archives/482824',
  sleeves:         'https://game8.co/games/Pokemon-TCG-Pocket/archives/482802',
  coins:           'https://game8.co/games/Pokemon-TCG-Pocket/archives/482691',
  playmats:        'https://game8.co/games/Pokemon-TCG-Pocket/archives/482813',
  backdrops:       'https://game8.co/games/Pokemon-TCG-Pocket/archives/482684',
  // game8 doesn't have dedicated pages for binder covers + emblems; serebii fills those
};

// serebii pages — "Obtained by<br />X" or "<b>Method</b><br />X" patterns
const SEREBII_URLS = {
  sleeves:         'https://www.serebii.net/tcgpocket/sleeves.shtml',
  coins:           'https://www.serebii.net/tcgpocket/coins.shtml',
  playmats:        'https://www.serebii.net/tcgpocket/playmats.shtml',
  emblems:         'https://www.serebii.net/tcgpocket/emblems.shtml',
  'binder-covers': 'https://www.serebii.net/tcgpocket/binders.shtml',
  icons:           'https://www.serebii.net/tcgpocket/icons.shtml',
};

const SEREBII_FIRST = new Set(['binder-covers', 'emblems']);

const NOISE_TOKENS = new Set(['the', 'and', 'pokemon', 'ver', 'version', 'tcg', 'pocket']);

// event prefixes bulbagarden uses to disambiguate items across sets
// ("Mega Rising Mega Altaria" vs just "Mega Altaria" elsewhere)
const EVENT_PREFIXES = [
  'mega rising', 'mega shine', 'pulsing aura', 'paldean wonders',
  'fantastical parade', 'crimson blaze', 'wisdom of sea and sky',
  'celestial guardians', 'space-time smackdown', 'genetic apex',
  'mythical island', 'triumphant light', 'shining revelry',
  'extradimensional crisis', 'eevee grove',
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function stripHtml(s) {
  return s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&eacute;/gi, 'é')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// tidy run-on strings the source tables produce when a generic method label
// and its detail line get flattened together (a <br> collapses to a space):
//   "Obtain from a mission Mission: Collect 3 Electrode Cards"
//     → "Complete the mission: Collect 3 Electrode Cards"
//   "...themed collection mission Mission: To be determined"
//     → "...themed collection"   (drop the unknown-detail placeholder tail)
//   "...Drop Event Mission: To be determined"  → "...Drop Event"
// everything else passes through untouched.
function cleanMethod(s) {
  if (!s) return s;
  let m = s.replace(/\s+/g, ' ').trim();
  m = m.replace(/\s*\bmission\s+Mission:\s*to be determined\.?$/i, '');
  m = m.replace(/\s*\bMission:\s*to be determined\.?$/i, '');
  m = m.replace(/^Obtain from a mission\s+Mission:\s*/i, 'Complete the mission: ');
  return m.replace(/\s+/g, ' ').trim();
}

function stripCategorySuffix(name) {
  return name
    .replace(/\s+(Card\s+Sleeve|Pokemon\s+Coin|Coin|Playmat|Backdrop|Binder\s+Cover|Cover|Emblem|Profile\s+Icon|Icon)\b/gi, '')
    .replace(/\s+\(?Currently Unavailable\)?\s*$/i, '')
    .trim();
}

function normalizeKey(rawName) {
  const stripped = stripCategorySuffix(rawName)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')   // strip combining diacritics
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const tokens = stripped.split(/\s+/).filter(t => t && !NOISE_TOKENS.has(t));
  return tokens.sort().join(' ');
}

// also produce a key with leading event-prefix removed, for matching
// bulbagarden's prefixed names against unprefixed wiki entries
function normalizeKeyWithoutEventPrefix(rawName) {
  let s = stripCategorySuffix(rawName)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  for (const prefix of EVENT_PREFIXES) {
    if (s.startsWith(prefix + ' ')) {
      s = s.slice(prefix.length + 1);
      break;
    }
  }
  s = s.replace(/&/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  const tokens = s.split(/\s+/).filter(t => t && !NOISE_TOKENS.has(t));
  return tokens.sort().join(' ');
}

async function fetchHtml(url) {
  const { data } = await axios.get(url, {
    headers: { 'User-Agent': UA },
    timeout: 30000,
  });
  return data;
}

// game8 — find the largest <table>, parse 2-column rows, skip the header.
function parseGame8(html) {
  const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/g)].map(m => m[0]);
  if (!tables.length) return [];
  tables.sort((a, b) => (b.match(/<tr/g) || []).length - (a.match(/<tr/g) || []).length);
  const big = tables[0];

  const rows = [];
  const rowMatches = [...big.matchAll(/<tr[\s\S]*?<\/tr>/g)];
  for (const m of rowMatches) {
    const tr    = m[0];
    const cells = [...tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(c => stripHtml(c[1]));
    if (cells.length < 2) continue;
    if (/^Item$/i.test(cells[0]) && /^How to Get$/i.test(cells[1])) continue;  // header
    const name   = cells[0];
    const method = cells[1];
    if (!name || !method) continue;
    rows.push({ name, method });
  }
  return rows;
}

// serebii — pair `<td class="fooevo">{name}</td>` with the next `<td class="cen">`
// that contains "Obtained by" or "<b>Method</b>". skip colspan'd fooevo cells
// (those are gallery-section headers, not items).
function parseSerebii(html) {
  const fooevoMatches = [...html.matchAll(/<td class="fooevo"([^>]*)>([\s\S]*?)<\/td>/g)];
  const cenMatches    = [...html.matchAll(/<td class="cen"[^>]*>([\s\S]*?)<\/td>/g)];

  const names = [];
  for (const m of fooevoMatches) {
    const attrs = m[1] || '';
    if (/colspan="?\d+"?/i.test(attrs)) continue;   // section headers span the table — not actual items
    const name = stripHtml(m[2]);
    if (name) names.push(name);
  }

  const methods = [];
  for (const m of cenMatches) {
    const inner = m[1];
    if (!/Obtained by|<b>\s*Method\s*<\/b>/i.test(inner)) continue;
    const text = stripHtml(inner)
      .replace(/^(Obtained by|Method\s*[:\-]?)\s*/i, '')
      .trim();
    if (text) methods.push(text);
  }

  // pair by index — serebii consistently emits names then images then methods
  // in matching order so the Nth name pairs with the Nth method-cell
  const out = [];
  const len = Math.min(names.length, methods.length);
  for (let i = 0; i < len; i++) {
    if (names[i] && methods[i]) out.push({ name: names[i], method: methods[i] });
  }
  return out;
}

async function loadCategoryRows(cat) {
  const useSerebiiFirst = SEREBII_FIRST.has(cat);
  const primaryUrl   = useSerebiiFirst ? SEREBII_URLS[cat]   : GAME8_URLS[cat];
  const fallbackUrl  = useSerebiiFirst ? GAME8_URLS[cat]     : SEREBII_URLS[cat];
  const primaryParse  = useSerebiiFirst ? parseSerebii       : parseGame8;
  const fallbackParse = useSerebiiFirst ? parseGame8         : parseSerebii;

  const primary = new Map();
  const fallback = new Map();

  if (primaryUrl) {
    try {
      const html = await fetchHtml(primaryUrl);
      const rows = primaryParse(html);
      for (const { name, method } of rows) {
        const k = normalizeKey(name);
        if (k && !primary.has(k)) primary.set(k, method);
      }
      console.log(`  primary: ${rows.length} rows from ${primaryUrl}`);
      await sleep(DELAY_MS);
    } catch (e) {
      console.warn(`  [warn] primary fetch failed for ${cat}: ${e.message}`);
    }
  }

  if (fallbackUrl) {
    try {
      const html = await fetchHtml(fallbackUrl);
      const rows = fallbackParse(html);
      for (const { name, method } of rows) {
        const k = normalizeKey(name);
        if (k && !fallback.has(k)) fallback.set(k, method);
      }
      console.log(`  fallback: ${rows.length} rows from ${fallbackUrl}`);
      await sleep(DELAY_MS);
    } catch (e) {
      console.warn(`  [warn] fallback fetch failed for ${cat}: ${e.message}`);
    }
  }

  return { primary, fallback };
}

async function main() {
  const verbose = process.argv.includes('--verbose');

  const accessories = JSON.parse(fs.readFileSync(ACCESSORIES_PATH, 'utf-8'));
  console.log(`loaded ${accessories.length} accessories from ${ACCESSORIES_PATH}`);

  const categories = ['icons', 'sleeves', 'coins', 'playmats', 'backdrops', 'binder-covers', 'emblems'];

  const sourceMaps = {};
  for (const cat of categories) {
    console.log(`\n[${cat}]`);
    sourceMaps[cat] = await loadCategoryRows(cat);
  }

  // pair items with obtain methods
  let matched = 0;
  let missed  = 0;
  const unmatchedByCat = {};

  for (const item of accessories) {
    const cat = item.category;
    const sources = sourceMaps[cat];
    if (!sources) {
      item.obtain_method = null;
      missed++;
      continue;
    }
    const k1 = normalizeKey(item.name);
    const k2 = normalizeKeyWithoutEventPrefix(item.name);
    const method =
      sources.primary.get(k1)  || sources.primary.get(k2)
      || sources.fallback.get(k1) || sources.fallback.get(k2);
    if (method) {
      item.obtain_method = cleanMethod(method);
      matched++;
    } else {
      item.obtain_method = null;
      missed++;
      (unmatchedByCat[cat] = unmatchedByCat[cat] || []).push(item.name);
    }
  }

  console.log(`\n✓ matched ${matched}/${accessories.length} (${(100 * matched / accessories.length).toFixed(1)}%)`);
  console.log(`  missed ${missed}`);
  for (const [cat, names] of Object.entries(unmatchedByCat)) {
    console.log(`  ${cat}: ${names.length} unmatched`);
    if (verbose) names.forEach(n => console.log(`    - ${n}`));
  }

  fs.writeFileSync(ACCESSORIES_PATH, JSON.stringify(accessories, null, 2));
  console.log(`\nwrote ${ACCESSORIES_PATH}`);
}

main().catch(e => { console.error(e); process.exit(1); });
