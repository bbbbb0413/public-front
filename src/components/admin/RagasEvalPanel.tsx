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
  const [selectedEval, setSelectedEval] = useState<RagasEval | null>(null);

  const handleLimitChange = (next: number) => {
    setLoading(true);
    setError(null);
    setLimit(next);
  };

  useEffect(() => {
    getRagasEvals(limit)
      .then(setEvals)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [limit]);

  useEffect(() => {
    if (!selectedEval) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedEval(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEval]);

  const avg = (key: keyof Pick<RagasEval, 'faithfulness' | 'answerRelevancy' | 'contextPrecision'>) =>
    evals.length === 0 ? 0 : evals.reduce((s, e) => s + e[key], 0) / evals.length;

  return (
    <div style={{ padding: '24px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, color: '#f1f5f9' }}>RAGAS 평가 결과</h2>
        <select
          value={limit}
          onChange={(e) => handleLimitChange(Number(e.target.value))}
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
                {['질문', '신뢰성', '답변 관련성', '컨텍스트 정밀도', '평가 시각', '상세'].map((h) => (
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
                  onClick={() => setSelectedEval(ev)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedEval(ev);
                    }
                  }}
                  tabIndex={0}
                  aria-label={`${ev.question} 상세 보기`}
                  style={{
                    borderBottom: '1px solid #1e293b',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s ease',
                    outline: 'none',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.backgroundColor = '#1e293b44';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#1e293b44';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
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
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEval(ev);
                      }}
                      style={{
                        background: '#334155',
                        border: 'none',
                        color: '#f1f5f9',
                        padding: '4px 10px',
                        borderRadius: 4,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      상세
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedEval && (
        <div
          data-testid="ragas-eval-modal-overlay"
          onClick={() => setSelectedEval(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ragas-modal-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 12,
              width: '100%',
              maxWidth: 720,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 20px',
                borderBottom: '1px solid #1e293b',
              }}
            >
              <h3 id="ragas-modal-title" style={{ margin: 0, fontSize: 16, color: '#f1f5f9', fontWeight: 600 }}>
                평가 상세 내역
              </h3>
              <button
                type="button"
                onClick={() => setSelectedEval(null)}
                aria-label="닫기"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: 18,
                  cursor: 'pointer',
                  padding: 4,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                padding: '20px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
              }}
            >
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>질문</div>
                <div
                  style={{
                    background: '#1e293b',
                    padding: '12px 14px',
                    borderRadius: 8,
                    color: '#f1f5f9',
                    fontSize: 14,
                    lineHeight: 1.5,
                    border: '1px solid #334155',
                  }}
                >
                  {selectedEval.question}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>생성된 AI 답변</div>
                <div
                  style={{
                    background: '#1e293b',
                    padding: '12px 14px',
                    borderRadius: 8,
                    color: '#e2e8f0',
                    fontSize: 13,
                    lineHeight: 1.6,
                    border: '1px solid #334155',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {selectedEval.answer || '(답변 없음)'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>평가 점수</div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 12,
                  }}
                >
                  {(
                    [
                      { key: 'faithfulness', label: '신뢰성', value: selectedEval.faithfulness },
                      { key: 'answerRelevancy', label: '답변 관련성', value: selectedEval.answerRelevancy },
                      { key: 'contextPrecision', label: '컨텍스트 정밀도', value: selectedEval.contextPrecision },
                    ] as const
                  ).map(({ key, label, value }) => (
                    <div
                      key={key}
                      style={{
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: 8,
                        padding: '12px 14px',
                      }}
                    >
                      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>{label}</div>
                      <MetricBar value={value} />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>
                  참조된 컨텍스트 ({selectedEval.contexts?.length ?? 0}개)
                </div>
                {!selectedEval.contexts || selectedEval.contexts.length === 0 ? (
                  <div
                    style={{
                      background: '#1e293b',
                      padding: '14px 16px',
                      borderRadius: 8,
                      border: '1px solid #334155',
                      color: '#94a3b8',
                      fontSize: 13,
                      textAlign: 'center',
                    }}
                  >
                    참조된 지식베이스 컨텍스트가 없습니다.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {selectedEval.contexts.map((ctx, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: 8,
                          padding: '12px 14px',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#38bdf8',
                            marginBottom: 6,
                          }}
                        >
                          컨텍스트 {idx + 1}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: '#e2e8f0',
                            lineHeight: 1.5,
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {ctx}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                padding: '12px 20px',
                borderTop: '1px solid #1e293b',
                background: '#0a101d',
              }}
            >
              <button
                type="button"
                onClick={() => setSelectedEval(null)}
                style={{
                  background: '#334155',
                  border: 'none',
                  color: '#f1f5f9',
                  padding: '8px 16px',
                  borderRadius: 6,
                  fontSize: 13,
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
