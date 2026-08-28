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

  it('저장에 성공하면 닫힌다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AnswerFeedback onSubmit={onSubmit} />);
    open();
    pick('정확도', 4);
    pick('유용성', 4);

    fireEvent.click(screen.getByText('평가 제출'));

    await waitFor(() =>
      expect(screen.getByText('이 답변을 평가하기')).toBeInTheDocument(),
    );
  });
});
