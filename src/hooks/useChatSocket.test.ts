import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useChatSocket } from './useChatSocket';
import { io } from 'socket.io-client';

vi.mock('socket.io-client');
vi.mock('../flatbuffers/chatUtils', async () => {
  const actual = await vi.importActual<typeof import('../flatbuffers/chatUtils')>('../flatbuffers/chatUtils');
  return {
    ...actual,
    decodeMessageBatch: vi.fn(),
  };
});

type EventHandler = (...args: unknown[]) => void;

interface MockSocket {
  on: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

describe('useChatSocket Hook', () => {
  let mockSocket: MockSocket;
  let eventHandlers: Record<string, EventHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    eventHandlers = {};

    mockSocket = {
      on: vi.fn((event: string, handler: EventHandler) => {
        eventHandlers[event] = handler;
      }),
      emit: vi.fn(),
      disconnect: vi.fn(),
    };

    (io as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockSocket);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps senderNickname to metadata on join_room response', () => {
    const { result } = renderHook(() =>
      useChatSocket({ roomId: 'lobby', token: 'valid-token' })
    );

    // connect 이벤트 트리거
    act(() => {
      eventHandlers['connect']?.();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith(
      'join_room',
      { roomId: 'lobby' },
      expect.any(Function)
    );

    // join_room 콜백 실행
    const joinRoomCall = mockSocket.emit.mock.calls.find(
      (call: unknown[]) => Array.isArray(call) && call[0] === 'join_room'
    );
    const joinRoomCallback = joinRoomCall?.[2] as (response: unknown) => void;

    act(() => {
      joinRoomCallback({
        success: true,
        messages: [
          {
            messageId: 'msg-1',
            senderUuid: 'uuid-1',
            senderNickname: '플레이어A',
            content: '안녕하세요',
            createdAt: 1710000000,
          },
          {
            messageId: 'msg-2',
            senderUuid: 'uuid-2',
            // senderNickname 누락 (레거시)
            content: '반갑습니다',
            createdAt: 1710000001,
          },
        ],
      });
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toEqual(
      expect.objectContaining({
        id: 'msg-1',
        senderId: 'uuid-1',
        content: '안녕하세요',
        metadata: '플레이어A',
        timestamp: 1710000000,
      })
    );
    expect(result.current.messages[1]).toEqual(
      expect.objectContaining({
        id: 'msg-2',
        senderId: 'uuid-2',
        content: '반갑습니다',
        metadata: '',
        timestamp: 1710000001,
      })
    );
  });

  it('preserves metadata when receiving real-time new_messages event', async () => {
    const { decodeMessageBatch } = vi.mocked(await import('../flatbuffers/chatUtils'));
    decodeMessageBatch.mockReturnValue({
      messages: [
        {
          id: 'realtime-1',
          status: 0,
          senderId: 'uuid-realtime',
          content: '실시간 메시지입니다',
          metadata: '실시간발신자',
          timestamp: 1710000002,
          eventTimestamp: 1710000002000,
        },
      ],
      latestEventTimestamp: 1710000002000,
    });

    const { result } = renderHook(() =>
      useChatSocket({ roomId: 'lobby', token: 'valid-token' })
    );

    act(() => {
      eventHandlers['connect']?.();
    });

    const dummyBuffer = new ArrayBuffer(8);
    act(() => {
      eventHandlers['new_messages']?.('lobby', dummyBuffer);
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toEqual(
      expect.objectContaining({
        id: 'realtime-1',
        senderId: 'uuid-realtime',
        content: '실시간 메시지입니다',
        metadata: '실시간발신자',
      })
    );
  });

  it('maps empty senderNickname to empty string metadata safely (AC 2 fallback)', () => {
    const { result } = renderHook(() =>
      useChatSocket({ roomId: 'lobby', token: 'valid-token' })
    );

    act(() => {
      eventHandlers['connect']?.();
    });

    const joinRoomCall = mockSocket.emit.mock.calls.find(
      (call: unknown[]) => Array.isArray(call) && call[0] === 'join_room'
    );
    const joinRoomCallback = joinRoomCall?.[2] as (response: unknown) => void;

    act(() => {
      joinRoomCallback({
        success: true,
        messages: [
          {
            messageId: 'legacy-msg',
            senderUuid: 'legacy-uuid',
            senderNickname: '',
            content: '레거시 본문',
            createdAt: 1710000000,
          },
        ],
      });
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].metadata).toBe('');
    expect(result.current.messages[0].senderId).toBe('legacy-uuid');
  });

  it('handles empty messages array in join_room response safely', () => {
    const { result } = renderHook(() =>
      useChatSocket({ roomId: 'empty-room', token: 'valid-token' })
    );

    act(() => {
      eventHandlers['connect']?.();
    });

    const joinRoomCall = mockSocket.emit.mock.calls.find(
      (call: unknown[]) => Array.isArray(call) && call[0] === 'join_room'
    );
    const joinRoomCallback = joinRoomCall?.[2] as (response: unknown) => void;

    act(() => {
      joinRoomCallback({
        success: true,
        messages: [],
      });
    });

    expect(result.current.messages).toEqual([]);
  });

  it('filters out duplicate messages on new_messages while preserving metadata', async () => {
    const { decodeMessageBatch } = vi.mocked(await import('../flatbuffers/chatUtils'));
    decodeMessageBatch.mockReturnValue({
      messages: [
        {
          id: 'dup-1',
          status: 0,
          senderId: 'uuid-user-1',
          content: '첫 번째 수신',
          metadata: '유저1',
          timestamp: 1710000001,
          eventTimestamp: 1710000001000,
        },
      ],
      latestEventTimestamp: 1710000001000,
    });

    const { result } = renderHook(() =>
      useChatSocket({ roomId: 'lobby', token: 'valid-token' })
    );

    act(() => {
      eventHandlers['connect']?.();
    });

    // 1차 수신
    act(() => {
      eventHandlers['new_messages']?.('lobby', new ArrayBuffer(8));
    });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].metadata).toBe('유저1');

    // 동일한 메시지 id로 2차 수신 (중복)
    act(() => {
      eventHandlers['new_messages']?.('lobby', new ArrayBuffer(8));
    });
    // 중복 제거되어 여전히 1개 유지
    expect(result.current.messages).toHaveLength(1);
  });

  describe('fetch_history paging', () => {
    it('sets hasMore to true when join_room returns 20 or more messages', () => {
      const { result } = renderHook(() =>
        useChatSocket({ roomId: 'lobby', token: 'valid-token' })
      );

      act(() => {
        eventHandlers['connect']?.();
      });

      const joinRoomCall = mockSocket.emit.mock.calls.find(
        (call: unknown[]) => Array.isArray(call) && call[0] === 'join_room'
      );
      const joinRoomCallback = joinRoomCall?.[2] as (response: unknown) => void;

      const mockHistory = Array.from({ length: 20 }, (_, i) => ({
        messageId: `msg-${i}`,
        senderUuid: `uuid-${i}`,
        senderNickname: `유저${i}`,
        content: `메시지 ${i}`,
        createdAt: 1710000000 + i,
      }));

      act(() => {
        joinRoomCallback({
          success: true,
          messages: mockHistory,
        });
      });

      expect(result.current.messages).toHaveLength(20);
      expect(result.current.hasMore).toBe(true);
      expect(result.current.loadingMore).toBe(false);
    });

    it('sets hasMore to false when join_room returns fewer than 20 messages', () => {
      const { result } = renderHook(() =>
        useChatSocket({ roomId: 'lobby', token: 'valid-token' })
      );

      act(() => {
        eventHandlers['connect']?.();
      });

      const joinRoomCall = mockSocket.emit.mock.calls.find(
        (call: unknown[]) => Array.isArray(call) && call[0] === 'join_room'
      );
      const joinRoomCallback = joinRoomCall?.[2] as (response: unknown) => void;

      act(() => {
        joinRoomCallback({
          success: true,
          messages: [
            {
              messageId: 'msg-1',
              senderUuid: 'uuid-1',
              content: '단일 메시지',
              createdAt: 1710000000,
            },
          ],
        });
      });

      expect(result.current.hasMore).toBe(false);
    });

    it('emits fetch_history with messages[0].timestamp as before and prepends messages', async () => {
      const { result } = renderHook(() =>
        useChatSocket({ roomId: 'lobby', token: 'valid-token' })
      );

      act(() => {
        eventHandlers['connect']?.();
      });

      // join_room 20개 메시지로 hasMore = true 설정
      const joinRoomCall = mockSocket.emit.mock.calls.find(
        (call: unknown[]) => Array.isArray(call) && call[0] === 'join_room'
      );
      const joinRoomCallback = joinRoomCall?.[2] as (response: unknown) => void;

      const initialMessages = [
        {
          messageId: 'msg-20',
          senderUuid: 'uuid-20',
          senderNickname: '유저20',
          content: '기준 메시지',
          createdAt: 1710000020,
        },
      ];

      act(() => {
        joinRoomCallback({
          success: true,
          hasMore: true,
          messages: initialMessages,
        });
      });

      expect(result.current.messages[0].id).toBe('msg-20');
      expect(result.current.hasMore).toBe(true);

      // loadMoreMessages 실행
      let loadMorePromise: Promise<void>;
      act(() => {
        loadMorePromise = result.current.loadMoreMessages();
      });

      expect(result.current.loadingMore).toBe(true);

      // fetch_history emit 확인
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'fetch_history',
        { roomId: 'lobby', before: 1710000020 },
        expect.any(Function)
      );

      const fetchHistoryCall = mockSocket.emit.mock.calls.find(
        (call: unknown[]) => Array.isArray(call) && call[0] === 'fetch_history'
      );
      const fetchHistoryCallback = fetchHistoryCall?.[2] as (response: unknown) => void;

      // 과거 메시지 응답 (1건 과거 메시지 + 1건 중복 메시지 msg-20)
      await act(async () => {
        fetchHistoryCallback({
          success: true,
          hasMore: false,
          messages: [
            {
              messageId: 'msg-10',
              senderUuid: 'uuid-10',
              senderNickname: '과거유저',
              content: '과거 메시지 10',
              createdAt: 1710000010,
            },
            {
              messageId: 'msg-20',
              senderUuid: 'uuid-20',
              senderNickname: '유저20',
              content: '중복 메시지',
              createdAt: 1710000020,
            },
          ],
        });
        await loadMorePromise;
      });

      expect(result.current.loadingMore).toBe(false);
      expect(result.current.hasMore).toBe(false);
      // msg-10이 앞에 오고, msg-20은 중복 제거되어 총 2개
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0].id).toBe('msg-10');
      expect(result.current.messages[0].content).toBe('과거 메시지 10');
      expect(result.current.messages[0].metadata).toBe('과거유저');
      expect(result.current.messages[1].id).toBe('msg-20');
    });

    it('does not emit fetch_history if hasMore is false, messages empty, or already loading', async () => {
      const { result } = renderHook(() =>
        useChatSocket({ roomId: 'lobby', token: 'valid-token' })
      );

      act(() => {
        eventHandlers['connect']?.();
      });

      // messages가 비어있고 hasMore가 false일 때
      await act(async () => {
        await result.current.loadMoreMessages();
      });

      expect(mockSocket.emit).not.toHaveBeenCalledWith(
        'fetch_history',
        expect.anything(),
        expect.anything()
      );
    });

    it('handles fetch_history error gracefully', async () => {
      const { result } = renderHook(() =>
        useChatSocket({ roomId: 'lobby', token: 'valid-token' })
      );

      act(() => {
        eventHandlers['connect']?.();
      });

      const joinRoomCall = mockSocket.emit.mock.calls.find(
        (call: unknown[]) => Array.isArray(call) && call[0] === 'join_room'
      );
      const joinRoomCallback = joinRoomCall?.[2] as (response: unknown) => void;

      act(() => {
        joinRoomCallback({
          success: true,
          hasMore: true,
          messages: [
            {
              messageId: 'msg-1',
              senderUuid: 'uuid-1',
              content: '메시지',
              createdAt: 1710000000,
            },
          ],
        });
      });

      let loadMorePromise: Promise<void>;
      act(() => {
        loadMorePromise = result.current.loadMoreMessages();
      });

      const fetchHistoryCall = mockSocket.emit.mock.calls.find(
        (call: unknown[]) => Array.isArray(call) && call[0] === 'fetch_history'
      );
      const fetchHistoryCallback = fetchHistoryCall?.[2] as (response: unknown) => void;

      await act(async () => {
        fetchHistoryCallback({
          success: false,
          error: 'join_room required',
        });
        await loadMorePromise;
      });

      expect(result.current.loadingMore).toBe(false);
      expect(result.current.error).toBe('join_room required');
    });
  });
});
