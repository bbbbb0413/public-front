export type NormalizedCircuitBreakerStatus = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerStatusColor {
  bg: string;
  text: string;
}

export const CIRCUIT_BREAKER_STATUS_COLORS: Record<NormalizedCircuitBreakerStatus, CircuitBreakerStatusColor> = {
  CLOSED: { bg: '#052e16', text: '#86efac' },
  OPEN: { bg: '#450a0a', text: '#fca5a5' },
  HALF_OPEN: { bg: '#431407', text: '#fed7aa' },
};

export const normalizeCircuitBreakerStatus = (
  status?: string | null,
): NormalizedCircuitBreakerStatus => {
  if (!status) {
    return 'CLOSED';
  }

  const normalized = status.trim().toUpperCase().replace(/-/g, '_');

  if (normalized === 'OPEN') {
    return 'OPEN';
  }
  if (normalized === 'HALF_OPEN') {
    return 'HALF_OPEN';
  }
  if (normalized === 'CLOSED') {
    return 'CLOSED';
  }

  return 'CLOSED';
};

export const getCircuitBreakerStatusColor = (
  status?: string | null,
): CircuitBreakerStatusColor => {
  const normalizedStatus = normalizeCircuitBreakerStatus(status);
  return CIRCUIT_BREAKER_STATUS_COLORS[normalizedStatus] ?? CIRCUIT_BREAKER_STATUS_COLORS.CLOSED;
};
