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
});
