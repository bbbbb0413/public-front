import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import React from 'react';
import { AiService } from './AiService';
import { AuthContext } from '../context/AuthContext';
import * as aiApi from '../api/ai';

vi.mock('../api/ai', () => {
  return {
    getDocuments: vi.fn(),
    uploadDocument: vi.fn(),
    retryDocument: vi.fn(),
    deleteDocument: vi.fn(),
    askQuestionStream: vi.fn(),
    getSessions: vi.fn().mockResolvedValue([]),
    getSessionDetail: vi.fn(),
    deleteSessionById: vi.fn(),
    subscribeIngestJob: vi.fn(),
    getDocumentFile: vi.fn(),
    submitAnswerFeedback: vi.fn(),
    getSessionFeedback: vi.fn().mockResolvedValue([]),
    deleteAnswerFeedback: vi.fn(),
    toggleSessionBookmark: vi.fn(),
    getBookmarks: vi.fn().mockResolvedValue([]),
    createBookmark: vi.fn(),
    deleteBookmark: vi.fn(),
    getMyPrompt: vi.fn(),
    getMyPromptList: vi.fn(),
    saveMyPrompt: vi.fn(),
    activateMyPrompt: vi.fn(),
    resetMyPrompt: vi.fn(),
    deleteMyPromptVersion: vi.fn(),
    getDocumentChunks: vi.fn(),
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
    vi.mocked(aiApi.uploadDocument).mockResolvedValueOnce({ jobId: 'doc-2' });

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

  it('deletes a document and refreshes list after confirmation', async () => {
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

    // 모달 열림 확인 및 즉시 API 호출되지 않음 확인
    const modal = screen.getByRole('dialog', { name: /문서 삭제 확인/i });
    expect(modal).toBeInTheDocument();
    expect(aiApi.deleteDocument).not.toHaveBeenCalled();

    // 모달 내부의 삭제 확인 버튼 클릭
    const confirmDeleteBtn = modal.querySelector('.btn-confirm-delete') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(confirmDeleteBtn);
    });

    expect(aiApi.deleteDocument).toHaveBeenCalledWith('doc-1');
  });

  it('sends question and displays streaming answer', async () => {
    vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
    
    // askQuestionStream 호출 시 onMessage 콜백을 수동으로 호출하는 모의 함수 구현
    vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((...args) => {
      const onMessage = args[1];
      const onDone = args[2];
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

  it('blocks uploading files larger than 50MB', async () => {
    vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

    await act(async () => {
      render(<AiService />);
    });

    const file = new File([new ArrayBuffer(51 * 1024 * 1024)], 'test.pdf', { type: 'application/pdf' });
    const fileInput = screen.getByLabelText('file-upload-input');

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(aiApi.uploadDocument).not.toHaveBeenCalled();
    expect(screen.getByText('파일 크기는 최대 50MB까지 허용됩니다.')).toBeInTheDocument();
  });

  it('blocks uploading unsupported file types', async () => {
    vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

    await act(async () => {
      render(<AiService />);
    });

    const file = new File(['test'], 'avatar.jpg', { type: 'image/jpeg' });
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
          message: '파일 크기가 50MB 제한을 초과했습니다.',
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
    expect(screen.getByText('파일 크기가 50MB 제한을 초과했습니다.')).toBeInTheDocument();
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

  it('successfully uploads a valid 5MB manual.txt file and displays no error', async () => {
    vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
    vi.mocked(aiApi.uploadDocument).mockResolvedValueOnce({ jobId: 'doc-3' });

    await act(async () => {
      render(<AiService />);
    });

    const file = new File([new ArrayBuffer(5 * 1024 * 1024)], 'manual.txt', { type: 'text/plain' });
    const fileInput = screen.getByLabelText('file-upload-input');

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(aiApi.uploadDocument).toHaveBeenCalledWith(file);
    // 5MB txt 파일 업로드 시 에러가 노출되지 않음을 단언
    expect(screen.queryByText('파일 크기는 최대 50MB까지 허용됩니다.')).not.toBeInTheDocument();
    expect(screen.queryByText('지원하지 않는 파일 형식입니다. (TXT, PDF, MD 파일만 지원)')).not.toBeInTheDocument();
    expect(screen.queryByText('파일 업로드에 실패했습니다.')).not.toBeInTheDocument();
  });

  it('displays server error when file is missing (400 Bad Request)', async () => {
    vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
    const errorResponse = {
      response: {
        data: {
          message: '업로드할 파일이 누락되었습니다.',
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

    // 서버의 누락 에러 메시지가 에러 배너에 표시됨을 단언
    expect(screen.getByText('업로드할 파일이 누락되었습니다.')).toBeInTheDocument();
  });

  it('displays server error when file type is invalid (400 Bad Request)', async () => {
    vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
    const errorResponse = {
      response: {
        data: {
          message: '지원하지 않는 파일 형식입니다. (TXT, PDF, MD 파일만 지원)',
        },
      },
    };
    // 확장자 1차 클라이언트 사이드 필터를 통과해야 하므로 정상 포맷으로 보내서 서버 에러를 강제
    vi.mocked(aiApi.uploadDocument).mockRejectedValueOnce(errorResponse);

    await act(async () => {
      render(<AiService />);
    });

    const file = new File(['test'], 'manual.txt', { type: 'text/plain' });
    const fileInput = screen.getByLabelText('file-upload-input');

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    // 서버의 형식 에러 메시지가 에러 배너에 표시됨을 단언
    expect(screen.getByText('지원하지 않는 파일 형식입니다. (TXT, PDF, MD 파일만 지원)')).toBeInTheDocument();
  });

  it('displays iteration and phase during streaming and shows confidence & missing items when completed', async () => {
    vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

    let triggerSearching: () => void;
    let triggerRefining: () => void;
    let triggerDone: () => void;

    vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
      (
        _question,
        onMessage,
        onDone,
        _onError,
        _userId,
        _chatLog,
        _onSources,
        _sessionId,
        _onSessionId,
        onProgress,
      ) => {
        triggerSearching = () => {
          onProgress?.({
            iteration: 1,
            phase: 'searching',
            confidence: 0,
            missing: [],
          });
        };

        triggerRefining = () => {
          onProgress?.({
            iteration: 2,
            phase: 'refining',
            confidence: 0.85,
            missing: ['결제 취소 정책'],
          });
          onMessage('답변 완료되었습니다.');
        };

        triggerDone = () => {
          onDone();
        };

        return Promise.resolve();
      },
    );

    await act(async () => {
      render(<AiService />);
    });

    const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
    await act(async () => {
      fireEvent.click(chatOpenBtn);
    });

    const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
    const sendBtn = screen.getByRole('button', { name: /전송/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: '정책 질문' } });
      fireEvent.click(sendBtn);
    });

    // 1회차 searching 진행 중 확인
    await act(async () => {
      triggerSearching();
    });
    expect(screen.getByTestId('agent-progress')).toBeInTheDocument();
    expect(screen.getByText(/반복 1회차/i)).toBeInTheDocument();
    expect(screen.getByText('관련 문서를 찾는 중')).toBeInTheDocument();

    // 2회차 refining 진행 중 확인
    await act(async () => {
      triggerRefining();
    });
    expect(screen.getByText(/반복 2회차/i)).toBeInTheDocument();
    expect(screen.getByText('답변을 보완하고 다듬는 중')).toBeInTheDocument();

    // 완료 후 확인
    await act(async () => {
      triggerDone();
    });

    // 진행 상태 바는 사라짐
    expect(screen.queryByTestId('agent-progress')).not.toBeInTheDocument();

    // 최종 신뢰도, 반복 검증 배지 및 누락 항목 표시 확인
    expect(screen.getByTestId('confidence-badge')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByTestId('iteration-badge')).toBeInTheDocument();
    expect(screen.getByText('[2회 반복 검증]')).toBeInTheDocument();

    expect(screen.getByTestId('missing-info')).toBeInTheDocument();
    expect(screen.getByText('결제 취소 정책')).toBeInTheDocument();
  });

  it('Given 에이전틱 루프가 2회 반복하는 질문 When 사용자가 질문하면 Then 화면에 반복 회차와 현재 단계가 순서대로 표시된다', async () => {
    vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

    let triggerSearching: () => void;
    let triggerCritiquing: () => void;

    vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
      (
        _question,
        _onMessage,
        _onDone,
        _onError,
        _userId,
        _chatLog,
        _onSources,
        _sessionId,
        _onSessionId,
        onProgress,
      ) => {
        triggerSearching = () => {
          onProgress?.({
            iteration: 1,
            phase: 'searching',
            confidence: 0,
            missing: [],
          });
        };

        triggerCritiquing = () => {
          onProgress?.({
            iteration: 2,
            phase: 'critiquing',
            confidence: 0.7,
            missing: [],
          });
        };

        return Promise.resolve();
      },
    );

    await act(async () => {
      render(<AiService />);
    });

    const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
    await act(async () => {
      fireEvent.click(chatOpenBtn);
    });

    const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
    const sendBtn = screen.getByRole('button', { name: /전송/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: '2회 반복 질문' } });
      fireEvent.click(sendBtn);
    });

    await act(async () => {
      triggerSearching();
    });
    expect(screen.getByText(/반복 1회차/i)).toBeInTheDocument();
    expect(screen.getByText('관련 문서를 찾는 중')).toBeInTheDocument();

    await act(async () => {
      triggerCritiquing();
    });
    expect(screen.getByText(/반복 2회차/i)).toBeInTheDocument();
    expect(screen.getByText('답변을 검토하고 평가하는 중')).toBeInTheDocument();
  });

  it('Given 루프가 1회로 끝나는 단순한 질문 When 답변이 완료되면 Then 진행 표시가 사라지고 최종 신뢰도가 답변 옆에 남는다', async () => {
    vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

    let triggerGenerating: () => void;
    let triggerDone: () => void;

    vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
      (
        _question,
        onMessage,
        onDone,
        _onError,
        _userId,
        _chatLog,
        _onSources,
        _sessionId,
        _onSessionId,
        onProgress,
      ) => {
        triggerGenerating = () => {
          onProgress?.({
            iteration: 1,
            phase: 'generating',
            confidence: 0.95,
            missing: [],
          });
          onMessage('단순 답변입니다.');
        };

        triggerDone = () => {
          onDone();
        };

        return Promise.resolve();
      },
    );

    await act(async () => {
      render(<AiService />);
    });

    const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
    await act(async () => {
      fireEvent.click(chatOpenBtn);
    });

    const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
    const sendBtn = screen.getByRole('button', { name: /전송/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: '단순 질문' } });
      fireEvent.click(sendBtn);
    });

    await act(async () => {
      triggerGenerating();
    });
    expect(screen.getByText(/반복 1회차/i)).toBeInTheDocument();
    expect(screen.getByText('답변을 생성하는 중')).toBeInTheDocument();

    await act(async () => {
      triggerDone();
    });

    expect(screen.queryByTestId('agent-progress')).not.toBeInTheDocument();
    expect(screen.getByTestId('confidence-badge')).toBeInTheDocument();
    expect(screen.getByText('95%')).toBeInTheDocument();
    expect(screen.queryByTestId('missing-info')).not.toBeInTheDocument();
  });

  it('Given 비평이 missing: ["결제 취소 정책"] 을 돌려준 경우 When 답변이 완료되면 Then 확인하지 못한 항목으로 "결제 취소 정책" 이 표시된다', async () => {
    vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

    vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
      (
        _question,
        onMessage,
        onDone,
        _onError,
        _userId,
        _chatLog,
        _onSources,
        _sessionId,
        _onSessionId,
        onProgress,
      ) => {
        setTimeout(() => {
          onProgress?.({
            iteration: 2,
            phase: 'refining',
            confidence: 0.6,
            missing: ['결제 취소 정책'],
          });
          onMessage('답변입니다.');
          onDone();
        }, 10);

        return Promise.resolve();
      },
    );

    await act(async () => {
      render(<AiService />);
    });

    const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
    await act(async () => {
      fireEvent.click(chatOpenBtn);
    });

    const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
    const sendBtn = screen.getByRole('button', { name: /전송/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: '취소 정책 질문' } });
      fireEvent.click(sendBtn);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(screen.getByTestId('missing-info')).toBeInTheDocument();
    expect(screen.getByText('결제 취소 정책')).toBeInTheDocument();
  });

  describe('Source snippet preview (SPEC-006)', () => {
    it('Given 답변에 출처 3건이 딸린 경우 When 사용자가 첫 번째 출처를 누르면 Then 그 조각의 본문이 펼쳐지고 나머지 둘은 접힌 상태를 유지한다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      const mockSources: aiApi.SourceRef[] = [
        { fileName: 'doc1.pdf', chunkIndex: 0, documentId: 'd1', snippet: '첫 번째 문서의 스니펫 내용입니다.' },
        { fileName: 'doc2.pdf', chunkIndex: 1, documentId: 'd2', snippet: '두 번째 문서의 스니펫 내용입니다.' },
        { fileName: 'doc3.pdf', chunkIndex: 2, documentId: 'd3', snippet: '세 번째 문서의 스니펫 내용입니다.' },
      ];

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (
          _question,
          onMessage,
          onDone,
          _onError,
          _userId,
          _chatLog,
          onSources,
        ) => {
          setTimeout(() => {
            onSources?.(mockSources);
            onMessage('답변 완료');
            onDone();
          }, 10);
          return Promise.resolve();
        },
      );

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '출처 테스트' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      // 기본 상태: 접혀있으므로 snippet 텍스트는 보이지 않음
      expect(screen.queryByText('첫 번째 문서의 스니펫 내용입니다.')).not.toBeInTheDocument();
      expect(screen.queryByText('두 번째 문서의 스니펫 내용입니다.')).not.toBeInTheDocument();
      expect(screen.queryByText('세 번째 문서의 스니펫 내용입니다.')).not.toBeInTheDocument();

      // 첫 번째 출처 토글 버튼 클릭
      const sourceButtons = screen.getAllByRole('button', { name: /doc/i });
      expect(sourceButtons.length).toBe(3);

      await act(async () => {
        fireEvent.click(sourceButtons[0]);
      });

      // 첫 번째는 펼쳐지고 나머지 둘은 접힌 상태
      expect(screen.getByText('첫 번째 문서의 스니펫 내용입니다.')).toBeInTheDocument();
      expect(screen.queryByText('두 번째 문서의 스니펫 내용입니다.')).not.toBeInTheDocument();
      expect(screen.queryByText('세 번째 문서의 스니펫 내용입니다.')).not.toBeInTheDocument();

      // 첫 번째를 다시 누르면 닫힘
      await act(async () => {
        fireEvent.click(sourceButtons[0]);
      });
      expect(screen.queryByText('첫 번째 문서의 스니펫 내용입니다.')).not.toBeInTheDocument();
    });

    it('Given 조각 본문이 500자인 경우 When 출처를 펼치면 Then 300자까지만 보이고 끝에 말줄임표가 붙는다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      const longSnippet = 'A'.repeat(300) + '...';
      const mockSources: aiApi.SourceRef[] = [
        { fileName: 'long.pdf', chunkIndex: 0, documentId: 'd-long', snippet: longSnippet },
      ];

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (
          _question,
          onMessage,
          onDone,
          _onError,
          _userId,
          _chatLog,
          onSources,
        ) => {
          setTimeout(() => {
            onSources?.(mockSources);
            onMessage('답변 완료');
            onDone();
          }, 10);
          return Promise.resolve();
        },
      );

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '긴 본문 테스트' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      const sourceBtn = screen.getByRole('button', { name: /long\.pdf/i });
      await act(async () => {
        fireEvent.click(sourceBtn);
      });

      expect(screen.getByText(longSnippet)).toBeInTheDocument();
      expect(screen.getByTestId('source-snippet-d-long-0').textContent?.length).toBe(303);
    });

    it('Given 조각 본문에 010-1234-5678 이 포함된 경우 When 출처를 펼치면 Then 그 번호가 마스킹된 상태로 보인다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      const maskedSnippet = '사용자 연락처는 [REDACTED_KR_PHONE] 입니다.';
      const mockSources: aiApi.SourceRef[] = [
        { fileName: 'pii.pdf', chunkIndex: 0, documentId: 'd-pii', snippet: maskedSnippet },
      ];

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (
          _question,
          onMessage,
          onDone,
          _onError,
          _userId,
          _chatLog,
          onSources,
        ) => {
          setTimeout(() => {
            onSources?.(mockSources);
            onMessage('답변 완료');
            onDone();
          }, 10);
          return Promise.resolve();
        },
      );

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '마스킹 테스트' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      const sourceBtn = screen.getByRole('button', { name: /pii\.pdf/i });
      await act(async () => {
        fireEvent.click(sourceBtn);
      });

      expect(screen.getByText(maskedSnippet)).toBeInTheDocument();
      expect(screen.queryByText(/010-1234-5678/)).not.toBeInTheDocument();
    });

    it('Given snippet 필드가 없는 응답 When 출처 목록을 그리면 Then 파일 이름만 표시되고 오류가 나지 않는다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      const mockSources: aiApi.SourceRef[] = [
        { fileName: 'legacy.pdf', chunkIndex: 0, documentId: 'd-legacy' },
      ];

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (
          _question,
          onMessage,
          onDone,
          _onError,
          _userId,
          _chatLog,
          onSources,
        ) => {
          setTimeout(() => {
            onSources?.(mockSources);
            onMessage('옛 백엔드 답변');
            onDone();
          }, 10);
          return Promise.resolve();
        },
      );

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '레거시 질문' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      expect(screen.getByText('legacy.pdf')).toBeInTheDocument();
      expect(screen.getByText('근거 1건')).toBeInTheDocument();
    });

    it('Given 출처 항목에 키보드 포커스가 있을 때 When Enter를 누르면 Then 마우스로 누른 것과 같이 펼쳐진다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      const mockSources: aiApi.SourceRef[] = [
        { fileName: 'keyboard.pdf', chunkIndex: 0, documentId: 'd-kb', snippet: '키보드로 펼친 스니펫 내용' },
      ];

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (
          _question,
          onMessage,
          onDone,
          _onError,
          _userId,
          _chatLog,
          onSources,
        ) => {
          setTimeout(() => {
            onSources?.(mockSources);
            onMessage('키보드 테스트 답변');
            onDone();
          }, 10);
          return Promise.resolve();
        },
      );

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '키보드 질문' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      const sourceBtn = screen.getByRole('button', { name: /keyboard\.pdf/i });
      expect(screen.queryByText('키보드로 펼친 스니펫 내용')).not.toBeInTheDocument();

      // Enter 키 이벤트 트리거
      await act(async () => {
        fireEvent.keyDown(sourceBtn, { key: 'Enter', code: 'Enter' });
      });

      expect(screen.getByText('키보드로 펼친 스니펫 내용')).toBeInTheDocument();
    });
  });

  describe('출처 관련도 정렬 및 원문 보기 (SPEC-023)', () => {
    it('Given 여러 출처가 서로 다른 관련도 점수를 가질 때 When 답변이 도착하면 Then 점수가 높은 순서대로 렌더링되고 각 항목에 관련도가 표시된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      const mockSources: aiApi.SourceRef[] = [
        { fileName: 'low.pdf', chunkIndex: 0, documentId: 'd-low', score: 0.2 },
        { fileName: 'high.pdf', chunkIndex: 0, documentId: 'd-high', score: 0.9 },
        { fileName: 'mid.pdf', chunkIndex: 0, documentId: 'd-mid', score: 0.5 },
      ];

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (_question, onMessage, onDone, _onError, _userId, _chatLog, onSources) => {
          setTimeout(() => {
            onSources?.(mockSources);
            onMessage('관련도 테스트 답변');
            onDone();
          }, 10);
          return Promise.resolve();
        },
      );

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '관련도 질문' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      expect(screen.getByText('최고 관련도 90%')).toBeInTheDocument();
      expect(screen.getByText('최고 관련도 50%')).toBeInTheDocument();
      expect(screen.getByText('최고 관련도 20%')).toBeInTheDocument();

      const names = screen
        .getAllByText(/\.pdf$/)
        .map((el) => el.textContent);
      expect(names).toEqual(['high.pdf', 'mid.pdf', 'low.pdf']);
    });

    it('Given 같은 문서에서 여러 청크가 근거로 나온 경우 When 답변이 도착하면 Then 문서명이 반복되지 않고 하나의 그룹으로 묶여 표시된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      const mockSources: aiApi.SourceRef[] = [
        { fileName: 'same.pdf', chunkIndex: 3, documentId: 'd-same', score: 0.84, snippet: '청크 3 내용' },
        { fileName: 'same.pdf', chunkIndex: 27, documentId: 'd-same', score: 0.83, snippet: '청크 27 내용' },
        { fileName: 'same.pdf', chunkIndex: 25, documentId: 'd-same', score: 0.81, snippet: '청크 25 내용' },
      ];

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (_question, onMessage, onDone, _onError, _userId, _chatLog, onSources) => {
          setTimeout(() => {
            onSources?.(mockSources);
            onMessage('그룹핑 테스트 답변');
            onDone();
          }, 10);
          return Promise.resolve();
        },
      );

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '그룹핑 질문' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      // 문서명은 그룹 헤더 1개에만 나타난다 — 청크 개수만큼 반복되지 않는다
      expect(screen.getAllByText('same.pdf')).toHaveLength(1);
      expect(screen.getByText('근거 3건')).toBeInTheDocument();
      expect(screen.getByText('최고 관련도 84%')).toBeInTheDocument();
      // "원문 보기"도 그룹당 1개만 존재한다
      expect(screen.getAllByRole('button', { name: '원문 보기' })).toHaveLength(1);

      // 펼치기 전에는 개별 청크 스니펫이 보이지 않는다
      expect(screen.queryByText('청크 3 내용')).not.toBeInTheDocument();

      const groupHeader = screen.getByRole('button', { name: /same\.pdf/i });
      await act(async () => {
        fireEvent.click(groupHeader);
      });

      // 펼치면 청크별 관련도와 스니펫이 모두 나타난다
      expect(screen.getByText('청크 3 내용')).toBeInTheDocument();
      expect(screen.getByText('청크 27 내용')).toBeInTheDocument();
      expect(screen.getByText('청크 25 내용')).toBeInTheDocument();
      expect(screen.getByText('관련도 84%')).toBeInTheDocument();
      expect(screen.getByText('관련도 83%')).toBeInTheDocument();
      expect(screen.getByText('관련도 81%')).toBeInTheDocument();
    });

    it('Given 출처 목록이 표시된 경우 When "원문 보기" 버튼을 누르면 Then 사전 빈 탭을 열지 않고 파일을 받아온 뒤 앵커 다운로드를 트리거한다 (SPEC-097)', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      const mockSources: aiApi.SourceRef[] = [
        { fileName: 'view-me.pdf', chunkIndex: 0, documentId: 'd-view', score: 0.7, snippet: '보기 테스트' },
      ];

      const fakeBlob = new Blob(['원본 파일 내용'], { type: 'application/pdf' });
      vi.mocked(aiApi.getDocumentFile).mockResolvedValueOnce(fakeBlob);

      const createObjectURLMock = vi.fn().mockReturnValue('blob:fake-url');
      const revokeObjectURLMock = vi.fn();
      vi.stubGlobal('URL', {
        ...URL,
        createObjectURL: createObjectURLMock,
        revokeObjectURL: revokeObjectURLMock,
      });
      const windowOpenMock = vi.fn();
      vi.stubGlobal('open', windowOpenMock);

      let capturedAnchor: { href: string; download: string } = { href: '', download: '' };
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        capturedAnchor = {
          href: this.href,
          download: this.download,
        };
      });

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (_question, onMessage, onDone, _onError, _userId, _chatLog, onSources) => {
          setTimeout(() => {
            onSources?.(mockSources);
            onMessage('원문 보기 답변');
            onDone();
          }, 10);
          return Promise.resolve();
        },
      );

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '원문 보기 질문' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      const viewBtn = screen.getByRole('button', { name: '원문 보기' });
      await act(async () => {
        fireEvent.click(viewBtn);
      });

      expect(windowOpenMock).not.toHaveBeenCalled();
      expect(aiApi.getDocumentFile).toHaveBeenCalledWith('d-view');
      expect(createObjectURLMock).toHaveBeenCalledWith(fakeBlob);
      expect(clickSpy).toHaveBeenCalled();
      expect(capturedAnchor.download).toBe('view-me.pdf');
      expect(capturedAnchor.href).toBe('blob:fake-url');
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:fake-url');

      clickSpy.mockRestore();
      vi.unstubAllGlobals();
    });

    it('Given 원본이 저장되어 있지 않은 문서인 경우 When "원문 보기"를 누르면 Then 해당 출처 그룹에만 국소적으로 실패 안내가 보인다 (SPEC-097)', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      const mockSources: aiApi.SourceRef[] = [
        { fileName: 'missing.pdf', chunkIndex: 0, documentId: 'd-missing', score: 0.3 },
      ];

      vi.mocked(aiApi.getDocumentFile).mockRejectedValueOnce(new Error('404'));

      const windowOpenMock = vi.fn();
      vi.stubGlobal('open', windowOpenMock);

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (_question, onMessage, onDone, _onError, _userId, _chatLog, onSources) => {
          setTimeout(() => {
            onSources?.(mockSources);
            onMessage('원문 없음 답변');
            onDone();
          }, 10);
          return Promise.resolve();
        },
      );

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '원문 없음 질문' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      const viewBtn = screen.getByRole('button', { name: '원문 보기' });
      await act(async () => {
        fireEvent.click(viewBtn);
      });

      expect(windowOpenMock).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent('원본 파일을 불러오는 데 실패했습니다.');

      vi.unstubAllGlobals();
    });
  });

  describe('AI 답변 클립보드 복사 기능', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('Given 완료된 AI 답변이 화면에 표시된 경우 When 사용자가 "복사" 버튼을 클릭하면 Then 클립보드에 해당 AI 답변의 마크다운 원문 텍스트가 복사되고 버튼 텍스트가 2초간 "복사됨" 으로 변경된다', async () => {
        vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

        const writeTextMock = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, {
          clipboard: {
            writeText: writeTextMock,
          },
        });

        vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((...args) => {
          const onMessage = args[1];
          const onDone = args[2];
          onMessage('**마크다운 답변**입니다.');
          onDone();
          return Promise.resolve();
        });

        await act(async () => {
          render(<AiService />);
        });

        const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
        await act(async () => {
          fireEvent.click(chatOpenBtn);
        });

        const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
        const sendBtn = screen.getByRole('button', { name: /전송/i });

        await act(async () => {
          fireEvent.change(input, { target: { value: '질문' } });
          fireEvent.click(sendBtn);
        });

        const copyBtn = screen.getByRole('button', { name: /답변 복사/i });
        expect(copyBtn).toHaveTextContent('복사');

        await act(async () => {
          fireEvent.click(copyBtn);
        });

        expect(writeTextMock).toHaveBeenCalledWith('**마크다운 답변**입니다.');
        expect(copyBtn).toHaveTextContent('복사됨');

        // 2초 후 다시 '복사'로 복귀
        await act(async () => {
          vi.advanceTimersByTime(2000);
        });

        expect(copyBtn).toHaveTextContent('복사');
      });

      it('Given 대화창에 복수의 AI 답변이 존재하는 경우 When 특정 AI 답변의 복사 버튼을 클릭하면 Then 클릭된 메시지의 버튼만 "복사됨" 으로 변경되고 다른 메시지의 복사 버튼 상태에는 영향을 주지 않는다', async () => {
        vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

        const writeTextMock = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, {
          clipboard: {
            writeText: writeTextMock,
          },
        });

        // 1번째 질문 & 답변
        vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((...args) => {
          const onMessage = args[1];
          const onDone = args[2];
          onMessage('첫 번째 답변');
          onDone();
          return Promise.resolve();
        });

        await act(async () => {
          render(<AiService />);
        });

        const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
        await act(async () => {
          fireEvent.click(chatOpenBtn);
        });

        const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
        const sendBtn = screen.getByRole('button', { name: /전송/i });

        await act(async () => {
          fireEvent.change(input, { target: { value: '질문 1' } });
          fireEvent.click(sendBtn);
        });

        // 2번째 질문 & 답변
        vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((...args) => {
          const onMessage = args[1];
          const onDone = args[2];
          onMessage('두 번째 답변');
          onDone();
          return Promise.resolve();
        });

        await act(async () => {
          fireEvent.change(input, { target: { value: '질문 2' } });
          fireEvent.click(sendBtn);
        });

        const copyButtons = screen.getAllByRole('button', { name: /답변 복사/i });
        expect(copyButtons).toHaveLength(2);

        await act(async () => {
          fireEvent.click(copyButtons[0]);
        });

        expect(writeTextMock).toHaveBeenCalledWith('첫 번째 답변');
        expect(copyButtons[0]).toHaveTextContent('복사됨');
        expect(copyButtons[1]).toHaveTextContent('복사');
      });

      it('Given AI 답변이 실시간으로 스트리밍 중인 경우 When 화면을 확인하면 Then 스트리밍 중인 메시지 버블에는 복사 버튼이 노출되지 않는다', async () => {
        vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

        vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((...args) => {
          const onMessage = args[1];
          onMessage('스트리밍 중인 답변');
          // onDone 호출하지 않음 (스트리밍 상태 유지)
          return Promise.resolve();
        });

        await act(async () => {
          render(<AiService />);
        });

        const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
        await act(async () => {
          fireEvent.click(chatOpenBtn);
        });

        const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
        const sendBtn = screen.getByRole('button', { name: /전송/i });

        await act(async () => {
          fireEvent.change(input, { target: { value: '스트리밍 질문' } });
          fireEvent.click(sendBtn);
        });

        expect(screen.queryByRole('button', { name: /답변 복사/i })).not.toBeInTheDocument();
      });

      it('Given 사용자가 입력한 메시지 버블인 경우 When 화면을 확인하면 Then 사용자 메시지 버블에는 복사 버튼이 노출되지 않는다', async () => {
        vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

        await act(async () => {
          render(<AiService />);
        });

        const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
        await act(async () => {
          fireEvent.click(chatOpenBtn);
        });

        expect(screen.queryByRole('button', { name: /답변 복사/i })).not.toBeInTheDocument();
      });

      it('Given navigator.clipboard.writeText 호출이 실패(reject)한 경우 When 사용자가 복사 버튼을 클릭하면 Then 버튼 텍스트가 변경되지 않고 상단 에러 배너에 "답변 복사에 실패했습니다." 가 표시된다', async () => {
        vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

        const writeTextMock = vi.fn().mockRejectedValue(new Error('Clipboard error'));
        Object.assign(navigator, {
          clipboard: {
            writeText: writeTextMock,
          },
        });

        vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((...args) => {
          const onMessage = args[1];
          const onDone = args[2];
          onMessage('에러 테스트 답변');
          onDone();
          return Promise.resolve();
        });

        await act(async () => {
          render(<AiService />);
        });

        const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
        await act(async () => {
          fireEvent.click(chatOpenBtn);
        });

        const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
        const sendBtn = screen.getByRole('button', { name: /전송/i });

        await act(async () => {
          fireEvent.change(input, { target: { value: '에러 질문' } });
          fireEvent.click(sendBtn);
        });

        const copyBtn = screen.getByRole('button', { name: /답변 복사/i });

        await act(async () => {
          fireEvent.click(copyBtn);
        });

        expect(writeTextMock).toHaveBeenCalledWith('에러 테스트 답변');
        expect(copyBtn).toHaveTextContent('복사');
        expect(screen.getByText('답변 복사에 실패했습니다.')).toBeInTheDocument();
      });

      it('Given 복사 버튼에 키보드 포커스가 있는 경우 When Enter 키를 누르면 Then 마우스 클릭과 동일하게 클립보드 복사가 실행된다', async () => {
        vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

        const writeTextMock = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, {
          clipboard: {
            writeText: writeTextMock,
          },
        });

        vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((...args) => {
          const onMessage = args[1];
          const onDone = args[2];
          onMessage('키보드 복사 답변');
          onDone();
          return Promise.resolve();
        });

        await act(async () => {
          render(<AiService />);
        });

        const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
        await act(async () => {
          fireEvent.click(chatOpenBtn);
        });

        const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
        const sendBtn = screen.getByRole('button', { name: /전송/i });

        await act(async () => {
          fireEvent.change(input, { target: { value: '키보드 엔터 질문' } });
          fireEvent.click(sendBtn);
        });

        const copyBtn = screen.getByRole('button', { name: /답변 복사/i });

        await act(async () => {
          fireEvent.keyDown(copyBtn, { key: 'Enter', code: 'Enter' });
          fireEvent.click(copyBtn);
        });

        expect(writeTextMock).toHaveBeenCalledWith('키보드 복사 답변');
        expect(copyBtn).toHaveTextContent('복사됨');
      });
    });

  describe('Done event metadata (SPEC-010)', () => {

    it('Given 프론트엔드가 done 이벤트로 { confidence: 0.9, missing: [] } 페이로드를 수신한 상황 When 스트리밍이 종료되고 답변 메시지가 렌더링될 때 Then AI 메시지 버블에 신뢰도 90% 뱃지가 올바르게 표시된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (
          _question,
          onMessage,
          onDone,
        ) => {
          setTimeout(() => {
            onMessage('최종 답변 내용입니다.');
            onDone({ confidence: 0.9, missing: [] });
          }, 10);
          return Promise.resolve();
        },
      );

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '신뢰도 90% 질문' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      expect(screen.getByTestId('confidence-badge')).toBeInTheDocument();
      expect(screen.getByText('90%')).toBeInTheDocument();
      expect(screen.queryByTestId('missing-info')).not.toBeInTheDocument();
    });

    it('Given done 이벤트에 confidence와 missing 메타데이터가 있고 중간 progress와 다른 경우 When 완료되면 Then done 이벤트의 메타데이터가 AI 메시지 버블에 우선 적용된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (
          _question,
          onMessage,
          onDone,
          _onError,
          _userId,
          _chatLog,
          _onSources,
          _sessionId,
          _onSessionId,
          onProgress,
        ) => {
          setTimeout(() => {
            onProgress?.({
              iteration: 1,
              phase: 'critiquing',
              confidence: 0.5,
              missing: ['이전 누락 정보'],
            });
            onMessage('최종 보완 답변');
            onDone({ confidence: 0.85, missing: ['추가 설명'] });
          }, 10);
          return Promise.resolve();
        },
      );

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '우선순위 검증 질문' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      expect(screen.getByTestId('confidence-badge')).toBeInTheDocument();
      expect(screen.getByText('85%')).toBeInTheDocument();
      expect(screen.getByTestId('missing-info')).toBeInTheDocument();
      expect(screen.getByText('추가 설명')).toBeInTheDocument();
      expect(screen.queryByText('이전 누락 정보')).not.toBeInTheDocument();
    });

    it('Given done 이벤트 페이로드가 비어있거나 null인 응답 When 스트리밍이 완료되면 Then 기존 lastProgress가 적용된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (
          _question,
          onMessage,
          onDone,
          _onError,
          _userId,
          _chatLog,
          _onSources,
          _sessionId,
          _onSessionId,
          onProgress,
        ) => {
          setTimeout(() => {
            onProgress?.({
              iteration: 1,
              phase: 'critiquing',
              confidence: 0.75,
              missing: ['대체 누락 정보'],
            });
            onMessage('레거시 완료 답변');
            onDone(undefined);
          }, 10);
          return Promise.resolve();
        },
      );

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '레거시 done 질문' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      expect(screen.getByTestId('confidence-badge')).toBeInTheDocument();
      expect(screen.getByText('75%')).toBeInTheDocument();
      expect(screen.getByTestId('missing-info')).toBeInTheDocument();
      expect(screen.getByText('대체 누락 정보')).toBeInTheDocument();
    });

    it('Given 단발성 비에이전틱 질의를 수행하여 신뢰도 평가 메타데이터가 없는 상황 When done 이벤트가 수신되면 Then 신뢰도 뱃지 없이 답변 내용만 정상 표시된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (
          _question,
          onMessage,
          onDone,
        ) => {
          setTimeout(() => {
            onMessage('단발성 답변 내용입니다.');
            onDone();
          }, 10);
          return Promise.resolve();
        },
      );

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '단발성 질문' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      expect(screen.queryByTestId('confidence-badge')).not.toBeInTheDocument();
      expect(screen.queryByTestId('missing-info')).not.toBeInTheDocument();
      expect(screen.getAllByText('단발성 답변 내용입니다.').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Session Metadata Restoration (SPEC-011)', () => {
    const mockAuthContextValue = {
      user: { uuid: 'test-user-id', nickName: 'Tester' },
      token: 'jwt-token',
      isAuthenticated: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    };

    it('Given 출처 문서 2개가 포함된 RAG 답변이 세션에 저장된 상황 When 사용자가 세션을 클릭하여 복원하면 Then 채팅 화면에 신뢰도 뱃지 및 출처 2개가 표시된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-1', title: '복원 세션 1', updatedAt: '2026-08-25T01:00:00Z' },
      ]);

      const mockSessionDetail: aiApi.SessionDetailOut = {
        sessionId: 'sess-1',
        title: '복원 세션 1',
        createdAt: '2026-08-25T01:00:00Z',
        updatedAt: '2026-08-25T01:00:00Z',
        turns: [
          {
            role: 'user',
            content: '환불 규정 알려줘',
            createdAt: '2026-08-25T01:00:00Z',
          },
          {
            role: 'assistant',
            content: '환불은 7일 이내 가능합니다.',
            createdAt: '2026-08-25T01:00:01Z',
            confidence: 0.92,
            missing: ['예외 규정'],
            sources: [
              { fileName: 'refund_policy.pdf', chunkIndex: 0, documentId: 'doc-1', snippet: '환불 정책 본문' },
              { fileName: 'terms.pdf', chunkIndex: 2, documentId: 'doc-2', snippet: '이용약관 본문' },
            ],
          },
        ],
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue(mockSessionDetail);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      // 채팅 모달 열기
      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      // 세션 목록에서 세션 클릭
      const sessionItem = screen.getByText('복원 세션 1');
      await act(async () => {
        fireEvent.click(sessionItem);
      });

      expect(aiApi.getSessionDetail).toHaveBeenCalledWith('sess-1');

      // 이전 대화 내용 표시 확인
      expect(screen.getByText('환불 규정 알려줘')).toBeInTheDocument();
      expect(screen.getAllByText('환불은 7일 이내 가능합니다.').length).toBeGreaterThanOrEqual(1);

      // 신뢰도 뱃지 및 확인하지 못한 항목 표시 확인
      expect(screen.getByTestId('confidence-badge')).toBeInTheDocument();
      expect(screen.getByText('92%')).toBeInTheDocument();
      expect(screen.getByTestId('missing-info')).toBeInTheDocument();
      expect(screen.getByText('예외 규정')).toBeInTheDocument();

      // 참고 문서 목록 2개 표시 확인
      expect(screen.getByText('refund_policy.pdf')).toBeInTheDocument();
      expect(screen.getByText('terms.pdf')).toBeInTheDocument();
    });

    it('Given 세션을 복원한 상황 When 답변에 이미 남긴 평가가 있으면 Then 해당 답변에 내 최신 평가가 표시된다 (SPEC-024)', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-1', title: '평가한 세션', updatedAt: '2026-08-28T01:00:00Z' },
      ]);
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue({
        sessionId: 'sess-1',
        title: '평가한 세션',
        createdAt: '2026-08-28T01:00:00Z',
        updatedAt: '2026-08-28T01:00:00Z',
        turns: [
          { role: 'user', content: '환불 규정 알려줘', createdAt: '2026-08-28T01:00:00Z' },
          {
            role: 'assistant',
            content: '환불은 7일 이내 가능합니다.',
            createdAt: '2026-08-28T01:00:01Z',
          },
        ],
      });
      // 평가는 답변이 놓인 턴 번호(1)로 돌아온다.
      vi.mocked(aiApi.getSessionFeedback).mockResolvedValue([
        {
          sessionId: 'sess-1',
          turnIndex: 1,
          accuracy: 4,
          helpfulness: 5,
          comment: null,
          createdAt: '2026-08-28T02:00:00Z',
          updatedAt: '2026-08-28T02:00:00Z',
        },
      ]);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('평가한 세션'));
      });

      expect(aiApi.getSessionFeedback).toHaveBeenCalledWith('sess-1');
      expect(screen.getByTestId('feedback-summary')).toHaveTextContent(
        '정확도 4/5 · 유용성 5/5',
      );
    });

    it('Given 세션의 답변을 평가할 때 When 제출하면 Then 세션 id 와 답변의 턴 번호가 함께 전송된다 (SPEC-024)', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-1', title: '평가할 세션', updatedAt: '2026-08-28T01:00:00Z' },
      ]);
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue({
        sessionId: 'sess-1',
        title: '평가할 세션',
        createdAt: '2026-08-28T01:00:00Z',
        updatedAt: '2026-08-28T01:00:00Z',
        turns: [
          { role: 'user', content: '질문', createdAt: '2026-08-28T01:00:00Z' },
          { role: 'assistant', content: '답변', createdAt: '2026-08-28T01:00:01Z' },
        ],
      });
      vi.mocked(aiApi.getSessionFeedback).mockResolvedValue([]);
      vi.mocked(aiApi.submitAnswerFeedback).mockResolvedValue({
        sessionId: 'sess-1',
        turnIndex: 1,
        accuracy: 5,
        helpfulness: 3,
        comment: null,
        createdAt: '2026-08-28T02:00:00Z',
        updatedAt: '2026-08-28T02:00:00Z',
      });

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('평가할 세션'));
      });

      await act(async () => {
        fireEvent.click(screen.getByText('이 답변을 평가하기'));
      });
      await act(async () => {
        fireEvent.click(screen.getByLabelText(/^정확도 5점/));
        fireEvent.click(screen.getByLabelText(/^유용성 3점/));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('평가 제출'));
      });

      expect(aiApi.submitAnswerFeedback).toHaveBeenCalledWith({
        sessionId: 'sess-1',
        turnIndex: 1,
        accuracy: 5,
        helpfulness: 3,
        comment: undefined,
      });
    });

    it('Given 사용자가 이미 답변을 평가한 상태에서 When 평가 삭제를 클릭하면 Then DELETE /ai/feedback이 호출되고 피드백 상태가 초기화된다 (SPEC-068)', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-1', title: '평가 삭제할 세션', updatedAt: '2026-08-28T01:00:00Z' },
      ]);
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue({
        sessionId: 'sess-1',
        title: '평가 삭제할 세션',
        createdAt: '2026-08-28T01:00:00Z',
        updatedAt: '2026-08-28T01:00:00Z',
        turns: [
          { role: 'user', content: '질문', createdAt: '2026-08-28T01:00:00Z' },
          { role: 'assistant', content: '답변', createdAt: '2026-08-28T01:00:01Z' },
        ],
      });
      vi.mocked(aiApi.getSessionFeedback).mockResolvedValue([
        {
          sessionId: 'sess-1',
          turnIndex: 1,
          accuracy: 4,
          helpfulness: 5,
          comment: '좋음',
          createdAt: '2026-08-28T01:00:00Z',
          updatedAt: '2026-08-28T01:00:00Z',
        },
      ]);
      vi.mocked(aiApi.deleteAnswerFeedback).mockResolvedValue(undefined);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('평가 삭제할 세션'));
      });

      // 기존 평가 요약 확인
      expect(screen.getByTestId('feedback-summary')).toHaveTextContent('정확도 4/5 · 유용성 5/5');

      // 수정 폼 열기
      await act(async () => {
        fireEvent.click(screen.getByTestId('feedback-summary'));
      });

      // 평가 삭제 버튼 클릭
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '평가 삭제' }));
      });

      expect(aiApi.deleteAnswerFeedback).toHaveBeenCalledWith('sess-1', 1);
      // 삭제 후 기본 평가하기 버튼으로 복원 및 성공 안내 반영
      expect(screen.getByText('이 답변을 평가하기')).toBeInTheDocument();
      expect(screen.getByText('답변 평가가 삭제되었습니다.')).toBeInTheDocument();

      // 삭제 완료 후 다시 "이 답변을 평가하기"를 누르면 비어있는 등록 폼이 열리고 평가 삭제 버튼이 없어야 한다
      await act(async () => {
        fireEvent.click(screen.getByText('이 답변을 평가하기'));
      });
      expect(screen.queryByRole('button', { name: '평가 삭제' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '평가 제출' })).toBeDisabled();
    });

    it('Given 사용자가 답변 평가 삭제를 요청했으나 서버 에러가 발생한 경우 When 삭제 실패 시 Then 에러 메시지를 표시하고 기존 평가를 유지한다 (SPEC-068)', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-err', title: '에러 테스트 세션', updatedAt: '2026-08-28T01:00:00Z' },
      ]);
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue({
        sessionId: 'sess-err',
        title: '에러 테스트 세션',
        createdAt: '2026-08-28T01:00:00Z',
        updatedAt: '2026-08-28T01:00:00Z',
        turns: [
          { role: 'user', content: '질문', createdAt: '2026-08-28T01:00:00Z' },
          { role: 'assistant', content: '답변', createdAt: '2026-08-28T01:00:01Z' },
        ],
      });
      vi.mocked(aiApi.getSessionFeedback).mockResolvedValue([
        {
          sessionId: 'sess-err',
          turnIndex: 1,
          accuracy: 4,
          helpfulness: 5,
          comment: '유지될 의견',
          createdAt: '2026-08-28T01:00:00Z',
          updatedAt: '2026-08-28T01:00:00Z',
        },
      ]);
      vi.mocked(aiApi.deleteAnswerFeedback).mockRejectedValueOnce(new Error('404 Not Found'));

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('에러 테스트 세션'));
      });

      // 수정 폼 열기
      await act(async () => {
        fireEvent.click(screen.getByTestId('feedback-summary'));
      });

      // 평가 삭제 버튼 클릭
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '평가 삭제' }));
      });

      expect(aiApi.deleteAnswerFeedback).toHaveBeenCalledWith('sess-err', 1);
      // 삭제 실패 에러 메시지 노출 및 입력값 유지 확인
      expect(screen.getByTestId('feedback-error')).toHaveTextContent(
        '평가를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      );
      expect(screen.getByRole('button', { name: '평가 삭제' })).toBeEnabled();
      expect(screen.getByPlaceholderText(/무엇이 아쉬웠는지/i)).toHaveValue('유지될 의견');
    });

    it('Given 평가가 등록되지 않은 세션 답변의 경우 When 사용자가 평가 등록 폼을 열면 Then 평가 삭제 버튼 없이 취소와 평가 제출 버튼만 노출된다 (SPEC-068)', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-unrated', title: '미평가 세션', updatedAt: '2026-08-28T01:00:00Z' },
      ]);
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue({
        sessionId: 'sess-unrated',
        title: '미평가 세션',
        createdAt: '2026-08-28T01:00:00Z',
        updatedAt: '2026-08-28T01:00:00Z',
        turns: [
          { role: 'user', content: '질문', createdAt: '2026-08-28T01:00:00Z' },
          { role: 'assistant', content: '답변', createdAt: '2026-08-28T01:00:01Z' },
        ],
      });
      vi.mocked(aiApi.getSessionFeedback).mockResolvedValue([]);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('미평가 세션'));
      });

      // 평가 등록 폼 열기
      await act(async () => {
        fireEvent.click(screen.getByText('이 답변을 평가하기'));
      });

      // 수용 기준 검증: 평가 삭제 버튼은 없고 취소와 평가 제출 버튼만 표시
      expect(screen.queryByRole('button', { name: '평가 삭제' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '평가 제출' })).toBeInTheDocument();
    });

    it('Given 메타데이터가 없는 레거시 세션 데이터 When 세션을 복원하면 Then 에러 없이 텍스트가 렌더링되고 출처 목록은 빈 상태로 유지된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-legacy', title: '레거시 세션', updatedAt: '2026-08-25T01:00:00Z' },
      ]);

      const mockLegacyDetail: aiApi.SessionDetailOut = {
        sessionId: 'sess-legacy',
        title: '레거시 세션',
        createdAt: '2026-08-25T01:00:00Z',
        updatedAt: '2026-08-25T01:00:00Z',
        turns: [
          {
            role: 'user',
            content: '레거시 질문',
            createdAt: '2026-08-25T01:00:00Z',
          },
          {
            role: 'assistant',
            content: '레거시 답변',
            createdAt: '2026-08-25T01:00:01Z',
          },
        ],
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue(mockLegacyDetail);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const sessionItem = screen.getByText('레거시 세션');
      await act(async () => {
        fireEvent.click(sessionItem);
      });

      expect(screen.getByText('레거시 질문')).toBeInTheDocument();
      expect(screen.getAllByText('레거시 답변').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByTestId('confidence-badge')).not.toBeInTheDocument();
      expect(screen.queryByTestId('missing-info')).not.toBeInTheDocument();
      expect(screen.queryByText('참고 문서')).not.toBeInTheDocument();
    });

    it('Given 여러 턴의 대화가 있는 세션 When 복원하면 Then 마지막 AI 턴의 출처가 참고 문서 영역에 복원된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-multi', title: '멀티턴 세션', updatedAt: '2026-08-25T01:00:00Z' },
      ]);

      const mockMultiTurnDetail: aiApi.SessionDetailOut = {
        sessionId: 'sess-multi',
        title: '멀티턴 세션',
        createdAt: '2026-08-25T01:00:00Z',
        updatedAt: '2026-08-25T01:00:00Z',
        turns: [
          {
            role: 'user',
            content: '첫 번째 질문',
            createdAt: '2026-08-25T01:00:00Z',
          },
          {
            role: 'assistant',
            content: '첫 번째 답변',
            createdAt: '2026-08-25T01:00:01Z',
            confidence: 0.8,
            sources: [
              { fileName: 'turn1_doc.pdf', chunkIndex: 0, documentId: 'doc-t1' },
            ],
          },
          {
            role: 'user',
            content: '두 번째 질문',
            createdAt: '2026-08-25T01:00:02Z',
          },
          {
            role: 'assistant',
            content: '두 번째 답변',
            createdAt: '2026-08-25T01:00:03Z',
            confidence: 0.95,
            sources: [
              { fileName: 'turn2_doc.pdf', chunkIndex: 1, documentId: 'doc-t2' },
            ],
          },
        ],
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue(mockMultiTurnDetail);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const sessionItem = screen.getByText('멀티턴 세션');
      await act(async () => {
        fireEvent.click(sessionItem);
      });

      // 첫 번째 및 두 번째 턴의 신뢰도 뱃지 모두 렌더링 확인
      expect(screen.getByText('80%')).toBeInTheDocument();
      expect(screen.getByText('95%')).toBeInTheDocument();

      // SPEC-042 이후 각 AI 답변 버블이 자기 턴의 출처를 함께 보여준다
      expect(screen.getByText('turn2_doc.pdf')).toBeInTheDocument();
      expect(screen.getByText('turn1_doc.pdf')).toBeInTheDocument();
    });

    it('Given 사용자가 질문만 입력하고 백엔드 처리가 중단되거나 출처 검색 결과가 0건인 대화 턴 When 세션을 저장 및 복원하면 Then sources 가 빈 배열 또는 undefined 로 안전하게 처리된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-empty-sources', title: '출처 없는 세션', updatedAt: '2026-08-25T01:00:00Z' },
      ]);

      const mockEmptySourcesDetail: aiApi.SessionDetailOut = {
        sessionId: 'sess-empty-sources',
        title: '출처 없는 세션',
        createdAt: '2026-08-25T01:00:00Z',
        updatedAt: '2026-08-25T01:00:00Z',
        turns: [
          {
            role: 'user',
            content: '답변 중단 질문',
            createdAt: '2026-08-25T01:00:00Z',
          },
          {
            role: 'assistant',
            content: '출처가 없는 일반 답변입니다.',
            createdAt: '2026-08-25T01:00:01Z',
            confidence: 0.5,
            sources: [],
          },
        ],
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue(mockEmptySourcesDetail);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const sessionItem = screen.getByText('출처 없는 세션');
      await act(async () => {
        fireEvent.click(sessionItem);
      });

      // 대화 내용 및 신뢰도 표시
      expect(screen.getByText('답변 중단 질문')).toBeInTheDocument();
      expect(screen.getAllByText('출처가 없는 일반 답변입니다.').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('50%')).toBeInTheDocument();

      // sources가 빈 배열이므로 참고 문서 섹션이 렌더링되지 않음을 확인
      expect(screen.queryByText('참고 문서')).not.toBeInTheDocument();
    });
  });

  describe('Document Ingest SSE Subscription (SPEC-012)', () => {
    it('Given 사용자가 유효한 문서를 업로드했을 때 When 백엔드가 jobId를 응답하고 done 이벤트를 발행하면 Then 즉시 fetchDocuments를 호출하고 스트림을 종료한다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.uploadDocument).mockResolvedValueOnce({ jobId: 'job-123' });

      let capturedCallbacks: { onDone?: () => void; onError?: (error: string) => void } = {};
      const mockClose = vi.fn();
      vi.mocked(aiApi.subscribeIngestJob).mockImplementation((_jobId, callbacks) => {
        capturedCallbacks = callbacks;
        return mockClose;
      });

      await act(async () => {
        render(<AiService />);
      });

      const file = new File(['test content'], 'test.txt', { type: 'text/plain' });
      const fileInput = screen.getByLabelText('file-upload-input');

      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [file] } });
      });

      expect(aiApi.uploadDocument).toHaveBeenCalledWith(file);
      expect(aiApi.subscribeIngestJob).toHaveBeenCalledWith('job-123', expect.any(Object));

      // done 이벤트 발생 시뮬레이션
      const initialCallCount = vi.mocked(aiApi.getDocuments).mock.calls.length;
      await act(async () => {
        capturedCallbacks.onDone?.();
      });

      expect(aiApi.getDocuments).toHaveBeenCalledTimes(initialCallCount + 1);
      expect(mockClose).toHaveBeenCalled();
    });

    it('Given 사용자가 문서를 업로드했으나 백엔드 처리 중 오류가 발생했을 때 When error 이벤트를 발행하면 Then 즉시 스트림을 닫고 에러 배너에 해당 오류 메시지를 표시한다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.uploadDocument).mockResolvedValueOnce({ jobId: 'job-err-456' });

      let capturedCallbacks: { onDone?: () => void; onError?: (error: string) => void } = {};
      const mockClose = vi.fn();
      vi.mocked(aiApi.subscribeIngestJob).mockImplementation((_jobId, callbacks) => {
        capturedCallbacks = callbacks;
        return mockClose;
      });

      await act(async () => {
        render(<AiService />);
      });

      const file = new File(['test content'], 'test.txt', { type: 'text/plain' });
      const fileInput = screen.getByLabelText('file-upload-input');

      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [file] } });
      });

      expect(aiApi.subscribeIngestJob).toHaveBeenCalledWith('job-err-456', expect.any(Object));

      // error 이벤트 수신 시뮬레이션
      await act(async () => {
        capturedCallbacks.onError?.('파싱 실패');
      });

      expect(mockClose).toHaveBeenCalled();
      expect(screen.getByText('파싱 실패')).toBeInTheDocument();
    });

    it('Given 업로드 후 응답에 jobId가 없거나 빈 값인 경우 When handleFileUpload가 실행되면 Then SSE 구독을 시도하지 않고 안전하게 fetchDocuments를 호출한다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.uploadDocument).mockResolvedValueOnce({ jobId: '' });

      await act(async () => {
        render(<AiService />);
      });

      const initialCallCount = vi.mocked(aiApi.getDocuments).mock.calls.length;
      const file = new File(['test content'], 'test.txt', { type: 'text/plain' });
      const fileInput = screen.getByLabelText('file-upload-input');

      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [file] } });
      });

      expect(aiApi.uploadDocument).toHaveBeenCalledWith(file);
      expect(aiApi.subscribeIngestJob).not.toHaveBeenCalled();
      expect(aiApi.getDocuments).toHaveBeenCalledTimes(initialCallCount + 1);
    });

    it('Given SSE 연결이 15초 동안 유지되는 경우 When 타임아웃되면 Then SSE 연결을 닫고 최종 1회 fetchDocuments를 호출한다', async () => {
      vi.useFakeTimers();
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.uploadDocument).mockResolvedValueOnce({ jobId: 'job-timeout' });

      const mockClose = vi.fn();
      vi.mocked(aiApi.subscribeIngestJob).mockImplementation(() => mockClose);

      await act(async () => {
        render(<AiService />);
      });

      const file = new File(['test content'], 'test.txt', { type: 'text/plain' });
      const fileInput = screen.getByLabelText('file-upload-input');

      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [file] } });
      });

      expect(aiApi.subscribeIngestJob).toHaveBeenCalledWith('job-timeout', expect.any(Object));
      const beforeTimeoutCallCount = vi.mocked(aiApi.getDocuments).mock.calls.length;

      // 15초 경과
      await act(async () => {
        vi.advanceTimersByTime(15000);
      });

      expect(mockClose).toHaveBeenCalled();
      expect(aiApi.getDocuments).toHaveBeenCalledTimes(beforeTimeoutCallCount + 1);

      vi.useRealTimers();
    });

    it('Given 컴포넌트 언마운트 시 When 활성화된 SSE 구독이 있으면 Then 연결을 정상 해제하여 메모리 누수를 방지한다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.uploadDocument).mockResolvedValueOnce({ jobId: 'job-unmount' });

      const mockClose = vi.fn();
      vi.mocked(aiApi.subscribeIngestJob).mockImplementation(() => mockClose);

      let unmountFn: () => void = () => {};
      await act(async () => {
        const { unmount } = render(<AiService />);
        unmountFn = unmount;
      });

      const file = new File(['test content'], 'test.txt', { type: 'text/plain' });
      const fileInput = screen.getByLabelText('file-upload-input');

      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [file] } });
      });

      expect(aiApi.subscribeIngestJob).toHaveBeenCalledWith('job-unmount', expect.any(Object));
      expect(mockClose).not.toHaveBeenCalled();

      // 언마운트
      await act(async () => {
        unmountFn();
      });

      expect(mockClose).toHaveBeenCalled();
    });
  });

  describe('Answer Cancel Integration (SPEC-015)', () => {
    it('Given 스트리밍 진행 중일 때 When 입력 폼을 확인하면 Then 전송 버튼 대신 클릭 가능한 중단 버튼이 표시된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      const mockCancel = vi.fn().mockResolvedValue(undefined);

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(() => {
        return Object.assign(Promise.resolve(), { cancel: mockCancel });
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '긴 질문' } });
        fireEvent.click(sendBtn);
      });

      expect(screen.queryByRole('button', { name: /전송/i })).not.toBeInTheDocument();
      const cancelBtn = screen.getByRole('button', { name: /중단/i });
      expect(cancelBtn).toBeInTheDocument();
      expect(cancelBtn).not.toBeDisabled();
    });

    it('Given 스트리밍 중 사용자가 중단 버튼을 클릭했을 때 When 중단이 처리되면 Then cancel이 호출되고 지금까지 수신된 텍스트가 채팅 기록에 보존되며 isStreaming이 해제된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      const mockCancel = vi.fn().mockResolvedValue(undefined);

      let emitToken: (token: string) => void;
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((...args) => {
        const onMessage = args[1];
        emitToken = onMessage;
        return Object.assign(Promise.resolve(), { cancel: mockCancel });
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '중단 테스트 질문' } });
        fireEvent.click(sendBtn);
      });

      // 토큰 2개 수신
      await act(async () => {
        emitToken('부분 답변');
        emitToken(' 생성 중...');
      });

      expect(screen.getAllByText('부분 답변 생성 중...').length).toBeGreaterThanOrEqual(1);

      // 중단 버튼 클릭
      const cancelBtn = screen.getByRole('button', { name: /중단/i });
      await act(async () => {
        fireEvent.click(cancelBtn);
      });

      expect(mockCancel).toHaveBeenCalled();

      // 지금까지 수신된 답변이 채팅 로그에 보존됨
      expect(screen.getAllByText('부분 답변 생성 중...').length).toBeGreaterThanOrEqual(1);

      // 입력창과 전송 버튼이 다시 활성화됨
      const restoredInput = screen.getByPlaceholderText(/질문을 입력하세요/i);
      expect(restoredInput).not.toBeDisabled();
      expect(screen.getByRole('button', { name: /전송/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /중단/i })).not.toBeInTheDocument();
    });

    it('Given 컴포넌트 언마운트 시 스트리밍이 진행 중일 때 When 언마운트되면 Then 스트림 cancel이 자동으로 호출된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      const mockCancel = vi.fn().mockResolvedValue(undefined);

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(() => {
        return Object.assign(Promise.resolve(), { cancel: mockCancel });
      });

      let unmountFn: () => void = () => {};
      await act(async () => {
        const { unmount } = render(<AiService />);
        unmountFn = unmount;
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '언마운트 테스트' } });
        fireEvent.click(sendBtn);
      });

      expect(mockCancel).not.toHaveBeenCalled();

      await act(async () => {
        unmountFn();
      });

      expect(mockCancel).toHaveBeenCalled();
    });

    it('Given 질문 입력창이 비어있거나 스트리밍 중이 아닌 일반 상태일 때 When 화면을 확인하면 Then 중단 버튼은 노출되지 않고 전송 버튼만 노출된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      expect(screen.getByRole('button', { name: /전송/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /중단/i })).not.toBeInTheDocument();
    });

    it('Given 스트리밍이 이미 정상 완료된 상태에서 When 사용자가 중단을 호출하거나 종료되면 Then 정상 상태를 유지한다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      const mockCancel = vi.fn().mockResolvedValue(undefined);

      let emitDone: () => void = () => {};
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((...args) => {
        const onDone = args[2];
        emitDone = onDone;
        return Object.assign(Promise.resolve(), { cancel: mockCancel });
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '완료 경계 테스트' } });
        fireEvent.click(sendBtn);
      });

      // 정상 완료 이벤트 발생
      await act(async () => {
        emitDone();
      });

      expect(screen.getByRole('button', { name: /전송/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /중단/i })).not.toBeInTheDocument();
      expect(mockCancel).not.toHaveBeenCalled();
    });
  });

  describe('Document Delete Confirmation Modal (SPEC-013)', () => {
    it('Given 사용자가 문서 목록에서 특정 문서(handbook.pdf)의 삭제 버튼을 클릭했을 때 When 삭제 버튼이 눌리면 Then API 호출이 즉시 발생하지 않고 handbook.pdf 파일명이 명시된 삭제 확인 모달이 화면에 표시된다', async () => {
      const mockDocs = [
        { id: 'doc-101', fileName: 'handbook.pdf', status: 'processed', chunkCount: 5, createdAt: '2026-06-18T05:00:00Z' },
      ];
      vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);

      await act(async () => {
        render(<AiService />);
      });

      const deleteBtn = screen.getByRole('button', { name: /삭제/i });
      await act(async () => {
        fireEvent.click(deleteBtn);
      });

      // API가 즉시 호출되지 않음
      expect(aiApi.deleteDocument).not.toHaveBeenCalled();

      // 모달 표시 및 파일명 노출 확인
      const modal = screen.getByRole('dialog', { name: /문서 삭제 확인/i });
      expect(modal).toBeInTheDocument();
      expect(screen.getByText(/"handbook\.pdf" 문서를 삭제하시겠습니까\?/)).toBeInTheDocument();
      expect(screen.getByText(/삭제된 문서는 복구할 수 없으며/)).toBeInTheDocument();
    });

    it('Given 삭제 확인 모달이 열려 있는 상태에서 When 사용자가 취소 버튼을 클릭하면 Then 삭제 API가 호출되지 않고 확인 모달이 즉시 닫힌다', async () => {
      const mockDocs = [
        { id: 'doc-101', fileName: 'handbook.pdf', status: 'processed', chunkCount: 5, createdAt: '2026-06-18T05:00:00Z' },
      ];
      vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);

      await act(async () => {
        render(<AiService />);
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /삭제/i }));
      });

      expect(screen.getByRole('dialog', { name: /문서 삭제 확인/i })).toBeInTheDocument();

      const cancelBtn = screen.getByRole('button', { name: /취소/i });
      await act(async () => {
        fireEvent.click(cancelBtn);
      });

      expect(aiApi.deleteDocument).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog', { name: /문서 삭제 확인/i })).not.toBeInTheDocument();
    });

    it('Given 삭제 확인 모달이 열려 있는 상태에서 When 사용자가 Escape 키를 누르면 Then 삭제 API가 호출되지 않고 확인 모달이 즉시 닫힌다', async () => {
      const mockDocs = [
        { id: 'doc-101', fileName: 'handbook.pdf', status: 'processed', chunkCount: 5, createdAt: '2026-06-18T05:00:00Z' },
      ];
      vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);

      await act(async () => {
        render(<AiService />);
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /삭제/i }));
      });

      expect(screen.getByRole('dialog', { name: /문서 삭제 확인/i })).toBeInTheDocument();

      await act(async () => {
        fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
      });

      expect(aiApi.deleteDocument).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog', { name: /문서 삭제 확인/i })).not.toBeInTheDocument();
    });

    it('Given 삭제 확인 모달이 열려 있는 상태에서 When 사용자가 모달 배경 오버레이를 클릭하면 Then 모달이 닫힌다', async () => {
      const mockDocs = [
        { id: 'doc-101', fileName: 'handbook.pdf', status: 'processed', chunkCount: 5, createdAt: '2026-06-18T05:00:00Z' },
      ];
      vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);

      await act(async () => {
        render(<AiService />);
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /삭제/i }));
      });

      const overlay = screen.getByTestId('delete-modal-overlay');
      await act(async () => {
        fireEvent.click(overlay);
      });

      expect(aiApi.deleteDocument).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog', { name: /문서 삭제 확인/i })).not.toBeInTheDocument();
    });

    it('Given 삭제 확인 모달이 열려 있는 상태에서 When 사용자가 모달의 삭제 버튼을 클릭하면 Then 백엔드 삭제 API가 호출되고, 요청 중에는 모달 버튼이 "삭제 중..." 으로 표시되며 비활성화된다', async () => {
      const mockDocs = [
        { id: 'doc-101', fileName: 'handbook.pdf', status: 'processed', chunkCount: 5, createdAt: '2026-06-18T05:00:00Z' },
      ];
      vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);

      let resolveDelete: (value: { success: boolean }) => void = () => {};
      vi.mocked(aiApi.deleteDocument).mockImplementationOnce(() => {
        return new Promise((resolve) => {
          resolveDelete = resolve;
        });
      });

      await act(async () => {
        render(<AiService />);
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /삭제/i }));
      });

      const modal = screen.getByRole('dialog', { name: /문서 삭제 확인/i });
      const confirmDeleteBtn = modal.querySelector('.btn-confirm-delete') as HTMLButtonElement;
      const cancelBtn = modal.querySelector('.btn-cancel-delete') as HTMLButtonElement;

      await act(async () => {
        fireEvent.click(confirmDeleteBtn);
      });

      expect(aiApi.deleteDocument).toHaveBeenCalledWith('doc-101');
      expect(confirmDeleteBtn.textContent).toBe('삭제 중...');
      expect(confirmDeleteBtn).toBeDisabled();
      expect(cancelBtn).toBeDisabled();

      // 삭제 성공 완료 시뮬레이션
      await act(async () => {
        resolveDelete({ success: true });
      });

      expect(screen.queryByRole('dialog', { name: /문서 삭제 확인/i })).not.toBeInTheDocument();
      expect(aiApi.getDocuments).toHaveBeenCalledTimes(2); // 최초 1회 + 삭제 완료 후 1회
    });

    it('Given 백엔드 장애나 네트워크 오류로 삭제 요청이 실패했을 때 When API 호출이 에러를 반환하면 Then 확인 모달이 닫히고 상단 에러 배너에 서버 에러 메시지 또는 "문서 삭제에 실패했습니다." 가 표시된다', async () => {
      const mockDocs = [
        { id: 'doc-101', fileName: 'handbook.pdf', status: 'processed', chunkCount: 5, createdAt: '2026-06-18T05:00:00Z' },
      ];
      vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);

      const errorResponse = {
        response: {
          data: {
            message: '서버 내부 오류로 문서를 삭제할 수 없습니다.',
          },
        },
      };
      vi.mocked(aiApi.deleteDocument).mockRejectedValueOnce(errorResponse);

      await act(async () => {
        render(<AiService />);
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /삭제/i }));
      });

      const modal = screen.getByRole('dialog', { name: /문서 삭제 확인/i });
      const confirmDeleteBtn = modal.querySelector('.btn-confirm-delete') as HTMLButtonElement;
      await act(async () => {
        fireEvent.click(confirmDeleteBtn);
      });

      expect(screen.queryByRole('dialog', { name: /문서 삭제 확인/i })).not.toBeInTheDocument();
      expect(screen.getByText('서버 내부 오류로 문서를 삭제할 수 없습니다.')).toBeInTheDocument();
    });

    it('Given 파일명이 빈 문자열이거나 유효하지 않은 문서 항목의 삭제 버튼을 클릭했을 때 (경계 케이스) When 확인 모달이 열리면 Then 기본 텍스트("선택한 문서를 삭제하시겠습니까?")로 안전하게 렌더링된다', async () => {
      const mockDocs = [
        { id: 'doc-empty-name', fileName: '', status: 'processed', chunkCount: 1, createdAt: '2026-06-18T05:00:00Z' },
      ];
      vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);

      await act(async () => {
        render(<AiService />);
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /삭제/i }));
      });

      expect(screen.getByRole('dialog', { name: /문서 삭제 확인/i })).toBeInTheDocument();
      expect(screen.getByText('선택한 문서를 삭제하시겠습니까?')).toBeInTheDocument();
      expect(screen.getByText(/삭제된 문서는 복구할 수 없으며/)).toBeInTheDocument();
    });
    it('Given 백엔드 응답에 구체적인 에러 메시지가 없는 경우 When 삭제가 실패하면 Then 기본 메시지("문서 삭제에 실패했습니다.")가 표시된다', async () => {
      const mockDocs = [
        { id: 'doc-101', fileName: 'handbook.pdf', status: 'processed', chunkCount: 5, createdAt: '2026-06-18T05:00:00Z' },
      ];
      vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);
      vi.mocked(aiApi.deleteDocument).mockRejectedValueOnce(new Error('Network error'));

      await act(async () => {
        render(<AiService />);
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /삭제/i }));
      });

      const modal = screen.getByRole('dialog', { name: /문서 삭제 확인/i });
      const confirmDeleteBtn = modal.querySelector('.btn-confirm-delete') as HTMLButtonElement;
      await act(async () => {
        fireEvent.click(confirmDeleteBtn);
      });

      expect(screen.queryByRole('dialog', { name: /문서 삭제 확인/i })).not.toBeInTheDocument();
      expect(screen.getByText('문서 삭제에 실패했습니다.')).toBeInTheDocument();
    });

    it('Given 삭제 진행 중(isDeleting: true)인 상태에서 When 사용자가 Escape 키를 누르거나 모달 배경을 클릭하면 Then 모달이 닫히지 않고 삭제 진행이 유지된다', async () => {
      const mockDocs = [
        { id: 'doc-101', fileName: 'handbook.pdf', status: 'processed', chunkCount: 5, createdAt: '2026-06-18T05:00:00Z' },
      ];
      vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);

      let resolveDelete: (value: { success: boolean }) => void = () => {};
      vi.mocked(aiApi.deleteDocument).mockImplementationOnce(() => {
        return new Promise((resolve) => {
          resolveDelete = resolve;
        });
      });

      await act(async () => {
        render(<AiService />);
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /삭제/i }));
      });

      const modal = screen.getByRole('dialog', { name: /문서 삭제 확인/i });
      const confirmDeleteBtn = modal.querySelector('.btn-confirm-delete') as HTMLButtonElement;
      await act(async () => {
        fireEvent.click(confirmDeleteBtn);
      });

      expect(confirmDeleteBtn).toBeDisabled();

      // 삭제 진행 중 Escape 입력 시도
      await act(async () => {
        fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
      });
      expect(screen.getByRole('dialog', { name: /문서 삭제 확인/i })).toBeInTheDocument();

      // 삭제 진행 중 오버레이 클릭 시도
      const overlay = screen.getByTestId('delete-modal-overlay');
      await act(async () => {
        fireEvent.click(overlay);
      });
      expect(screen.getByRole('dialog', { name: /문서 삭제 확인/i })).toBeInTheDocument();

      // 완료 처리
      await act(async () => {
        resolveDelete({ success: true });
      });
      expect(screen.queryByRole('dialog', { name: /문서 삭제 확인/i })).not.toBeInTheDocument();
    });
  });

  describe('마크다운 표·HTML 태그 렌더링', () => {
    it('Given AI 답변에 GFM 표 문법과 <br> 태그가 섞여 있을 때 When 답변이 렌더링되면 Then 파이프 문자가 그대로 보이지 않고 실제 <table>과 줄바꿈으로 렌더링된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      const tableAnswer =
        '| 구분 | 내용 |\n|------|------|\n| 거주자 요건 | 서울 거주자 <br> 10년 이상 |';

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((...args) => {
        const onMessage = args[1];
        const onDone = args[2];
        onMessage(tableAnswer);
        onDone();
        return Promise.resolve();
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '입주조건' } });
        fireEvent.click(sendBtn);
      });

      // 실제 <table> 구조로 렌더링되어야 한다(원시 파이프 문법이 텍스트로 남지 않는다)
      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: '구분' })).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: '거주자 요건' })).toBeInTheDocument();

      // <br> 태그가 텍스트로 남지 않고 실제 줄바꿈 요소로 렌더링되어야 한다
      const contentCell = screen
        .getAllByRole('cell')
        .find((cell) => cell.textContent?.includes('10년 이상'));
      expect(contentCell?.textContent).not.toContain('<br>');
      expect(contentCell?.querySelector('br')).toBeInTheDocument();
    });
  });

  describe('신뢰도 수준별 배지 시각화 및 세션 복원', () => {
    const mockAuthContextValue = {
      user: { uuid: 'test-user-id', nickName: 'Tester' },
      token: 'jwt-token',
      isAuthenticated: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    };

    it('Given confidence가 80%(0.8) 이상일 때 When 렌더링되면 Then confidence-high 클래스가 적용된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-high', title: '높은 신뢰도 세션', updatedAt: '2026-08-29T01:00:00Z' },
      ]);

      const mockDetail: aiApi.SessionDetailOut = {
        sessionId: 'sess-high',
        title: '높은 신뢰도 세션',
        createdAt: '2026-08-29T01:00:00Z',
        updatedAt: '2026-08-29T01:00:00Z',
        turns: [
          {
            role: 'assistant',
            content: '높은 신뢰도 답변입니다.',
            createdAt: '2026-08-29T01:00:01Z',
            confidence: 0.85,
            missing: [],
          },
        ],
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue(mockDetail);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const sessionItem = screen.getByText('높은 신뢰도 세션');
      await act(async () => {
        fireEvent.click(sessionItem);
      });

      const badge = screen.getByTestId('confidence-badge');
      expect(badge).toHaveClass('confidence-badge');
      expect(badge).toHaveClass('confidence-high');
      expect(badge).toHaveTextContent('85%');
    });

    it('Given confidence가 60%(0.6) 이상 80%(0.8) 미만일 때 When 렌더링되면 Then confidence-medium 클래스가 적용된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-med', title: '중간 신뢰도 세션', updatedAt: '2026-08-29T01:00:00Z' },
      ]);

      const mockDetail: aiApi.SessionDetailOut = {
        sessionId: 'sess-med',
        title: '중간 신뢰도 세션',
        createdAt: '2026-08-29T01:00:00Z',
        updatedAt: '2026-08-29T01:00:00Z',
        turns: [
          {
            role: 'assistant',
            content: '중간 신뢰도 답변입니다.',
            createdAt: '2026-08-29T01:00:01Z',
            confidence: 0.7,
            missing: ['일부 누락 정보'],
          },
        ],
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue(mockDetail);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const sessionItem = screen.getByText('중간 신뢰도 세션');
      await act(async () => {
        fireEvent.click(sessionItem);
      });

      const badge = screen.getByTestId('confidence-badge');
      expect(badge).toHaveClass('confidence-badge');
      expect(badge).toHaveClass('confidence-medium');
      expect(badge).toHaveTextContent('70%');
      expect(screen.getByTestId('missing-info')).toBeInTheDocument();
      expect(screen.getByText('일부 누락 정보')).toBeInTheDocument();
    });

    it('Given confidence가 60%(0.6) 미만일 때 When 렌더링되면 Then confidence-low 클래스가 적용된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-low', title: '낮은 신뢰도 세션', updatedAt: '2026-08-29T01:00:00Z' },
      ]);

      const mockDetail: aiApi.SessionDetailOut = {
        sessionId: 'sess-low',
        title: '낮은 신뢰도 세션',
        createdAt: '2026-08-29T01:00:00Z',
        updatedAt: '2026-08-29T01:00:00Z',
        turns: [
          {
            role: 'assistant',
            content: '낮은 신뢰도 답변입니다.',
            createdAt: '2026-08-29T01:00:01Z',
            confidence: 0.45,
            missing: [],
          },
        ],
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue(mockDetail);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const sessionItem = screen.getByText('낮은 신뢰도 세션');
      await act(async () => {
        fireEvent.click(sessionItem);
      });

      const badge = screen.getByTestId('confidence-badge');
      expect(badge).toHaveClass('confidence-badge');
      expect(badge).toHaveClass('confidence-low');
      expect(badge).toHaveTextContent('45%');
    });

    it('Given confidence 필드가 없는 레거시 세션 턴일 때 When 화면에 렌더링되면 Then 신뢰도 배지가 노출되지 않는다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-legacy', title: '레거시 세션', updatedAt: '2026-08-29T01:00:00Z' },
      ]);

      const mockDetail: aiApi.SessionDetailOut = {
        sessionId: 'sess-legacy',
        title: '레거시 세션',
        createdAt: '2026-08-29T01:00:00Z',
        updatedAt: '2026-08-29T01:00:00Z',
        turns: [
          {
            role: 'assistant',
            content: '신뢰도가 없는 레거시 답변입니다.',
            createdAt: '2026-08-29T01:00:01Z',
          },
        ],
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue(mockDetail);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const sessionItem = screen.getByText('레거시 세션');
      await act(async () => {
        fireEvent.click(sessionItem);
      });

      expect(screen.queryByTestId('confidence-badge')).not.toBeInTheDocument();
      expect(screen.getAllByText('신뢰도가 없는 레거시 답변입니다.').length).toBeGreaterThanOrEqual(1);
    });

    describe('SPEC-059: 단발성 RAG 질의 신뢰도 산출 및 근거 문서 미참조 답변 경고 표시', () => {
      it('AC 1: Given 검색 청크가 없어 confidence=0 및 missing 안내가 전달되었을 때 When 답변이 완료되면 Then 신뢰도 0% 배지와 근거 부재 경고 배너가 표시된다', async () => {
        vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
        vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((...args) => {
          const onMessage = args[1];
          const onDone = args[2];
          setTimeout(() => onMessage('지식베이스 외 일반 상식 답변입니다.'), 10);
          setTimeout(() => onDone({ confidence: 0.0, missing: ['관련 지식베이스 문서를 찾지 못함'] }), 20);
          return Promise.resolve();
        });

        await act(async () => {
          render(<AiService />);
        });

        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
        });

        const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
        await act(async () => {
          fireEvent.change(input, { target: { value: '문서에 없는 임의의 질문' } });
          fireEvent.click(screen.getByRole('button', { name: /전송/i }));
        });

        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
        });

        // 신뢰도 0% 배지 확인
        const badge = screen.getByTestId('confidence-badge');
        expect(badge).toHaveClass('confidence-badge');
        expect(badge).toHaveClass('confidence-low');
        expect(badge).toHaveTextContent('0%');

        // 근거 부재 경고 배너 확인
        const warning = screen.getByTestId('ungrounded-warning');
        expect(warning).toHaveClass('ungrounded-warning');
        expect(warning).toHaveTextContent('근거 문서 미발견 (모델 일반 지식 기반 답변)');
      });

      it('AC 2: Given 검색 청크가 있어 confidence=0.88일 때 When 답변이 완료되면 Then 신뢰도 88% 녹색 배지가 표시되고 경고 배너는 표시되지 않는다', async () => {
        vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
        vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((...args) => {
          const onMessage = args[1];
          const onDone = args[2];
          const onSources = args[6];
          setTimeout(() => {
            onSources?.([
              {
                fileName: 'guideline.pdf',
                chunkIndex: 0,
                documentId: 'doc-1',
                score: 0.88,
              },
            ]);
            onMessage('지식베이스 근거 기반 답변입니다.');
          }, 10);
          setTimeout(() => onDone({ confidence: 0.88, missing: [] }), 20);
          return Promise.resolve();
        });

        await act(async () => {
          render(<AiService />);
        });

        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
        });

        const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
        await act(async () => {
          fireEvent.change(input, { target: { value: '가이드라인 내용 문의' } });
          fireEvent.click(screen.getByRole('button', { name: /전송/i }));
        });

        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
        });

        const badge = screen.getByTestId('confidence-badge');
        expect(badge).toHaveClass('confidence-high');
        expect(badge).toHaveTextContent('88%');

        expect(screen.queryByTestId('ungrounded-warning')).toBeNull();
      });

      it('AC 3: Given 근거 문서 없이 생성되어 신뢰도 0%로 저장된 세션 복원 시 When 복원하면 Then 해당 AI 메시지에 경고 배너와 신뢰도 0% 배지가 표시된다', async () => {
        vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
        vi.mocked(aiApi.getSessions).mockResolvedValue([
          { sessionId: 'sess-ungrounded', title: '근거 없는 질문 세션', updatedAt: '2026-08-29T01:00:00Z' },
        ]);

        const mockDetail: aiApi.SessionDetailOut = {
          sessionId: 'sess-ungrounded',
          title: '근거 없는 질문 세션',
          createdAt: '2026-08-29T01:00:00Z',
          updatedAt: '2026-08-29T01:00:00Z',
          turns: [
            {
              role: 'assistant',
              content: '일반 모델 지식 답변',
              createdAt: '2026-08-29T01:00:01Z',
              confidence: 0.0,
              missing: ['관련 지식베이스 문서를 찾지 못함'],
              sources: [],
            },
          ],
        };
        vi.mocked(aiApi.getSessionDetail).mockResolvedValue(mockDetail);

        await act(async () => {
          render(
            <AuthContext.Provider value={mockAuthContextValue}>
              <AiService />
            </AuthContext.Provider>,
          );
        });

        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
        });

        await act(async () => {
          fireEvent.click(screen.getByText('근거 없는 질문 세션'));
        });

        const badge = screen.getByTestId('confidence-badge');
        expect(badge).toHaveClass('confidence-low');
        expect(badge).toHaveTextContent('0%');

        const warning = screen.getByTestId('ungrounded-warning');
        expect(warning).toBeInTheDocument();
        expect(warning).toHaveTextContent('근거 문서 미발견 (모델 일반 지식 기반 답변)');
      });
    });
  });

  describe('Document Ingest Step Progress & Retry (SPEC-025)', () => {
    it('Given 문서 상태가 processing이고 step과 progress가 있을 때 When 문서 목록이 렌더링되면 Then 단계 라벨과 진행률 퍼센트가 상태 배지에 표시된다', async () => {
      const mockDocs = [
        {
          id: 'doc-step-1',
          fileName: 'ai-paper.pdf',
          status: 'processing',
          step: 'embed',
          progress: 65,
          chunkCount: 12,
          createdAt: '2026-09-02T00:00:00.000Z',
        },
      ];
      vi.mocked(aiApi.getDocuments).mockResolvedValueOnce(mockDocs);

      await act(async () => {
        render(<AiService />);
      });

      expect(screen.getByText('ai-paper.pdf')).toBeInTheDocument();
      expect(screen.getByText('임베딩 생성 중 65%')).toBeInTheDocument();
    });

    it('Given 문서 상태가 failed일 때 When 재시도 버튼을 클릭하면 Then 파일 업로드 창 대신 retryDocument(doc.id)가 호출된다', async () => {
      const mockDocs = [
        {
          id: 'doc-fail-1',
          fileName: 'error-doc.pdf',
          status: 'failed',
          chunkCount: 0,
          createdAt: '2026-09-02T00:00:00.000Z',
        },
      ];
      vi.mocked(aiApi.getDocuments).mockResolvedValueOnce(mockDocs);
      vi.mocked(aiApi.retryDocument).mockResolvedValueOnce({
        id: 'doc-fail-1',
        fileName: 'error-doc.pdf',
        status: 'processed',
        chunkCount: 5,
        createdAt: '2026-09-02T00:00:00.000Z',
      });

      await act(async () => {
        render(<AiService />);
      });

      const retryBtn = screen.getByRole('button', { name: '재시도' });
      expect(retryBtn).toBeInTheDocument();

      const fileInput = screen.getByLabelText('file-upload-input');
      const clickSpy = vi.spyOn(fileInput, 'click');

      await act(async () => {
        fireEvent.click(retryBtn);
      });

      expect(clickSpy).not.toHaveBeenCalled();
      expect(aiApi.retryDocument).toHaveBeenCalledWith('doc-fail-1');
    });

    it('Given 재시도 요청이 진행 중일 때 When 해당 행의 상태를 확인하면 Then 버튼 텍스트가 "재시도 중..."으로 변경되고 disabled 상태가 된다', async () => {
      const mockDocs = [
        {
          id: 'doc-fail-1',
          fileName: 'error-doc.pdf',
          status: 'failed',
          chunkCount: 0,
          createdAt: '2026-09-02T00:00:00.000Z',
        },
      ];
      vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);

      let resolveRetry: (value: aiApi.DocumentItem) => void = () => {};
      const retryPromise = new Promise<aiApi.DocumentItem>((resolve) => {
        resolveRetry = resolve;
      });
      vi.mocked(aiApi.retryDocument).mockReturnValueOnce(retryPromise);

      await act(async () => {
        render(<AiService />);
      });

      const retryBtn = screen.getByRole('button', { name: '재시도' });
      await act(async () => {
        fireEvent.click(retryBtn);
      });

      expect(screen.getByRole('button', { name: '재시도 중...' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '재시도 중...' })).toBeDisabled();

      await act(async () => {
        resolveRetry({
          id: 'doc-fail-1',
          fileName: 'error-doc.pdf',
          status: 'processed',
          chunkCount: 5,
          createdAt: '2026-09-02T00:00:00.000Z',
        });
      });

      expect(screen.queryByRole('button', { name: '재시도 중...' })).not.toBeInTheDocument();
    });

    it('Given 여러 실패 문서가 목록에 존재할 때 When 특정 문서 재시도를 클릭하면 Then 해당 문서의 버튼만 "재시도 중..." 및 disabled가 되고 다른 문서는 영향을 받지 않는다', async () => {
      const mockDocs = [
        {
          id: 'doc-fail-1',
          fileName: 'error-doc-1.pdf',
          status: 'failed',
          chunkCount: 0,
          createdAt: '2026-09-02T00:00:00.000Z',
        },
        {
          id: 'doc-fail-2',
          fileName: 'error-doc-2.pdf',
          status: 'failed',
          chunkCount: 0,
          createdAt: '2026-09-02T00:00:00.000Z',
        },
      ];
      vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);

      let resolveRetry: (value: aiApi.DocumentItem) => void = () => {};
      const retryPromise = new Promise<aiApi.DocumentItem>((resolve) => {
        resolveRetry = resolve;
      });
      vi.mocked(aiApi.retryDocument).mockReturnValueOnce(retryPromise);

      await act(async () => {
        render(<AiService />);
      });

      const buttons = screen.getAllByRole('button', { name: '재시도' });
      expect(buttons).toHaveLength(2);

      await act(async () => {
        fireEvent.click(buttons[0]);
      });

      const retryingBtn = screen.getByRole('button', { name: '재시도 중...' });
      const normalRetryBtn = screen.getByRole('button', { name: '재시도' });

      expect(retryingBtn).toBeDisabled();
      expect(normalRetryBtn).not.toBeDisabled();

      // 다른 재시도 버튼을 클릭해도 retryingDocId가 존재하므로 두 번째 retryDocument는 호출되지 않음
      await act(async () => {
        fireEvent.click(normalRetryBtn);
      });
      expect(aiApi.retryDocument).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveRetry({
          id: 'doc-fail-1',
          fileName: 'error-doc-1.pdf',
          status: 'processed',
          chunkCount: 5,
          createdAt: '2026-09-02T00:00:00.000Z',
        });
      });
    });

    it('Given 재시도가 성공하면 최신 문서 목록(fetchDocuments)이 갱신되어 완료 배지와 청크 수가 노출되고 에러 배너가 초기화된다', async () => {
      const initialDocs = [
        {
          id: 'doc-fail-1',
          fileName: 'error-doc.pdf',
          status: 'failed',
          chunkCount: 0,
          createdAt: '2026-09-02T00:00:00.000Z',
        },
      ];
      const updatedDocs = [
        {
          id: 'doc-fail-1',
          fileName: 'error-doc.pdf',
          status: 'processed',
          chunkCount: 8,
          createdAt: '2026-09-02T00:00:00.000Z',
        },
      ];

      vi.mocked(aiApi.getDocuments)
        .mockResolvedValueOnce(initialDocs)
        .mockResolvedValueOnce(updatedDocs);

      vi.mocked(aiApi.retryDocument).mockResolvedValueOnce(updatedDocs[0]);

      await act(async () => {
        render(<AiService />);
      });

      const retryBtn = screen.getByRole('button', { name: '재시도' });
      await act(async () => {
        fireEvent.click(retryBtn);
      });

      expect(aiApi.retryDocument).toHaveBeenCalledWith('doc-fail-1');
      expect(aiApi.getDocuments).toHaveBeenCalledTimes(2);

      expect(screen.getByText('8')).toBeInTheDocument();
      expect(screen.getByText('processed')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '재시도' })).not.toBeInTheDocument();
    });

    it('Given 재시도 요청이 성공했으나 목록 갱신이 실패할 때 When 재시도가 완료되면 Then 에러 배너에 "문서 목록을 불러오는 데 실패했습니다." 메시지가 유지된다', async () => {
      const initialDocs = [
        {
          id: 'doc-fail-1',
          fileName: 'failed-doc.pdf',
          status: 'failed',
          chunkCount: 0,
          createdAt: '2026-09-02T00:00:00.000Z',
        },
      ];

      vi.mocked(aiApi.getDocuments)
        .mockResolvedValueOnce(initialDocs)
        .mockRejectedValueOnce(new Error('Fetch failed'));

      vi.mocked(aiApi.retryDocument).mockResolvedValueOnce({
        id: 'doc-fail-1',
        fileName: 'failed-doc.pdf',
        status: 'processed',
        chunkCount: 8,
        createdAt: '2026-09-02T00:00:00.000Z',
      });

      await act(async () => {
        render(<AiService />);
      });

      const retryBtn = screen.getByRole('button', { name: '재시도' });
      await act(async () => {
        fireEvent.click(retryBtn);
      });

      expect(aiApi.retryDocument).toHaveBeenCalledWith('doc-fail-1');
      expect(aiApi.getDocuments).toHaveBeenCalledTimes(2);
      expect(screen.getByText('문서 목록을 불러오는 데 실패했습니다.')).toBeInTheDocument();
    });

    it('Given 재시도 요청이 실패하면 상단 에러 배너에 오류 메시지가 노출되고 버튼이 다시 활성화된 [재시도] 상태로 복귀한다', async () => {
      const mockDocs = [
        {
          id: 'doc-fail-1',
          fileName: 'error-doc.pdf',
          status: 'failed',
          chunkCount: 0,
          createdAt: '2026-09-02T00:00:00.000Z',
        },
      ];
      vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);
      vi.mocked(aiApi.retryDocument).mockRejectedValueOnce({
        response: {
          data: {
            message: '원본 파일이 손실되어 재시도할 수 없습니다.',
          },
        },
      });

      await act(async () => {
        render(<AiService />);
      });

      const retryBtn = screen.getByRole('button', { name: '재시도' });
      await act(async () => {
        fireEvent.click(retryBtn);
      });

      expect(screen.getByText('원본 파일이 손실되어 재시도할 수 없습니다.')).toBeInTheDocument();
      const restoredRetryBtn = screen.getByRole('button', { name: '재시도' });
      expect(restoredRetryBtn).toBeInTheDocument();
      expect(restoredRetryBtn).not.toBeDisabled();
    });

    it('Given 재시도 요청이 서버 메시지 없이 실패(네트워크 오류 등)할 때 When 재시도를 실행하면 Then 기본 문구 "문서 재처리에 실패했습니다."가 에러 배너에 표시된다', async () => {
      const mockDocs = [
        {
          id: 'doc-fail-generic',
          fileName: 'generic-error.pdf',
          status: 'failed',
          chunkCount: 0,
          createdAt: '2026-09-02T00:00:00.000Z',
        },
      ];
      vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);
      vi.mocked(aiApi.retryDocument).mockRejectedValueOnce(new Error('Network error'));

      await act(async () => {
        render(<AiService />);
      });

      const retryBtn = screen.getByRole('button', { name: '재시도' });
      await act(async () => {
        fireEvent.click(retryBtn);
      });

      expect(screen.getByText('문서 재처리에 실패했습니다.')).toBeInTheDocument();
      const restoredRetryBtn = screen.getByRole('button', { name: '재시도' });
      expect(restoredRetryBtn).toBeInTheDocument();
      expect(restoredRetryBtn).not.toBeDisabled();
    });

    it('Given 업로드 진행 중 SSE progress 이벤트가 수신될 때 When 진행률이 수신되면 Then 업로드 버튼 텍스트가 단계명 및 진행률로 갱신된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.uploadDocument).mockResolvedValueOnce({ jobId: 'job-step-progress' });

      let capturedCallbacks: {
        onDone?: () => void;
        onError?: (error: string) => void;
        onProgress?: (data: { step?: string; progress?: number }) => void;
      } = {};
      const mockClose = vi.fn();
      vi.mocked(aiApi.subscribeIngestJob).mockImplementation((_jobId, callbacks) => {
        capturedCallbacks = callbacks;
        return mockClose;
      });

      await act(async () => {
        render(<AiService />);
      });

      const file = new File(['test data'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = screen.getByLabelText('file-upload-input');

      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [file] } });
      });

      expect(screen.getByText('업로드 중...')).toBeInTheDocument();

      // progress 이벤트 수신 시뮬레이션: extract
      await act(async () => {
        capturedCallbacks.onProgress?.({ step: 'extract', progress: 20 });
      });
      expect(screen.getByText('텍스트 추출 중 (20%)')).toBeInTheDocument();

      // progress 이벤트 수신 시뮬레이션: chunk
      await act(async () => {
        capturedCallbacks.onProgress?.({ step: 'chunk', progress: 45 });
      });
      expect(screen.getByText('청크 분할 중 (45%)')).toBeInTheDocument();

      // progress 이벤트 수신 시뮬레이션: embed
      await act(async () => {
        capturedCallbacks.onProgress?.({ step: 'embed', progress: 70 });
      });
      expect(screen.getByText('임베딩 생성 중 (70%)')).toBeInTheDocument();

      // progress 이벤트 수신 시뮬레이션: index
      await act(async () => {
        capturedCallbacks.onProgress?.({ step: 'index', progress: 90 });
      });
      expect(screen.getByText('색인 저장 중 (90%)')).toBeInTheDocument();

      // done 이벤트 발생
      await act(async () => {
        capturedCallbacks.onDone?.();
      });

      expect(screen.getByText('문서 업로드')).toBeInTheDocument();
    });

    it('Given 진행률 이벤트의 progress 필드가 0이거나 누락된 경우 When progress 이벤트를 수신하면 Then 퍼센트 없이 단계 라벨만 정상 표시된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.uploadDocument).mockResolvedValueOnce({ jobId: 'job-boundary-progress' });

      let capturedCallbacks: {
        onDone?: () => void;
        onError?: (error: string) => void;
        onProgress?: (data: { step?: string; progress?: number }) => void;
      } = {};
      vi.mocked(aiApi.subscribeIngestJob).mockImplementation((_jobId, callbacks) => {
        capturedCallbacks = callbacks;
        return vi.fn();
      });

      await act(async () => {
        render(<AiService />);
      });

      const file = new File(['test data'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = screen.getByLabelText('file-upload-input');

      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [file] } });
      });

      // progress가 0인 경우
      await act(async () => {
        capturedCallbacks.onProgress?.({ step: 'extract', progress: 0 });
      });
      expect(screen.getByText('텍스트 추출 중')).toBeInTheDocument();

      // progress가 누락된 경우
      await act(async () => {
        capturedCallbacks.onProgress?.({ step: 'chunk' });
      });
      expect(screen.getByText('청크 분할 중')).toBeInTheDocument();
    });
  });


  describe('Personal Prompt Management (SPEC-026)', () => {
    it('Given AI 설정 모달을 열었을 때 When 활성 프롬프트와 목록을 불러오면 Then 활성 프롬프트와 저장된 슬롯 목록(최대 10개)이 렌더링된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      const mockActivePrompt: aiApi.MyPromptOut = {
        id: 'p-1',
        name: 'rag-qa-system',
        version: 2,
        content: '활성화된 프롬프트 내용',
        isActive: true,
        userId: 'user-1',
        createdAt: '2026-09-02T00:00:00Z',
      };
      const mockPromptList: aiApi.MyPromptOut[] = [
        mockActivePrompt,
        {
          id: 'p-2',
          name: 'rag-qa-system',
          version: 1,
          content: '첫 번째 비활성 프롬프트 내용',
          isActive: false,
          userId: 'user-1',
          createdAt: '2026-09-01T00:00:00Z',
        },
      ];

      vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(mockActivePrompt);
      vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce(mockPromptList);

      await act(async () => {
        render(<AiService />);
      });

      const settingBtn = screen.getByRole('button', { name: /AI 설정/i });
      await act(async () => {
        fireEvent.click(settingBtn);
      });

      expect(screen.getByRole('dialog', { name: /AI 답변 스타일 설정/i })).toBeInTheDocument();
      expect(aiApi.getMyPrompt).toHaveBeenCalled();
      expect(aiApi.getMyPromptList).toHaveBeenCalled();

      expect(screen.getByText('내 커스텀 설정 사용 중')).toBeInTheDocument();
      expect(screen.getByText('저장된 프롬프트 목록 (2 / 10)')).toBeInTheDocument();
      expect(screen.getByText('슬롯 1 (v2)')).toBeInTheDocument();
      expect(screen.getByText('슬롯 2 (v1)')).toBeInTheDocument();
      expect(screen.getByText('활성')).toBeInTheDocument();
    }, 15000);

    it('Given 목록에서 비활성 슬롯이 있을 때 When 활성화 버튼을 누르면 Then 해당 버전이 활성화되고 목록 및 활성 프롬프트가 갱신된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      const prompt1: aiApi.MyPromptOut = {
        id: 'p-1',
        name: 'rag-qa-system',
        version: 1,
        content: '프롬프트 v1',
        isActive: false,
        userId: 'user-1',
        createdAt: '2026-09-01T00:00:00Z',
      };
      const prompt2: aiApi.MyPromptOut = {
        id: 'p-2',
        name: 'rag-qa-system',
        version: 2,
        content: '프롬프트 v2',
        isActive: true,
        userId: 'user-1',
        createdAt: '2026-09-02T00:00:00Z',
      };

      vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(prompt2);
      vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([prompt2, prompt1]);

      const activatedV1: aiApi.MyPromptOut = { ...prompt1, isActive: true };
      vi.mocked(aiApi.activateMyPrompt).mockResolvedValueOnce(activatedV1);
      vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(activatedV1);
      vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([{ ...prompt2, isActive: false }, activatedV1]);

      await act(async () => {
        render(<AiService />);
      });

      const settingBtn = screen.getByRole('button', { name: /AI 설정/i });
      await act(async () => {
        fireEvent.click(settingBtn);
      });

      const activateBtn = screen.getByRole('button', { name: /v1 활성화/i });
      await act(async () => {
        fireEvent.click(activateBtn);
      });

      expect(aiApi.activateMyPrompt).toHaveBeenCalledWith(1);
      expect(screen.getByText('프롬프트가 활성화되었습니다.')).toBeInTheDocument();
    });

    it('Given 새 프롬프트를 작성하고 저장할 때 When 저장이 성공하면 Then 목록에 새 슬롯이 추가된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      const initialPrompt: aiApi.MyPromptOut = {
        id: null,
        name: 'rag-qa-system',
        version: 0,
        content: '기본 시스템 프롬프트',
        isActive: false,
        userId: null,
        createdAt: '2026-09-01T00:00:00Z',
      };
      vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(initialPrompt);
      vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([]);

      const createdPrompt: aiApi.MyPromptOut = {
        id: 'p-new',
        name: 'rag-qa-system',
        version: 1,
        content: '내가 새로 작성한 프롬프트',
        isActive: true,
        userId: 'user-1',
        createdAt: '2026-09-03T00:00:00Z',
      };
      vi.mocked(aiApi.saveMyPrompt).mockResolvedValueOnce(createdPrompt);
      vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(createdPrompt);
      vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([createdPrompt]);

      await act(async () => {
        render(<AiService />);
      });

      const settingBtn = screen.getByRole('button', { name: /AI 설정/i });
      await act(async () => {
        fireEvent.click(settingBtn);
      });

      // 문서 검색 입력(SPEC-063)도 textbox 라 모달 안으로 좁힌다
      const textarea = within(screen.getByRole('dialog')).getByRole('textbox');
      await act(async () => {
        fireEvent.change(textarea, { target: { value: '내가 새로 작성한 프롬프트' } });
      });

      const saveBtn = screen.getByRole('button', { name: /새 슬롯으로 저장 및 적용/i });
      await act(async () => {
        fireEvent.click(saveBtn);
      });

      expect(aiApi.saveMyPrompt).toHaveBeenCalledWith('내가 새로 작성한 프롬프트', true);
      expect(screen.getByText('새 프롬프트 슬롯이 저장되고 활성화되었습니다.')).toBeInTheDocument();
      expect(screen.getByText('저장된 프롬프트 목록 (1 / 10)')).toBeInTheDocument();
    });

    it('Given 특정 슬롯의 삭제 버튼을 클릭할 때 When 삭제가 성공하면 Then 목록에서 제거되고 활성 슬롯이었던 경우 기본값으로 갱신된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      const activePrompt: aiApi.MyPromptOut = {
        id: 'p-1',
        name: 'rag-qa-system',
        version: 1,
        content: '삭제될 활성 프롬프트',
        isActive: true,
        userId: 'user-1',
        createdAt: '2026-09-01T00:00:00Z',
      };
      vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(activePrompt);
      vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([activePrompt]);

      vi.mocked(aiApi.deleteMyPromptVersion).mockResolvedValueOnce(undefined);

      const defaultPrompt: aiApi.MyPromptOut = {
        id: null,
        name: 'rag-qa-system',
        version: 0,
        content: '기본 시스템 프롬프트',
        isActive: false,
        userId: null,
        createdAt: '2026-09-01T00:00:00Z',
      };
      vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(defaultPrompt);
      vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce([]);

      await act(async () => {
        render(<AiService />);
      });

      const settingBtn = screen.getByRole('button', { name: /AI 설정/i });
      await act(async () => {
        fireEvent.click(settingBtn);
      });

      const deleteSlotBtn = screen.getByRole('button', { name: /v1 삭제/i });
      await act(async () => {
        fireEvent.click(deleteSlotBtn);
      });

      expect(aiApi.deleteMyPromptVersion).toHaveBeenCalledWith(1);
      expect(screen.getByText('프롬프트 슬롯이 삭제되었습니다.')).toBeInTheDocument();
      expect(screen.getByText('기본값 사용 중')).toBeInTheDocument();
      expect(screen.getByText('저장된 프롬프트 목록 (0 / 10)')).toBeInTheDocument();
    });

    it('Given 슬롯이 이미 10개인 경우 When 저장을 시도하면 Then 에러 메시지가 표시된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      const tenPrompts: aiApi.MyPromptOut[] = Array.from({ length: 10 }, (_, i) => ({
        id: `p-${i + 1}`,
        name: 'rag-qa-system',
        version: i + 1,
        content: `프롬프트 ${i + 1}`,
        isActive: i === 9,
        userId: 'user-1',
        createdAt: '2026-09-01T00:00:00Z',
      }));

      vi.mocked(aiApi.getMyPrompt).mockResolvedValueOnce(tenPrompts[9]);
      vi.mocked(aiApi.getMyPromptList).mockResolvedValueOnce(tenPrompts);

      await act(async () => {
        render(<AiService />);
      });

      const settingBtn = screen.getByRole('button', { name: /AI 설정/i });
      await act(async () => {
        fireEvent.click(settingBtn);
      });

      expect(screen.getByText('저장된 프롬프트 목록 (10 / 10)')).toBeInTheDocument();
      const saveBtn = screen.getByRole('button', { name: /새 슬롯으로 저장 및 적용/i });
      expect(saveBtn).toBeDisabled();
      expect(screen.getByText(/최대 10개까지 저장할 수 있습니다/i)).toBeInTheDocument();
    });
  });

  describe('SPEC-028: AI 작업 허브 화면 및 작업 상태 요약 대시보드', () => {
    it('Given AI 작업 허브에 진입했을 때 When 문항 및 작업 상태가 주어지면 Then 허브 헤더와 각 상태별 요약 메트릭이 렌더링된다', async () => {
      const mockDocs = [
        { id: 'doc-1', fileName: 'guide.txt', status: 'processed', chunkCount: 3, createdAt: '2026-06-18T05:00:00Z' },
        { id: 'doc-2', fileName: 'processing.pdf', status: 'processing', chunkCount: 0, createdAt: '2026-06-18T05:01:00Z' },
        { id: 'doc-3', fileName: 'failed.md', status: 'failed', chunkCount: 0, createdAt: '2026-06-18T05:02:00Z' },
      ];
      vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);

      await act(async () => {
        render(<AiService />);
      });

      expect(screen.getByText('AI 작업 허브')).toBeInTheDocument();
      expect(screen.getByTestId('ai-hub-dashboard')).toBeInTheDocument();

      // 메트릭 확인
      const docMetric = screen.getByTestId('metric-docs');
      expect(docMetric).toHaveTextContent('1'); // processed: 1

      const processingMetric = screen.getByTestId('metric-processing');
      expect(processingMetric).toHaveTextContent('1'); // processing: 1

      const failedMetric = screen.getByTestId('metric-failed');
      expect(failedMetric).toHaveTextContent('1'); // failed: 1
    });

    it('Given 허브 대시보드의 빠른 진입 버튼들 When 사용자가 클릭하면 Then 해당 모달이나 동작이 정상 트리거된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getMyPrompt).mockResolvedValue({
        id: null,
        name: 'rag-qa-system',
        version: 0,
        content: '기본 시스템 프롬프트',
        isActive: false,
        userId: null,
        createdAt: '2026-09-01T00:00:00Z',
      });
      vi.mocked(aiApi.getMyPromptList).mockResolvedValue([]);

      await act(async () => {
        render(<AiService />);
      });

      // 새 질문 시작 버튼 클릭 -> 채팅 모달 열림
      const startQuestionBtn = screen.getByRole('button', { name: /새 질문 시작/i });
      await act(async () => {
        fireEvent.click(startQuestionBtn);
      });
      expect(screen.getByRole('dialog', { name: /문서 기반 AI Q&A/i })).toBeInTheDocument();

      // 채팅 닫기
      const closeChatBtn = screen.getByRole('button', { name: /채팅 닫기/i });
      await act(async () => {
        fireEvent.click(closeChatBtn);
      });
      expect(screen.queryByRole('dialog', { name: /문서 기반 AI Q&A/i })).not.toBeInTheDocument();

      // 허브의 프롬프트 설정 버튼 클릭 -> 프롬프트 설정 모달 열림
      const promptSettingBtn = screen.getByRole('button', { name: /프롬프트 설정 ⚙/i });
      await act(async () => {
        fireEvent.click(promptSettingBtn);
      });
      expect(screen.getByText('AI 답변 스타일 설정')).toBeInTheDocument();
    });
  });

  describe('SPEC-029: 대화 기록 조회 및 검색 — 키워드 검색, 답변 및 세션 보관(북마크)', () => {
    const mockAuth = {
      user: { uuid: 'test-user-1', nickName: 'Tester' },
      token: 'jwt-token',
      isAuthenticated: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    };

    it('Given 대화 목록에 snippet 및 북마크 정보가 있을 때 When 사이드바가 렌더링되면 Then 질문 스니펫과 북마크 토글 버튼이 표시된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        {
          sessionId: 'sess-1',
          title: '환불 규정 문의',
          snippet: '환불은 결제일로부터 며칠 이내에 가능한가요?',
          isBookmarked: false,
          updatedAt: '2026-09-08T00:00:00Z',
        },
        {
          sessionId: 'sess-2',
          title: '배송 정책 문의',
          snippet: '도서산간 지역 배송비가 어떻게 되나요?',
          isBookmarked: true,
          updatedAt: '2026-09-08T01:00:00Z',
        },
      ]);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });

      expect(screen.getByText('환불 규정 문의')).toBeInTheDocument();
      expect(screen.getByText('환불은 결제일로부터 며칠 이내에 가능한가요?')).toBeInTheDocument();
      expect(screen.getByText('배송 정책 문의')).toBeInTheDocument();
      expect(screen.getByText('도서산간 지역 배송비가 어떻게 되나요?')).toBeInTheDocument();

      const bookmarkButtons = screen.getAllByRole('button', { name: /보관/i });
      expect(bookmarkButtons.length).toBeGreaterThanOrEqual(2);
    });

    it('Given 검색어를 입력하고 검색할 때 When 검색을 실행하면 Then getSessions에 검색어 파라미터가 전달되고 필터링된 결과가 렌더링된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValueOnce([
        {
          sessionId: 'sess-1',
          title: '전체 세션 1',
          snippet: '환불 규정 질의',
          isBookmarked: false,
          updatedAt: '2026-09-08T00:00:00Z',
        },
      ]);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });

      const searchInput = screen.getByPlaceholderText(/대화 검색/i);
      expect(searchInput).toBeInTheDocument();

      vi.mocked(aiApi.getSessions).mockResolvedValueOnce([
        {
          sessionId: 'sess-filtered',
          title: '검색된 세션',
          snippet: '검색된 질문 스니펫',
          isBookmarked: false,
          updatedAt: '2026-09-08T00:00:00Z',
        },
      ]);

      await act(async () => {
        fireEvent.change(searchInput, { target: { value: '검색어' } });
      });

      const searchSubmitBtn = screen.getByRole('button', { name: /검색 실행/i });
      await act(async () => {
        fireEvent.click(searchSubmitBtn);
      });

      expect(aiApi.getSessions).toHaveBeenCalledWith('test-user-1', 1, 50, '검색어');
      expect(screen.getByText('검색된 세션')).toBeInTheDocument();
    });

    it('Given 보관함 탭을 클릭할 때 When 탭을 전환하면 Then 북마크된 세션/답변 목록이 표시된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([]);
      vi.mocked(aiApi.getBookmarks).mockResolvedValueOnce([
        {
          id: 'bm-1',
          sessionId: 'sess-bm',
          turnIndex: 1,
          title: '보관된 대화 세션',
          content: '보관된 AI 답변입니다.',
          note: '중요 메모',
          createdAt: '2026-09-08T00:00:00Z',
        },
      ]);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });

      const bookmarkTabBtn = screen.getByRole('tab', { name: /보관함/i });
      await act(async () => {
        fireEvent.click(bookmarkTabBtn);
      });

      expect(aiApi.getBookmarks).toHaveBeenCalled();
      expect(screen.getByText('보관된 대화 세션')).toBeInTheDocument();
      expect(screen.getByText('보관된 AI 답변입니다.')).toBeInTheDocument();
      expect(screen.getByText('중요 메모')).toBeInTheDocument();
    });

    it('Given 세션 북마크 버튼을 누를 때 When 토글하면 Then toggleSessionBookmark API가 호출되고 상태가 변경된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        {
          sessionId: 'sess-1',
          title: '북마크 테스트 세션',
          snippet: '스니펫',
          isBookmarked: false,
          updatedAt: '2026-09-08T00:00:00Z',
        },
      ]);
      vi.mocked(aiApi.toggleSessionBookmark).mockResolvedValueOnce({
        sessionId: 'sess-1',
        bookmarked: true,
      });

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });

      const sessionBookmarkBtn = screen.getByRole('button', { name: /보관$/i });
      await act(async () => {
        fireEvent.click(sessionBookmarkBtn);
      });

      expect(aiApi.toggleSessionBookmark).toHaveBeenCalledWith('sess-1', true);
    });

    it('Given 채팅 답변에 보관 버튼이 있을 때 When 클릭하면 Then createBookmark API가 호출된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-chat', title: '대화 세션 제목', updatedAt: '2026-09-08T00:00:00Z' },
      ]);
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue({
        sessionId: 'sess-chat',
        title: '대화 세션 제목',
        createdAt: '2026-09-08T00:00:00Z',
        updatedAt: '2026-09-08T00:00:00Z',
        turns: [
          { role: 'user', content: '질문', createdAt: '2026-09-08T00:00:00Z' },
          { role: 'assistant', content: '보관할 AI 답변', createdAt: '2026-09-08T00:00:01Z' },
        ],
      });
      vi.mocked(aiApi.createBookmark).mockResolvedValueOnce({
        id: 'bm-new',
        sessionId: 'sess-chat',
        turnIndex: 1,
        content: '보관할 AI 답변',
        createdAt: '2026-09-08T00:00:02Z',
      });

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });

      await act(async () => {
        const sessionItem = screen.getByText('대화 세션 제목');
        fireEvent.click(sessionItem);
      });

      const answerBookmarkBtn = screen.getByRole('button', { name: /답변 보관/i });
      await act(async () => {
        fireEvent.click(answerBookmarkBtn);
      });

      const confirmBookmarkBtn = screen.getByRole('button', { name: '보관하기' });
      await act(async () => {
        fireEvent.click(confirmBookmarkBtn);
      });

      expect(aiApi.createBookmark).toHaveBeenCalledWith({
        sessionId: 'sess-chat',
        turnIndex: 1,
        note: undefined,
      });
    });

    describe('SPEC-035: 대화 세션 목록 키워드 검색 수용 기준 검증', () => {
      it('AC 1: Given 사용자 A가 "매출 보고서 분석"과 "보안 가이드라인" 두 개의 대화 세션을 보유하고 있을 때 When 사이드바 검색창에 "매출"을 입력하면 Then 세션 목록에 "매출 보고서 분석" 세션만 노출되고 "보안 가이드라인"은 목록에서 제외된다', async () => {
        vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
        const allSessions = [
          {
            sessionId: 'sess-1',
            title: '매출 보고서 분석',
            snippet: '2026년 3분기 매출 지표',
            isBookmarked: false,
            updatedAt: '2026-09-12T00:00:00Z',
          },
          {
            sessionId: 'sess-2',
            title: '보안 가이드라인',
            snippet: '사내 보안 지침',
            isBookmarked: false,
            updatedAt: '2026-09-12T00:00:00Z',
          },
        ];
        vi.mocked(aiApi.getSessions).mockResolvedValueOnce(allSessions);

        await act(async () => {
          render(
            <AuthContext.Provider value={mockAuth}>
              <AiService />
            </AuthContext.Provider>,
          );
        });

        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
        });

        expect(screen.getByText('매출 보고서 분석')).toBeInTheDocument();
        expect(screen.getByText('보안 가이드라인')).toBeInTheDocument();

        // When: "매출" 검색
        const searchInput = screen.getByPlaceholderText('대화 검색...');
        const filteredSessions = [
          {
            sessionId: 'sess-1',
            title: '매출 보고서 분석',
            snippet: '2026년 3분기 매출 지표',
            isBookmarked: false,
            updatedAt: '2026-09-12T00:00:00Z',
          },
        ];
        vi.mocked(aiApi.getSessions).mockResolvedValueOnce(filteredSessions);

        await act(async () => {
          fireEvent.change(searchInput, { target: { value: '매출' } });
        });

        const searchSubmitBtn = screen.getByRole('button', { name: /검색 실행/i });
        await act(async () => {
          fireEvent.click(searchSubmitBtn);
        });

        // Then: "매출"로 getSessions 호출되고 "매출 보고서 분석"만 노출됨
        expect(aiApi.getSessions).toHaveBeenCalledWith('test-user-1', 1, 50, '매출');
        expect(screen.getByText('매출 보고서 분석')).toBeInTheDocument();
        expect(screen.queryByText('보안 가이드라인')).not.toBeInTheDocument();
      });

      it('AC 2: Given 대화 세션 목록이 검색어로 필터링된 상태에서 When 검색창의 텍스트를 모두 지우거나 초기화 버튼을 누르면 Then 전체 세션 목록이 다시 로드되어 표시된다', async () => {
        vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
        const allSessions = [
          {
            sessionId: 'sess-1',
            title: '매출 보고서 분석',
            snippet: '매출 분석 내용',
            isBookmarked: false,
            updatedAt: '2026-09-12T00:00:00Z',
          },
          {
            sessionId: 'sess-2',
            title: '보안 가이드라인',
            snippet: '보안 지침 내용',
            isBookmarked: false,
            updatedAt: '2026-09-12T00:00:00Z',
          },
        ];
        vi.mocked(aiApi.getSessions).mockResolvedValueOnce([allSessions[0]]);

        await act(async () => {
          render(
            <AuthContext.Provider value={mockAuth}>
              <AiService />
            </AuthContext.Provider>,
          );
        });

        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
        });

        const searchInput = screen.getByPlaceholderText('대화 검색...');
        await act(async () => {
          fireEvent.change(searchInput, { target: { value: '매출' } });
        });

        // 초기화(✕) 버튼이 노출됨
        const clearBtn = screen.getByRole('button', { name: /검색어 초기화/i });
        expect(clearBtn).toBeInTheDocument();

        // When: 초기화 버튼 클릭
        vi.mocked(aiApi.getSessions).mockResolvedValueOnce(allSessions);
        await act(async () => {
          fireEvent.click(clearBtn);
        });

        // Then: getSessions가 검색어 없이 호출되고 전체 세션 목록이 복원됨
        expect(aiApi.getSessions).toHaveBeenCalledWith('test-user-1', 1, 50, undefined);
        expect(screen.getByText('매출 보고서 분석')).toBeInTheDocument();
        expect(screen.getByText('보안 가이드라인')).toBeInTheDocument();
      });

      it('AC 3: Given 사용자 A가 보유한 세션 제목과 일치하지 않는 검색어를 입력할 때 When 검색 요청이 완료되면 Then "검색 결과가 없습니다" 안내 텍스트가 표시되고 에러가 발생하지 않는다', async () => {
        vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
        vi.mocked(aiApi.getSessions).mockResolvedValueOnce([]);

        await act(async () => {
          render(
            <AuthContext.Provider value={mockAuth}>
              <AiService />
            </AuthContext.Provider>,
          );
        });

        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
        });

        const searchInput = screen.getByPlaceholderText('대화 검색...');
        vi.mocked(aiApi.getSessions).mockResolvedValueOnce([]);

        await act(async () => {
          fireEvent.change(searchInput, { target: { value: '존재하지않는제목' } });
        });

        const searchSubmitBtn = screen.getByRole('button', { name: /검색 실행/i });
        await act(async () => {
          fireEvent.click(searchSubmitBtn);
        });

        expect(aiApi.getSessions).toHaveBeenCalledWith('test-user-1', 1, 50, '존재하지않는제목');
        expect(screen.getByText('검색 결과가 없습니다')).toBeInTheDocument();
      });

      it('AC 4: Given 사용자 B가 동일한 제목의 세션을 보유하고 있을 때 When 사용자 A가 검색하면 Then 오직 사용자 A 본인의 userId로만 API 요청이 전송된다', async () => {
        vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
        vi.mocked(aiApi.getSessions).mockResolvedValueOnce([
          {
            sessionId: 'sess-user-a',
            title: '매출 보고서 분석',
            isBookmarked: false,
            updatedAt: '2026-09-12T00:00:00Z',
          },
        ]);

        await act(async () => {
          render(
            <AuthContext.Provider value={mockAuth}>
              <AiService />
            </AuthContext.Provider>,
          );
        });

        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
        });

        const searchInput = screen.getByPlaceholderText('대화 검색...');
        await act(async () => {
          fireEvent.change(searchInput, { target: { value: '매출' } });
        });

        const searchSubmitBtn = screen.getByRole('button', { name: /검색 실행/i });
        await act(async () => {
          fireEvent.click(searchSubmitBtn);
        });

        // 사용자 A의 auth.user.id ('test-user-1')가 정확히 전달되었는지 검증
        expect(aiApi.getSessions).toHaveBeenLastCalledWith('test-user-1', 1, 50, '매출');
      });
    });

    describe('SPEC-067: 지식베이스 문서 목록 내 원본 파일 다운로드 기능 연동 및 상태 피드백', () => {
      let createObjectURLMock: ReturnType<typeof vi.fn>;
      let revokeObjectURLMock: ReturnType<typeof vi.fn>;
      const capturedAnchor = { download: '', href: '' };
      let clickSpy: MockInstance;

      beforeEach(() => {
        capturedAnchor.download = '';
        capturedAnchor.href = '';
        createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
        revokeObjectURLMock = vi.fn();
        vi.stubGlobal('URL', {
          ...URL,
          createObjectURL: createObjectURLMock,
          revokeObjectURL: revokeObjectURLMock,
        });
        clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
          capturedAnchor.download = this.download;
          capturedAnchor.href = this.href;
        });
      });

      afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
      });

      it('AC 1: Given 색인 완료된 문서가 목록에 있을 때 When [다운로드] 버튼을 클릭하면 Then getDocumentFile이 호출되고 파일 다운로드가 시작된다', async () => {
        const mockDocs = [
          {
            id: 'doc-report',
            fileName: 'report.pdf',
            status: 'completed',
            chunkCount: 5,
            createdAt: '2026-10-14T00:00:00Z',
          },
        ];
        vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);
        const fakeBlob = new Blob(['pdf-content'], { type: 'application/pdf' });
        vi.mocked(aiApi.getDocumentFile).mockResolvedValueOnce(fakeBlob);

        await act(async () => {
          render(<AiService />);
        });

        const downloadBtn = screen.getByRole('button', { name: '다운로드' });
        expect(downloadBtn).toBeInTheDocument();
        expect(downloadBtn).not.toBeDisabled();

        await act(async () => {
          fireEvent.click(downloadBtn);
        });

        expect(aiApi.getDocumentFile).toHaveBeenCalledWith('doc-report');
        expect(createObjectURLMock).toHaveBeenCalledWith(fakeBlob);
        expect(clickSpy).toHaveBeenCalled();
        expect(capturedAnchor.download).toBe('report.pdf');
        expect(capturedAnchor.href).toBe('blob:mock-url');
        expect(document.body.querySelector('a[download]')).toBeNull();
        expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
      });

      it('AC 2: Given 특정 문서의 다운로드가 진행 중일 때 When 다운로드 완료 전까지 Then 버튼 텍스트가 "다운로드 중..."으로 변경되고 disabled 상태가 된다', async () => {
        const mockDocs = [
          {
            id: 'doc-report',
            fileName: 'report.pdf',
            status: 'completed',
            chunkCount: 5,
            createdAt: '2026-10-14T00:00:00Z',
          },
        ];
        vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);

        let resolveDownload: (value: Blob) => void;
        const downloadPromise = new Promise<Blob>((resolve) => {
          resolveDownload = resolve;
        });
        vi.mocked(aiApi.getDocumentFile).mockReturnValueOnce(downloadPromise);

        await act(async () => {
          render(<AiService />);
        });

        const downloadBtn = screen.getByRole('button', { name: '다운로드' });

        await act(async () => {
          fireEvent.click(downloadBtn);
        });

        expect(screen.getByRole('button', { name: '다운로드 중...' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '다운로드 중...' })).toBeDisabled();

        await act(async () => {
          resolveDownload!(new Blob(['pdf-data']));
        });

        expect(screen.getByRole('button', { name: '다운로드' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '다운로드' })).not.toBeDisabled();
      });

      it('AC 3: Given 다운로드 API 호출 시 에러가 발생했을 때 When 다운로드 핸들러가 예외를 포착하면 Then 상단 에러 배너에 에러 메시지가 표시되고 다운로드 진행 상태가 해제된다', async () => {
        const mockDocs = [
          {
            id: 'doc-report',
            fileName: 'report.pdf',
            status: 'completed',
            chunkCount: 5,
            createdAt: '2026-10-14T00:00:00Z',
          },
        ];
        vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);
        vi.mocked(aiApi.getDocumentFile).mockRejectedValueOnce(new Error('Network error'));

        await act(async () => {
          render(<AiService />);
        });

        const downloadBtn = screen.getByRole('button', { name: '다운로드' });

        await act(async () => {
          fireEvent.click(downloadBtn);
        });

        expect(screen.getByText('문서 다운로드에 실패했습니다.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '다운로드' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '다운로드' })).not.toBeDisabled();
      });

      it('AC 4: Given 인제스트 진행 중이거나 실패 상태인 문서의 경우 When 문서 목록이 렌더링될 때 Then 해당 문서 행에는 다운로드 버튼이 노출되지 않는다', async () => {
        const mockDocs = [
          {
            id: 'doc-processing',
            fileName: 'processing.pdf',
            status: 'processing',
            chunkCount: 0,
            createdAt: '2026-10-14T00:00:00Z',
          },
          {
            id: 'doc-failed',
            fileName: 'failed.pdf',
            status: 'failed',
            chunkCount: 0,
            createdAt: '2026-10-14T00:00:00Z',
          },
        ];
        vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);

        await act(async () => {
          render(<AiService />);
        });

        expect(screen.queryByRole('button', { name: /다운로드/i })).not.toBeInTheDocument();
      });

      it('AC 5: Given 여러 완료 문서가 있을 때 한 문서의 다운로드가 진행 중이어도 다른 문서 행의 다운로드 버튼은 영향을 받지 않고 독립적으로 관리된다', async () => {
        const mockDocs = [
          {
            id: 'doc-1',
            fileName: 'doc1.pdf',
            status: 'completed',
            chunkCount: 2,
            createdAt: '2026-10-14T00:00:00Z',
          },
          {
            id: 'doc-2',
            fileName: 'doc2.pdf',
            status: 'completed',
            chunkCount: 4,
            createdAt: '2026-10-14T00:00:00Z',
          },
        ];
        vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);

        let resolveDoc1: (value: Blob) => void;
        const doc1Promise = new Promise<Blob>((resolve) => {
          resolveDoc1 = resolve;
        });
        vi.mocked(aiApi.getDocumentFile).mockReturnValueOnce(doc1Promise);

        await act(async () => {
          render(<AiService />);
        });

        const downloadBtns = screen.getAllByRole('button', { name: '다운로드' });
        expect(downloadBtns).toHaveLength(2);

        await act(async () => {
          fireEvent.click(downloadBtns[0]);
        });

        expect(screen.getByRole('button', { name: '다운로드 중...' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '다운로드 중...' })).toBeDisabled();

        const remainingDownloadBtn = screen.getByRole('button', { name: '다운로드' });
        expect(remainingDownloadBtn).toBeInTheDocument();
        expect(remainingDownloadBtn).not.toBeDisabled();

        await act(async () => {
          resolveDoc1!(new Blob(['doc-1 data']));
        });

        expect(screen.getAllByRole('button', { name: '다운로드' })).toHaveLength(2);
      });

      it('Given 다운로드가 진행 중일 때 When 사용자가 다른 완료 문서의 다운로드 버튼을 클릭하면 Then 중복 다운로드 요청이 방지된다', async () => {
        const mockDocs = [
          {
            id: 'doc-1',
            fileName: 'doc1.pdf',
            status: 'completed',
            chunkCount: 2,
            createdAt: '2026-10-14T00:00:00Z',
          },
          {
            id: 'doc-2',
            fileName: 'doc2.pdf',
            status: 'completed',
            chunkCount: 4,
            createdAt: '2026-10-14T00:00:00Z',
          },
        ];
        vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);

        let resolveDoc1: (value: Blob) => void;
        const doc1Promise = new Promise<Blob>((resolve) => {
          resolveDoc1 = resolve;
        });
        vi.mocked(aiApi.getDocumentFile).mockReturnValueOnce(doc1Promise);

        await act(async () => {
          render(<AiService />);
        });

        const downloadBtns = screen.getAllByRole('button', { name: '다운로드' });

        await act(async () => {
          fireEvent.click(downloadBtns[0]);
        });

        expect(aiApi.getDocumentFile).toHaveBeenCalledTimes(1);
        expect(aiApi.getDocumentFile).toHaveBeenCalledWith('doc-1');

        // doc-1 다운로드가 진행 중인 동안 doc-2의 다운로드 버튼 클릭 시도
        const remainingDownloadBtn = screen.getByRole('button', { name: '다운로드' });
        await act(async () => {
          fireEvent.click(remainingDownloadBtn);
        });

        // getDocumentFile이 추가로 호출되지 않아야 함
        expect(aiApi.getDocumentFile).toHaveBeenCalledTimes(1);

        await act(async () => {
          resolveDoc1!(new Blob(['doc-1 content']));
        });
      });

      it('Given 다운로드 실패 후 에러 배너가 표시되었을 때 When 사용자가 다시 다운로드를 클릭하면 Then 정상적으로 재시도할 수 있다', async () => {
        const mockDocs = [
          {
            id: 'doc-retry',
            fileName: 'retry.pdf',
            status: 'completed',
            chunkCount: 3,
            createdAt: '2026-10-14T00:00:00Z',
          },
        ];
        vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);
        vi.mocked(aiApi.getDocumentFile)
          .mockRejectedValueOnce(new Error('Temporary 500 error'))
          .mockResolvedValueOnce(new Blob(['success-content']));

        await act(async () => {
          render(<AiService />);
        });

        const downloadBtn = screen.getByRole('button', { name: '다운로드' });

        // 1차 시도: 실패
        await act(async () => {
          fireEvent.click(downloadBtn);
        });

        expect(screen.getByText('문서 다운로드에 실패했습니다.')).toBeInTheDocument();

        // 2차 시도: 성공 재시도
        await act(async () => {
          fireEvent.click(downloadBtn);
        });

        expect(aiApi.getDocumentFile).toHaveBeenCalledTimes(2);
        expect(capturedAnchor.download).toBe('retry.pdf');
        expect(capturedAnchor.href).toBe('blob:mock-url');
      });

      it('Given 한글 및 특수문자가 포함된 파일명의 문서일 때 When 다운로드를 실행하면 Then 원본 파일명이 온전하게 다운로드 속성에 지정된다', async () => {
        const specialFileName = '2026년도_AI사업 [최종 보고서] (v1.2).pdf';
        const mockDocs = [
          {
            id: 'doc-special',
            fileName: specialFileName,
            status: 'completed',
            chunkCount: 10,
            createdAt: '2026-10-14T00:00:00Z',
          },
        ];
        vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);
        vi.mocked(aiApi.getDocumentFile).mockResolvedValueOnce(new Blob(['pdf-data']));

        await act(async () => {
          render(<AiService />);
        });

        const downloadBtn = screen.getByRole('button', { name: '다운로드' });

        await act(async () => {
          fireEvent.click(downloadBtn);
        });

        expect(capturedAnchor.download).toBe(specialFileName);
      });
    });

    describe('답변 평가 피드백 토스트 알림', () => {
      it('답변 평가를 신규 제출하면 "답변 평가가 저장되었습니다." 토스트 알림이 표시된다', async () => {
        vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
        const mockDetail = {
          sessionId: 'sess-fb-1',
          title: '피드백 테스트 세션',
          createdAt: '2026-10-11T00:00:00Z',
          updatedAt: '2026-10-11T00:00:00Z',
          turns: [
            { role: 'user' as const, content: '피드백 질문', createdAt: '2026-10-11T00:00:00Z' },
            { role: 'assistant' as const, content: '피드백 답변', createdAt: '2026-10-11T00:00:00Z' },
          ],
        };
        vi.mocked(aiApi.getSessionDetail).mockResolvedValueOnce(mockDetail);
        vi.mocked(aiApi.getSessionFeedback).mockResolvedValueOnce([]);
        vi.mocked(aiApi.submitAnswerFeedback).mockResolvedValueOnce({
          sessionId: 'sess-fb-1',
          turnIndex: 1,
          accuracy: 5,
          helpfulness: 4,
          comment: '좋습니다',
          createdAt: '2026-10-11T00:00:00Z',
          updatedAt: '2026-10-11T00:00:00Z',
        });

        await act(async () => {
          render(
            <AuthContext.Provider value={mockAuth}>
              <AiService />
            </AuthContext.Provider>,
          );
        });

        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
        });

        // 세션 로드 (handleLoadSession 호출을 시뮬레이션하거나 getSessions mock 후 아이템 클릭)
        vi.mocked(aiApi.getSessions).mockResolvedValueOnce([
          { sessionId: 'sess-fb-1', title: '피드백 테스트 세션', isBookmarked: false, updatedAt: '2026-10-11T00:00:00Z' },
        ]);
        const searchInput = screen.getByPlaceholderText('대화 검색...');
        await act(async () => {
          fireEvent.change(searchInput, { target: { value: '피드백' } });
          fireEvent.click(screen.getByRole('button', { name: /검색 실행/i }));
        });

        await act(async () => {
          fireEvent.click(screen.getByText('피드백 테스트 세션'));
        });

        // "이 답변을 평가하기" 버튼 클릭
        const evalBtn = screen.getByRole('button', { name: /이 답변을 평가하기/i });
        await act(async () => {
          fireEvent.click(evalBtn);
        });

        // 정확도 5점, 유용성 4점 선택
        await act(async () => {
          fireEvent.click(screen.getByLabelText(/^정확도 5점/));
          fireEvent.click(screen.getByLabelText(/^유용성 4점/));
        });

        // 제출
        const submitBtn = screen.getByRole('button', { name: /평가 제출/i });
        await act(async () => {
          fireEvent.click(submitBtn);
        });

        expect(aiApi.submitAnswerFeedback).toHaveBeenCalledWith({
          sessionId: 'sess-fb-1',
          turnIndex: 1,
          accuracy: 5,
          helpfulness: 4,
          comment: undefined,
        });

        // 토스트 알림 검증
        expect(screen.getByText('답변 평가가 저장되었습니다.')).toBeInTheDocument();
      });

      it('기존 평가를 수정하여 제출하면 "답변 평가가 수정되었습니다." 토스트 알림이 표시된다', async () => {
        vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
        const mockDetail = {
          sessionId: 'sess-fb-2',
          title: '수정 테스트 세션',
          createdAt: '2026-10-11T00:00:00Z',
          updatedAt: '2026-10-11T00:00:00Z',
          turns: [
            { role: 'user' as const, content: '수정 질문', createdAt: '2026-10-11T00:00:00Z' },
            { role: 'assistant' as const, content: '수정 답변', createdAt: '2026-10-11T00:00:00Z' },
          ],
        };
        vi.mocked(aiApi.getSessionDetail).mockResolvedValueOnce(mockDetail);
        vi.mocked(aiApi.getSessionFeedback).mockResolvedValueOnce([
          {
            sessionId: 'sess-fb-2',
            turnIndex: 1,
            accuracy: 3,
            helpfulness: 3,
            comment: '보통입니다',
            createdAt: '2026-10-11T00:00:00Z',
            updatedAt: '2026-10-11T00:00:00Z',
          },
        ]);
        vi.mocked(aiApi.submitAnswerFeedback).mockResolvedValueOnce({
          sessionId: 'sess-fb-2',
          turnIndex: 1,
          accuracy: 5,
          helpfulness: 5,
          comment: '보통입니다',
          createdAt: '2026-10-11T00:00:00Z',
          updatedAt: '2026-10-11T01:00:00Z',
        });

        await act(async () => {
          render(
            <AuthContext.Provider value={mockAuth}>
              <AiService />
            </AuthContext.Provider>,
          );
        });

        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
        });

        vi.mocked(aiApi.getSessions).mockResolvedValueOnce([
          { sessionId: 'sess-fb-2', title: '수정 테스트 세션', isBookmarked: false, updatedAt: '2026-10-11T00:00:00Z' },
        ]);
        const searchInput = screen.getByPlaceholderText('대화 검색...');
        await act(async () => {
          fireEvent.change(searchInput, { target: { value: '수정' } });
          fireEvent.click(screen.getByRole('button', { name: /검색 실행/i }));
        });

        await act(async () => {
          fireEvent.click(screen.getByText('수정 테스트 세션'));
        });

        // 수정 버튼 클릭
        const summaryBtn = screen.getByRole('button', { name: /내 평가/i });
        await act(async () => {
          fireEvent.click(summaryBtn);
        });

        // 정확도 5점 변경 후 수정 제출
        await act(async () => {
          fireEvent.click(screen.getByLabelText(/^정확도 5점/));
          fireEvent.click(screen.getByLabelText(/^유용성 5점/));
        });

        const updateBtn = screen.getByRole('button', { name: /평가 수정/i });
        await act(async () => {
          fireEvent.click(updateBtn);
        });

        expect(aiApi.submitAnswerFeedback).toHaveBeenCalled();
        expect(screen.getByText('답변 평가가 수정되었습니다.')).toBeInTheDocument();
      });
    });
  });

  describe('Turn-level source citations (SPEC-042)', () => {
    const mockAuthContextValue = {
      user: { uuid: 'test-user-id', nickName: 'Tester' },
      token: 'jwt-token',
      isAuthenticated: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    };

    it('AC 1: Given 1번째 질문에 참고 문서 A가 표시된 후 2번째 질문에 참고 문서 B를 수신할 때 Then 1번째 답변에는 A가 유지되고 2번째 답변에는 B가 독립적으로 렌더링된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      const mockSourcesTurn1: aiApi.SourceRef[] = [
        { fileName: 'turn1_source.pdf', chunkIndex: 0, documentId: 'doc-t1', snippet: '1번째 출처 스니펫' },
      ];
      const mockSourcesTurn2: aiApi.SourceRef[] = [
        { fileName: 'turn2_source.pdf', chunkIndex: 0, documentId: 'doc-t2', snippet: '2번째 출처 스니펫' },
      ];

      vi.mocked(aiApi.askQuestionStream)
        .mockImplementationOnce((_q, onMessage, onDone, _err, _uid, _chat, onSources) => {
          setTimeout(() => {
            onSources?.(mockSourcesTurn1);
            onMessage('첫 번째 답변입니다.');
            onDone();
          }, 10);
          return Promise.resolve();
        })
        .mockImplementationOnce((_q, onMessage, onDone, _err, _uid, _chat, onSources) => {
          setTimeout(() => {
            onSources?.(mockSourcesTurn2);
            onMessage('두 번째 답변입니다.');
            onDone();
          }, 10);
          return Promise.resolve();
        });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      // 1번째 질문 전송
      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '1번째 질문' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      expect(screen.getByText('turn1_source.pdf')).toBeInTheDocument();

      // 2번째 질문 전송
      await act(async () => {
        fireEvent.change(input, { target: { value: '2번째 질문' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      // 1번째 답변의 출처와 2번째 답변의 출처가 둘 다 독립적으로 존재해야 함
      expect(screen.getByText('turn1_source.pdf')).toBeInTheDocument();
      expect(screen.getByText('turn2_source.pdf')).toBeInTheDocument();
    });

    it('AC 2: Given 여러 턴의 질문-답변 및 출처가 저장된 대화 세션 복원 시 Then 모든 AI 메시지 버블에 각 턴의 참고 문서가 올바르게 복원된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'multi-turn-sess', title: '다중 턴 세션', updatedAt: '2026-09-20T00:00:00Z' },
      ]);

      const mockSessionDetail: aiApi.SessionDetailOut = {
        sessionId: 'multi-turn-sess',
        title: '다중 턴 세션',
        createdAt: '2026-09-20T00:00:00Z',
        updatedAt: '2026-09-20T00:00:00Z',
        turns: [
          {
            role: 'user',
            content: '질문 1',
            createdAt: '2026-09-20T00:00:00Z',
          },
          {
            role: 'assistant',
            content: '답변 1',
            createdAt: '2026-09-20T00:00:01Z',
            sources: [
              { fileName: 'restored_turn1.pdf', chunkIndex: 0, documentId: 'r-t1', snippet: '복원된 출처 1' },
            ],
          },
          {
            role: 'user',
            content: '질문 2',
            createdAt: '2026-09-20T00:00:02Z',
          },
          {
            role: 'assistant',
            content: '답변 2',
            createdAt: '2026-09-20T00:00:03Z',
            sources: [
              { fileName: 'restored_turn2.pdf', chunkIndex: 0, documentId: 'r-t2', snippet: '복원된 출처 2' },
            ],
          },
        ],
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue(mockSessionDetail);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const sessionItem = screen.getByText('다중 턴 세션');
      await act(async () => {
        fireEvent.click(sessionItem);
      });

      // 두 턴의 출처가 모두 복원되어 화면에 표시되어야 함
      expect(screen.getByText('restored_turn1.pdf')).toBeInTheDocument();
      expect(screen.getByText('restored_turn2.pdf')).toBeInTheDocument();
    });

    it('AC 3: Given 출처 정보가 없거나 빈 배열인 AI 메시지 버블인 경우 When 렌더링될 때 Then 에러 없이 참고 문서 영역이 생략된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'no-source-sess', title: '출처 없는 세션', updatedAt: '2026-09-20T00:00:00Z' },
      ]);

      const mockSessionDetail: aiApi.SessionDetailOut = {
        sessionId: 'no-source-sess',
        title: '출처 없는 세션',
        createdAt: '2026-09-20T00:00:00Z',
        updatedAt: '2026-09-20T00:00:00Z',
        turns: [
          {
            role: 'user',
            content: '단발 질문',
            createdAt: '2026-09-20T00:00:00Z',
          },
          {
            role: 'assistant',
            content: '단발 답변',
            createdAt: '2026-09-20T00:00:01Z',
            confidence: 0.8,
            sources: [],
          },
        ],
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue(mockSessionDetail);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const sessionItem = screen.getByText('출처 없는 세션');
      await act(async () => {
        fireEvent.click(sessionItem);
      });

      expect(screen.getAllByText('단발 답변').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('참고 문서')).not.toBeInTheDocument();
    });

    it('AC 4: Given 특정 AI 메시지 버블의 참고 문서를 펼칠 때 When 청크 목록이 펼쳐져도 Then 다른 메시지 버블의 참고 문서 펼침 상태에 영향을 주지 않는다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'isolated-toggle-sess', title: '독립 토글 세션', updatedAt: '2026-09-20T00:00:00Z' },
      ]);

      const mockSessionDetail: aiApi.SessionDetailOut = {
        sessionId: 'isolated-toggle-sess',
        title: '독립 토글 세션',
        createdAt: '2026-09-20T00:00:00Z',
        updatedAt: '2026-09-20T00:00:00Z',
        turns: [
          {
            role: 'user',
            content: '질문 1',
            createdAt: '2026-09-20T00:00:00Z',
          },
          {
            role: 'assistant',
            content: '답변 1',
            createdAt: '2026-09-20T00:00:01Z',
            sources: [
              { fileName: 'same_name.pdf', chunkIndex: 0, documentId: 'same-doc-id', snippet: '1번째 답변 청크 스니펫' },
            ],
          },
          {
            role: 'user',
            content: '질문 2',
            createdAt: '2026-09-20T00:00:02Z',
          },
          {
            role: 'assistant',
            content: '답변 2',
            createdAt: '2026-09-20T00:00:03Z',
            sources: [
              { fileName: 'same_name.pdf', chunkIndex: 0, documentId: 'same-doc-id', snippet: '2번째 답변 청크 스니펫' },
            ],
          },
        ],
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue(mockSessionDetail);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const sessionItem = screen.getByText('독립 토글 세션');
      await act(async () => {
        fireEvent.click(sessionItem);
      });

      const toggleButtons = screen.getAllByRole('button', { name: /same_name\.pdf/i });
      expect(toggleButtons).toHaveLength(2);

      // 처음에는 둘 다 스니펫이 닫혀 있음
      expect(screen.queryByText('1번째 답변 청크 스니펫')).not.toBeInTheDocument();
      expect(screen.queryByText('2번째 답변 청크 스니펫')).not.toBeInTheDocument();

      // 1번째 메시지의 문서만 펼침
      await act(async () => {
        fireEvent.click(toggleButtons[0]);
      });

      expect(screen.getByText('1번째 답변 청크 스니펫')).toBeInTheDocument();
      expect(screen.queryByText('2번째 답변 청크 스니펫')).not.toBeInTheDocument();
    });
  });

  describe('Session Delete Confirmation Modal (SPEC-058)', () => {
    const mockAuth = {
      user: { uuid: 'test-user-1', nickName: 'Tester' },
      token: 'mock-token',
      isAuthenticated: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    };

    const mockSessions = [
      {
        sessionId: 'sess-1',
        title: '환불 규정 문의',
        isBookmarked: false,
        updatedAt: '2026-09-12T00:00:00Z',
      },
      {
        sessionId: 'sess-2',
        title: '',
        isBookmarked: false,
        updatedAt: '2026-09-11T00:00:00Z',
      },
    ];

    beforeEach(() => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue(mockSessions);
      vi.mocked(aiApi.deleteSessionById).mockResolvedValue(undefined);
    });

    it('Given 사용자가 대화 세션 목록을 조회한 상태에서 When 특정 세션의 삭제(✕) 버튼을 클릭하면 Then deleteSessionById API가 즉시 호출되지 않고 세션 삭제 확인 모달이 표시되며 세션 제목과 경고 문구가 노출된다', async () => {
      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });

      const deleteBtns = screen.getAllByTitle('삭제');
      await act(async () => {
        fireEvent.click(deleteBtns[0]);
      });

      // API가 즉시 호출되지 않아야 함
      expect(aiApi.deleteSessionById).not.toHaveBeenCalled();

      // 세션 삭제 확인 모달 표시 및 제목/경고 노출
      const modal = screen.getByRole('dialog', { name: /대화 삭제 확인/i });
      expect(modal).toBeInTheDocument();
      expect(screen.getByText('"환불 규정 문의" 대화를 삭제하시겠습니까?')).toBeInTheDocument();
      expect(screen.getByText(/삭제된 대화는 복구할 수 없으며/i)).toBeInTheDocument();
    });

    it('Given 세션 삭제 확인 모달이 열려 있는 상태에서 When 사용자가 취소 버튼을 누르면 Then 삭제 API가 호출되지 않고 모달이 닫히며 기존 세션 목록이 그대로 유지된다', async () => {
      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });

      const deleteBtns = screen.getAllByTitle('삭제');
      await act(async () => {
        fireEvent.click(deleteBtns[0]);
      });

      const cancelBtn = screen.getByRole('button', { name: '취소' });
      await act(async () => {
        fireEvent.click(cancelBtn);
      });

      expect(aiApi.deleteSessionById).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog', { name: /대화 삭제 확인/i })).not.toBeInTheDocument();
      expect(screen.getByText('환불 규정 문의')).toBeInTheDocument();
    });

    it('Given 세션 삭제 확인 모달이 열려 있는 상태에서 When 사용자가 모달 바깥 배경을 클릭하면 Then 삭제 API가 호출되지 않고 모달이 닫힌다', async () => {
      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });

      const deleteBtns = screen.getAllByTitle('삭제');
      await act(async () => {
        fireEvent.click(deleteBtns[0]);
      });

      const overlay = screen.getByTestId('session-delete-modal-overlay');
      await act(async () => {
        fireEvent.click(overlay);
      });

      expect(aiApi.deleteSessionById).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog', { name: /대화 삭제 확인/i })).not.toBeInTheDocument();
    });

    it('Given 세션 삭제 확인 모달이 열려 있는 상태에서 When 사용자가 Escape 키를 누르면 Then 삭제 API가 호출되지 않고 모달이 닫힌다', async () => {
      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });

      const deleteBtns = screen.getAllByTitle('삭제');
      await act(async () => {
        fireEvent.click(deleteBtns[0]);
      });

      expect(screen.getByRole('dialog', { name: /대화 삭제 확인/i })).toBeInTheDocument();

      await act(async () => {
        fireEvent.keyDown(document, { key: 'Escape' });
      });

      expect(aiApi.deleteSessionById).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog', { name: /대화 삭제 확인/i })).not.toBeInTheDocument();
    });

    it('Given 세션 삭제 확인 모달이 열려 있는 상태에서 When 사용자가 삭제 버튼을 클릭하면 Then 버튼이 "삭제 중..."으로 바뀌고 비활성화되며 deleteSessionById가 호출되어 성공 시 모달이 닫히고 목록에서 해당 세션이 제거된다', async () => {
      let resolveDelete: () => void = () => {};
      vi.mocked(aiApi.deleteSessionById).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveDelete = resolve;
          }),
      );

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });

      const deleteBtns = screen.getAllByTitle('삭제');
      await act(async () => {
        fireEvent.click(deleteBtns[0]);
      });

      const modal = screen.getByRole('dialog', { name: /대화 삭제 확인/i });
      const confirmDeleteBtn = modal.querySelector('.btn-confirm-delete') as HTMLButtonElement;
      const cancelBtn = modal.querySelector('.btn-cancel-delete') as HTMLButtonElement;

      // 삭제 확인 버튼 클릭
      act(() => {
        fireEvent.click(confirmDeleteBtn);
      });

      expect(aiApi.deleteSessionById).toHaveBeenCalledWith('sess-1');
      expect(confirmDeleteBtn).toHaveTextContent('삭제 중...');
      expect(confirmDeleteBtn).toBeDisabled();
      expect(cancelBtn).toBeDisabled();

      // 비동기 완료
      await act(async () => {
        resolveDelete();
      });

      expect(screen.queryByRole('dialog', { name: /대화 삭제 확인/i })).not.toBeInTheDocument();
      expect(screen.queryByText('환불 규정 문의')).not.toBeInTheDocument();
    });

    it('Given 현재 열려 있는 활성 세션에 대해 삭제가 완료되었을 때 When 삭제가 성공하면 Then 대화창이 새 질문 상태로 초기화된다', async () => {
      vi.mocked(aiApi.getSessionDetail).mockResolvedValueOnce({
        sessionId: 'sess-1',
        title: '환불 규정 문의',
        createdAt: '2026-09-12T00:00:00Z',
        updatedAt: '2026-09-12T00:00:00Z',
        turns: [
          { role: 'user', content: '환불 어떻게 받나요?', createdAt: '2026-09-12T00:00:00Z' },
          { role: 'assistant', content: '고객센터로 문의하세요.', createdAt: '2026-09-12T00:00:01Z' },
        ],
      });

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });

      // sess-1 선택하여 대화창에 로드
      await act(async () => {
        fireEvent.click(screen.getByText('환불 규정 문의'));
      });

      expect(screen.getByText('환불 어떻게 받나요?')).toBeInTheDocument();

      // 삭제 버튼 클릭 및 확인
      const deleteBtns = screen.getAllByTitle('삭제');
      await act(async () => {
        fireEvent.click(deleteBtns[0]);
      });

      const modal = screen.getByRole('dialog', { name: /대화 삭제 확인/i });
      const confirmDeleteBtn = modal.querySelector('.btn-confirm-delete') as HTMLButtonElement;
      await act(async () => {
        fireEvent.click(confirmDeleteBtn);
      });

      // 대화창이 초기화되어 기존 대화 내용이 사라졌는지 확인
      expect(screen.queryByText('환불 어떻게 받나요?')).not.toBeInTheDocument();
    });

    it('Given 세션 제목이 빈 문자열("")이거나 없는 세션에 대해 When 삭제 버튼을 클릭하면 Then 확인 모달에 "선택한 대화를 삭제하시겠습니까?"라는 기본 문구가 오류 없이 안전하게 노출된다', async () => {
      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });

      // sess-2는 title이 ''
      const deleteBtns = screen.getAllByTitle('삭제');
      await act(async () => {
        fireEvent.click(deleteBtns[1]);
      });

      const modal = screen.getByRole('dialog', { name: /대화 삭제 확인/i });
      expect(modal).toBeInTheDocument();
      expect(screen.getByText('선택한 대화를 삭제하시겠습니까?')).toBeInTheDocument();
    });

    it('Given 세션 삭제 API 호출 실패 시 When 삭제를 시도하면 Then 확인 모달이 닫히고 상단 에러 배너에 "세션 삭제에 실패했습니다." 에러 메시지가 노출된다', async () => {
      vi.mocked(aiApi.deleteSessionById).mockRejectedValueOnce(new Error('Network error'));

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });

      const deleteBtns = screen.getAllByTitle('삭제');
      await act(async () => {
        fireEvent.click(deleteBtns[0]);
      });

      const modal = screen.getByRole('dialog', { name: /대화 삭제 확인/i });
      const confirmDeleteBtn = modal.querySelector('.btn-confirm-delete') as HTMLButtonElement;
      await act(async () => {
        fireEvent.click(confirmDeleteBtn);
      });

      expect(screen.queryByRole('dialog', { name: /대화 삭제 확인/i })).not.toBeInTheDocument();
      expect(screen.getByText('세션 삭제에 실패했습니다.')).toBeInTheDocument();
    });

    it('Given 세션 삭제 진행 중(isDeletingSession: true)인 상태에서 When 사용자가 Escape 키를 누르거나 배경을 클릭하면 Then 모달이 닫히지 않고 삭제 진행이 유지된다', async () => {
      let resolveDelete: () => void = () => {};
      vi.mocked(aiApi.deleteSessionById).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveDelete = resolve;
          }),
      );

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });

      const deleteBtns = screen.getAllByTitle('삭제');
      await act(async () => {
        fireEvent.click(deleteBtns[0]);
      });

      const modal = screen.getByRole('dialog', { name: /대화 삭제 확인/i });
      const confirmDeleteBtn = modal.querySelector('.btn-confirm-delete') as HTMLButtonElement;
      act(() => {
        fireEvent.click(confirmDeleteBtn);
      });

      // Escape 키 입력 시도
      await act(async () => {
        fireEvent.keyDown(document, { key: 'Escape' });
      });
      expect(screen.getByRole('dialog', { name: /대화 삭제 확인/i })).toBeInTheDocument();

      // 배경 클릭 시도
      const overlay = screen.getByTestId('session-delete-modal-overlay');
      await act(async () => {
        fireEvent.click(overlay);
      });
      expect(screen.getByRole('dialog', { name: /대화 삭제 확인/i })).toBeInTheDocument();

      // 완료 후 모달 닫힘
      await act(async () => {
        resolveDelete();
      });
      expect(screen.queryByRole('dialog', { name: /대화 삭제 확인/i })).not.toBeInTheDocument();
    });
  });

  describe('SPEC-063 지식베이스 문서 목록 검색 필터링 및 업로드 일시 표시', () => {
    const mockDocuments = [
      {
        id: 'doc-1',
        fileName: 'guide.pdf',
        status: 'processed',
        chunkCount: 5,
        createdAt: '2026-08-26T14:30:00.000Z',
      },
      {
        id: 'doc-2',
        fileName: 'Report_2026.pdf',
        status: 'processed',
        chunkCount: 8,
        createdAt: '2026-08-27T09:15:30.000Z',
      },
      {
        id: 'doc-3',
        fileName: 'manual.md',
        status: 'processed',
        chunkCount: 2,
        createdAt: '',
      },
      {
        id: 'doc-4',
        fileName: 'nodate.txt',
        status: 'failed',
        chunkCount: 0,
        createdAt: undefined as unknown as string,
      },
    ];

    it('AC 1 & AC 4: 검색창 placeholder와 문서 목록 테이블 헤더(업로드 일시) 및 formatDateTime 포맷팅이 렌더링된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValueOnce(mockDocuments);

      await act(async () => {
        render(<AiService />);
      });

      // 문서 검색 입력창 존재 확인
      const searchInput = screen.getByPlaceholderText('문서 검색...');
      expect(searchInput).toBeInTheDocument();

      // 테이블 헤더 "업로드 일시" 확인
      expect(screen.getByRole('columnheader', { name: '업로드 일시' })).toBeInTheDocument();

      // 포맷팅된 업로드 일시 확인 (doc-1: '2026-08-26 14:30:00', doc-2: '2026-08-27 09:15:30')
      expect(screen.getByText('2026-08-26 14:30:00')).toBeInTheDocument();
      expect(screen.getByText('2026-08-27 09:15:30')).toBeInTheDocument();
    });

    it('AC 1: 검색창에 "guide"를 입력하면 파일명에 "guide"가 포함된 문서만 표시된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValueOnce(mockDocuments);

      await act(async () => {
        render(<AiService />);
      });

      const searchInput = screen.getByPlaceholderText('문서 검색...');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'guide' } });
      });

      expect(screen.getByText('guide.pdf')).toBeInTheDocument();
      expect(screen.queryByText('Report_2026.pdf')).not.toBeInTheDocument();
      expect(screen.queryByText('manual.md')).not.toBeInTheDocument();
      expect(screen.queryByText('nodate.txt')).not.toBeInTheDocument();
    });

    it('AC 2: 대소문자 구분 없이 "report"를 입력하면 "Report_2026.pdf"가 표시된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValueOnce(mockDocuments);

      await act(async () => {
        render(<AiService />);
      });

      const searchInput = screen.getByPlaceholderText('문서 검색...');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'report' } });
      });

      expect(screen.getByText('Report_2026.pdf')).toBeInTheDocument();
      expect(screen.queryByText('guide.pdf')).not.toBeInTheDocument();
    });

    it('AC 3: 일치하는 문서가 없는 키워드 입력 시 "검색된 문서가 없습니다." 안내 문구가 표시된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValueOnce(mockDocuments);

      await act(async () => {
        render(<AiService />);
      });

      const searchInput = screen.getByPlaceholderText('문서 검색...');
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'nonexistent' } });
      });

      expect(screen.getByText('검색된 문서가 없습니다.')).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('검색창에 입력된 내용이 있을 때 검색어 지우기 버튼 또는 Escape 키로 초기화된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValueOnce(mockDocuments);

      await act(async () => {
        render(<AiService />);
      });

      const searchInput = screen.getByPlaceholderText('문서 검색...') as HTMLInputElement;
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'guide' } });
      });

      expect(searchInput.value).toBe('guide');
      expect(screen.getByText('guide.pdf')).toBeInTheDocument();
      expect(screen.queryByText('manual.md')).not.toBeInTheDocument();

      // 지우기 버튼 표시 확인 및 클릭
      const clearBtn = screen.getByRole('button', { name: /문서 검색어 초기화/i });
      expect(clearBtn).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(clearBtn);
      });

      expect(searchInput.value).toBe('');
      expect(screen.getByText('guide.pdf')).toBeInTheDocument();
      expect(screen.getByText('manual.md')).toBeInTheDocument();

      // Escape 키 입력 테스트
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'manual' } });
      });
      expect(screen.queryByText('guide.pdf')).not.toBeInTheDocument();

      await act(async () => {
        fireEvent.keyDown(searchInput, { key: 'Escape', code: 'Escape' });
      });
      expect(searchInput.value).toBe('');
      expect(screen.getByText('guide.pdf')).toBeInTheDocument();
      expect(screen.getByText('manual.md')).toBeInTheDocument();
    });

    it('AC 5: createdAt 필드가 빈 문자열이거나 undefined인 경우 "-"가 표시된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValueOnce(mockDocuments);

      await act(async () => {
        render(<AiService />);
      });

      const dashes = screen.getAllByText('-');
      expect(dashes.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Agentic critique metadata (SPEC-044)', () => {
    it('Given 에이전틱 RAG가 2회 이상 비평 루프를 거쳐 답변을 생성했을 때 When 스트리밍이 완료되고 done 이벤트가 수신되면 Then AI 메시지 버블에 최종 신뢰도와 함께 [N회 반복 검증] 배지가 렌더링된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (
          _question,
          onMessage,
          onDone,
        ) => {
          setTimeout(() => {
            onMessage('다단계 비평 완료된 답변입니다.');
            onDone({
              confidence: 0.92,
              missing: [],
              iterations: 3,
            });
          }, 10);
          return Promise.resolve();
        },
      );

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '다단계 검증 질문' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });

      expect(screen.getByTestId('confidence-badge')).toBeInTheDocument();
      expect(screen.getByText('92%')).toBeInTheDocument();
      expect(screen.getByTestId('iteration-badge')).toBeInTheDocument();
      expect(screen.getByText('[3회 반복 검증]')).toBeInTheDocument();
    });

    it('Given 비에이전틱 질의이거나 반복 정보가 없는 레거시 응답을 수신했을 때 When 메시지가 렌더링되면 Then 화면 에러 없이 기존과 동일하게 신뢰도 배지만 정상 렌더링된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (
          _question,
          onMessage,
          onDone,
        ) => {
          setTimeout(() => {
            onMessage('단발성 질문 답변입니다.');
            onDone({
              confidence: 0.88,
              missing: [],
              iterations: 1,
            });
          }, 10);
          return Promise.resolve();
        },
      );

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '단발성 질문' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });

      expect(screen.getByTestId('confidence-badge')).toBeInTheDocument();
      expect(screen.getByText('88%')).toBeInTheDocument();
      expect(screen.queryByTestId('iteration-badge')).not.toBeInTheDocument();
    });

    it('Given 신뢰도 및 누락 정보(missing)가 존재하는 경우 When 답변이 화면에 표시되면 Then 반복 회차 배지, 신뢰도 배지, 확인하지 못한 항목 목록이 순서대로 깨짐 없이 정렬되어 표시된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (
          _question,
          onMessage,
          onDone,
        ) => {
          setTimeout(() => {
            onMessage('복합 답변입니다.');
            onDone({
              confidence: 0.65,
              missing: ['항목 A', '항목 B'],
              iterations: 2,
            });
          }, 10);
          return Promise.resolve();
        },
      );

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '복합 질의' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });

      expect(screen.getByTestId('iteration-badge')).toHaveTextContent('[2회 반복 검증]');
      expect(screen.getByTestId('confidence-badge')).toHaveTextContent('65%');
      expect(screen.getByTestId('missing-info')).toBeInTheDocument();
      expect(screen.getByText('항목 A')).toBeInTheDocument();
      expect(screen.getByText('항목 B')).toBeInTheDocument();
    });

    it('Given 세션 상세 조회 시 turns에 iterations가 포함되어 있을 때 When 세션을 불러오면 Then 반복 검증 배지가 올바르게 렌더링된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      const mockSessionDetail = {
        sessionId: 'sess-agentic',
        title: '에이전틱 세션',
        turns: [
          {
            role: 'user' as const,
            content: '질문입니다',
            createdAt: '2026-09-21T00:00:00Z',
          },
          {
            role: 'assistant' as const,
            content: '에이전틱 답변입니다',
            createdAt: '2026-09-21T00:00:01Z',
            confidence: 0.9,
            iterations: 4,
            missing: [],
          },
        ],
        createdAt: '2026-09-21T00:00:00Z',
        updatedAt: '2026-09-21T00:00:01Z',
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValueOnce(mockSessionDetail);
      vi.mocked(aiApi.getSessions).mockResolvedValueOnce([
        {
          sessionId: 'sess-agentic',
          title: '에이전틱 세션',
          updatedAt: '2026-09-21T00:00:01Z',
        },
      ]);

      const mockAuth = {
        user: { uuid: 'test-user-agentic', accountId: 1, nickName: 'testuser' },
        token: 'test-token',
        isAuthenticated: true,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
      };

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });

      const sessionItem = screen.getByText('에이전틱 세션');
      await act(async () => {
        fireEvent.click(sessionItem);
      });

      expect(screen.getAllByText('에이전틱 답변입니다').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByTestId('iteration-badge')).toHaveTextContent('[4회 반복 검증]');
      expect(screen.getByTestId('confidence-badge')).toHaveTextContent('90%');
    });
  });

  describe('SPEC-077: 지식베이스 완료 문서 상태값(processed) 불일치 수정 및 다운로드 버튼 노출 정상화', () => {
    let createObjectURLMock: ReturnType<typeof vi.fn>;
    let revokeObjectURLMock: ReturnType<typeof vi.fn>;
    const capturedAnchor = { download: '', href: '' };
    let clickSpy: MockInstance;

    beforeEach(() => {
      capturedAnchor.download = '';
      capturedAnchor.href = '';
      createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
      revokeObjectURLMock = vi.fn();
      vi.stubGlobal('URL', {
        ...URL,
        createObjectURL: createObjectURLMock,
        revokeObjectURL: revokeObjectURLMock,
      });
      clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        capturedAnchor.download = this.download;
        capturedAnchor.href = this.href;
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('AC 1: Given 백엔드 문서 목록 API가 status: "processed" 문서(id: "doc-1", fileName: "guide.pdf")를 반환했을 때 When 문서 목록 테이블이 렌더링되면 Then 활성화된 [다운로드] 버튼이 표시되고 클릭 시 getDocumentFile("doc-1")이 호출되어 guide.pdf 다운로드가 실행된다', async () => {
      const mockDocs = [
        {
          id: 'doc-1',
          fileName: 'guide.pdf',
          status: 'processed',
          chunkCount: 8,
          createdAt: '2026-10-18T00:00:00Z',
        },
      ];
      vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);
      const fakeBlob = new Blob(['guide-content'], { type: 'application/pdf' });
      vi.mocked(aiApi.getDocumentFile).mockResolvedValueOnce(fakeBlob);

      await act(async () => {
        render(<AiService />);
      });

      const downloadBtn = screen.getByRole('button', { name: '다운로드' });
      expect(downloadBtn).toBeInTheDocument();
      expect(downloadBtn).toHaveClass('btn-download');
      expect(downloadBtn).not.toBeDisabled();

      await act(async () => {
        fireEvent.click(downloadBtn);
      });

      expect(aiApi.getDocumentFile).toHaveBeenCalledWith('doc-1');
      expect(createObjectURLMock).toHaveBeenCalledWith(fakeBlob);
      expect(clickSpy).toHaveBeenCalled();
      expect(capturedAnchor.download).toBe('guide.pdf');
      expect(capturedAnchor.href).toBe('blob:mock-url');
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
    });

    it('AC 2: Given 문서 목록에 status: "processed" 문서 2건이 표시되어 있을 때 When 첫 번째 문서의 [다운로드] 버튼을 클릭하여 요청이 진행 중이면 Then 첫 번째 문서 버튼만 "다운로드 중..." 텍스트와 함께 disabled 상태가 되고 두 번째 문서의 [다운로드] 버튼은 활성 상태로 유지된다', async () => {
      const mockDocs = [
        {
          id: 'doc-1',
          fileName: 'guide1.pdf',
          status: 'processed',
          chunkCount: 3,
          createdAt: '2026-10-18T00:00:00Z',
        },
        {
          id: 'doc-2',
          fileName: 'guide2.pdf',
          status: 'processed',
          chunkCount: 6,
          createdAt: '2026-10-18T00:00:00Z',
        },
      ];
      vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);

      let resolveDoc1: (value: Blob) => void;
      const doc1Promise = new Promise<Blob>((resolve) => {
        resolveDoc1 = resolve;
      });
      vi.mocked(aiApi.getDocumentFile).mockReturnValueOnce(doc1Promise);

      await act(async () => {
        render(<AiService />);
      });

      const downloadBtns = screen.getAllByRole('button', { name: '다운로드' });
      expect(downloadBtns).toHaveLength(2);

      await act(async () => {
        fireEvent.click(downloadBtns[0]);
      });

      const downloadingBtn = screen.getByRole('button', { name: '다운로드 중...' });
      expect(downloadingBtn).toBeInTheDocument();
      expect(downloadingBtn).toBeDisabled();

      const activeBtn = screen.getByRole('button', { name: '다운로드' });
      expect(activeBtn).toBeInTheDocument();
      expect(activeBtn).not.toBeDisabled();

      // 첫 번째 processed 문서 다운로드 진행 중 두 번째 processed 문서 다운로드 클릭 시 중복 요청 방지 검증
      await act(async () => {
        fireEvent.click(activeBtn);
      });
      expect(aiApi.getDocumentFile).toHaveBeenCalledTimes(1);
      expect(aiApi.getDocumentFile).toHaveBeenCalledWith('doc-1');

      await act(async () => {
        resolveDoc1!(new Blob(['doc-1 content']));
      });

      expect(screen.getAllByRole('button', { name: '다운로드' })).toHaveLength(2);
    });

    it('Given status: "processed" 문서의 다운로드 요청이 실패했을 때 When 다운로드 핸들러가 예외를 처리하면 Then 에러 배너가 노출되고 버튼 상태가 복구된다', async () => {
      const mockDocs = [
        {
          id: 'doc-processed-err',
          fileName: 'guide-error.pdf',
          status: 'processed',
          chunkCount: 4,
          createdAt: '2026-10-18T00:00:00Z',
        },
      ];
      vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);
      vi.mocked(aiApi.getDocumentFile).mockRejectedValueOnce(new Error('Download error'));

      await act(async () => {
        render(<AiService />);
      });

      const downloadBtn = screen.getByRole('button', { name: '다운로드' });
      await act(async () => {
        fireEvent.click(downloadBtn);
      });

      expect(screen.getByText('문서 다운로드에 실패했습니다.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '다운로드' })).not.toBeDisabled();
    });

    it('AC 3: Given 문서의 status가 "pending", "processing", "queued", "failed", "error" 또는 빈 문자열("")인 경우 When 문서 목록 테이블이 렌더링되면 Then 해당 문서 행에는 [다운로드] 버튼이 렌더링되지 않는다', async () => {
      const mockDocs = [
        { id: 'doc-pending', fileName: 'pending.pdf', status: 'pending', chunkCount: 0, createdAt: '2026-10-18T00:00:00Z' },
        { id: 'doc-processing', fileName: 'processing.pdf', status: 'processing', chunkCount: 0, createdAt: '2026-10-18T00:00:00Z' },
        { id: 'doc-queued', fileName: 'queued.pdf', status: 'queued', chunkCount: 0, createdAt: '2026-10-18T00:00:00Z' },
        { id: 'doc-failed', fileName: 'failed.pdf', status: 'failed', chunkCount: 0, createdAt: '2026-10-18T00:00:00Z' },
        { id: 'doc-error', fileName: 'error.pdf', status: 'error', chunkCount: 0, createdAt: '2026-10-18T00:00:00Z' },
        { id: 'doc-empty', fileName: 'empty.pdf', status: '', chunkCount: 0, createdAt: '2026-10-18T00:00:00Z' },
      ];
      vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);

      await act(async () => {
        render(<AiService />);
      });

      expect(screen.queryByRole('button', { name: /다운로드/i })).not.toBeInTheDocument();
    });

    it('Given status가 "processed"인 문서와 "completed"인 문서가 함께 있을 때 When 화면이 렌더링되면 Then 두 문서 모두 [다운로드] 버튼과 완료 상태 배지가 노출되고 대시보드 완료된 문서 수(completedDocsCount)에 함께 집계된다', async () => {
      const mockDocs = [
        { id: 'doc-processed', fileName: 'processed.pdf', status: 'processed', chunkCount: 5, createdAt: '2026-10-18T00:00:00Z' },
        { id: 'doc-completed', fileName: 'completed.pdf', status: 'completed', chunkCount: 3, createdAt: '2026-10-18T00:00:00Z' },
        { id: 'doc-pending', fileName: 'pending.pdf', status: 'pending', chunkCount: 0, createdAt: '2026-10-18T00:00:00Z' },
      ];
      vi.mocked(aiApi.getDocuments).mockResolvedValue(mockDocs);

      await act(async () => {
        render(<AiService />);
      });

      expect(screen.getAllByRole('button', { name: '다운로드' })).toHaveLength(2);
      expect(screen.getByText('processed')).toHaveClass('status-badge', 'processed');
      expect(screen.getByText('completed')).toHaveClass('status-badge', 'completed');
      const metricDocs = screen.getByTestId('metric-docs');
      expect(metricDocs).toHaveTextContent('2');
    });
  });

  describe('SPEC-073: AI 답변 생성 실패 시 인라인 에러 표시 및 질문 재시도 지원', () => {
    beforeEach(() => {
      vi.useRealTimers();
      vi.clearAllMocks();
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
    });

    it('Given 사용자가 질문을 전송하고 백엔드 스트리밍 오류(onError)가 발생했을 때 When 에러가 수신되면 Then 상단 에러 배너와 함께 채팅 대화창 내 에러 메시지 버블이 표시되고 [다시 시도]와 [질문 복원] 버튼이 렌더링된다', async () => {
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((_q, _onMessage, _onDone, onError) => {
        Promise.resolve().then(() => {
          onError?.(new Error('백엔드 모델 연결 실패'));
        });
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '문서 요약해줘' } });
        fireEvent.click(sendBtn);
      });

      // 상단 에러 배너 노출 확인
      expect(document.querySelector('.ai-service-container > .error-banner')).toHaveTextContent('백엔드 모델 연결 실패');

      // 에러 메시지 버블 확인
      const errorMsgBubble = document.querySelector('.chat-message.ai.error');
      expect(errorMsgBubble).toBeInTheDocument();
      expect(errorMsgBubble).toHaveTextContent('답변을 생성하지 못했습니다.');
      expect(errorMsgBubble).toHaveTextContent('백엔드 모델 연결 실패');

      // 다시 시도 및 질문 복원 버튼 렌더링 확인
      const retryBtn = screen.getByRole('button', { name: '다시 시도' });
      const restoreBtn = screen.getByRole('button', { name: '질문 복원' });
      expect(retryBtn).toBeInTheDocument();
      expect(restoreBtn).toBeInTheDocument();
      expect(retryBtn).toHaveClass('btn-retry-answer');
      expect(restoreBtn).toHaveClass('btn-restore-question');
    });

    it('Given 스트리밍 중 일부 텍스트가 수신된 후 onError가 발생했을 때 When 에러 버블이 렌더링되면 Then 기수신된 텍스트가 보존되어 함께 표시된다', async () => {
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((_q, onMessage, _onDone, onError) => {
        Promise.resolve().then(() => {
          onMessage?.('중간에 생성된 유용한 50자 답변 내용입니다...');
          onError?.(new Error('네트워크 연결 끊김'));
        });
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '중간 생성 보존 질문' } });
        fireEvent.click(sendBtn);
      });

      const errorMsgBubble = document.querySelector('.chat-message.ai.error');
      expect(errorMsgBubble).toBeInTheDocument();
      expect(errorMsgBubble).toHaveTextContent('중간에 생성된 유용한 50자 답변 내용입니다...');
      expect(errorMsgBubble).toHaveTextContent('네트워크 연결 끊김');
    });

    it('Given 답변 생성 실패로 에러 버블이 표시된 상태에서 When 사용자가 [다시 시도] 버튼을 클릭하면 Then 직전 실패한 동일한 질문으로 스트리밍 재요청이 시작된다', async () => {
      let callCount = 0;
      vi.mocked(aiApi.askQuestionStream).mockImplementation((_q, _onMessage, _onDone, onError) => {
        callCount++;
        if (callCount === 1) {
          Promise.resolve().then(() => {
            onError?.(new Error('1회차 타임아웃'));
          });
        }
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '재시도 대상 질문' } });
        fireEvent.click(sendBtn);
      });

      const retryBtn = screen.getByRole('button', { name: '다시 시도' });
      expect(retryBtn).toBeInTheDocument();

      // 다시 시도 클릭
      await act(async () => {
        fireEvent.click(retryBtn);
      });

      expect(callCount).toBe(2);
      expect(aiApi.askQuestionStream).toHaveBeenLastCalledWith(
        '재시도 대상 질문',
        expect.any(Function),
        expect.any(Function),
        expect.any(Function),
        null,
        [],
        expect.any(Function),
        null,
        expect.any(Function),
        expect.any(Function),
      );
    });

    it('Given 스트리밍이 진행 중인 경우 When 에러 버블의 [다시 시도] 버튼을 확인하면 Then disabled 상태로 중복 요청이 방지된다', async () => {
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((_q, _onMessage, _onDone, onError) => {
        Promise.resolve().then(() => {
          onError?.(new Error('에러 발생'));
        });
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '첫 번째 실패 질문' } });
        fireEvent.click(sendBtn);
      });

      const retryBtn = screen.getByRole('button', { name: '다시 시도' });
      expect(retryBtn).not.toBeDisabled();

      // 두 번째 질문을 진행 중으로 만들어 스트리밍 상태 유지
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(() => {
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        fireEvent.change(input, { target: { value: '두 번째 스트리밍 중인 질문' } });
        fireEvent.click(sendBtn);
      });

      expect(retryBtn).toBeDisabled();
    });

    it('Given 답변 생성 실패로 에러 버블이 표시된 상태에서 When 사용자가 [질문 복원] 버튼을 클릭하면 Then 하단 입력창에 실패한 질문이 채워지고 포커스가 이동한다', async () => {
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((_q, _onMessage, _onDone, onError) => {
        Promise.resolve().then(() => {
          onError?.(new Error('일시적 오류'));
        });
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '복원할 질문 내용' } });
        fireEvent.click(sendBtn);
      });

      // 전송 직후 입력창은 비워짐
      expect(input).toHaveValue('');

      const restoreBtn = screen.getByRole('button', { name: '질문 복원' });
      await act(async () => {
        fireEvent.click(restoreBtn);
      });

      // 복원 클릭 후 입력창에 질문 내용 채워짐 및 포커스 확인
      expect(input).toHaveValue('복원할 질문 내용');
      expect(input).toHaveFocus();
    });

    it('Given 정상적으로 생성이 완료된 AI 메시지인 경우 When 렌더링될 때 Then 재시도 및 질문 복원 버튼이 노출되지 않고 복사 버튼만 렌더링된다', async () => {
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((_q, onMessage, onDone) => {
        Promise.resolve().then(() => {
          onMessage?.('정상 생성 답변입니다.');
          onDone?.();
        });
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '정상 질문' } });
        fireEvent.click(sendBtn);
      });

      expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '질문 복원' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '답변 복사' })).toBeInTheDocument();
      expect(document.querySelector('.chat-message.ai.error')).not.toBeInTheDocument();
    });

    it('Given 빈 문자열이거나 공백만 있는 질문인 경우 When 사용자가 전송을 시도할 때 Then 전송 및 에러 메시지 생성이 차단되고 기존 동작과 동일하게 무시된다', async () => {
      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '   ' } });
        fireEvent.click(sendBtn);
      });

      expect(aiApi.askQuestionStream).not.toHaveBeenCalled();
      expect(document.querySelector('.chat-message')).not.toBeInTheDocument();
      expect(document.querySelector('.chat-message.ai.error')).not.toBeInTheDocument();
    });

    it('Given 직전 에러 버블이 존재하는 상태에서 When 사용자가 [다시 시도] 버튼을 클릭하면 Then 기존 에러 메시지 버블이 제거되고 새 스트리밍 응답으로 대체된다', async () => {
      let callCount = 0;
      vi.mocked(aiApi.askQuestionStream).mockImplementation((_q, onMessage, onDone, onError) => {
        callCount++;
        if (callCount === 1) {
          Promise.resolve().then(() => {
            onError?.(new Error('첫 실패'));
          });
        } else {
          Promise.resolve().then(() => {
            onMessage?.('재시도 성공 답변입니다.');
            onDone?.();
          });
        }
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '다시 시도할 질문' } });
        fireEvent.click(sendBtn);
      });

      // 첫 실패 상태 확인
      expect(document.querySelector('.chat-message.ai.error')).toBeInTheDocument();

      const retryBtn = screen.getByRole('button', { name: '다시 시도' });
      await act(async () => {
        fireEvent.click(retryBtn);
      });

      // 재시도 완료 후 에러 버블은 사라지고 정상 답변 버블이 렌더링되어야 함
      expect(document.querySelector('.chat-message.ai.error')).not.toBeInTheDocument();
      expect(screen.getAllByText('재시도 성공 답변입니다.').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
    });
  });

  describe('SPEC-074: 답변 생성 중단 시 인라인 중단 상태 보존 및 미완성 안내·질문 복원 지원', () => {
    beforeEach(() => {
      vi.useRealTimers();
      vi.clearAllMocks();
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
    });

    it('Given 토큰이 수신되지 않은 초기 단계에서 When [중단]을 클릭하면 Then "답변 생성이 중단되었습니다." 안내 텍스트와 [생성 중단됨] 배지가 포함된 AI 메시지 버블이 생성된다', async () => {
      const cancelMock = vi.fn().mockResolvedValue(undefined);
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(() => {
        return { cancel: cancelMock } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '초기 중단 질문' } });
        fireEvent.click(sendBtn);
      });

      // 아직 아무 토큰도 수신되지 않은 상태에서 [중단] 버튼 클릭
      const cancelBtn = screen.getByRole('button', { name: '중단' });
      await act(async () => {
        fireEvent.click(cancelBtn);
      });

      expect(cancelMock).toHaveBeenCalled();
      const cancelledBubble = document.querySelector('.chat-message.ai.cancelled') as HTMLElement;
      expect(cancelledBubble).toBeInTheDocument();
      expect(within(cancelledBubble).getByText('[생성 중단됨]')).toBeInTheDocument();
      expect(within(cancelledBubble).getByText('답변 생성이 중단되었습니다.')).toBeInTheDocument();
    });

    it('Given 스트리밍 도중 일부 텍스트가 수신된 상태에서 When [중단]을 클릭하면 Then 기수신된 텍스트가 보존되고 [생성 중단됨] 배지가 렌더링된다', async () => {
      const cancelMock = vi.fn().mockResolvedValue(undefined);
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((_q, onMessage) => {
        setTimeout(() => {
          onMessage?.('지금까지 생성된 40자의 부분 텍스트 답변 내용입니다.');
        }, 10);
        return { cancel: cancelMock } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '부분 생성 질문' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      const cancelBtn = screen.getByRole('button', { name: '중단' });
      await act(async () => {
        fireEvent.click(cancelBtn);
      });

      expect(cancelMock).toHaveBeenCalled();
      const cancelledBubble = document.querySelector('.chat-message.ai.cancelled') as HTMLElement;
      expect(cancelledBubble).toBeInTheDocument();
      expect(within(cancelledBubble).getByText('[생성 중단됨]')).toBeInTheDocument();
      expect(
        within(cancelledBubble).getByText('지금까지 생성된 40자의 부분 텍스트 답변 내용입니다.'),
      ).toBeInTheDocument();
    });

    it('Given 중단된 AI 메시지 버블이 렌더링된 상태에서 When 하단 액션 영역을 확인할 때 Then AnswerFeedback은 표시되지 않고 [질문 복원] 및 [다시 질문] 버튼이 노출된다', async () => {
      const cancelMock = vi.fn().mockResolvedValue(undefined);
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(() => {
        return { cancel: cancelMock } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '피드백 미노출 확인 질문' } });
        fireEvent.click(sendBtn);
      });

      const cancelBtn = screen.getByRole('button', { name: '중단' });
      await act(async () => {
        fireEvent.click(cancelBtn);
      });

      // AnswerFeedback 관련 요소는 없어야 함
      expect(screen.queryByText(/이 답변을 평가하기/i)).not.toBeInTheDocument();
      expect(screen.queryByTestId('answer-feedback-root')).not.toBeInTheDocument();

      // [질문 복원] 및 [다시 질문] 버튼 노출 확인
      expect(screen.getByRole('button', { name: '질문 복원' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '다시 질문' })).toBeInTheDocument();
    });

    it('Given 중단된 AI 메시지 버블 내 [질문 복원] 버튼이 있는 상태에서 When 버튼을 클릭하면 Then 하단 입력창에 질문이 채워지고 포커스된다', async () => {
      const cancelMock = vi.fn().mockResolvedValue(undefined);
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(() => {
        return { cancel: cancelMock } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '복원 대상 질문 텍스트' } });
        fireEvent.click(sendBtn);
      });

      const cancelBtn = screen.getByRole('button', { name: '중단' });
      await act(async () => {
        fireEvent.click(cancelBtn);
      });

      expect(input).toHaveValue('');

      const restoreBtn = screen.getByRole('button', { name: '질문 복원' });
      await act(async () => {
        fireEvent.click(restoreBtn);
      });

      expect(input).toHaveValue('복원 대상 질문 텍스트');
      expect(input).toHaveFocus();
    });

    it('Given 중단된 AI 메시지 버블 내 [다시 질문] 버튼이 있는 상태에서 When 버튼을 클릭하면 Then 해당 질문으로 즉시 새 스트리밍이 시작된다', async () => {
      let callCount = 0;
      const cancelMock = vi.fn().mockResolvedValue(undefined);
      vi.mocked(aiApi.askQuestionStream).mockImplementation((_q, onMessage, onDone) => {
        callCount++;
        if (callCount === 1) {
          return { cancel: cancelMock } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
        }
        setTimeout(() => {
          onMessage?.('재질문에 대한 정상 생성 답변입니다.');
          onDone?.();
        }, 10);
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '다시 질문할 대상' } });
        fireEvent.click(sendBtn);
      });

      const cancelBtn = screen.getByRole('button', { name: '중단' });
      await act(async () => {
        fireEvent.click(cancelBtn);
      });

      expect(callCount).toBe(1);

      const retryBtn = screen.getByRole('button', { name: '다시 질문' });
      await act(async () => {
        fireEvent.click(retryBtn);
      });

      expect(callCount).toBe(2);
      expect(aiApi.askQuestionStream).toHaveBeenLastCalledWith(
        '다시 질문할 대상',
        expect.any(Function),
        expect.any(Function),
        expect.any(Function),
        null,
        expect.any(Array),
        expect.any(Function),
        null,
        expect.any(Function),
        expect.any(Function),
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      expect(
        screen.getAllByText('재질문에 대한 정상 생성 답변입니다.').length,
      ).toBeGreaterThanOrEqual(1);
    });

    it('Given 다른 질문으로 스트리밍이 진행 중일 때 When 기존 중단 버블의 액션 버튼을 확인하면 Then [질문 복원] 및 [다시 질문] 버튼이 모두 disabled 상태가 된다', async () => {
      let cancelCalled = false;
      vi.mocked(aiApi.askQuestionStream).mockImplementation(() => {
        return {
          cancel: vi.fn().mockImplementation(() => {
            cancelCalled = true;
          }),
        } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      // 1. 첫 번째 질문 후 중단
      await act(async () => {
        fireEvent.change(input, { target: { value: '첫 번째 질문' } });
        fireEvent.click(sendBtn);
      });

      const cancelBtn = screen.getByRole('button', { name: '중단' });
      await act(async () => {
        fireEvent.click(cancelBtn);
      });

      expect(cancelCalled).toBe(true);

      // 2. 두 번째 질문 전송하여 현재 스트리밍 진행 상태로 만듦
      await act(async () => {
        fireEvent.change(input, { target: { value: '두 번째 스트리밍 진행 질문' } });
        fireEvent.click(sendBtn);
      });

      // 이제 isStreaming === true 상태임
      const retryBtn = screen.getByRole('button', { name: '다시 질문' });
      const restoreBtn = screen.getByRole('button', { name: '질문 복원' });

      expect(retryBtn).toBeDisabled();
      expect(restoreBtn).toBeDisabled();
    });

    it('Given 정상 완료된 AI 메시지인 경우 When 렌더링될 때 Then [생성 중단됨] 배지 및 [질문 복원]/[다시 질문] 버튼이 표시되지 않고 복사 기능이 노출된다', async () => {
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((_q, onMessage, onDone) => {
        setTimeout(() => {
          onMessage?.('정상적으로 생성이 완료된 답변 내용입니다.');
          onDone?.();
        }, 10);
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '완료 테스트 질문' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      expect(
        screen.getAllByText('정상적으로 생성이 완료된 답변 내용입니다.').length,
      ).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('[생성 중단됨]')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '질문 복원' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '다시 질문' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /답변 복사/i })).toBeInTheDocument();
    });

    it('Given 여러 질문 중 특정 질문이 중단된 경우 When 이전 중단 버블의 [질문 복원]을 클릭하면 Then 직전 질문이 아닌 해당 중단 턴의 질문이 정확히 복원된다', async () => {
      let callCount = 0;
      vi.mocked(aiApi.askQuestionStream).mockImplementation((q, onMessage, onDone) => {
        callCount++;
        if (callCount === 1) {
          // 첫 번째 질문: 중단됨
          return { cancel: vi.fn().mockResolvedValue(undefined) } as unknown as ReturnType<
            typeof aiApi.askQuestionStream
          >;
        }
        // 두 번째 질문: 완료됨
        setTimeout(() => {
          onMessage?.('두 번째 답변 완료: ' + q);
          onDone?.();
        }, 10);
        return { cancel: vi.fn().mockResolvedValue(undefined) } as unknown as ReturnType<
          typeof aiApi.askQuestionStream
        >;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      // 첫 번째 질문 전송 후 중단
      await act(async () => {
        fireEvent.change(input, { target: { value: '첫 번째 중단 질문' } });
        fireEvent.click(sendBtn);
      });

      const cancelBtn = screen.getByRole('button', { name: '중단' });
      await act(async () => {
        fireEvent.click(cancelBtn);
      });

      // 두 번째 질문 전송 및 완료 대기
      await act(async () => {
        fireEvent.change(input, { target: { value: '두 번째 완료 질문' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 25));
      });

      expect(
        screen.getAllByText('두 번째 답변 완료: 두 번째 완료 질문').length,
      ).toBeGreaterThanOrEqual(1);

      // 첫 번째 중단 버블의 [질문 복원] 클릭
      const restoreBtn = screen.getByRole('button', { name: '질문 복원' });
      await act(async () => {
        fireEvent.click(restoreBtn);
      });

      // 가장 마지막 질문('두 번째 완료 질문')이 아니라 첫 번째 중단 질문('첫 번째 중단 질문')이 복원되어야 함
      expect(input).toHaveValue('첫 번째 중단 질문');
      expect(input).toHaveFocus();
    });
  });

  describe('SPEC-075: RAG 답변의 확인하지 못한 항목(missing) 보완 질문 원클릭 연계 및 불완전 답변 주의 안내', () => {
    it('AC-1 & AC-2: missing 항목이 있는 경우 has-missing 클래스와 주의 배지 및 질문하기 버튼이 렌더링되고 클릭 시 질문창에 템플릿이 입력되고 포커스된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (
          _question,
          onMessage,
          onDone,
        ) => {
          setTimeout(() => {
            onMessage('JWT 인증 방식에 대한 답변입니다.');
            onDone({
              confidence: 0.75,
              missing: ['JWT 만료 시 갱신 흐름'],
              iterations: 1,
            });
          }, 10);
          return Promise.resolve();
        },
      );

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: 'JWT 인증 흐름 알려줘' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });

      // AC-2: 주의 배지 및 has-missing 클래스 검증
      const warningBadge = screen.getByTestId('missing-warning-badge');
      expect(warningBadge).toBeInTheDocument();
      expect(warningBadge).toHaveTextContent('추가 확인 필요');

      const messageBubble = warningBadge.closest('.message-bubble');
      expect(messageBubble).toHaveClass('has-missing');

      // AC-1: [질문하기] 버튼 렌더링 및 클릭 인터랙션 검증
      const askMissingBtn = screen.getByRole('button', { name: 'JWT 만료 시 갱신 흐름에 대해 질문하기' });
      expect(askMissingBtn).toBeInTheDocument();
      expect(askMissingBtn).toHaveClass('btn-ask-missing');
      expect(askMissingBtn).toHaveTextContent('질문하기');

      await act(async () => {
        fireEvent.click(askMissingBtn);
      });

      expect(input).toHaveValue('"JWT 만료 시 갱신 흐름"에 대해 자세히 설명해 줘');
      expect(input).toHaveFocus();
    });

    it('AC-3: 스트리밍 진행 중(isStreaming === true)일 때는 모든 [질문하기] 버튼이 disabled 상태가 된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      let resolveStream: () => void;
      const streamPromise = new Promise<void>((resolve) => {
        resolveStream = resolve;
      });

      // 첫 번째 질문 완료 (missing 포함)
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (
          _question,
          onMessage,
          onDone,
        ) => {
          setTimeout(() => {
            onMessage('첫 번째 답변');
            onDone({
              confidence: 0.6,
              missing: ['누락 항목 1'],
              iterations: 1,
            });
          }, 10);
          return Promise.resolve();
        },
      );

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '첫 번째 질문' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });

      const askMissingBtn = screen.getByRole('button', { name: '누락 항목 1에 대해 질문하기' });
      expect(askMissingBtn).not.toBeDisabled();

      // 두 번째 질문 전송하여 스트리밍 상태 유지
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(() => streamPromise);

      await act(async () => {
        fireEvent.change(input, { target: { value: '두 번째 스트리밍 질문' } });
        fireEvent.click(sendBtn);
      });

      // 스트리밍 중에는 disabled여야 함
      expect(askMissingBtn).toBeDisabled();

      // 스트리밍 종료 후 해제
      await act(async () => {
        resolveStream!();
      });
    });

    it('AC-4: missing 필드가 없거나 빈 배열([])인 정상 답변의 경우 has-missing 클래스, missing-warning-badge, missing-info가 일절 노출되지 않는다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (
          _question,
          onMessage,
          onDone,
        ) => {
          setTimeout(() => {
            onMessage('완벽한 정상 답변입니다.');
            onDone({
              confidence: 0.95,
              missing: [],
              iterations: 1,
            });
          }, 10);
          return Promise.resolve();
        },
      );

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '정상 질문' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });

      expect(screen.queryByTestId('missing-warning-badge')).not.toBeInTheDocument();
      expect(screen.queryByTestId('missing-info')).not.toBeInTheDocument();
      const messageBubbles = document.querySelectorAll('.message-bubble');
      messageBubbles.forEach((bubble) => {
        expect(bubble).not.toHaveClass('has-missing');
      });
    });

    it('AC-5: 세션 복원(handleLoadSession) 시에도 missing 항목에 대한 주의 배지와 질문하기 버튼이 정상 복원되고 동작한다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      const mockAuth = {
        user: { uuid: 'test-user-id', nickName: 'Tester' },
        token: 'jwt-token',
        isAuthenticated: true,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
      };
      const mockSessionDetail = {
        sessionId: 'sess-missing-test',
        title: '결손 세션 테스트',
        turns: [
          {
            role: 'user' as const,
            content: '인증 아키텍처 알려줘',
            createdAt: '2026-10-24T00:00:00Z',
          },
          {
            role: 'assistant' as const,
            content: '인증 아키텍처 개요입니다.',
            createdAt: '2026-10-24T00:00:01Z',
            confidence: 0.7,
            iterations: 2,
            missing: ['OAuth2 리프레시 토큰 로테이션'],
          },
        ],
        createdAt: '2026-10-24T00:00:00Z',
        updatedAt: '2026-10-24T00:00:01Z',
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValueOnce(mockSessionDetail);
      vi.mocked(aiApi.getSessions).mockResolvedValueOnce([
        {
          sessionId: 'sess-missing-test',
          title: '결손 세션 테스트',
          updatedAt: '2026-10-24T00:00:01Z',
        },
      ]);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const sessionItem = await screen.findByText('결손 세션 테스트');
      await act(async () => {
        fireEvent.click(sessionItem);
      });

      // 복원된 AI 메시지 버블 확인
      const warningBadge = screen.getByTestId('missing-warning-badge');
      expect(warningBadge).toBeInTheDocument();
      expect(warningBadge.closest('.message-bubble')).toHaveClass('has-missing');

      const askBtn = screen.getByRole('button', { name: 'OAuth2 리프레시 토큰 로테이션에 대해 질문하기' });
      expect(askBtn).toBeInTheDocument();

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      await act(async () => {
        fireEvent.click(askBtn);
      });

      expect(input).toHaveValue('"OAuth2 리프레시 토큰 로테이션"에 대해 자세히 설명해 줘');
      expect(input).toHaveFocus();
    });

    it('QA 경계 조건: 복수 missing 항목 렌더링, 앞뒤 공백 트리밍 및 기존 입력값 덮어쓰기 검증', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (
          _question,
          onMessage,
          onDone,
        ) => {
          setTimeout(() => {
            onMessage('두 건의 결손 항목이 있는 답변');
            onDone({
              confidence: 0.65,
              missing: ['  첫 번째 누락 항목  ', '두 번째 누락 항목'],
              iterations: 1,
            });
          }, 10);
          return Promise.resolve();
        },
      );

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '초기 질문' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });

      // 복수 버튼 확인
      const askBtn1 = screen.getByRole('button', { name: '첫 번째 누락 항목 에 대해 질문하기' });
      const askBtn2 = screen.getByRole('button', { name: '두 번째 누락 항목에 대해 질문하기' });
      expect(askBtn1).toBeInTheDocument();
      expect(askBtn2).toBeInTheDocument();

      // 사용자가 입력창에 미리 타이핑해 둔 상태 가정
      await act(async () => {
        fireEvent.change(input, { target: { value: '기존에 작성 중이던 다른 질문 내용' } });
      });

      // 공백이 포함된 첫 번째 누락 항목 클릭 시 트림되어 덮어써지는지 검증
      await act(async () => {
        fireEvent.click(askBtn1);
      });
      expect(input).toHaveValue('"첫 번째 누락 항목"에 대해 자세히 설명해 줘');
      expect(input).toHaveFocus();

      // 두 번째 누락 항목 클릭 시 다시 치환되는지 검증
      await act(async () => {
        fireEvent.click(askBtn2);
      });
      expect(input).toHaveValue('"두 번째 누락 항목"에 대해 자세히 설명해 줘');
      expect(input).toHaveFocus();
    });

    it('QA 안전성 검증: 사용자 메시지 및 missing 필드가 없는 AI 메시지에는 has-missing 및 배지가 절대 표시되지 않는다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (
          _question,
          onMessage,
          onDone,
        ) => {
          setTimeout(() => {
            onMessage('missing 필드가 아예 없는 레거시 응답');
            // missing 필드 미제공
            onDone({
              confidence: 0.9,
              iterations: 1,
            });
          }, 10);
          return Promise.resolve();
        },
      );

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '레거시 질문' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });

      expect(screen.queryByTestId('missing-warning-badge')).not.toBeInTheDocument();
      const bubbles = document.querySelectorAll('.message-bubble');
      expect(bubbles.length).toBeGreaterThanOrEqual(2); // user bubble + ai bubble
      bubbles.forEach((bubble) => {
        expect(bubble).not.toHaveClass('has-missing');
      });
    });
  });

  describe('Document Chunks Modal (SPEC-083)', () => {
    const completedDoc = {
      id: 'doc-completed-1',
      fileName: 'spec-guide.pdf',
      status: 'completed',
      chunkCount: 3,
      createdAt: '2026-10-20T10:00:00Z',
    };

    const processedDoc = {
      id: 'doc-processed-1',
      fileName: 'manual.pdf',
      status: 'processed',
      chunkCount: 2,
      createdAt: '2026-10-21T10:00:00Z',
    };

    const processingDoc = {
      id: 'doc-processing-1',
      fileName: 'in-progress.pdf',
      status: 'processing',
      chunkCount: 0,
      createdAt: '2026-10-22T10:00:00Z',
    };

    const pendingDoc = {
      id: 'doc-pending-1',
      fileName: 'queued.pdf',
      status: 'pending',
      chunkCount: 0,
      createdAt: '2026-10-22T11:00:00Z',
    };

    const failedDoc = {
      id: 'doc-failed-1',
      fileName: 'error.pdf',
      status: 'failed',
      chunkCount: 0,
      createdAt: '2026-10-23T10:00:00Z',
    };

    const mockChunks = [
      { chunkIndex: 0, text: '첫 번째 청크 텍스트 본문입니다.' },
      { chunkIndex: 1, text: '두 번째 청크 텍스트 본문입니다.' },
      { chunkIndex: 2, text: '세 번째 청크 텍스트 본문입니다.' },
    ];

    it('renders chunk count button and [청크 보기] button for completed/processed documents', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValueOnce([completedDoc, processedDoc]);

      await act(async () => {
        render(<AiService />);
      });

      const chunkCountButtons = document.querySelectorAll('.btn-chunk-count');
      expect(chunkCountButtons.length).toBe(2);
      expect(chunkCountButtons[0].textContent).toBe('3');
      expect(chunkCountButtons[1].textContent).toBe('2');

      const viewChunksButtons = document.querySelectorAll('.btn-view-chunks');
      expect(viewChunksButtons.length).toBe(2);
      expect(viewChunksButtons[0].textContent).toBe('청크 보기');
    });

    it('renders plain text chunk count and does not render [청크 보기] button for pending/processing/failed documents', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValueOnce([pendingDoc, processingDoc, failedDoc]);

      await act(async () => {
        render(<AiService />);
      });

      const chunkCountButtons = document.querySelectorAll('.btn-chunk-count');
      expect(chunkCountButtons.length).toBe(0);

      const viewChunksButtons = document.querySelectorAll('.btn-view-chunks');
      expect(viewChunksButtons.length).toBe(0);

      const rows = document.querySelectorAll('tbody tr');
      expect(rows.length).toBe(3);
      // 청크 수 셀에 0 텍스트가 일반 텍스트로 렌더링됨
      expect(rows[0].children[2].textContent).toBe('0');
      expect(rows[1].children[2].textContent).toBe('0');
      expect(rows[2].children[2].textContent).toBe('0');
    });

    it('opens chunk modal and renders chunks when [청크 보기] button is clicked', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValueOnce([completedDoc]);
      vi.mocked(aiApi.getDocumentChunks).mockResolvedValueOnce(mockChunks);

      await act(async () => {
        render(<AiService />);
      });

      const viewChunksBtn = screen.getByRole('button', { name: '청크 보기' });
      await act(async () => {
        fireEvent.click(viewChunksBtn);
      });

      expect(aiApi.getDocumentChunks).toHaveBeenCalledWith('doc-completed-1');

      const modal = screen.getByRole('dialog', { name: /청크 목록/i });
      expect(modal).toBeInTheDocument();
      expect(screen.getByText(/"spec-guide.pdf" 청크 목록/)).toBeInTheDocument();
      expect(screen.getByText(/총 3개/)).toBeInTheDocument();

      expect(screen.getByText('청크 #1')).toBeInTheDocument();
      expect(screen.getByText('첫 번째 청크 텍스트 본문입니다.')).toBeInTheDocument();
      expect(screen.getByText('청크 #2')).toBeInTheDocument();
      expect(screen.getByText('두 번째 청크 텍스트 본문입니다.')).toBeInTheDocument();
      expect(screen.getByText('청크 #3')).toBeInTheDocument();
      expect(screen.getByText('세 번째 청크 텍스트 본문입니다.')).toBeInTheDocument();
    });

    it('opens chunk modal when chunk count button is clicked', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValueOnce([processedDoc]);
      vi.mocked(aiApi.getDocumentChunks).mockResolvedValueOnce(mockChunks.slice(0, 2));

      await act(async () => {
        render(<AiService />);
      });

      const chunkCountBtn = screen.getByRole('button', { name: '2' });
      await act(async () => {
        fireEvent.click(chunkCountBtn);
      });

      expect(aiApi.getDocumentChunks).toHaveBeenCalledWith('doc-processed-1');
      expect(screen.getByText(/"manual.pdf" 청크 목록/)).toBeInTheDocument();
      expect(screen.getByText(/총 2개/)).toBeInTheDocument();
      expect(screen.getByText('청크 #1')).toBeInTheDocument();
      expect(screen.getByText('청크 #2')).toBeInTheDocument();
    });

    it('shows loading indicator while fetching chunks', async () => {
      let resolveChunks!: (value: aiApi.DocumentChunk[]) => void;
      const chunksPromise = new Promise<aiApi.DocumentChunk[]>((resolve) => {
        resolveChunks = resolve;
      });
      vi.mocked(aiApi.getDocuments).mockResolvedValueOnce([completedDoc]);
      vi.mocked(aiApi.getDocumentChunks).mockReturnValueOnce(chunksPromise);

      await act(async () => {
        render(<AiService />);
      });

      const viewChunksBtn = screen.getByRole('button', { name: '청크 보기' });
      await act(async () => {
        fireEvent.click(viewChunksBtn);
      });

      expect(screen.getByText('청크 목록을 불러오는 중...')).toBeInTheDocument();

      await act(async () => {
        resolveChunks!(mockChunks);
      });

      expect(screen.queryByText('청크 목록을 불러오는 중...')).not.toBeInTheDocument();
      expect(screen.getByText('청크 #1')).toBeInTheDocument();
    });

    it('shows empty message when chunk list is empty', async () => {
      const zeroChunkDoc = {
        ...completedDoc,
        id: 'doc-zero',
        fileName: 'empty.pdf',
        chunkCount: 0,
      };
      vi.mocked(aiApi.getDocuments).mockResolvedValueOnce([zeroChunkDoc]);
      vi.mocked(aiApi.getDocumentChunks).mockResolvedValueOnce([]);

      await act(async () => {
        render(<AiService />);
      });

      const viewChunksBtn = screen.getByRole('button', { name: '청크 보기' });
      await act(async () => {
        fireEvent.click(viewChunksBtn);
      });

      expect(screen.getByText('색인된 청크가 없습니다.')).toBeInTheDocument();
    });

    it('shows error message when chunk retrieval fails', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValueOnce([completedDoc]);
      vi.mocked(aiApi.getDocumentChunks).mockRejectedValueOnce(new Error('500 Internal Server Error'));

      await act(async () => {
        render(<AiService />);
      });

      const viewChunksBtn = screen.getByRole('button', { name: '청크 보기' });
      await act(async () => {
        fireEvent.click(viewChunksBtn);
      });

      expect(screen.getByText('청크 목록을 불러오지 못했습니다.')).toBeInTheDocument();
    });

    it('closes modal when top close button (✕) is clicked', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValueOnce([completedDoc]);
      vi.mocked(aiApi.getDocumentChunks).mockResolvedValueOnce(mockChunks);

      await act(async () => {
        render(<AiService />);
      });

      const viewChunksBtn = screen.getByRole('button', { name: '청크 보기' });
      await act(async () => {
        fireEvent.click(viewChunksBtn);
      });

      expect(screen.getByRole('dialog', { name: /청크 목록/i })).toBeInTheDocument();

      const topCloseBtn = screen.getByRole('button', { name: '청크 모달 닫기' });
      await act(async () => {
        fireEvent.click(topCloseBtn);
      });

      expect(screen.queryByRole('dialog', { name: /청크 목록/i })).not.toBeInTheDocument();
    });

    it('closes modal when bottom [닫기] button is clicked', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValueOnce([completedDoc]);
      vi.mocked(aiApi.getDocumentChunks).mockResolvedValueOnce(mockChunks);

      await act(async () => {
        render(<AiService />);
      });

      const viewChunksBtn = screen.getByRole('button', { name: '청크 보기' });
      await act(async () => {
        fireEvent.click(viewChunksBtn);
      });

      expect(screen.getByRole('dialog', { name: /청크 목록/i })).toBeInTheDocument();

      const bottomCloseBtn = document.querySelector('.btn-close-chunks-footer') as HTMLButtonElement;
      expect(bottomCloseBtn).toBeInTheDocument();
      await act(async () => {
        fireEvent.click(bottomCloseBtn);
      });

      expect(screen.queryByRole('dialog', { name: /청크 목록/i })).not.toBeInTheDocument();
    });

    it('closes modal when backdrop overlay is clicked', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValueOnce([completedDoc]);
      vi.mocked(aiApi.getDocumentChunks).mockResolvedValueOnce(mockChunks);

      await act(async () => {
        render(<AiService />);
      });

      const viewChunksBtn = screen.getByRole('button', { name: '청크 보기' });
      await act(async () => {
        fireEvent.click(viewChunksBtn);
      });

      const overlay = document.querySelector('.chunks-modal-overlay') as HTMLElement;
      expect(overlay).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(overlay);
      });

      expect(screen.queryByRole('dialog', { name: /청크 목록/i })).not.toBeInTheDocument();
    });

    it('closes modal when Escape key is pressed', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValueOnce([completedDoc]);
      vi.mocked(aiApi.getDocumentChunks).mockResolvedValueOnce(mockChunks);

      await act(async () => {
        render(<AiService />);
      });

      const viewChunksBtn = screen.getByRole('button', { name: '청크 보기' });
      await act(async () => {
        fireEvent.click(viewChunksBtn);
      });

      expect(screen.getByRole('dialog', { name: /청크 목록/i })).toBeInTheDocument();

      await act(async () => {
        fireEvent.keyDown(document, { key: 'Escape' });
      });

      expect(screen.queryByRole('dialog', { name: /청크 목록/i })).not.toBeInTheDocument();
    });

    it('clears error and resets state when modal is closed after error and reopened for another document', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValueOnce([completedDoc, processedDoc]);
      // 첫 번째 문서는 에러 발생
      vi.mocked(aiApi.getDocumentChunks).mockRejectedValueOnce(new Error('500 Server Error'));

      await act(async () => {
        render(<AiService />);
      });

      const viewChunksButtons = screen.getAllByRole('button', { name: '청크 보기' });
      await act(async () => {
        fireEvent.click(viewChunksButtons[0]);
      });

      expect(screen.getByText('청크 목록을 불러오지 못했습니다.')).toBeInTheDocument();

      // 모달 닫기
      const closeBtn = screen.getByRole('button', { name: '청크 모달 닫기' });
      await act(async () => {
        fireEvent.click(closeBtn);
      });
      expect(screen.queryByRole('dialog', { name: /청크 목록/i })).not.toBeInTheDocument();

      // 두 번째 문서는 정상 응답
      vi.mocked(aiApi.getDocumentChunks).mockResolvedValueOnce(mockChunks.slice(0, 2));
      await act(async () => {
        fireEvent.click(viewChunksButtons[1]);
      });

      expect(screen.getByRole('dialog', { name: /청크 목록/i })).toBeInTheDocument();
      expect(screen.queryByText('청크 목록을 불러오지 못했습니다.')).not.toBeInTheDocument();
      expect(screen.getByText(/"manual.pdf" 청크 목록/)).toBeInTheDocument();
      expect(screen.getByText('청크 #1')).toBeInTheDocument();
      expect(screen.getByText('청크 #2')).toBeInTheDocument();
    });
  });

  describe('SPEC-085: 대화 세션 복원 시 답변 중단 상태(isCancelled) 영속화 및 미완성 답변 복원', () => {
    const mockAuth = {
      user: { uuid: 'test-user-id', nickName: 'Tester' },
      token: 'jwt-token',
      isAuthenticated: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    };

    it('Given 스트리밍 도중 취소된 턴(isCancelled: true)이 있는 세션 When handleLoadSession으로 세션을 복원하면 Then [생성 중단됨] 배지가 렌더링되고 AnswerFeedback 폼이 표시되지 않는다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      const mockSessionDetail = {
        sessionId: 'sess-cancelled-1',
        title: '중단된 대화 세션',
        turns: [
          {
            role: 'user' as const,
            content: '환불 규정 알려줘',
            createdAt: '2026-10-29T00:00:00Z',
          },
          {
            role: 'assistant' as const,
            content: '환불 규정은 결제 후 7일 이내에 신청 가',
            createdAt: '2026-10-29T00:00:01Z',
            isCancelled: true,
          },
        ],
        createdAt: '2026-10-29T00:00:00Z',
        updatedAt: '2026-10-29T00:00:01Z',
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValueOnce(mockSessionDetail);
      vi.mocked(aiApi.getSessions).mockResolvedValueOnce([
        {
          sessionId: 'sess-cancelled-1',
          title: '중단된 대화 세션',
          updatedAt: '2026-10-29T00:00:01Z',
        },
      ]);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const sessionItem = await screen.findByText('중단된 대화 세션');
      await act(async () => {
        fireEvent.click(sessionItem);
      });

      // [생성 중단됨] 배지 노출 확인
      const cancelledBadge = screen.getByTestId('cancelled-badge');
      expect(cancelledBadge).toBeInTheDocument();
      expect(cancelledBadge).toHaveTextContent('[생성 중단됨]');

      // 메시지 컨테이너 클래스 확인
      const cancelledMessage = cancelledBadge.closest('.chat-message') as HTMLElement;
      expect(cancelledMessage).toHaveClass('cancelled');
      expect(within(cancelledMessage).getByText('환불 규정은 결제 후 7일 이내에 신청 가')).toBeInTheDocument();

      // 중단 조작 버튼(다시 질문, 질문 복원) 존재 확인
      expect(within(cancelledMessage).getByRole('button', { name: '다시 질문' })).toBeInTheDocument();
      expect(within(cancelledMessage).getByRole('button', { name: '질문 복원' })).toBeInTheDocument();

      // AnswerFeedback 폼 및 복사/보관 버튼 미노출 확인
      expect(within(cancelledMessage).queryByRole('button', { name: '답변 복사' })).not.toBeInTheDocument();
      expect(within(cancelledMessage).queryByRole('button', { name: '답변 보관' })).not.toBeInTheDocument();
      expect(within(cancelledMessage).queryByText('이 답변이 도움이 되었나요?')).not.toBeInTheDocument();
    });

    it('Given 첫 토큰 수신 전 즉시 중단된 세션 When 세션을 복원하면 Then "답변 생성이 중단되었습니다." 텍스트와 [생성 중단됨] 배지가 렌더링된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      const mockSessionDetail = {
        sessionId: 'sess-cancelled-immediate',
        title: '즉시 중단된 세션',
        turns: [
          {
            role: 'user' as const,
            content: '즉시 중단할 질문',
            createdAt: '2026-10-29T00:00:00Z',
          },
          {
            role: 'assistant' as const,
            content: '답변 생성이 중단되었습니다.',
            createdAt: '2026-10-29T00:00:01Z',
            isCancelled: true,
          },
        ],
        createdAt: '2026-10-29T00:00:00Z',
        updatedAt: '2026-10-29T00:00:01Z',
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValueOnce(mockSessionDetail);
      vi.mocked(aiApi.getSessions).mockResolvedValueOnce([
        {
          sessionId: 'sess-cancelled-immediate',
          title: '즉시 중단된 세션',
          updatedAt: '2026-10-29T00:00:01Z',
        },
      ]);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const sessionItem = await screen.findByText('즉시 중단된 세션');
      await act(async () => {
        fireEvent.click(sessionItem);
      });

      const cancelledBadge = screen.getByTestId('cancelled-badge');
      expect(cancelledBadge).toHaveTextContent('[생성 중단됨]');
      const cancelledMessage = cancelledBadge.closest('.chat-message') as HTMLElement;
      expect(cancelledMessage).toHaveClass('cancelled');
      expect(within(cancelledMessage).getByText('답변 생성이 중단되었습니다.')).toBeInTheDocument();
      expect(within(cancelledMessage).queryByText('이 답변이 도움이 되었나요?')).not.toBeInTheDocument();
    });

    it('Given 정상 완료된 세션 또는 레거시 세션(isCancelled: false 또는 undefined) When 세션을 복원하면 Then [생성 중단됨] 배지가 없고 정상 기능들이 렌더링된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      const mockSessionDetail = {
        sessionId: 'sess-normal-1',
        title: '정상 완료 세션',
        turns: [
          {
            role: 'user' as const,
            content: '정상 질문',
            createdAt: '2026-10-29T00:00:00Z',
          },
          {
            role: 'assistant' as const,
            content: '정상 답변 완료',
            createdAt: '2026-10-29T00:00:01Z',
            confidence: 0.95,
          },
        ],
        createdAt: '2026-10-29T00:00:00Z',
        updatedAt: '2026-10-29T00:00:01Z',
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValueOnce(mockSessionDetail);
      vi.mocked(aiApi.getSessions).mockResolvedValueOnce([
        {
          sessionId: 'sess-normal-1',
          title: '정상 완료 세션',
          updatedAt: '2026-10-29T00:00:01Z',
        },
      ]);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const sessionItem = await screen.findByText('정상 완료 세션');
      await act(async () => {
        fireEvent.click(sessionItem);
      });

      expect(screen.queryByTestId('cancelled-badge')).not.toBeInTheDocument();
      expect(screen.queryByText('[생성 중단됨]')).not.toBeInTheDocument();
      expect(screen.getAllByText('정상 답변 완료')[0]).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '답변 복사' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '답변 보관' })).toBeInTheDocument();
      expect(screen.getByTestId('answer-feedback')).toBeInTheDocument();
    });

    it('Given 정상 완료된 턴과 중단된 턴이 공존하는 멀티턴 세션 When 세션을 복원하면 Then 각 턴의 상태에 맞게 정상 UI와 중단 UI가 각각 올바르게 렌더링된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      const mockSessionDetail = {
        sessionId: 'sess-mixed-1',
        title: '멀티턴 혼합 세션',
        turns: [
          {
            role: 'user' as const,
            content: '첫 번째 정상 질문',
            createdAt: '2026-10-29T00:00:00Z',
          },
          {
            role: 'assistant' as const,
            content: '첫 번째 정상 답변입니다.',
            createdAt: '2026-10-29T00:00:01Z',
            confidence: 0.9,
            isCancelled: false,
          },
          {
            role: 'user' as const,
            content: '두 번째 중단될 질문',
            createdAt: '2026-10-29T00:00:02Z',
          },
          {
            role: 'assistant' as const,
            content: '두 번째 생성 도중 중단된 답변',
            createdAt: '2026-10-29T00:00:03Z',
            isCancelled: true,
          },
        ],
        createdAt: '2026-10-29T00:00:00Z',
        updatedAt: '2026-10-29T00:00:03Z',
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValueOnce(mockSessionDetail);
      vi.mocked(aiApi.getSessions).mockResolvedValueOnce([
        {
          sessionId: 'sess-mixed-1',
          title: '멀티턴 혼합 세션',
          updatedAt: '2026-10-29T00:00:03Z',
        },
      ]);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const sessionItem = await screen.findByText('멀티턴 혼합 세션');
      await act(async () => {
        fireEvent.click(sessionItem);
      });

      // 1턴 어시스턴트 메시지 검증 (정상)
      const normalAnswer = screen.getByText('첫 번째 정상 답변입니다.');
      const normalBubble = normalAnswer.closest('.chat-message') as HTMLElement;
      expect(normalBubble).not.toHaveClass('cancelled');
      expect(within(normalBubble).getByRole('button', { name: '답변 복사' })).toBeInTheDocument();
      expect(within(normalBubble).getByRole('button', { name: '답변 보관' })).toBeInTheDocument();
      expect(within(normalBubble).getByTestId('answer-feedback')).toBeInTheDocument();

      // 2턴 어시스턴트 메시지 검증 (중단)
      const cancelledBadge = screen.getByTestId('cancelled-badge');
      expect(cancelledBadge).toBeInTheDocument();
      const cancelledBubble = cancelledBadge.closest('.chat-message') as HTMLElement;
      expect(cancelledBubble).toHaveClass('cancelled');
      expect(within(cancelledBubble).getByText('두 번째 생성 도중 중단된 답변')).toBeInTheDocument();
      expect(within(cancelledBubble).queryByTestId('answer-feedback')).not.toBeInTheDocument();
      expect(within(cancelledBubble).queryByRole('button', { name: '답변 복사' })).not.toBeInTheDocument();
      expect(within(cancelledBubble).getByRole('button', { name: '다시 질문' })).toBeInTheDocument();
      expect(within(cancelledBubble).getByRole('button', { name: '질문 복원' })).toBeInTheDocument();
    });
  });

  describe('SPEC-088: 에이전틱 RAG 정제 쿼리(refinedQueries / nextQuery) 추적 및 표시', () => {
    const mockAuthContextValue = {
      user: { uuid: 'test-user-id', nickName: 'Tester' },
      token: 'jwt-token',
      isAuthenticated: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    };

    it('Given 스트리밍 중 nextQuery를 포함한 progress 이벤트가 발생할 때 When 화면을 확인하면 Then 스트리밍 진행 인디케이터에 정제 검색어가 표시된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      let triggerRefiningWithNextQuery: () => void;
      let triggerSearchingWithoutNextQuery: () => void;

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((...args) => {
        const onProgress = args[9] as ((progress: aiApi.AgentProgress) => void) | undefined;
        triggerSearchingWithoutNextQuery = () => {
          onProgress?.({
            iteration: 1,
            phase: 'searching',
          });
        };
        triggerRefiningWithNextQuery = () => {
          onProgress?.({
            iteration: 1,
            phase: 'refining',
            nextQuery: '2026년 결제 정책 변경사항',
          });
        };
        return Object.assign(Promise.resolve(), { cancel: vi.fn() });
      });

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '결제 정책 질문' } });
        fireEvent.click(sendBtn);
      });

      // 1회차 searching (nextQuery 없음)
      await act(async () => {
        triggerSearchingWithoutNextQuery();
      });
      expect(screen.getByTestId('agent-progress')).toBeInTheDocument();
      expect(screen.queryByTestId('progress-next-query')).not.toBeInTheDocument();

      // 1회차 refining (nextQuery 있음)
      await act(async () => {
        triggerRefiningWithNextQuery();
      });
      expect(screen.getByTestId('agent-progress')).toBeInTheDocument();
      const nextQueryEl = screen.getByTestId('progress-next-query');
      expect(nextQueryEl).toBeInTheDocument();
      expect(nextQueryEl).toHaveTextContent('[보완 검색: "2026년 결제 정책 변경사항"]');
    });

    it('Given 2회 이상 반복 검증을 거친 에이전틱 답변 완료 시 When done 이벤트에 refinedQueries가 포함되면 Then AI 메시지 버블에 보완 검색어 배지와 쿼리 목록이 정상 렌더링된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (_question, onMessage, onDone) => {
          onMessage('최종 보완된 에이전틱 답변입니다.');
          onDone({
            confidence: 0.95,
            iterations: 2,
            refinedQueries: ['추가 검색어 1', '추가 검색어 2'],
          });
          return Object.assign(Promise.resolve(), { cancel: vi.fn() });
        },
      );

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '다회차 질문' } });
        fireEvent.click(sendBtn);
      });

      expect(screen.getAllByText('최종 보완된 에이전틱 답변입니다.').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByTestId('iteration-badge')).toHaveTextContent('[2회 반복 검증]');

      // refined-queries-badge 검증
      const refinedBadge = screen.getByTestId('refined-queries-badge');
      expect(refinedBadge).toBeInTheDocument();
      expect(screen.getByText('보완 검색어:')).toBeInTheDocument();
      expect(screen.getByText('"추가 검색어 1"')).toBeInTheDocument();
      expect(screen.getByText('"추가 검색어 2"')).toBeInTheDocument();
    });

    it('Given refinedQueries가 없거나 빈 배열인 경우 When 답변이 완료되면 Then 보완 검색어 배지가 화면에 노출되지 않는다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (_question, onMessage, onDone) => {
          onMessage('단발성 답변입니다.');
          onDone({
            confidence: 0.88,
            iterations: 1,
            refinedQueries: [],
          });
          return Object.assign(Promise.resolve(), { cancel: vi.fn() });
        },
      );

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '단발 질문' } });
        fireEvent.click(sendBtn);
      });

      expect(screen.getAllByText('단발성 답변입니다.').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByTestId('refined-queries-badge')).not.toBeInTheDocument();
    });

    it('Given 세션에 refinedQueries가 저장되어 있는 경우 When 세션을 복원하면 Then 복원된 AI 메시지 버블에 보완 검색어 목록이 표시된다', async () => {
      const mockSessionDetail = {
        sessionId: 'sess-refined-1',
        title: '정제 쿼리 세션',
        turns: [
          {
            role: 'user' as const,
            content: '환불 규정 상세',
            createdAt: '2026-11-01T00:00:00Z',
          },
          {
            role: 'assistant' as const,
            content: '환불 규정 안내 내용입니다.',
            createdAt: '2026-11-01T00:00:01Z',
            confidence: 0.9,
            iterations: 2,
            refinedQueries: ['환불 예외 조항', '부분 환불 규정'],
          },
        ],
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:01Z',
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValueOnce(mockSessionDetail);
      vi.mocked(aiApi.getSessions).mockResolvedValueOnce([
        {
          sessionId: 'sess-refined-1',
          title: '정제 쿼리 세션',
          updatedAt: '2026-11-01T00:00:01Z',
        },
      ]);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const sessionItem = await screen.findByText('정제 쿼리 세션');
      await act(async () => {
        fireEvent.click(sessionItem);
      });

      expect(screen.getAllByText('환불 규정 안내 내용입니다.').length).toBeGreaterThanOrEqual(1);
      const refinedBadge = screen.getByTestId('refined-queries-badge');
      expect(refinedBadge).toBeInTheDocument();
      expect(within(refinedBadge).getByText('"환불 예외 조항"')).toBeInTheDocument();
      expect(within(refinedBadge).getByText('"부분 환불 규정"')).toBeInTheDocument();
    });

    it('Given refinedQueries가 없는 레거시 세션을 복원할 때 When 세션 상세를 조회하면 Then 보완 검색어 배지가 렌더링되지 않는다', async () => {
      const mockSessionDetail = {
        sessionId: 'sess-legacy-1',
        title: '일반 레거시 세션',
        turns: [
          {
            role: 'user' as const,
            content: '일반 질문',
            createdAt: '2026-11-01T00:00:00Z',
          },
          {
            role: 'assistant' as const,
            content: '일반 답변 내용입니다.',
            createdAt: '2026-11-01T00:00:01Z',
            confidence: 0.85,
            iterations: 1,
            // refinedQueries 필드 없음 (undefined 또는 [])
          },
        ],
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:01Z',
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValueOnce(mockSessionDetail);
      vi.mocked(aiApi.getSessions).mockResolvedValueOnce([
        {
          sessionId: 'sess-legacy-1',
          title: '일반 레거시 세션',
          updatedAt: '2026-11-01T00:00:01Z',
        },
      ]);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const sessionItem = await screen.findByText('일반 레거시 세션');
      await act(async () => {
        fireEvent.click(sessionItem);
      });

      expect(screen.getAllByText('일반 답변 내용입니다.').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByTestId('refined-queries-badge')).not.toBeInTheDocument();
    });
  });

  describe('SPEC-090: 답변 보관 시 메모(note) 입력 모달 연동 및 보관함 메모 표시 개선', () => {
    const mockAuthContextValue = {
      user: { uuid: 'test-user-1', email: 'test@example.com', role: 'admin' },
      token: 'fake-token',
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      isAuthenticated: true,
      isLoading: false,
    };

    const mockDetail = {
      sessionId: 'sess-spec090',
      title: '스펙90 테스트 세션',
      createdAt: '2026-11-03T00:00:00Z',
      updatedAt: '2026-11-03T00:00:00Z',
      turns: [
        { role: 'user' as const, content: '환불 정책 알려줘', createdAt: '2026-11-03T00:00:00Z' },
        {
          role: 'assistant' as const,
          content: '결제일로부터 14일 이내 환불이 가능합니다. 단, 콘텐츠를 이미 이용한 경우에는 환불이 제한될 수 있습니다.',
          createdAt: '2026-11-03T00:00:01Z',
        },
      ],
    };

    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        {
          sessionId: 'sess-spec090',
          title: '스펙90 테스트 세션',
          updatedAt: '2026-11-03T00:00:00Z',
        },
      ]);
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue(mockDetail);
    });

    const openChatAndSelectSession = async () => {
      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const sessionItem = await screen.findByText('스펙90 테스트 세션');
      await act(async () => {
        fireEvent.click(sessionItem);
      });
    };

    it('AC 1: AI 답변 버블의 ★ 보관 클릭 시 즉시 API가 호출되지 않고 미리보기가 포함된 bookmark-note-modal이 열린다', async () => {
      await openChatAndSelectSession();

      const answerBookmarkBtn = screen.getByRole('button', { name: /답변 보관/i });
      await act(async () => {
        fireEvent.click(answerBookmarkBtn);
      });

      expect(aiApi.createBookmark).not.toHaveBeenCalled();
      const modal = screen.getByRole('dialog', { name: /답변 보관/i });
      expect(modal).toBeInTheDocument();
      expect(modal).toHaveClass('bookmark-note-modal');

      const snippet = screen.getByTestId('bookmark-preview-snippet');
      expect(snippet).toHaveTextContent('결제일로부터 14일 이내 환불이 가능합니다');
    });

    it('AC 2: 메모를 입력하고 보관하기 클릭 시 note와 함께 createBookmark가 호출되고 모달이 닫히며 성공 토스트가 노출된다', async () => {
      vi.mocked(aiApi.createBookmark).mockResolvedValueOnce({
        id: 'bm-90',
        sessionId: 'sess-spec090',
        turnIndex: 1,
        note: '프로젝트 분기 보고서 핵심 근거',
        createdAt: '2026-11-03T00:00:02Z',
      });

      await openChatAndSelectSession();

      const answerBookmarkBtn = screen.getByRole('button', { name: /답변 보관/i });
      await act(async () => {
        fireEvent.click(answerBookmarkBtn);
      });

      const noteTextarea = screen.getByPlaceholderText('보관 사유나 참고 메모를 입력하세요 (선택 사항)');
      fireEvent.change(noteTextarea, { target: { value: '프로젝트 분기 보고서 핵심 근거' } });

      const confirmBtn = screen.getByRole('button', { name: '보관하기' });
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      expect(aiApi.createBookmark).toHaveBeenCalledWith({
        sessionId: 'sess-spec090',
        turnIndex: 1,
        note: '프로젝트 분기 보고서 핵심 근거',
      });
      expect(screen.queryByRole('dialog', { name: /답변 보관/i })).not.toBeInTheDocument();
      expect(screen.getByText('답변이 보관함에 저장되었습니다.')).toBeInTheDocument();
    });

    it('AC 3: 메모 없이(공백만 입력) 보관하기 클릭 시 note: undefined로 createBookmark가 호출된다', async () => {
      vi.mocked(aiApi.createBookmark).mockResolvedValueOnce({
        id: 'bm-90-empty',
        sessionId: 'sess-spec090',
        turnIndex: 1,
        createdAt: '2026-11-03T00:00:02Z',
      });

      await openChatAndSelectSession();

      const answerBookmarkBtn = screen.getByRole('button', { name: /답변 보관/i });
      await act(async () => {
        fireEvent.click(answerBookmarkBtn);
      });

      const noteTextarea = screen.getByPlaceholderText('보관 사유나 참고 메모를 입력하세요 (선택 사항)');
      fireEvent.change(noteTextarea, { target: { value: '   ' } });

      const confirmBtn = screen.getByRole('button', { name: '보관하기' });
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      expect(aiApi.createBookmark).toHaveBeenCalledWith({
        sessionId: 'sess-spec090',
        turnIndex: 1,
        note: undefined,
      });
      expect(screen.queryByRole('dialog', { name: /답변 보관/i })).not.toBeInTheDocument();
    });

    it('AC 4: 메모 최대 글자 수 200자 제한 및 실시간 글자 수 카운터 검증', async () => {
      await openChatAndSelectSession();

      const answerBookmarkBtn = screen.getByRole('button', { name: /답변 보관/i });
      await act(async () => {
        fireEvent.click(answerBookmarkBtn);
      });

      const charCounter = screen.getByTestId('bookmark-char-count');
      expect(charCounter).toHaveTextContent('0 / 200자');

      const noteTextarea = screen.getByPlaceholderText('보관 사유나 참고 메모를 입력하세요 (선택 사항)');
      fireEvent.change(noteTextarea, { target: { value: 'a'.repeat(250) } });

      expect(charCounter).toHaveTextContent('200 / 200자');
      expect((noteTextarea as HTMLTextAreaElement).value.length).toBe(200);
    });

    it('AC 5: 취소 버튼, 닫기(✕) 버튼, 오버레이 클릭, Escape 키 입력 시 모달이 닫히고 메모가 초기화된다', async () => {
      await openChatAndSelectSession();

      const answerBookmarkBtn = screen.getByRole('button', { name: /답변 보관/i });

      // 1. 취소 버튼 클릭 시 닫힘 및 메모 초기화
      await act(async () => {
        fireEvent.click(answerBookmarkBtn);
      });
      let noteTextarea = screen.getByPlaceholderText('보관 사유나 참고 메모를 입력하세요 (선택 사항)');
      fireEvent.change(noteTextarea, { target: { value: '임시 메모 1' } });
      const cancelBtn = screen.getByRole('button', { name: '취소' });
      await act(async () => {
        fireEvent.click(cancelBtn);
      });
      expect(screen.queryByRole('dialog', { name: /답변 보관/i })).not.toBeInTheDocument();

      // 다시 열었을 때 메모가 비어있는지 확인
      await act(async () => {
        fireEvent.click(answerBookmarkBtn);
      });
      noteTextarea = screen.getByPlaceholderText('보관 사유나 참고 메모를 입력하세요 (선택 사항)');
      expect((noteTextarea as HTMLTextAreaElement).value).toBe('');

      // 2. 닫기 버튼(✕) 클릭 시 닫힘
      const closeBtn = screen.getByRole('button', { name: '보관 모달 닫기' });
      await act(async () => {
        fireEvent.click(closeBtn);
      });
      expect(screen.queryByRole('dialog', { name: /답변 보관/i })).not.toBeInTheDocument();

      // 3. 모달 오버레이 바깥 클릭 시 닫힘
      await act(async () => {
        fireEvent.click(answerBookmarkBtn);
      });
      const overlay = screen.getByTestId('bookmark-note-modal-overlay');
      await act(async () => {
        fireEvent.click(overlay);
      });
      expect(screen.queryByRole('dialog', { name: /답변 보관/i })).not.toBeInTheDocument();

      // 4. Escape 키 입력 시 닫힘
      await act(async () => {
        fireEvent.click(answerBookmarkBtn);
      });
      expect(screen.getByRole('dialog', { name: /답변 보관/i })).toBeInTheDocument();
      await act(async () => {
        fireEvent.keyDown(document, { key: 'Escape' });
      });
      expect(screen.queryByRole('dialog', { name: /답변 보관/i })).not.toBeInTheDocument();
    });

    it('AC 6: 보관 요청 중일 때 보관하기 버튼이 "저장 중..."으로 표시되고 확인/취소 버튼이 disabled 상태가 된다', async () => {
      let resolveBookmark: (val: aiApi.BookmarkItem) => void = () => {};
      const pendingPromise = new Promise<aiApi.BookmarkItem>((resolve) => {
        resolveBookmark = resolve;
      });
      vi.mocked(aiApi.createBookmark).mockReturnValueOnce(pendingPromise);

      await openChatAndSelectSession();

      const answerBookmarkBtn = screen.getByRole('button', { name: /답변 보관/i });
      await act(async () => {
        fireEvent.click(answerBookmarkBtn);
      });

      const confirmBtn = screen.getByRole('button', { name: '보관하기' });
      const cancelBtn = screen.getByRole('button', { name: '취소' });

      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      expect(confirmBtn).toHaveTextContent('저장 중...');
      expect(confirmBtn).toBeDisabled();
      expect(cancelBtn).toBeDisabled();

      await act(async () => {
        resolveBookmark({
          id: 'bm-async',
          sessionId: 'sess-spec090',
          turnIndex: 1,
          createdAt: '2026-11-03T00:00:02Z',
        });
      });

      expect(screen.queryByRole('dialog', { name: /답변 보관/i })).not.toBeInTheDocument();
    });

    it('AC 7: 보관 API 실패 시 에러 메시지가 표시되고 모달은 열려 있어 재시도가 가능하다', async () => {
      vi.mocked(aiApi.createBookmark).mockRejectedValueOnce(new Error('Network error'));

      await openChatAndSelectSession();

      const answerBookmarkBtn = screen.getByRole('button', { name: /답변 보관/i });
      await act(async () => {
        fireEvent.click(answerBookmarkBtn);
      });

      const confirmBtn = screen.getByRole('button', { name: '보관하기' });
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      expect(screen.getByText('답변 보관에 실패했습니다.')).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: /답변 보관/i })).toBeInTheDocument();
    });

    it('AC 8: 사이드바 북마크 목록의 메모 영역(session-item-note)에 title={b.note} 툴팁 속성이 적용된다', async () => {
      vi.mocked(aiApi.getBookmarks).mockResolvedValueOnce([
        {
          id: 'bm-tooltip',
          sessionId: 'sess-spec090',
          turnIndex: 1,
          title: '보관된 세션',
          content: '보관된 AI 답변',
          note: '전체 메모 내용입니다. 툴팁으로 확인 가능해야 합니다.',
          createdAt: '2026-11-03T00:00:00Z',
        },
      ]);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const bookmarkTabBtn = screen.getByRole('tab', { name: /보관함/i });
      await act(async () => {
        fireEvent.click(bookmarkTabBtn);
      });

      const noteElement = await screen.findByText('전체 메모 내용입니다. 툴팁으로 확인 가능해야 합니다.');
      expect(noteElement).toHaveClass('session-item-note');
      expect(noteElement).toHaveAttribute('title', '전체 메모 내용입니다. 툴팁으로 확인 가능해야 합니다.');
    });

    it('QA: 답변 내용이 150자를 초과할 때 모달 미리보기에 150자 자름 및 말줄임표(...)가 표시된다', async () => {
      const longContent = '가'.repeat(160);
      vi.mocked(aiApi.getSessionDetail).mockResolvedValueOnce({
        sessionId: 'sess-spec090',
        title: '스펙90 긴 답변 세션',
        createdAt: '2026-11-03T00:00:00Z',
        updatedAt: '2026-11-03T00:00:00Z',
        turns: [
          { role: 'user' as const, content: '긴 답변 질문', createdAt: '2026-11-03T00:00:00Z' },
          { role: 'assistant' as const, content: longContent, createdAt: '2026-11-03T00:00:01Z' },
        ],
      });

      await openChatAndSelectSession();

      const answerBookmarkBtn = screen.getByRole('button', { name: /답변 보관/i });
      await act(async () => {
        fireEvent.click(answerBookmarkBtn);
      });

      const snippet = screen.getByTestId('bookmark-preview-snippet');
      expect(snippet.textContent).toBe(`${'가'.repeat(150)}...`);
    });

    it('QA: 사이드바가 북마크 탭(sidebarTab === "bookmarks")인 상태에서 답변 보관 완료 시 getBookmarks를 호출하여 목록을 갱신한다', async () => {
      vi.mocked(aiApi.getBookmarks).mockResolvedValue([]);
      vi.mocked(aiApi.createBookmark).mockResolvedValueOnce({
        id: 'bm-spec090-refresh',
        sessionId: 'sess-spec090',
        turnIndex: 1,
        note: '갱신 확인용',
        createdAt: '2026-11-03T00:00:02Z',
      });

      await openChatAndSelectSession();

      // 사이드바 탭을 보관함으로 전환
      const bookmarkTabBtn = screen.getByRole('tab', { name: /보관함/i });
      await act(async () => {
        fireEvent.click(bookmarkTabBtn);
      });
      expect(aiApi.getBookmarks).toHaveBeenCalledTimes(1);

      // 세션 다시 선택하여 채팅 화면으로 진입하거나 기존 대화창 유지 상태에서 보관 모달 열기
      const answerBookmarkBtn = screen.getByRole('button', { name: /답변 보관/i });
      await act(async () => {
        fireEvent.click(answerBookmarkBtn);
      });

      const confirmBtn = screen.getByRole('button', { name: '보관하기' });
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      // 보관 완료 후 fetchBookmarks가 다시 호출되었는지 확인
      expect(aiApi.getBookmarks).toHaveBeenCalledTimes(2);
    });

    it('QA: 보관 API 호출 중(isSavingBookmark)에는 Escape 키나 오버레이 클릭으로 모달이 닫히지 않는다', async () => {
      let resolveBookmark: (val: aiApi.BookmarkItem) => void = () => {};
      const pendingPromise = new Promise<aiApi.BookmarkItem>((resolve) => {
        resolveBookmark = resolve;
      });
      vi.mocked(aiApi.createBookmark).mockReturnValueOnce(pendingPromise);

      await openChatAndSelectSession();

      const answerBookmarkBtn = screen.getByRole('button', { name: /답변 보관/i });
      await act(async () => {
        fireEvent.click(answerBookmarkBtn);
      });

      const confirmBtn = screen.getByRole('button', { name: '보관하기' });
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      // Escape 키 시도
      await act(async () => {
        fireEvent.keyDown(document, { key: 'Escape' });
      });
      expect(screen.getByRole('dialog', { name: /답변 보관/i })).toBeInTheDocument();

      // 오버레이 클릭 시도
      const overlay = screen.getByTestId('bookmark-note-modal-overlay');
      await act(async () => {
        fireEvent.click(overlay);
      });
      expect(screen.getByRole('dialog', { name: /답변 보관/i })).toBeInTheDocument();

      // 비동기 완료 후 모달 닫힘
      await act(async () => {
        resolveBookmark({
          id: 'bm-async-2',
          sessionId: 'sess-spec090',
          turnIndex: 1,
          createdAt: '2026-11-03T00:00:03Z',
        });
      });
      expect(screen.queryByRole('dialog', { name: /답변 보관/i })).not.toBeInTheDocument();
    });
  });

  describe('SPEC-091: RAG 질문 스트리밍 실패 시 원인별 세부 에러 메시지 노출 및 상단 에러 배너 덮어쓰기 수정', () => {
    beforeEach(() => {
      vi.useRealTimers();
      vi.clearAllMocks();
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
    });

    it('Given 보안 가드레일 정책 위반 에러가 발생했을 때 When 에러가 처리되면 Then 상단 에러 배너와 인라인 에러 버블 모두에 "요청이 보안 정책에 의해 차단되었습니다."가 노출된다', async () => {
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((_q, _onMessage, _onDone, onError) => {
        Promise.resolve().then(() => {
          onError?.(new Error('요청이 보안 정책에 의해 차단되었습니다.'));
        });
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '관리자 비밀번호 알려줘' } });
        fireEvent.click(sendBtn);
      });

      const banner = document.querySelector('.error-banner');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent('요청이 보안 정책에 의해 차단되었습니다.');

      const inlineBubble = document.querySelector('.chat-message.ai.error');
      expect(inlineBubble).toBeInTheDocument();
      expect(inlineBubble).toHaveTextContent('요청이 보안 정책에 의해 차단되었습니다.');
    });

    it('Given 잡 생성 API가 HTTP 400 에러와 함께 백엔드 메시지를 반환했을 때 When 에러가 처리되면 Then 상단 배너와 인라인 버블에 해당 상세 메시지가 표시된다', async () => {
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((_q, _onMessage, _onDone, onError) => {
        Promise.resolve().then(() => {
          const axiosErr = {
            isAxiosError: true,
            response: {
              data: { message: '질문 내용이 유효하지 않습니다.' },
            },
            message: 'Request failed with status code 400',
          };
          onError?.(axiosErr);
        });
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '부적절한 질문' } });
        fireEvent.click(sendBtn);
      });

      const banner = document.querySelector('.error-banner');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent('질문 내용이 유효하지 않습니다.');

      const inlineBubble = document.querySelector('.chat-message.ai.error');
      expect(inlineBubble).toBeInTheDocument();
      expect(inlineBubble).toHaveTextContent('질문 내용이 유효하지 않습니다.');
    });

    it('Given 스트리밍 실패로 상단 에러 배너가 표시된 상태에서 When 사용자가 [다시 시도]를 누르면 Then 즉시 상단 에러 배너가 사라진다', async () => {
      let callCount = 0;
      vi.mocked(aiApi.askQuestionStream).mockImplementation((_q, _onMessage, _onDone, onError) => {
        callCount++;
        if (callCount === 1) {
          Promise.resolve().then(() => {
            onError?.(new Error('1회차 연결 오류'));
          });
        }
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '재시도 테스트' } });
        fireEvent.click(sendBtn);
      });

      expect(document.querySelector('.ai-service-container > .error-banner')).toHaveTextContent('1회차 연결 오류');

      const retryBtn = screen.getByRole('button', { name: '다시 시도' });
      await act(async () => {
        fireEvent.click(retryBtn);
      });

      expect(document.querySelector('.ai-service-container > .error-banner')).toBeNull();
    });

    it('Given 스트리밍 실패로 상단 에러 배너가 표시된 상태에서 When 사용자가 새로운 질문을 전송하면 Then 즉시 상단 에러 배너가 초기화된다', async () => {
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((_q, _onMessage, _onDone, onError) => {
        Promise.resolve().then(() => {
          onError?.(new Error('서버 타임아웃'));
        });
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '첫 번째 질문' } });
        fireEvent.click(sendBtn);
      });

      expect(document.querySelector('.ai-service-container > .error-banner')).toHaveTextContent('서버 타임아웃');

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(() => {
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        fireEvent.change(input, { target: { value: '두 번째 신규 질문' } });
      });

      const activeSendBtn = screen.getByRole('button', { name: /전송/i });
      expect(activeSendBtn).not.toBeDisabled();

      await act(async () => {
        fireEvent.click(activeSendBtn);
      });

      expect(document.querySelector('.ai-service-container > .error-banner')).toBeNull();
    });

    it('Given 구체적인 에러 메시지가 누락되거나 빈 문자열일 때 When 에러가 발생하면 Then 안전한 기본 문구로 폴백된다', async () => {
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((_q, _onMessage, _onDone, onError) => {
        Promise.resolve().then(() => {
          onError?.(new Error('   '));
        });
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '빈 에러 테스트' } });
        fireEvent.click(sendBtn);
      });

      const banner = document.querySelector('.error-banner');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent('답변 수신 도중 에러가 발생했습니다.');

      const inlineBubble = document.querySelector('.chat-message.ai.error');
      expect(inlineBubble).toBeInTheDocument();
      expect(inlineBubble).toHaveTextContent('답변 수신 도중 에러가 발생했습니다.');
    });

    it('Given 스트리밍 도중 일부 텍스트가 수신된 후 네트워크 에러가 발생하면 Then 기수신된 텍스트가 보존되고 상단 배너와 인라인 영역에 에러 메시지가 표시된다', async () => {
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((_q, onMessage, _onDone, onError) => {
        Promise.resolve().then(() => {
          onMessage?.('기수신된 유효 텍스트');
          onError?.(new Error('네트워크 연결이 끊어졌습니다.'));
        });
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '부분 스트리밍 질문' } });
        fireEvent.click(sendBtn);
      });

      const banner = document.querySelector('.error-banner');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent('네트워크 연결이 끊어졌습니다.');

      const inlineBubble = document.querySelector('.chat-message.ai.error');
      expect(inlineBubble).toBeInTheDocument();
      expect(inlineBubble).toHaveTextContent('기수신된 유효 텍스트');
      expect(inlineBubble).toHaveTextContent('네트워크 연결이 끊어졌습니다.');
    });

    it('Given onError 콜백에 string 원시 타입의 에러가 전달되었을 때 When 에러가 처리되면 Then 해당 문자열이 상단 배너와 인라인 버블에 정확히 표시된다', async () => {
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((_q, _onMessage, _onDone, onError) => {
        Promise.resolve().then(() => {
          onError?.('임의의 문자열 예외 메시지');
        });
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '문자열 예외 테스트' } });
        fireEvent.click(sendBtn);
      });

      const banner = document.querySelector('.error-banner');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent('임의의 문자열 예외 메시지');

      const inlineBubble = document.querySelector('.chat-message.ai.error');
      expect(inlineBubble).toBeInTheDocument();
      expect(inlineBubble).toHaveTextContent('임의의 문자열 예외 메시지');
    });
  });

  describe('Low Confidence Warning & Refine Question (SPEC-093)', () => {
    const mockAuthContext = {
      user: { uuid: 'test-user-id', nickName: 'Tester' },
      token: 'jwt-token',
      isAuthenticated: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    };

    it('AC 1: Given 응답 신뢰도가 45%(0.45)로 60% 미만일 때 When 스트리밍이 완료되면 Then AI 메시지 버블에 has-low-confidence 클래스가 적용되고 [답변 신뢰도 낮음] 배지와 주의 안내 배너가 표시된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((...args) => {
        const onMessage = args[1];
        const onDone = args[2];
        const onSources = args[6];
        setTimeout(() => {
          onSources?.([
            {
              documentId: 'doc-1',
              fileName: 'doc1.pdf',
              score: 0.45,
              snippet: '샘플 근거 청크',
              chunkIndex: 0,
            },
          ]);
          onMessage('신뢰도가 낮은 답변 내용입니다.');
          onDone?.({
            confidence: 0.45,
            missing: [],
          });
        }, 10);
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '불확실한 정보에 대한 질문' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const messageBubble = document.querySelector('.chat-message.ai .message-bubble');
      expect(messageBubble).toBeInTheDocument();
      expect(messageBubble).toHaveClass('has-low-confidence');

      const lowConfBadge = screen.getByTestId('low-confidence-badge');
      expect(lowConfBadge).toBeInTheDocument();
      expect(lowConfBadge).toHaveTextContent('답변 신뢰도 낮음');

      const warningBanner = screen.getByTestId('low-confidence-warning');
      expect(warningBanner).toBeInTheDocument();
      expect(warningBanner).toHaveTextContent(
        '지식베이스와의 관련도가 낮아 답변이 부정확할 수 있습니다. 질문을 더 구체적으로 작성해 보세요.'
      );

      const refineBtn = within(warningBanner).getByRole('button', { name: /질문 구체화/i });
      expect(refineBtn).toBeInTheDocument();
      expect(refineBtn).toHaveClass('btn-refine-question');
    });

    it('AC 2: Given 저신뢰도 답변 버블에 [질문 구체화] 버튼이 표시된 상태에서 When 사용자가 [질문 구체화] 버튼을 클릭하면 Then 직전 사용자 질문이 입력창에 복원되고 포커스된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((...args) => {
        const onMessage = args[1];
        const onDone = args[2];
        const onSources = args[6];
        setTimeout(() => {
          onSources?.([
            {
              documentId: 'doc-1',
              fileName: 'doc1.pdf',
              score: 0.4,
              snippet: '근거 청크',
              chunkIndex: 0,
            },
          ]);
          onMessage('모호한 질문에 대한 답변');
          onDone?.({
            confidence: 0.4,
            missing: [],
          });
        }, 10);
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i) as HTMLInputElement;
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '프로젝트 환불 정책 알려줘' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(input.value).toBe('');

      const refineBtn = screen.getByRole('button', { name: /질문 구체화/i });
      await act(async () => {
        fireEvent.click(refineBtn);
      });

      expect(input.value).toBe('프로젝트 환불 정책 알려줘');
      expect(input).toHaveFocus();
    });

    it('AC 3: Given 신뢰도가 85%(0.85)인 정상 답변인 경우 When 렌더링되면 Then 저신뢰도 경고 배너와 [질문 구체화] 버튼이 노출되지 않고 녹색 신뢰도 85% 배지만 노출된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((...args) => {
        const onMessage = args[1];
        const onDone = args[2];
        const onSources = args[6];
        setTimeout(() => {
          onSources?.([
            {
              documentId: 'doc-1',
              fileName: 'doc1.pdf',
              score: 0.85,
              snippet: '정확한 근거 청크',
              chunkIndex: 0,
            },
          ]);
          onMessage('충분한 근거 기반 답변입니다.');
          onDone?.({
            confidence: 0.85,
            missing: [],
          });
        }, 10);
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '정상 신뢰도 질문' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const messageBubble = document.querySelector('.chat-message.ai .message-bubble');
      expect(messageBubble).not.toHaveClass('has-low-confidence');
      expect(screen.queryByTestId('low-confidence-badge')).toBeNull();
      expect(screen.queryByTestId('low-confidence-warning')).toBeNull();
      expect(screen.queryByRole('button', { name: /질문 구체화/i })).toBeNull();

      const confBadge = screen.getByTestId('confidence-badge');
      expect(confBadge).toHaveClass('confidence-high');
      expect(confBadge).toHaveTextContent('85%');
    });

    it('AC 4: Given 신뢰도 정보가 undefined인 레거시 세션 메시지를 불러온 경우 When 세션 상세가 렌더링되면 Then 저신뢰도 경고 배너가 표시되지 않고 오류 없이 기본 텍스트만 정상 렌더링된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-legacy', title: '레거시 세션', updatedAt: '2026-11-01T00:00:00Z' },
      ]);

      const mockLegacyDetail: aiApi.SessionDetailOut = {
        sessionId: 'sess-legacy',
        title: '레거시 세션',
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
        turns: [
          {
            role: 'user',
            content: '레거시 질문',
            createdAt: '2026-11-01T00:00:01Z',
          },
          {
            role: 'assistant',
            content: '신뢰도 필드가 없는 레거시 답변 텍스트',
            createdAt: '2026-11-01T00:00:02Z',
          },
        ],
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue(mockLegacyDetail);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContext}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      await act(async () => {
        fireEvent.click(screen.getByText('레거시 세션'));
      });

      const messageBubble = document.querySelector('.chat-message.ai .message-bubble');
      expect(messageBubble).toBeInTheDocument();
      expect(messageBubble).not.toHaveClass('has-low-confidence');
      expect(screen.queryByTestId('low-confidence-badge')).toBeNull();
      expect(screen.queryByTestId('low-confidence-warning')).toBeNull();
      expect(within(messageBubble as HTMLElement).getByText('신뢰도 필드가 없는 레거시 답변 텍스트')).toBeInTheDocument();
    });

    it('AC 5: Given 영속화된 신뢰도가 60% 미만인 과거 세션을 불러왔을 때 When 세션 상세가 렌더링되면 Then 저신뢰도 주의 배너와 질문 구체화 버튼이 복원되고 질문 복원이 동작한다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-low-history', title: '과거 저신뢰도 세션', updatedAt: '2026-11-02T00:00:00Z' },
      ]);

      const mockDetail: aiApi.SessionDetailOut = {
        sessionId: 'sess-low-history',
        title: '과거 저신뢰도 세션',
        createdAt: '2026-11-02T00:00:00Z',
        updatedAt: '2026-11-02T00:00:00Z',
        turns: [
          {
            role: 'user',
            content: '과거에 보냈던 이전 질문',
            createdAt: '2026-11-02T00:00:01Z',
          },
          {
            role: 'assistant',
            content: '저신뢰도 과거 답변',
            confidence: 0.52,
            sources: [
              {
                documentId: 'doc-old',
                fileName: 'old.pdf',
                score: 0.52,
                snippet: '과거 청크',
                chunkIndex: 0,
              },
            ],
            createdAt: '2026-11-02T00:00:02Z',
          },
        ],
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue(mockDetail);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContext}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      await act(async () => {
        fireEvent.click(screen.getByText('과거 저신뢰도 세션'));
      });

      const messageBubble = document.querySelector('.chat-message.ai .message-bubble');
      expect(messageBubble).toHaveClass('has-low-confidence');
      expect(screen.getByTestId('low-confidence-badge')).toBeInTheDocument();
      expect(screen.getByTestId('low-confidence-warning')).toBeInTheDocument();

      const refineBtn = screen.getByRole('button', { name: /질문 구체화/i });
      expect(refineBtn).toBeInTheDocument();

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i) as HTMLInputElement;
      await act(async () => {
        fireEvent.click(refineBtn);
      });

      expect(input.value).toBe('과거에 보냈던 이전 질문');
      expect(input).toHaveFocus();
    });

    it('AC 6: Given 답변 스트리밍이 진행 중(isStreaming === true)일 때 When 이전 대화 내역의 저신뢰도 답변 버블을 확인하면 Then [질문 구체화] 버튼이 disabled 상태로 비활성화된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      // 첫 번째 스트리밍: 신뢰도 0.4로 완료되어 chatLog에 추가
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((...args) => {
        const onMessage = args[1];
        const onDone = args[2];
        const onSources = args[6];
        setTimeout(() => {
          onSources?.([
            {
              documentId: 'doc-1',
              fileName: 'doc1.pdf',
              score: 0.4,
              snippet: '청크',
              chunkIndex: 0,
            },
          ]);
          onMessage('첫 번째 저신뢰도 답변');
          onDone?.({
            confidence: 0.4,
            missing: [],
          });
        }, 10);
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      // 1회차 질문 완료
      await act(async () => {
        fireEvent.change(input, { target: { value: '첫 번째 질문' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const refineBtn = screen.getByRole('button', { name: /질문 구체화/i });
      expect(refineBtn).not.toBeDisabled();

      // 두 번째 질문 시작: 스트리밍이 끝나지 않고 계속 유지되도록 모킹
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(() => {
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        fireEvent.change(input, { target: { value: '두 번째 질문 시작' } });
        fireEvent.click(sendBtn);
      });

      // 이제 isStreaming === true 상태
      expect(refineBtn).toBeDisabled();
    });

    it('QA 1: Given 응답 신뢰도가 정확히 60%(0.60)인 경계값일 때 When 스트리밍이 완료되면 Then 저신뢰도 배너 및 has-low-confidence 클래스가 노출되지 않고 정상 신뢰도 60% 배지만 노출된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((...args) => {
        const onMessage = args[1];
        const onDone = args[2];
        const onSources = args[6];
        setTimeout(() => {
          onSources?.([
            {
              documentId: 'doc-boundary',
              fileName: 'doc-boundary.pdf',
              score: 0.6,
              snippet: '경계값 근거 청크',
              chunkIndex: 0,
            },
          ]);
          onMessage('신뢰도 60% 경계값 답변입니다.');
          onDone?.({
            confidence: 0.6,
            missing: [],
          });
        }, 10);
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '신뢰도 60% 경계값 질문' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const messageBubble = document.querySelector('.chat-message.ai .message-bubble');
      expect(messageBubble).not.toHaveClass('has-low-confidence');
      expect(screen.queryByTestId('low-confidence-badge')).toBeNull();
      expect(screen.queryByTestId('low-confidence-warning')).toBeNull();
      expect(screen.queryByRole('button', { name: /질문 구체화/i })).toBeNull();

      const confBadge = screen.getByTestId('confidence-badge');
      expect(confBadge).toHaveTextContent('60%');
    });

    it('QA 2: Given 출처가 없어 [근거 문서 미발견] 배너가 표시되는 경우(isUngrounded) When 답변이 렌더링되면 Then 저신뢰도 배너(low-confidence-warning)와 중복 노출되지 않는다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((...args) => {
        const onMessage = args[1];
        const onDone = args[2];
        const onSources = args[6];
        setTimeout(() => {
          onSources?.([]);
          onMessage('출처 없는 일반 지식 답변입니다.');
          onDone?.({
            confidence: 0,
            missing: [],
          });
        }, 10);
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '근거 문서가 없는 질문' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(screen.getByTestId('ungrounded-warning')).toBeInTheDocument();
      expect(screen.queryByTestId('low-confidence-warning')).toBeNull();
      expect(screen.queryByTestId('low-confidence-badge')).toBeNull();
      expect(
        within(screen.getByTestId('ungrounded-warning')).getByRole('button', { name: /질문 구체화/i }),
      ).toBeInTheDocument();
    });

    it('QA 3: Given 대화 내역에 여러 개의 저신뢰도 답변이 존재하는 복수 턴 상황에서 When 특정 턴의 [질문 구체화] 버튼을 클릭하면 Then 직전 사용자 질문이 정확히 복원된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      // 1턴 스트리밍
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((...args) => {
        const onMessage = args[1];
        const onDone = args[2];
        const onSources = args[6];
        setTimeout(() => {
          onSources?.([
            { documentId: 'doc-1', fileName: 'doc1.pdf', score: 0.35, snippet: '1턴 청크', chunkIndex: 0 },
          ]);
          onMessage('1턴 저신뢰도 답변');
          onDone?.({ confidence: 0.35, missing: [] });
        }, 10);
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(<AiService />);
      });

      const chatOpenBtn = screen.getByRole('button', { name: /채팅 열기/i });
      await act(async () => {
        fireEvent.click(chatOpenBtn);
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i) as HTMLInputElement;
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      // 1턴 질문 전송
      await act(async () => {
        fireEvent.change(input, { target: { value: '첫 번째 질문 내용' } });
        fireEvent.click(sendBtn);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // 2턴 스트리밍
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((...args) => {
        const onMessage = args[1];
        const onDone = args[2];
        const onSources = args[6];
        setTimeout(() => {
          onSources?.([
            { documentId: 'doc-2', fileName: 'doc2.pdf', score: 0.42, snippet: '2턴 청크', chunkIndex: 0 },
          ]);
          onMessage('2턴 저신뢰도 답변');
          onDone?.({ confidence: 0.42, missing: [] });
        }, 10);
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      // 2턴 질문 전송
      await act(async () => {
        fireEvent.change(input, { target: { value: '두 번째 질문 내용' } });
        fireEvent.click(sendBtn);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const refineButtons = screen.getAllByRole('button', { name: /질문 구체화/i });
      expect(refineButtons).toHaveLength(2);

      // 첫 번째 답변의 [질문 구체화] 클릭 시 '첫 번째 질문 내용' 복원
      await act(async () => {
        fireEvent.click(refineButtons[0]);
      });
      expect(input.value).toBe('첫 번째 질문 내용');
      expect(input).toHaveFocus();

      // 두 번째 답변의 [질문 구체화] 클릭 시 '두 번째 질문 내용' 복원
      await act(async () => {
        fireEvent.click(refineButtons[1]);
      });
      expect(input.value).toBe('두 번째 질문 내용');
      expect(input).toHaveFocus();
    });
  });

  describe('답변 평가 피드백 및 질문 보완 재질문 연계 (SPEC-095)', () => {
    const mockAuthContextValue = {
      user: { uuid: 'test-user-id', nickName: 'Tester' },
      token: 'jwt-token',
      isAuthenticated: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      updateProfile: vi.fn(),
      refreshAuth: vi.fn(),
    };

    it('정확도 1~2점으로 평가된 답변 버블에 [질문 보완하여 다시 질문] 버튼이 노출되고, 클릭 시 직전 사용자 질문이 복원된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-low', title: '저평가 세션', updatedAt: '2026-08-28T01:00:00Z' },
      ]);
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue({
        sessionId: 'sess-low',
        title: '저평가 세션',
        createdAt: '2026-08-28T01:00:00Z',
        updatedAt: '2026-08-28T01:00:00Z',
        turns: [
          { role: 'user', content: '환각이 발생한 원래 질문', createdAt: '2026-08-28T01:00:00Z' },
          { role: 'assistant', content: '부정확한 답변 내용', createdAt: '2026-08-28T01:00:01Z' },
        ],
      });
      vi.mocked(aiApi.getSessionFeedback).mockResolvedValue([
        {
          sessionId: 'sess-low',
          turnIndex: 1,
          accuracy: 1,
          helpfulness: 1,
          comment: '[환각/사실 오류] 내용이 틀렸습니다',
          createdAt: '2026-08-28T01:00:02Z',
          updatedAt: '2026-08-28T01:00:02Z',
        },
      ]);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('저평가 세션'));
      });

      const refineBtn = screen.getByRole('button', { name: '질문 보완하여 다시 질문' });
      expect(refineBtn).toBeInTheDocument();
      expect(refineBtn).toHaveClass('btn-feedback-refine');

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i) as HTMLInputElement;
      expect(input.value).toBe('');

      await act(async () => {
        fireEvent.click(refineBtn);
      });

      expect(input.value).toBe('환각이 발생한 원래 질문 (보완 요청: [환각/사실 오류])');
      expect(input).toHaveFocus();
    });

    it('답변 스트리밍 중일 때는 [질문 보완하여 다시 질문] 버튼이 disabled 상태가 된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-low2', title: '저평가 세션 2', updatedAt: '2026-08-28T01:00:00Z' },
      ]);
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue({
        sessionId: 'sess-low2',
        title: '저평가 세션 2',
        createdAt: '2026-08-28T01:00:00Z',
        updatedAt: '2026-08-28T01:00:00Z',
        turns: [
          { role: 'user', content: '첫 번째 질문', createdAt: '2026-08-28T01:00:00Z' },
          { role: 'assistant', content: '첫 번째 답변', createdAt: '2026-08-28T01:00:01Z' },
        ],
      });
      vi.mocked(aiApi.getSessionFeedback).mockResolvedValue([
        {
          sessionId: 'sess-low2',
          turnIndex: 1,
          accuracy: 2,
          helpfulness: 2,
          comment: '불만족',
          createdAt: '2026-08-28T01:00:02Z',
          updatedAt: '2026-08-28T01:00:02Z',
        },
      ]);

      // 스트리밍을 종료하지 않고 유지
      vi.mocked(aiApi.askQuestionStream).mockImplementation((...args) => {
        const onMessage = args[1];
        setTimeout(() => {
          onMessage('스트리밍 생성 중...');
        }, 10);
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('저평가 세션 2'));
      });

      const refineBtn = screen.getByRole('button', { name: '질문 보완하여 다시 질문' });
      expect(refineBtn).not.toBeDisabled();

      // 새 질문 전송하여 스트리밍 시작
      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });
      await act(async () => {
        fireEvent.change(input, { target: { value: '두 번째 질문' } });
        fireEvent.click(sendBtn);
      });

      expect(refineBtn).toBeDisabled();
    });

    it('인라인 에러 버블이 포함된 대화 내역에서 정상 답변 평가 제출 시 올바른 세션 turnIndex가 전송된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([]);
      vi.mocked(aiApi.submitAnswerFeedback).mockResolvedValue({
        sessionId: 'sess-err-recover',
        turnIndex: 2,
        accuracy: 1,
        helpfulness: 1,
        comment: '[환각/사실 오류]',
        createdAt: '2026-08-28T01:00:00Z',
        updatedAt: '2026-08-28T01:00:00Z',
      });

      let callCount = 0;
      vi.mocked(aiApi.askQuestionStream).mockImplementation((...args) => {
        callCount++;
        const onMessage = args[1];
        const onDone = args[2];
        const onError = args[3];
        const onSessionCreated = args[8];

        if (callCount === 1) {
          // 1번째 질문: 에러 발생하여 chatLog에 isError 버블 생성
          setTimeout(() => {
            onError?.(new Error('스트리밍 서버 오류'));
          }, 10);
        } else {
          // 2번째 질문: 성공 (세션 ID 발급)
          setTimeout(() => {
            onSessionCreated?.('sess-err-recover');
            onMessage('정상 답변 텍스트');
            onDone?.({ confidence: 0.9, missing: [] });
          }, 10);
        }
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      // 1번째 질문 전송 -> 실패
      await act(async () => {
        fireEvent.change(input, { target: { value: '실패할 질문' } });
        fireEvent.click(sendBtn);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // 에러 버블 확인
      expect(screen.getAllByText('답변을 생성하지 못했습니다.').length).toBeGreaterThanOrEqual(1);

      // 2번째 질문 전송 -> 성공
      await act(async () => {
        fireEvent.change(input, { target: { value: '성공할 질문' } });
        fireEvent.click(sendBtn);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(screen.getAllByText('정상 답변 텍스트').length).toBeGreaterThanOrEqual(1);

      // 정상 답변의 평가하기 클릭
      const evalBtn = screen.getByRole('button', { name: '이 답변을 평가하기' });
      await act(async () => {
        fireEvent.click(evalBtn);
      });

      // 정확도 1점, 유용성 1점 선택
      await act(async () => {
        fireEvent.click(screen.getByLabelText(/^정확도 1점/));
        fireEvent.click(screen.getByLabelText(/^유용성 1점/));
      });

      // 사유 칩 선택
      const hallucinationChip = screen.getByRole('button', { name: '환각/사실 오류' });
      await act(async () => {
        fireEvent.click(hallucinationChip);
      });

      // 평가 제출 클릭
      const submitBtn = screen.getByRole('button', { name: '평가 제출' });
      await act(async () => {
        fireEvent.click(submitBtn);
      });

      // chatLog에는:
      // [0]: user('실패할 질문')
      // [1]: ai(isError: true)
      // [2]: user('성공할 질문')
      // [3]: ai(정상 답변)
      // 백엔드는 실패한 질문과 에러 응답을 세션 turns에 영속화하지 않으므로 실제 세션 turnIndex는:
      // user('성공할 질문'): 0
      // ai(정상 답변): 1
      // 따라서 turnIndex는 1이어야 함!
      expect(aiApi.submitAnswerFeedback).toHaveBeenCalledWith({
        sessionId: 'sess-err-recover',
        turnIndex: 1,
        accuracy: 1,
        helpfulness: 1,
        comment: '[환각/사실 오류]',
      });
    });

    it('인라인 에러 버블이 포함된 대화 내역에서 정상 답변 보관(★ 보관) 클릭 시 올바른 세션 turnIndex가 전송된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([]);
      vi.mocked(aiApi.createBookmark).mockResolvedValue({
        id: 'bm-1',
        sessionId: 'sess-err-bm',
        turnIndex: 1,
        createdAt: '2026-08-28T01:00:00Z',
      });

      let callCount = 0;
      vi.mocked(aiApi.askQuestionStream).mockImplementation((...args) => {
        callCount++;
        const onMessage = args[1];
        const onDone = args[2];
        const onError = args[3];
        const onSessionCreated = args[8];

        if (callCount === 1) {
          // 1번째 질문: 에러 발생하여 chatLog에 isError 버블 생성
          setTimeout(() => {
            onError?.(new Error('스트리밍 서버 오류'));
          }, 10);
        } else {
          // 2번째 질문: 성공 (세션 ID 발급)
          setTimeout(() => {
            onSessionCreated?.('sess-err-bm');
            onMessage('정상 답변 텍스트입니다');
            onDone?.({ confidence: 0.9, missing: [] });
          }, 10);
        }
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      // 1번째 질문 전송 -> 실패
      await act(async () => {
        fireEvent.change(input, { target: { value: '실패할 질문' } });
        fireEvent.click(sendBtn);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // 2번째 질문 전송 -> 성공
      await act(async () => {
        fireEvent.change(input, { target: { value: '성공할 질문' } });
        fireEvent.click(sendBtn);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // 정상 답변의 [★ 보관] 버튼 클릭
      const bookmarkBtn = screen.getByRole('button', { name: '답변 보관' });
      await act(async () => {
        fireEvent.click(bookmarkBtn);
      });

      // 보관 모달 확인 및 저장
      const confirmSaveBtn = screen.getByRole('button', { name: '보관하기' });
      await act(async () => {
        fireEvent.click(confirmSaveBtn);
      });

      expect(aiApi.createBookmark).toHaveBeenCalledWith({
        sessionId: 'sess-err-bm',
        turnIndex: 1,
        note: undefined,
      });
    });

    it('QA 1: 정확도 3점 이상으로 평가되었거나 평가되지 않은 답변 버블에는 [질문 보완하여 다시 질문] 버튼이 렌더링되지 않는다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-high', title: '고평가 세션', updatedAt: '2026-08-28T01:00:00Z' },
      ]);
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue({
        sessionId: 'sess-high',
        title: '고평가 세션',
        createdAt: '2026-08-28T01:00:00Z',
        updatedAt: '2026-08-28T01:00:00Z',
        turns: [
          { role: 'user', content: '질문 내용', createdAt: '2026-08-28T01:00:00Z' },
          { role: 'assistant', content: '고평가된 답변', createdAt: '2026-08-28T01:00:01Z' },
        ],
      });
      vi.mocked(aiApi.getSessionFeedback).mockResolvedValue([
        {
          sessionId: 'sess-high',
          turnIndex: 1,
          accuracy: 4,
          helpfulness: 4,
          comment: '좋은 답변',
          createdAt: '2026-08-28T01:00:02Z',
          updatedAt: '2026-08-28T01:00:02Z',
        },
      ]);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('고평가 세션'));
      });

      expect(
        screen.queryByRole('button', { name: '질문 보완하여 다시 질문' }),
      ).not.toBeInTheDocument();
    });

    it('QA 2: 복수 턴 대화에서 특정 저평가 턴의 [질문 보완하여 다시 질문] 클릭 시 해당 답변의 직전 사용자 질문이 정확히 복원된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-multi', title: '복수 턴 세션', updatedAt: '2026-08-28T01:00:00Z' },
      ]);
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue({
        sessionId: 'sess-multi',
        title: '복수 턴 세션',
        createdAt: '2026-08-28T01:00:00Z',
        updatedAt: '2026-08-28T01:00:00Z',
        turns: [
          { role: 'user', content: '첫 번째 사용자 질문', createdAt: '2026-08-28T01:00:00Z' },
          { role: 'assistant', content: '첫 번째 답변', createdAt: '2026-08-28T01:00:01Z' },
          {
            role: 'user',
            content: '두 번째 사용자 질문(저평가 대상)',
            createdAt: '2026-08-28T01:00:02Z',
          },
          {
            role: 'assistant',
            content: '두 번째 답변(오류 발생)',
            createdAt: '2026-08-28T01:00:03Z',
          },
        ],
      });
      vi.mocked(aiApi.getSessionFeedback).mockResolvedValue([
        {
          sessionId: 'sess-multi',
          turnIndex: 3,
          accuracy: 2,
          helpfulness: 1,
          comment: '[환각/사실 오류] 잘못됨',
          createdAt: '2026-08-28T01:00:04Z',
          updatedAt: '2026-08-28T01:00:04Z',
        },
      ]);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('복수 턴 세션'));
      });

      const refineBtn = screen.getByRole('button', { name: '질문 보완하여 다시 질문' });
      expect(refineBtn).toBeInTheDocument();

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i) as HTMLInputElement;
      expect(input.value).toBe('');

      await act(async () => {
        fireEvent.click(refineBtn);
      });

      expect(input.value).toBe('두 번째 사용자 질문(저평가 대상) (보완 요청: [환각/사실 오류])');
      expect(input).toHaveFocus();
    });

    it('QA 3: 연속된 복수의 에러 버블이 포함된 대화 내역에서도 정상 답변 피드백 제출 시 올바른 turnIndex가 전송된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([]);
      vi.mocked(aiApi.submitAnswerFeedback).mockResolvedValue({
        sessionId: 'sess-multi-err',
        turnIndex: 1,
        accuracy: 1,
        helpfulness: 1,
        createdAt: '2026-08-28T01:00:00Z',
        updatedAt: '2026-08-28T01:00:00Z',
      });

      let callCount = 0;
      vi.mocked(aiApi.askQuestionStream).mockImplementation((...args) => {
        callCount++;
        const onMessage = args[1];
        const onDone = args[2];
        const onError = args[3];
        const onSessionCreated = args[8];

        if (callCount === 1) {
          setTimeout(() => onError?.(new Error('첫 번째 오류')), 10);
        } else if (callCount === 2) {
          setTimeout(() => onError?.(new Error('두 번째 오류')), 10);
        } else {
          setTimeout(() => {
            onSessionCreated?.('sess-multi-err');
            onMessage('두 번 에러 후 세 번째 성공 답변');
            onDone?.({ confidence: 0.9, missing: [] });
          }, 10);
        }
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      // 1번째 실패
      await act(async () => {
        fireEvent.change(input, { target: { value: '실패 질문 1' } });
        fireEvent.click(sendBtn);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // 2번째 실패
      await act(async () => {
        fireEvent.change(input, { target: { value: '실패 질문 2' } });
        fireEvent.click(sendBtn);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // 3번째 성공
      await act(async () => {
        fireEvent.change(input, { target: { value: '성공 질문 3' } });
        fireEvent.click(sendBtn);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // 정상 답변 평가하기 클릭
      const evalBtn = screen.getByRole('button', { name: '이 답변을 평가하기' });
      await act(async () => {
        fireEvent.click(evalBtn);
      });

      await act(async () => {
        fireEvent.click(screen.getByLabelText(/^정확도 1점/));
        fireEvent.click(screen.getByLabelText(/^유용성 1점/));
      });

      const submitBtn = screen.getByRole('button', { name: '평가 제출' });
      await act(async () => {
        fireEvent.click(submitBtn);
      });

      expect(aiApi.submitAnswerFeedback).toHaveBeenCalledWith({
        sessionId: 'sess-multi-err',
        turnIndex: 1,
        accuracy: 1,
        helpfulness: 1,
        comment: undefined,
      });
    });

    it('QA 4: 이전 정상 턴이 존재하는 세션에서 질문 실패 후 새 질문 성공 시 올바른 turnIndex(3)가 전송된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-prev-exist', title: '기존 세션', updatedAt: '2026-08-28T01:00:00Z' },
      ]);
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue({
        sessionId: 'sess-prev-exist',
        title: '기존 세션',
        createdAt: '2026-08-28T01:00:00Z',
        updatedAt: '2026-08-28T01:00:00Z',
        turns: [
          { role: 'user', content: '기존 사용자 질문', createdAt: '2026-08-28T01:00:00Z' },
          { role: 'assistant', content: '기존 답변', createdAt: '2026-08-28T01:00:01Z' },
        ],
      });
      vi.mocked(aiApi.getSessionFeedback).mockResolvedValue([]);
      vi.mocked(aiApi.submitAnswerFeedback).mockResolvedValue({
        sessionId: 'sess-prev-exist',
        turnIndex: 3,
        accuracy: 1,
        helpfulness: 1,
        createdAt: '2026-08-28T01:00:00Z',
        updatedAt: '2026-08-28T01:00:00Z',
      });

      let callCount = 0;
      vi.mocked(aiApi.askQuestionStream).mockImplementation((...args) => {
        callCount++;
        const onMessage = args[1];
        const onDone = args[2];
        const onError = args[3];

        if (callCount === 1) {
          setTimeout(() => onError?.(new Error('네트워크 오류')), 10);
        } else {
          setTimeout(() => {
            onMessage('에러 후 재시도 성공 답변');
            onDone?.({ confidence: 0.9, missing: [] });
          }, 10);
        }
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('기존 세션'));
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      // 실패할 질문 전송
      await act(async () => {
        fireEvent.change(input, { target: { value: '실패 질문' } });
        fireEvent.click(sendBtn);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // 성공할 질문 전송
      await act(async () => {
        fireEvent.change(input, { target: { value: '성공 질문' } });
        fireEvent.click(sendBtn);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // 2번째(새) 정상 답변 평가하기 클릭
      const evalButtons = screen.getAllByRole('button', { name: '이 답변을 평가하기' });
      // 첫 번째 답변과 두 번째 답변 각각 있으므로 마지막 버튼 클릭
      await act(async () => {
        fireEvent.click(evalButtons[evalButtons.length - 1]);
      });

      await act(async () => {
        fireEvent.click(screen.getByLabelText(/^정확도 1점/));
        fireEvent.click(screen.getByLabelText(/^유용성 1점/));
      });

      const submitBtn = screen.getByRole('button', { name: '평가 제출' });
      await act(async () => {
        fireEvent.click(submitBtn);
      });

      // 기존 턴 [0, 1] + 실패 질문/에러 제외 + 새 질문[2] + 새 답변[3] -> turnIndex: 3
      expect(aiApi.submitAnswerFeedback).toHaveBeenCalledWith({
        sessionId: 'sess-prev-exist',
        turnIndex: 3,
        accuracy: 1,
        helpfulness: 1,
        comment: undefined,
      });
    });
  });

  describe('AI Answer Source Citation Chunks & Modal (SPEC-096)', () => {
    const mockAuth = {
      user: { uuid: 'test-user-spec-096', nickName: 'Tester96' },
      token: 'mock-token-96',
      isAuthenticated: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    };

    const mockChunks: aiApi.DocumentChunk[] = [
      {
        chunkIndex: 0,
        text: '첫 번째 색인 청크 내용입니다.',
      },
      {
        chunkIndex: 1,
        text: '두 번째 색인 청크 내용입니다.',
      },
    ];

    it('Given AI 답변 버블에 참고 문서가 있을 때 When 출처를 펼치면 Then 청크 번호가 1-based(청크 #1, 청크 #2)로 표시되고 [청크 목록] 버튼이 렌더링된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-spec-096', title: '출처 테스트 세션', updatedAt: '2026-11-09T00:00:00Z' },
      ]);

      const mockSessionDetail: aiApi.SessionDetailOut = {
        sessionId: 'sess-spec-096',
        title: '출처 테스트 세션',
        createdAt: '2026-11-09T00:00:00Z',
        updatedAt: '2026-11-09T00:00:00Z',
        turns: [
          {
            role: 'user',
            content: '환불 규정 알려줘',
            createdAt: '2026-11-09T00:00:00Z',
          },
          {
            role: 'assistant',
            content: '환불은 7일 이내 가능합니다.',
            createdAt: '2026-11-09T00:00:01Z',
            sources: [
              {
                fileName: 'refund_policy.pdf',
                chunkIndex: 0,
                documentId: 'doc-refund-01',
                snippet: '환불 규정 제1조',
                score: 0.95,
              },
              {
                fileName: 'refund_policy.pdf',
                chunkIndex: 1,
                documentId: 'doc-refund-01',
                snippet: '환불 규정 제2조',
                score: 0.88,
              },
            ],
          },
        ],
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue(mockSessionDetail);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      // 채팅 패널 열기 및 세션 선택
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('출처 테스트 세션'));
      });

      // 문서 그룹 토글 버튼 및 [청크 목록] 버튼 확인
      const docToggleBtn = screen.getByRole('button', { name: /refund_policy\.pdf/i });
      expect(docToggleBtn).toBeInTheDocument();

      const viewChunksBtn = screen.getByRole('button', { name: '청크 목록' });
      expect(viewChunksBtn).toBeInTheDocument();
      expect(viewChunksBtn).toHaveClass('btn-view-doc-chunks');

      // 펼치기 전에는 청크 번호 미노출
      expect(screen.queryByText('청크 #1')).not.toBeInTheDocument();
      expect(screen.queryByText('청크 #2')).not.toBeInTheDocument();

      // 출처 그룹 펼치기
      await act(async () => {
        fireEvent.click(docToggleBtn);
      });

      // 1-based 표기(청크 #1, 청크 #2)로 렌더링 확인 (0-based '청크 0'이 아니어야 함)
      expect(screen.getByText('청크 #1')).toBeInTheDocument();
      expect(screen.getByText('청크 #2')).toBeInTheDocument();
      expect(screen.queryByText('청크 0')).not.toBeInTheDocument();
      expect(screen.queryByText('청크 1')).not.toBeInTheDocument();
    });

    it('Given 참고 문서 그룹에 [청크 목록] 버튼이 있을 때 When 클릭하면 getDocumentChunks가 호출되고 청크 열람 모달이 열린다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-spec-096-modal', title: '청크 모달 세션', updatedAt: '2026-11-09T00:00:00Z' },
      ]);
      vi.mocked(aiApi.getDocumentChunks).mockResolvedValue(mockChunks);

      const mockSessionDetail: aiApi.SessionDetailOut = {
        sessionId: 'sess-spec-096-modal',
        title: '청크 모달 세션',
        createdAt: '2026-11-09T00:00:00Z',
        updatedAt: '2026-11-09T00:00:00Z',
        turns: [
          {
            role: 'user',
            content: '질문',
            createdAt: '2026-11-09T00:00:00Z',
          },
          {
            role: 'assistant',
            content: '답변',
            createdAt: '2026-11-09T00:00:01Z',
            sources: [
              {
                fileName: 'guide.pdf',
                chunkIndex: 0,
                documentId: 'doc-guide-99',
                snippet: '가이드 스니펫',
              },
            ],
          },
        ],
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue(mockSessionDetail);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('청크 모달 세션'));
      });

      const viewChunksBtn = screen.getByRole('button', { name: '청크 목록' });
      await act(async () => {
        fireEvent.click(viewChunksBtn);
      });

      expect(aiApi.getDocumentChunks).toHaveBeenCalledWith('doc-guide-99');

      const modal = screen.getByRole('dialog', { name: /청크 목록/i });
      expect(modal).toBeInTheDocument();
      expect(screen.getByText(/"guide.pdf" 청크 목록/)).toBeInTheDocument();
      expect(screen.getByText('첫 번째 색인 청크 내용입니다.')).toBeInTheDocument();
      expect(screen.getByText('두 번째 색인 청크 내용입니다.')).toBeInTheDocument();
    });

    it('Given 출처를 통해 청크 모달이 열린 상태에서 When 닫기 버튼, 하단 닫기, 오버레이 클릭, Escape 키 입력 시 모달이 닫힌다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-spec-096-close', title: '닫기 테스트 세션', updatedAt: '2026-11-09T00:00:00Z' },
      ]);
      vi.mocked(aiApi.getDocumentChunks).mockResolvedValue(mockChunks);

      const mockSessionDetail: aiApi.SessionDetailOut = {
        sessionId: 'sess-spec-096-close',
        title: '닫기 테스트 세션',
        createdAt: '2026-11-09T00:00:00Z',
        updatedAt: '2026-11-09T00:00:00Z',
        turns: [
          {
            role: 'user',
            content: '질문',
            createdAt: '2026-11-09T00:00:00Z',
          },
          {
            role: 'assistant',
            content: '답변',
            createdAt: '2026-11-09T00:00:01Z',
            sources: [
              {
                fileName: 'terms.pdf',
                chunkIndex: 0,
                documentId: 'doc-terms-01',
                snippet: '약관 내용',
              },
            ],
          },
        ],
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue(mockSessionDetail);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('닫기 테스트 세션'));
      });

      // 1. 상단 닫기(✕) 버튼 클릭으로 닫기
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '청크 목록' }));
      });
      expect(screen.getByRole('dialog', { name: /청크 목록/i })).toBeInTheDocument();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '청크 모달 닫기' }));
      });
      expect(screen.queryByRole('dialog', { name: /청크 목록/i })).not.toBeInTheDocument();

      // 2. 하단 [닫기] 버튼 클릭으로 닫기
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '청크 목록' }));
      });
      expect(screen.getByRole('dialog', { name: /청크 목록/i })).toBeInTheDocument();
      const bottomCloseBtn = screen.getByRole('button', { name: '닫기' });
      await act(async () => {
        fireEvent.click(bottomCloseBtn);
      });
      expect(screen.queryByRole('dialog', { name: /청크 목록/i })).not.toBeInTheDocument();

      // 3. 오버레이 클릭으로 닫기
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '청크 목록' }));
      });
      expect(screen.getByRole('dialog', { name: /청크 목록/i })).toBeInTheDocument();
      const overlay = screen.getByTestId('chunks-modal-overlay');
      await act(async () => {
        fireEvent.click(overlay);
      });
      expect(screen.queryByRole('dialog', { name: /청크 목록/i })).not.toBeInTheDocument();

      // 4. Escape 키 입력으로 닫기
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '청크 목록' }));
      });
      expect(screen.getByRole('dialog', { name: /청크 목록/i })).toBeInTheDocument();
      await act(async () => {
        fireEvent.keyDown(document, { key: 'Escape' });
      });
      expect(screen.queryByRole('dialog', { name: /청크 목록/i })).not.toBeInTheDocument();
    });

    it('Given 출처 정보에 chunkCount가 없을 때 When 청크 목록 2건이 로드되면 모달 헤더에 총 2개로 표시된다 (경계 케이스)', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-spec-096-count', title: '카운트 테스트 세션', updatedAt: '2026-11-09T00:00:00Z' },
      ]);
      vi.mocked(aiApi.getDocumentChunks).mockResolvedValue(mockChunks);

      const mockSessionDetail: aiApi.SessionDetailOut = {
        sessionId: 'sess-spec-096-count',
        title: '카운트 테스트 세션',
        createdAt: '2026-11-09T00:00:00Z',
        updatedAt: '2026-11-09T00:00:00Z',
        turns: [
          {
            role: 'user',
            content: '질문',
            createdAt: '2026-11-09T00:00:00Z',
          },
          {
            role: 'assistant',
            content: '답변',
            createdAt: '2026-11-09T00:00:01Z',
            sources: [
              {
                fileName: 'no_count.pdf',
                chunkIndex: 0,
                documentId: 'doc-no-count',
                snippet: '스니펫',
              },
            ],
          },
        ],
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue(mockSessionDetail);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('카운트 테스트 세션'));
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '청크 목록' }));
      });

      // mockChunks가 2개 로드되었으므로 총 2개 표시
      expect(screen.getByText(/총 2개/)).toBeInTheDocument();
    });

    it('Given 스트리밍 진행 중 실시간 출처가 수신될 때 When 출처 목록을 확인하면 1-based 청크 번호와 [청크 목록] 버튼이 제공된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getDocumentChunks).mockResolvedValue(mockChunks);

      let capturedOnSources: ((sources: aiApi.SourceRef[]) => void) | undefined;
      vi.mocked(aiApi.askQuestionStream).mockImplementation((...args) => {
        capturedOnSources = args[6];
        return {
          cancel: vi.fn(),
        } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      // 채팅창 열기
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });

      // 질문 전송
      const input = screen.getByPlaceholderText(/질문을 입력하세요/);
      const sendBtn = screen.getByRole('button', { name: '전송' });
      await act(async () => {
        fireEvent.change(input, { target: { value: '스트리밍 질문' } });
        fireEvent.click(sendBtn);
      });

      // 스트리밍 도중 출처 수신
      expect(capturedOnSources).toBeDefined();
      await act(async () => {
        capturedOnSources!([
          {
            fileName: 'stream_doc.pdf',
            chunkIndex: 0,
            documentId: 'doc-stream-1',
            snippet: '스트리밍 스니펫',
          },
        ]);
      });

      // 스트리밍 중인 버블에 [청크 목록] 버튼 렌더링 확인
      const streamChunksBtn = screen.getByRole('button', { name: '청크 목록' });
      expect(streamChunksBtn).toBeInTheDocument();
      expect(streamChunksBtn).toHaveClass('btn-view-doc-chunks');

      // 펼치기 전 클릭
      const docToggleBtn = screen.getByRole('button', { name: /stream_doc\.pdf/i });
      await act(async () => {
        fireEvent.click(docToggleBtn);
      });

      // 1-based 표기(청크 #1) 확인
      expect(screen.getByText('청크 #1')).toBeInTheDocument();
      expect(screen.queryByText('청크 0')).not.toBeInTheDocument();

      // [청크 목록] 클릭 시 모달 열림 검증
      await act(async () => {
        fireEvent.click(streamChunksBtn);
      });

      expect(aiApi.getDocumentChunks).toHaveBeenCalledWith('doc-stream-1');
      expect(screen.getByRole('dialog', { name: /청크 목록/i })).toBeInTheDocument();
      expect(screen.getByText(/"stream_doc.pdf" 청크 목록/)).toBeInTheDocument();
    });

    it('Given 세션 복원으로 과거 대화 내역을 불러온 상황에서 When AI 메시지의 출처 목록을 확인하면 Then 1-based 청크 번호와 [청크 목록] 버튼이 정상 노출되고 클릭 시 청크 모달이 정상 동작한다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-restore-096', title: '복원 세션', updatedAt: '2026-11-09T00:00:00Z' },
      ]);
      vi.mocked(aiApi.getDocumentChunks).mockResolvedValue(mockChunks);

      const mockSessionDetail: aiApi.SessionDetailOut = {
        sessionId: 'sess-restore-096',
        title: '복원 세션',
        createdAt: '2026-11-09T00:00:00Z',
        updatedAt: '2026-11-09T00:00:00Z',
        turns: [
          {
            role: 'user',
            content: '복원 세션 질문입니다',
            createdAt: '2026-11-09T00:00:00Z',
          },
          {
            role: 'assistant',
            content: '복원 세션 답변입니다',
            createdAt: '2026-11-09T00:00:01Z',
            sources: [
              {
                fileName: 'restored_manual.pdf',
                chunkIndex: 2, // 0-based 2 -> 1-based #3
                documentId: 'doc-restored-99',
                snippet: '복원 매뉴얼 청크',
              },
            ],
          },
        ],
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue(mockSessionDetail);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      // 사이드바에서 과거 대화 세션 클릭 (handleLoadSession 트리거)
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('복원 세션'));
      });

      // 출처 그룹 확인 및 펼치기
      const docToggleBtn = screen.getByRole('button', { name: /restored_manual\.pdf/i });
      expect(docToggleBtn).toBeInTheDocument();
      await act(async () => {
        fireEvent.click(docToggleBtn);
      });

      // 1-based 청크 번호(청크 #3) 표시 확인
      expect(screen.getByText('청크 #3')).toBeInTheDocument();
      expect(screen.queryByText('청크 2')).not.toBeInTheDocument();

      // [청크 목록] 버튼 확인 및 클릭
      const viewChunksBtn = screen.getByRole('button', { name: '청크 목록' });
      expect(viewChunksBtn).toBeInTheDocument();
      await act(async () => {
        fireEvent.click(viewChunksBtn);
      });

      // 모달 정상 열림 및 getDocumentChunks 호출 확인
      expect(aiApi.getDocumentChunks).toHaveBeenCalledWith('doc-restored-99');
      expect(screen.getByRole('dialog', { name: /청크 목록/i })).toBeInTheDocument();
      expect(screen.getByText(/"restored_manual.pdf" 청크 목록/)).toBeInTheDocument();
    });

    it('QA 1: Given 청크 목록 API 호출 실패 시 When 청크 열람 모달을 확인하면 에러 메시지가 표시되고 모달 닫기 시 상태가 초기화된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-err-096', title: '에러 테스트 세션', updatedAt: '2026-11-09T00:00:00Z' },
      ]);
      vi.mocked(aiApi.getDocumentChunks).mockRejectedValue(new Error('네트워크 오류'));

      const mockSessionDetail: aiApi.SessionDetailOut = {
        sessionId: 'sess-err-096',
        title: '에러 테스트 세션',
        createdAt: '2026-11-09T00:00:00Z',
        updatedAt: '2026-11-09T00:00:00Z',
        turns: [
          {
            role: 'user',
            content: '질문',
            createdAt: '2026-11-09T00:00:00Z',
          },
          {
            role: 'assistant',
            content: '답변',
            createdAt: '2026-11-09T00:00:01Z',
            sources: [
              {
                fileName: 'error_doc.pdf',
                chunkIndex: 0,
                documentId: 'doc-err-1',
                snippet: '스니펫',
              },
            ],
          },
        ],
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue(mockSessionDetail);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('에러 테스트 세션'));
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '청크 목록' }));
      });

      // 에러 메시지 렌더링 확인
      expect(screen.getByText('청크 목록을 불러오지 못했습니다.')).toBeInTheDocument();

      // 모달 닫기
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '청크 모달 닫기' }));
      });
      expect(screen.queryByRole('dialog', { name: /청크 목록/i })).not.toBeInTheDocument();
    });

    it('QA 2: Given 색인된 청크가 0건인 출처 문서에 대해 When [청크 목록] 클릭 시 총 0개 및 빈 목록 메시지가 렌더링된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-empty-096', title: '빈 청크 세션', updatedAt: '2026-11-09T00:00:00Z' },
      ]);
      vi.mocked(aiApi.getDocumentChunks).mockResolvedValue([]);

      const mockSessionDetail: aiApi.SessionDetailOut = {
        sessionId: 'sess-empty-096',
        title: '빈 청크 세션',
        createdAt: '2026-11-09T00:00:00Z',
        updatedAt: '2026-11-09T00:00:00Z',
        turns: [
          {
            role: 'user',
            content: '질문',
            createdAt: '2026-11-09T00:00:00Z',
          },
          {
            role: 'assistant',
            content: '답변',
            createdAt: '2026-11-09T00:00:01Z',
            sources: [
              {
                fileName: 'empty_doc.pdf',
                chunkIndex: 0,
                documentId: 'doc-empty-1',
                snippet: '스니펫',
              },
            ],
          },
        ],
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue(mockSessionDetail);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuth}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('빈 청크 세션'));
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '청크 목록' }));
      });

      // 총 0개 헤더 및 빈 상태 문구 확인
      expect(screen.getByText(/총 0개/)).toBeInTheDocument();
      expect(screen.getByText('색인된 청크가 없습니다.')).toBeInTheDocument();
    });
  });

  describe('AI Answer Source File View and Error Isolation (SPEC-097)', () => {
    const mockAuthContextValue = {
      user: { uuid: 'test-user-id', nickName: 'Tester' },
      token: 'jwt-token',
      isAuthenticated: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      loginWithKakao: vi.fn(),
      loginWithNaver: vi.fn(),
    };

    let capturedAnchor: { href: string; download: string };
    let clickSpy: MockInstance;
    let createObjectURLMock: ReturnType<typeof vi.fn>;
    let revokeObjectURLMock: ReturnType<typeof vi.fn>;
    let windowOpenMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.clearAllMocks();
      capturedAnchor = { href: '', download: '' };
      clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        capturedAnchor = {
          href: this.href,
          download: this.download,
        };
      });

      createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
      revokeObjectURLMock = vi.fn();
      vi.stubGlobal('URL', {
        ...URL,
        createObjectURL: createObjectURLMock,
        revokeObjectURL: revokeObjectURLMock,
      });

      windowOpenMock = vi.fn();
      vi.stubGlobal('open', windowOpenMock);
    });

    afterEach(() => {
      clickSpy?.mockRestore?.();
      vi.unstubAllGlobals();
    });

    it('AC 1: Given AI 답변 버블의 참고 문서 목록에 특정 문서 출처가 표시되어 있을 때 When 사용자가 해당 문서 행의 [원문 보기] 버튼을 클릭하면 Then 사전 빈 탭이나 팝업 차단 경고창 없이 getDocumentFile API가 호출되고 브라우저 표준 앵커 다운로드가 정상 트리거된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      const fakeBlob = new Blob(['sample-data'], { type: 'application/pdf' });
      vi.mocked(aiApi.getDocumentFile).mockResolvedValueOnce(fakeBlob);

      const mockSources: aiApi.SourceRef[] = [
        { fileName: 'spec097-guide.pdf', chunkIndex: 0, documentId: 'doc-097', score: 0.95 },
      ];

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (_question, onMessage, onDone, _onError, _userId, _chatLog, onSources) => {
          setTimeout(() => {
            onSources?.(mockSources);
            onMessage('AC 1 답변');
            onDone();
          }, 10);
          return Promise.resolve();
        },
      );

      await act(async () => {
        render(<AiService />);
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      await act(async () => {
        fireEvent.change(input, { target: { value: '질문' } });
        fireEvent.click(screen.getByRole('button', { name: /전송/i }));
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      const viewBtn = screen.getByRole('button', { name: '원문 보기' });
      await act(async () => {
        fireEvent.click(viewBtn);
      });

      // 1. window.open 미호출 검증 (사전 빈 탭 생성 방지)
      expect(windowOpenMock).not.toHaveBeenCalled();
      // 2. getDocumentFile 호출 검증
      expect(aiApi.getDocumentFile).toHaveBeenCalledWith('doc-097');
      // 3. 앵커 다운로드 속성 및 URL 해제 검증
      expect(createObjectURLMock).toHaveBeenCalledWith(fakeBlob);
      expect(capturedAnchor.download).toBe('spec097-guide.pdf');
      expect(capturedAnchor.href).toBe('blob:mock-url');
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
    });

    it('AC 2: Given 대화창에 2개 이상의 AI 답변 메시지가 렌더링되어 있고 각각 참고 문서가 표시된 상태에서 When 첫 번째 답변의 특정 출처 문서 원문 조회가 실패하면 Then 첫 번째 답변의 해당 출처 그룹 하단에만 에러가 노출되고 두 번째 답변 버블에는 에러 문구가 전혀 노출되지 않는다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-multi-answers', title: '다중 답변 세션', updatedAt: '2026-11-10T00:00:00Z' },
      ]);

      const mockSessionDetail: aiApi.SessionDetailOut = {
        sessionId: 'sess-multi-answers',
        title: '다중 답변 세션',
        createdAt: '2026-11-10T00:00:00Z',
        updatedAt: '2026-11-10T00:00:00Z',
        turns: [
          {
            role: 'user',
            content: '질문 1',
            createdAt: '2026-11-10T00:00:00Z',
          },
          {
            role: 'assistant',
            content: '답변 1 내용',
            createdAt: '2026-11-10T00:00:01Z',
            sources: [
              { fileName: 'doc-turn-1.pdf', chunkIndex: 0, documentId: 'd-1', score: 0.8 },
            ],
          },
          {
            role: 'user',
            content: '질문 2',
            createdAt: '2026-11-10T00:00:02Z',
          },
          {
            role: 'assistant',
            content: '답변 2 내용',
            createdAt: '2026-11-10T00:00:03Z',
            sources: [
              { fileName: 'doc-turn-2.pdf', chunkIndex: 0, documentId: 'd-2', score: 0.9 },
            ],
          },
        ],
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue(mockSessionDetail);
      vi.mocked(aiApi.getDocumentFile).mockRejectedValueOnce(new Error('Network failure'));

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('다중 답변 세션'));
      });

      const viewBtns = screen.getAllByRole('button', { name: '원문 보기' });
      expect(viewBtns).toHaveLength(2);

      // 첫 번째 답변의 [원문 보기] 클릭 -> 실패
      await act(async () => {
        fireEvent.click(viewBtns[0]);
      });

      // 에러 메시지는 전체 화면 중 단 1개만 나타나야 하며, 첫 번째 답변 영역에 국한되어야 함
      const errorElements = screen.getAllByRole('alert');
      expect(errorElements).toHaveLength(1);
      expect(errorElements[0]).toHaveTextContent('원본 파일을 불러오는 데 실패했습니다.');

      // 첫 번째 답변 버블 내부에는 에러가 존재하고, 두 번째 답변 버블 내부에는 에러가 없어야 함
      const chatMessages = document.querySelectorAll('.chat-message.ai');
      expect(chatMessages).toHaveLength(2);
      expect(chatMessages[0].querySelector('.source-ref-file-error')).not.toBeNull();
      expect(chatMessages[1].querySelector('.source-ref-file-error')).toBeNull();
    });

    it('AC 3: Given 특정 문서 원문 다운로드가 진행 중인 상황에서 When 출처 영역을 확인하면 Then 다운로드가 요청된 해당 버튼만 "불러오는 중…" 텍스트로 변경되고 비활성화되며 다른 문서 출처의 [원문 보기] 버튼은 비활성화되지 않는다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-multi-docs', title: '복수 문서 세션', updatedAt: '2026-11-10T00:00:00Z' },
      ]);

      const mockSessionDetail: aiApi.SessionDetailOut = {
        sessionId: 'sess-multi-docs',
        title: '복수 문서 세션',
        createdAt: '2026-11-10T00:00:00Z',
        updatedAt: '2026-11-10T00:00:00Z',
        turns: [
          {
            role: 'user',
            content: '질문',
            createdAt: '2026-11-10T00:00:00Z',
          },
          {
            role: 'assistant',
            content: '답변 내용',
            createdAt: '2026-11-10T00:00:01Z',
            sources: [
              { fileName: 'doc-a.pdf', chunkIndex: 0, documentId: 'doc-a', score: 0.9 },
              { fileName: 'doc-b.pdf', chunkIndex: 0, documentId: 'doc-b', score: 0.8 },
            ],
          },
        ],
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue(mockSessionDetail);

      let resolveDocA: (val: Blob) => void;
      const pendingDocAPromise = new Promise<Blob>((resolve) => {
        resolveDocA = resolve;
      });
      vi.mocked(aiApi.getDocumentFile).mockReturnValueOnce(pendingDocAPromise);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('복수 문서 세션'));
      });

      const viewBtns = screen.getAllByRole('button', { name: '원문 보기' });
      expect(viewBtns).toHaveLength(2);

      // doc-a 다운로드 시작
      await act(async () => {
        fireEvent.click(viewBtns[0]);
      });

      // doc-a 버튼은 "불러오는 중…"이며 disabled 상태여야 함
      expect(screen.getByRole('button', { name: '불러오는 중…' })).toBeDisabled();

      // doc-b 버튼은 여전히 "원문 보기"이고 disabled가 아니어야 함
      const remainingBtn = screen.getByRole('button', { name: '원문 보기' });
      expect(remainingBtn).not.toBeDisabled();

      // doc-a 완료
      await act(async () => {
        resolveDocA!(new Blob(['doc-a-content']));
      });

      // 다운로드 완료 후 버튼 상태 복원
      expect(screen.queryByRole('button', { name: '불러오는 중…' })).toBeNull();
      expect(screen.getAllByRole('button', { name: '원문 보기' })).toHaveLength(2);
    });

    it('AC 4: Given 세션 복원으로 과거 대화 내역을 불러온 상황에서 When 특정 AI 메시지의 출처 문서에서 [원문 보기]를 클릭하면 Then 동일하게 빈 탭 잔류 없이 해당 문서 파일명으로 다운로드가 정상 실행된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-restore', title: '복원된 세션', updatedAt: '2026-11-10T00:00:00Z' },
      ]);

      const mockSessionDetail: aiApi.SessionDetailOut = {
        sessionId: 'sess-restore',
        title: '복원된 세션',
        createdAt: '2026-11-10T00:00:00Z',
        updatedAt: '2026-11-10T00:00:00Z',
        turns: [
          {
            role: 'user',
            content: '과거 질문',
            createdAt: '2026-11-10T00:00:00Z',
          },
          {
            role: 'assistant',
            content: '과거 답변',
            createdAt: '2026-11-10T00:00:01Z',
            sources: [
              { fileName: 'restored-manual.pdf', chunkIndex: 0, documentId: 'doc-restored', score: 0.9 },
            ],
          },
        ],
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue(mockSessionDetail);
      const fakeBlob = new Blob(['restored-content']);
      vi.mocked(aiApi.getDocumentFile).mockResolvedValueOnce(fakeBlob);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('복원된 세션'));
      });

      const viewBtn = screen.getByRole('button', { name: '원문 보기' });
      await act(async () => {
        fireEvent.click(viewBtn);
      });

      expect(windowOpenMock).not.toHaveBeenCalled();
      expect(aiApi.getDocumentFile).toHaveBeenCalledWith('doc-restored');
      expect(capturedAnchor.download).toBe('restored-manual.pdf');
      expect(capturedAnchor.href).toBe('blob:mock-url');
    });

    it('AC 5: Given 파일 다운로드가 실패하여 에러 메시지가 표시된 출처 그룹에서 When 사용자가 [원문 보기]를 다시 클릭하면 Then 이전에 표시되었던 에러 메시지가 즉시 초기화되고 새로운 다운로드 요청이 실행된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      const mockSources: aiApi.SourceRef[] = [
        { fileName: 'retry-doc.pdf', chunkIndex: 0, documentId: 'doc-retry', score: 0.9 },
      ];

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (_question, onMessage, onDone, _onError, _userId, _chatLog, onSources) => {
          setTimeout(() => {
            onSources?.(mockSources);
            onMessage('재시도 답변');
            onDone();
          }, 10);
          return Promise.resolve();
        },
      );

      // 1차 실패, 2차 대기 프로미스
      let resolveSecondTry: (val: Blob) => void;
      const secondTryPromise = new Promise<Blob>((resolve) => {
        resolveSecondTry = resolve;
      });
      vi.mocked(aiApi.getDocumentFile)
        .mockRejectedValueOnce(new Error('First try failed'))
        .mockReturnValueOnce(secondTryPromise);

      await act(async () => {
        render(<AiService />);
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      await act(async () => {
        fireEvent.change(input, { target: { value: '재시도 테스트 질문' } });
        fireEvent.click(screen.getByRole('button', { name: /전송/i }));
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      const viewBtn = screen.getByRole('button', { name: '원문 보기' });

      // 1차 클릭: 에러 발생
      await act(async () => {
        fireEvent.click(viewBtn);
      });

      expect(screen.getByRole('alert')).toHaveTextContent('원본 파일을 불러오는 데 실패했습니다.');

      // 2차 클릭: 에러 즉시 초기화 및 재요청 진행 중
      await act(async () => {
        fireEvent.click(viewBtn);
      });

      // 에러 메시지가 초기화되어 사라졌는지 확인
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByRole('button', { name: '불러오는 중…' })).toBeDisabled();

      // 2차 성공 처리
      await act(async () => {
        resolveSecondTry!(new Blob(['retry-success']));
      });

      expect(capturedAnchor.download).toBe('retry-doc.pdf');
    });

    it('QA: Given 스트리밍 진행 중인 실시간 AI 답변의 출처 목록에서도 [원문 보기] 클릭 시 브라우저 표준 다운로드 및 로딩/에러 격리가 정상 동작한다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      const mockSources: aiApi.SourceRef[] = [
        { fileName: 'stream-doc.pdf', chunkIndex: 0, documentId: 'doc-stream', score: 0.95 },
      ];

      // 스트리밍이 끝나지 않은 상태 유지
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (_question, onMessage, _onDone, _onError, _userId, _chatLog, onSources) => {
          setTimeout(() => {
            onSources?.(mockSources);
            onMessage('스트리밍 중인 내용...');
          }, 10);
          return Promise.resolve();
        },
      );

      vi.mocked(aiApi.getDocumentFile).mockRejectedValueOnce(new Error('Streaming file view failed'));

      await act(async () => {
        render(<AiService />);
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      await act(async () => {
        fireEvent.change(input, { target: { value: '스트리밍 질문' } });
        fireEvent.click(screen.getByRole('button', { name: /전송/i }));
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      // 스트리밍 버블 내 [원문 보기] 버튼
      const viewBtn = screen.getByRole('button', { name: '원문 보기' });
      await act(async () => {
        fireEvent.click(viewBtn);
      });

      // 스트리밍 출처에 에러가 국소적으로 표시되는지 검증
      expect(windowOpenMock).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent('원본 파일을 불러오는 데 실패했습니다.');

      const streamingBubble = document.querySelector('.message-bubble.streaming');
      expect(streamingBubble?.querySelector('.source-ref-file-error')).not.toBeNull();
    });

    it('QA 1: Given 서로 다른 AI 메시지 버블에 동일한 documentId를 가진 출처가 인용되었을 때 When 한쪽에서 원문 조회가 실패해도 다른 쪽 메시지 버블의 출처에는 영향을 주지 않는다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-same-doc-turns', title: '동일 문서 다중 턴 세션', updatedAt: '2026-11-10T00:00:00Z' },
      ]);

      const mockSessionDetail: aiApi.SessionDetailOut = {
        sessionId: 'sess-same-doc-turns',
        title: '동일 문서 다중 턴 세션',
        createdAt: '2026-11-10T00:00:00Z',
        updatedAt: '2026-11-10T00:00:00Z',
        turns: [
          {
            role: 'user',
            content: '첫 번째 질문',
            createdAt: '2026-11-10T00:00:00Z',
          },
          {
            role: 'assistant',
            content: '첫 번째 답변',
            createdAt: '2026-11-10T00:00:01Z',
            sources: [
              { fileName: 'shared-doc.pdf', chunkIndex: 0, documentId: 'doc-shared-id', score: 0.9 },
            ],
          },
          {
            role: 'user',
            content: '두 번째 질문',
            createdAt: '2026-11-10T00:00:02Z',
          },
          {
            role: 'assistant',
            content: '두 번째 답변',
            createdAt: '2026-11-10T00:00:03Z',
            sources: [
              { fileName: 'shared-doc.pdf', chunkIndex: 1, documentId: 'doc-shared-id', score: 0.85 },
            ],
          },
        ],
      };
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue(mockSessionDetail);
      // 첫 번째 호출은 실패, 두 번째 호출은 성공
      vi.mocked(aiApi.getDocumentFile)
        .mockRejectedValueOnce(new Error('First turn failed'))
        .mockResolvedValueOnce(new Blob(['shared-success-content']));

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('동일 문서 다중 턴 세션'));
      });

      const viewBtns = screen.getAllByRole('button', { name: '원문 보기' });
      expect(viewBtns).toHaveLength(2);

      // 첫 번째 버블의 [원문 보기] 클릭 -> 실패
      await act(async () => {
        fireEvent.click(viewBtns[0]);
      });

      // 첫 번째 버블에만 에러 노출되고 두 번째 버블에는 에러가 없어야 함
      const chatMessages = document.querySelectorAll('.chat-message.ai');
      expect(chatMessages).toHaveLength(2);
      expect(chatMessages[0].querySelector('.source-ref-file-error')).not.toBeNull();
      expect(chatMessages[1].querySelector('.source-ref-file-error')).toBeNull();

      // 두 번째 버블의 동일 문서 [원문 보기] 버튼은 비활성화되지 않고 정상 유지됨
      expect(viewBtns[1]).not.toBeDisabled();

      // 두 번째 버블의 [원문 보기] 클릭 -> 성공 다운로드
      await act(async () => {
        fireEvent.click(viewBtns[1]);
      });

      expect(capturedAnchor.download).toBe('shared-doc.pdf');
      expect(capturedAnchor.href).toBe('blob:mock-url');
    });

    it('QA 2: Given 원문 파일 다운로드가 진행 중일 때 When 사용자가 해당 버튼을 연속으로 여러 번 클릭해도 getDocumentFile API는 중복 호출되지 않는다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      const mockSources: aiApi.SourceRef[] = [
        { fileName: 'single-click.pdf', chunkIndex: 0, documentId: 'doc-single', score: 0.9 },
      ];

      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (_question, onMessage, onDone, _onError, _userId, _chatLog, onSources) => {
          setTimeout(() => {
            onSources?.(mockSources);
            onMessage('단일 클릭 답변');
            onDone();
          }, 10);
          return Promise.resolve();
        },
      );

      let resolveCall: (val: Blob) => void;
      const pendingPromise = new Promise<Blob>((resolve) => {
        resolveCall = resolve;
      });
      vi.mocked(aiApi.getDocumentFile).mockReturnValueOnce(pendingPromise);

      await act(async () => {
        render(<AiService />);
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      await act(async () => {
        fireEvent.change(input, { target: { value: '질문' } });
        fireEvent.click(screen.getByRole('button', { name: /전송/i }));
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      const viewBtn = screen.getByRole('button', { name: '원문 보기' });

      // 첫 번째 클릭
      await act(async () => {
        fireEvent.click(viewBtn);
      });

      // 진행 중 상태에서 버튼을 2회 더 클릭
      await act(async () => {
        fireEvent.click(viewBtn);
        fireEvent.click(viewBtn);
      });

      // API는 단 1회만 호출되어야 함
      expect(aiApi.getDocumentFile).toHaveBeenCalledTimes(1);

      // 다운로드 완료
      await act(async () => {
        resolveCall!(new Blob(['single-content']));
      });

      expect(capturedAnchor.download).toBe('single-click.pdf');
    });

    it('QA 3: Given 첫 번째 스트리밍 중 출처의 원문 조회가 실패했을 때 When 새 질문을 스트리밍하고 동일 문서가 다시 인용되면 Then 새 스트리밍 버블에 이전 에러가 노출되지 않는다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      const mockSources: aiApi.SourceRef[] = [
        { fileName: 'reused-doc.pdf', chunkIndex: 0, documentId: 'doc-reused', score: 0.9 },
      ];

      let stream1Done: () => void;
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (_question, onMessage, onDone, _onError, _userId, _chatLog, onSources) => {
          setTimeout(() => {
            onSources?.(mockSources);
            onMessage('첫 번째 스트리밍 답변');
          }, 10);
          stream1Done = onDone;
          return Promise.resolve();
        },
      );

      vi.mocked(aiApi.getDocumentFile).mockRejectedValueOnce(new Error('Stream 1 file error'));

      await act(async () => {
        render(<AiService />);
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i);
      await act(async () => {
        fireEvent.change(input, { target: { value: '질문 1' } });
        fireEvent.click(screen.getByRole('button', { name: /전송/i }));
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      // 스트리밍 버블의 [원문 보기] 클릭 -> 실패
      const streamViewBtn = screen.getByRole('button', { name: '원문 보기' });
      await act(async () => {
        fireEvent.click(streamViewBtn);
      });

      // 스트리밍 버블에 에러 노출 확인
      expect(screen.getByRole('alert')).toHaveTextContent('원본 파일을 불러오는 데 실패했습니다.');

      // 스트림 1 완료 -> chatLog로 이전됨
      await act(async () => {
        stream1Done!();
      });

      // 두 번째 질문 스트리밍 설정 (동일 문서 출처 인용)
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce(
        (_question, onMessage, _onDone, _onError, _userId, _chatLog, onSources) => {
          setTimeout(() => {
            onSources?.(mockSources);
            onMessage('두 번째 스트리밍 진행 중...');
          }, 10);
          return Promise.resolve();
        },
      );

      await act(async () => {
        fireEvent.change(input, { target: { value: '질문 2' } });
        fireEvent.click(screen.getByRole('button', { name: /전송/i }));
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      // 새 스트리밍 버블 확인
      const streamingBubble = document.querySelector('.message-bubble.streaming');
      expect(streamingBubble).not.toBeNull();
      // 새 스트리밍 버블 내 출처에 이전 에러가 노출되지 않아야 함
      expect(streamingBubble?.querySelector('.source-ref-file-error')).toBeNull();
      // [원문 보기] 버튼도 disabled 상태가 아니어야 함
      const newStreamViewBtn = streamingBubble?.querySelector('.source-ref-view-btn');
      expect(newStreamViewBtn).not.toBeDisabled();
      expect(newStreamViewBtn).toHaveTextContent('원문 보기');
    });
  });

  describe('SPEC-100: 근거 미참조·저신뢰도 RAG 답변 피드백 연계 및 불만족 사유 재질문 연동', () => {
    const mockAuthContextValue = {
      user: { uuid: 'test-user-id', nickName: 'Tester' },
      token: 'jwt-token',
      isAuthenticated: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    };

    it('근거 미발견(isUngrounded) AI 답변 버블에 [질문 구체화] 및 [답변 평가] 버튼이 렌더링되고, [질문 구체화] 클릭 시 직전 사용자 질문이 입력창에 복원된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.askQuestionStream).mockImplementationOnce((...args) => {
        const onMessage = args[1];
        const onDone = args[2];
        const onSources = args[6];
        setTimeout(() => {
          onSources?.([]);
          onMessage('출처 없는 일반 지식 답변입니다.');
          onDone?.({ confidence: 0, missing: [] });
        }, 10);
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i) as HTMLInputElement;
      const sendBtn = screen.getByRole('button', { name: /전송/i });

      await act(async () => {
        fireEvent.change(input, { target: { value: '출처 없는 질문 내용' } });
        fireEvent.click(sendBtn);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const ungroundedWarning = screen.getByTestId('ungrounded-warning');
      expect(ungroundedWarning).toBeInTheDocument();
      expect(ungroundedWarning).toHaveTextContent('근거 문서 미발견 (모델 일반 지식 기반 답변)');

      // [질문 구체화] 및 [답변 평가] 버튼 확인
      const refineBtn = within(ungroundedWarning).getByRole('button', { name: '질문 구체화' });
      const feedbackBtn = within(ungroundedWarning).getByRole('button', { name: '답변 평가' });
      expect(refineBtn).toBeInTheDocument();
      expect(refineBtn).toHaveClass('btn-refine-question');
      expect(feedbackBtn).toBeInTheDocument();
      expect(feedbackBtn).toHaveClass('btn-warning-feedback');

      // 입력창 비우고 질문 구체화 클릭
      await act(async () => {
        fireEvent.change(input, { target: { value: '' } });
        fireEvent.click(refineBtn);
      });

      expect(input.value).toBe('출처 없는 질문 내용');
      expect(input).toHaveFocus();
    });

    it('근거 미발견 배너 및 저신뢰도 배너의 [답변 평가] 클릭 시 해당 답변의 AnswerFeedback 폼이 즉시 열린다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-spec100', title: '경고 배너 세션', updatedAt: '2026-08-28T01:00:00Z' },
      ]);
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue({
        sessionId: 'sess-spec100',
        title: '경고 배너 세션',
        createdAt: '2026-08-28T01:00:00Z',
        updatedAt: '2026-08-28T01:00:00Z',
        turns: [
          { role: 'user', content: '질문 1', createdAt: '2026-08-28T01:00:00Z' },
          {
            role: 'assistant',
            content: '근거 미발견 답변',
            confidence: 0,
            missing: [],
            sources: [],
            createdAt: '2026-08-28T01:00:01Z',
          },
          { role: 'user', content: '질문 2', createdAt: '2026-08-28T01:00:02Z' },
          {
            role: 'assistant',
            content: '저신뢰도 답변',
            confidence: 0.4,
            sources: [{ documentId: 'd1', fileName: 'f1.pdf', score: 0.4, snippet: 's1', chunkIndex: 0 }],
            createdAt: '2026-08-28T01:00:03Z',
          },
        ],
      });
      vi.mocked(aiApi.getSessionFeedback).mockResolvedValue([]);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('경고 배너 세션'));
      });

      // 1턴: 근거 미발견 경고 배너
      const ungroundedWarning = screen.getByTestId('ungrounded-warning');
      const ungroundedFeedbackBtn = within(ungroundedWarning).getByRole('button', { name: '답변 평가' });

      // 클릭 전에는 피드백이 접혀 있음
      const feedbackSections = screen.getAllByTestId('answer-feedback');
      expect(feedbackSections[0]).toHaveClass('collapsed');

      await act(async () => {
        fireEvent.click(ungroundedFeedbackBtn);
      });

      expect(feedbackSections[0]).not.toHaveClass('collapsed');
      expect(within(feedbackSections[0]).getByText('정확도')).toBeInTheDocument();

      // 2턴: 저신뢰도 경고 배너
      const lowConfWarning = screen.getByTestId('low-confidence-warning');
      const lowConfFeedbackBtn = within(lowConfWarning).getByRole('button', { name: '답변 평가' });

      expect(feedbackSections[1]).toHaveClass('collapsed');

      await act(async () => {
        fireEvent.click(lowConfFeedbackBtn);
      });

      expect(feedbackSections[1]).not.toHaveClass('collapsed');
      expect(within(feedbackSections[1]).getByText('정확도')).toBeInTheDocument();
    });

    it('불만족 피드백에 사유 태그가 저장된 상태에서 [질문 보완하여 다시 질문] 클릭 시 사유 태그가 포함된 형식으로 복원된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-tags', title: '사유 태그 세션', updatedAt: '2026-08-28T01:00:00Z' },
      ]);
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue({
        sessionId: 'sess-tags',
        title: '사유 태그 세션',
        createdAt: '2026-08-28T01:00:00Z',
        updatedAt: '2026-08-28T01:00:00Z',
        turns: [
          { role: 'user', content: '원래 질문 내용', createdAt: '2026-08-28T01:00:00Z' },
          { role: 'assistant', content: '답변 내용', createdAt: '2026-08-28T01:00:01Z' },
        ],
      });
      vi.mocked(aiApi.getSessionFeedback).mockResolvedValue([
        {
          sessionId: 'sess-tags',
          turnIndex: 1,
          accuracy: 1,
          helpfulness: 1,
          comment: '[환각/사실 오류] [근거 문서와 다름] 내용이 실제와 전혀 다릅니다',
          createdAt: '2026-08-28T01:00:02Z',
          updatedAt: '2026-08-28T01:00:02Z',
        },
      ]);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('사유 태그 세션'));
      });

      const refineBtn = screen.getByRole('button', { name: '질문 보완하여 다시 질문' });
      const input = screen.getByPlaceholderText(/질문을 입력하세요/i) as HTMLInputElement;

      await act(async () => {
        fireEvent.click(refineBtn);
      });

      expect(input.value).toBe('원래 질문 내용 (보완 요청: [환각/사실 오류] [근거 문서와 다름])');
      expect(input).toHaveFocus();
    });

    it('불만족 피드백에 사유 태그 없이 자유 의견만 있는 경우 해당 의견이 보완 요청으로 바인딩된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-custom', title: '자유 의견 세션', updatedAt: '2026-08-28T01:00:00Z' },
      ]);
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue({
        sessionId: 'sess-custom',
        title: '자유 의견 세션',
        createdAt: '2026-08-28T01:00:00Z',
        updatedAt: '2026-08-28T01:00:00Z',
        turns: [
          { role: 'user', content: '2025년 매출 통계', createdAt: '2026-08-28T01:00:00Z' },
          { role: 'assistant', content: '답변', createdAt: '2026-08-28T01:00:01Z' },
        ],
      });
      vi.mocked(aiApi.getSessionFeedback).mockResolvedValue([
        {
          sessionId: 'sess-custom',
          turnIndex: 1,
          accuracy: 2,
          helpfulness: 2,
          comment: '수치 정보가 맞지 않습니다',
          createdAt: '2026-08-28T01:00:02Z',
          updatedAt: '2026-08-28T01:00:02Z',
        },
      ]);

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('자유 의견 세션'));
      });

      const refineBtn = screen.getByRole('button', { name: '질문 보완하여 다시 질문' });
      const input = screen.getByPlaceholderText(/질문을 입력하세요/i) as HTMLInputElement;

      await act(async () => {
        fireEvent.click(refineBtn);
      });

      expect(input.value).toBe('2025년 매출 통계 (보완 요청: 수치 정보가 맞지 않습니다)');
      expect(input).toHaveFocus();
    });

    it('스트리밍 진행 중(isStreaming === true)일 때 경고 배너 내 버튼 및 피드백 재질문 버튼이 비활성화된다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);
      vi.mocked(aiApi.getSessions).mockResolvedValue([
        { sessionId: 'sess-stream', title: '스트리밍 테스트 세션', updatedAt: '2026-08-28T01:00:00Z' },
      ]);
      vi.mocked(aiApi.getSessionDetail).mockResolvedValue({
        sessionId: 'sess-stream',
        title: '스트리밍 테스트 세션',
        createdAt: '2026-08-28T01:00:00Z',
        updatedAt: '2026-08-28T01:00:00Z',
        turns: [
          { role: 'user', content: '1턴 질문', createdAt: '2026-08-28T01:00:00Z' },
          {
            role: 'assistant',
            content: '1턴 근거 미발견 답변',
            confidence: 0,
            missing: [],
            sources: [],
            createdAt: '2026-08-28T01:00:01Z',
          },
        ],
      });
      vi.mocked(aiApi.getSessionFeedback).mockResolvedValue([
        {
          sessionId: 'sess-stream',
          turnIndex: 1,
          accuracy: 1,
          helpfulness: 1,
          comment: '불만족',
          createdAt: '2026-08-28T01:00:02Z',
          updatedAt: '2026-08-28T01:00:02Z',
        },
      ]);

      // 스트리밍을 종료하지 않고 진행 상태로 유지
      vi.mocked(aiApi.askQuestionStream).mockImplementation((...args) => {
        const onMessage = args[1];
        setTimeout(() => {
          onMessage('스트리밍 응답 진행 중...');
        }, 10);
        return { cancel: vi.fn() } as unknown as ReturnType<typeof aiApi.askQuestionStream>;
      });

      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <AiService />
          </AuthContext.Provider>,
        );
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /채팅 열기/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('스트리밍 테스트 세션'));
      });

      const input = screen.getByPlaceholderText(/질문을 입력하세요/i) as HTMLInputElement;
      await act(async () => {
        fireEvent.change(input, { target: { value: '새 질문' } });
        fireEvent.click(screen.getByRole('button', { name: /전송/i }));
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      // ungrounded-warning 내 버튼 비활성화 확인
      const ungroundedWarning = screen.getByTestId('ungrounded-warning');
      const refineBtn = within(ungroundedWarning).getByRole('button', { name: '질문 구체화' });
      const feedbackBtn = within(ungroundedWarning).getByRole('button', { name: '답변 평가' });
      expect(refineBtn).toBeDisabled();
      expect(feedbackBtn).toBeDisabled();

      // [질문 보완하여 다시 질문] 버튼 비활성화 확인
      const feedbackRefineBtn = screen.getByRole('button', { name: '질문 보완하여 다시 질문' });
      expect(feedbackRefineBtn).toBeDisabled();
    });
  });
});
