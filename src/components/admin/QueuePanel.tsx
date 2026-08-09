import React, { useState } from 'react';
import { queueAdd } from '../../api/admin';

interface JobResult {
  jobId: string;
  type: string;
  submittedAt: string;
}

export const QueuePanel = () => {
  const [jobType, setJobType] = useState('');
  const [payloadStr, setPayloadStr] = useState('{}');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<JobResult[]>([]);

  const handleSubmit = async () => {
    if (!jobType.trim()) {
      setError('Job 타입을 입력하세요.');
      return;
    }
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(payloadStr);
    } catch {
      setError('Payload가 유효한 JSON이 아닙니다.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await queueAdd(jobType, payload);
      setResults(prev => [
        { jobId: res.jobId, type: jobType, submittedAt: new Date().toLocaleString('ko-KR') },
        ...prev,
      ]);
      setJobType('');
      setPayloadStr('{}');
    } catch {
      setError('Job 추가에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, marginBottom: 24 }}>큐 패널</h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div style={{ background: '#1e293b', borderRadius: 8, border: '1px solid #334155', padding: 20 }}>
          <h4 style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Job 추가 (POST /queue/add)</h4>

          {error && (
            <div style={{ background: '#450a0a', border: '1px solid #991b1b', borderRadius: 6, padding: '10px 12px', color: '#fca5a5', fontSize: 13, marginBottom: 14 }}>
              {error}
            </div>
          )}

          <label style={{ color: '#64748b', fontSize: 12, display: 'block', marginBottom: 4 }}>Job 타입</label>
          <input
            value={jobType}
            onChange={(e) => setJobType(e.target.value)}
            placeholder="예: email-send, report-generate"
            style={{ width: '100%', padding: '9px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: 13, boxSizing: 'border-box', marginBottom: 14 }}
          />

          <label style={{ color: '#64748b', fontSize: 12, display: 'block', marginBottom: 4 }}>Payload (JSON)</label>
          <textarea
            value={payloadStr}
            onChange={(e) => setPayloadStr(e.target.value)}
            rows={6}
            style={{ width: '100%', padding: '9px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: 13, fontFamily: 'monospace', boxSizing: 'border-box', resize: 'vertical', marginBottom: 16 }}
          />

          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{ width: '100%', padding: '10px', background: loading ? '#334155' : '#6366f1', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 13 }}
          >
            {loading ? '추가 중...' : 'Job 추가'}
          </button>
        </div>

        <div style={{ background: '#1e293b', borderRadius: 8, border: '1px solid #334155', padding: 20 }}>
          <h4 style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>제출된 Job 목록</h4>

          {results.length === 0 ? (
            <p style={{ color: '#475569', fontSize: 13, textAlign: 'center', marginTop: 40 }}>아직 제출된 Job이 없습니다.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {results.map((r) => (
                <div key={r.jobId} style={{ background: '#0f172a', borderRadius: 6, border: '1px solid #334155', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <span style={{ background: '#1d4ed8', color: '#bfdbfe', fontSize: 11, padding: '2px 8px', borderRadius: 4 }}>{r.type}</span>
                    <span style={{ color: '#475569', fontSize: 11 }}>{r.submittedAt}</span>
                  </div>
                  <p style={{ color: '#64748b', fontSize: 11, marginBottom: 2 }}>Job ID</p>
                  <p style={{ color: '#94a3b8', fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>{r.jobId}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
