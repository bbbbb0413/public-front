import client from './client';

const GATEWAY_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export const getDocuments = async () => {
  const response = await client.get('/ai/knowledge/documents');
  return response.data;
};

export const uploadDocument = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await client.post('/ai/knowledge/jobs', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const deleteDocument = async (id: string) => {
  const response = await client.delete(`/ai/knowledge/documents/${id}`);
  return response.data;
};

export interface SourceRef {
  fileName: string;
  chunkIndex: number;
  documentId: string;
  snippet?: string;
}

export type AgentPhase = 'searching' | 'generating' | 'critiquing' | 'refining';

export interface AgentProgress {
  iteration: number;
  phase: AgentPhase;
  confidence: number;
  missing: string[];
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

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface JobAcceptedOut {
  jobId: string;
}

export const cancelJob = async (jobId: string): Promise<void> => {
  try {
    await client.delete(`/ai/jobs/${jobId}`);
  } catch {
    // 중단 요청 실패는 조용히 무시 (화면은 이미 중단 처리됨)
  }
};

export interface AskStreamPromise extends Promise<void> {
  cancel?: () => Promise<void>;
}

const parseSseEvent = (block: string): { type: string; data: unknown } | null => {
  const dataLine = block.split('\n').find((line) => line.startsWith('data:'));
  if (!dataLine) return null;
  try {
    return JSON.parse(dataLine.slice(5).trim());
  } catch {
    return null;
  }
};

export const askQuestionStream = (
  question: string,
  onMessage: (text: string) => void,
  onDone: () => void,
  onError: (err: unknown) => void,
  _userId?: string | null,
  chatLog?: Array<{ sender: string; text: string }>,
  onSources?: (sources: SourceRef[]) => void,
  sessionId?: string | null,
  onSessionId?: (id: string) => void,
  onProgress?: (progress: AgentProgress) => void,
): AskStreamPromise => {
  let currentJobId: string | null = null;
  const abortController = new AbortController();
  let isCancelled = false;

  const cancel = async (): Promise<void> => {
    isCancelled = true;
    abortController.abort();
    if (currentJobId) {
      await cancelJob(currentJobId);
    }
  };

  const execute = async () => {
    try {
      const conversationHistory: ConversationTurn[] = (chatLog ?? []).map((m) => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text,
      }));

      const body: Record<string, unknown> = { question };
      if (conversationHistory.length > 0) body.conversationHistory = conversationHistory;
      if (sessionId) body.sessionId = sessionId;

      if (isCancelled) return;

      const { data: job } = await client.post<JobAcceptedOut>('/ai/rag/jobs', body);
      currentJobId = job.jobId;

      if (isCancelled) {
        await cancelJob(currentJobId);
        return;
      }

      const token = localStorage.getItem('token');
      const response = await fetch(`${GATEWAY_BASE_URL}/ai/jobs/${job.jobId}/stream`, {
        method: 'GET',
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
          Accept: 'text/event-stream',
        },
        signal: abortController.signal,
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

      const handleBlock = (block: string): boolean => {
        const event = parseSseEvent(block);
        if (!event) return false;

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
          onDone();
          return true;
        } else if (event.type === 'error') {
          onError(new Error((event.data as string) ?? '알 수 없는 오류'));
          return true;
        }
        return false;
      };

      while (true) {
        if (isCancelled) {
          try {
            await reader.cancel();
          } catch {
            // 무시
          }
          break;
        }

        let readResult: ReadableStreamReadResult<Uint8Array>;
        try {
          readResult = await reader.read();
        } catch (err: unknown) {
          if (isCancelled || (err instanceof Error && err.name === 'AbortError')) {
            break;
          }
          throw err;
        }

        const { value, done } = readResult;
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          if (!block.trim()) continue;
          if (handleBlock(block)) return;
        }
      }

      if (isCancelled) return;

      if (buffer.trim()) {
        handleBlock(buffer);
      } else {
        onDone();
      }
    } catch (error: unknown) {
      if (isCancelled || (error instanceof Error && error.name === 'AbortError')) {
        return;
      }
      onError(error);
    }
  };

  const promise = execute() as AskStreamPromise;
  promise.cancel = cancel;
  return promise;
};

export const streamAsk = askQuestionStream;
