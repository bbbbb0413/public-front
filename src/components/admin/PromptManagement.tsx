import React, { useState } from 'react';
import {
  createPrompt,
  getPromptVersions,
  getActivePrompt,
  activatePromptVersion,
  Prompt,
} from '../../api/aiAdmin';

const SYSTEM_VARS = [
  { name: '{{context}}', desc: '검색된 문서 청크 (필수, 시스템 자동 주입)' },
  { name: '{{currentDate}}', desc: '오늘 날짜 (선택, 기간 계산이 필요한 경우에만 사용)' },
];

const cellStyle: React.CSSProperties = { padding: '10px 12px', color: '#cbd5e1', fontSize: 13, borderBottom: '1px solid #0f172a' };
const headStyle: React.CSSProperties = { padding: '10px 12px', color: '#64748b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #0f172a', textAlign: 'left' };

export const PromptManagement = () => {
  const [searchName, setSearchName] = useState('');
  const [versions, setVersions] = useState<Prompt[]>([]);
  const [activePrompt, setActivePrompt] = useState<Prompt | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [createName, setCreateName] = useState('rag-qa-system');
  const [createContent, setCreateContent] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [loadDefaultLoading, setLoadDefaultLoading] = useState(false);

  const [detailPrompt, setDetailPrompt] = useState<Prompt | null>(null);

  const handleSearch = async () => {
    if (!searchName.trim()) return;
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const [versionList, active] = await Promise.all([
        getPromptVersions(searchName),
        getActivePrompt(searchName).catch(() => null),
      ]);
      setVersions(versionList);
      setActivePrompt(active);
    } catch {
      setError('프롬프트를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (prompt: Prompt) => {
    try {
      await activatePromptVersion(prompt.name, prompt.version);
      setSuccessMsg(`v${prompt.version} 활성화 완료`);
      handleSearch();
    } catch {
      setError('활성화에 실패했습니다.');
    }
  };

  const handleLoadDefault = async () => {
    const name = createName.trim() || 'rag-qa-system';
    setLoadDefaultLoading(true);
    setError('');
    try {
      const active = await getActivePrompt(name);
      if (active?.content) {
        setCreateContent(active.content);
        setCreateName(name);
      }
    } catch {
      setError('기본 프롬프트를 불러오지 못했습니다.');
    } finally {
      setLoadDefaultLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!createName.trim() || !createContent.trim()) {
      setError('이름과 내용을 모두 입력하세요.');
      return;
    }
    setCreateLoading(true);
    setError('');
    try {
      await createPrompt(createName, createContent);
      setSuccessMsg(`프롬프트 "${createName}" 생성 완료`);
      setCreateContent('');
      if (searchName === createName) handleSearch();
    } catch {
      setError('프롬프트 생성에 실패했습니다.');
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, marginBottom: 24 }}>프롬프트 관리</h3>

      {error && <div style={{ background: '#450a0a', border: '1px solid #991b1b', borderRadius: 6, padding: '10px 12px', color: '#fca5a5', fontSize: 13, marginBottom: 16 }}>{error}</div>}
      {successMsg && <div style={{ background: '#052e16', border: '1px solid #166534', borderRadius: 6, padding: '10px 12px', color: '#86efac', fontSize: 13, marginBottom: 16 }}>{successMsg}</div>}

      {/* 시스템 변수 안내 */}
      <div style={{ background: '#0f1f38', border: '1px solid #1d4ed8', borderRadius: 8, padding: '12px 16px', marginBottom: 24 }}>
        <div style={{ color: '#93c5fd', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>시스템 자동 주입 변수 — 코드에서 자동으로 채워지며 사용자가 별도 설정하지 않아도 됩니다</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {SYSTEM_VARS.map(v => (
            <div key={v.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <code style={{ background: '#1e3a5f', color: '#60a5fa', padding: '2px 7px', borderRadius: 4, fontSize: 12, fontFamily: 'monospace' }}>{v.name}</code>
              <span style={{ color: '#64748b', fontSize: 12 }}>{v.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28 }}>
        {/* 프롬프트 조회 */}
        <div style={{ background: '#1e293b', borderRadius: 8, border: '1px solid #334155', padding: 20 }}>
          <h4 style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>프롬프트 조회</h4>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="프롬프트 이름 (예: rag-qa-system)"
              style={{ flex: 1, padding: '9px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: 13 }}
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              style={{ padding: '9px 16px', background: '#6366f1', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 13 }}
            >
              조회
            </button>
          </div>
          {activePrompt && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#052e16', border: '1px solid #166534', borderRadius: 6 }}>
              <span style={{ color: '#86efac', fontSize: 12 }}>활성 버전: v{activePrompt.version}</span>
            </div>
          )}
        </div>

        {/* 새 프롬프트 생성 */}
        <div style={{ background: '#1e293b', borderRadius: 8, border: '1px solid #334155', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h4 style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>새 프롬프트 버전 생성</h4>
            <button
              onClick={handleLoadDefault}
              disabled={loadDefaultLoading}
              style={{ padding: '4px 10px', background: '#334155', border: 'none', borderRadius: 4, color: '#94a3b8', cursor: 'pointer', fontSize: 11 }}
            >
              {loadDefaultLoading ? '로딩...' : '현재 활성 불러오기'}
            </button>
          </div>
          <input
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="이름 (예: rag-qa-system)"
            style={{ width: '100%', padding: '9px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: 13, boxSizing: 'border-box', marginBottom: 8 }}
          />
          <textarea
            value={createContent}
            onChange={(e) => setCreateContent(e.target.value)}
            placeholder={`프롬프트 내용\n\n예시:\n당신은 문서 기반 AI 어시스턴트입니다.\n오늘 날짜: {{currentDate}}\n\n컨텍스트:\n{{context}}`}
            rows={12}
            style={{ width: '100%', padding: '9px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: 13, boxSizing: 'border-box', resize: 'vertical', marginBottom: 8, fontFamily: 'monospace', lineHeight: 1.6 }}
          />
          <button
            onClick={handleCreate}
            disabled={createLoading}
            style={{ width: '100%', padding: '9px', background: createLoading ? '#334155' : '#6366f1', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 13 }}
          >
            {createLoading ? '생성 중...' : '새 버전으로 저장'}
          </button>
        </div>
      </div>

      {versions.length > 0 && (
        <div style={{ background: '#1e293b', borderRadius: 8, border: '1px solid #334155', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={headStyle}>버전</th>
                <th style={headStyle}>이름</th>
                <th style={headStyle}>상태</th>
                <th style={headStyle}>생성일</th>
                <th style={headStyle}>액션</th>
              </tr>
            </thead>
            <tbody>
              {versions.map(p => (
                <tr key={p.id}>
                  <td style={cellStyle}>v{p.version}</td>
                  <td style={cellStyle}>{p.name}</td>
                  <td style={cellStyle}>
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: p.isActive ? '#052e16' : '#1e293b', color: p.isActive ? '#86efac' : '#64748b' }}>
                      {p.isActive ? '활성' : '비활성'}
                    </span>
                  </td>
                  <td style={cellStyle}>{new Date(p.createdAt).toLocaleDateString('ko-KR')}</td>
                  <td style={{ ...cellStyle, display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => setDetailPrompt(p)}
                      style={{ padding: '3px 8px', background: '#1d4ed8', border: 'none', borderRadius: 4, color: '#bfdbfe', cursor: 'pointer', fontSize: 11 }}
                    >
                      내용 보기
                    </button>
                    <button
                      onClick={() => { setCreateName(p.name); setCreateContent(p.content); }}
                      style={{ padding: '3px 8px', background: '#334155', border: 'none', borderRadius: 4, color: '#94a3b8', cursor: 'pointer', fontSize: 11 }}
                    >
                      편집
                    </button>
                    {!p.isActive && (
                      <button
                        onClick={() => handleActivate(p)}
                        style={{ padding: '3px 8px', background: '#166534', border: 'none', borderRadius: 4, color: '#86efac', cursor: 'pointer', fontSize: 11 }}
                      >
                        활성화
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailPrompt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#1e293b', borderRadius: 12, padding: 28, width: 620, maxWidth: '90vw', border: '1px solid #334155' }}>
            <h4 style={{ color: '#f1f5f9', marginBottom: 8, fontSize: 16 }}>{detailPrompt.name} v{detailPrompt.version}</h4>
            <pre style={{ background: '#0f172a', borderRadius: 6, padding: 16, color: '#94a3b8', fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 400, overflowY: 'auto', border: '1px solid #334155', fontFamily: 'monospace', lineHeight: 1.6 }}>
              {detailPrompt.content}
            </pre>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                onClick={() => { setCreateName(detailPrompt.name); setCreateContent(detailPrompt.content); setDetailPrompt(null); }}
                style={{ padding: '8px 20px', background: '#1d4ed8', border: 'none', borderRadius: 6, color: '#bfdbfe', cursor: 'pointer', fontSize: 13 }}
              >
                편집창에 불러오기
              </button>
              <button
                onClick={() => setDetailPrompt(null)}
                style={{ padding: '8px 20px', background: '#334155', border: 'none', borderRadius: 6, color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
