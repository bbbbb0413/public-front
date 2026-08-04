import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { Profile } from './Profile';
import { AuthContext } from '../context/AuthContext';

vi.mock('../api/identity', () => ({
  sendMail: vi.fn(),
}));

vi.mock('./Payment', () => ({
  Payment: () => <div data-testid="payment-mock">Payment</div>,
}));

vi.mock('./ChatRoom', () => ({
  ChatRoom: () => <div data-testid="chatroom-mock">ChatRoom</div>,
  default: () => <div data-testid="chatroom-mock">ChatRoom</div>,
}));

vi.mock('./AiService', () => ({
  AiService: () => <div data-testid="aiservice-mock">AiService</div>,
}));

import { sendMail } from '../api/identity';

const mockLogout = vi.fn();
const mockAuthValue = {
  user: { uuid: 'test-uuid-123', accountId: 42, nickName: 'Tester' },
  token: 'mock-token',
  isAuthenticated: true,
  login: vi.fn(),
  register: vi.fn(),
  logout: mockLogout,
};

const renderProfile = () =>
  render(
    <AuthContext.Provider value={mockAuthValue}>
      <Profile />
    </AuthContext.Provider>
  );

describe('Profile Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders user nickname, uuid, and account id', () => {
    renderProfile();
    expect(screen.getByText('Tester')).toBeInTheDocument();
    expect(screen.getByText(/test-uuid-123/)).toBeInTheDocument();
    expect(screen.getByText(/42/)).toBeInTheDocument();
  });

  it('calls auth.logout when logout button is clicked', () => {
    renderProfile();
    fireEvent.click(screen.getByText('로그아웃'));
    expect(mockLogout).toHaveBeenCalledOnce();
  });

  it('renders mail tab by default', () => {
    renderProfile();
    expect(screen.getByText('게임 메일 전송 테스트')).toBeInTheDocument();
  });

  it('switches to shop tab and renders Payment component', () => {
    renderProfile();
    fireEvent.click(screen.getByRole('button', { name: '프리미엄 숍' }));
    expect(screen.getByTestId('payment-mock')).toBeInTheDocument();
  });

  it('switches to chat tab and renders ChatRoom component', () => {
    renderProfile();
    fireEvent.click(screen.getByRole('button', { name: '실시간 채팅' }));
    expect(screen.getByTestId('chatroom-mock')).toBeInTheDocument();
  });

  it('switches to ai tab and renders AiService component', () => {
    renderProfile();
    fireEvent.click(screen.getByRole('button', { name: 'AI 서비스' }));
    expect(screen.getByTestId('aiservice-mock')).toBeInTheDocument();
  });

  it('shows validation error when title or body is empty', async () => {
    renderProfile();
    const mailForm = document.querySelector('.mail-form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(mailForm);
    });
    expect(screen.getByText('메일 제목과 내용을 모두 입력해 주세요.')).toBeInTheDocument();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('calls sendMail and shows success message on submit', async () => {
    vi.mocked(sendMail).mockResolvedValueOnce({ success: true });
    renderProfile();
    fireEvent.change(screen.getByPlaceholderText('메일 제목'), { target: { value: 'Test Title' } });
    fireEvent.change(screen.getByPlaceholderText('메일 내용'), { target: { value: 'Test Body' } });
    const mailForm = document.querySelector('.mail-form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(mailForm);
    });
    expect(sendMail).toHaveBeenCalledWith(42, 'Test Title', 'Test Body');
    expect(screen.getByText('메일이 성공적으로 전송되었습니다.')).toBeInTheDocument();
  });

  it('shows error message when sendMail throws', async () => {
    vi.mocked(sendMail).mockRejectedValueOnce(new Error('Network error'));
    renderProfile();
    fireEvent.change(screen.getByPlaceholderText('메일 제목'), { target: { value: 'Title' } });
    fireEvent.change(screen.getByPlaceholderText('메일 내용'), { target: { value: 'Body' } });
    const mailForm = document.querySelector('.mail-form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(mailForm);
    });
    expect(screen.getByText('메일 전송에 실패했습니다. 다시 시도해 주세요.')).toBeInTheDocument();
  });

  it('returns null when user is not authenticated', () => {
    const { container } = render(
      <AuthContext.Provider value={{ ...mockAuthValue, user: null, isAuthenticated: false }}>
        <Profile />
      </AuthContext.Provider>
    );
    expect(container.firstChild).toBeNull();
  });
});
