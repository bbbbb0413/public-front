import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { LlmMonitor } from './LlmMonitor';
import * as aiAdminApi from '../../api/aiAdmin';

vi.mock('../../api/aiAdmin', () => ({
  getLlmCosts: vi.fn(),
  getCircuitBreakers: vi.fn(),
}));

describe('LlmMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Circuit Breaker 상태가 open (소문자) 일 때 OPEN 대문자 텍스트와 위험 색상 배지를 렌더링한다', async () => {
    vi.mocked(aiAdminApi.getLlmCosts).mockResolvedValueOnce([]);
    vi.mocked(aiAdminApi.getCircuitBreakers).mockResolvedValueOnce([
      { model: 'gpt-4o', status: 'open', failureCount: 5, openedAt: '2026-09-17T12:00:00Z' },
    ]);

    render(<LlmMonitor />);

    await waitFor(() => {
      const badge = screen.getByText('OPEN');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveStyle({
        backgroundColor: '#450a0a',
        color: '#fca5a5',
      });
    });
  });

  it('Circuit Breaker 상태가 half-open (케밥케이스) 일 때 HALF_OPEN 대문자 텍스트와 경고 색상 배지를 렌더링한다', async () => {
    vi.mocked(aiAdminApi.getLlmCosts).mockResolvedValueOnce([]);
    vi.mocked(aiAdminApi.getCircuitBreakers).mockResolvedValueOnce([
      { model: 'claude-3-5-sonnet', status: 'half-open', failureCount: 2, openedAt: '2026-09-17T12:00:00Z' },
    ]);

    render(<LlmMonitor />);

    await waitFor(() => {
      const badge = screen.getByText('HALF_OPEN');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveStyle({
        backgroundColor: '#431407',
        color: '#fed7aa',
      });
    });
  });

  it('Circuit Breaker 상태가 closed (소문자) 일 때 CLOSED 대문자 텍스트와 정상 색상 배지를 렌더링한다', async () => {
    vi.mocked(aiAdminApi.getLlmCosts).mockResolvedValueOnce([]);
    vi.mocked(aiAdminApi.getCircuitBreakers).mockResolvedValueOnce([
      { model: 'gemini-1.5-pro', status: 'closed', failureCount: 0, openedAt: null },
    ]);

    render(<LlmMonitor />);

    await waitFor(() => {
      const badge = screen.getByText('CLOSED');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveStyle({
        backgroundColor: '#052e16',
        color: '#86efac',
      });
    });
  });

  it('예상치 못한 상태값이 오더라도 런타임 에러 없이 기본 CLOSED 스타일로 렌더링한다', async () => {
    vi.mocked(aiAdminApi.getLlmCosts).mockResolvedValueOnce([]);
    vi.mocked(aiAdminApi.getCircuitBreakers).mockResolvedValueOnce([
      { model: 'custom-model', status: '' as any, failureCount: 0, openedAt: null },
    ]);

    render(<LlmMonitor />);

    await waitFor(() => {
      const badge = screen.getByText('CLOSED');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveStyle({
        backgroundColor: '#052e16',
        color: '#86efac',
      });
    });
  });
});
