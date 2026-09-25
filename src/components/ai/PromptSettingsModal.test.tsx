import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PromptSettingsModal } from './PromptSettingsModal';
import * as aiApi from '../../api/ai';

vi.mock('../../api/ai', () => ({
  getMyPrompt: vi.fn(),
  getMyPromptList: vi.fn(),
  saveMyPrompt: vi.fn(),
  activateMyPrompt: vi.fn(),
  resetMyPrompt: vi.fn(),
  deleteMyPromptVersion: vi.fn(),
}));

describe('PromptSettingsModal', () => {
  const defaultPrompt: aiApi.MyPromptOut = {
    id: 'p-1',
    name: 'rag-qa-system',
    version: 1,
    content: '기본 시스템 프롬프트 내용',
    isActive: true,
    userId: null,
    createdAt: '2026-09-01T00:00:00Z',
  };

  const customPrompt: aiApi.MyPromptOut = {
    id: 'p-2',
    name: 'rag-qa-system',
    version: 2,
    content: '커스텀 시스템 프롬프트 내용',
    isActive: true,
    userId: 'user-123',
    createdAt: '2026-09-02T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('isOpen이 false일 때는 모달이 렌더링되지 않는다', () => {
    render(<PromptSettingsModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('isOpen이 true일 때 모달이 렌더링되고 초기 프롬프트 데이터를 불러온다', async () => {
    vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(defaultPrompt);
    vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([defaultPrompt]);

    render(<PromptSettingsModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('불러오는 중...')).toBeInTheDocument();

    await waitFor(() => {
      expect(aiApi.getMyPrompt).toHaveBeenCalled();
      expect(aiApi.getMyPromptList).toHaveBeenCalled();
      expect(screen.getByText('기본값 사용 중')).toBeInTheDocument();
      expect(screen.getByText('저장된 프롬프트 목록 (1 / 10)')).toBeInTheDocument();
      expect(screen.getByDisplayValue('기본 시스템 프롬프트 내용')).toBeInTheDocument();
    });
  });

  it('프롬프트 내용이 비어있을 때 저장 버튼을 누르면 유효성 에러 메시지가 표시된다', async () => {
    vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(defaultPrompt);
    vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([defaultPrompt]);

    render(<PromptSettingsModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('기본 시스템 프롬프트 내용')).toBeInTheDocument();
    });

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '   ' } });

    const saveButton = screen.getByRole('button', { name: '새 슬롯으로 저장 및 적용' });
    fireEvent.click(saveButton);

    expect(screen.getByText('프롬프트 내용을 입력하세요.')).toBeInTheDocument();
    expect(aiApi.saveMyPrompt).not.toHaveBeenCalled();
  });

  it('새 프롬프트를 저장하면 성공 메시지가 표시되고 목록이 갱신된다', async () => {
    vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(defaultPrompt);
    vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([defaultPrompt]);

    const onPromptUpdated = vi.fn();
    render(<PromptSettingsModal isOpen={true} onClose={vi.fn()} onPromptUpdated={onPromptUpdated} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('기본 시스템 프롬프트 내용')).toBeInTheDocument();
    });

    const newPrompt: aiApi.MyPromptOut = {
      id: 'p-2',
      name: 'rag-qa-system',
      version: 2,
      content: '새로운 시스템 프롬프트',
      isActive: true,
      userId: 'user-123',
      createdAt: '2026-09-03T00:00:00Z',
    };

    vi.mocked(aiApi.saveMyPrompt).mockResolvedValueOnce(newPrompt);
    vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(newPrompt);
    vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([defaultPrompt, newPrompt]);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '새로운 시스템 프롬프트' } });

    const saveButton = screen.getByRole('button', { name: '새 슬롯으로 저장 및 적용' });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(aiApi.saveMyPrompt).toHaveBeenCalledWith('새로운 시스템 프롬프트', true);
      expect(screen.getByText('새 프롬프트 슬롯이 저장되고 활성화되었습니다.')).toBeInTheDocument();
      expect(screen.getByText('내 커스텀 설정 사용 중')).toBeInTheDocument();
      expect(onPromptUpdated).toHaveBeenCalled();
    });
  });

  it('슬롯 제한(10개)에 도달했을 때 경고 메시지가 표시되고 저장이 비활성화된다', async () => {
    const slots: aiApi.MyPromptOut[] = Array.from({ length: 10 }, (_, i) => ({
      id: `p-${i + 1}`,
      name: 'rag-qa-system',
      version: i + 1,
      content: `프롬프트 ${i + 1}`,
      isActive: i === 9,
      userId: 'user-123',
      createdAt: '2026-09-01T00:00:00Z',
    }));

    vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(slots[9]);
    vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce(slots);

    render(<PromptSettingsModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('개인 프롬프트는 최대 10개까지 저장할 수 있습니다. 기존 슬롯을 삭제한 후 새로운 프롬프트를 저장하세요.')).toBeInTheDocument();
    });

    const saveButton = screen.getByRole('button', { name: '새 슬롯으로 저장 및 적용' });
    expect(saveButton).toBeDisabled();
  });

  it('다른 버전을 활성화할 수 있다', async () => {
    const slot1: aiApi.MyPromptOut = { ...defaultPrompt, version: 1, isActive: false };
    const slot2: aiApi.MyPromptOut = { ...customPrompt, version: 2, isActive: true };

    vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(slot2);
    vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([slot1, slot2]);

    const onPromptUpdated = vi.fn();
    render(<PromptSettingsModal isOpen={true} onClose={vi.fn()} onPromptUpdated={onPromptUpdated} />);

    await waitFor(() => {
      expect(screen.getByText('v1 활성화')).toBeInTheDocument();
    });

    const updatedSlot1: aiApi.MyPromptOut = { ...slot1, isActive: true };
    const updatedSlot2: aiApi.MyPromptOut = { ...slot2, isActive: false };

    vi.mocked(aiApi.activateMyPrompt).mockResolvedValueOnce(updatedSlot1);
    vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(updatedSlot1);
    vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([updatedSlot1, updatedSlot2]);

    fireEvent.click(screen.getByText('v1 활성화'));

    await waitFor(() => {
      expect(aiApi.activateMyPrompt).toHaveBeenCalledWith(1);
      expect(screen.getByText('프롬프트가 활성화되었습니다.')).toBeInTheDocument();
      expect(onPromptUpdated).toHaveBeenCalled();
    });
  });

  it('슬롯을 삭제할 수 있다', async () => {
    const slot1: aiApi.MyPromptOut = { ...defaultPrompt, version: 1, isActive: true };
    const slot2: aiApi.MyPromptOut = { ...customPrompt, version: 2, isActive: false };

    vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(slot1);
    vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([slot1, slot2]);

    render(<PromptSettingsModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('v2 삭제')).toBeInTheDocument();
    });

    vi.mocked(aiApi.deleteMyPromptVersion).mockResolvedValueOnce();
    vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(slot1);
    vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([slot1]);

    fireEvent.click(screen.getByText('v2 삭제'));

    await waitFor(() => {
      expect(aiApi.deleteMyPromptVersion).toHaveBeenCalledWith(2);
      expect(screen.getByText('프롬프트 슬롯이 삭제되었습니다.')).toBeInTheDocument();
    });
  });

  it('커스텀 프롬프트일 때 기본값으로 초기화할 수 있다', async () => {
    vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(customPrompt);
    vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([customPrompt]);

    render(<PromptSettingsModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('기본값으로 초기화')).toBeInTheDocument();
    });

    vi.mocked(aiApi.resetMyPrompt).mockResolvedValueOnce();
    vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(defaultPrompt);
    vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([]);

    fireEvent.click(screen.getByText('기본값으로 초기화'));

    await waitFor(() => {
      expect(aiApi.resetMyPrompt).toHaveBeenCalled();
      expect(screen.getByText('기본 프롬프트로 초기화되었습니다.')).toBeInTheDocument();
      expect(screen.getByText('기본값 사용 중')).toBeInTheDocument();
    });
  });

  it('닫기 버튼 클릭 및 배경 오버레이 클릭 시 onClose가 호출된다', async () => {
    vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(defaultPrompt);
    vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([defaultPrompt]);

    const onClose = vi.fn();
    render(<PromptSettingsModal isOpen={true} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    const overlay = screen.getByRole('presentation');
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
