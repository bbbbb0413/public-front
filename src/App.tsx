import React, { useContext, useState } from 'react';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { AdminAuthProvider } from './context/AdminAuthContext';
import { Login } from './components/Login';
import { Register } from './components/Register';
import { Profile } from './components/Profile';
import { AdminPanel } from './components/admin/AdminPanel';
import './index.css';
import './App.css';

type AppMode = 'user' | 'admin';
type AuthView = 'login' | 'register';

const GameApp = ({ onSwitchMode }: { onSwitchMode: () => void }) => {
  const auth = useContext(AuthContext);
  const [authView, setAuthView] = useState<AuthView>('login');

  const renderAuthView = () => {
    if (authView === 'register') {
      return <Register onSwitchToLogin={() => setAuthView('login')} />;
    }
    return <Login onSwitchToRegister={() => setAuthView('register')} />;
  };

  return (
    <div className="app-container">
      <div style={{ position: 'fixed', top: 12, right: 12, zIndex: 50 }}>
        <button
          onClick={onSwitchMode}
          style={{ padding: '6px 14px', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}
        >
          Admin Mode
        </button>
      </div>
      {auth?.isAuthenticated ? <Profile /> : renderAuthView()}
    </div>
  );
};

function App() {
  const [mode, setMode] = useState<AppMode>('user');

  if (mode === 'admin') {
    return (
      <AdminAuthProvider>
        <div style={{ position: 'fixed', top: 12, right: 12, zIndex: 50 }}>
          <button
            onClick={() => setMode('user')}
            style={{ padding: '6px 14px', background: '#1e293b', border: '1px solid #6366f1', borderRadius: 6, color: '#6366f1', cursor: 'pointer', fontSize: 12 }}
          >
            User Mode
          </button>
        </div>
        <AdminPanel />
      </AdminAuthProvider>
    );
  }

  return (
    <AuthProvider>
      <GameApp onSwitchMode={() => setMode('admin')} />
    </AuthProvider>
  );
}

export default App;
