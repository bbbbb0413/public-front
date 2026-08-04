import axios from 'axios';

if (import.meta.env.PROD && !import.meta.env.VITE_AI_API_BASE_URL) {
  console.warn('[aiAdmin] VITE_AI_API_BASE_URL is not set — falling back to localhost:3004');
}

const aiClient = axios.create({
  baseURL: import.meta.env.VITE_AI_API_BASE_URL || 'http://localhost:3004',
  headers: { 'Content-Type': 'application/json' },
});

aiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface Prompt {
  id: number;
  name: string;
  version: number;
  content: string;
  isActive: boolean;
  userId?: string;
  createdAt: string;
}

export interface LlmCost {
  model: string;
  totalCost: number;
  totalTokens: number;
  requestCount: number;
}

export interface CircuitBreaker {
  model: string;
  status: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  openedAt: string | null;
}

export const createPrompt = async (
  name: string,
  content: string,
  userId?: string,
): Promise<Prompt> => {
  const variables = [...new Set(Array.from(content.matchAll(/\{\{(\w+)\}\}/g), (m) => m[1]))];
  const res = await aiClient.post('/prompts', { name, content, variables, userId });
  return res.data?.data;
};

export const createUserPrompt = async (
  userId: string,
  name: string,
  content: string,
): Promise<Prompt> => createPrompt(name, content, userId);

export const getUserActivePrompt = async (name: string, userId: string): Promise<Prompt> => {
  const res = await aiClient.get(`/prompts/${name}/active`, { params: { userId } });
  return res.data?.data;
};

export const getPromptVersions = async (name: string): Promise<Prompt[]> => {
  const res = await aiClient.get(`/prompts/${name}`);
  return res.data?.data ?? [];
};

export const getActivePrompt = async (name: string): Promise<Prompt> => {
  const res = await aiClient.get(`/prompts/${name}/active`);
  return res.data?.data;
};

export const activatePromptVersion = async (name: string, version: number): Promise<Prompt> => {
  const res = await aiClient.patch(`/prompts/${name}/${version}/activate`);
  return res.data?.data;
};

export const getLlmCosts = async (): Promise<LlmCost[]> => {
  const res = await aiClient.get('/llm-gateway/costs');
  return res.data?.data ?? [];
};

export const getCircuitBreakers = async (): Promise<CircuitBreaker[]> => {
  const res = await aiClient.get('/llm-gateway/breakers');
  return res.data?.data ?? [];
};

export interface RagasEval {
  traceId: string;
  question: string;
  faithfulness: number;
  answerRelevancy: number;
  contextPrecision: number;
  sampledAt: string;
}

export interface QueueStat {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}

export interface QueueStatus {
  ingest: QueueStat;
  'ragas-eval': QueueStat;
}

export const getRagasEvals = async (limit = 20): Promise<RagasEval[]> => {
  const res = await aiClient.get('/observability/ragas-evals', { params: { limit } });
  return res.data?.data ?? [];
};

export const getQueueStatus = async (): Promise<QueueStatus> => {
  const res = await aiClient.get('/observability/queues');
  return res.data?.data;
};
