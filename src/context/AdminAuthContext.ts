import { createContext } from 'react';
import type { AdminUser } from '../api/admin';

export interface AdminAuthContextType {
  admin: AdminUser | null;
  isAdminAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);
