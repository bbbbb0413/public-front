import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { Payment } from './Payment';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';

// axios 모킹
vi.mock('axios', () => {
  return {
    default: {
      create: vi.fn().mockReturnThis(),
      interceptors: {
        request: { use: vi.fn(), eject: vi.fn() },
        response: { use: vi.fn(), eject: vi.fn() },
      },
      post: vi.fn(),
      get: vi.fn(),
    },
  };
});

// 가상 AuthContext Value
const mockAuthValue = {
  user: { uuid: 'test-user', accountId: 101, nickName: 'Tester' },
  token: 'mock-jwt-token',
  isAuthenticated: true,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
};

describe('Payment Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders product items and purchases when clicked', async () => {
    const mockPaymentResponse = {
      data: {
        data: {
          paymentId: 999,
          accountId: 101,
          amount: 1000,
          currency: 'KRW',
          productId: 'gold_100',
          status: 'SUCCESS',
        },
      },
    };

    vi.mocked(axios.post).mockResolvedValueOnce(mockPaymentResponse);

    render(
      <AuthContext.Provider value={mockAuthValue}>
        <Payment />
      </AuthContext.Provider>
    );

    // 상품 카드 확인
    expect(screen.getByText('100 Gold Coins')).toBeInTheDocument();
    
    // 구매 버튼 클릭
    const buyBtn = screen.getAllByRole('button', { name: /구매하기/i })[0];
    await act(async () => {
      buyBtn.click();
    });

    expect(axios.post).toHaveBeenCalledWith('/payments', {
      amount: 1000,
      currency: 'KRW',
      productId: 'gold_100',
      idempotencyKey: expect.any(String),
    });

    // 영수증 확인
    expect(screen.getByText('결제가 완료되었습니다!')).toBeInTheDocument();
    expect(screen.getByText(/999/)).toBeInTheDocument(); // Payment ID
  });
});
