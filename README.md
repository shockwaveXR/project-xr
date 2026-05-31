# pokedex

a fully static pokemon browser. no backend, no database — all data is bundled from committed json files.

live at [shockwavexr.github.io/pokedex](https://shockwavexr.github.io/pokedex)

## stack

- react + vite + react router + sass
- data lives in `app/src/data/pokemon.json` and `abilities.json`, generated from pokeapi
- deployed to github pages via github actions on every push to `main`

## local dev

```bash
cd app && npm install && npm run dev
```

## regenerating data

```bash
cd scripts && npm install
node db/generate.js          # fetch pokeapi (~15–20 min)
node db/patch-evolutions.js  # patch evo conditions pokeapi gets wrong
node db/fetch-abilities.js   # rebuild ability descriptions
node db/scrape-flavor.js     # scrape bulbapedia for form-specific flavor text
node news/fetch-news.mjs     # regenerate bundled news.json fallback
```
