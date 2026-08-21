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
