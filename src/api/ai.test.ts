import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';

vi.mock('axios', () => ({
  default: {
    create: vi.fn().mockReturnThis(),
    interceptors: {
      request: { use: vi.fn(), eject: vi.fn() },
      response: { use: vi.fn(), eject: vi.fn() },
    },
    post: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import {
  getDocuments,
  uploadDocument,
  deleteDocument,
  askQuestionStream,
  getSessions,
  getSessionDetail,
  deleteSessionById,
  subscribeIngestJob,
  getMyPrompt,
  getMyPromptList,
  saveMyPrompt,
  activateMyPrompt,
  resetMyPrompt,
  deleteMyPromptVersion,
} from './ai';

const mockAxios = axios as unknown as {
  post: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

describe('AI Service API (Gateway 경유)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('getDocuments should fetch list of documents via gateway', async () => {
    const mockDocs = [
      { id: '1', fileName: 'test1.txt', status: 'processed', chunkCount: 5, createdAt: '2026-06-18T00:00:00.000Z' },
    ];
    mockAxios.get.mockResolvedValueOnce({ data: mockDocs });

    const result = await getDocuments();
    expect(mockAxios.get).toHaveBeenCalledWith('/ai/knowledge/documents');
    expect(result).toEqual(mockDocs);
  });

  it('uploadDocument should upload a file via multipart/form-data to the knowledge job endpoint', async () => {
    const mockResponse = { jobId: 'job-1' };
    mockAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const file = new File(['hello world'], 'upload.txt', { type: 'text/plain' });
    const result = await uploadDocument(file);

    expect(mockAxios.post).toHaveBeenCalledWith('/ai/knowledge/jobs', expect.any(FormData), {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    expect(result).toEqual(mockResponse);
  });

  it('deleteDocument should delete a document by id via gateway', async () => {
    mockAxios.delete.mockResolvedValueOnce({ data: undefined });

    await deleteDocument('doc-123');
    expect(mockAxios.delete).toHaveBeenCalledWith('/ai/knowledge/documents/doc-123');
  });

  it('getSessions should fetch sessions via gateway', async () => {
    const mockSessions = [{ sessionId: 's1', title: 'hi', updatedAt: '2026-06-18T00:00:00.000Z' }];
    mockAxios.get.mockResolvedValueOnce({ data: mockSessions });

    const result = await getSessions('user-1');
    expect(mockAxios.get).toHaveBeenCalledWith('/ai/rag/sessions', {
      params: { userId: 'user-1', page: 1, limit: 20 },
    });
    expect(result).toEqual(mockSessions);
  });

  it('getSessionDetail should fetch a session by id via gateway', async () => {
    const mockDetail = {
      sessionId: 's1',
      title: 'hi',
      turns: [
        {
          role: 'user' as const,
          content: '질문',
          createdAt: '2026-08-25T01:00:00Z',
        },
        {
          role: 'assistant' as const,
          content: '답변',
          createdAt: '2026-08-25T01:00:01Z',
          confidence: 0.9,
          missing: ['정보1'],
          sources: [
            { fileName: 'doc.pdf', chunkIndex: 0, documentId: 'd1', snippet: '스니펫' },
          ],
        },
      ],
      createdAt: 'x',
      updatedAt: 'x',
    };
    mockAxios.get.mockResolvedValueOnce({ data: mockDetail });

    const result = await getSessionDetail('s1');
    expect(mockAxios.get).toHaveBeenCalledWith('/ai/rag/sessions/s1');
    expect(result).toEqual(mockDetail);
  });

  it('deleteSessionById should delete a session via gateway', async () => {
    mockAxios.delete.mockResolvedValueOnce({ data: undefined });

    await deleteSessionById('s1');
    expect(mockAxios.delete).toHaveBeenCalledWith('/ai/rag/sessions/s1');
  });

  it('subscribeIngestJob should connect to SSE stream and invoke onDone when done event is received', async () => {
    const onDone = vi.fn();
    const onError = vi.fn();

    const mockChunks = [
      'id: 1\ndata: {"type":"progress","data":"processing"}\n\n',
      'id: 2\ndata: {"type":"done","data":{"documentId":"doc-1"}}\n\n',
    ];

    const stream = new ReadableStream({
      start(controller) {
        mockChunks.forEach((chunk) => {
          controller.enqueue(new TextEncoder().encode(chunk));
        });
        controller.close();
      },
    });

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue('jwt-token') });

    const unsubscribe = subscribeIngestJob('job-ingest-1', { onDone, onError });

    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:3000/ai/jobs/job-ingest-1/stream', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer jwt-token',
        Accept: 'text/event-stream',
      },
      signal: expect.any(AbortSignal),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(typeof unsubscribe).toBe('function');
  });

  it('subscribeIngestJob should invoke onProgress when progress event is received', async () => {
    const onDone = vi.fn();
    const onError = vi.fn();
    const onProgress = vi.fn();

    const mockChunks = [
      'id: 1\ndata: {"type":"progress","data":{"step":"extract","progress":25}}\n\n',
      'id: 2\ndata: {"type":"done","data":{"documentId":"doc-1"}}\n\n',
    ];

    const stream = new ReadableStream({
      start(controller) {
        mockChunks.forEach((chunk) => {
          controller.enqueue(new TextEncoder().encode(chunk));
        });
        controller.close();
      },
    });

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue('jwt-token') });

    subscribeIngestJob('job-ingest-progress', { onDone, onError, onProgress });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onProgress).toHaveBeenCalledWith({ step: 'extract', progress: 25 });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('subscribeIngestJob should invoke onError when error event is received with object payload', async () => {
    const onDone = vi.fn();
    const onError = vi.fn();

    const mockChunks = [
      'id: 1\ndata: {"type":"error","data":{"error":"파싱 실패"}}\n\n',
    ];

    const stream = new ReadableStream({
      start(controller) {
        mockChunks.forEach((chunk) => {
          controller.enqueue(new TextEncoder().encode(chunk));
        });
        controller.close();
      },
    });

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue('jwt-token') });

    subscribeIngestJob('job-ingest-err', { onDone, onError });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('파싱 실패');
  });

  it('subscribeIngestJob should invoke onError when error event is received with string payload', async () => {
    const onDone = vi.fn();
    const onError = vi.fn();

    const mockChunks = [
      'id: 1\ndata: {"type":"error","data":"인제스트 실패"}\n\n',
    ];

    const stream = new ReadableStream({
      start(controller) {
        mockChunks.forEach((chunk) => {
          controller.enqueue(new TextEncoder().encode(chunk));
        });
        controller.close();
      },
    });

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue('jwt-token') });

    subscribeIngestJob('job-ingest-err-str', { onDone, onError });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('인제스트 실패');
  });

  it('subscribeIngestJob unsubscribe should abort fetch stream', async () => {
    const onDone = vi.fn();
    const onError = vi.fn();

    const stream = new ReadableStream({
      start() {},
    });

    let abortSignal: AbortSignal | undefined;
    const fetchSpy = vi.fn().mockImplementation((_url, options) => {
      abortSignal = options?.signal;
      return Promise.resolve({
        ok: true,
        body: stream,
        headers: new Headers({ 'Content-Type': 'text/event-stream' }),
      });
    });
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue('jwt-token') });

    const unsubscribe = subscribeIngestJob('job-cancel', { onDone, onError });
    unsubscribe();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(abortSignal?.aborted).toBe(true);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('askQuestionStream should create a job then subscribe to the SSE stream and call callbacks', async () => {
    const onMessage = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    mockAxios.post.mockResolvedValueOnce({ data: { jobId: 'job-42' } });

    const mockChunks = [
      'id: 1\ndata: {"type":"token","data":"Hello"}\n\n',
      'id: 2\ndata: {"type":"token","data":" world"}\n\n',
      'id: 3\ndata: {"type":"done"}\n\n',
    ];

    const stream = new ReadableStream({
      start(controller) {
        mockChunks.forEach((chunk) => {
          controller.enqueue(new TextEncoder().encode(chunk));
        });
        controller.close();
      },
    });

    const mockResponse = {
      ok: true,
      body: stream,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    };

    const fetchSpy = vi.fn().mockResolvedValue(mockResponse);
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue('jwt-token') });

    await askQuestionStream('Test question', onMessage, onDone, onError);

    expect(mockAxios.post).toHaveBeenCalledWith('/ai/rag/jobs', {
      question: 'Test question',
      idempotencyKey: expect.any(String),
    });
    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:3000/ai/jobs/job-42/stream', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer jwt-token',
        Accept: 'text/event-stream',
      },
      signal: expect.any(AbortSignal),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onMessage).toHaveBeenCalledTimes(2);
    expect(onMessage).toHaveBeenNthCalledWith(1, 'Hello');
    expect(onMessage).toHaveBeenNthCalledWith(2, ' world');
    expect(onDone).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('askQuestionStream should call onError when the job stream emits an error event', async () => {
    const onMessage = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    mockAxios.post.mockResolvedValueOnce({ data: { jobId: 'job-err' } });

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('id: 1\ndata: {"type":"error","data":"boom"}\n\n'),
        );
        controller.close();
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, body: stream, headers: new Headers() }),
    );
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue('jwt-token') });

    await askQuestionStream('Test question', onMessage, onDone, onError);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(new Error('boom'));
  });

  it('askQuestionStream should call onProgress when progress events are received', async () => {
    const onMessage = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();
    const onProgress = vi.fn();

    mockAxios.post.mockResolvedValueOnce({ data: { jobId: 'job-progress' } });

    const mockChunks = [
      'id: 1\ndata: {"type":"progress","data":{"iteration":1,"phase":"searching","confidence":0,"missing":[]}}\n\n',
      'id: 2\ndata: {"type":"progress","data":"{\\"iteration\\":1,\\"phase\\":\\"generating\\",\\"confidence\\":0.8,\\"missing\\":[\\"누락정보\\"]}"}\n\n',
      'id: 3\ndata: {"type":"token","data":"응답 내용"}\n\n',
      'id: 4\ndata: {"type":"done"}\n\n',
    ];

    const stream = new ReadableStream({
      start(controller) {
        mockChunks.forEach((chunk) => {
          controller.enqueue(new TextEncoder().encode(chunk));
        });
        controller.close();
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, body: stream, headers: new Headers() }),
    );
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue('jwt-token') });

    await askQuestionStream(
      'Test question',
      onMessage,
      onDone,
      onError,
      null,
      [],
      undefined,
      null,
      undefined,
      onProgress,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, {
      iteration: 1,
      phase: 'searching',
      confidence: 0,
      missing: [],
    });
    expect(onProgress).toHaveBeenNthCalledWith(2, {
      iteration: 1,
      phase: 'generating',
      confidence: 0.8,
      missing: ['누락정보'],
    });
    expect(onMessage).toHaveBeenCalledWith('응답 내용');
    expect(onDone).toHaveBeenCalled();
  });

  it('askQuestionStream should ignore progress event if onProgress is not provided', async () => {
    const onMessage = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    mockAxios.post.mockResolvedValueOnce({ data: { jobId: 'job-progress-ignored' } });

    const mockChunks = [
      'id: 1\ndata: {"type":"progress","data":{"iteration":1,"phase":"searching","confidence":0,"missing":[]}}\n\n',
      'id: 2\ndata: {"type":"token","data":"응답 내용"}\n\n',
      'id: 3\ndata: {"type":"done"}\n\n',
    ];

    const stream = new ReadableStream({
      start(controller) {
        mockChunks.forEach((chunk) => {
          controller.enqueue(new TextEncoder().encode(chunk));
        });
        controller.close();
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, body: stream, headers: new Headers() }),
    );
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue('jwt-token') });

    await askQuestionStream('Test question', onMessage, onDone, onError);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onMessage).toHaveBeenCalledWith('응답 내용');
    expect(onDone).toHaveBeenCalled();
  });

  it('askQuestionStream should call onSources when sources events are received with snippet', async () => {
    const onMessage = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();
    const onSources = vi.fn();

    mockAxios.post.mockResolvedValueOnce({ data: { jobId: 'job-sources' } });

    const mockChunks = [
      'id: 1\ndata: {"type":"sources","data":[{"fileName":"sample.pdf","chunkIndex":0,"documentId":"doc-1","snippet":"마스킹된 본문 요약..."}]}\n\n',
      'id: 2\ndata: {"type":"token","data":"응답"}\n\n',
      'id: 3\ndata: {"type":"done"}\n\n',
    ];

    const stream = new ReadableStream({
      start(controller) {
        mockChunks.forEach((chunk) => {
          controller.enqueue(new TextEncoder().encode(chunk));
        });
        controller.close();
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, body: stream, headers: new Headers() }),
    );
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue('jwt-token') });

    await askQuestionStream(
      'Test question',
      onMessage,
      onDone,
      onError,
      null,
      [],
      onSources,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onSources).toHaveBeenCalledWith([
      {
        fileName: 'sample.pdf',
        chunkIndex: 0,
        documentId: 'doc-1',
        snippet: '마스킹된 본문 요약...',
      },
    ]);
    expect(onMessage).toHaveBeenCalledWith('응답');
    expect(onDone).toHaveBeenCalled();
  });

  it('askQuestionStream should pass final metadata to onDone when done event contains data', async () => {
    const onMessage = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    mockAxios.post.mockResolvedValueOnce({ data: { jobId: 'job-done-meta' } });

    const mockChunks = [
      'id: 1\ndata: {"type":"token","data":"응답 완료"}\n\n',
      'id: 2\ndata: {"type":"done","data":{"confidence":0.85,"missing":["추가 설명"]}}\n\n',
    ];

    const stream = new ReadableStream({
      start(controller) {
        mockChunks.forEach((chunk) => {
          controller.enqueue(new TextEncoder().encode(chunk));
        });
        controller.close();
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, body: stream, headers: new Headers() }),
    );
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue('jwt-token') });

    await askQuestionStream('Test question', onMessage, onDone, onError);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onDone).toHaveBeenCalledWith({
      confidence: 0.85,
      missing: ['추가 설명'],
    });
  });

  it('askQuestionStream should parse stringified JSON in done event data and pass to onDone', async () => {
    const onMessage = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    mockAxios.post.mockResolvedValueOnce({ data: { jobId: 'job-done-meta-str' } });

    const mockChunks = [
      'id: 1\ndata: {"type":"done","data":"{\\"confidence\\":0.9,\\"missing\\":[]}"}\n\n',
    ];

    const stream = new ReadableStream({
      start(controller) {
        mockChunks.forEach((chunk) => {
          controller.enqueue(new TextEncoder().encode(chunk));
        });
        controller.close();
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, body: stream, headers: new Headers() }),
    );
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue('jwt-token') });

    await askQuestionStream('Test question', onMessage, onDone, onError);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onDone).toHaveBeenCalledWith({
      confidence: 0.9,
      missing: [],
    });
  });

  it('askQuestionStream should pass undefined to onDone when done event has no data or legacy response', async () => {
    const onMessage = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    mockAxios.post.mockResolvedValueOnce({ data: { jobId: 'job-done-empty' } });

    const mockChunks = [
      'id: 1\ndata: {"type":"done"}\n\n',
    ];

    const stream = new ReadableStream({
      start(controller) {
        mockChunks.forEach((chunk) => {
          controller.enqueue(new TextEncoder().encode(chunk));
        });
        controller.close();
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, body: stream, headers: new Headers() }),
    );
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue('jwt-token') });

    await askQuestionStream('Test question', onMessage, onDone, onError);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onDone).toHaveBeenCalledWith(undefined);
  });

  it('askQuestionStream should return a cancel function that aborts fetch and calls DELETE /ai/jobs/:jobId', async () => {
    const onMessage = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    mockAxios.post.mockResolvedValueOnce({ data: { jobId: 'job-to-cancel' } });
    mockAxios.delete.mockResolvedValueOnce({ data: { success: true } });

    const stream = new ReadableStream({
      start() {},
    });

    let abortSignal: AbortSignal | undefined;
    const fetchSpy = vi.fn().mockImplementation((_url, options) => {
      abortSignal = options?.signal;
      return Promise.resolve({
        ok: true,
        body: stream,
        headers: new Headers({ 'Content-Type': 'text/event-stream' }),
      });
    });
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue('jwt-token') });

    const handle = askQuestionStream('Question to cancel', onMessage, onDone, onError);

    // wait until fetch has been initiated
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handle).toBeDefined();
    expect(typeof handle.cancel).toBe('function');

    await handle.cancel!();

    expect(abortSignal?.aborted).toBe(true);
    expect(mockAxios.delete).toHaveBeenCalledWith('/ai/jobs/job-to-cancel');
  });

  it('askQuestionStream cancel before job resolution should abort without crashing', async () => {
    const onMessage = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    let resolveJob: (val: unknown) => void;
    mockAxios.post.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveJob = resolve;
      }),
    );
    mockAxios.delete.mockResolvedValueOnce({ data: { success: true } });

    const handle = askQuestionStream('Early cancel', onMessage, onDone, onError);

    const cancelPromise = handle.cancel!();
    resolveJob!({ data: { jobId: 'job-late' } });
    await cancelPromise;

    expect(mockAxios.delete).toHaveBeenCalledWith('/ai/jobs/job-late');
  });

  it('askQuestionStream reconnects with Last-Event-ID when the stream drops mid-way', async () => {
    vi.useFakeTimers();
    const onMessage = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    mockAxios.post.mockResolvedValueOnce({ data: { jobId: 'job-reconnect' } });

    const firstStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('id: 1\ndata: {"type":"token","data":"Hel"}\n\n'));
      },
      pull(controller) {
        // 첫 청크가 소비된 뒤 호출됨 — 이 시점에 연결이 끊긴 상황을 흉내낸다.
        controller.error(new Error('network drop'));
      },
    });

    const secondStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('id: 2\ndata: {"type":"token","data":"lo"}\n\n'));
        controller.enqueue(new TextEncoder().encode('id: 3\ndata: {"type":"done"}\n\n'));
        controller.close();
      },
    });

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, body: firstStream, headers: new Headers() })
      .mockResolvedValueOnce({ ok: true, body: secondStream, headers: new Headers() });
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue('jwt-token') });

    const promise = askQuestionStream('Test question', onMessage, onDone, onError);
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const secondCallHeaders = fetchSpy.mock.calls[1][1].headers as Record<string, string>;
    expect(secondCallHeaders['Last-Event-ID']).toBe('1');
    expect(onMessage).toHaveBeenNthCalledWith(1, 'Hel');
    expect(onMessage).toHaveBeenNthCalledWith(2, 'lo');
    expect(onDone).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  describe('Personal Prompt Management API (SPEC-026)', () => {
    it('getMyPromptList should fetch prompt list via GET /ai/my-prompt/list', async () => {
      const mockList = [
        { id: '1', name: 'rag-qa-system', version: 2, content: '프롬프트 2', isActive: true, userId: 'user-1', createdAt: '2026-09-03' },
        { id: '2', name: 'rag-qa-system', version: 1, content: '프롬프트 1', isActive: false, userId: 'user-1', createdAt: '2026-09-02' },
      ];
      mockAxios.get.mockResolvedValueOnce({ data: mockList });

      const result = await getMyPromptList();
      expect(mockAxios.get).toHaveBeenCalledWith('/ai/my-prompt/list');
      expect(result).toEqual(mockList);
    });

    it('saveMyPrompt should send content and activate option via POST /ai/my-prompt', async () => {
      const mockCreated = {
        id: '1',
        name: 'rag-qa-system',
        version: 1,
        content: '새 프롬프트',
        isActive: true,
        userId: 'user-1',
        createdAt: '2026-09-03',
      };
      mockAxios.post.mockResolvedValueOnce({ data: mockCreated });

      const result = await saveMyPrompt('새 프롬프트', true);
      expect(mockAxios.post).toHaveBeenCalledWith('/ai/my-prompt', { content: '새 프롬프트', activate: true });
      expect(result).toEqual(mockCreated);
    });

    it('activateMyPrompt should activate a specific version via PATCH /ai/my-prompt/:version/activate', async () => {
      const mockActivated = {
        id: '1',
        name: 'rag-qa-system',
        version: 3,
        content: '프롬프트 3',
        isActive: true,
        userId: 'user-1',
        createdAt: '2026-09-03',
      };
      mockAxios.patch = vi.fn().mockResolvedValueOnce({ data: mockActivated });

      const result = await activateMyPrompt(3);
      expect(mockAxios.patch).toHaveBeenCalledWith('/ai/my-prompt/3/activate');
      expect(result).toEqual(mockActivated);
    });

    it('getMyPrompt should fetch active prompt via GET /ai/my-prompt', async () => {
      const mockPrompt = {
        id: '1',
        name: 'rag-qa-system',
        version: 1,
        content: '기본 프롬프트',
        isActive: true,
        userId: null,
        createdAt: '2026-09-03',
      };
      mockAxios.get.mockResolvedValueOnce({ data: mockPrompt });

      const result = await getMyPrompt();
      expect(mockAxios.get).toHaveBeenCalledWith('/ai/my-prompt');
      expect(result).toEqual(mockPrompt);
    });

    it('resetMyPrompt should reset active prompt via DELETE /ai/my-prompt', async () => {
      mockAxios.delete.mockResolvedValueOnce({ data: undefined });

      await resetMyPrompt();
      expect(mockAxios.delete).toHaveBeenCalledWith('/ai/my-prompt');
    });

    it('deleteMyPromptVersion should delete a specific version via DELETE /ai/my-prompt/:version', async () => {
      mockAxios.delete.mockResolvedValueOnce({ data: undefined });

      await deleteMyPromptVersion(2);
      expect(mockAxios.delete).toHaveBeenCalledWith('/ai/my-prompt/2');
    });
  });
});

