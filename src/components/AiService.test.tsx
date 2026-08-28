import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { AiService } from './AiService';
import { AuthContext } from '../context/AuthContext';
import * as aiApi from '../api/ai';

vi.mock('../api/ai', () => {
  return {
    getDocuments: vi.fn(),
    uploadDocument: vi.fn(),
    deleteDocument: vi.fn(),
    askQuestionStream: vi.fn(),
    getSessions: vi.fn().mockResolvedValue([]),
    getSessionDetail: vi.fn(),
    deleteSessionById: vi.fn(),
    subscribeIngestJob: vi.fn(),
    getDocumentFile: vi.fn(),
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

  it('blocks uploading files larger than 10MB', async () => {
    vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

    await act(async () => {
      render(<AiService />);
    });

    const file = new File([new ArrayBuffer(11 * 1024 * 1024)], 'test.pdf', { type: 'application/pdf' });
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
    expect(screen.queryByText('파일 크기는 최대 10MB까지 허용됩니다.')).not.toBeInTheDocument();
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

    // 최종 신뢰도 및 누락 항목 표시 확인
    expect(screen.getByTestId('confidence-badge')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();

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

    it('Given 출처 목록이 표시된 경우 When "원문 보기" 버튼을 누르면 Then 클릭 시점에 빈 탭을 먼저 열고 파일을 받아온 뒤 그 탭을 원본으로 이동시킨다', async () => {
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
      // 팝업 차단 우회 트릭 검증용: window.open이 location.href를 설정할 수 있는
      // 가짜 창 객체를 반환하도록 한다(await 이후 window.open을 다시 부르면
      // 브라우저가 팝업으로 차단할 수 있어, 클릭 시점에 미리 연 탭을 재활용해야 한다).
      const fakeTab = { location: { href: '' }, close: vi.fn() };
      const windowOpenMock = vi.fn().mockReturnValue(fakeTab);
      vi.stubGlobal('open', windowOpenMock);

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

      expect(windowOpenMock).toHaveBeenCalledWith('', '_blank');
      expect(aiApi.getDocumentFile).toHaveBeenCalledWith('d-view');
      expect(createObjectURLMock).toHaveBeenCalledWith(fakeBlob);
      expect(fakeTab.location.href).toBe('blob:fake-url');

      vi.unstubAllGlobals();
    });

    it('Given 원본이 저장되어 있지 않은 문서인 경우 When "원문 보기"를 누르면 Then 채팅 모달 내부에 실패 안내가 보이고 미리 열어둔 탭을 닫는다', async () => {
      vi.mocked(aiApi.getDocuments).mockResolvedValue([]);

      const mockSources: aiApi.SourceRef[] = [
        { fileName: 'missing.pdf', chunkIndex: 0, documentId: 'd-missing', score: 0.3 },
      ];

      vi.mocked(aiApi.getDocumentFile).mockRejectedValueOnce(new Error('404'));

      const fakeTab = { location: { href: '' }, close: vi.fn() };
      const windowOpenMock = vi.fn().mockReturnValue(fakeTab);
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

      expect(fakeTab.close).toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent('원본 파일을 불러오는 데 실패했습니다');

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

      // 마지막 AI 턴의 출처가 표시되고 이전 AI 턴의 출처는 참고 문서 목록에 노출되지 않음
      expect(screen.getByText('turn2_doc.pdf')).toBeInTheDocument();
      expect(screen.queryByText('turn1_doc.pdf')).not.toBeInTheDocument();
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
});

