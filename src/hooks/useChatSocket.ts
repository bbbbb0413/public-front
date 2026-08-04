import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { buildSendMessageRequest, decodeMessageBatch, DecodedMessage } from '../flatbuffers/chatUtils';

interface SocketAck {
  success: boolean;
  error?: string;
}

interface UseChatSocketProps {
  roomId: string;
  token: string | null;
}

export const useChatSocket = ({ roomId, token }: UseChatSocketProps) => {
  const [messages, setMessages] = useState<DecodedMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token || !roomId) return;

    const gatewayUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
    
    // /chat/ws 네임스페이스로 Socket.IO 클라이언트 생성
    const socket = io(`${gatewayUrl}/chat/ws`, {
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
    };
  }, [roomId, token]);

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
    } catch (e) {
      setError('메시지 빌드 중 오류가 발생했습니다.');
    }
  }, [roomId, connected]);

  return { messages, connected, error, sendMessage };
};
