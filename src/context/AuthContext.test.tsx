import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { useContext } from 'react';
import { AuthContext, AuthProvider } from './AuthContext';
import axios from 'axios';

// localStorage 모킹
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    clear: () => { store = {}; },
    removeItem: (key: string) => { delete store[key]; }
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

// axios 모킹
vi.mock('axios', () => {
  return {
    default: {
      create: vi.fn().mockReturnThis(),
      interceptors: {
        request: { use: vi.fn(), eject: vi.fn() },
        response: { use: vi.fn(), eject: vi.fn() },
      },
      post: vi.fn(),
      get: vi.fn(),
    },
  };
});

// 테스트용 하위 컴포넌트
const TestConsumer = () => {
  const auth = useContext(AuthContext);
  if (!auth) return <div>No Auth</div>;

  return (
    <div>
      <div data-testid="user-uuid">{auth.user?.uuid || 'none'}</div>
      <div data-testid="is-authenticated">{auth.isAuthenticated ? 'true' : 'false'}</div>
      <button onClick={() => auth.login('test-uuid')} data-testid="login-btn">Login</button>
      <button onClick={auth.logout} data-testid="logout-btn">Logout</button>
    </div>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('renders with default non-authenticated state', () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('false');
    expect(screen.getByTestId('user-uuid')).toHaveTextContent('none');
  });

  it('should call auth/login API and login user successfully', async () => {
    const mockToken = 'mock-jwt-token';
    const mockResponse = {
      data: {
        data: {
          token: mockToken,
          uuid: 'test-uuid',
          nickName: 'Tester',
        },
      },
    };

    vi.mocked(axios.post).mockResolvedValueOnce(mockResponse);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    const loginBtn = screen.getByTestId('login-btn');
    await act(async () => {
      loginBtn.click();
    });

    expect(axios.post).toHaveBeenCalledWith('/auth/login', { uuid: 'test-uuid' });
    expect(window.localStorage.getItem('token')).toBe(mockToken);
    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true');
  });
});
