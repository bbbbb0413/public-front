import { describe, it, expect } from 'vitest';
import {
  normalizeCircuitBreakerStatus,
  getCircuitBreakerStatusColor,
  CIRCUIT_BREAKER_STATUS_COLORS,
} from './circuit-breaker';

describe('circuit-breaker utils', () => {
  describe('normalizeCircuitBreakerStatus', () => {
    it('소문자 케밥케이스 상태를 대문자 스네이크케이스로 정규화한다', () => {
      expect(normalizeCircuitBreakerStatus('closed')).toBe('CLOSED');
      expect(normalizeCircuitBreakerStatus('open')).toBe('OPEN');
      expect(normalizeCircuitBreakerStatus('half-open')).toBe('HALF_OPEN');
    });

    it('대문자 스네이크케이스 상태를 올바르게 반환한다', () => {
      expect(normalizeCircuitBreakerStatus('CLOSED')).toBe('CLOSED');
      expect(normalizeCircuitBreakerStatus('OPEN')).toBe('OPEN');
      expect(normalizeCircuitBreakerStatus('HALF_OPEN')).toBe('HALF_OPEN');
    });

    it('대소문자 혼합 및 하이픈/언더스코어 변형을 올바르게 정규화한다', () => {
      expect(normalizeCircuitBreakerStatus('Half-Open')).toBe('HALF_OPEN');
      expect(normalizeCircuitBreakerStatus('half_open')).toBe('HALF_OPEN');
      expect(normalizeCircuitBreakerStatus('Open')).toBe('OPEN');
      expect(normalizeCircuitBreakerStatus('Closed')).toBe('CLOSED');
      expect(normalizeCircuitBreakerStatus('  open  ')).toBe('OPEN');
    });

    it('null, undefined, 빈 문자열 또는 알 수 없는 상태는 안전하게 CLOSED로 폴백한다', () => {
      expect(normalizeCircuitBreakerStatus(null)).toBe('CLOSED');
      expect(normalizeCircuitBreakerStatus(undefined)).toBe('CLOSED');
      expect(normalizeCircuitBreakerStatus('')).toBe('CLOSED');
      expect(normalizeCircuitBreakerStatus('UNKNOWN_STATUS')).toBe('CLOSED');
    });
  });

  describe('getCircuitBreakerStatusColor', () => {
    it('OPEN 상태에 대한 위험 색상(빨간색 계열)을 반환한다', () => {
      const color = getCircuitBreakerStatusColor('open');
      expect(color).toEqual(CIRCUIT_BREAKER_STATUS_COLORS.OPEN);
      expect(color).toEqual({ bg: '#450a0a', text: '#fca5a5' });
    });

    it('HALF_OPEN 상태에 대한 경고 색상(주황색 계열)을 반환한다', () => {
      const color = getCircuitBreakerStatusColor('half-open');
      expect(color).toEqual(CIRCUIT_BREAKER_STATUS_COLORS.HALF_OPEN);
      expect(color).toEqual({ bg: '#431407', text: '#fed7aa' });
    });

    it('CLOSED 상태에 대한 정상 색상(녹색 계열)을 반환한다', () => {
      const color = getCircuitBreakerStatusColor('closed');
      expect(color).toEqual(CIRCUIT_BREAKER_STATUS_COLORS.CLOSED);
      expect(color).toEqual({ bg: '#052e16', text: '#86efac' });
    });

    it('알 수 없는 값이나 빈 값에 대해 기본 CLOSED 색상을 반환한다', () => {
      expect(getCircuitBreakerStatusColor(undefined)).toEqual(CIRCUIT_BREAKER_STATUS_COLORS.CLOSED);
      expect(getCircuitBreakerStatusColor('')).toEqual(CIRCUIT_BREAKER_STATUS_COLORS.CLOSED);
      expect(getCircuitBreakerStatusColor('invalid')).toEqual(CIRCUIT_BREAKER_STATUS_COLORS.CLOSED);
    });
  });
});
