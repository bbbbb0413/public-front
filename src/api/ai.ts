import axios from 'axios';

if (import.meta.env.PROD && !import.meta.env.VITE_AI_API_BASE_URL) {
  console.warn('[ai] VITE_AI_API_BASE_URL is not set — falling back to localhost:3004');
}

const aiClient = axios.create({
  baseURL: import.meta.env.VITE_AI_API_BASE_URL || 'http://localhost:3004',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const getDocuments = async () => {
  const response = await aiClient.get('/knowledge/documents');
  return response.data;
};

export const uploadDocument = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await aiClient.post('/knowledge/documents', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const deleteDocument = async (id: string) => {
  const response = await aiClient.delete(`/knowledge/documents/${id}`);
  return response.data;
};

export interface SourceRef {
  fileName: string;
  chunkIndex: number;
  documentId: string;
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
  const response = await aiClient.get('/qa/sessions', { params: { userId, page, limit } });
  return response.data ?? [];
};

export const getSessionDetail = async (sessionId: string): Promise<SessionDetailOut | null> => {
  const response = await aiClient.get(`/qa/sessions/${sessionId}`);
  return response.data ?? null;
};

export const deleteSessionById = async (sessionId: string): Promise<void> => {
  await aiClient.delete(`/qa/sessions/${sessionId}`);
};

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export const askQuestionStream = async (
  question: string,
  onMessage: (text: string) => void,
  onDone: () => void,
  onError: (err: unknown) => void,
  userId?: string | null,
  chatLog?: Array<{ sender: string; text: string }>,
  onSources?: (sources: SourceRef[]) => void,
  sessionId?: string | null,
  onSessionId?: (id: string) => void,
) => {
  const baseUrl = import.meta.env.VITE_AI_API_BASE_URL || 'http://localhost:3004';
  try {
    const conversationHistory: ConversationTurn[] = (chatLog ?? []).map((m) => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));

    const body: Record<string, unknown> = { question };
    if (userId) body.userId = userId;
    if (conversationHistory.length > 0) body.conversationHistory = conversationHistory;
    if (sessionId) body.sessionId = sessionId;
    const response = await fetch(`${baseUrl}/qa/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const newSessionId = response.headers.get('X-Session-Id');
    if (newSessionId && onSessionId) {
      onSessionId(newSessionId);
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
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('data:')) {
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') {
            onDone();
            return;
          }

          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.type === 'sources' && onSources) {
              onSources(parsed.sources as SourceRef[]);
            } else if (parsed.text) {
              onMessage(parsed.text);
            }
          } catch {
            // JSON 파싱 실패 시 무시
          }
        }
      }
    }

    if (buffer.trim().startsWith('data:')) {
      const dataStr = buffer.trim().slice(5).trim();
      if (dataStr === '[DONE]') {
        onDone();
        return;
      }

      try {
        const parsed = JSON.parse(dataStr);
        if (parsed.type === 'sources' && onSources) {
          onSources(parsed.sources as SourceRef[]);
        } else if (parsed.text) {
          onMessage(parsed.text);
        }
      } catch {
        // JSON 파싱 실패 시 무시
      }
    }
    onDone();
  } catch (error) {
    onError(error);
  }
};
