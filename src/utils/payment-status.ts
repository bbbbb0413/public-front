export const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED']);

export const statusClassName = (status: string): string => {
  if (status === 'COMPLETED') return 'status-success';
  if (status === 'FAILED') return 'status-failed';
  return 'status-pending';
};
