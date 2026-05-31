// names that can't be derived by simple slug→title-case conversion
const OVERRIDES = {
  'mr-mime':    'Mr. Mime',
  'mr-rime':    'Mr. Rime',
  'mime-jr':    'Mime Jr.',
  'type-null':  'Type: Null',
  'ho-oh':      'Ho-Oh',
  'porygon-z':  'Porygon-Z',
  'jangmo-o':   'Jangmo-o',
  'hakamo-o':   'Hakamo-o',
  'kommo-o':    'Kommo-o',
  'chi-yu':     'Chi-Yu',
  'chien-pao':  'Chien-Pao',
  'ting-lu':    'Ting-Lu',
  'wo-chien':   'Wo-Chien',
  'nidoran-f':  'Nidoran\u2640',
  'nidoran-m':  'Nidoran\u2642',
  'farfetchd':          "Farfetch'd",
  'sirfetchd':          "Sirfetch'd",
  'darmanitan-zen':     'Darmanitan Zen Mode',
  'darmanitan-galar-zen': 'Galarian Darmanitan Zen Mode',
};

// single-word base names that appear in the data with a form suffix appended
// e.g. "basculin-red-striped", "aegislash-shield" — the suffix is stripped for display
const FORM_BASE_NAMES = new Set([
  'aegislash', 'basculegion', 'basculin', 'castform', 'cherrim',
  'darmanitan', 'deoxys', 'dudunsparce', 'eiscue', 'enamorus',
  'frillish', 'giratina', 'gourgeist', 'indeedee', 'jellicent',
  'keldeo', 'landorus', 'lycanroc', 'maushold', 'meloetta',
  'meowstic', 'mimikyu', 'minior', 'morpeko', 'oinkologne',
  'oricorio', 'palafin', 'pumpkaboo', 'pyroar', 'rotom',
  'shaymin', 'squawkabilly', 'tatsugiri', 'thundurus', 'tornadus',
  'toxtricity', 'urshifu', 'wishiwashi', 'wormadam', 'zygarde',
]);

const REGION_ADJECTIVE = { alola: 'Alolan', galar: 'Galarian', hisui: 'Hisuian', paldea: 'Paldean' };

// alt forms whose existence is the destination of a *branching* evolution
// — a single pre-evo produces multiple post-evos depending on some
// condition (time of day, environment, nature, tower, etc.). these get
// wrapped in parens to disambiguate the branch: "Lycanroc (Midday)" vs
// "Lycanroc (Midnight)". non-branching alt forms (rotom appliances,
// aegislash blade/shield, wishiwashi school, plain regionals) keep their
// inline-variant rendering ("Rotom Heat", "Aegislash Shield").
const BRANCHING_FORMS = new Set([
  'lycanroc-midday', 'lycanroc-midnight', 'lycanroc-dusk',
  'wormadam-plant', 'wormadam-sandy', 'wormadam-trash',
  'toxtricity-amped', 'toxtricity-low-key',
  'urshifu-single-strike', 'urshifu-rapid-strike',
]);

function titleCase(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// generic slug → readable text for arbitrary slugs (item names, move names,
// location names, etc.) — these aren't pokemon, so no overrides apply. two
// variants because the consuming UI is sometimes title-cased and sometimes
// fully lowercase.
//   formatSlug:      "thunder-stone"  → "Thunder Stone"
//   formatSlugLower: "cheri-berry"    → "cheri berry"
export function formatSlug(slug) {
  if (!slug) return '';
  return slug.split('-').map(titleCase).join(' ');
}

export function formatSlugLower(slug) {
  if (!slug) return '';
  return slug.replace(/-/g, ' ');
}

// species name only — strips form suffix (e.g. "basculin-red-striped" → "Basculin")
export function formatName(slug) {
  if (!slug) return '';
  const lower = slug.toLowerCase();
  if (OVERRIDES[lower]) return OVERRIDES[lower];
  const [base, ...rest] = lower.split('-');
  if (rest.length && FORM_BASE_NAMES.has(base)) return titleCase(base);
  return lower.split('-').map(titleCase).join(' ');
}

// full name including form — use this when displaying form details
export function formatNameFull(slug) {
  if (!slug) return '';
  const lower = slug.toLowerCase();
  if (OVERRIDES[lower]) return OVERRIDES[lower];
  return lower.split('-').map(titleCase).join(' ');
}

// resolves the display name for a named form:
//   mega:              "charizard-mega-x"        → "Mega Charizard X"
//   gmax:              "pikachu-gmax"             → "GMAX Pikachu"
//                      "toxtricity-amped-gmax"    → "GMAX Amped Toxtricity"
//   regional:          "meowth-alola"             → "Alolan Meowth"
//   regional + variant:"darmanitan-galar-zen"     → "Galarian Darmanitan Zen"
//   alt:               "rotom-heat"               → "Rotom Heat"
//                      "darmanitan-zen"           → "Darmanitan Zen"
export function formatFormName(slug) {
  if (!slug) return '';
  const lower = slug.toLowerCase();
  if (OVERRIDES[lower]) return OVERRIDES[lower];
  const parts = lower.split('-');

  // mega: any segment equals 'mega'
  const megaIdx = parts.indexOf('mega');
  if (megaIdx !== -1) {
    const preMegaParts  = parts.slice(0, megaIdx);
    const postMegaParts = parts.slice(megaIdx + 1);

    // find the longest pre-mega prefix that matches an OVERRIDE entry — this covers multi-word
    // species names like kommo-o, mr-mime, porygon-z so they don't get misread as species+variant.
    let speciesEnd = 1;
    for (let i = preMegaParts.length; i >= 1; i--) {
      if (OVERRIDES[preMegaParts.slice(0, i).join('-')]) { speciesEnd = i; break; }
    }
    const speciesSlug = preMegaParts.slice(0, speciesEnd).join('-');
    const speciesName = OVERRIDES[speciesSlug] || preMegaParts.slice(0, speciesEnd).map(titleCase).join(' ');
    const variantParts = preMegaParts.slice(speciesEnd);

    // variant sitting before '-mega' (tatsugiri-droopy-mega, magearna-original-mega) — render
    // the variant in parentheses: "Mega Tatsugiri (Droopy)", "Mega Magearna (Original)".
    // this is visually distinct from the single-letter x/y/z suffix pattern (Mega Charizard X).
    if (variantParts.length > 0) {
      const variantLabel = variantParts.map(titleCase).join(' ');
      return `Mega ${speciesName} (${variantLabel})`;
    }

    // standard mega — optional single-letter x/y/z suffix after '-mega'
    const suffix = postMegaParts.map(p => p.toUpperCase()).join(' ');
    return ['Mega', speciesName, suffix].filter(Boolean).join(' ');
  }

  // gmax: last segment is 'gmax' → "GMAX {base}" or "GMAX {base} ({variant})"
  if (parts[parts.length - 1] === 'gmax') {
    const body = parts.slice(0, -1);
    let splitAt = body.length;
    for (let i = 1; i < body.length; i++) {
      if (FORM_BASE_NAMES.has(body.slice(0, i).join('-'))) { splitAt = i; break; }
    }
    const baseSlug = body.slice(0, splitAt).join('-');
    const baseName = OVERRIDES[baseSlug] || body.slice(0, splitAt).map(titleCase).join(' ');
    const variant  = body.slice(splitAt).map(titleCase).join(' ');
    return variant ? `GMAX ${baseName} (${variant})` : `GMAX ${baseName}`;
  }

  // regional: find a region word anywhere in the parts (handles both
  // "meowth-alola" and "darmanitan-galar-zen")
  for (let ri = 1; ri < parts.length; ri++) {
    if (REGION_ADJECTIVE[parts[ri]]) {
      const baseSlug = parts.slice(0, ri).join('-');
      const baseName = OVERRIDES[baseSlug] || parts.slice(0, ri).map(titleCase).join(' ');
      // strip 'standard' — it's just a placeholder for the default regional form
      const variantParts = parts.slice(ri + 1).filter(p => p !== 'standard');
      const variant = variantParts.map(titleCase).join(' ');
      return [REGION_ADJECTIVE[parts[ri]], baseName, variant].filter(Boolean).join(' ');
    }
  }

  // alt form: "{base} {variant}" — base first, variant after.
  // branching-evo destinations get parens around the variant.
  for (let i = 1; i < parts.length; i++) {
    const candidate = parts.slice(0, i).join('-');
    if (FORM_BASE_NAMES.has(candidate) || OVERRIDES[candidate]) {
      const baseName = OVERRIDES[candidate] || parts.slice(0, i).map(titleCase).join(' ');
      const variant  = parts.slice(i).map(titleCase).join(' ');
      if (variant && BRANCHING_FORMS.has(lower)) return `${baseName} (${variant})`;
      return [baseName, variant].filter(Boolean).join(' ');
    }
  }

  return formatName(slug);
}
