import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import App from './App';

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

describe('App Component Root', () => {
  it('renders login screen by default', () => {
    render(<App />);
    expect(screen.getByText('LOGIN')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Game User UUID (예: user1)')).toBeInTheDocument();
  });
});
