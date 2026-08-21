import { describe, it, expect, vi, beforeEach } from 'vitest';
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
} from './ai';

const mockAxios = axios as unknown as {
  post: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

describe('AI Service API (Gateway 경유)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
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
    const mockDetail = { sessionId: 's1', title: 'hi', turns: [], createdAt: 'x', updatedAt: 'x' };
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

    expect(mockAxios.post).toHaveBeenCalledWith('/ai/rag/jobs', { question: 'Test question' });
    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:3000/ai/jobs/job-42/stream', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer jwt-token',
        Accept: 'text/event-stream',
      },
      signal: expect.any(Object),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onMessage).toHaveBeenCalledTimes(2);
    expect(onMessage).toHaveBeenNthCalledWith(1, 'Hello');
    expect(onMessage).toHaveBeenNthCalledWith(2, ' world');
    expect(onDone).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('cancelJob should send DELETE request to /ai/jobs/:jobId', async () => {
    mockAxios.delete.mockResolvedValueOnce({ data: undefined });

    const { cancelJob } = await import('./ai');
    await cancelJob('job-123');

    expect(mockAxios.delete).toHaveBeenCalledWith('/ai/jobs/job-123');
  });

  it('askQuestionStream should return abort function that calls cancelJob and aborts fetch stream', async () => {
    const onMessage = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    mockAxios.post.mockResolvedValueOnce({ data: { jobId: 'job-cancel-test' } });
    mockAxios.delete.mockResolvedValueOnce({ data: undefined });

    const stream = new ReadableStream({
      start() {
        // do not close immediately
      },
      cancel: vi.fn(),
    });

    const mockResponse = {
      ok: true,
      body: stream,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    };

    const fetchSpy = vi.fn().mockResolvedValue(mockResponse);
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue('jwt-token') });

    const streamControl = askQuestionStream('Test question', onMessage, onDone, onError);

    // Stream control should provide abort or cancel method
    expect(streamControl).toBeDefined();
    expect(typeof streamControl.abort).toBe('function');

    await streamControl.abort();

    expect(mockAxios.delete).toHaveBeenCalledWith('/ai/jobs/job-cancel-test');
  });
});

