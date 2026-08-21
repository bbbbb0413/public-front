import { describe, it, expect } from 'vitest';
import { formatDate, formatDateTime } from './date';

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

    it('월/일이 한 자리인 날짜 문자열이 들어오면 YYYY-MM-DD 형식으로 포맷팅해야 한다', () => {
      expect(formatDate('2026-8-19')).toBe('2026-08-19');
      expect(formatDate('2026-08-1')).toBe('2026-08-01');
    });

    it('ISO 8601 형식이 아니지만 날짜 파싱이 가능한 다른 형식의 문자열도 YYYY-MM-DD 형식으로 포맷팅해야 한다', () => {
      expect(formatDate('2026.08.19')).toBe('2026-08-19');
      expect(formatDate('08/19/2026')).toBe('2026-08-19');
    });
  });
});

describe('formatDateTime', () => {
  it('유효한 Date 객체를 YYYY-MM-DD HH:mm:ss 형식의 문자열로 반환해야 한다 (수용 기준: new Date(2026, 7, 19, 14, 30, 5))', () => {
    const date = new Date(2026, 7, 19, 14, 30, 5);
    expect(formatDateTime(date)).toBe('2026-08-19 14:30:05');
  });

  it('유효한 ISO 8601 문자열을 YYYY-MM-DD HH:mm:ss 형식으로 반환해야 한다 (수용 기준: "2026-08-19T14:30:05")', () => {
    expect(formatDateTime('2026-08-19T14:30:05')).toBe('2026-08-19 14:30:05');
  });

  it('연, 월, 일, 시, 분, 초는 항상 두 자리로 채워져야 한다 (예: "2026-01-05 09:05:00")', () => {
    const date = new Date(2026, 0, 5, 9, 5, 0);
    expect(formatDateTime(date)).toBe('2026-01-05 09:05:00');
  });

  it('유효하지 않은 Date 객체(Invalid Date)를 입력받으면 빈 문자열을 반환해야 한다', () => {
    const invalidDate = new Date('Invalid');
    expect(formatDateTime(invalidDate)).toBe('');
  });

  it('null을 입력받으면 예외를 던지지 않고 빈 문자열을 반환해야 한다', () => {
    expect(formatDateTime(null)).toBe('');
  });

  it('undefined를 입력받으면 예외를 던지지 않고 빈 문자열을 반환해야 한다', () => {
    expect(formatDateTime(undefined)).toBe('');
  });

  it('빈 문자열 ""을 입력받으면 빈 문자열을 반환해야 한다', () => {
    expect(formatDateTime('')).toBe('');
  });

  describe('경계 케이스 및 추가 예외 검증', () => {
    it('존재하지 않는 날짜나 시간 문자열(예: 2026-02-30T10:00:00, 2026-08-19T25:00:00)을 입력받으면 빈 문자열을 반환해야 한다', () => {
      expect(formatDateTime('2026-02-30T10:00:00')).toBe('');
      expect(formatDateTime('2026-08-19T25:00:00')).toBe('');
      expect(formatDateTime('2026-08-19T10:60:00')).toBe('');
      expect(formatDateTime('2026-08-19T10:00:60')).toBe('');
    });

    it('날짜와 무관한 타입(number, boolean, object, array 등)을 입력받으면 빈 문자열을 반환해야 한다', () => {
      expect(formatDateTime(1234567890)).toBe('');
      expect(formatDateTime(true)).toBe('');
      expect(formatDateTime({})).toBe('');
      expect(formatDateTime([])).toBe('');
    });

    it('공백으로 구분된 YYYY-MM-DD HH:mm:ss 형식 문자열도 올바르게 포맷팅해야 한다', () => {
      expect(formatDateTime('2026-08-19 14:30:05')).toBe('2026-08-19 14:30:05');
    });
  });
});


