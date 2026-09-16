import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { InternalAxiosRequestConfig } from 'axios';
import adminClient from './adminClient';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    clear: () => {
      store = {};
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

interface InterceptorHandler<T> {
  fulfilled?: (value: T) => T | Promise<T>;
  rejected?: (error: unknown) => Promise<unknown>;
}

describe('adminClient', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('admin_token이 존재하면 Authorization 헤더에 Bearer 토큰을 주입한다', () => {
    localStorage.setItem('admin_token', 'test-admin-jwt');

    const requestInterceptor = (adminClient.interceptors.request as unknown as {
      handlers: Array<InterceptorHandler<InternalAxiosRequestConfig>>;
    }).handlers[0];

    const config = { headers: {} } as InternalAxiosRequestConfig;
    const result = requestInterceptor.fulfilled?.(config) as InternalAxiosRequestConfig;

    expect(result.headers.Authorization).toBe('Bearer test-admin-jwt');
  });

  it('admin_token이 없으면 Authorization 헤더를 추가하지 않는다', () => {
    const requestInterceptor = (adminClient.interceptors.request as unknown as {
      handlers: Array<InterceptorHandler<InternalAxiosRequestConfig>>;
    }).handlers[0];

    const config = { headers: {} } as InternalAxiosRequestConfig;
    const result = requestInterceptor.fulfilled?.(config) as InternalAxiosRequestConfig;

    expect(result.headers.Authorization).toBeUndefined();
  });

  it('401 응답 수신 시 localStorage에서 admin_token과 admin_info를 제거한다', async () => {
    localStorage.setItem('admin_token', 'test-admin-jwt');
    localStorage.setItem('admin_info', JSON.stringify({ email: 'admin@test.com' }));

    const responseInterceptor = (adminClient.interceptors.response as unknown as {
      handlers: Array<InterceptorHandler<unknown>>;
    }).handlers[0];

    const error401 = { response: { status: 401 } };

    await expect(responseInterceptor.rejected?.(error401)).rejects.toEqual(error401);
    expect(localStorage.getItem('admin_token')).toBeNull();
    expect(localStorage.getItem('admin_info')).toBeNull();
  });

  it('401 이외의 에러 발생 시 localStorage 토큰을 삭제하지 않고 에러를 반환한다', async () => {
    localStorage.setItem('admin_token', 'test-admin-jwt');
    localStorage.setItem('admin_info', JSON.stringify({ email: 'admin@test.com' }));

    const responseInterceptor = (adminClient.interceptors.response as unknown as {
      handlers: Array<InterceptorHandler<unknown>>;
    }).handlers[0];

    const error500 = { response: { status: 500 } };

    await expect(responseInterceptor.rejected?.(error500)).rejects.toEqual(error500);
    expect(localStorage.getItem('admin_token')).toBe('test-admin-jwt');
    expect(localStorage.getItem('admin_info')).toBe(JSON.stringify({ email: 'admin@test.com' }));
  });
});
