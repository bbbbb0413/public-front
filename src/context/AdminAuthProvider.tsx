import { useState, ReactNode } from 'react';
import { adminLogin as apiAdminLogin, adminSignup as apiAdminSignup, AdminUser } from '../api/admin';
import { AdminAuthContext } from './AdminAuthContext';

// 저장된 값이 깨져 있으면 지우고 로그아웃 상태로 시작한다.
const readSavedAdmin = (): AdminUser | null => {
  const token = localStorage.getItem('admin_token');
  const saved = localStorage.getItem('admin_info');
  if (!token || !saved) return null;
  try {
    return JSON.parse(saved);
  } catch {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_info');
    return null;
  }
};

export const AdminAuthProvider = ({ children }: { children: ReactNode }) => {
  const [admin, setAdmin] = useState<AdminUser | null>(readSavedAdmin);

  const login = async (email: string, password: string) => {
    const result = await apiAdminLogin(email, password);
    const raw = result as unknown as Record<string, unknown>;
    const token = (raw.authToken ?? raw.token) as string | undefined;
    if (!token) throw new Error('No token returned');
    localStorage.setItem('admin_token', token);
    const userPart = (raw.user ?? raw) as AdminUser;
    localStorage.setItem('admin_info', JSON.stringify(userPart));
    setAdmin(userPart);
  };

  const signup = async (name: string, email: string, password: string) => {
    await apiAdminSignup(name, email, password);
  };

  const logout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_info');
    setAdmin(null);
  };

  return (
    <AdminAuthContext.Provider
      value={{ admin, isAdminAuthenticated: !!admin, login, signup, logout }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
};
