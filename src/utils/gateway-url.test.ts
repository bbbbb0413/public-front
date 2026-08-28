import { describe, it, expect, vi, afterEach } from 'vitest';

describe('resolveGatewayBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('Given VITE_API_BASE_URL이 명시적으로 설정된 경우 When 게이트웨이 URL을 계산하면 Then 그 값을 그대로 사용한다', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
    const { resolveGatewayBaseUrl } = await import('./gateway-url');

    expect(resolveGatewayBaseUrl()).toBe('https://api.example.com');
  });

  it('Given VITE_API_BASE_URL이 비어있는 경우 When 게이트웨이 URL을 계산하면 Then 브라우저가 접속한 hostname 기준으로 3000번 포트 URL을 만든다', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, protocol: 'http:', hostname: '10.250.173.51' },
      writable: true,
    });

    const { resolveGatewayBaseUrl } = await import('./gateway-url');
    expect(resolveGatewayBaseUrl()).toBe('http://10.250.173.51:3000');

    Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
  });
});
