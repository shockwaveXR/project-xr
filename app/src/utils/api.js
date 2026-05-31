import ALL from '../data/pokemon.json';
import { formatFormName } from './format-name';

// name → id lookup for evo chain sprite resolution
// includes species-name aliases for pokemon whose stored name has a form suffix
// (e.g. PokeAPI evo chains reference 'toxtricity' but we store 'toxtricity-amped')
const _nameToId = Object.fromEntries(ALL.map(p => [p.name, p.id]));

// pokemon whose stored name has a form suffix (e.g. 'toxtricity-amped')
// while PokeAPI evo chains reference only the species name (e.g. 'toxtricity')
export const FORM_SUFFIX_SPECIES = [
  'dudunsparce', 'wormadam',  'basculegion', 'darmanitan', 'jellicent',
  'pyroar',      'meowstic',  'aegislash',   'gourgeist',  'lycanroc',
  'toxtricity',  'urshifu',   'oinkologne',  'maushold',   'palafin',
  'shaymin',     'tatsugiri',
];

const _speciesAliases = FORM_SUFFIX_SPECIES.reduce((acc, species) => {
  const match = ALL.find(p => p.name.startsWith(species + '-'));
  if (match) acc[species] = match.id;
  return acc;
}, {});

export const NAME_TO_ID = { ..._nameToId, ..._speciesAliases };

// base form labels keyed by the pokemon's actual stored name in pokemon.json.
// takes precedence over FORM_SUFFIX_SPECIES stripping so labels are exact rather than derived.
const BASE_FORM_LABELS = {
  // forces of nature — stored with '-incarnate' suffix
  'tornadus-incarnate':         'incarnate forme',
  'thundurus-incarnate':        'incarnate forme',
  'landorus-incarnate':         'incarnate forme',
  'enamorus-incarnate':         'incarnate forme',
  // morpeko — stored as 'morpeko-full-belly'
  'morpeko-full-belly':         'full belly mode',
  // legendary / mythical
  'giratina-altered':           'altered forme',
  'deoxys-normal':              'normal forme',
  'shaymin-land':               'land forme',
  'keldeo-ordinary':            'ordinary form',
  'meloetta-aria':              'aria forme',
  'zygarde-50':                 '50% forme',
  // battle / ability forms
  'aegislash-shield':           'shield forme',
  'wishiwashi-solo':            'solo form',
  'mimikyu-disguised':          'disguised form',
  'eiscue-ice':                 'ice face',
  'castform':                   'normal form',   // base castform has no suffix
  // style / appearance
  'oricorio-baile':             'baile style',
  'squawkabilly-green-plumage': 'green plumage',
  'tatsugiri-curly':            'curly form',
  'basculin-red-striped':       'red-striped form',
  'pumpkaboo-average':          'average size',
  // gender forms
  'indeedee-male':              'male',
  // unown — base entry's sprite is the A letter, so chip label should
  // read "A" instead of generic "base" (the letter identity is the
  // whole point of the species' form distinction).
  'unown':                      'A',
  // mode forms (FORM_SUFFIX_SPECIES — override suffix-stripping to get full label)
  'darmanitan-standard':        'standard mode',
};

// returns the chip label for the "base" form button
// handles both pokemon whose stored name has a form suffix (FORM_SUFFIX_SPECIES)
// and pokemon whose base slug has a proper named form (BASE_FORM_LABELS)
export function getBaseFormLabel(pokemonName) {
  if (BASE_FORM_LABELS[pokemonName] !== undefined) return BASE_FORM_LABELS[pokemonName];
  for (const species of FORM_SUFFIX_SPECIES) {
    if (pokemonName.startsWith(species + '-')) {
      return pokemonName.slice(species.length + 1).replace(/-/g, ' ');
    }
  }
  return null;
}

// global form data map — spans all pokemon so evo chains can resolve any form's sprites
export const FORM_DATA = Object.fromEntries(
  ALL.flatMap(p => Object.entries(p.form_data || {}))
);

// form name → base pokemon ID (for forms that aren't top-level pokemon entries)
export const FORM_TO_BASE_ID = Object.fromEntries(
  ALL.flatMap(p => Object.keys(p.form_data || {}).map(form => [form, p.id]))
);

// returns the form name to highlight in list cards for a given class filter
// forms that exist in the data but should never be surfaced in the UI
export const EXCLUDED_FORMS = new Set(['pikachu-alola-cap', 'greninja-battle-bond']);

// returns all forms to expand into cards for a given class filter
// single-form filters return at most one entry; multi-form filters expand all available.
// regional matching uses a region-suffix regex (not endsWith) so forms with extra suffixes
// after the region name — like tauros-paldea-combat-breed — are still caught, and all matches
// are returned rather than just the first.
function highlightFormsFor(p, cls) {
  const has = f => !!p.form_data?.[f] && !EXCLUDED_FORMS.has(f);
  const regionMatches = (region) => (p.regional_forms || []).filter(n => new RegExp(`-${region}(-|$)`).test(n) && has(n));
  switch (cls) {
    case 'has-mega':        return (p.mega_forms     || []).filter(has);
    case 'has-gmax':        return (p.gmax_forms     || []).filter(has);
    case 'has-regional':    return (p.regional_forms || []).filter(has);
    case 'has-forms':       return (p.alt_forms      || []).filter(has);
    case 'regional-alola':  return regionMatches('alola');
    case 'regional-galar':  return regionMatches('galar');
    case 'regional-hisui':  return regionMatches('hisui');
    case 'regional-paldea': return regionMatches('paldea');
    default: return [];
  }
}

// returns inline form slugs for the "view forms inline" toggle.
// 'regional' = only regional variants. 'all' = mega + gmax + regional + alt forms.
// forms are emitted in a stable order (mega → gmax → regional → alt) so cycling
// through a species group reads in a predictable sequence.
function inlineFormsFor(p, mode) {
  if (!mode) return [];
  const has = f => !!p.form_data?.[f] && !EXCLUDED_FORMS.has(f);
  if (mode === 'regional') return (p.regional_forms || []).filter(has);
  if (mode === 'all') {
    return [
      ...(p.mega_forms     || []),
      ...(p.gmax_forms     || []),
      ...(p.regional_forms || []),
      ...(p.alt_forms      || []),
    ].filter(has);
  }
  return [];
}

// slim shape returned by the list — detail/compare get the full object.
// artwork_url / artwork_shiny prefer the HOME 3D-render urls (added by
// scrape-home-artwork.js) when available, then fall back to the original
// sugimori-style official-artwork urls, then to small sprite urls.
function slim(p, formName) {
  const formData = formName ? p.form_data?.[formName] : null;
  return {
    id:           p.id,
    uid:          formName ? `${p.id}-${formName}` : String(p.id),
    name:         formName || p.name,
    base_name:    p.name,
    generation:   p.generation,
    sprite_url:   p.sprite_url,
    sprite_shiny: p.sprite_shiny,
    artwork_url:
      formData?.home_url || formData?.artwork_url || formData?.sprite_url ||
      p.home_url || p.artwork_url,
    artwork_shiny:
      formData?.home_shiny || formData?.artwork_shiny || formData?.sprite_shiny ||
      p.home_shiny || p.artwork_shiny,
    types:        formData?.types || p.types,
    stats:        p.stats,
    form:         formName || null,
  };
}

// returns total base stat value for a pokemon
function totalStats(p) {
  return p.stats.reduce((sum, s) => sum + s.base_value, 0);
}

// returns base value for a specific stat name
function getStat(p, name) {
  return (p.stats.find(s => s.stat_name === name) || { base_value: 0 }).base_value;
}

// ultra beast pokedex IDs (no dedicated field in data)
const ULTRA_BEAST_IDS = new Set([793,794,795,796,797,798,799,803,804,805,806]);

// starter pokemon base form IDs, gen 1 through 9. add gen-10 starters here
// once the gen-10 species ship.
const STARTER_IDS = new Set([
  1, 4, 7,           // gen 1: bulbasaur, charmander, squirtle
  152, 155, 158,     // gen 2: chikorita, cyndaquil, totodile
  252, 255, 258,     // gen 3: treecko, torchic, mudkip
  387, 390, 393,     // gen 4: turtwig, chimchar, piplup
  495, 498, 501,     // gen 5: snivy, tepig, oshawott
  650, 653, 656,     // gen 6: chespin, fennekin, froakie
  722, 725, 728,     // gen 7: rowlet, litten, popplio
  810, 813, 816,     // gen 8: grookey, scorbunny, sobble
  906, 909, 912,     // gen 9: sprigatito, fuecoco, quaxly
]);

// for the form-availability cases below we go through highlightFormsFor()
// rather than raw `*_forms.length > 0` so the same EXCLUDED_FORMS list
// + form_data presence check that gates which cards are SHOWN also gates
// which species MATCH. otherwise species like pikachu (whose only
// regional entry is the excluded `pikachu-alola-cap`) would surface in
// the regionals dropdown despite never producing a visible card.
function matchesClass(p, cls) {
  switch (cls) {
    case 'legendary':        return p.is_legendary && !p.is_mythical;
    case 'mythical':         return p.is_mythical;
    case 'paradox':          return p.genus === 'Paradox Pokémon';
    case 'ultra-beast':      return ULTRA_BEAST_IDS.has(p.id);
    case 'pseudo-legendary': return !p.is_legendary && !p.is_mythical && totalStats(p) === 600;
    case 'baby':             return !!p.is_baby;
    case 'starter':          return STARTER_IDS.has(p.id);
    case 'has-mega':
    case 'has-gmax':
    case 'has-regional':
    case 'regional-alola':
    case 'regional-galar':
    case 'regional-hisui':
    case 'regional-paldea':  return highlightFormsFor(p, cls).length > 0;
    default: return true;
  }
}

// mulberry32 — small, fast, deterministic 32-bit PRNG. used by the
// 'random' sort to seed a Fisher-Yates shuffle. paired with a seed value
// kept in the URL (filters.randomSeed), the order is stable across
// re-renders / show-more / route round-trips, and shareable across users.
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(arr, seed) {
  const rng = mulberry32(seed || 1);
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// returns the filtered + sorted list of species ids (deduped, preserving
// sort order) for a given filter set. used by PokemonPage to compute
// prev/next within the same filter context the user was browsing on
// /pokedex — synchronous because every call site needs the result inline
// during render. unique-only (form-inline duplicates collapsed to their
// species id) since prev/next nav is keyed off species id.
export function getOrderedIds(filters = {}) {
  const { search, type, generation, cls, ability, sort = 'id', sortDir = 'asc', randomSeed } = filters;
  let results = ALL;
  if (search)     results = results.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  if (type)       results = results.filter(p => p.types.includes(type));
  if (generation) results = results.filter(p => p.generation === Number(generation));
  if (cls)        results = results.filter(p => matchesClass(p, cls));
  if (ability) {
    const wanted = ability.toLowerCase();
    const hasAbility = (entry) => Array.isArray(entry?.abilities)
      && entry.abilities.some(a => a.ability_name === wanted);
    results = results.filter(p => hasAbility(p)
      || (p.form_data && Object.values(p.form_data).some(hasAbility)));
  }
  if (sort === 'random') {
    results = seededShuffle(results, parseInt(randomSeed, 10) || 1);
  } else {
    results = [...results].sort((a, b) => {
      if (sort === 'name') {
        return sortDir === 'desc'
          ? b.name.localeCompare(a.name)
          : a.name.localeCompare(b.name);
      }
      let aVal, bVal;
      if (sort === 'total')       { aVal = totalStats(a); bVal = totalStats(b); }
      else if (sort === 'id')     { aVal = a.id; bVal = b.id; }
      else                        { aVal = getStat(a, sort); bVal = getStat(b, sort); }
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }
  return results.map(p => p.id);
}

// filtered, sorted, paginated list
export function getPokemon(filters = {}) {
  const { search, type, generation, cls, ability, inlineForms, sort = 'id', sortDir = 'asc', randomSeed, limit = 20, offset = 0 } = filters;

  let results = ALL;

  if (search)     results = results.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  if (type)       results = results.filter(p => p.types.includes(type));
  if (generation) results = results.filter(p => p.generation === Number(generation));
  if (cls)        results = results.filter(p => matchesClass(p, cls));
  // ability filter: matches species or any of its forms — gives global search
  // a useful "all pokemon with this ability" landing instead of dropping the
  // user on the unfiltered pokedex when they click an ability result.
  if (ability) {
    const wanted = ability.toLowerCase();
    const hasAbility = (entry) => Array.isArray(entry?.abilities)
      && entry.abilities.some(a => a.ability_name === wanted);
    results = results.filter(p => hasAbility(p)
      || (p.form_data && Object.values(p.form_data).some(hasAbility)));
  }

  // sort
  if (sort === 'random') {
    results = seededShuffle(results, parseInt(randomSeed, 10) || 1);
  } else {
    results = [...results].sort((a, b) => {
      let aVal, bVal;
      if (sort === 'name') {
        return sortDir === 'desc'
          ? b.name.localeCompare(a.name)
          : a.name.localeCompare(b.name);
      }
      if (sort === 'total') {
        aVal = totalStats(a); bVal = totalStats(b);
      } else if (sort === 'id') {
        aVal = a.id; bVal = b.id;
      } else {
        aVal = getStat(a, sort); bVal = getStat(b, sort);
      }
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }

  return Promise.resolve(
    results
      .flatMap(p => {
        // inline toggle reshapes cls from a form-replacer into a pure filter:
        // when inline is on, emit base + forms (narrowed by cls if cls surfaces forms,
        // otherwise the inline mode's own form set). this lets 'cls=regional-alola'
        // + inline produce [raichu, raichu-alola] pairs instead of alolan-only cards.
        const classForms = highlightFormsFor(p, cls);
        if (inlineForms) {
          const forms = classForms.length ? classForms : inlineFormsFor(p, inlineForms);
          return [slim(p, null), ...forms.map(f => slim(p, f))];
        }

        // inline off: legacy behavior — cls-driven form sets replace the base card.
        if (classForms.length) return classForms.map(f => slim(p, f));
        return [slim(p, null)];
      })
      .slice(Number(offset), Number(offset) + Number(limit))
  );
}

// returns the clean region suffix if the form name is exactly '{base}-{region}', else null
// e.g. 'vulpix-alola' → 'alola', 'raticate-totem-alola' → null
function cleanRegion(formName, baseName) {
  const suffix = formName.slice(baseName.length + 1);
  return ['alola', 'galar', 'hisui', 'paldea'].includes(suffix) ? suffix : null;
}

// known cases where a regional form's evolution trigger differs from the base form's
// keyed as '{from}->{to}'. fields here override what's inherited from the base evolution.
// location/time_of_day are added for alola-exclusive form conditions not captured by pokeapi.
const REGIONAL_EVO_OVERRIDES = {
  // item differs
  'vulpix-alola->ninetales-alola':    { trigger: 'use-item', item: 'ice-stone',       min_level: null },
  'sandshrew-alola->sandslash-alola': { trigger: 'use-item', item: 'ice-stone',       min_level: null },
  'slowpoke-galar->slowbro-galar':    { trigger: 'use-item', item: 'galarica-cuff',   min_level: null },
  'slowpoke-galar->slowking-galar':   { trigger: 'use-item', item: 'galarica-wreath', min_level: null },
  // same item/level as base, but location-gated — pokeapi doesn't track this for form conditions
  'pikachu->raichu-alola':           { trigger: 'use-item', item: 'thunder-stone', min_level: null, location: 'alola' },
  'exeggcute->exeggutor-alola':      { trigger: 'use-item', item: 'leaf-stone',    min_level: null, location: 'alola' },
  'cubone->marowak-alola':           { trigger: 'level-up', item: null,            min_level: 28,   location: 'alola', time_of_day: 'night' },
};

// regional form chains that can't be inferred from regional_forms alone. two classes of cases:
//  1) a regional form evolves into a completely new species (e.g. meowth-galar → perrserker)
//  2) the base species is stored under a form-suffixed name (FORM_SUFFIX_SPECIES) and/or its
//     regional forms have extra suffixes beyond the region name (e.g. darmanitan-standard with
//     regional forms darmanitan-galar-standard / darmanitan-galar-zen), which cleanRegion can't
//     normalize and byName can't resolve via the bare species name.
// keyed by the stored pokemon name. steps here are merged into the inferred chains, with dedup.
const REGIONAL_NEW_SPECIES = {
  // galarian meowth line
  meowth:      { galar:  [{ from: 'meowth-galar',    to: 'perrserker', trigger: 'level-up', min_level: 28 }] },
  perrserker:  { galar:  [{ from: 'meowth-galar',    to: 'perrserker', trigger: 'level-up', min_level: 28 }] },
  // galarian zigzagoon line
  zigzagoon:   { galar:  [{ from: 'linoone-galar',   to: 'obstagoon',  trigger: 'level-up', min_level: 35, time_of_day: 'night' }] },
  linoone:     { galar:  [{ from: 'linoone-galar',   to: 'obstagoon',  trigger: 'level-up', min_level: 35, time_of_day: 'night' }] },
  obstagoon:   { galar:  [{ from: 'linoone-galar',   to: 'obstagoon',  trigger: 'level-up', min_level: 35, time_of_day: 'night' }] },
  // galarian yamask line
  yamask:      { galar:  [{ from: 'yamask-galar',    to: 'runerigus',  trigger: 'level-up', location: 'dusty-bowl' }] },
  runerigus:   { galar:  [{ from: 'yamask-galar',    to: 'runerigus',  trigger: 'level-up', location: 'dusty-bowl' }] },
  cofagrigus:  { galar:  [{ from: 'yamask-galar',    to: 'runerigus',  trigger: 'level-up', location: 'dusty-bowl' }] },
  // galarian corsola line
  corsola:     { galar:  [{ from: 'corsola-galar',   to: 'cursola',    trigger: 'level-up', min_level: 38 }] },
  cursola:     { galar:  [{ from: 'corsola-galar',   to: 'cursola',    trigger: 'level-up', min_level: 38 }] },
  // galarian farfetch'd line
  farfetchd:   { galar:  [{ from: 'farfetchd-galar', to: 'sirfetchd',  trigger: 'level-up' }] },
  sirfetchd:   { galar:  [{ from: 'farfetchd-galar', to: 'sirfetchd',  trigger: 'level-up' }] },
  // galarian mr. mime line
  'mime-jr':   { galar:  [{ from: 'mr-mime-galar',   to: 'mr-rime',    trigger: 'level-up', min_level: 42 }] },
  'mr-mime':   { galar:  [{ from: 'mr-mime-galar',   to: 'mr-rime',    trigger: 'level-up', min_level: 42 }] },
  'mr-rime':   { galar:  [{ from: 'mr-mime-galar',   to: 'mr-rime',    trigger: 'level-up', min_level: 42 }] },
  // hisuian sneasel line
  sneasel:     { hisui:  [{ from: 'sneasel-hisui',   to: 'sneasler',   trigger: 'use-item', item: 'razor-claw', time_of_day: 'day' }] },
  sneasler:    { hisui:  [{ from: 'sneasel-hisui',   to: 'sneasler',   trigger: 'use-item', item: 'razor-claw', time_of_day: 'day' }] },
  // hisuian qwilfish line
  qwilfish:    { hisui:  [{ from: 'qwilfish-hisui',  to: 'overqwil',   trigger: 'level-up' }] },
  overqwil:    { hisui:  [{ from: 'qwilfish-hisui',  to: 'overqwil',   trigger: 'level-up' }] },
  // paldean wooper line
  wooper:      { paldea: [{ from: 'wooper-paldea',   to: 'clodsire',   trigger: 'level-up', min_level: 20 }] },
  quagsire:    { paldea: [{ from: 'wooper-paldea',   to: 'clodsire',   trigger: 'level-up', min_level: 20 }] },
  clodsire:    { paldea: [{ from: 'wooper-paldea',   to: 'clodsire',   trigger: 'level-up', min_level: 20 }] },
  // galarian darumaka/darmanitan — can't be inferred (darmanitan is stored as darmanitan-standard
  // and its galar forms are darmanitan-galar-standard / darmanitan-galar-zen)
  darumaka:              { galar: [{ from: 'darumaka-galar', to: 'darmanitan-galar-standard', trigger: 'level-up', min_level: 35 }] },
  'darmanitan-standard': { galar: [{ from: 'darumaka-galar', to: 'darmanitan-galar-standard', trigger: 'level-up', min_level: 35 }] },
};

// builds { region: [{from, to, ...conditions}] } for regional form evolution chains.
// infers chains from the base evolutions array by checking if both pre-evo and evo species
// have matching regional forms. if only the evo has a regional form (e.g. cubone → marowak-alola),
// uses the base pre-evo as the from. merges in REGIONAL_NEW_SPECIES for cases that can't be inferred.
function buildRegionalEvolutions(pokemon) {
  if (!pokemon.evolutions?.length) return {};
  const byName = Object.fromEntries(ALL.map(p => [p.name, p]));
  const chains = {};

  for (const step of pokemon.evolutions) {
    const fromP = byName[step.from];
    const toP   = byName[step.to];
    if (!fromP || !toP) continue;

    const fromRegions = Object.fromEntries(
      (fromP.regional_forms || []).map(f => [cleanRegion(f, step.from), f]).filter(([r]) => r)
    );
    const toRegions = Object.fromEntries(
      (toP.regional_forms || []).map(f => [cleanRegion(f, step.to), f]).filter(([r]) => r)
    );

    for (const region of new Set([...Object.keys(fromRegions), ...Object.keys(toRegions)])) {
      const toForm = toRegions[region];
      if (!toForm) continue;
      const fromForm = fromRegions[region] || step.from;
      const overrideKey = `${fromForm}->${toForm}`;
      const ov = REGIONAL_EVO_OVERRIDES[overrideKey];
      if (!chains[region]) chains[region] = [];
      const pick = (key) => ov && key in ov ? ov[key] : step[key] ?? null;
      // when the pre-evo has no regional form, the edge is inferred from the base pre-evo →
      // regional evo (e.g. goomy → sliggoo-hisui). these transitions are always region-gated, so
      // default location to the region name unless an override or the base step already sets one.
      const inferredFromBase = !fromRegions[region];
      const pickedLocation = pick('location');
      const location = pickedLocation ?? (inferredFromBase && !(ov && 'location' in ov) ? region : null);
      chains[region].push({
        from:            fromForm,
        to:              toForm,
        trigger:         pick('trigger'),
        min_level:       pick('min_level'),
        item:            pick('item'),
        location,
        time_of_day:     pick('time_of_day'),
        min_happiness:   pick('min_happiness'),
        known_move:      pick('known_move'),
        known_move_type: pick('known_move_type'),
        trade_species:   pick('trade_species'),
        needs_rain:      pick('needs_rain'),
        turn_upside_down: pick('turn_upside_down'),
      });
    }
  }

  // merge in hardcoded steps for regional forms that evolve into new species
  const supplement = REGIONAL_NEW_SPECIES[pokemon.name] || {};
  for (const [region, steps] of Object.entries(supplement)) {
    if (!chains[region]) chains[region] = [];
    for (const step of steps) {
      const isDupe = chains[region].some(s => s.from === step.from && s.to === step.to);
      if (!isDupe) chains[region].push(step);
    }
  }

  return chains;
}

// evo steps where a single species-level entry should branch into per-form steps
// keyed as 'from->to'. PokeAPI doesn't capture nature-based or other form-splitting conditions.
const BRANCHING_EVO_OVERRIDES = {
  'toxel->toxtricity': [
    { from: 'toxel', to: 'toxtricity-amped',  trigger: 'level-up', min_level: 30, nature: 'amped natures'    },
    { from: 'toxel', to: 'toxtricity-low-key', trigger: 'level-up', min_level: 30, nature: 'low-key natures' },
  ],
  'tyrogue->hitmonlee':  [{ from: 'tyrogue', to: 'hitmonlee',  trigger: 'level-up', min_level: 20, nature: 'ATK > DEF' }],
  'tyrogue->hitmonchan': [{ from: 'tyrogue', to: 'hitmonchan', trigger: 'level-up', min_level: 20, nature: 'DEF > ATK' }],
  'tyrogue->hitmontop':  [{ from: 'tyrogue', to: 'hitmontop',  trigger: 'level-up', min_level: 20, nature: 'ATK = DEF' }],
};

// mega stone (or equivalent condition) for each mega form name
// rayquaza uses a move instead of a stone; diancie/latias/latios stones are held items from in-game events
const MEGA_STONE = {
  'venusaur-mega':      'venusaurite',
  'charizard-mega-x':   'charizardite-x',
  'charizard-mega-y':   'charizardite-y',
  'blastoise-mega':     'blastoisinite',
  'beedrill-mega':      'beedrillite',
  'pidgeot-mega':       'pidgeotite',
  'alakazam-mega':      'alakazite',
  'slowbro-mega':       'slowbronite',
  'gengar-mega':        'gengarite',
  'kangaskhan-mega':    'kangaskhanite',
  'pinsir-mega':        'pinsirite',
  'gyarados-mega':      'gyaradosite',
  'aerodactyl-mega':    'aerodactylite',
  'mewtwo-mega-x':      'mewtwonite-x',
  'mewtwo-mega-y':      'mewtwonite-y',
  'ampharos-mega':      'ampharosite',
  'steelix-mega':       'steelixite',
  'scizor-mega':        'scizorite',
  'heracross-mega':     'heracronite',
  'houndoom-mega':      'houndoominite',
  'tyranitar-mega':     'tyranitarite',
  'blaziken-mega':      'blazikenite',
  'gardevoir-mega':     'gardevoirite',
  'mawile-mega':        'mawilite',
  'aggron-mega':        'aggronite',
  'medicham-mega':      'medichamite',
  'manectric-mega':     'manectite',
  'sableye-mega':       'sablenite',
  'sharpedo-mega':      'sharpedonite',
  'camerupt-mega':      'cameruptite',
  'altaria-mega':       'altarianite',
  'banette-mega':       'banettite',
  'absol-mega':         'absolite',
  'glalie-mega':        'glalitite',
  'salamence-mega':     'salamencite',
  'metagross-mega':     'metagrossite',
  'latias-mega':        'latiasite',
  'latios-mega':        'latiosite',
  'rayquaza-mega':      'dragon-ascent',  // move, not a stone
  'lopunny-mega':       'lopunnite',
  'garchomp-mega':      'garchompite',
  'lucario-mega':       'lucarionite',
  'abomasnow-mega':     'abomasite',
  'gallade-mega':       'galladite',
  'audino-mega':        'audinite',
  'diancie-mega':       'diancite',
  'sceptile-mega':      'sceptilite',
  'swampert-mega':      'swampertite',
  // additional mega stones beyond the Gen VI canon set — all real, sourced from bulbapedia's
  // Mega Stone list. three of these (magearna-original, tatsugiri-curly/droopy/stretchy) don't
  // have their own stones on bulbapedia, so they share the base species' stone.
  'clefable-mega':          'clefablite',
  'victreebel-mega':        'victreebelite',
  'starmie-mega':           'starminite',
  'dragonite-mega':         'dragoninite',
  'meganium-mega':          'meganiumite',
  'feraligatr-mega':        'feraligite',
  'skarmory-mega':          'skarmorite',
  'froslass-mega':          'froslassite',
  'heatran-mega':           'heatranite',
  'darkrai-mega':           'darkranite',
  'emboar-mega':            'emboarite',
  'excadrill-mega':         'excadrite',
  'scolipede-mega':         'scolipite',
  'scrafty-mega':           'scraftinite',
  'eelektross-mega':        'eelektrossite',
  'chandelure-mega':        'chandelurite',
  'chesnaught-mega':        'chesnaughtite',
  'delphox-mega':           'delphoxite',
  'greninja-mega':          'greninjite',
  'pyroar-mega':            'pyroarite',
  'floette-mega':           'floettite',
  'malamar-mega':           'malamarite',
  'barbaracle-mega':        'barbaracite',
  'dragalge-mega':          'dragalgite',
  'hawlucha-mega':          'hawluchanite',
  'zygarde-mega':           'zygardite',
  'drampa-mega':            'drampanite',
  'zeraora-mega':           'zeraorite',
  'falinks-mega':           'falinksite',
  'raichu-mega-x':          'raichunite-x',
  'raichu-mega-y':          'raichunite-y',
  'chimecho-mega':          'chimechite',
  'absol-mega-z':           'absolite-z',
  'staraptor-mega':         'staraptite',
  'garchomp-mega-z':        'garchompite-z',
  'lucario-mega-z':         'lucarionite-z',
  'golurk-mega':            'golurkite',
  'meowstic-mega':          'meowsticite',
  'crabominable-mega':      'crabominite',
  'golisopod-mega':         'golisopite',
  'magearna-mega':          'magearnite',
  'magearna-original-mega': 'magearnite',
  'scovillain-mega':        'scovillainite',
  'baxcalibur-mega':        'baxcalibrite',
  'tatsugiri-curly-mega':   'tatsugirinite',
  'tatsugiri-droopy-mega':  'tatsugirinite',
  'tatsugiri-stretchy-mega':'tatsugirinite',
  'glimmora-mega':          'glimmoranite',
};

// pokemon that can only be reached by evolving a regional form — exclude from the base evo chain
const REGIONAL_ONLY_EVO_TARGETS = new Set([
  'obstagoon', 'perrserker', 'runerigus', 'cursola', 'sirfetchd',
  'mr-rime', 'sneasler', 'overqwil', 'clodsire',
]);

// species-level slugs in PokeAPI evolution chains that should be rewritten to a specific form
// because only that form participates in the evolution. without this, the chain references a
// species name that doesn't resolve to any card (e.g. 'basculin' — only white-striped evolves).
const SPECIES_FORM_REWRITE = {
  basculin: 'basculin-white-striped',
};

function rewriteSpeciesForms(step) {
  const from = SPECIES_FORM_REWRITE[step.from] || step.from;
  const to   = SPECIES_FORM_REWRITE[step.to]   || step.to;
  return (from === step.from && to === step.to) ? step : { ...step, from, to };
}

// single pokemon by id
export function getPokemonById(id) {
  const pokemon = ALL.find(p => p.id === Number(id));
  if (!pokemon) return Promise.reject(new Error('not found'));
  const evolutions = (pokemon.evolutions || [])
    .filter(s => !REGIONAL_ONLY_EVO_TARGETS.has(s.to))
    .flatMap(s => BRANCHING_EVO_OVERRIDES[`${s.from}->${s.to}`] || [s])
    .map(rewriteSpeciesForms);

  // synthesize mega steps for every pokemon in the chain (including the current one).
  // the mega's parent is derived from its slug (strip `-mega` / `-mega-x/y/z`) so species with
  // per-variant megas — like tatsugiri's curly/droopy/stretchy mega, each belonging to its own
  // base variant — attach under the correct parent instead of all stacking off the default form.
  // explicit overrides handle cases where the parent can't be derived from the slug: e.g.
  // zygarde-mega is only accessible from zygarde-complete, not the default zygarde-50.
  const MEGA_PARENT_OVERRIDES = {
    'zygarde-mega': 'zygarde-complete',
  };
  const byName = Object.fromEntries(ALL.map(p => [p.name, p]));
  const inChain = new Set([pokemon.name, ...evolutions.map(s => s.from), ...evolutions.map(s => s.to)]);
  const megaSteps = [];
  const resolveMegaParent = (megaForm, fallback) => {
    if (MEGA_PARENT_OVERRIDES[megaForm]) return MEGA_PARENT_OVERRIDES[megaForm];
    const m = megaForm.match(/^(.+?)-mega(?:-[xyz])?$/);
    if (!m) return fallback;
    const candidate = m[1];
    if (byName[candidate] || FORM_TO_BASE_ID[candidate]) return candidate;
    return fallback;
  };
  for (const name of inChain) {
    const p = byName[name];
    if (!p?.mega_forms?.length) continue;
    for (const megaForm of p.mega_forms) {
      megaSteps.push({
        from: resolveMegaParent(megaForm, name),
        to: megaForm,
        trigger: 'mega-evolution',
        item: MEGA_STONE[megaForm] || null,
        isMega: true,
      });
    }
  }

  return Promise.resolve({ ...pokemon, evolutions: [...evolutions, ...megaSteps], regionalEvolutions: buildRegionalEvolutions(pokemon) });
}

// multiple pokemon by id array for compare, with optional form overrides
// entries: [{ id, form? }, ...]
export function comparePokemon(entries = []) {
  return Promise.resolve(entries.map(({ id, form }) => {
    const p = ALL.find(x => x.id === id);
    if (!p) return null;
    if (!form) return p;
    const fd = p.form_data?.[form];
    if (!fd) return p;
    return {
      ...p,
      types:      fd.types      || p.types,
      stats:      fd.stats      || p.stats,
      abilities:  fd.abilities  || p.abilities,
      sprite_url: fd.sprite_url || p.sprite_url,
      // prefer HOME 3D-render urls when present, with the existing
      // sugimori urls as fallback.
      artwork_url:   fd.home_url   || fd.artwork_url   || fd.sprite_url   || p.home_url   || p.artwork_url,
      artwork_shiny: fd.home_shiny || fd.artwork_shiny || fd.sprite_shiny || p.home_shiny || p.artwork_shiny,
      height:     fd.height     ?? p.height,
      weight:     fd.weight     ?? p.weight,
      _form: form,
    };
  }).filter(Boolean));
}

// search that includes forms as separate results for the compare picker.
// matches against both slugs and display names so queries like "mega rai",
// "raichu alola", "alolan raichu" all work. tokens are order-independent.
// results are ranked: name starts with query > name contains query.
export function searchWithForms(query, limit = 12) {
  if (!query?.trim()) return Promise.resolve([]);
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const tokensMatch = (text) => tokens.every(t => text.includes(t));
  const startsWithFirst = tokens[0];

  // score: 0 = starts with first token, 1 = contains only
  function score(name, slug) {
    if (name.startsWith(startsWithFirst) || slug.startsWith(startsWithFirst)) return 0;
    return 1;
  }

  const hits = []; // { rank, item }

  for (const p of ALL) {
    const allForms = [
      ...(p.mega_forms || []),
      ...(p.gmax_forms || []),
      ...(p.regional_forms || []),
      ...(p.alt_forms || []),
    ].filter(f => p.form_data?.[f] && !EXCLUDED_FORMS.has(f));

    const baseName = formatFormName(p.name).toLowerCase();
    const baseSlug = p.name;
    const baseHit = tokensMatch(baseName) || tokensMatch(baseSlug);

    const formHits = allForms.filter(f => {
      const display = formatFormName(f).toLowerCase();
      return tokensMatch(display) || tokensMatch(f);
    });

    if (baseHit && formHits.length === 0) {
      const rank = score(baseName, baseSlug);
      hits.push({ rank, item: slim(p, null) });
      for (const f of allForms) {
        hits.push({ rank, item: slim(p, f) });
      }
    } else if (formHits.length > 0) {
      const baseRank = score(baseName, baseSlug);
      if (baseHit) hits.push({ rank: baseRank, item: slim(p, null) });
      for (const f of formHits) {
        const display = formatFormName(f).toLowerCase();
        hits.push({ rank: score(display, f), item: slim(p, f) });
      }
    }
  }

  hits.sort((a, b) => a.rank - b.rank);
  return Promise.resolve(hits.slice(0, limit).map(h => h.item));
}

// all distinct types sorted
export function getTypes() {
  return Promise.resolve([...new Set(ALL.flatMap(p => p.types))].sort());
}
