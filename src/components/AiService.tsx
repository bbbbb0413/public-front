import React, { useState, useEffect, useRef, useContext } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  getDocuments,
  uploadDocument,
  deleteDocument,
  askQuestionStream,
  getSessions,
  deleteSessionById,
  SourceRef,
  SessionOut,
  AgentProgress,
  AgentPhase,
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

  const [expandedSources, setExpandedSources] = useState<Record<number, boolean>>({});
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const toggleSourceExpand = (index: number) => {
    setExpandedSources((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const handleNewChat = () => {
    setSessionId(null);
    setChatLog([]);
    setStreamingAnswer('');
    setCurrentSources([]);
    setExpandedSources({});
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
      }));
      setChatLog(loaded);
      setStreamingAnswer('');
      setCurrentSources([]);
      setExpandedSources({});
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
      if (sessionId === sid) handleNewChat();
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
      await uploadDocument(file);
      await fetchDocuments();
      // 인제스트 완료될 때까지 3초마다 폴링 (최대 30초)
      const poll = setInterval(async () => {
        const docs: DocumentInfo[] = (await getDocuments()) || [];
        setDocuments(docs);
        const pending = docs.some((d) =>
          ['PENDING', 'PROCESSING'].includes(d.status.toUpperCase()),
        );
        if (!pending) clearInterval(poll);
      }, 3000);
      setTimeout(() => clearInterval(poll), 30000);
    } catch (error) {
      const err = error as { response?: { data?: { message?: unknown } } };
      const serverMessage = err.response?.data?.message;
      setErrorMsg(typeof serverMessage === 'string' ? serverMessage : '파일 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteDocument = async (id: string) => {
    setErrorMsg('');
    try {
      await deleteDocument(id);
      await fetchDocuments();
    } catch {
      setErrorMsg('문서 삭제에 실패했습니다.');
    }
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
    setCurrentSources([]);
    setExpandedSources({});
    setCurrentProgress(null);

    let accumulated = '';
    let lastProgress: AgentProgress | null = null;

    await askQuestionStream(
      currentQuestion,
      (token) => {
        accumulated += token;
        setStreamingAnswer(accumulated);
      },
      () => {
        setChatLog((prev) => [
          ...prev,
          {
            sender: 'ai',
            text: accumulated,
            confidence: lastProgress?.confidence,
            missing: lastProgress?.missing,
          },
        ]);
        setStreamingAnswer('');
        setCurrentProgress(null);
        setIsStreaming(false);
        if (userId) fetchSessions();
      },
      () => {
        setErrorMsg('답변 수신 도중 에러가 발생했습니다.');
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
                        <button onClick={() => handleDeleteDocument(doc.id)} className="btn-delete">
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
            <button onClick={() => setIsChatOpen(true)} className="btn-open-chat">
              채팅 열기 ↗
            </button>
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
                      {currentSources.map((src, i) => {
                        const isExpanded = !!expandedSources[i];
                        return (
                          <li key={i} className="source-ref-item-container">
                            <button
                              type="button"
                              className={`source-ref-item${isExpanded ? ' expanded' : ''}`}
                              onClick={() => toggleSourceExpand(i)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  toggleSourceExpand(i);
                                }
                              }}
                              aria-expanded={isExpanded}
                            >
                              <span className="source-ref-name">{src.fileName}</span>
                              <span className="source-ref-chunk">청크 {src.chunkIndex}</span>
                              {src.snippet && (
                                <span className="source-ref-toggle-icon" aria-hidden="true">
                                  {isExpanded ? '▲' : '▼'}
                                </span>
                              )}
                            </button>
                            {isExpanded && src.snippet && (
                              <div className="source-ref-snippet" data-testid={`source-snippet-${i}`}>
                                {src.snippet}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
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
                <button
                  type="submit"
                  disabled={isStreaming || !question.trim()}
                  className="chat-send-btn"
                >
                  {isStreaming ? '답변 중...' : '전송'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default AiService;
