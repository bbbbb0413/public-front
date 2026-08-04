import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { Register } from './Register';
import { AuthContext } from '../context/AuthContext';

const mockRegister = vi.fn();

const mockAuthValue = {
  user: null,
  token: null,
  isAuthenticated: false,
  login: vi.fn(),
  register: mockRegister,
  logout: vi.fn(),
};

const renderRegister = (onSwitchToLogin = vi.fn()) =>
  render(
    <AuthContext.Provider value={mockAuthValue}>
      <Register onSwitchToLogin={onSwitchToLogin} />
    </AuthContext.Provider>
  );

describe('Register Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nickname input and submit button', () => {
    renderRegister();
    expect(screen.getByLabelText('닉네임 (선택사항)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '계정 생성하기' })).toBeInTheDocument();
  });

  it('calls auth.register with undefined when nickname is empty', async () => {
    mockRegister.mockResolvedValueOnce(undefined);
    renderRegister();
    await act(async () => {
      fireEvent.submit(screen.getByLabelText('닉네임 (선택사항)').closest('form')!);
    });
    expect(mockRegister).toHaveBeenCalledWith(undefined);
  });

  it('calls auth.register with trimmed nickname when entered', async () => {
    mockRegister.mockResolvedValueOnce(undefined);
    renderRegister();
    fireEvent.change(screen.getByLabelText('닉네임 (선택사항)'), { target: { value: '  Tester  ' } });
    await act(async () => {
      fireEvent.submit(screen.getByLabelText('닉네임 (선택사항)').closest('form')!);
    });
    expect(mockRegister).toHaveBeenCalledWith('Tester');
  });

  it('shows error message when auth.register throws', async () => {
    mockRegister.mockRejectedValueOnce(new Error('Server error'));
    renderRegister();
    await act(async () => {
      fireEvent.submit(screen.getByLabelText('닉네임 (선택사항)').closest('form')!);
    });
    expect(screen.getByText('계정 생성에 실패했습니다. 다시 시도해주세요.')).toBeInTheDocument();
  });

  it('disables input and shows loading text while submitting', async () => {
    let resolveRegister!: () => void;
    mockRegister.mockReturnValueOnce(new Promise<void>((r) => { resolveRegister = r; }));
    renderRegister();
    act(() => {
      fireEvent.submit(screen.getByLabelText('닉네임 (선택사항)').closest('form')!);
    });
    expect(screen.getByLabelText('닉네임 (선택사항)')).toBeDisabled();
    expect(screen.getByText('생성 중...')).toBeInTheDocument();
    await act(async () => { resolveRegister(); });
  });

  it('calls onSwitchToLogin when 로그인 link is clicked', () => {
    const onSwitch = vi.fn();
    renderRegister(onSwitch);
    fireEvent.click(screen.getByText('로그인'));
    expect(onSwitch).toHaveBeenCalledOnce();
  });

  it('returns null when AuthContext is not provided', () => {
    const { container } = render(
      <AuthContext.Provider value={null as never}>
        <Register onSwitchToLogin={vi.fn()} />
      </AuthContext.Provider>
    );
    expect(container.firstChild).toBeNull();
  });
});
