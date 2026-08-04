import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { sendMail } from '../api/identity';
import { Payment } from './Payment';
import { ChatRoom } from './ChatRoom';
import { AiService } from './AiService';
import './Profile.css';

export const Profile = () => {
  const auth = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState<'mail' | 'shop' | 'chat' | 'ai'>('mail');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mailStatus, setMailStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');

  if (!auth || !auth.user) return null;

  const handleSendMail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.user?.accountId) {
      setMailStatus('error');
      setStatusMessage('계정 정보가 올바르지 않습니다.');
      return;
    }
    if (!title.trim() || !body.trim()) {
      setMailStatus('error');
      setStatusMessage('메일 제목과 내용을 모두 입력해 주세요.');
      return;
    }

    setMailStatus('sending');
    try {
      await sendMail(auth.user.accountId, title, body);
      setMailStatus('success');
      setStatusMessage('메일이 성공적으로 전송되었습니다.');
      setTitle('');
      setBody('');
    } catch (error) {
      setMailStatus('error');
      setStatusMessage('메일 전송에 실패했습니다. 다시 시도해 주세요.');
    }
  };

  return (
    <div className="profile-wrapper">
      <div className="profile-container glass-panel">
        <div className="profile-header">
          <div className="profile-avatar">
            {auth.user.nickName ? auth.user.nickName.substring(0, 2).toUpperCase() : 'U'}
          </div>
          <div className="profile-meta">
            <h3 className="profile-nickname">{auth.user.nickName || '이름 없음'}</h3>
            <p className="profile-uuid">UUID: {auth.user.uuid}</p>
            <p className="profile-id">Account ID: {auth.user.accountId ?? 'N/A'}</p>
          </div>
          <button onClick={auth.logout} className="logout-button">
            로그아웃
          </button>
        </div>

        <div className="profile-tabs">
          <button
            onClick={() => setActiveTab('mail')}
            className={`tab-button ${activeTab === 'mail' ? 'active' : ''}`}
          >
            메일 보내기
          </button>
          <button
            onClick={() => setActiveTab('shop')}
            className={`tab-button ${activeTab === 'shop' ? 'active' : ''}`}
          >
            프리미엄 숍
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`tab-button ${activeTab === 'chat' ? 'active' : ''}`}
          >
            실시간 채팅
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={`tab-button ${activeTab === 'ai' ? 'active' : ''}`}
          >
            AI 서비스
          </button>
        </div>

        <div className="tab-content">
          {activeTab === 'mail' && (
            <div className="mail-section">
              <h4 className="mail-title">게임 메일 전송 테스트</h4>
              <form onSubmit={handleSendMail} className="mail-form">
                <input
                  type="text"
                  placeholder="메일 제목"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={mailStatus === 'sending'}
                  className="mail-input"
                />
                <textarea
                  placeholder="메일 내용"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  disabled={mailStatus === 'sending'}
                  className="mail-textarea"
                  rows={4}
                />
                {mailStatus !== 'idle' && (
                  <div className={`mail-status-message ${mailStatus}`}>
                    {statusMessage}
                  </div>
                )}
                <button type="submit" disabled={mailStatus === 'sending'} className="mail-button">
                  {mailStatus === 'sending' ? '전송 중...' : '메일 보내기'}
                </button>
              </form>
            </div>
          )}

          {activeTab === 'shop' && <Payment />}

          {activeTab === 'chat' && <ChatRoom />}

          {activeTab === 'ai' && <AiService />}
        </div>
      </div>
    </div>
  );
};
export default Profile;
