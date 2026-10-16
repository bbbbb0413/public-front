import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { AnswerFeedback } from './AnswerFeedback';
import type { AnswerFeedbackOut } from '../api/ai';

const existing: AnswerFeedbackOut = {
  sessionId: 's-1',
  turnIndex: 1,
  accuracy: 4,
  helpfulness: 5,
  comment: '근거가 좋았다',
  createdAt: '2026-08-28T00:00:00Z',
  updatedAt: '2026-08-28T00:00:00Z',
};

const open = () => fireEvent.click(screen.getByRole('button', { name: /평가/ }));

const pick = (legend: string, rating: number) =>
  fireEvent.click(screen.getByLabelText(new RegExp(`^${legend} ${rating}점`)));

describe('AnswerFeedback', () => {
  it('평가 전에는 평가하기 버튼만 보인다', () => {
    render(<AnswerFeedback onSubmit={vi.fn()} />);

    expect(screen.getByText('이 답변을 평가하기')).toBeInTheDocument();
    expect(screen.queryByText('정확도')).not.toBeInTheDocument();
  });

  it('정확도와 유용성을 모두 고르기 전에는 제출할 수 없다', () => {
    render(<AnswerFeedback onSubmit={vi.fn()} />);
    open();

    expect(screen.getByText('평가 제출')).toBeDisabled();

    pick('정확도', 5);
    expect(screen.getByText('평가 제출')).toBeDisabled();

    pick('유용성', 3);
    expect(screen.getByText('평가 제출')).toBeEnabled();
  });

  it('제출하면 고른 값과 의견을 함께 넘긴다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AnswerFeedback onSubmit={onSubmit} />);
    open();

    pick('정확도', 5);
    pick('유용성', 4);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  정확했다  ' } });
    fireEvent.click(screen.getByText('평가 제출'));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        accuracy: 5,
        helpfulness: 4,
        comment: '정확했다',
      }),
    );
  });

  it('의견이 비어 있으면 보내지 않는다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AnswerFeedback onSubmit={onSubmit} />);
    open();
    pick('정확도', 3);
    pick('유용성', 3);

    fireEvent.click(screen.getByText('평가 제출'));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        accuracy: 3,
        helpfulness: 3,
        comment: undefined,
      }),
    );
  });

  it('이미 평가한 답변에는 내 최신 평가를 요약해 보여준다', () => {
    render(<AnswerFeedback existing={existing} onSubmit={vi.fn()} />);

    expect(screen.getByTestId('feedback-summary')).toHaveTextContent(
      '정확도 4/5 · 유용성 5/5',
    );
  });

  it('수정을 누르면 기존 평가가 채워진 채로 열린다', () => {
    render(<AnswerFeedback existing={existing} onSubmit={vi.fn()} />);

    open();

    expect(screen.getByLabelText(/^정확도 4점/)).toBeChecked();
    expect(screen.getByLabelText(/^유용성 5점/)).toBeChecked();
    expect(screen.getByRole('textbox')).toHaveValue('근거가 좋았다');
    expect(screen.getByText('평가 수정')).toBeInTheDocument();
  });

  it('저장에 실패하면 재시도를 안내하고 입력값을 지우지 않는다', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('network'));
    render(<AnswerFeedback onSubmit={onSubmit} />);
    open();
    pick('정확도', 2);
    pick('유용성', 2);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '아쉽다' } });

    fireEvent.click(screen.getByText('평가 제출'));

    await waitFor(() =>
      expect(screen.getByTestId('feedback-error')).toHaveTextContent(
        '다시 시도해 주세요',
      ),
    );
    expect(screen.getByRole('textbox')).toHaveValue('아쉽다');
    expect(screen.getByLabelText(/^정확도 2점/)).toBeChecked();
  });

  it('저장에 성공하면 닫히고 onSuccess 콜백이 호출된다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    render(<AnswerFeedback onSubmit={onSubmit} onSuccess={onSuccess} />);
    open();
    pick('정확도', 4);
    pick('유용성', 4);

    fireEvent.click(screen.getByText('평가 제출'));

    await waitFor(() =>
      expect(screen.getByText('이 답변을 평가하기')).toBeInTheDocument(),
    );
    expect(onSuccess).toHaveBeenCalledWith(false);
  });

  it('기존 평가 수정 시 onSuccess 콜백에 true가 전달된다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    render(<AnswerFeedback existing={existing} onSubmit={onSubmit} onSuccess={onSuccess} />);
    open();
    fireEvent.click(screen.getByText('평가 수정'));

    await waitFor(() =>
      expect(screen.getByTestId('feedback-summary')).toBeInTheDocument(),
    );
    expect(onSuccess).toHaveBeenCalledWith(true);
  });

  it('정확도 4~5점일 때 feedback-positive 클래스가 적용된다', () => {
    const { rerender } = render(
      <AnswerFeedback existing={{ ...existing, accuracy: 5 }} onSubmit={vi.fn()} />,
    );
    expect(screen.getByTestId('feedback-summary')).toHaveClass('feedback-positive');

    rerender(<AnswerFeedback existing={{ ...existing, accuracy: 4 }} onSubmit={vi.fn()} />);
    expect(screen.getByTestId('feedback-summary')).toHaveClass('feedback-positive');
  });

  it('정확도 3점일 때 feedback-neutral 클래스가 적용된다', () => {
    render(
      <AnswerFeedback existing={{ ...existing, accuracy: 3 }} onSubmit={vi.fn()} />,
    );
    expect(screen.getByTestId('feedback-summary')).toHaveClass('feedback-neutral');
  });

  it('정확도 1~2점일 때 feedback-negative 클래스가 적용된다', () => {
    const { rerender } = render(
      <AnswerFeedback existing={{ ...existing, accuracy: 2 }} onSubmit={vi.fn()} />,
    );
    expect(screen.getByTestId('feedback-summary')).toHaveClass('feedback-negative');

    rerender(<AnswerFeedback existing={{ ...existing, accuracy: 1 }} onSubmit={vi.fn()} />);
    expect(screen.getByTestId('feedback-summary')).toHaveClass('feedback-negative');
  });

  it('글자 수 카운터가 기본값 및 입력값 길이에 맞게 실시간 렌더링된다', () => {
    render(<AnswerFeedback onSubmit={vi.fn()} />);
    open();

    expect(screen.getByText('0 / 1000자')).toBeInTheDocument();

    const sampleText = 'a'.repeat(120);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: sampleText } });

    expect(screen.getByText('120 / 1000자')).toBeInTheDocument();
  });

  it('초기 마운트 시 existing이 없다가 비동기로 주입된 후 수정을 누르면 기존 평가가 채워진 채로 열리고 버튼이 활성화된다', () => {
    const { rerender } = render(<AnswerFeedback onSubmit={vi.fn()} />);

    expect(screen.getByText('이 답변을 평가하기')).toBeInTheDocument();

    rerender(<AnswerFeedback existing={existing} onSubmit={vi.fn()} />);

    expect(screen.getByTestId('feedback-summary')).toHaveTextContent(
      '정확도 4/5 · 유용성 5/5',
    );

    fireEvent.click(screen.getByRole('button', { name: /수정/ }));

    expect(screen.getByLabelText(/^정확도 4점/)).toBeChecked();
    expect(screen.getByLabelText(/^유용성 5점/)).toBeChecked();
    expect(screen.getByRole('textbox')).toHaveValue('근거가 좋았다');
    expect(screen.getByText('평가 수정')).toBeEnabled();
  });

  it('수정 폼에서 값을 변경하다가 취소하고 다시 수정을 열면 기존 값으로 복원된다', () => {
    render(<AnswerFeedback existing={existing} onSubmit={vi.fn()} />);
    open();

    pick('정확도', 2);
    pick('유용성', 2);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '수정하려던 내용' },
    });

    fireEvent.click(screen.getByText('취소'));

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    open();

    expect(screen.getByLabelText(/^정확도 4점/)).toBeChecked();
    expect(screen.getByLabelText(/^유용성 5점/)).toBeChecked();
    expect(screen.getByRole('textbox')).toHaveValue('근거가 좋았다');
  });

  it('신규 답변에서 평가하기를 열었을 때 초기 상태가 빈 값이고 제출 버튼이 비활성화된다', () => {
    render(<AnswerFeedback onSubmit={vi.fn()} />);
    open();

    expect(screen.queryByRole('radio', { checked: true })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(screen.getByText('평가 제출')).toBeDisabled();
  });

  it('기존 평가가 없는 경우 평가 등록 폼에 평가 삭제 버튼이 노출되지 않는다 (SPEC-068)', () => {
    render(<AnswerFeedback onSubmit={vi.fn()} onDelete={vi.fn()} />);
    open();

    expect(screen.queryByRole('button', { name: '평가 삭제' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '평가 제출' })).toBeInTheDocument();
  });

  it('기존 평가가 있는 경우 수정 폼에 평가 삭제 버튼이 노출된다 (SPEC-068)', () => {
    render(<AnswerFeedback existing={existing} onSubmit={vi.fn()} onDelete={vi.fn()} />);
    open();

    expect(screen.getByRole('button', { name: '평가 삭제' })).toBeInTheDocument();
  });

  it('평가 삭제 클릭 시 onDelete를 호출하고 삭제 진행 중 버튼 비활성화 및 삭제 중…을 표시한다 (SPEC-068)', async () => {
    let resolveDelete: () => void = () => {};
    const onDelete = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );

    render(<AnswerFeedback existing={existing} onSubmit={vi.fn()} onDelete={onDelete} />);
    open();

    const deleteBtn = screen.getByRole('button', { name: '평가 삭제' });
    fireEvent.click(deleteBtn);

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '삭제 중…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();

    resolveDelete();
    await waitFor(() => {
      expect(screen.getByText('이 답변을 평가하기')).toBeInTheDocument();
    });
  });

  it('평가 삭제 성공 시 기본 접힘 상태(이 답변을 평가하기)로 복원된다 (SPEC-068)', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<AnswerFeedback existing={existing} onSubmit={vi.fn()} onDelete={onDelete} />);
    open();

    fireEvent.click(screen.getByRole('button', { name: '평가 삭제' }));

    await waitFor(() => {
      expect(screen.getByText('이 답변을 평가하기')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('feedback-summary')).not.toBeInTheDocument();
  });

  it('평가 삭제 실패 시 에러 메시지를 표시하고 입력값을 유지한다 (SPEC-068)', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('delete failed'));
    render(<AnswerFeedback existing={existing} onSubmit={vi.fn()} onDelete={onDelete} />);
    open();

    fireEvent.click(screen.getByRole('button', { name: '평가 삭제' }));

    await waitFor(() => {
      expect(screen.getByTestId('feedback-error')).toHaveTextContent(
        '평가를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      );
    });
    expect(screen.getByLabelText(/^정확도 4점/)).toBeChecked();
    expect(screen.getByLabelText(/^유용성 5점/)).toBeChecked();
    expect(screen.getByRole('textbox')).toHaveValue('근거가 좋았다');
    expect(screen.getByRole('button', { name: '평가 삭제' })).toBeEnabled();
  });
});

