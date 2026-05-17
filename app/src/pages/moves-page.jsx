import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatSlugLower } from '../utils/format-name';
import moves from '../data/moves.json';

const TYPES = [...new Set(moves.map(m => m.type).filter(Boolean))].sort();
const CLASSES = ['physical', 'special', 'status'];

const COLUMNS = [
  { key: 'name',         label: 'name',  type: 'string' },
  { key: 'type',         label: 'type',  type: 'string' },
  { key: 'damage_class', label: 'class', type: 'string' },
  { key: 'power',        label: 'power', type: 'number' },
  { key: 'accuracy',     label: 'acc',   type: 'number' },
  { key: 'pp',           label: 'pp',    type: 'number' },
];

function MoveRow({ move }) {
  return (
    <tr className="moves-row">
      <td className="moves-name">{formatSlugLower(move.name)}</td>
      <td>
        {move.type && <span className={`type-badge type-${move.type}`}>{move.type}</span>}
      </td>
      <td className="moves-class">{move.damage_class || '—'}</td>
      <td className="moves-num">{move.power ?? '—'}</td>
      <td className="moves-num">{move.accuracy ?? '—'}</td>
      <td className="moves-num">{move.pp ?? '—'}</td>
    </tr>
  );
}

export default function MovesPage() {
  const [searchParams] = useSearchParams();
  const [typeFilter, setTypeFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  // seed the search input from ?q=… so global-search arrivals land
  // pre-filtered. only the very first render — clearing the input afterward
  // shouldn't be undone by the param.
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  // re-arrival from global search (when navigating between /search?q=A and
  // /moves?q=B) needs to refresh the search input even though the component
  // is already mounted. compare against the current url param.
  useEffect(() => {
    const q = searchParams.get('q');
    if (q !== null) setSearch(q);
  }, [searchParams]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'type' || key === 'damage_class' ? 'asc' : 'desc');
    }
  };

  const results = useMemo(() => {
    let list = moves;
    if (typeFilter) list = list.filter(m => m.type === typeFilter);
    if (classFilter) list = list.filter(m => m.damage_class === classFilter);
    if (search.trim()) {
      const tokens = search.toLowerCase().split(/\s+/);
      list = list.filter(m => tokens.every(t => m.name.includes(t)));
    }

    const col = COLUMNS.find(c => c.key === sortKey);
    return [...list].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      let cmp = col?.type === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [typeFilter, classFilter, search, sortKey, sortDir]);

  return (
    <div className="moves-page">
      <h1>moves</h1>
      <p className="moves-page__sub">{results.length} of {moves.length} moves</p>

      <div className="moves-filters">
        <input
          type="text"
          className="moves-search"
          placeholder="search moves..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">all types</option>
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={classFilter} onChange={e => setClassFilter(e.target.value)}>
          <option value="">all classes</option>
          {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="moves-table-wrap">
        <table className="moves-table">
          <thead>
            <tr>
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  className={`moves-th-sort${sortKey === col.key ? ' active' : ''}`}
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="moves-sort-arrow">{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map(m => <MoveRow key={m.id} move={m} />)}
          </tbody>
        </table>
      </div>

      {results.length === 0 && (
        <p className="empty">no moves found.</p>
      )}
    </div>
  );
}
