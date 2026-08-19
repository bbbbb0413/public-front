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

  describe('경계 케이스 및 추가 예외 검증', () => {
    it('존재하지 않는 날짜 문자열(예: 2026-02-30)을 입력받으면 빈 문자열을 반환해야 한다', () => {
      expect(formatDate('2026-02-30')).toBe('');
      expect(formatDate('2026-04-31')).toBe('');
    });

    it('월의 범위를 벗어난 문자열(예: 2026-13-01, 2026-00-10)을 입력받으면 빈 문자열을 반환해야 한다', () => {
      expect(formatDate('2026-13-01')).toBe('');
      expect(formatDate('2026-00-10')).toBe('');
    });

    it('일의 범위를 벗어난 문자열(예: 2026-05-00, 2026-05-32)을 입력받으면 빈 문자열을 반환해야 한다', () => {
      expect(formatDate('2026-05-00')).toBe('');
      expect(formatDate('2026-05-32')).toBe('');
    });

    it('다양한 ISO 8601 타임존 오프셋이 포함된 문자열을 입력받아도 날짜 왜곡 없이 YYYY-MM-DD 형식을 반환해야 한다', () => {
      expect(formatDate('2026-08-19T01:00:00Z')).toBe('2026-08-19');
      expect(formatDate('2026-08-19T23:00:00Z')).toBe('2026-08-19');
      expect(formatDate('2026-08-19T12:00:00+09:00')).toBe('2026-08-19');
      expect(formatDate('2026-08-19T12:00:00-05:00')).toBe('2026-08-19');
    });

    it('로컬 Date 객체를 입력받으면 로컬 시간대 기준으로 포맷팅해야 한다', () => {
      // 월은 0부터 시작하므로 7은 8월을 의미합니다.
      const localDate1 = new Date(2026, 7, 19);
      expect(formatDate(localDate1)).toBe('2026-08-19');

      const localDate2 = new Date(2026, 0, 5);
      expect(formatDate(localDate2)).toBe('2026-01-05');
    });

    it('날짜와 무관한 타입(number, boolean, object, array 등)을 입력받으면 빈 문자열을 반환해야 한다', () => {
      expect(formatDate(1234567890)).toBe('');
      expect(formatDate(true)).toBe('');
      expect(formatDate({})).toBe('');
      expect(formatDate([])).toBe('');
    });
  });
});

