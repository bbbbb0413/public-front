import React, { useState, useContext } from 'react';
import { AdminAuthContext } from '../../context/AdminAuthContext';

type Mode = 'login' | 'signup';

export const AdminLogin = () => {
  const auth = useContext(AdminAuthContext);
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!auth) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (!email.trim() || !password.trim()) {
      setError('이메일과 비밀번호를 입력해주세요.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        await auth.login(email, password);
      } else {
        await auth.signup(email, password);
        setSuccessMsg('회원가입 완료! 로그인해주세요.');
        setMode('login');
        setPassword('');
      }
    } catch {
      setError(mode === 'login' ? '로그인에 실패했습니다.' : '회원가입에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
      <div style={{ width: 400, background: '#1e293b', borderRadius: 12, padding: 32, border: '1px solid #334155' }}>
        <h2 style={{ color: '#f1f5f9', marginBottom: 8, fontSize: 22, fontWeight: 700 }}>
          Admin Panel
        </h2>
        <p style={{ color: '#94a3b8', marginBottom: 24, fontSize: 14 }}>
          {mode === 'login' ? '어드민 계정으로 로그인' : '새 어드민 계정 생성'}
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: 12, marginBottom: 6 }}>EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              disabled={loading}
              style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: 12, marginBottom: 6 }}>PASSWORD</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
              style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>

          {error && (
            <div style={{ background: '#450a0a', border: '1px solid #991b1b', borderRadius: 6, padding: '10px 12px', color: '#fca5a5', fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}
          {successMsg && (
            <div style={{ background: '#052e16', border: '1px solid #166534', borderRadius: 6, padding: '10px 12px', color: '#86efac', fontSize: 13, marginBottom: 16 }}>
              {successMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '11px', background: loading ? '#334155' : '#6366f1', border: 'none', borderRadius: 6, color: '#fff', fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccessMsg(''); }}
            style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: 13 }}
          >
            {mode === 'login' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
          </button>
        </div>
      </div>
    </div>
  );
};
