import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { login as apiLogin, register as apiRegister } from '../api/identity';

export interface User {
  uuid: string;
  accountId?: number;
  nickName?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (uuid: string) => Promise<void>;
  register: (nickName?: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user_info');
    if (savedToken && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
        setToken(savedToken);
      } catch (e) {
        localStorage.removeItem('token');
        localStorage.removeItem('user_info');
      }
    }
  }, []);

  const storeAuthData = (newToken: string, uuid: string, nickName: string) => {
    localStorage.setItem('token', newToken);
    const userInfo: User = { uuid, nickName };
    localStorage.setItem('user_info', JSON.stringify(userInfo));
    setUser(userInfo);
    setToken(newToken);
  };

  const login = async (uuid: string) => {
    try {
      const data = await apiLogin(uuid);
      if (!data.token) throw new Error('No token provided');
      storeAuthData(data.token, data.uuid, data.nickName);
    } catch (error) {
      throw error;
    }
  };

  const register = async (nickName?: string) => {
    try {
      const data = await apiRegister(nickName);
      if (!data.token) throw new Error('No token provided');
      storeAuthData(data.token, data.uuid, data.nickName);
    } catch (error) {
      throw error;
    }
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
