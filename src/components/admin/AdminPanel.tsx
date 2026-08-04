import React, { useState, useContext } from 'react';
import { AdminAuthContext } from '../../context/AdminAuthContext';
import { AdminLogin } from './AdminLogin';
import { UserManagement } from './UserManagement';
import { PromptManagement } from './PromptManagement';
import { LlmMonitor } from './LlmMonitor';
import { GroqService } from './GroqService';
import { QueuePanel } from './QueuePanel';
import RagasEvalPanel from './RagasEvalPanel';

type AdminTab = 'users' | 'prompts' | 'llm' | 'groq' | 'queue' | 'ragas';

const TABS: { id: AdminTab; label: string }[] = [
  { id: 'users', label: '유저 관리' },
  { id: 'prompts', label: '프롬프트 관리' },
  { id: 'llm', label: 'LLM 모니터링' },
  { id: 'groq', label: 'Groq 서비스' },
  { id: 'queue', label: '큐 패널' },
  { id: 'ragas', label: 'RAGAS 평가' },
];

export const AdminPanel = () => {
  const auth = useContext(AdminAuthContext);
  const [tab, setTab] = useState<AdminTab>('users');

  if (!auth) return null;
  if (!auth.isAdminAuthenticated) return <AdminLogin />;

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: '#1e293b', borderBottom: '1px solid #334155', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span style={{ color: '#6366f1', fontWeight: 700, fontSize: 16 }}>Admin Panel</span>
          <nav style={{ display: 'flex', gap: 4 }}>
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '6px 16px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  background: tab === t.id ? '#6366f1' : 'transparent',
                  color: tab === t.id ? '#fff' : '#94a3b8',
                }}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#64748b', fontSize: 13 }}>{auth.admin?.email}</span>
          <span style={{ background: '#334155', color: '#94a3b8', fontSize: 11, padding: '2px 8px', borderRadius: 4 }}>{auth.admin?.role}</span>
          <button
            onClick={auth.logout}
            style={{ padding: '6px 14px', background: '#334155', border: 'none', borderRadius: 6, color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}
          >
            로그아웃
          </button>
        </div>
      </header>

      <main style={{ flex: 1 }}>
        {tab === 'users' && <UserManagement />}
        {tab === 'prompts' && <PromptManagement />}
        {tab === 'llm' && <LlmMonitor />}
        {tab === 'groq' && <GroqService />}
        {tab === 'queue' && <QueuePanel />}
        {tab === 'ragas' && <RagasEvalPanel />}
      </main>
    </div>
  );
};
