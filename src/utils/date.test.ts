import { describe, it, expect } from 'vitest';
import { formatDate } from './date';

describe('formatDate', () => {
  it('유효한 Date 객체를 YYYY-MM-DD 형식의 문자열로 반환해야 한다 (예: 2026-08-19T10:30:00Z -> 2026-08-19)', () => {
    const date = new Date('2026-08-19T10:30:00Z');
    expect(formatDate(date)).toBe('2026-08-19');
  });

  it('유효한 ISO 8601 날짜 문자열을 YYYY-MM-DD 형식으로 반환해야 한다 (예: "2026-01-05" -> "2026-01-05")', () => {
    expect(formatDate('2026-01-05')).toBe('2026-01-05');
  });

  it('월과 일은 항상 두 자리로 채워져야 한다 (예: "2026-01-05")', () => {
    expect(formatDate(new Date('2026-01-05T00:00:00Z'))).toBe('2026-01-05');
  });

  it('유효하지 않은 Date 객체(Invalid Date)를 입력받으면 빈 문자열을 반환해야 한다', () => {
    const invalidDate = new Date('아무거나');
    expect(formatDate(invalidDate)).toBe('');
  });

  it('null을 입력받으면 예외를 던지지 않고 빈 문자열을 반환해야 한다', () => {
    expect(formatDate(null)).toBe('');
  });

  it('빈 문자열 ""을 입력받으면 빈 문자열을 반환해야 한다', () => {
    expect(formatDate('')).toBe('');
  });

  it('undefined를 입력받으면 빈 문자열을 반환해야 한다', () => {
    expect(formatDate(undefined)).toBe('');
  });
});
