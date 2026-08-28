import React, { useState, useEffect, useRef, useContext } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  getDocuments,
  uploadDocument,
  deleteDocument,
  askQuestionStream,
  getSessions,
  deleteSessionById,
  subscribeIngestJob,
  getMyPrompt,
  saveMyPrompt,
  resetMyPrompt,
  getDocumentFile,
  SourceRef,
  SessionOut,
  AgentProgress,
  AgentPhase,
  MyPromptOut,
} from '../api/ai';
import { AuthContext } from '../context/AuthContext';
import './AiService.css';

interface DocumentInfo {
  id: string;
  fileName: string;
  status: string;
  chunkCount: number;
  createdAt: string;
}

interface ChatMessage {
  sender: 'user' | 'ai';
  text: string;
  confidence?: number;
  missing?: string[];
}

const PHASE_LABELS: Record<AgentPhase, string> = {
  searching: '관련 문서를 찾는 중',
  generating: '답변을 생성하는 중',
  critiquing: '답변을 검토하고 평가하는 중',
  refining: '답변을 보완하고 다듬는 중',
};

export const AiService = () => {
  const authCtx = useContext(AuthContext);
  const userId = authCtx?.user?.uuid ?? null;

  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [streamingAnswer, setStreamingAnswer] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [currentSources, setCurrentSources] = useState<SourceRef[]>([]);
  const [currentProgress, setCurrentProgress] = useState<AgentProgress | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionOut[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [viewingFileId, setViewingFileId] = useState<string | null>(null);
  const [fileViewError, setFileViewError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isPromptSettingsOpen, setIsPromptSettingsOpen] = useState(false);
  const [myPrompt, setMyPrompt] = useState<MyPromptOut | null>(null);
  const [promptDraft, setPromptDraft] = useState('');
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptError, setPromptError] = useState('');
  const [promptSuccessMsg, setPromptSuccessMsg] = useState('');

  const [deletingDoc, setDeletingDoc] = useState<{ id: string; fileName: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleCopyAnswer = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        setCopiedIndex(null);
      }, 2000);
    } catch {
      setErrorMsg('답변 복사에 실패했습니다.');
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const activeSubscriptionsRef = useRef<Set<() => void>>(new Set());
  const activeStreamCancelRef = useRef<(() => Promise<void>) | null>(null);
  const streamingAnswerRef = useRef<string>('');

  const fetchSessions = async () => {
    if (!userId) return;
    setLoadingSessions(true);
    try {
      const data = await getSessions(userId);
      setSessions(data);
    } catch {
      // 세션 목록 로드 실패는 조용히 처리
    } finally {
      setLoadingSessions(false);
    }
  };

  const toggleGroup = (documentId: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [documentId]: !prev[documentId],
    }));
  };

  const groupSourcesByDocument = (sources: SourceRef[]) => {
    const groups = new Map<
      string,
      { documentId: string; fileName: string; maxScore?: number; chunks: SourceRef[] }
    >();
    for (const src of sources) {
      const existing = groups.get(src.documentId);
      if (existing) {
        existing.chunks.push(src);
        if (typeof src.score === 'number') {
          existing.maxScore = Math.max(existing.maxScore ?? -Infinity, src.score);
        }
      } else {
        groups.set(src.documentId, {
          documentId: src.documentId,
          fileName: src.fileName,
          maxScore: src.score,
          chunks: [src],
        });
      }
    }
    return [...groups.values()]
      .map((group) => ({
        ...group,
        chunks: [...group.chunks].sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity)),
      }))
      .sort((a, b) => (b.maxScore ?? -Infinity) - (a.maxScore ?? -Infinity));
  };

  const handleViewSourceFile = async (documentId: string) => {
    if (viewingFileId) return;
    setViewingFileId(documentId);
    setFileViewError(null);
    // 팝업 차단 방지: await 이후 window.open을 호출하면 브라우저가 사용자 제스처와
    // 무관한 호출로 간주해 팝업을 막는 경우가 많다. 클릭 핸들러 안에서 동기적으로
    // 빈 탭을 먼저 열고, 파일을 받아온 뒤 그 탭의 location만 옮긴다.
    const newTab = window.open('', '_blank');
    try {
      const blob = await getDocumentFile(documentId);
      const url = URL.createObjectURL(blob);
      if (newTab) {
        newTab.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      newTab?.close();
      setFileViewError('원본 파일을 불러오는 데 실패했습니다. 이 문서는 원본이 저장되어 있지 않을 수 있습니다.');
    } finally {
      setViewingFileId(null);
    }
  };

  const handleNewChat = () => {
    setSessionId(null);
    setChatLog([]);
    setStreamingAnswer('');
    streamingAnswerRef.current = '';
    setCurrentSources([]);
    setExpandedGroups({});
    setCurrentProgress(null);
    setCopiedIndex(null);
  };

  const handleLoadSession = async (sid: string) => {
    try {
      const { getSessionDetail } = await import('../api/ai');
      const detail = await getSessionDetail(sid);
      if (!detail) return;
      setSessionId(detail.sessionId);
      const loaded: ChatMessage[] = detail.turns.map((t) => ({
        sender: t.role === 'user' ? 'user' : 'ai',
        text: t.content,
        confidence: t.confidence,
        missing: t.missing,
      }));
      setChatLog(loaded);
      setStreamingAnswer('');
      streamingAnswerRef.current = '';
      const lastAiTurnWithSources = [...detail.turns]
        .reverse()
        .find((t) => t.role === 'assistant' && t.sources && t.sources.length > 0);
      setCurrentSources(lastAiTurnWithSources?.sources ?? []);
      setExpandedGroups({});
      setCurrentProgress(null);
      setCopiedIndex(null);
    } catch {
      setErrorMsg('세션을 불러오는 데 실패했습니다.');
    }
  };

  const handleDeleteSession = async (sid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteSessionById(sid);
      setSessions((prev) => prev.filter((s) => s.sessionId !== sid));
      if (sessionId === sid) {
        handleNewChat();
      }
    } catch {
      setErrorMsg('세션 삭제에 실패했습니다.');
    }
  };

  const fetchDocuments = async () => {
    setLoadingDocs(true);
    try {
      const docs = await getDocuments();
      setDocuments(docs || []);
      setErrorMsg('');
    } catch {
      setErrorMsg('문서 목록을 불러오는 데 실패했습니다.');
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    const subscriptions = activeSubscriptionsRef.current;
    return () => {
      subscriptions.forEach((cleanup) => cleanup());
      subscriptions.clear();
      if (activeStreamCancelRef.current) {
        activeStreamCancelRef.current();
        activeStreamCancelRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLog, streamingAnswer, currentProgress]);

  useEffect(() => {
    if (!isChatOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsChatOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    setTimeout(() => chatInputRef.current?.focus(), 50);
    if (userId) fetchSessions();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isChatOpen]);

  useEffect(() => {
    if (!deletingDoc) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        setDeletingDoc(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [deletingDoc, isDeleting]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1차 클라이언트 사이드 유효성 검사
    // 1. 파일 크기 검증 (최대 10MB)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setErrorMsg('파일 크기는 최대 10MB까지 허용됩니다.');
      e.target.value = '';
      return;
    }

    // 2. 지원 파일 형식 검증 (.txt, .pdf, .md)
    const allowedExtensions = ['txt', 'pdf', 'md'];
    const fileName = file.name || '';
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (!ext || !allowedExtensions.includes(ext)) {
      setErrorMsg('지원하지 않는 파일 형식입니다. (TXT, PDF, MD 파일만 지원)');
      e.target.value = '';
      return;
    }

    setUploading(true);
    setErrorMsg('');
    try {
      const res = await uploadDocument(file);
      const jobId = res?.jobId;
      if (!jobId) {
        await fetchDocuments();
        return;
      }

      let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
      let cleanupFn: (() => void) | null = null;

      const finishSubscription = () => {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }
        if (cleanupFn) {
          activeSubscriptionsRef.current.delete(cleanupFn);
          cleanupFn();
          cleanupFn = null;
        }
      };

      timeoutTimer = setTimeout(() => {
        finishSubscription();
        fetchDocuments();
      }, 15000);

      cleanupFn = subscribeIngestJob(jobId, {
        onDone: () => {
          finishSubscription();
          fetchDocuments();
        },
        onError: (err) => {
          finishSubscription();
          setErrorMsg(err || '인제스트 처리에 실패했습니다.');
        },
      });

      if (cleanupFn) {
        activeSubscriptionsRef.current.add(cleanupFn);
      }
    } catch (error) {
      const err = error as { response?: { data?: { message?: unknown } } };
      const serverMessage = err.response?.data?.message;
      setErrorMsg(typeof serverMessage === 'string' ? serverMessage : '파일 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteClick = (doc: DocumentInfo) => {
    setDeletingDoc({ id: doc.id, fileName: doc.fileName });
  };

  const handleCancelDelete = () => {
    if (isDeleting) return;
    setDeletingDoc(null);
  };

  const confirmDeleteDocument = async () => {
    if (!deletingDoc || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteDocument(deletingDoc.id);
      setDeletingDoc(null);
      await fetchDocuments();
    } catch (error) {
      const err = error as { response?: { data?: { message?: unknown } } };
      const serverMessage = err.response?.data?.message;
      setErrorMsg(typeof serverMessage === 'string' ? serverMessage : '문서 삭제에 실패했습니다.');
      setDeletingDoc(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenPromptSettings = async () => {
    setIsPromptSettingsOpen(true);
    setPromptLoading(true);
    setPromptError('');
    setPromptSuccessMsg('');
    try {
      const prompt = await getMyPrompt();
      setMyPrompt(prompt);
      setPromptDraft(prompt.content);
    } catch {
      setPromptError('프롬프트를 불러오지 못했습니다.');
    } finally {
      setPromptLoading(false);
    }
  };

  const handleSavePrompt = async () => {
    if (!promptDraft.trim()) {
      setPromptError('프롬프트 내용을 입력해주세요.');
      return;
    }
    setPromptSaving(true);
    setPromptError('');
    setPromptSuccessMsg('');
    try {
      const saved = await saveMyPrompt(promptDraft);
      setMyPrompt(saved);
      setPromptSuccessMsg('내 시스템 프롬프트가 저장되어 즉시 적용되었습니다.');
    } catch {
      setPromptError('프롬프트 저장에 실패했습니다.');
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
      const prompt = await getMyPrompt();
      setMyPrompt(prompt);
      setPromptDraft(prompt.content);
      setPromptSuccessMsg('기본 프롬프트로 초기화되었습니다.');
    } catch {
      setPromptError('초기화에 실패했습니다.');
    } finally {
      setPromptSaving(false);
    }
  };

  const isMyCustomPrompt = !!(myPrompt && userId && myPrompt.userId === userId);

  const handleCancelStreaming = async () => {
    if (activeStreamCancelRef.current) {
      await activeStreamCancelRef.current();
      activeStreamCancelRef.current = null;
    }

    const currentText = streamingAnswerRef.current;
    if (currentText) {
      setChatLog((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: currentText,
        },
      ]);
    }
    setStreamingAnswer('');
    streamingAnswerRef.current = '';
    setCurrentProgress(null);
    setIsStreaming(false);
  };

  const handleSendQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isStreaming) return;

    const currentQuestion = question.trim();
    const prevChatLog = sessionId ? [] : chatLog;
    setQuestion('');
    setChatLog((prev) => [...prev, { sender: 'user', text: currentQuestion }]);
    setIsStreaming(true);
    setStreamingAnswer('');
    streamingAnswerRef.current = '';
    setCurrentSources([]);
    setExpandedGroups({});
    setCurrentProgress(null);

    let accumulated = '';
    let lastProgress: AgentProgress | null = null;

    const handle = askQuestionStream(
      currentQuestion,
      (token) => {
        accumulated += token;
        streamingAnswerRef.current = accumulated;
        setStreamingAnswer(accumulated);
      },
      (finalMeta) => {
        activeStreamCancelRef.current = null;
        const confidence =
          finalMeta?.confidence !== undefined ? finalMeta.confidence : lastProgress?.confidence;
        const missing =
          finalMeta?.missing !== undefined ? finalMeta.missing : lastProgress?.missing;
        setChatLog((prev) => [
          ...prev,
          {
            sender: 'ai',
            text: accumulated,
            confidence,
            missing,
          },
        ]);
        setStreamingAnswer('');
        streamingAnswerRef.current = '';
        setCurrentProgress(null);
        setIsStreaming(false);
        if (userId) fetchSessions();
      },
      () => {
        activeStreamCancelRef.current = null;
        setErrorMsg('답변 수신 도중 에러가 발생했습니다.');
        streamingAnswerRef.current = '';
        setCurrentProgress(null);
        setIsStreaming(false);
      },
      userId,
      prevChatLog,
      (sources) => setCurrentSources(sources),
      sessionId,
      (newId) => setSessionId(newId),
      (progress) => {
        lastProgress = progress;
        setCurrentProgress(progress);
      },
    );

    activeStreamCancelRef.current = handle?.cancel ?? null;
  };

  const lastAiMsg = chatLog.filter((m) => m.sender === 'ai').at(-1);

  return (
    <div className="ai-service-container">
      <h3 className="section-title">AI 지식베이스 Q&A 서비스</h3>
      {errorMsg && <div className="error-banner">{errorMsg}</div>}

      <div className="ai-layout">
        {/* 지식베이스 관리 영역 */}
        <div className="kb-section glass-panel">
          <div className="kb-header">
            <h4>문서 관리</h4>
            <div className="file-upload-wrapper">
              <label htmlFor="file-upload" className={`upload-btn${uploading ? ' uploading' : ''}`}>
                {uploading ? '업로드 중...' : '문서 업로드'}
              </label>
              <input
                id="file-upload"
                aria-label="file-upload-input"
                type="file"
                accept=".txt,.pdf,.md,application/pdf"
                onChange={handleFileUpload}
                disabled={uploading}
                style={{ display: 'none' }}
              />
              <span className="upload-hint">TXT · PDF</span>
            </div>
          </div>

          <div className="document-list-container">
            {loadingDocs ? (
              <div className="loading-spinner">문서 로딩 중...</div>
            ) : documents.length === 0 ? (
              <div className="empty-message">업로드된 문서가 없습니다.</div>
            ) : (
              <table className="doc-table">
                <thead>
                  <tr>
                    <th>파일명</th>
                    <th>상태</th>
                    <th>청크 수</th>
                    <th>작업</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr key={doc.id}>
                      <td className="doc-name">{doc.fileName}</td>
                      <td>
                        <span className={`status-badge ${doc.status}`}>{doc.status}</span>
                      </td>
                      <td>{doc.chunkCount}</td>
                      <td>
                        <button onClick={() => handleDeleteClick(doc)} className="btn-delete">
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Q&A 미리보기 패널 */}
        <div className="qa-section glass-panel">
          <div className="qa-section-header">
            <h4>문서 기반 AI Q&A</h4>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleOpenPromptSettings}
                className="btn-open-chat"
                style={{ background: 'rgba(255,255,255,0.08)', boxShadow: 'none' }}
                title="AI 답변 시스템 프롬프트를 내 취향에 맞게 바꿀 수 있습니다"
              >
                AI 설정 ⚙
              </button>
              <button onClick={() => setIsChatOpen(true)} className="btn-open-chat">
                채팅 열기 ↗
              </button>
            </div>
          </div>

          <div className="qa-preview">
            {chatLog.length === 0 ? (
              <div className="qa-preview-empty">
                <div className="qa-preview-icon" aria-hidden="true">🤖</div>
                <p>등록된 문서를 기반으로 AI와 대화할 수 있습니다</p>
                <button onClick={() => setIsChatOpen(true)} className="btn-start-chat">
                  채팅 시작하기
                </button>
              </div>
            ) : (
              <div className="qa-preview-history">
                <div className="qa-preview-count">대화 {chatLog.length}개</div>
                {lastAiMsg && (
                  <div className="qa-preview-last-msg">
                    <span className="qa-preview-label">마지막 AI 답변</span>
                    <span className="qa-preview-text">
                      {lastAiMsg.text.length > 100
                        ? lastAiMsg.text.slice(0, 100) + '…'
                        : lastAiMsg.text}
                    </span>
                  </div>
                )}
                <button onClick={() => setIsChatOpen(true)} className="btn-continue-chat">
                  대화 계속하기 →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 풀스크린 채팅 모달 */}
      {isChatOpen && (
        <div
          className="chat-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsChatOpen(false);
          }}
          role="presentation"
        >
          <div
            className="chat-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-modal-title"
          >
            {userId && (
              <aside className="chat-session-sidebar" aria-label="대화 이력">
                <div className="session-sidebar-header">
                  <span className="session-sidebar-title">대화 이력</span>
                  <button
                    className="btn-new-chat"
                    onClick={handleNewChat}
                    title="새 대화 시작"
                  >
                    +
                  </button>
                </div>
                {loadingSessions ? (
                  <div className="session-loading">로딩 중...</div>
                ) : sessions.length === 0 ? (
                  <div className="session-empty">저장된 대화가 없습니다</div>
                ) : (
                  <ul className="session-list">
                    {sessions.map((s) => (
                      <li
                        key={s.sessionId}
                        className={`session-item${sessionId === s.sessionId ? ' active' : ''}`}
                        onClick={() => handleLoadSession(s.sessionId)}
                      >
                        <span className="session-item-title">{s.title}</span>
                        <button
                          className="btn-delete-session"
                          onClick={(e) => handleDeleteSession(s.sessionId, e)}
                          aria-label={`${s.title} 삭제`}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </aside>
            )}

            <div className="chat-modal-main">
              <div className="chat-modal-header">
                <div className="chat-modal-title-row">
                  <span className="chat-modal-icon" aria-hidden="true">🤖</span>
                  <h3 id="chat-modal-title">문서 기반 AI Q&A</h3>
                </div>
                <button
                  onClick={() => setIsChatOpen(false)}
                  className="btn-close-chat"
                  aria-label="채팅 닫기"
                >
                  ✕
                </button>
              </div>

              <div className="chat-modal-messages">
                {chatLog.length === 0 && !isStreaming && (
                  <div className="chat-welcome">
                    질문을 입력하면 등록된 지식베이스 문서를 바탕으로 AI가 답변합니다.
                  </div>
                )}
                {chatLog.map((msg, idx) => (
                  <div key={idx} className={`chat-message ${msg.sender}`}>
                    <div className="message-bubble">
                      {msg.sender === 'ai' ? (
                        <>
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                          {msg.confidence !== undefined && (
                            <div className="confidence-badge" data-testid="confidence-badge">
                              <span className="confidence-label">신뢰도:</span>
                              <span className="confidence-value">{Math.round(msg.confidence * 100)}%</span>
                            </div>
                          )}
                          {msg.missing && msg.missing.length > 0 && (
                            <div className="missing-info" data-testid="missing-info">
                              <span className="missing-label">확인하지 못한 항목:</span>
                              <ul className="missing-list">
                                {msg.missing.map((item, mIdx) => (
                                  <li key={mIdx} className="missing-item">
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <div className="message-actions">
                            <button
                              type="button"
                              className="btn-copy-answer"
                              onClick={() => handleCopyAnswer(msg.text, idx)}
                              aria-label="답변 복사"
                            >
                              {copiedIndex === idx ? '복사됨' : '복사'}
                            </button>
                          </div>
                        </>
                      ) : (
                        msg.text
                      )}
                    </div>
                  </div>
                ))}
                {isStreaming && (
                  <div className="chat-message ai">
                    <div className="message-bubble streaming">
                      {currentProgress && (
                        <div className="agent-progress-indicator" data-testid="agent-progress">
                          <span className="progress-spinner" aria-hidden="true"></span>
                          <span className="progress-iteration">
                            [반복 {currentProgress.iteration}회차]
                          </span>
                          <span className="progress-phase">
                            {PHASE_LABELS[currentProgress.phase] || currentProgress.phase}
                          </span>
                        </div>
                      )}
                      {streamingAnswer ? (
                        <>
                          <ReactMarkdown>{streamingAnswer}</ReactMarkdown>
                          <span className="cursor">|</span>
                        </>
                      ) : (
                        !currentProgress && <span className="cursor">|</span>
                      )}
                    </div>
                  </div>
                )}
                {!isStreaming && currentSources.length > 0 && (
                  <div className="source-refs">
                    <span className="source-refs-label">참고 문서</span>
                    <ul className="source-refs-list">
                      {groupSourcesByDocument(currentSources).map((group) => {
                        const isExpanded = !!expandedGroups[group.documentId];
                        return (
                          <li key={group.documentId} className="source-ref-item-container">
                            <button
                              type="button"
                              className={`source-ref-item${isExpanded ? ' expanded' : ''}`}
                              onClick={() => toggleGroup(group.documentId)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  toggleGroup(group.documentId);
                                }
                              }}
                              aria-expanded={isExpanded}
                            >
                              <span className="source-ref-name">{group.fileName}</span>
                              <span className="source-ref-chunk">근거 {group.chunks.length}건</span>
                              {typeof group.maxScore === 'number' && (
                                <span className="source-ref-score">
                                  최고 관련도 {Math.round(group.maxScore * 100)}%
                                </span>
                              )}
                              <span className="source-ref-toggle-icon" aria-hidden="true">
                                {isExpanded ? '▲' : '▼'}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="source-ref-view-btn"
                              onClick={() => handleViewSourceFile(group.documentId)}
                              disabled={viewingFileId === group.documentId}
                            >
                              {viewingFileId === group.documentId ? '불러오는 중…' : '원문 보기'}
                            </button>
                            {isExpanded && (
                              <ul className="source-group-chunks">
                                {group.chunks.map((chunk) => (
                                  <li key={chunk.chunkIndex} className="source-chunk-item">
                                    <div className="source-chunk-meta">
                                      <span className="source-ref-chunk">
                                        청크 {chunk.chunkIndex}
                                      </span>
                                      {typeof chunk.score === 'number' && (
                                        <span className="source-ref-score">
                                          관련도 {Math.round(chunk.score * 100)}%
                                        </span>
                                      )}
                                    </div>
                                    {chunk.snippet && (
                                      <div
                                        className="source-ref-snippet"
                                        data-testid={`source-snippet-${group.documentId}-${chunk.chunkIndex}`}
                                      >
                                        {chunk.snippet}
                                      </div>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {fileViewError && (
                      <div className="source-ref-file-error" role="alert">
                        {fileViewError}
                      </div>
                    )}
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* 테스트 검증용 답변 컨테이너 */}
              <div data-testid="chat-answer-content" style={{ display: 'none' }}>
                {chatLog
                  .filter((msg) => msg.sender === 'ai')
                  .map((msg) => msg.text)
                  .join('') + streamingAnswer}
              </div>

              <form onSubmit={handleSendQuestion} className="chat-modal-input-form">
                <input
                  ref={chatInputRef}
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="지식베이스에 대해 질문을 입력하세요..."
                  disabled={isStreaming}
                  className="chat-input"
                />
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={handleCancelStreaming}
                    className="chat-cancel-btn"
                  >
                    중단
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!question.trim()}
                    className="chat-send-btn"
                  >
                    전송
                  </button>
                )}
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 내 시스템 프롬프트 설정 모달 */}
      {isPromptSettingsOpen && (
        <div
          className="chat-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsPromptSettingsOpen(false);
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
                <div style={{ marginBottom: 8 }}>
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
                </div>
                <textarea
                  value={promptDraft}
                  onChange={(e) => setPromptDraft(e.target.value)}
                  rows={12}
                  disabled={promptSaving}
                  style={{ width: '100%', padding: '9px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: 13, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'monospace', lineHeight: 1.6, marginBottom: 16 }}
                />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setIsPromptSettingsOpen(false)}
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
                    disabled={promptSaving}
                    style={{ padding: '8px 16px', background: promptSaving ? '#334155' : '#6366f1', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 13 }}
                  >
                    {promptSaving ? '저장 중...' : '저장 및 적용'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 문서 삭제 확인 모달 */}
      {deletingDoc && (
        <div
          className="chat-modal-overlay"
          data-testid="delete-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCancelDelete();
          }}
          role="presentation"
        >
          <div
            className="delete-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
          >
            <h3 id="delete-confirm-title" className="delete-confirm-title">
              문서 삭제 확인
            </h3>
            <p className="delete-confirm-message">
              {deletingDoc.fileName
                ? `"${deletingDoc.fileName}" 문서를 삭제하시겠습니까?`
                : '선택한 문서를 삭제하시겠습니까?'}
            </p>
            <p className="delete-confirm-warning">
              삭제된 문서는 복구할 수 없으며 지식베이스에서 영구히 제거됩니다.
            </p>
            <div className="delete-confirm-actions">
              <button
                type="button"
                className="btn-cancel-delete"
                onClick={handleCancelDelete}
                disabled={isDeleting}
              >
                취소
              </button>
              <button
                type="button"
                className="btn-confirm-delete"
                onClick={confirmDeleteDocument}
                disabled={isDeleting}
              >
                {isDeleting ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default AiService;

