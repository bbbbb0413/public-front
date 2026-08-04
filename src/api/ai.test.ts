import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { getDocuments, uploadDocument, deleteDocument, askQuestionStream } from './ai';

vi.mock('axios', () => {
  return {
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
  };
});

describe('AI Service API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('getDocuments should fetch list of documents', async () => {
    const mockDocs = [
      { id: '1', fileName: 'test1.txt', status: 'processed', chunkCount: 5, createdAt: '2026-06-18T00:00:00.000Z' },
    ];
    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockDocs });

    const result = await getDocuments();
    expect(axios.get).toHaveBeenCalledWith('/knowledge/documents');
    expect(result).toEqual(mockDocs);
  });

  it('uploadDocument should upload a file via multipart/form-data', async () => {
    const mockResponse = { id: '2', fileName: 'upload.txt', status: 'processed' };
    vi.mocked(axios.post).mockResolvedValueOnce({ data: mockResponse });

    const file = new File(['hello world'], 'upload.txt', { type: 'text/plain' });
    const result = await uploadDocument(file);

    expect(axios.post).toHaveBeenCalledWith('/knowledge/documents', expect.any(FormData), {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    expect(result).toEqual(mockResponse);
  });

  it('deleteDocument should delete a document by id', async () => {
    vi.mocked(axios.delete).mockResolvedValueOnce({ data: { success: true } });

    await deleteDocument('doc-123');
    expect(axios.delete).toHaveBeenCalledWith('/knowledge/documents/doc-123');
  });

  it('askQuestionStream should fetch SSE stream and call callbacks', async () => {
    const onMessage = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    // ReadableStream Mock 생성
    const mockChunks = [
      'data: {"text": "Hello"}\n\n',
      'data: {"text": " world"}\n\n',
      'data: [DONE]\n\n',
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

    await askQuestionStream('Test question', onMessage, onDone, onError);

    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:3004/qa/ask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question: 'Test question' }),
    });

    // 비동기 스트림 소비 완료 대기
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onMessage).toHaveBeenCalledTimes(2);
    expect(onMessage).toHaveBeenNthCalledWith(1, 'Hello');
    expect(onMessage).toHaveBeenNthCalledWith(2, ' world');
    expect(onDone).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
