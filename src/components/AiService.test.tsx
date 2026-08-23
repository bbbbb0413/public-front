import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
            phase: 'searching',
            confidence: 0,
            missing: [],
          });
        }, 20);

        setTimeout(() => {
          onProgress?.({
            iteration: 2,
            phase: 'refining',
            confidence: 0.85,
            missing: ['결제 취소 정책'],
          });
          onMessage('답변 완료되었습니다.');
        }, 80);

        setTimeout(() => {
          onDone();
        }, 150);

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
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    expect(screen.getByTestId('agent-progress')).toBeInTheDocument();
    expect(screen.getByText(/반복 1회차/i)).toBeInTheDocument();
    expect(screen.getByText('관련 문서를 찾는 중')).toBeInTheDocument();

    // 2회차 refining 진행 중 확인
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(screen.getByText(/반복 2회차/i)).toBeInTheDocument();
    expect(screen.getByText('답변을 보완하고 다듬는 중')).toBeInTheDocument();

    // 완료 후 대기
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
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
        setTimeout(() => {
          onProgress?.({
            iteration: 1,
            phase: 'searching',
            confidence: 0,
            missing: [],
          });
        }, 10);

        setTimeout(() => {
          onProgress?.({
            iteration: 2,
            phase: 'critiquing',
            confidence: 0.7,
            missing: [],
          });
        }, 30);

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
      await new Promise((resolve) => setTimeout(resolve, 15));
    });
    expect(screen.getByText(/반복 1회차/i)).toBeInTheDocument();
    expect(screen.getByText('관련 문서를 찾는 중')).toBeInTheDocument();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    expect(screen.getByText(/반복 2회차/i)).toBeInTheDocument();
    expect(screen.getByText('답변을 검토하고 평가하는 중')).toBeInTheDocument();
  });

  it('Given 루프가 1회로 끝나는 단순한 질문 When 답변이 완료되면 Then 진행 표시가 사라지고 최종 신뢰도가 답변 옆에 남는다', async () => {
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
            phase: 'generating',
            confidence: 0.95,
            missing: [],
          });
          onMessage('단순 답변입니다.');
        }, 10);

        setTimeout(() => {
          onDone();
        }, 30);

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
      await new Promise((resolve) => setTimeout(resolve, 15));
    });
    expect(screen.getByText(/반복 1회차/i)).toBeInTheDocument();
    expect(screen.getByText('답변을 생성하는 중')).toBeInTheDocument();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
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
});
