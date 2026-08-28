const DEFAULT_GATEWAY_PORT = 3000;

/**
 * 게이트웨이 기본 URL을 계산한다. VITE_API_BASE_URL이 빌드 시점에 명시적으로
 * 설정됐으면 그 값을 그대로 쓴다. 비어 있으면 브라우저가 실제로 접속한
 * 호스트(location.hostname)를 기준으로 조립한다 — localhost로 build했더라도
 * LAN IP로 접속한 브라우저에서는 localhost:3000이 아니라 그 LAN IP:3000으로
 * 요청해야 게이트웨이(같은 호스트의 3000 포트)에 닿는다.
 */
export const resolveGatewayBaseUrl = (): string => {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (configured) return configured;

  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:${DEFAULT_GATEWAY_PORT}`;
  }

  return `http://localhost:${DEFAULT_GATEWAY_PORT}`;
};

export const GATEWAY_BASE_URL = resolveGatewayBaseUrl();
