import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { Login } from './Login';
import { AuthContext } from '../context/AuthContext';

const mockLogin = vi.fn();
const mockRegister = vi.fn();
const mockLogout = vi.fn();

const mockAuthValue = {
  user: null,
  token: null,
  isAuthenticated: false,
  login: mockLogin,
  register: mockRegister,
  logout: mockLogout,
};

const renderLogin = (onSwitchToRegister = vi.fn()) =>
  render(
    <AuthContext.Provider value={mockAuthValue}>
      <Login onSwitchToRegister={onSwitchToRegister} />
    </AuthContext.Provider>
  );

describe('Login Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders UUID input and submit button', () => {
    renderLogin();
    expect(screen.getByLabelText('게임 유저 UUID')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '접속하기' })).toBeInTheDocument();
  });

  it('shows validation error when UUID is empty and form is submitted', async () => {
    renderLogin();
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: '접속하기' }).closest('form')!);
    });
    expect(screen.getByText('UUID를 입력해주세요.')).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('calls auth.login with trimmed UUID on successful submit', async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    renderLogin();
    fireEvent.change(screen.getByLabelText('게임 유저 UUID'), { target: { value: 'test-user-1' } });
    await act(async () => {
      fireEvent.submit(screen.getByLabelText('게임 유저 UUID').closest('form')!);
    });
    expect(mockLogin).toHaveBeenCalledWith('test-user-1');
  });

  it('shows error message when auth.login throws', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Unauthorized'));
    renderLogin();
    fireEvent.change(screen.getByLabelText('게임 유저 UUID'), { target: { value: 'bad-uuid' } });
    await act(async () => {
      fireEvent.submit(screen.getByLabelText('게임 유저 UUID').closest('form')!);
    });
    expect(screen.getByText('로그인에 실패했습니다. 올바른 UUID인지 확인해주세요.')).toBeInTheDocument();
  });

  it('disables input and button while loading', async () => {
    let resolveLogin!: () => void;
    mockLogin.mockReturnValueOnce(new Promise<void>((r) => { resolveLogin = r; }));
    renderLogin();
    fireEvent.change(screen.getByLabelText('게임 유저 UUID'), { target: { value: 'user1' } });
    act(() => {
      fireEvent.submit(screen.getByLabelText('게임 유저 UUID').closest('form')!);
    });
    expect(screen.getByLabelText('게임 유저 UUID')).toBeDisabled();
    expect(screen.getByText('접속 중...')).toBeInTheDocument();
    await act(async () => { resolveLogin(); });
  });

  it('calls onSwitchToRegister when 회원가입 button is clicked', () => {
    const onSwitch = vi.fn();
    renderLogin(onSwitch);
    fireEvent.click(screen.getByText('회원가입'));
    expect(onSwitch).toHaveBeenCalledOnce();
  });

  it('returns null when AuthContext is not provided', () => {
    const { container } = render(
      <AuthContext.Provider value={null as never}>
        <Login onSwitchToRegister={vi.fn()} />
      </AuthContext.Provider>
    );
    expect(container.firstChild).toBeNull();
  });
});
