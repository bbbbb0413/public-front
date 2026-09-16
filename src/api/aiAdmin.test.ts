import { describe, it, expect, vi, beforeEach } from 'vitest';
import adminClient from './adminClient';
import {
  createPrompt,
  createUserPrompt,
  getUserActivePrompt,
  getPromptVersions,
  getActivePrompt,
  activatePromptVersion,
  getLlmCosts,
  getCircuitBreakers,
  getRagasEvals,
} from './aiAdmin';

vi.mock('./adminClient', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
  adminClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

const mockClient = adminClient as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
};

describe('aiAdmin API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createPrompt는 템플릿 변수를 추출하여 adminClient.post를 호출한다', async () => {
    const mockPrompt = {
      id: 'p-1',
      name: 'rag-qa',
      version: 1,
      content: 'Hello {{context}} today is {{currentDate}}',
      isActive: true,
      createdAt: '2026-09-17T00:00:00Z',
    };
    mockClient.post.mockResolvedValueOnce({ data: mockPrompt });

    const result = await createPrompt('rag-qa', 'Hello {{context}} today is {{currentDate}}', 'user-1');

    expect(mockClient.post).toHaveBeenCalledWith('/ai/prompts', {
      name: 'rag-qa',
      content: 'Hello {{context}} today is {{currentDate}}',
      variables: ['context', 'currentDate'],
      userId: 'user-1',
    });
    expect(result).toEqual(mockPrompt);
  });

  it('createUserPrompt는 createPrompt를 사용자 id와 함께 위임 호출한다', async () => {
    const mockPrompt = {
      id: 'p-2',
      name: 'my-prompt',
      version: 1,
      content: 'Custom',
      isActive: true,
      userId: 'user-2',
      createdAt: '2026-09-17T00:00:00Z',
    };
    mockClient.post.mockResolvedValueOnce({ data: mockPrompt });

    const result = await createUserPrompt('user-2', 'my-prompt', 'Custom');

    expect(mockClient.post).toHaveBeenCalledWith('/ai/prompts', {
      name: 'my-prompt',
      content: 'Custom',
      variables: [],
      userId: 'user-2',
    });
    expect(result).toEqual(mockPrompt);
  });

  it('getUserActivePrompt는 adminClient.get으로 사용자 활성 프롬프트를 조회한다', async () => {
    const mockPrompt = {
      id: 'p-3',
      name: 'rag-qa',
      version: 2,
      content: 'Active user prompt',
      isActive: true,
      userId: 'user-1',
      createdAt: '2026-09-17T00:00:00Z',
    };
    mockClient.get.mockResolvedValueOnce({ data: mockPrompt });

    const result = await getUserActivePrompt('rag-qa', 'user-1');

    expect(mockClient.get).toHaveBeenCalledWith('/ai/prompts/rag-qa/active', {
      params: { userId: 'user-1' },
    });
    expect(result).toEqual(mockPrompt);
  });

  it('getPromptVersions는 adminClient.get으로 프롬프트 버전 목록을 조회한다', async () => {
    const mockVersions = [
      { id: 'p-1', name: 'rag-qa', version: 1, content: 'v1', isActive: false, createdAt: '2026-09-17T00:00:00Z' },
      { id: 'p-2', name: 'rag-qa', version: 2, content: 'v2', isActive: true, createdAt: '2026-09-17T00:00:00Z' },
    ];
    mockClient.get.mockResolvedValueOnce({ data: mockVersions });

    const result = await getPromptVersions('rag-qa');

    expect(mockClient.get).toHaveBeenCalledWith('/ai/prompts/rag-qa');
    expect(result).toEqual(mockVersions);
  });

  it('getActivePrompt는 adminClient.get으로 시스템 활성 프롬프트를 조회한다', async () => {
    const mockPrompt = {
      id: 'p-2',
      name: 'rag-qa',
      version: 2,
      content: 'v2',
      isActive: true,
      createdAt: '2026-09-17T00:00:00Z',
    };
    mockClient.get.mockResolvedValueOnce({ data: mockPrompt });

    const result = await getActivePrompt('rag-qa');

    expect(mockClient.get).toHaveBeenCalledWith('/ai/prompts/rag-qa/active');
    expect(result).toEqual(mockPrompt);
  });

  it('activatePromptVersion은 adminClient.patch로 지정 버전을 활성화한다', async () => {
    const mockPrompt = {
      id: 'p-1',
      name: 'rag-qa',
      version: 1,
      content: 'v1',
      isActive: true,
      createdAt: '2026-09-17T00:00:00Z',
    };
    mockClient.patch.mockResolvedValueOnce({ data: mockPrompt });

    const result = await activatePromptVersion('rag-qa', 1);

    expect(mockClient.patch).toHaveBeenCalledWith('/ai/prompts/rag-qa/1/activate');
    expect(result).toEqual(mockPrompt);
  });

  it('getLlmCosts는 adminClient.get으로 비용 목록을 조회한다', async () => {
    const mockCosts = [{ model: 'gpt-4o', totalCostUsd: 1.25 }];
    mockClient.get.mockResolvedValueOnce({ data: { items: mockCosts } });

    const result = await getLlmCosts();

    expect(mockClient.get).toHaveBeenCalledWith('/ai/llm-gateway/costs');
    expect(result).toEqual(mockCosts);
  });

  it('getCircuitBreakers는 adminClient.get으로 서킷 브레이커 목록을 조회한다', async () => {
    const mockBreakers = [
      { model: 'gpt-4o', status: 'CLOSED', failureCount: 0, openedAt: null },
    ];
    mockClient.get.mockResolvedValueOnce({ data: mockBreakers });

    const result = await getCircuitBreakers();

    expect(mockClient.get).toHaveBeenCalledWith('/ai/llm-gateway/breakers');
    expect(result).toEqual(mockBreakers);
  });

  it('getRagasEvals는 adminClient.get으로 Ragas 평가 목록을 조회한다', async () => {
    const mockEvals = [
      {
        traceId: 'tr-1',
        question: 'q1',
        faithfulness: 0.9,
        answerRelevancy: 0.85,
        contextPrecision: 0.95,
        sampledAt: '2026-09-17T00:00:00Z',
      },
    ];
    mockClient.get.mockResolvedValueOnce({ data: { data: mockEvals } });

    const result = await getRagasEvals(50);

    expect(mockClient.get).toHaveBeenCalledWith('/ai/observability/ragas-evals', {
      params: { limit: 50 },
    });
    expect(result).toEqual(mockEvals);
  });
});
