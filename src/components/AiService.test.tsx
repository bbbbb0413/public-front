import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { AiService } from './AiService';
import * as aiApi from '../api/ai';

vi.mock('../api/ai', () => {
  return {
    getDocuments: vi.fn(),
    uploadDocument: vi.fn(),
    deleteDocument: vi.fn(),
    askQuestionStream: vi.fn(),
    getSessions: vi.fn().mockResolvedValue([]),
    deleteSessionById: vi.fn(),
  };
});

describe('AiService Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('renders correctly and fetches documents on mount', async () => {
    const mockDocs = [
      { id: 'doc-1', fileName: 'manual.txt', status: 'processed', chunkCount: 3, createdAt: '2026-06-18T05:00:00Z' },
    ];
    vi.mocked(aiApi.getDocuments).mockResolvedValueOnce(mockDocs);

    await act(async () => {
      render(<AiService />);
    });

    expect(aiApi.getDocuments).toHaveBeenCalled();
    expect(screen.getByText('manual.txt')).toBeInTheDocument();
    expect(screen.getByText('processed')).toBeInTheDocument();
  });

  it('uploads a file and refreshes document list', async () => {
    vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
    vi.mocked(aiApi.uploadDocument).mockResolvedValueOnce({ id: 'doc-2', fileName: 'new.txt', status: 'processed' });

    await act(async () => {
      render(<AiService />);
    });

    const file = new File(['test'], 'new.txt', { type: 'text/plain' });
    const fileInput = screen.getByLabelText('file-upload-input');
    
    // 파일 업로드 처리 시뮬레이션
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(aiApi.uploadDocument).toHaveBeenCalledWith(file);
  });

  it('deletes a document and refreshes list', async () => {
    const mockDocs = [
      { id: 'doc-1', fileName: 'delete-me.txt', status: 'processed', chunkCount: 1, createdAt: '2026-06-18T05:00:00Z' },
    ];
    vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);
    vi.mocked(aiApi.deleteDocument).mockResolvedValueOnce({ success: true });

    await act(async () => {
      render(<AiService />);
    });

    const deleteBtn = screen.getByRole('button', { name: /삭제/i });
    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    expect(aiApi.deleteDocument).toHaveBeenCalledWith('doc-1');
  });

  it('sends question and displays streaming answer', async () => {
    vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
    
    // askQuestionStream 호출 시 onMessage 콜백을 수동으로 호출하는 모의 함수 구현
    vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((_question, onMessage, onDone, _onError, _userId, _chatLog, _onSources, _sessionId, _onSessionId) => {
      setTimeout(() => onMessage('안녕'), 10);
      setTimeout(() => onMessage('하세요'), 20);
      setTimeout(() => onDone(), 30);
      return Promise.resolve();
    });

    await act(async () => {
      render(<AiService />);
    });

    // 채팅 모달 열기 (입력창은 모달 내부에 있음)
    const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
    await act(async () => {
      fireEvent.click(chatOpenBtn);
    });

    const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
    const sendBtn = screen.getByRole('button', { name: /전송/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: '안녕하세요' } });
      fireEvent.click(sendBtn);
    });

    expect(aiApi.askQuestionStream).toHaveBeenCalledWith(
      '안녕하세요',
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      null,
      [],
      expect.any(Function),
      null,
      expect.any(Function),
    );

    // 비동기 콜백 진행 대기
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // 화면에 스트리밍된 답변이 누적 렌더링되었는지 확인
    expect(screen.getAllByText('안녕하세요').length).toBeGreaterThanOrEqual(2);
    
    // 답변이 누적된 문자열 확인
    const answerContainer = screen.getByTestId('chat-answer-content');
    expect(answerContainer.textContent).toContain('안녕하세요');
  });

  it('blocks uploading files larger than 10MB', async () => {
    vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

    await act(async () => {
      render(<AiService />);
    });

    const file = new File([new ArrayBuffer(11 * 1024 * 1024)], 'large.pdf', { type: 'application/pdf' });
    const fileInput = screen.getByLabelText('file-upload-input');

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(aiApi.uploadDocument).not.toHaveBeenCalled();
    expect(screen.getByText('파일 크기는 최대 10MB까지 허용됩니다.')).toBeInTheDocument();
  });

  it('blocks uploading unsupported file types', async () => {
    vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

    await act(async () => {
      render(<AiService />);
    });

    const file = new File(['test'], 'avatar.png', { type: 'image/png' });
    const fileInput = screen.getByLabelText('file-upload-input');

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(aiApi.uploadDocument).not.toHaveBeenCalled();
    expect(screen.getByText('지원하지 않는 파일 형식입니다. (TXT, PDF, MD 파일만 지원)')).toBeInTheDocument();
  });

  it('displays specific server error message when upload fails', async () => {
    vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
    const errorResponse = {
      response: {
        data: {
          message: '파일 크기가 10MB 제한을 초과했습니다.',
        },
      },
    };
    vi.mocked(aiApi.uploadDocument).mockRejectedValueOnce(errorResponse);

    await act(async () => {
      render(<AiService />);
    });

    const file = new File(['test'], 'manual.txt', { type: 'text/plain' });
    const fileInput = screen.getByLabelText('file-upload-input');

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(aiApi.uploadDocument).toHaveBeenCalledWith(file);
    expect(screen.getByText('파일 크기가 10MB 제한을 초과했습니다.')).toBeInTheDocument();
  });

  it('displays default error message if server message is not present', async () => {
    vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
    vi.mocked(aiApi.uploadDocument).mockRejectedValueOnce(new Error('Unknown error'));

    await act(async () => {
      render(<AiService />);
    });

    const file = new File(['test'], 'manual.txt', { type: 'text/plain' });
    const fileInput = screen.getByLabelText('file-upload-input');

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(aiApi.uploadDocument).toHaveBeenCalledWith(file);
    expect(screen.getByText('파일 업로드에 실패했습니다.')).toBeInTheDocument();
  });
});
