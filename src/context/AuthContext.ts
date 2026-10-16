import { createContext } from 'react';

export interface User {
  uuid: string;
  accountId?: number;
  nickName?: string;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (uuid: string) => Promise<void>;
  register: (nickName?: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
