import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { adminLogin as apiAdminLogin, adminSignup as apiAdminSignup, AdminUser } from '../api/admin';

interface AdminAuthContextType {
  admin: AdminUser | null;
  isAdminAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const AdminAuthProvider = ({ children }: { children: ReactNode }) => {
  const [admin, setAdmin] = useState<AdminUser | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    const saved = localStorage.getItem('admin_info');
    if (token && saved) {
      try {
        setAdmin(JSON.parse(saved));
      } catch {
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_info');
      }
    }
  }, []);

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

  const signup = async (email: string, password: string) => {
    await apiAdminSignup(email, password);
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
