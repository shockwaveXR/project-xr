/**
 * probe-serebii-potd.mjs
 *
 * read-only probe — runs buildPayload() (same pipeline the worker +
 * fetch-news use) and prints every serebii entry whose title or body
 * looks like a "Pokémon of the Day" / "Move of the Day" / "Ability of
 * the Day" style daily feature. we want to filter these out of the
 * news feed; this dump tells us what wording variants to match.
 *
 * run with:  node scripts/news/probe-serebii-potd.mjs
 */

import { buildPayload } from './news-core.mjs';

// loose match — anything ending in "of the day" plus a few common
// daily-feature phrasings serebii historically uses ("today's", etc).
// we cast a wide net here on purpose so we don't miss variants.
const SUSPECT_PATTERNS = [
  /pok[eé]mon of the day/i,
  /move of the day/i,
  /ability of the day/i,
  /item of the day/i,
  /tip of the day/i,
  /\bof the day\b/i,
  /today'?s pok[eé]mon/i,
  /today'?s feature/i,
  /featured (?:pok[eé]mon|move|ability)/i,
];

const payload = await buildPayload();
const all = payload.entries || [];
const serebii = all.filter(e => (e.source || '').toLowerCase().includes('serebii'));
const suspects = serebii.filter(e => {
  const haystack = `${e.title || ''} ${e.body || ''}`;
  return SUSPECT_PATTERNS.some(re => re.test(haystack));
});

console.log(`[probe] total entries:    ${all.length}`);
console.log(`[probe] serebii entries:  ${serebii.length}`);
console.log(`[probe] suspect matches:  ${suspects.length}`);
console.log('');

for (const e of suspects) {
  console.log('─'.repeat(72));
  console.log(`TITLE: ${e.title}`);
  console.log(`LINK:  ${e.link || e.url || '-'}`);
  console.log(`BODY:  ${(e.body || '').slice(0, 400).replace(/\s+/g, ' ').trim()}${(e.body || '').length > 400 ? '…' : ''}`);
}

// also dump the first ~6 serebii titles unconditionally so we can
// eyeball any daily-feature entries the heuristic might have missed.
console.log('');
console.log('─'.repeat(72));
console.log('[probe] first 10 serebii titles (regardless of match):');
serebii.slice(0, 10).forEach((e, i) => {
  console.log(`  ${i + 1}. ${e.title}`);
});
