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

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface JobAcceptedOut {
  jobId: string;
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

export const askQuestionStream = async (
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
) => {
  try {
    const conversationHistory: ConversationTurn[] = (chatLog ?? []).map((m) => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));

    const body: Record<string, unknown> = { question };
    if (conversationHistory.length > 0) body.conversationHistory = conversationHistory;
    if (sessionId) body.sessionId = sessionId;

    const { data: job } = await client.post<JobAcceptedOut>('/ai/rag/jobs', body);

    const token = localStorage.getItem('token');
    const response = await fetch(`${GATEWAY_BASE_URL}/ai/jobs/${job.jobId}/stream`, {
      method: 'GET',
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
        Accept: 'text/event-stream',
      },
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
        onError(new Error((event.data as string) ?? '알 수 없는 오류'));
        return true;
      }
      return false;
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() || '';

      for (const block of blocks) {
        if (!block.trim()) continue;
        if (handleBlock(block)) return;
      }
    }

    if (buffer.trim()) {
      handleBlock(buffer);
    } else {
      onDone();
    }
  } catch (error) {
    onError(error);
  }
};
