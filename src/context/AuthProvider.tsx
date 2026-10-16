import { useState, ReactNode } from 'react';
import { login as apiLogin, register as apiRegister } from '../api/identity';
import { AuthContext, User } from './AuthContext';

interface SavedAuth {
  user: User | null;
  token: string | null;
}

// 저장된 값이 깨져 있으면 지우고 로그아웃 상태로 시작한다.
const readSavedAuth = (): SavedAuth => {
  const savedToken = localStorage.getItem('token');
  const savedUser = localStorage.getItem('user_info');
  if (!savedToken || !savedUser) return { user: null, token: null };
  try {
    return { user: JSON.parse(savedUser), token: savedToken };
  } catch {
    localStorage.removeItem('token');
    localStorage.removeItem('user_info');
    return { user: null, token: null };
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [initial] = useState(readSavedAuth);
  const [user, setUser] = useState<User | null>(initial.user);
  const [token, setToken] = useState<string | null>(initial.token);

  const storeAuthData = (newToken: string, uuid: string, nickName: string, accountId?: number) => {
    localStorage.setItem('token', newToken);
    const userInfo: User = { uuid, nickName, accountId };
    localStorage.setItem('user_info', JSON.stringify(userInfo));
    setUser(userInfo);
    setToken(newToken);
  };

  const login = async (uuid: string) => {
    const data = await apiLogin(uuid);
    if (!data.token) throw new Error('No token provided');
    storeAuthData(data.token, data.uuid, data.nickName, data.accountId);
  };

  const register = async (nickName?: string) => {
    const data = await apiRegister(nickName);
    if (!data.token) throw new Error('No token provided');
    storeAuthData(data.token, data.uuid, data.nickName, data.accountId);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user_info');
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
