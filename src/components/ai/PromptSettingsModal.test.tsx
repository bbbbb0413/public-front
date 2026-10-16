import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { PromptSettingsModal } from './PromptSettingsModal';
import * as aiApi from '../../api/ai';

vi.mock('../../api/ai', () => ({
  getMyPrompt: vi.fn(),
  getMyPromptList: vi.fn(),
  saveMyPrompt: vi.fn(),
  activateMyPrompt: vi.fn(),
  deleteMyPromptVersion: vi.fn(),
  resetMyPrompt: vi.fn(),
}));

describe('PromptSettingsModal Component', () => {
  const defaultPrompt: aiApi.MyPromptOut = {
    id: 'default-prompt',
    name: 'rag-qa-system',
    version: 1,
    content: '기본 시스템 프롬프트 내용입니다.',
    isActive: true,
    userId: null,
    createdAt: '2026-09-01T00:00:00Z',
  };

  const customPrompt1: aiApi.MyPromptOut = {
    id: 'custom-p1',
    name: 'rag-qa-system',
    version: 1,
    content: '커스텀 프롬프트 v1',
    isActive: false,
    userId: 'user-123',
    createdAt: '2026-09-01T00:00:00Z',
  };

  const customPrompt2: aiApi.MyPromptOut = {
    id: 'custom-p2',
    name: 'rag-qa-system',
    version: 2,
    content: '커스텀 프롬프트 v2 활성',
    isActive: true,
    userId: 'user-123',
    createdAt: '2026-09-02T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('isOpen이 false일 때는 모달이 렌더링되지 않는다', () => {
    render(<PromptSettingsModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog', { name: /AI 답변 스타일 설정/i })).not.toBeInTheDocument();
  });

  it('isOpen이 true가 되면 프롬프트를 조회하고 활성 프롬프트 및 슬롯 목록을 렌더링한다', async () => {
    vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(customPrompt2);
    vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([customPrompt1, customPrompt2]);

    await act(async () => {
      render(<PromptSettingsModal isOpen={true} onClose={vi.fn()} />);
    });

    expect(aiApi.getMyPrompt).toHaveBeenCalled();
    expect(aiApi.getMyPromptList).toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'AI 답변 스타일 설정' })).toBeInTheDocument();
    expect(screen.getByText('내 커스텀 설정 사용 중')).toBeInTheDocument();
    expect(screen.getByText('저장된 프롬프트 목록 (2 / 10)')).toBeInTheDocument();
    expect(screen.getByText('슬롯 1 (v1)')).toBeInTheDocument();
    expect(screen.getByText('슬롯 2 (v2)')).toBeInTheDocument();
    expect(screen.getByDisplayValue('커스텀 프롬프트 v2 활성')).toBeInTheDocument();
  });

  it('닫기 버튼 클릭 또는 오버레이 배경 클릭 시 onClose 콜백이 호출된다', async () => {
    const onClose = vi.fn();
    vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(defaultPrompt);
    vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([]);

    await act(async () => {
      render(<PromptSettingsModal isOpen={true} onClose={onClose} />);
    });

    const closeBtn = screen.getByRole('button', { name: '닫기' });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    const overlay = screen.getByRole('presentation');
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('프롬프트 내용이 비어있으면 저장되지 않고 에러 메시지가 노출된다', async () => {
    vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(defaultPrompt);
    vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([]);

    await act(async () => {
      render(<PromptSettingsModal isOpen={true} onClose={vi.fn()} />);
    });

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '   ' } });

    const saveBtn = screen.getByRole('button', { name: '새 슬롯으로 저장 및 적용' });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(screen.getByText('프롬프트 내용을 입력하세요.')).toBeInTheDocument();
    expect(aiApi.saveMyPrompt).not.toHaveBeenCalled();
  });

  it('새 프롬프트 저장 시 saveMyPrompt가 호출되고 갱신 및 onPromptUpdated가 호출된다', async () => {
    const onPromptUpdated = vi.fn();
    vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(defaultPrompt);
    vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([]);

    const savedPrompt: aiApi.MyPromptOut = {
      id: 'saved-1',
      name: 'rag-qa-system',
      version: 1,
      content: '새로운 시스템 프롬프트',
      isActive: true,
      userId: 'user-123',
      createdAt: '2026-09-22T00:00:00Z',
    };

    vi.mocked(aiApi.saveMyPrompt).mockResolvedValueOnce(savedPrompt);
    vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(savedPrompt);
    vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([savedPrompt]);

    await act(async () => {
      render(<PromptSettingsModal isOpen={true} onClose={vi.fn()} onPromptUpdated={onPromptUpdated} />);
    });

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '새로운 시스템 프롬프트' } });

    const saveBtn = screen.getByRole('button', { name: '새 슬롯으로 저장 및 적용' });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(aiApi.saveMyPrompt).toHaveBeenCalledWith('새로운 시스템 프롬프트', true);
    expect(screen.getByText('새 프롬프트 슬롯이 저장되고 활성화되었습니다.')).toBeInTheDocument();
    expect(onPromptUpdated).toHaveBeenCalled();
  });

  it('슬롯 제한(10개)에 도달하면 저장 버튼이 비활성화되고 제한 안내가 표시된다', async () => {
    const tenSlots = Array.from({ length: 10 }, (_, i) => ({
      id: `slot-${i + 1}`,
      name: 'rag-qa-system',
      version: i + 1,
      content: `프롬프트 ${i + 1}`,
      isActive: i === 9,
      userId: 'user-123',
      createdAt: '2026-09-01T00:00:00Z',
    }));

    vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(tenSlots[9]);
    vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce(tenSlots);

    await act(async () => {
      render(<PromptSettingsModal isOpen={true} onClose={vi.fn()} />);
    });

    expect(screen.getByText('저장된 프롬프트 목록 (10 / 10)')).toBeInTheDocument();
    expect(screen.getByText(/개인 프롬프트는 최대 10개까지 저장할 수 있습니다/)).toBeInTheDocument();
    const saveBtn = screen.getByRole('button', { name: '새 슬롯으로 저장 및 적용' });
    expect(saveBtn).toBeDisabled();
  });

  it('비활성 슬롯 활성화 버튼 클릭 시 activateMyPrompt가 호출되고 상태가 갱신된다', async () => {
    const onPromptUpdated = vi.fn();
    vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(customPrompt2);
    vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([customPrompt1, customPrompt2]);

    const activatedV1: aiApi.MyPromptOut = { ...customPrompt1, isActive: true };
    vi.mocked(aiApi.activateMyPrompt).mockResolvedValueOnce(activatedV1);
    vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(activatedV1);
    vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([activatedV1, { ...customPrompt2, isActive: false }]);

    await act(async () => {
      render(<PromptSettingsModal isOpen={true} onClose={vi.fn()} onPromptUpdated={onPromptUpdated} />);
    });

    const activateBtn = screen.getByRole('button', { name: 'v1 활성화' });
    await act(async () => {
      fireEvent.click(activateBtn);
    });

    expect(aiApi.activateMyPrompt).toHaveBeenCalledWith(1);
    expect(screen.getByText('프롬프트가 활성화되었습니다.')).toBeInTheDocument();
    expect(onPromptUpdated).toHaveBeenCalled();
  });

  it('슬롯 삭제 버튼 클릭 시 deleteMyPromptVersion이 호출된다', async () => {
    const onPromptUpdated = vi.fn();
    vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(customPrompt2);
    vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([customPrompt1, customPrompt2]);

    vi.mocked(aiApi.deleteMyPromptVersion).mockResolvedValueOnce(undefined);
    vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(customPrompt2);
    vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([customPrompt2]);

    await act(async () => {
      render(<PromptSettingsModal isOpen={true} onClose={vi.fn()} onPromptUpdated={onPromptUpdated} />);
    });

    const deleteBtn = screen.getByRole('button', { name: 'v1 삭제' });
    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    expect(aiApi.deleteMyPromptVersion).toHaveBeenCalledWith(1);
    expect(screen.getByText('프롬프트 슬롯이 삭제되었습니다.')).toBeInTheDocument();
    expect(onPromptUpdated).toHaveBeenCalled();
  });

  it('커스텀 설정 사용 중일 때 초기화 버튼 클릭 시 resetMyPrompt가 호출된다', async () => {
    const onPromptUpdated = vi.fn();
    vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(customPrompt1);
    vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([customPrompt1]);

    vi.mocked(aiApi.resetMyPrompt).mockResolvedValueOnce(undefined);
    vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(defaultPrompt);
    vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([]);

    await act(async () => {
      render(<PromptSettingsModal isOpen={true} onClose={vi.fn()} onPromptUpdated={onPromptUpdated} />);
    });

    const resetBtn = screen.getByRole('button', { name: '기본값으로 초기화' });
    await act(async () => {
      fireEvent.click(resetBtn);
    });

    expect(aiApi.resetMyPrompt).toHaveBeenCalled();
    expect(screen.getByText('기본 프롬프트로 초기화되었습니다.')).toBeInTheDocument();
    expect(onPromptUpdated).toHaveBeenCalled();
  });

  it('조회 실패 시 에러 메시지가 표시된다', async () => {
    vi.mocked(aiApi.getMyPrompt).mockRejectedValueOnce(new Error('Network error'));
    vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([]);

    await act(async () => {
      render(<PromptSettingsModal isOpen={true} onClose={vi.fn()} />);
    });

    expect(screen.getByText('프롬프트를 불러오는 데 실패했습니다.')).toBeInTheDocument();
  });
});
