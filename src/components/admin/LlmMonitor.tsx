import React, { useState, useEffect } from 'react';
import { getLlmCosts, getCircuitBreakers, LlmCost, CircuitBreaker } from '../../api/aiAdmin';

const stateColor: Record<string, { bg: string; text: string }> = {
  CLOSED: { bg: '#052e16', text: '#86efac' },
  OPEN: { bg: '#450a0a', text: '#fca5a5' },
  HALF_OPEN: { bg: '#431407', text: '#fed7aa' },
};

export const LlmMonitor = () => {
  const [costs, setCosts] = useState<LlmCost[]>([]);
  const [breakers, setBreakers] = useState<CircuitBreaker[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [costData, breakerData] = await Promise.all([getLlmCosts(), getCircuitBreakers()]);
      setCosts(costData);
      setBreakers(breakerData);
    } catch {
      setError('데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30_000);
    return () => clearInterval(id);
  }, []);

  const totalCost = costs.reduce((sum, c) => sum + c.totalCost, 0);
  const totalTokens = costs.reduce((sum, c) => sum + c.totalTokens, 0);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>LLM 모니터링</h3>
        <button
          onClick={fetchData}
          disabled={loading}
          style={{ padding: '6px 14px', background: '#334155', border: 'none', borderRadius: 6, color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}
        >
          새로고침
        </button>
      </div>

      {error && <div style={{ background: '#450a0a', border: '1px solid #991b1b', borderRadius: 6, padding: '10px 12px', color: '#fca5a5', fontSize: 13, marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>불러오는 중...</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 28 }}>
            <div style={{ background: '#1e293b', borderRadius: 8, border: '1px solid #334155', padding: 20 }}>
              <p style={{ color: '#64748b', fontSize: 12, marginBottom: 6 }}>총 비용</p>
              <p style={{ color: '#f1f5f9', fontSize: 24, fontWeight: 700 }}>${totalCost.toFixed(4)}</p>
            </div>
            <div style={{ background: '#1e293b', borderRadius: 8, border: '1px solid #334155', padding: 20 }}>
              <p style={{ color: '#64748b', fontSize: 12, marginBottom: 6 }}>총 토큰</p>
              <p style={{ color: '#f1f5f9', fontSize: 24, fontWeight: 700 }}>{totalTokens.toLocaleString()}</p>
            </div>
          </div>

          <h4 style={{ color: '#94a3b8', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>모델별 비용</h4>
          {costs.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: 13 }}>데이터 없음</p>
          ) : (
            <div style={{ background: '#1e293b', borderRadius: 8, border: '1px solid #334155', overflow: 'hidden', marginBottom: 28 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['모델', '요청 수', '총 토큰', '총 비용'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', color: '#64748b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #0f172a', textAlign: 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {costs.map(c => (
                    <tr key={c.model}>
                      <td style={{ padding: '10px 12px', color: '#cbd5e1', fontSize: 13, borderBottom: '1px solid #0f172a' }}>{c.model}</td>
                      <td style={{ padding: '10px 12px', color: '#cbd5e1', fontSize: 13, borderBottom: '1px solid #0f172a' }}>{c.requestCount.toLocaleString()}</td>
                      <td style={{ padding: '10px 12px', color: '#cbd5e1', fontSize: 13, borderBottom: '1px solid #0f172a' }}>{c.totalTokens.toLocaleString()}</td>
                      <td style={{ padding: '10px 12px', color: '#cbd5e1', fontSize: 13, borderBottom: '1px solid #0f172a' }}>${c.totalCost.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h4 style={{ color: '#94a3b8', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Circuit Breaker 상태</h4>
          {breakers.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: 13 }}>데이터 없음</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {breakers.map(b => {
                const colors = stateColor[b.status] ?? stateColor.CLOSED;
                return (
                  <div key={b.model} style={{ background: '#1e293b', borderRadius: 8, border: '1px solid #334155', padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 14 }}>{b.model}</span>
                      <span style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, background: colors.bg, color: colors.text }}>
                        {b.status}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 16 }}>
                      <div>
                        <p style={{ color: '#64748b', fontSize: 11, marginBottom: 2 }}>실패 횟수</p>
                        <p style={{ color: '#cbd5e1', fontSize: 14 }}>{b.failureCount}</p>
                      </div>
                      <div>
                        <p style={{ color: '#64748b', fontSize: 11, marginBottom: 2 }}>마지막 실패</p>
                        <p style={{ color: '#cbd5e1', fontSize: 12 }}>
                          {b.openedAt ? new Date(b.openedAt).toLocaleString('ko-KR') : '-'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};
