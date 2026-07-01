import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCompare } from '../hooks/use-pokemon';
import { useModalAnimation } from '../hooks/use-modal-animation';
import { searchWithForms } from '../utils/api';
import { formatName, formatFormName } from '../utils/format-name';
import { STAT_LABELS_SHORT as STAT_LABELS } from '../utils/stats';
import AbilityModal from '../components/ability-modal';
import { useRetroSprites } from '../hooks/use-retro-sprites';
import { getRetroPng } from '../utils/retro-sprite';

export default function ComparePage() {
  const { retro } = useRetroSprites();
  const [entries, setEntries]   = useState([]);
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);
  const [hlIdx, setHlIdx]       = useState(-1);
  const [selectedAbility, setSelectedAbility] = useState(null);
  const { displayed: abilityShown, isClosing: abilityClosing } = useModalAnimation(selectedAbility);

  const { pokemon, loading } = useCompare(entries);

  const handleSearch = async (e) => {
    const val = e.target.value;
    setQuery(val);
    setHlIdx(-1);
    if (!val.trim()) { setResults([]); return; }
    const data = await searchWithForms(val, 12);
    setResults(data);
  };

  const selectedUids = new Set(entries.map(e => e.form ? `${e.id}-${e.form}` : String(e.id)));
  const filteredResults = results.filter(p => !selectedUids.has(p.uid));

  const add = (p) => {
    if (entries.length >= 3) return;
    if (selectedUids.has(p.uid)) return;
    setEntries(prev => [...prev, { id: p.id, form: p.form || null }]);
    setQuery('');
    setResults([]);
    setHlIdx(-1);
  };

  const handleKeyDown = (e) => {
    if (!filteredResults.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHlIdx(i => (i + 1) % filteredResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHlIdx(i => (i <= 0 ? filteredResults.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      add(filteredResults[hlIdx >= 0 ? hlIdx : 0]);
    } else if (e.key === 'Escape') {
      setResults([]);
      setHlIdx(-1);
    }
  };

  const remove = (idx) => setEntries(prev => prev.filter((_, i) => i !== idx));

  const maxStat = (statName) =>
    Math.max(...pokemon.map(p => (p.stats?.find(s => s.stat_name === statName)?.base_value ?? 0)));

  const displayName = (p) => p._form ? formatFormName(p._form) : formatName(p.name);

  return (
    <div className="compare-page">
      <div className="compare-page-header">
        <p className="compare-subhead">pick up to 3 pokémon to compare side by side</p>
      </div>

      {entries.length < 3 && (
        <div className="compare-search-wrap">
          <div className="compare-search-inner">
            <input
              className="search-input"
              type="text"
              placeholder="search pokémon to add..."
              value={query}
              onChange={handleSearch}
              onKeyDown={handleKeyDown}
              autoComplete="off"
            />
            {filteredResults.length > 0 && (
              <ul className="compare-results">
                {filteredResults.map((p, i) => (
                  <li key={p.uid} className={i === hlIdx ? 'highlighted' : ''}>
                    <button
                      onClick={() => add(p)}
                      onMouseEnter={() => setHlIdx(i)}
                    >
                      <img
                        src={retro ? (getRetroPng(p.form || p.name) || p.artwork_url || p.sprite_url) : (p.artwork_url || p.sprite_url)}
                        alt={p.name}
                        className={retro && getRetroPng(p.form || p.name) ? 'is-retro' : undefined}
                      />
                      <span>{p.form ? formatFormName(p.form) : formatName(p.name)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {entries.length === 0 && (
        <p className="empty">search for a pokémon above to get started.</p>
      )}

      {loading && <p className="loading">loading...</p>}

      {!loading && pokemon.length > 0 && (
        <div className="compare-table-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th />
                {pokemon.map((p, i) => (
                  <th key={p._form ? `${p.id}-${p._form}` : p.id}>
                    <div className="compare-th-inner">
                      <button className="compare-remove-btn" onClick={() => remove(i)}>✕</button>
                      <Link to={p._form ? `/pokemon/${p.id}?form=${p._form}` : `/pokemon/${p.id}`}>
                        <img
                          src={retro ? (getRetroPng(p._form || p.name) || p.artwork_url || p.sprite_url) : (p.artwork_url || p.sprite_url)}
                          alt={p.name}
                          className={retro && getRetroPng(p._form || p.name) ? 'is-retro' : undefined}
                        />
                        <span>{displayName(p)}</span>
                      </Link>
                      <div className="compare-types">
                        {(p.types || []).map(t => (
                          <span key={t} className={`type-badge type-${t}`}>{t}</span>
                        ))}
                      </div>
                      <div className="compare-abilities-cell">
                        {(p.abilities || []).map(a => (
                          <button
                            key={a.ability_name}
                            className={`compare-ability-pill${a.is_hidden ? ' hidden' : ''}`}
                            onClick={() => setSelectedAbility({ name: a.ability_name, is_hidden: a.is_hidden })}
                          >
                            {a.ability_name.replace(/-/g, ' ')}
                          </button>
                        ))}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(STAT_LABELS).map(([key, label]) => {
                const best = maxStat(key);
                return (
                  <tr key={key}>
                    <td className="compare-stat-label">{label}</td>
                    {pokemon.map((p, i) => {
                      const val = p.stats?.find(s => s.stat_name === key)?.base_value ?? 0;
                      const uid = p._form ? `${p.id}-${p._form}` : p.id;
                      return (
                        <td key={uid} className={`compare-stat-cell${val === best && pokemon.length > 1 ? ' best' : ''}`}>
                          <div className="compare-bar-wrap">
                            <div className="compare-bar" style={{ width: `${Math.round((val / 255) * 100)}%` }} />
                            <span>{val}</span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              <tr className="compare-total-row">
                <td className="compare-stat-label">total</td>
                {pokemon.map(p => {
                  const total = p.stats?.reduce((sum, s) => sum + s.base_value, 0) ?? 0;
                  const bestTotal = Math.max(...pokemon.map(q => q.stats?.reduce((sum, s) => sum + s.base_value, 0) ?? 0));
                  const uid = p._form ? `${p.id}-${p._form}` : p.id;
                  return (
                    <td key={uid} className={`compare-stat-cell${total === bestTotal && pokemon.length > 1 ? ' best' : ''}`}>
                      <strong>{total}</strong>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {abilityShown && (
        <AbilityModal ability={abilityShown} closing={abilityClosing} onClose={() => setSelectedAbility(null)} />
      )}
    </div>
  );
}
