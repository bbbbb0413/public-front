import { useState, useEffect, useRef } from 'react';
import type { AnswerFeedbackOut } from '../api/ai';

const RATINGS = [1, 2, 3, 4, 5] as const;
const MAX_COMMENT_LENGTH = 1000;

const FEEDBACK_REASONS = [
  '환각/사실 오류',
  '근거 문서와 다름',
  '질문 의도와 무관',
  '내용 불완전/부족',
  '최신 정보 아님',
] as const;

const parseReasonsFromComment = (comment: string): string[] => {
  if (!comment) return [];
  const matches = comment.match(/\[([^\]]+)\]/g);
  if (!matches) return [];
  const valid = new Set<string>(FEEDBACK_REASONS);
  const found: string[] = [];
  for (const match of matches) {
    const text = match.slice(1, -1).trim();
    if (valid.has(text) && !found.includes(text)) {
      found.push(text);
    }
  }
  return found;
};

const stripReasonTags = (comment: string): string => {
  if (!comment) return '';
  let result = comment;
  for (const reason of FEEDBACK_REASONS) {
    result = result.split(`[${reason}]`).join('');
  }
  return result.replace(/^\s+/, '').trimEnd();
};

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
  onDelete?: () => Promise<void>;
  onSuccess?: (isUpdate: boolean) => void;
  onClose?: () => void;
  forceOpen?: boolean;
}

const getAccuracyClass = (accuracy: number): string => {
  if (accuracy >= 4) return 'feedback-positive';
  if (accuracy === 3) return 'feedback-neutral';
  return 'feedback-negative';
};

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
export const AnswerFeedback = ({
  existing,
  onSubmit,
  onDelete,
  onSuccess,
  onClose,
  forceOpen,
}: Props) => {
  const [isOpen, setIsOpen] = useState(Boolean(forceOpen));
  const containerRef = useRef<HTMLDivElement>(null);
  const [deleted, setDeleted] = useState(false);
  const [prevExisting, setPrevExisting] = useState(existing);

  const [accuracy, setAccuracy] = useState<number | null>(existing?.accuracy ?? null);
  const [helpfulness, setHelpfulness] = useState<number | null>(
    existing?.helpfulness ?? null,
  );
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [selectedReasons, setSelectedReasons] = useState<string[]>(() =>
    parseReasonsFromComment(existing?.comment ?? ''),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (existing !== prevExisting) {
    setPrevExisting(existing);
    setDeleted(false);
    setAccuracy(existing?.accuracy ?? null);
    setHelpfulness(existing?.helpfulness ?? null);
    setComment(existing?.comment ?? '');
    setSelectedReasons(parseReasonsFromComment(existing?.comment ?? ''));
  }

  const effectiveExisting = deleted ? undefined : existing;
  const isBusy = saving || deleting;
  const canSubmit = accuracy !== null && helpfulness !== null && !isBusy;

  const resetForm = () => {
    setAccuracy(effectiveExisting?.accuracy ?? null);
    setHelpfulness(effectiveExisting?.helpfulness ?? null);
    setComment(effectiveExisting?.comment ?? '');
    setSelectedReasons(parseReasonsFromComment(effectiveExisting?.comment ?? ''));
    setError(null);
  };

  const [prevForceOpen, setPrevForceOpen] = useState(forceOpen);
  if (forceOpen !== prevForceOpen) {
    setPrevForceOpen(forceOpen);
    if (forceOpen) {
      setIsOpen(true);
      setAccuracy(effectiveExisting?.accuracy ?? null);
      setHelpfulness(effectiveExisting?.helpfulness ?? null);
      setComment(effectiveExisting?.comment ?? '');
      setSelectedReasons(parseReasonsFromComment(effectiveExisting?.comment ?? ''));
      setError(null);
    }
  }

  useEffect(() => {
    if (forceOpen && isOpen) {
      containerRef.current?.focus();
    }
  }, [forceOpen, isOpen]);

  const handleOpen = () => {
    resetForm();
    setIsOpen(true);
  };

  const handleCancel = () => {
    resetForm();
    setIsOpen(false);
    onClose?.();
  };

  const handleAccuracyChange = (val: number) => {
    setAccuracy(val);
    if (val >= 3) {
      if (selectedReasons.length > 0) {
        setSelectedReasons([]);
        setComment((prev) => stripReasonTags(prev));
      }
    }
  };

  const handleToggleReason = (reason: string) => {
    const isCurrentlySelected = selectedReasons.includes(reason);
    const nextReasons = isCurrentlySelected
      ? selectedReasons.filter((r) => r !== reason)
      : [...selectedReasons, reason];

    const prefix = nextReasons.map((r) => `[${r}]`).join(' ');
    const customText = stripReasonTags(comment);
    const nextComment = prefix ? (customText ? `${prefix} ${customText}` : prefix) : customText;

    setSelectedReasons(nextReasons);
    setComment(nextComment);
  };

  const handleSubmit = async () => {
    if (accuracy === null || helpfulness === null || isBusy) return;
    setSaving(true);
    setError(null);
    try {
      const isUpdate = Boolean(effectiveExisting);
      await onSubmit({
        accuracy,
        helpfulness,
        comment: comment.trim() || undefined,
      });
      setDeleted(false);
      setIsOpen(false);
      onSuccess?.(isUpdate);
      onClose?.();
    } catch {
      // 네트워크 오류로 평가가 날아가면 사용자는 다시 쓸 마음을 잃는다.
      // 입력값은 그대로 두고 재시도만 안내한다.
      setError('평가를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || isBusy) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
      setDeleted(true);
      setAccuracy(null);
      setHelpfulness(null);
      setComment('');
      setSelectedReasons([]);
      setIsOpen(false);
      onClose?.();
    } catch {
      setError('평가를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen) {
    return (
      <div className="answer-feedback collapsed" data-testid="answer-feedback">
        {effectiveExisting ? (
          <button
            type="button"
            className="btn-feedback-toggle rated"
            onClick={handleOpen}
          >
            <span
              className={`feedback-summary ${getAccuracyClass(effectiveExisting.accuracy)}`}
              data-testid="feedback-summary"
            >
              내 평가 · 정확도 {effectiveExisting.accuracy}/5 · 유용성 {effectiveExisting.helpfulness}/5
            </span>
            <span className="feedback-edit-hint">수정</span>
          </button>
        ) : (
          <button
            type="button"
            className="btn-feedback-toggle"
            onClick={handleOpen}
          >
            이 답변을 평가하기
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="answer-feedback"
      data-testid="answer-feedback"
      ref={containerRef}
      tabIndex={-1}
    >
      <RatingScale
        legend="정확도"
        name="accuracy"
        labels={ACCURACY_LABELS}
        value={accuracy}
        onChange={handleAccuracyChange}
      />
      <RatingScale
        legend="유용성"
        name="helpfulness"
        labels={HELPFULNESS_LABELS}
        value={helpfulness}
        onChange={setHelpfulness}
      />

      {accuracy !== null && accuracy <= 2 && (
        <div className="feedback-reasons-group" data-testid="feedback-reasons-group">
          <span className="feedback-reasons-title">어떤 점이 아쉬웠나요?</span>
          <div className="feedback-reasons-chips">
            {FEEDBACK_REASONS.map((reason) => {
              const isSelected = selectedReasons.includes(reason);
              return (
                <button
                  key={reason}
                  type="button"
                  className={`feedback-reason-chip${isSelected ? ' selected' : ''}`}
                  aria-pressed={isSelected}
                  onClick={() => handleToggleReason(reason)}
                >
                  {reason}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
        <span className="feedback-char-count" data-testid="feedback-char-count">
          {comment.length} / {MAX_COMMENT_LENGTH}자
        </span>
      </label>

      {error && (
        <p className="feedback-error" role="alert" data-testid="feedback-error">
          {error}
        </p>
      )}

      <div className="feedback-actions">
        {effectiveExisting && onDelete && (
          <button
            type="button"
            className="btn-feedback-delete"
            onClick={handleDelete}
            disabled={isBusy}
          >
            {deleting ? '삭제 중…' : '평가 삭제'}
          </button>
        )}
        <button
          type="button"
          className="btn-feedback-cancel"
          onClick={handleCancel}
          disabled={isBusy}
        >
          취소
        </button>
        <button
          type="button"
          className="btn-feedback-submit"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {saving ? '저장 중…' : effectiveExisting ? '평가 수정' : '평가 제출'}
        </button>
      </div>
    </div>
  );
};

export default AnswerFeedback;
