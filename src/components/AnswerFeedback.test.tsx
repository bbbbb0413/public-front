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

  describe('불만족 사유 칩 (SPEC-095)', () => {
    it('정확도 1점 또는 2점 선택 시 "어떤 점이 아쉬웠나요?" 안내와 5개 불만족 사유 칩이 노출된다', () => {
      render(<AnswerFeedback onSubmit={vi.fn()} />);
      open();

      expect(screen.queryByText('어떤 점이 아쉬웠나요?')).not.toBeInTheDocument();

      pick('정확도', 1);
      expect(screen.getByText('어떤 점이 아쉬웠나요?')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '환각/사실 오류' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '근거 문서와 다름' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '질문 의도와 무관' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '내용 불완전/부족' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '최신 정보 아님' })).toBeInTheDocument();
    });

    it('사유 칩 클릭 시 의견 입력 필드에 대괄호 태그 접두사가 자동 채워지고 칩이 선택된다', () => {
      render(<AnswerFeedback onSubmit={vi.fn()} />);
      open();
      pick('정확도', 2);

      const hallucinationChip = screen.getByRole('button', { name: '환각/사실 오류' });
      const docDiffChip = screen.getByRole('button', { name: '근거 문서와 다름' });

      fireEvent.click(hallucinationChip);
      expect(hallucinationChip).toHaveClass('selected');
      expect(screen.getByRole('textbox')).toHaveValue('[환각/사실 오류]');

      fireEvent.click(docDiffChip);
      expect(docDiffChip).toHaveClass('selected');
      expect(screen.getByRole('textbox')).toHaveValue('[환각/사실 오류] [근거 문서와 다름]');
    });

    it('선택된 사유 칩을 다시 클릭하면 선택이 해제되고 코멘트에서 태그가 제거된다', () => {
      render(<AnswerFeedback onSubmit={vi.fn()} />);
      open();
      pick('정확도', 1);

      const hallucinationChip = screen.getByRole('button', { name: '환각/사실 오류' });
      const docDiffChip = screen.getByRole('button', { name: '근거 문서와 다름' });

      fireEvent.click(hallucinationChip);
      fireEvent.click(docDiffChip);
      fireEvent.click(hallucinationChip);

      expect(hallucinationChip).not.toHaveClass('selected');
      expect(docDiffChip).toHaveClass('selected');
      expect(screen.getByRole('textbox')).toHaveValue('[근거 문서와 다름]');
    });

    it('사유 태그 선택 후 추가 의견을 적은 상태에서 정확도를 4점으로 변경하면 사유 칩 영역이 사라지고 사유 태그 입력이 초기화된다', () => {
      render(<AnswerFeedback onSubmit={vi.fn()} />);
      open();
      pick('정확도', 1);

      fireEvent.click(screen.getByRole('button', { name: '환각/사실 오류' }));
      fireEvent.change(screen.getByRole('textbox'), {
        target: { value: '[환각/사실 오류] 추가 상세 내용입니다.' },
      });

      pick('정확도', 4);
      expect(screen.queryByText('어떤 점이 아쉬웠나요?')).not.toBeInTheDocument();
      expect(screen.getByRole('textbox')).toHaveValue('추가 상세 내용입니다.');
    });

    it('기존 평가에 사유 태그가 포함된 경우 수정 폼을 열었을 때 해당 사유 칩이 선택 상태로 복원된다', () => {
      const existingWithReasons: AnswerFeedbackOut = {
        ...existing,
        accuracy: 2,
        comment: '[환각/사실 오류] 문서 3페이지 내용과 다릅니다.',
      };
      render(<AnswerFeedback existing={existingWithReasons} onSubmit={vi.fn()} />);
      open();

      expect(screen.getByText('어떤 점이 아쉬웠나요?')).toBeInTheDocument();
      const hallucinationChip = screen.getByRole('button', { name: '환각/사실 오류' });
      expect(hallucinationChip).toHaveClass('selected');
      expect(screen.getByRole('textbox')).toHaveValue(
        '[환각/사실 오류] 문서 3페이지 내용과 다릅니다.',
      );
    });

    it('QA 1: 정확도 2점 선택 시에도 5개 사유 칩이 노출되고, 2점에서 1점으로 변경 시 선택된 사유 칩이 유지된다', () => {
      render(<AnswerFeedback onSubmit={vi.fn()} />);
      open();

      pick('정확도', 2);
      expect(screen.getByText('어떤 점이 아쉬웠나요?')).toBeInTheDocument();
      const reasonChips = [
        '환각/사실 오류',
        '근거 문서와 다름',
        '질문 의도와 무관',
        '내용 불완전/부족',
        '최신 정보 아님',
      ];
      for (const reason of reasonChips) {
        expect(screen.getByRole('button', { name: reason })).toBeInTheDocument();
      }

      fireEvent.click(screen.getByRole('button', { name: '질문 의도와 무관' }));
      expect(screen.getByRole('button', { name: '질문 의도와 무관' })).toHaveClass('selected');

      // 2점에서 1점으로 변경해도 사유 칩 영역과 선택 상태 유지
      pick('정확도', 1);
      expect(screen.getByText('어떤 점이 아쉬웠나요?')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '질문 의도와 무관' })).toHaveClass('selected');
      expect(screen.getByRole('textbox')).toHaveValue('[질문 의도와 무관]');
    });

    it('QA 2: 본문 의견을 직접 작성한 후 사유 칩을 추가하거나 해제해도 본문 내용이 유지된다', () => {
      render(<AnswerFeedback onSubmit={vi.fn()} />);
      open();
      pick('정확도', 1);

      fireEvent.click(screen.getByRole('button', { name: '환각/사실 오류' }));
      fireEvent.change(screen.getByRole('textbox'), {
        target: { value: '[환각/사실 오류] 사용자가 직접 작성한 상세 코멘트' },
      });

      // 다른 칩 추가
      fireEvent.click(screen.getByRole('button', { name: '최신 정보 아님' }));
      expect(screen.getByRole('textbox')).toHaveValue(
        '[환각/사실 오류] [최신 정보 아님] 사용자가 직접 작성한 상세 코멘트',
      );

      // 환각/사실 오류 해제
      fireEvent.click(screen.getByRole('button', { name: '환각/사실 오류' }));
      expect(screen.getByRole('textbox')).toHaveValue(
        '[최신 정보 아님] 사용자가 직접 작성한 상세 코멘트',
      );
    });

    it('QA 3: 정확도를 3점(보통)으로 변경 시 사유 칩 영역이 숨겨지고 사유 태그 접두사가 제거된다', () => {
      render(<AnswerFeedback onSubmit={vi.fn()} />);
      open();
      pick('정확도', 2);

      fireEvent.click(screen.getByRole('button', { name: '내용 불완전/부족' }));
      fireEvent.change(screen.getByRole('textbox'), {
        target: { value: '[내용 불완전/부족] 더 많은 예시가 필요합니다.' },
      });

      pick('정확도', 3);
      expect(screen.queryByText('어떤 점이 아쉬웠나요?')).not.toBeInTheDocument();
      expect(screen.getByRole('textbox')).toHaveValue('더 많은 예시가 필요합니다.');
    });

    it('QA 4: 복수의 사유 태그가 포함된 기존 평가를 수정할 때 모든 해당 사유 칩이 선택 상태로 복원된다', () => {
      const existingWithMultipleReasons: AnswerFeedbackOut = {
        ...existing,
        accuracy: 1,
        comment: '[환각/사실 오류] [최신 정보 아님] 사실과 다르고 구버전 정보입니다.',
      };
      render(<AnswerFeedback existing={existingWithMultipleReasons} onSubmit={vi.fn()} />);
      open();

      expect(screen.getByText('어떤 점이 아쉬웠나요?')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '환각/사실 오류' })).toHaveClass('selected');
      expect(screen.getByRole('button', { name: '최신 정보 아님' })).toHaveClass('selected');
      expect(screen.getByRole('button', { name: '근거 문서와 다름' })).not.toHaveClass('selected');
      expect(screen.getByRole('textbox')).toHaveValue(
        '[환각/사실 오류] [최신 정보 아님] 사실과 다르고 구버전 정보입니다.',
      );
    });
  });

  describe('SPEC-100: forceOpen 제어 prop', () => {
    it('forceOpen이 true로 전달되면 컴포넌트 내부가 즉시 펼쳐진 상태로 렌더링되고 폼이 초기화된다', () => {
      render(<AnswerFeedback onSubmit={vi.fn()} forceOpen={true} />);

      expect(screen.getByTestId('answer-feedback')).not.toHaveClass('collapsed');
      expect(screen.getByText('정확도')).toBeInTheDocument();
      expect(screen.getByText('유용성')).toBeInTheDocument();
    });

    it('접혀 있던 컴포넌트에 forceOpen이 true로 변경되면 펼쳐지고 포커스가 이동한다', () => {
      const { rerender } = render(<AnswerFeedback onSubmit={vi.fn()} forceOpen={false} />);

      expect(screen.getByText('이 답변을 평가하기')).toBeInTheDocument();

      rerender(<AnswerFeedback onSubmit={vi.fn()} forceOpen={true} />);

      expect(screen.getByText('정확도')).toBeInTheDocument();
      expect(screen.getByTestId('answer-feedback')).toHaveFocus();
    });
  });
});


