import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { ChatRoom } from './ChatRoom';
import { AuthContext } from '../context/AuthContext';
import * as useChatSocketModule from '../hooks/useChatSocket';

vi.mock('../hooks/useChatSocket');

const mockAuthValue = {
  user: { uuid: 'my-uuid', nickName: '나자신' },
  token: 'mock-token',
  isAuthenticated: true,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
};

const defaultChatSocketReturn = {
  messages: [],
  connected: true,
  error: null,
  sendMessage: vi.fn(),
  hasMore: false,
  loadingMore: false,
  loadMoreMessages: vi.fn(),
};

const mockChatSocket = (overrides?: Partial<ReturnType<typeof useChatSocketModule.useChatSocket>>) => {
  return vi.spyOn(useChatSocketModule, 'useChatSocket').mockReturnValue({
    ...defaultChatSocketReturn,
    ...overrides,
  });
};

const renderChatRoom = () =>
  render(
    <AuthContext.Provider value={mockAuthValue}>
      <ChatRoom />
    </AuthContext.Provider>
  );

describe('ChatRoom Component', () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.clearAllMocks();
  });
  it('renders sender nickname when metadata is present', () => {
    mockChatSocket({
      messages: [
        {
          id: 'msg-1',
          status: 0,
          senderId: 'e4f1a234-5678-4321-abcd-ef0123456789',
          content: '안녕하세요!',
          metadata: '플레이어A',
          timestamp: 1710000000000,
          eventTimestamp: 1710000000000000,
        },
      ],
      connected: true,
      error: null,
      sendMessage: vi.fn(),
    });

    renderChatRoom();

    const senderLabel = screen.getByText('플레이어A');
    expect(senderLabel).toBeInTheDocument();
    expect(senderLabel).toHaveClass('msg-sender-lbl');
    expect(screen.queryByText('e4f1a234-5678-4321-abcd-ef0123456789')).not.toBeInTheDocument();
  });

  it('falls back to senderId (UUID) when metadata is empty or absent', () => {
    mockChatSocket({
      messages: [
        {
          id: 'msg-legacy',
          status: 0,
          senderId: 'legacy-uuid-1234-5678',
          content: '레거시 메시지입니다.',
          metadata: '',
          timestamp: 1710000000000,
          eventTimestamp: 1710000000000000,
        },
      ],
      connected: true,
      error: null,
      sendMessage: vi.fn(),
    });

    renderChatRoom();

    const senderLabel = screen.getByText('legacy-uuid-1234-5678');
    expect(senderLabel).toBeInTheDocument();
    expect(senderLabel).toHaveClass('msg-sender-lbl');
  });

  it('renders both nickname and fallback senderId correctly for mixed messages', () => {
    mockChatSocket({
      messages: [
        {
          id: 'msg-1',
          status: 0,
          senderId: 'uuid-user-1',
          content: '첫 번째 메시지',
          metadata: '플레이어1',
          timestamp: 1710000000000,
          eventTimestamp: 1710000000000000,
        },
        {
          id: 'msg-2',
          status: 0,
          senderId: 'uuid-user-2',
          content: '두 번째 메시지 (레거시)',
          metadata: '',
          timestamp: 1710000001000,
          eventTimestamp: 1710000001000000,
        },
      ],
      connected: true,
      error: null,
      sendMessage: vi.fn(),
    });

    renderChatRoom();

    expect(screen.getByText('플레이어1')).toBeInTheDocument();
    expect(screen.getByText('uuid-user-2')).toBeInTheDocument();
    expect(screen.queryByText('uuid-user-1')).not.toBeInTheDocument();
  });

  it('renders own message sender nickname when metadata is present (AC 1)', () => {
    mockChatSocket({
      messages: [
        {
          id: 'msg-mine-1',
          status: 0,
          senderId: 'my-uuid',
          content: '내가 보낸 메시지',
          metadata: '플레이어A',
          timestamp: 1710000000000,
          eventTimestamp: 1710000000000000,
        },
      ],
      connected: true,
      error: null,
      sendMessage: vi.fn(),
    });

    renderChatRoom();

    const senderLabel = screen.getByText('플레이어A');
    expect(senderLabel).toBeInTheDocument();
    expect(senderLabel).toHaveClass('msg-sender-lbl');
    expect(screen.queryByText('my-uuid')).not.toBeInTheDocument();
  });

  it('falls back to senderId when metadata is undefined or only whitespace (AC 2)', () => {
    mockChatSocket({
      messages: [
        {
          id: 'msg-undef',
          status: 0,
          senderId: 'legacy-undef-uuid',
          content: '메타데이터가 없는 메시지',
          metadata: undefined as unknown as string,
          timestamp: 1710000000000,
          eventTimestamp: 1710000000000000,
        },
      ],
      connected: true,
      error: null,
      sendMessage: vi.fn(),
    });

    renderChatRoom();

    const senderLabel = screen.getByText('legacy-undef-uuid');
    expect(senderLabel).toBeInTheDocument();
    expect(senderLabel).toHaveClass('msg-sender-lbl');
  });

  it('renders join_room history messages showing sender nicknames (AC 5)', () => {
    mockChatSocket({
      messages: [
        {
          id: 'hist-1',
          status: 0,
          senderId: 'other-uuid-1',
          content: '이전 대화 내용 1',
          metadata: '작성자1',
          timestamp: 1710000000000,
          eventTimestamp: 1710000000000000,
        },
        {
          id: 'hist-2',
          status: 0,
          senderId: 'other-uuid-2',
          content: '이전 대화 내용 2',
          metadata: '작성자2',
          timestamp: 1710000001000,
          eventTimestamp: 1710000001000000,
        },
      ],
      connected: true,
      error: null,
      sendMessage: vi.fn(),
    });

    renderChatRoom();

    expect(screen.getByText('작성자1')).toBeInTheDocument();
    expect(screen.getByText('작성자2')).toBeInTheDocument();
    expect(screen.queryByText('other-uuid-1')).not.toBeInTheDocument();
    expect(screen.queryByText('other-uuid-2')).not.toBeInTheDocument();
  });

  describe('Chat history paging (load more)', () => {
    it('renders [이전 대화 더보기] button when hasMore is true and messages exist', () => {
      mockChatSocket({
        messages: [
          {
            id: 'msg-1',
            status: 0,
            senderId: 'uuid-1',
            content: '대화 내용 1',
            metadata: '유저1',
            timestamp: 1710000000000,
            eventTimestamp: 1710000000000000,
          },
        ],
        hasMore: true,
      });

      renderChatRoom();

      const loadMoreBtn = screen.getByRole('button', { name: '이전 대화 더보기' });
      expect(loadMoreBtn).toBeInTheDocument();
      expect(loadMoreBtn).toHaveClass('btn-load-more');
      expect(loadMoreBtn).not.toBeDisabled();
    });

    it('calls loadMoreMessages when [이전 대화 더보기] button is clicked', () => {
      const loadMoreMessagesMock = vi.fn();
      mockChatSocket({
        messages: [
          {
            id: 'msg-1',
            status: 0,
            senderId: 'uuid-1',
            content: '대화 내용 1',
            metadata: '유저1',
            timestamp: 1710000000000,
            eventTimestamp: 1710000000000000,
          },
        ],
        hasMore: true,
        loadMoreMessages: loadMoreMessagesMock,
      });

      renderChatRoom();

      const loadMoreBtn = screen.getByRole('button', { name: '이전 대화 더보기' });
      loadMoreBtn.click();

      expect(loadMoreMessagesMock).toHaveBeenCalledTimes(1);
    });

    it('renders disabled "불러오는 중..." button when loadingMore is true', () => {
      mockChatSocket({
        messages: [
          {
            id: 'msg-1',
            status: 0,
            senderId: 'uuid-1',
            content: '대화 내용 1',
            metadata: '유저1',
            timestamp: 1710000000000,
            eventTimestamp: 1710000000000000,
          },
        ],
        hasMore: true,
        loadingMore: true,
      });

      renderChatRoom();

      const loadMoreBtn = screen.getByRole('button', { name: '불러오는 중...' });
      expect(loadMoreBtn).toBeInTheDocument();
      expect(loadMoreBtn).toHaveClass('btn-load-more');
      expect(loadMoreBtn).toBeDisabled();
    });

    it('does not render load more button when hasMore is false', () => {
      mockChatSocket({
        messages: [
          {
            id: 'msg-1',
            status: 0,
            senderId: 'uuid-1',
            content: '대화 내용 1',
            metadata: '유저1',
            timestamp: 1710000000000,
            eventTimestamp: 1710000000000000,
          },
        ],
        hasMore: false,
      });

      renderChatRoom();

      expect(screen.queryByRole('button', { name: /이전 대화 더보기|불러오는 중.../ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '이전 대화 더보기' })).not.toBeInTheDocument();
    });

    it('does not render load more button when messages is empty even if hasMore is true', () => {
      mockChatSocket({
        messages: [],
        hasMore: true,
      });

      renderChatRoom();

      expect(screen.queryByRole('button', { name: /이전 대화 더보기|불러오는 중.../ })).not.toBeInTheDocument();
    });

    it('renders button with type="button" for accessibility and form safety', () => {
      mockChatSocket({
        messages: [
          {
            id: 'msg-1',
            status: 0,
            senderId: 'uuid-1',
            content: '대화 내용 1',
            metadata: '유저1',
            timestamp: 1710000000000,
            eventTimestamp: 1710000000000000,
          },
        ],
        hasMore: true,
      });

      renderChatRoom();

      const loadMoreBtn = screen.getByRole('button', { name: '이전 대화 더보기' });
      expect(loadMoreBtn).toHaveAttribute('type', 'button');
    });
  });
});
