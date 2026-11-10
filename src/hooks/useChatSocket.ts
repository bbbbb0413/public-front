import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { buildSendMessageRequest, decodeMessageBatch, DecodedMessage } from '../flatbuffers/chatUtils';
import { GATEWAY_BASE_URL } from '../utils/gateway-url';

interface HistoryMessage {
  messageId: string;
  senderUuid: string;
  senderNickname?: string;
  content: string;
  createdAt: number;
}

interface SocketAck {
  success: boolean;
  error?: string;
  messages?: HistoryMessage[];
  hasMore?: boolean;
}

export interface FetchHistoryAck {
  success: boolean;
  error?: string;
  messages?: HistoryMessage[];
  hasMore?: boolean;
}

const DEFAULT_HISTORY_LIMIT = 20;

interface UseChatSocketProps {
  roomId: string;
  token: string | null;
}

export const useChatSocket = ({ roomId, token }: UseChatSocketProps) => {
  const [messages, setMessages] = useState<DecodedMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token || !roomId) return;

    // /chat/ws 네임스페이스로 Socket.IO 클라이언트 생성
    const socket = io(`${GATEWAY_BASE_URL}/chat/ws`, {
      transports: ['websocket'],
      auth: { token },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setError(null);

      // 방 입장 요청
      socket.emit('join_room', { roomId }, (response: SocketAck) => {
        if (response && !response.success) {
          setError(response.error || '방 입장에 실패했습니다.');
          return;
        }
        if (response?.messages) {
          const history: DecodedMessage[] = response.messages.map((m) => ({
            id: m.messageId,
            status: 0,
            senderId: m.senderUuid,
            content: m.content,
            metadata: m.senderNickname || '',
            timestamp: m.createdAt,
            eventTimestamp: m.createdAt * 1000,
          }));
          setMessages(history);
          const more =
            response.hasMore !== undefined
              ? response.hasMore
              : history.length >= DEFAULT_HISTORY_LIMIT;
          setHasMore(more);
        }
      });
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('connect_error', (err) => {
      setError(err.message || '소켓 연결에 실패했습니다.');
    });

    // new_messages 이벤트 수신 처리
    socket.on('new_messages', (incomingRoomId: string, batchBuffer: ArrayBuffer) => {
      if (incomingRoomId === roomId) {
        try {
          const decoded = decodeMessageBatch(new Uint8Array(batchBuffer));
          setMessages((prev) => {
            // 중복 메시지 유입 방지 (ID 기준 필터링)
            const existingIds = new Set(prev.map((m) => m.id));
            const newMsgs = decoded.messages.filter((m) => !existingIds.has(m.id));
            return [...prev, ...newMsgs].sort((a, b) => a.eventTimestamp - b.eventTimestamp);
          });
        } catch (e) {
          console.error('Failed to decode incoming messages', e);
        }
      }
    });

    return () => {
      if (socket) {
        socket.emit('leave_room', { roomId });
        socket.disconnect();
      }
      socketRef.current = null;
      setConnected(false);
      setMessages([]);
      setHasMore(false);
      setLoadingMore(false);
    };
  }, [roomId, token]);

  // 이전 대화 페이징 조회 유틸
  const loadMoreMessages = useCallback(async (): Promise<void> => {
    const socket = socketRef.current;
    if (!socket || loadingMore || !hasMore || messages.length === 0) {
      return;
    }

    const oldestTimestamp = messages[0].timestamp;
    setLoadingMore(true);

    return new Promise<void>((resolve) => {
      socket.emit(
        'fetch_history',
        { roomId, before: oldestTimestamp },
        (response: FetchHistoryAck) => {
          try {
            if (response && !response.success) {
              setError(response.error || '이전 대화를 불러오지 못했습니다.');
              return;
            }

            if (response?.messages) {
              const history: DecodedMessage[] = response.messages.map((m) => ({
                id: m.messageId,
                status: 0,
                senderId: m.senderUuid,
                content: m.content,
                metadata: m.senderNickname || '',
                timestamp: m.createdAt,
                eventTimestamp: m.createdAt * 1000,
              }));

              setMessages((prev) => {
                const existingIds = new Set(prev.map((m) => m.id));
                const filteredHistory = history.filter((m) => !existingIds.has(m.id));
                return [...filteredHistory, ...prev];
              });

              setHasMore(response.hasMore ?? false);
            } else {
              setHasMore(false);
            }
          } finally {
            setLoadingMore(false);
            resolve();
          }
        }
      );
    });
  }, [roomId, loadingMore, hasMore, messages]);

  // 메시지 송신 유틸
  const sendMessage = useCallback((content: string) => {
    const socket = socketRef.current;
    if (!socket || !connected) {
      setError('서버에 연결되어 있지 않습니다.');
      return;
    }

    try {
      const buffer = buildSendMessageRequest(roomId, content, '');
      socket.emit('send_message', buffer, (response: SocketAck) => {
        if (response && !response.success) {
          setError(response.error || '메시지 전송에 실패했습니다.');
        }
      });
    } catch {
      setError('메시지 빌드 중 오류가 발생했습니다.');
    }
  }, [roomId, connected]);

  return { messages, connected, error, sendMessage, hasMore, loadingMore, loadMoreMessages };
};
