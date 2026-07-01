import { TYPES, effectiveness } from '../utils/type-chart';

const LABELS = { 2: '2×', 0.5: '½', 0: '0' };

function Cell({ value }) {
  const cls = value === 2 ? 'se' : value === 0.5 ? 'nve' : value === 0 ? 'imm' : '';
  return (
    <td className={`tc-cell ${cls}`}>
      {LABELS[value] || ''}
    </td>
  );
}

function Chart({ title, getValueFn, rowLabel, colLabel }) {
  return (
    <div className="tc-section">
      <h2>{title}</h2>
      <p className="tc-axis-hint">
        <span className="tc-axis-row">{rowLabel}</span> → <span className="tc-axis-col">{colLabel}</span>
      </p>
      <div className="tc-scroll">
        <table className="tc-table">
          <thead>
            <tr>
              <th />
              {TYPES.map(t => (
                <th key={t} className={`type-${t}`}>
                  {t.slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TYPES.map(row => (
              <tr key={row}>
                <th className={`type-${row}`}>
                  {row.slice(0, 3)}
                </th>
                {TYPES.map(col => (
                  <Cell
                    key={col}
                    value={getValueFn(row, col)}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function TypesPage() {
  return (
    <div className="types-page">
      <div className="tc-legend">
        <span className="tc-cell se">2×</span> super effective
        <span className="tc-cell nve">½</span> not very effective
        <span className="tc-cell imm">0</span> immune
      </div>

      <Chart
        title="attacking"
        rowLabel="attacker"
        colLabel="defender"
        getValueFn={(atk, def) => effectiveness[atk][def]}
      />

      <Chart
        title="defending"
        rowLabel="defender"
        colLabel="attacker"
        getValueFn={(def, atk) => effectiveness[atk][def]}
      />
    </div>
  );
}
