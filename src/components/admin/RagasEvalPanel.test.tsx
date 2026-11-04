import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import RagasEvalPanel from './RagasEvalPanel';
import * as aiAdminApi from '../../api/aiAdmin';

vi.mock('../../api/aiAdmin', () => ({
  getRagasEvals: vi.fn(),
}));

describe('RagasEvalPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockEvalItem: aiAdminApi.RagasEval = {
    traceId: 'trace-123',
    question: '테스트 질문입니다.',
    answer: '테스트 생성된 답변입니다.',
    contexts: ['참조된 컨텍스트 조각 1', '참조된 컨텍스트 조각 2'],
    faithfulness: 0.95,
    answerRelevancy: 0.88,
    contextPrecision: 0.75,
    sampledAt: '2026-11-05T01:00:00Z',
  };

  it('평가 목록에서 [상세] 버튼을 클릭하면 질문, 답변, 평가 점수 3종, 참조 컨텍스트 스니펫이 포함된 모달이 열린다', async () => {
    vi.mocked(aiAdminApi.getRagasEvals).mockResolvedValueOnce([mockEvalItem]);

    render(<RagasEvalPanel />);

    await waitFor(() => {
      expect(screen.getByText('테스트 질문입니다.')).toBeInTheDocument();
    });

    const detailButton = screen.getByRole('button', { name: /상세/ });
    fireEvent.click(detailButton);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('평가 상세 내역')).toBeInTheDocument();
    expect(within(dialog).getByText('테스트 생성된 답변입니다.')).toBeInTheDocument();
    expect(within(dialog).getByText('참조된 컨텍스트 조각 1')).toBeInTheDocument();
    expect(within(dialog).getByText('참조된 컨텍스트 조각 2')).toBeInTheDocument();
    expect(within(dialog).getByText('컨텍스트 1')).toBeInTheDocument();
    expect(within(dialog).getByText('컨텍스트 2')).toBeInTheDocument();
    expect(within(dialog).getByText('95%')).toBeInTheDocument();
    expect(within(dialog).getByText('88%')).toBeInTheDocument();
    expect(within(dialog).getByText('75%')).toBeInTheDocument();
  });

  it('행(row)을 클릭해도 상세 모달이 열린다', async () => {
    vi.mocked(aiAdminApi.getRagasEvals).mockResolvedValueOnce([mockEvalItem]);

    render(<RagasEvalPanel />);

    const rowQuestion = await screen.findByText('테스트 질문입니다.');
    fireEvent.click(rowQuestion);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('평가 상세 내역')).toBeInTheDocument();
  });

  it('행(row)에 포커스 후 Enter 키를 눌러도 상세 모달이 열린다', async () => {
    vi.mocked(aiAdminApi.getRagasEvals).mockResolvedValueOnce([mockEvalItem]);

    render(<RagasEvalPanel />);

    const row = await screen.findByLabelText('테스트 질문입니다. 상세 보기');
    fireEvent.keyDown(row, { key: 'Enter' });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('평가 상세 내역')).toBeInTheDocument();
  });

  it('참조 컨텍스트가 빈 배열이거나 없는 경우 "참조된 지식베이스 컨텍스트가 없습니다." 안내 문구를 렌더링한다', async () => {
    const legacyEvalItem: aiAdminApi.RagasEval = {
      traceId: 'trace-legacy',
      question: '레거시 질문',
      answer: '레거시 답변',
      contexts: [],
      faithfulness: 0.5,
      answerRelevancy: 0.6,
      contextPrecision: 0.7,
      sampledAt: '2026-11-05T01:00:00Z',
    };
    vi.mocked(aiAdminApi.getRagasEvals).mockResolvedValueOnce([legacyEvalItem]);

    render(<RagasEvalPanel />);

    const detailButton = await screen.findByRole('button', { name: /상세/ });
    fireEvent.click(detailButton);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('참조된 지식베이스 컨텍스트가 없습니다.')).toBeInTheDocument();
  });

  it('상세 모달에서 [닫기] 버튼을 누르면 모달이 닫힌다', async () => {
    vi.mocked(aiAdminApi.getRagasEvals).mockResolvedValueOnce([mockEvalItem]);

    render(<RagasEvalPanel />);

    const detailButton = await screen.findByRole('button', { name: /상세/ });
    fireEvent.click(detailButton);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    const closeButtons = within(dialog).getAllByRole('button', { name: /닫기/ });
    fireEvent.click(closeButtons[0]);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('상세 모달에서 모달 배경(오버레이)을 누르면 모달이 닫힌다', async () => {
    vi.mocked(aiAdminApi.getRagasEvals).mockResolvedValueOnce([mockEvalItem]);

    render(<RagasEvalPanel />);

    const detailButton = await screen.findByRole('button', { name: /상세/ });
    fireEvent.click(detailButton);

    const overlay = screen.getByTestId('ragas-eval-modal-overlay');
    fireEvent.click(overlay);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Escape 키를 입력하면 상세 모달이 닫힌다', async () => {
    vi.mocked(aiAdminApi.getRagasEvals).mockResolvedValueOnce([mockEvalItem]);

    render(<RagasEvalPanel />);

    const detailButton = await screen.findByRole('button', { name: /상세/ });
    fireEvent.click(detailButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('로딩 중일 때 로딩 문구를 표시한다', async () => {
    vi.mocked(aiAdminApi.getRagasEvals).mockReturnValueOnce(new Promise(() => {}));

    render(<RagasEvalPanel />);

    expect(screen.getByText('로딩 중...')).toBeInTheDocument();
  });

  it('데이터 로드 실패 시 에러 메시지를 표시한다', async () => {
    vi.mocked(aiAdminApi.getRagasEvals).mockRejectedValueOnce(new Error('네트워크 오류'));

    render(<RagasEvalPanel />);

    await waitFor(() => {
      expect(screen.getByText('네트워크 오류')).toBeInTheDocument();
    });
  });

  it('평가 데이터가 없을 때 빈 상태 안내 문구를 표시한다', async () => {
    vi.mocked(aiAdminApi.getRagasEvals).mockResolvedValueOnce([]);

    render(<RagasEvalPanel />);

    await waitFor(() => {
      expect(screen.getByText('평가 데이터가 없습니다.')).toBeInTheDocument();
    });
  });
});
