import client from './client';
import { createIdempotencyKey } from '../utils/idempotency-key';
import { GATEWAY_BASE_URL } from '../utils/gateway-url';

const MAX_STREAM_RECONNECT_ATTEMPTS = 3;
const STREAM_RECONNECT_BASE_DELAY_MS = 1000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface ParsedSseEvent {
  id?: string;
  type: string;
  data: unknown;
}

const parseSseEvent = (block: string): ParsedSseEvent | null => {
  const lines = block.split('\n');
  const idLine = lines.find((line) => line.startsWith('id:'));
  const dataLine = lines.find((line) => line.startsWith('data:'));
  if (!dataLine) return null;
  try {
    const parsed = JSON.parse(dataLine.slice(5).trim());
    return {
      id: idLine ? idLine.slice(3).trim() : undefined,
      type: parsed.type,
      data: parsed.data,
    };
  } catch {
    return null;
  }
};

/**
 * 잡 SSE 스트림에 연결해 이벤트를 순서대로 onEvent에 전달한다.
 * fetch/네트워크 자체가 끊기면(응답을 못 받거나 스트림 도중 예외) 마지막으로 받은
 * 이벤트 id를 Last-Event-ID로 실어 재접속한다 — 서버(RedisStreamsRelayService)가
 * 그 지점부터 이벤트를 재생해준다. done/error로 정상 종료되거나 순수하게 스트림이
 * 자연 종료되는 경우(터미널 이벤트 없이 끝) 재접속하지 않는다.
 *
 * onEvent가 true를 반환하면 터미널 이벤트로 간주해 더 이상 읽지 않는다.
 */
const connectJobStream = async (
  jobId: string,
  onEvent: (event: ParsedSseEvent) => boolean,
  signal: AbortSignal,
): Promise<void> => {
  let lastEventId: string | undefined;
  let attempt = 0;

  while (true) {
    try {
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = {
        Authorization: token ? `Bearer ${token}` : '',
        Accept: 'text/event-stream',
      };
      if (lastEventId) headers['Last-Event-ID'] = lastEventId;

      const response = await fetch(`${GATEWAY_BASE_URL}/ai/jobs/${jobId}/stream`, {
        method: 'GET',
        headers,
        signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('ReadableStream not supported');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          if (!block.trim()) continue;
          const event = parseSseEvent(block);
          if (!event) continue;
          if (event.id) lastEventId = event.id;
          if (onEvent(event)) return;
        }
      }

      if (buffer.trim()) {
        const event = parseSseEvent(buffer);
        if (event) {
          if (event.id) lastEventId = event.id;
          onEvent(event);
        }
      }
      return;
    } catch (err) {
      if (signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
        return;
      }
      attempt += 1;
      if (attempt > MAX_STREAM_RECONNECT_ATTEMPTS) {
        throw err;
      }
      await wait(STREAM_RECONNECT_BASE_DELAY_MS * attempt);
    }
  }
};

export const getDocuments = async () => {
  const response = await client.get('/ai/knowledge/documents');
  return response.data;
};

export interface UploadDocumentResponse {
  jobId: string;
}

export const uploadDocument = async (file: File): Promise<UploadDocumentResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await client.post<UploadDocumentResponse>('/ai/knowledge/jobs', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const subscribeIngestJob = (
  jobId: string,
  callbacks: { onDone?: () => void; onError?: (error: string) => void },
): (() => void) => {
  const controller = new AbortController();
  let isClosed = false;

  const close = () => {
    if (isClosed) return;
    isClosed = true;
    controller.abort();
  };

  const handleEvent = (event: ParsedSseEvent): boolean => {
    if (event.type === 'done') {
      close();
      callbacks.onDone?.();
      return true;
    } else if (event.type === 'error') {
      close();
      let errorMessage = '인제스트 처리 중 오류가 발생했습니다.';
      if (typeof event.data === 'string') {
        errorMessage = event.data;
      } else if (event.data && typeof event.data === 'object') {
        const dataObj = event.data as Record<string, unknown>;
        if (typeof dataObj.error === 'string') {
          errorMessage = dataObj.error;
        } else if (typeof dataObj.message === 'string') {
          errorMessage = dataObj.message;
        }
      }
      callbacks.onError?.(errorMessage);
      return true;
    }
    return false;
  };

  connectJobStream(jobId, handleEvent, controller.signal).catch((err: unknown) => {
    if (isClosed || (err instanceof DOMException && err.name === 'AbortError')) {
      return;
    }
    close();
    const message = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
    callbacks.onError?.(message);
  });

  return close;
};

export const deleteDocument = async (id: string) => {
  const response = await client.delete(`/ai/knowledge/documents/${id}`);
  return response.data;
};

export interface MyPromptOut {
  id: string | null;
  name: string;
  version: number;
  content: string;
  isActive: boolean;
  userId?: string | null;
  createdAt: string;
}

export const getMyPrompt = async (): Promise<MyPromptOut> => {
  const response = await client.get('/ai/my-prompt');
  return response.data;
};

export const saveMyPrompt = async (content: string): Promise<MyPromptOut> => {
  const response = await client.post('/ai/my-prompt', { content });
  return response.data;
};

export const resetMyPrompt = async (): Promise<void> => {
  await client.delete('/ai/my-prompt');
};

export interface SourceRef {
  fileName: string;
  chunkIndex: number;
  documentId: string;
  snippet?: string;
  score?: number;
}

export type AgentPhase = 'searching' | 'generating' | 'critiquing' | 'refining';

export interface AgentProgress {
  iteration: number;
  phase: AgentPhase;
  confidence?: number;
  missing?: string[];
}

export interface SessionOut {
  sessionId: string;
  title: string;
  updatedAt: string;
}

export interface SessionTurn {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  sources?: SourceRef[];
  confidence?: number;
  missing?: string[];
}

export interface SessionDetailOut {
  sessionId: string;
  title: string;
  turns: SessionTurn[];
  createdAt: string;
  updatedAt: string;
}

export const getSessions = async (userId: string, page = 1, limit = 20): Promise<SessionOut[]> => {
  const response = await client.get('/ai/rag/sessions', { params: { userId, page, limit } });
  return response.data ?? [];
};

export const getSessionDetail = async (sessionId: string): Promise<SessionDetailOut | null> => {
  const response = await client.get(`/ai/rag/sessions/${sessionId}`);
  return response.data ?? null;
};

export const deleteSessionById = async (sessionId: string): Promise<void> => {
  await client.delete(`/ai/rag/sessions/${sessionId}`);
};

/** 답변 평가.
 *
 * 답변에는 고유 식별자가 없다. 세션 안 턴 위치(`turnIndex`)로 지목한다 —
 * 턴은 덧붙이기만 하므로 나중에 위치가 밀리지 않는다.
 */
export interface AnswerFeedbackOut {
  sessionId: string;
  turnIndex: number;
  accuracy: number;
  helpfulness: number;
  comment?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubmitAnswerFeedbackIn {
  sessionId: string;
  turnIndex: number;
  accuracy: number;
  helpfulness: number;
  comment?: string;
}

/** 평가 제출. 이미 평가한 답변이면 갱신된다. */
export const submitAnswerFeedback = async (
  input: SubmitAnswerFeedbackIn,
): Promise<AnswerFeedbackOut> => {
  const response = await client.post('/ai/feedback', input);
  return response.data;
};

/** 한 세션에서 내가 남긴 평가 전부. */
export const getSessionFeedback = async (
  sessionId: string,
): Promise<AnswerFeedbackOut[]> => {
  const response = await client.get('/ai/feedback', { params: { sessionId } });
  return response.data ?? [];
};

/** 답변 근거로 인용된 문서의 원본 파일을 blob으로 받아온다. */
export const getDocumentFile = async (documentId: string): Promise<Blob> => {
  const response = await client.get(`/ai/knowledge/documents/${documentId}/file`, {
    responseType: 'blob',
  });
  return response.data;
};

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface JobAcceptedOut {
  jobId: string;
}

export interface AskQuestionStreamHandle extends Promise<void> {
  cancel?: () => Promise<void>;
}

export const askQuestionStream = (
  question: string,
  onMessage: (text: string) => void,
  onDone: (finalMeta?: { confidence?: number; missing?: string[] }) => void,
  onError: (err: unknown) => void,
  _userId?: string | null,
  chatLog?: Array<{ sender: string; text: string }>,
  onSources?: (sources: SourceRef[]) => void,
  sessionId?: string | null,
  onSessionId?: (id: string) => void,
  onProgress?: (progress: AgentProgress) => void,
): AskQuestionStreamHandle => {
  const controller = new AbortController();
  let isCancelled = false;
  let activeJobId: string | null = null;

  const cancel = async (): Promise<void> => {
    if (isCancelled) return;
    isCancelled = true;
    controller.abort();

    const jobIdToDelete = activeJobId;
    if (jobIdToDelete) {
      try {
        await client.delete(`/ai/jobs/${jobIdToDelete}`);
      } catch {
        // 취소 요청 실패는 무시 (이미 끝난 작업 등)
      }
    }
  };

  const run = async () => {
    try {
      const conversationHistory: ConversationTurn[] = (chatLog ?? []).map((m) => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text,
      }));

      const idempotencyKey = createIdempotencyKey();
      const body: Record<string, unknown> = { question, idempotencyKey };
      if (conversationHistory.length > 0) body.conversationHistory = conversationHistory;
      if (sessionId) body.sessionId = sessionId;

      const { data: job } = await client.post<JobAcceptedOut>('/ai/rag/jobs', body);
      activeJobId = job.jobId;

      if (isCancelled) {
        try {
          await client.delete(`/ai/jobs/${job.jobId}`);
        } catch {
          // 취소 요청 실패 무시
        }
        return;
      }

      let completed = false;

      const handleEvent = (event: ParsedSseEvent): boolean => {
        if (event.type === 'session' && onSessionId) {
          onSessionId(event.data as string);
        } else if (event.type === 'sources' && onSources) {
          onSources(event.data as SourceRef[]);
        } else if (event.type === 'progress' && onProgress) {
          let progressData = event.data as AgentProgress;
          if (typeof event.data === 'string') {
            try {
              progressData = JSON.parse(event.data) as AgentProgress;
            } catch {
              // 파싱 실패 시 무시
            }
          }
          if (progressData && typeof progressData === 'object') {
            onProgress(progressData);
          }
        } else if (event.type === 'token') {
          onMessage(event.data as string);
        } else if (event.type === 'done') {
          completed = true;
          let finalMeta: { confidence?: number; missing?: string[] } | undefined = undefined;
          if (event.data) {
            if (typeof event.data === 'string') {
              try {
                finalMeta = JSON.parse(event.data);
              } catch {
                // 파싱 실패 시 무시
              }
            } else if (typeof event.data === 'object') {
              finalMeta = event.data as { confidence?: number; missing?: string[] };
            }
          }
          onDone(finalMeta);
          return true;
        } else if (event.type === 'error') {
          completed = true;
          onError(new Error((event.data as string) ?? '알 수 없는 오류'));
          return true;
        }
        return false;
      };

      await connectJobStream(job.jobId, handleEvent, controller.signal);
      if (!completed && !isCancelled) {
        onDone();
      }
    } catch (error) {
      if (isCancelled || (error instanceof DOMException && error.name === 'AbortError')) {
        return;
      }
      onError(error);
    }
  };

  const runPromise = run();
  (runPromise as AskQuestionStreamHandle).cancel = cancel;

  return runPromise as AskQuestionStreamHandle;
};
