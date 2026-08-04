import React, { useState, useEffect, useRef, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useChatSocket } from '../hooks/useChatSocket';
import './ChatRoom.css';

export const ChatRoom = () => {
  const auth = useContext(AuthContext);
  const [roomIdInput, setRoomIdInput] = useState('lobby');
  const [roomId, setRoomId] = useState('lobby');
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const token = auth?.token ?? null;
  const { messages, connected, error, sendMessage } = useChatSocket({ roomId, token });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    sendMessage(inputMessage);
    setInputMessage('');
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomIdInput.trim()) return;
    setRoomId(roomIdInput);
  };

  // 메시지가 유입되면 스크롤을 최하단으로 부드럽게 조정
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="chat-wrapper">
      <div className="chat-sidebar glass-panel">
        <h3 className="sidebar-title">채팅 방 설정</h3>
        <form onSubmit={handleJoin} className="room-form">
          <input
            type="text"
            placeholder="방 ID (예: lobby, general)"
            value={roomIdInput}
            onChange={(e) => setRoomIdInput(e.target.value)}
            className="room-input"
            aria-label="채팅 방 ID"
          />
          <button type="submit" className="room-btn">
            이동
          </button>
        </form>
        <div className="room-status-info">
          <div className="status-row">
            <span>현재 방:</span>
            <strong>{roomId}</strong>
          </div>
          <div className="status-row">
            <span>연결 상태:</span>
            <span className={connected ? 'state-connected' : 'state-disconnected'}>
              {connected ? '연결됨' : '연결 끊김'}
            </span>
          </div>
        </div>
      </div>

      <div className="chat-main glass-panel">
        <div className="chat-header">
          <h4>Room: {roomId}</h4>
        </div>

        {error && <div className="chat-error-bar">{error}</div>}

        <div className="chat-messages-container">
          {messages.length === 0 ? (
            <div className="empty-chat-message">채팅방에 메시지가 없습니다. 첫 메시지를 보내보세요.</div>
          ) : (
            messages.map((msg) => {
              const isMine = msg.senderId === auth?.user?.uuid;
              const formattedTime = new Date(msg.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div key={msg.id} className={`message-bubble-row ${isMine ? 'mine' : 'other'}`}>
                  <div className="msg-sender-lbl">{msg.senderId}</div>
                  <div className="msg-bubble-box">
                    <p className="msg-content-text">{msg.content}</p>
                    <span className="msg-time-lbl">{formattedTime}</span>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSend} className="chat-input-form">
          <input
            type="text"
            placeholder="메시지를 입력하세요..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            disabled={!connected}
            className="chat-input-field"
            aria-label="메시지 입력"
          />
          <button type="submit" disabled={!connected || !inputMessage.trim()} className="chat-send-btn">
            전송
          </button>
        </form>
      </div>
    </div>
  );
};
export default ChatRoom;
