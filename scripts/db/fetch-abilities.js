/**
 * fetch-abilities.js
 * reads existing pokemon.json, fetches english short_effect + japanese
 * names for every unique ability from pokeapi, writes
 * app/src/data/abilities.json
 *
 * format: { "<slug>": { effect, name_jp, romaji } }
 *
 * run with: node db/fetch-abilities.js
 */

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const POKEAPI      = 'https://pokeapi.co/api/v2';
const DELAY_MS     = 100;
const IN_POKEMON   = path.join(__dirname, '../../app/src/data/pokemon.json');
const OUT_ABILITIES = path.join(__dirname, '../../app/src/data/abilities.json');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// pull japanese name + romaji out of pokeapi's names[] array. PokeAPI
// language codes:
//   ja        — kanji/katakana (only set on pokemon-species; not on
//               ability/item/move/type endpoints)
//   ja-hrkt   — hiragana/katakana (set on every endpoint that has names[])
//   ja-roma   — romaji (only set on pokemon-species)
// fall back from ja → ja-hrkt for name_jp so non-species endpoints still
// resolve. romaji stays null when not provided — kana alone is fine.
function pickJP(names) {
  if (!names) return { name_jp: null, romaji: null };
  const ja = names.find(n => n.language?.name === 'ja')
          || names.find(n => n.language?.name === 'ja-hrkt');
  const ro = names.find(n => n.language?.name === 'ja-roma');
  return {
    name_jp: ja?.name || null,
    romaji:  ro?.name || null,
  };
}

async function main() {
  const pokemon = JSON.parse(fs.readFileSync(IN_POKEMON, 'utf8'));
  // include abilities from both base + form_data; some abilities only appear
  // on a form (e.g. Mega Kangaskhan's parental-bond, primal Kyogre's
  // primordial-sea, regional-form-only abilities like gorilla-tactics).
  const names = [...new Set(pokemon.flatMap(p => [
    ...p.abilities.map(a => a.ability_name),
    ...Object.values(p.form_data || {}).flatMap(f => (f.abilities || []).map(a => a.ability_name)),
  ]))].sort();

  console.log(`fetching ${names.length} unique abilities...`);

  const map    = {};
  const failed = [];

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    try {
      await sleep(DELAY_MS);
      const { data } = await axios.get(`${POKEAPI}/ability/${name}`);
      const entry = data.effect_entries.find(e => e.language.name === 'en');
      const jp    = pickJP(data.names);
      map[name] = {
        effect:  entry ? entry.short_effect : null,
        name_jp: jp.name_jp,
        romaji:  jp.romaji,
      };
      if ((i + 1) % 50 === 0 || i + 1 === names.length) {
        console.log(`  ${i + 1}/${names.length}`);
      }
    } catch (err) {
      console.warn(`  [warn] "${name}" failed: ${err.message}`);
      failed.push(name);
    }
  }

  fs.writeFileSync(OUT_ABILITIES, JSON.stringify(map, null, 2));
  console.log(`\ndone. ${Object.keys(map).length} abilities written to ${OUT_ABILITIES}`);
  if (failed.length) console.warn(`failed: ${failed.join(', ')}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
