import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import './Login.css';

interface LoginProps {
  onSwitchToRegister: () => void;
}

export const Login = ({ onSwitchToRegister }: LoginProps) => {
  const auth = useContext(AuthContext);
  const [uuid, setUuid] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!auth) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uuid.trim()) {
      setError('UUID를 입력해주세요.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await auth.login(uuid);
    } catch (err) {
      setError('로그인에 실패했습니다. 올바른 UUID인지 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card glass-panel">
        <h2 className="login-title">LOGIN</h2>
        <p className="login-subtitle">게임 서버에 접속하기 위해 UUID를 입력하세요.</p>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <input
              type="text"
              placeholder="Game User UUID (예: user1)"
              value={uuid}
              onChange={(e) => setUuid(e.target.value)}
              disabled={loading}
              className="login-input"
              aria-label="게임 유저 UUID"
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <button type="submit" disabled={loading} className="login-button">
            {loading ? '접속 중...' : '접속하기'}
          </button>
        </form>
        <p style={{ marginTop: '20px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          계정이 없으신가요?{' '}
          <button
            onClick={onSwitchToRegister}
            style={{ background: 'none', border: 'none', color: 'var(--color-accent)', cursor: 'pointer', fontSize: '0.875rem', padding: 0 }}
          >
            회원가입
          </button>
        </p>
      </div>
    </div>
  );
};
