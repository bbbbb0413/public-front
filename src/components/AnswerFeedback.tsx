import { useState } from 'react';
import type { AnswerFeedbackOut } from '../api/ai';

const RATINGS = [1, 2, 3, 4, 5] as const;
const MAX_COMMENT_LENGTH = 1000;

const ACCURACY_LABELS: Record<number, string> = {
  1: '전혀 정확하지 않다',
  2: '정확하지 않다',
  3: '보통',
  4: '정확하다',
  5: '매우 정확하다',
};

const HELPFULNESS_LABELS: Record<number, string> = {
  1: '전혀 도움되지 않았다',
  2: '도움되지 않았다',
  3: '보통',
  4: '도움이 됐다',
  5: '매우 도움이 됐다',
};

interface Props {
  /** 이미 남긴 평가. 없으면 처음 평가하는 답변이다. */
  existing?: AnswerFeedbackOut;
  onSubmit: (input: {
    accuracy: number;
    helpfulness: number;
    comment?: string;
  }) => Promise<void>;
}

interface ScaleProps {
  legend: string;
  name: string;
  labels: Record<number, string>;
  value: number | null;
  onChange: (value: number) => void;
}

const RatingScale = ({ legend, name, labels, value, onChange }: ScaleProps) => (
  <fieldset className="feedback-scale">
    <legend className="feedback-scale-legend">{legend}</legend>
    <div className="feedback-scale-options">
      {RATINGS.map((rating) => (
        <label
          key={rating}
          className={`feedback-option${value === rating ? ' selected' : ''}`}
          title={labels[rating]}
        >
          <input
            type="radio"
            name={name}
            value={rating}
            checked={value === rating}
            onChange={() => onChange(rating)}
            aria-label={`${legend} ${rating}점 — ${labels[rating]}`}
          />
          <span aria-hidden="true">{rating}</span>
        </label>
      ))}
    </div>
  </fieldset>
);

/**
 * 답변 하나에 대한 정확도·유용성 평가.
 *
 * 이미 평가한 답변이면 접힌 상태로 결과만 보여주고, 눌러서 다시 고칠 수 있다.
 * 다시 제출하면 서버가 기존 평가를 갱신한다.
 */
export const AnswerFeedback = ({ existing, onSubmit }: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(existing?.accuracy ?? null);
  const [helpfulness, setHelpfulness] = useState<number | null>(
    existing?.helpfulness ?? null,
  );
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = accuracy !== null && helpfulness !== null && !saving;

  const handleSubmit = async () => {
    if (accuracy === null || helpfulness === null || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        accuracy,
        helpfulness,
        comment: comment.trim() || undefined,
      });
      setIsOpen(false);
    } catch {
      // 네트워크 오류로 평가가 날아가면 사용자는 다시 쓸 마음을 잃는다.
      // 입력값은 그대로 두고 재시도만 안내한다.
      setError('평가를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) {
    return (
      <div className="answer-feedback collapsed" data-testid="answer-feedback">
        {existing ? (
          <button
            type="button"
            className="btn-feedback-toggle rated"
            onClick={() => setIsOpen(true)}
          >
            <span className="feedback-summary" data-testid="feedback-summary">
              내 평가 · 정확도 {existing.accuracy}/5 · 유용성 {existing.helpfulness}/5
            </span>
            <span className="feedback-edit-hint">수정</span>
          </button>
        ) : (
          <button
            type="button"
            className="btn-feedback-toggle"
            onClick={() => setIsOpen(true)}
          >
            이 답변을 평가하기
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="answer-feedback" data-testid="answer-feedback">
      <RatingScale
        legend="정확도"
        name="accuracy"
        labels={ACCURACY_LABELS}
        value={accuracy}
        onChange={setAccuracy}
      />
      <RatingScale
        legend="유용성"
        name="helpfulness"
        labels={HELPFULNESS_LABELS}
        value={helpfulness}
        onChange={setHelpfulness}
      />

      <label className="feedback-comment-label">
        <span>의견 (선택)</span>
        <textarea
          className="feedback-comment"
          value={comment}
          maxLength={MAX_COMMENT_LENGTH}
          rows={2}
          placeholder="무엇이 아쉬웠는지 알려주시면 답변 품질을 개선하는 데 씁니다."
          onChange={(e) => setComment(e.target.value)}
        />
      </label>

      {error && (
        <p className="feedback-error" role="alert" data-testid="feedback-error">
          {error}
        </p>
      )}

      <div className="feedback-actions">
        <button
          type="button"
          className="btn-feedback-cancel"
          onClick={() => setIsOpen(false)}
          disabled={saving}
        >
          취소
        </button>
        <button
          type="button"
          className="btn-feedback-submit"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {saving ? '저장 중…' : existing ? '평가 수정' : '평가 제출'}
        </button>
      </div>
    </div>
  );
};

export default AnswerFeedback;
