import { useState, useCallback, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { usePokemonList } from '../hooks/use-pokemon';
import { STORAGE_KEYS, getBool, setBool, getString, setString } from '../utils/storage';
import { appScrollTo } from '../utils/app-scroll';
import PokemonCard from '../components/pokemon-card';
import SearchBar from '../components/search-bar';
import FilterPanel from '../components/filter-panel';

const PAGE_SIZE = 60;
const FILTER_KEYS = ['search', 'type', 'generation', 'cls', 'ability', 'sort', 'sortDir'];

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [visible, setVisible]           = useState(PAGE_SIZE);
  const [shiny, setShiny]               = useState(() => getBool(STORAGE_KEYS.SHINY_SPRITES, false));
  // inlineForms: '' (base only) | 'regional' | 'all'. view preference, persists per user.
  const [inlineForms, setInlineForms]   = useState(() => getString(STORAGE_KEYS.INLINE_FORMS, ''));
  const navigate                        = useNavigate();

  const updateInlineForms = useCallback((mode) => {
    setInlineForms(mode);
    setString(STORAGE_KEYS.INLINE_FORMS, mode);
  }, []);

  // derive filters object from URL params
  const filters = Object.fromEntries(
    FILTER_KEYS.map(k => [k, searchParams.get(k) || undefined]).filter(([, v]) => v)
  );

  const setFilters = useCallback((newFilters) => {
    const params = {};
    Object.entries(newFilters).forEach(([k, v]) => {
      if (v !== undefined && v !== '') params[k] = v;
    });
    setSearchParams(params, { replace: true });
  }, [setSearchParams]);

  const { pokemon, loading, error } = usePokemonList({ ...filters, inlineForms, limit: 9999 });

  // reset visible count and scroll position whenever filters change
  useEffect(() => {
    setVisible(PAGE_SIZE);
    appScrollTo(0, 'instant');
  }, [searchParams.toString(), inlineForms]);

  const CONTENT_KEYS  = ['search', 'type', 'generation', 'cls', 'ability'];
  const hasFilters    = CONTENT_KEYS.some(k => filters[k]);
  const displayed     = hasFilters ? pokemon : pokemon.slice(0, visible);
  const hasMore       = !hasFilters && visible < pokemon.length;

  const handleSearch = useCallback((search) => {
    setFilters({ ...filters, search: search || undefined });
  }, [filters, setFilters]);

  return (
    <div className="home-layout">
      <FilterPanel
        filters={filters}
        onChange={setFilters}
        shiny={shiny}
        onShinyToggle={() => setShiny(s => { setBool(STORAGE_KEYS.SHINY_SPRITES, !s); return !s; })}
        inlineForms={inlineForms}
        onInlineFormsChange={updateInlineForms}
      />

      <main className="home-main">
        <SearchBar
          value={filters.search || ''}
          onSearch={handleSearch}
          onEnter={() => { if (displayed.length > 0) navigate(`/pokemon/${displayed[0].id}`); }}
        />

        {error   && <p className="error">error: {error}</p>}
        {loading && <p className="loading">loading pokémon...</p>}

        <div className="pokemon-grid">
          {displayed.map(p => (
            <PokemonCard key={p.uid || p.id} pokemon={p} shiny={shiny} sort={filters.sort} />
          ))}
        </div>

        {!loading && pokemon.length === 0 && (
          <p className="empty">no pokémon found. try adjusting your filters.</p>
        )}

        {!loading && hasMore && (
          <button className="load-more-btn" onClick={() => setVisible(v => v + PAGE_SIZE)}>
            show more
          </button>
        )}

        <footer className="home-footer">
          <p>
            pokémon data provided by <a href="https://pokeapi.co" target="_blank" rel="noreferrer">PokéAPI</a>.
            sprites and artwork © Nintendo / Game Freak / The Pokémon Company.
          </p>
          <p>
            this is a fan-made project for personal use. no ownership of any pokémon intellectual property is claimed.
            all trademarks belong to their respective owners.
          </p>
        </footer>
      </main>
    </div>
  );
}
