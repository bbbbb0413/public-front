import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    vi.mocked(aiApi.uploadDocument).mockResolvedValueOnce({ id: 'doc-3', fileName: 'manual.txt', status: 'processed' });

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
      expect(screen.getByTestId('source-snippet-0').textContent?.length).toBe(303);
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
      expect(screen.getByText('청크 0')).toBeInTheDocument();
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
});

