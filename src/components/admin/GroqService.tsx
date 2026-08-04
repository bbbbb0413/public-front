import React, { useState } from 'react';
import { groqChat, groqEmbedding, GroqMessage } from '../../api/admin';

export const GroqService = () => {
  const [chatMessages, setChatMessages] = useState<GroqMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');

  const [embedText, setEmbedText] = useState('');
  const [embedding, setEmbedding] = useState<number[] | null>(null);
  const [embedLoading, setEmbedLoading] = useState(false);
  const [embedError, setEmbedError] = useState('');

  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    const userMsg: GroqMessage = { role: 'user', content: chatInput };
    const updated = [...chatMessages, userMsg];
    setChatMessages(updated);
    setChatInput('');
    setChatLoading(true);
    setChatError('');
    try {
      const res = await groqChat(updated);
      const assistantMsg: GroqMessage = { role: 'assistant', content: res.content };
      setChatMessages(prev => [...prev, assistantMsg]);
    } catch {
      setChatError('응답 생성에 실패했습니다.');
    } finally {
      setChatLoading(false);
    }
  };

  const handleEmbedding = async () => {
    if (!embedText.trim()) return;
    setEmbedLoading(true);
    setEmbedError('');
    setEmbedding(null);
    try {
      const res = await groqEmbedding(embedText);
      setEmbedding(res.embedding);
    } catch {
      setEmbedError('임베딩 생성에 실패했습니다.');
    } finally {
      setEmbedLoading(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, marginBottom: 24 }}>Groq 서비스</h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div style={{ background: '#1e293b', borderRadius: 8, border: '1px solid #334155', display: 'flex', flexDirection: 'column', height: 480 }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #334155' }}>
            <h4 style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600, margin: 0 }}>채팅 완성 (POST /chat/completion)</h4>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {chatMessages.length === 0 && (
              <p style={{ color: '#475569', fontSize: 13, textAlign: 'center', marginTop: 40 }}>메시지를 입력하세요</p>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '80%', padding: '9px 13px', borderRadius: 8, fontSize: 13,
                  background: m.role === 'user' ? '#6366f1' : '#334155',
                  color: '#f1f5f9',
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '9px 13px', borderRadius: 8, background: '#334155', color: '#64748b', fontSize: 13 }}>생성 중...</div>
              </div>
            )}
          </div>
          {chatError && <p style={{ color: '#fca5a5', fontSize: 12, padding: '0 16px 8px' }}>{chatError}</p>}
          <div style={{ padding: 12, borderTop: '1px solid #334155', display: 'flex', gap: 8 }}>
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendChat()}
              placeholder="메시지 입력..."
              disabled={chatLoading}
              aria-label="Groq 채팅 메시지 입력"
              style={{ flex: 1, padding: '9px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: 13 }}
            />
            <button
              onClick={handleSendChat}
              disabled={chatLoading}
              style={{ padding: '9px 16px', background: chatLoading ? '#334155' : '#6366f1', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 13 }}
            >
              전송
            </button>
            <button
              onClick={() => { setChatMessages([]); setChatError(''); }}
              style={{ padding: '9px 12px', background: '#334155', border: 'none', borderRadius: 6, color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}
            >
              초기화
            </button>
          </div>
        </div>

        <div style={{ background: '#1e293b', borderRadius: 8, border: '1px solid #334155', padding: 20 }}>
          <h4 style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>임베딩 (POST /chat/embedding)</h4>
          <textarea
            value={embedText}
            onChange={(e) => setEmbedText(e.target.value)}
            placeholder="임베딩할 텍스트를 입력하세요..."
            rows={4}
            aria-label="임베딩할 텍스트"
            style={{ width: '100%', padding: '9px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: 13, boxSizing: 'border-box', resize: 'vertical', marginBottom: 12 }}
          />
          <button
            onClick={handleEmbedding}
            disabled={embedLoading}
            style={{ width: '100%', padding: '10px', background: embedLoading ? '#334155' : '#6366f1', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 13, marginBottom: 16 }}
          >
            {embedLoading ? '생성 중...' : '임베딩 생성'}
          </button>
          {embedError && <p style={{ color: '#fca5a5', fontSize: 12, marginBottom: 8 }}>{embedError}</p>}
          {embedding && (
            <div>
              <p style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>임베딩 벡터 (차원: {embedding.length})</p>
              <div style={{ background: '#0f172a', borderRadius: 6, padding: 12, border: '1px solid #334155', maxHeight: 200, overflowY: 'auto' }}>
                <p style={{ color: '#94a3b8', fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  [{embedding.slice(0, 20).map(v => v.toFixed(6)).join(', ')}{embedding.length > 20 ? `, ...+${embedding.length - 20}` : ''}]
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
