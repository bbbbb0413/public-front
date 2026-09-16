import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PromptManagement } from './PromptManagement';
import * as aiAdminApi from '../../api/aiAdmin';

vi.mock('../../api/aiAdmin', () => ({
  createPrompt: vi.fn(),
  getPromptVersions: vi.fn(),
  getActivePrompt: vi.fn(),
  activatePromptVersion: vi.fn(),
}));

describe('PromptManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('새 프롬프트 생성이 성공하면 성공 메시지를 표시하고 입력창을 초기화한다', async () => {
    vi.mocked(aiAdminApi.createPrompt).mockResolvedValueOnce({
      id: 'p-1',
      name: 'rag-qa-system',
      version: 1,
      content: '새 프롬프트 내용',
      isActive: true,
      createdAt: '2026-09-17T00:00:00Z',
    });

    render(<PromptManagement />);

    const textarea = screen.getByPlaceholderText(/프롬프트 내용/);
    fireEvent.change(textarea, { target: { value: '새 프롬프트 내용' } });

    const createBtn = screen.getByText('새 버전으로 저장');
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(aiAdminApi.createPrompt).toHaveBeenCalledWith('rag-qa-system', '새 프롬프트 내용');
      expect(screen.getByText('프롬프트 "rag-qa-system" 생성 완료')).toBeInTheDocument();
      expect(textarea).toHaveValue('');
    });
  });

  it('프롬프트 생성 실패 시 에러 메시지를 표시한다', async () => {
    vi.mocked(aiAdminApi.createPrompt).mockRejectedValueOnce(new Error('403 Forbidden'));

    render(<PromptManagement />);

    const textarea = screen.getByPlaceholderText(/프롬프트 내용/);
    fireEvent.change(textarea, { target: { value: '새 프롬프트 내용' } });

    const createBtn = screen.getByText('새 버전으로 저장');
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(screen.getByText('프롬프트 생성에 실패했습니다.')).toBeInTheDocument();
    });
  });

  it('버전 활성화 성공 시 성공 메시지를 표시한다', async () => {
    const mockVersions = [
      {
        id: 'p-1',
        name: 'rag-qa-system',
        version: 1,
        content: '내용1',
        isActive: false,
        createdAt: '2026-09-17T00:00:00Z',
      },
    ];
    vi.mocked(aiAdminApi.getPromptVersions).mockResolvedValueOnce(mockVersions);
    vi.mocked(aiAdminApi.getActivePrompt).mockResolvedValueOnce({
      id: 'p-2',
      name: 'rag-qa-system',
      version: 2,
      content: '내용2',
      isActive: true,
      createdAt: '2026-09-17T00:00:00Z',
    });
    vi.mocked(aiAdminApi.activatePromptVersion).mockResolvedValueOnce({
      id: 'p-1',
      name: 'rag-qa-system',
      version: 1,
      content: '내용1',
      isActive: true,
      createdAt: '2026-09-17T00:00:00Z',
    });

    render(<PromptManagement />);

    const searchInput = screen.getByPlaceholderText(/프롬프트 이름/);
    fireEvent.change(searchInput, { target: { value: 'rag-qa-system' } });
    fireEvent.click(screen.getByText('조회'));

    await waitFor(() => {
      expect(screen.getByText('활성화')).toBeInTheDocument();
    });

    // 조회 mock 추가 (활성화 후 re-search)
    vi.mocked(aiAdminApi.getPromptVersions).mockResolvedValueOnce([
      { ...mockVersions[0], isActive: true },
    ]);
    vi.mocked(aiAdminApi.getActivePrompt).mockResolvedValueOnce({
      ...mockVersions[0],
      isActive: true,
    });

    fireEvent.click(screen.getByText('활성화'));

    await waitFor(() => {
      expect(aiAdminApi.activatePromptVersion).toHaveBeenCalledWith('rag-qa-system', 1);
      expect(screen.getByText('v1 활성화 완료')).toBeInTheDocument();
    });
  });
});
