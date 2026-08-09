import client from './client';

export interface Prompt {
  id: string;
  name: string;
  version: number;
  content: string;
  isActive: boolean;
  userId?: string;
  createdAt: string;
}

export interface LlmCost {
  model: string;
  totalCostUsd: number;
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
  const res = await client.post('/ai/prompts', { name, content, variables, userId });
  return res.data;
};

export const createUserPrompt = async (
  userId: string,
  name: string,
  content: string,
): Promise<Prompt> => createPrompt(name, content, userId);

export const getUserActivePrompt = async (name: string, userId: string): Promise<Prompt> => {
  const res = await client.get(`/ai/prompts/${name}/active`, { params: { userId } });
  return res.data;
};

export const getPromptVersions = async (name: string): Promise<Prompt[]> => {
  const res = await client.get(`/ai/prompts/${name}`);
  return res.data ?? [];
};

export const getActivePrompt = async (name: string): Promise<Prompt> => {
  const res = await client.get(`/ai/prompts/${name}/active`);
  return res.data;
};

export const activatePromptVersion = async (name: string, version: number): Promise<Prompt> => {
  const res = await client.patch(`/ai/prompts/${name}/${version}/activate`);
  return res.data;
};

export const getLlmCosts = async (): Promise<LlmCost[]> => {
  const res = await client.get('/ai/llm-gateway/costs');
  return res.data?.items ?? [];
};

export const getCircuitBreakers = async (): Promise<CircuitBreaker[]> => {
  const res = await client.get('/ai/llm-gateway/breakers');
  return res.data ?? [];
};

export interface RagasEval {
  traceId: string;
  question: string;
  faithfulness: number;
  answerRelevancy: number;
  contextPrecision: number;
  sampledAt: string;
}

export const getRagasEvals = async (limit = 20): Promise<RagasEval[]> => {
  const res = await client.get('/ai/observability/ragas-evals', { params: { limit } });
  return res.data?.data ?? [];
};
