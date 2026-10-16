import React, { useState, useEffect, useCallback } from 'react';
import {
  getMyPrompt,
  getMyPromptList,
  saveMyPrompt,
  activateMyPrompt,
  deleteMyPromptVersion,
  resetMyPrompt,
  MyPromptOut,
} from '../../api/ai';

export interface PromptSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPromptUpdated?: () => void;
}

export const PromptSettingsModal: React.FC<PromptSettingsModalProps> = ({
  isOpen,
  onClose,
  onPromptUpdated,
}) => {
  const [myPrompt, setMyPrompt] = useState<MyPromptOut | null>(null);
  const [promptList, setPromptList] = useState<MyPromptOut[]>([]);
  const [promptDraft, setPromptDraft] = useState('');
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptError, setPromptError] = useState('');
  const [promptSuccessMsg, setPromptSuccessMsg] = useState('');

  const isMyCustomPrompt = Boolean(myPrompt?.userId);
  const isSlotLimitReached = promptList.length >= 10;

  const refreshPromptData = useCallback(async () => {
    const [p, list] = await Promise.all([getMyPrompt(), getMyPromptList()]);
    setMyPrompt(p);
    setPromptList(list);
    return { p, list };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    const loadData = async () => {
      setPromptError('');
      setPromptSuccessMsg('');
      setPromptLoading(true);
      try {
        const { p } = await refreshPromptData();
        if (isMounted) {
          setPromptDraft(p.content);
        }
      } catch {
        if (isMounted) {
          setPromptError('프롬프트를 불러오는 데 실패했습니다.');
        }
      } finally {
        if (isMounted) {
          setPromptLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, refreshPromptData]);

  if (!isOpen) {
    return null;
  }

  const handleSavePrompt = async () => {
    if (!promptDraft.trim()) {
      setPromptError('프롬프트 내용을 입력하세요.');
      return;
    }
    if (isSlotLimitReached) {
      setPromptError('개인 프롬프트는 최대 10개까지 저장할 수 있습니다. 기존 슬롯을 삭제한 후 다시 시도하세요.');
      return;
    }
    setPromptSaving(true);
    setPromptError('');
    setPromptSuccessMsg('');
    try {
      await saveMyPrompt(promptDraft.trim(), true);
      const { p } = await refreshPromptData();
      setPromptDraft(p.content);
      setPromptSuccessMsg('새 프롬프트 슬롯이 저장되고 활성화되었습니다.');
      onPromptUpdated?.();
    } catch (error) {
      const err = error as { response?: { data?: { message?: unknown } } };
      const serverMessage = err.response?.data?.message;
      setPromptError(typeof serverMessage === 'string' ? serverMessage : '프롬프트 저장에 실패했습니다.');
    } finally {
      setPromptSaving(false);
    }
  };

  const handleActivateSlot = async (version: number) => {
    setPromptSaving(true);
    setPromptError('');
    setPromptSuccessMsg('');
    try {
      await activateMyPrompt(version);
      const { p } = await refreshPromptData();
      setPromptDraft(p.content);
      setPromptSuccessMsg('프롬프트가 활성화되었습니다.');
      onPromptUpdated?.();
    } catch (error) {
      const err = error as { response?: { data?: { message?: unknown } } };
      const serverMessage = err.response?.data?.message;
      setPromptError(typeof serverMessage === 'string' ? serverMessage : '프롬프트 활성화에 실패했습니다.');
    } finally {
      setPromptSaving(false);
    }
  };

  const handleDeleteSlot = async (version: number) => {
    setPromptSaving(true);
    setPromptError('');
    setPromptSuccessMsg('');
    try {
      await deleteMyPromptVersion(version);
      const { p } = await refreshPromptData();
      setPromptDraft(p.content);
      setPromptSuccessMsg('프롬프트 슬롯이 삭제되었습니다.');
      onPromptUpdated?.();
    } catch (error) {
      const err = error as { response?: { data?: { message?: unknown } } };
      const serverMessage = err.response?.data?.message;
      setPromptError(typeof serverMessage === 'string' ? serverMessage : '프롬프트 삭제에 실패했습니다.');
    } finally {
      setPromptSaving(false);
    }
  };

  const handleResetPrompt = async () => {
    setPromptSaving(true);
    setPromptError('');
    setPromptSuccessMsg('');
    try {
      await resetMyPrompt();
      const { p } = await refreshPromptData();
      setPromptDraft(p.content);
      setPromptSuccessMsg('기본 프롬프트로 초기화되었습니다.');
      onPromptUpdated?.();
    } catch {
      setPromptError('프롬프트 초기화에 실패했습니다.');
    } finally {
      setPromptSaving(false);
    }
  };

  return (
    <div
      className="chat-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-settings-title"
        style={{
          background: '#1e293b',
          borderRadius: 12,
          padding: 28,
          width: 560,
          maxWidth: '90vw',
          border: '1px solid #334155',
        }}
      >
        <h3 id="prompt-settings-title" style={{ color: '#f1f5f9', marginBottom: 4, fontSize: 18, fontWeight: 700 }}>
          AI 답변 스타일 설정
        </h3>
        <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>
          AI가 답변할 때 따르는 시스템 프롬프트를 내 취향에 맞게 바꿀 수 있습니다. 저장하면 내 질문에만 적용되고, 다른 사용자에게는 영향을 주지 않습니다.
        </p>

        {promptError && (
          <div style={{ background: '#450a0a', border: '1px solid #991b1b', borderRadius: 6, padding: '10px 12px', color: '#fca5a5', fontSize: 13, marginBottom: 12 }}>
            {promptError}
          </div>
        )}
        {promptSuccessMsg && (
          <div style={{ background: '#052e16', border: '1px solid #166534', borderRadius: 6, padding: '10px 12px', color: '#86efac', fontSize: 13, marginBottom: 12 }}>
            {promptSuccessMsg}
          </div>
        )}

        {promptLoading ? (
          <div style={{ color: '#94a3b8', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
            불러오는 중...
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    background: isMyCustomPrompt ? '#052e16' : '#1e3a5f',
                    color: isMyCustomPrompt ? '#86efac' : '#93c5fd',
                  }}
                >
                  {isMyCustomPrompt ? '내 커스텀 설정 사용 중' : '기본값 사용 중'}
                </span>
                <span style={{ fontSize: 12, color: isSlotLimitReached ? '#fca5a5' : '#94a3b8' }}>
                  저장된 프롬프트 목록 ({promptList.length} / 10)
                </span>
              </div>

              {promptList.length > 0 && (
                <div
                  style={{
                    maxHeight: 180,
                    overflowY: 'auto',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    background: '#0f172a',
                    marginBottom: 16,
                  }}
                >
                  {promptList.map((slot, idx) => {
                    const isSlotActive = slot.isActive;
                    return (
                      <div
                        key={slot.id || `slot-${slot.version}`}
                        style={{
                          padding: '8px 12px',
                          borderBottom: idx !== promptList.length - 1 ? '1px solid #1e293b' : 'none',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          background: isSlotActive ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9', whiteSpace: 'nowrap' }}>
                            슬롯 {idx + 1} (v{slot.version})
                          </span>
                          {isSlotActive ? (
                            <span
                              style={{
                                fontSize: 10,
                                padding: '1px 6px',
                                borderRadius: 3,
                                background: '#052e16',
                                color: '#86efac',
                                fontWeight: 600,
                              }}
                            >
                              활성
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: 10,
                                padding: '1px 6px',
                                borderRadius: 3,
                                background: '#334155',
                                color: '#94a3b8',
                              }}
                            >
                              비활성
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: 12,
                              color: '#94a3b8',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: 200,
                            }}
                            title={slot.content}
                          >
                            {slot.content}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          {!isSlotActive && (
                            <button
                              type="button"
                              onClick={() => handleActivateSlot(slot.version)}
                              disabled={promptSaving}
                              style={{
                                padding: '3px 8px',
                                background: '#312e81',
                                border: 'none',
                                borderRadius: 4,
                                color: '#c7d2fe',
                                cursor: promptSaving ? 'not-allowed' : 'pointer',
                                fontSize: 11,
                              }}
                            >
                              v{slot.version} 활성화
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteSlot(slot.version)}
                            disabled={promptSaving}
                            style={{
                              padding: '3px 8px',
                              background: '#450a0a',
                              border: 'none',
                              borderRadius: 4,
                              color: '#fca5a5',
                              cursor: promptSaving ? 'not-allowed' : 'pointer',
                              fontSize: 11,
                            }}
                          >
                            v{slot.version} 삭제
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {isSlotLimitReached && (
                <div style={{ background: '#450a0a', border: '1px solid #991b1b', borderRadius: 6, padding: '8px 12px', color: '#fca5a5', fontSize: 12, marginBottom: 12 }}>
                  개인 프롬프트는 최대 10개까지 저장할 수 있습니다. 기존 슬롯을 삭제한 후 새로운 프롬프트를 저장하세요.
                </div>
              )}
            </div>

            <div style={{ marginBottom: 6, fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
              새 프롬프트 작성 및 저장
            </div>
            <textarea
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              rows={8}
              disabled={promptSaving}
              style={{ width: '100%', padding: '9px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: 13, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'monospace', lineHeight: 1.6, marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={onClose}
                disabled={promptSaving}
                style={{ padding: '8px 16px', background: '#334155', border: 'none', borderRadius: 6, color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}
              >
                닫기
              </button>
              {isMyCustomPrompt && (
                <button
                  onClick={handleResetPrompt}
                  disabled={promptSaving}
                  style={{ padding: '8px 16px', background: '#450a0a', border: 'none', borderRadius: 6, color: '#fca5a5', cursor: 'pointer', fontSize: 13 }}
                >
                  기본값으로 초기화
                </button>
              )}
              <button
                onClick={handleSavePrompt}
                disabled={promptSaving || isSlotLimitReached}
                style={{
                  padding: '8px 16px',
                  background: promptSaving || isSlotLimitReached ? '#334155' : '#6366f1',
                  border: 'none',
                  borderRadius: 6,
                  color: '#fff',
                  cursor: promptSaving || isSlotLimitReached ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                }}
              >
                {promptSaving ? '저장 중...' : '새 슬롯으로 저장 및 적용'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
