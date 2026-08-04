import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import './Login.css';

interface RegisterProps {
  onSwitchToLogin: () => void;
}

export const Register = ({ onSwitchToLogin }: RegisterProps) => {
  const auth = useContext(AuthContext);
  const [nickName, setNickName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!auth) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await auth.register(nickName.trim() || undefined);
    } catch {
      setError('계정 생성에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card glass-panel">
        <h2 className="login-title">REGISTER</h2>
        <p className="login-subtitle">새 게임 계정을 생성합니다. 닉네임은 선택 사항입니다.</p>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <input
              type="text"
              placeholder="닉네임 (선택사항)"
              value={nickName}
              onChange={(e) => setNickName(e.target.value)}
              disabled={loading}
              className="login-input"
              maxLength={20}
              aria-label="닉네임 (선택사항)"
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <button type="submit" disabled={loading} className="login-button">
            {loading ? '생성 중...' : '계정 생성하기'}
          </button>
        </form>
        <p style={{ marginTop: '20px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          이미 계정이 있으신가요?{' '}
          <button
            onClick={onSwitchToLogin}
            style={{ background: 'none', border: 'none', color: 'var(--color-accent)', cursor: 'pointer', fontSize: '0.875rem', padding: 0 }}
          >
            로그인
          </button>
        </p>
      </div>
    </div>
  );
};
