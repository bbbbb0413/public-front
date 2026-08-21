/**
 * 날짜를 YYYY-MM-DD 형식의 문자열로 포맷팅합니다.
 *
 * @param value 포맷팅할 날짜 (Date 객체 또는 ISO 8601 문자열)
 * @returns 포맷팅된 날짜 문자열 (유효하지 않은 경우 빈 문자열)
 */
export function formatDate(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const parsedDate = new Date(trimmed);
      if (isNaN(parsedDate.getTime())) {
        return '';
      }

      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);

      if (month < 1 || month > 12) {
        return '';
      }

      const maxDay = new Date(year, month, 0).getDate();
      if (day < 1 || day > maxDay) {
        return '';
      }

      return match[0];
    }

    const parsedDate = new Date(trimmed);
    if (isNaN(parsedDate.getTime())) {
      return '';
    }
    return formatLocalDate(parsedDate);
  }

  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      return '';
    }
    return formatLocalDate(value);
  }

  return '';
}

function formatLocalDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * 일시를 YYYY-MM-DD HH:mm:ss 형식의 문자열로 포맷팅합니다.
 *
 * @param value 포맷팅할 일시 (Date 객체 또는 ISO 8601 문자열)
 * @returns 포맷팅된 일시 문자열 (유효하지 않은 경우 빈 문자열)
 */
export function formatDateTime(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);
      const hour = parseInt(match[4], 10);
      const minute = parseInt(match[5], 10);
      const second = parseInt(match[6], 10);

      if (month < 1 || month > 12) {
        return '';
      }

      const maxDay = new Date(year, month, 0).getDate();
      if (day < 1 || day > maxDay) {
        return '';
      }

      if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
        return '';
      }

      const parsedDate = new Date(trimmed);
      if (isNaN(parsedDate.getTime())) {
        return '';
      }

      const yyyy = String(year).padStart(4, '0');
      const mm = String(month).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      const hh = String(hour).padStart(2, '0');
      const min = String(minute).padStart(2, '0');
      const ss = String(second).padStart(2, '0');
      return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
    }

    const parsedDate = new Date(trimmed);
    if (isNaN(parsedDate.getTime())) {
      return '';
    }
    return formatLocalDateTime(parsedDate);
  }

  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      return '';
    }
    return formatLocalDateTime(value);
  }

  return '';
}

function formatLocalDateTime(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}
