import { useState, useEffect } from 'react';
import { getRagasEvals, RagasEval } from '../../api/aiAdmin';

function MetricBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          flex: 1,
          height: 6,
          background: '#1e293b',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, color, minWidth: 36, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

export default function RagasEvalPanel() {
  const [evals, setEvals] = useState<RagasEval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(20);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getRagasEvals(limit)
      .then(setEvals)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [limit]);

  const avg = (key: keyof Pick<RagasEval, 'faithfulness' | 'answerRelevancy' | 'contextPrecision'>) =>
    evals.length === 0 ? 0 : evals.reduce((s, e) => s + e[key], 0) / evals.length;

  return (
    <div style={{ padding: '24px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, color: '#f1f5f9' }}>RAGAS 평가 결과</h2>
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            color: '#f1f5f9',
            padding: '4px 10px',
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          {[10, 20, 50, 100].map((n) => (
            <option key={n} value={n}>최근 {n}건</option>
          ))}
        </select>
      </div>

      {evals.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
            marginBottom: 24,
          }}
        >
          {(
            [
              { key: 'faithfulness', label: '신뢰성' },
              { key: 'answerRelevancy', label: '답변 관련성' },
              { key: 'contextPrecision', label: '컨텍스트 정밀도' },
            ] as const
          ).map(({ key, label }) => (
            <div
              key={key}
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 8,
                padding: '14px 16px',
              }}
            >
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>{label} 평균</div>
              <MetricBar value={avg(key)} />
            </div>
          ))}
        </div>
      )}

      {loading && <p style={{ color: '#94a3b8', textAlign: 'center' }}>로딩 중...</p>}
      {error && <p style={{ color: '#ef4444', textAlign: 'center' }}>{error}</p>}

      {!loading && !error && evals.length === 0 && (
        <p style={{ color: '#64748b', textAlign: 'center' }}>평가 데이터가 없습니다.</p>
      )}

      {evals.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['질문', '신뢰성', '답변 관련성', '컨텍스트 정밀도', '평가 시각'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '8px 12px',
                      textAlign: 'left',
                      borderBottom: '1px solid #334155',
                      color: '#94a3b8',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {evals.map((ev) => (
                <tr
                  key={ev.traceId}
                  style={{ borderBottom: '1px solid #1e293b' }}
                >
                  <td
                    style={{
                      padding: '10px 12px',
                      color: '#e2e8f0',
                      maxWidth: 280,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={ev.question}
                  >
                    {ev.question}
                  </td>
                  <td style={{ padding: '10px 12px', minWidth: 120 }}>
                    <MetricBar value={ev.faithfulness} />
                  </td>
                  <td style={{ padding: '10px 12px', minWidth: 120 }}>
                    <MetricBar value={ev.answerRelevancy} />
                  </td>
                  <td style={{ padding: '10px 12px', minWidth: 120 }}>
                    <MetricBar value={ev.contextPrecision} />
                  </td>
                  <td style={{ padding: '10px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                    {new Date(ev.sampledAt).toLocaleString('ko-KR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
