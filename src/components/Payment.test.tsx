import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

const renderPayment = () =>
  render(
    <AuthContext.Provider value={mockAuthValue}>
      <Payment />
    </AuthContext.Provider>
  );

describe('Payment Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders product items and purchases when the payment completes', async () => {
    const mockPaymentResponse = {
      data: {
        data: {
          paymentId: 999,
          accountId: 101,
          amount: 1000,
          currency: 'KRW',
          productId: 'gold_100',
          status: 'COMPLETED',
        },
      },
    };

    vi.mocked(axios.post).mockResolvedValueOnce(mockPaymentResponse);

    renderPayment();

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

  it('shows a failure message and failed styling when the backend reports FAILED', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        data: {
          paymentId: 998,
          accountId: 101,
          amount: 1000,
          currency: 'KRW',
          productId: 'gold_100',
          status: 'FAILED',
        },
      },
    });

    renderPayment();
    const buyBtn = screen.getAllByRole('button', { name: /구매하기/i })[0];
    await act(async () => {
      buyBtn.click();
    });

    expect(screen.getByText('결제에 실패했습니다')).toBeInTheDocument();
    expect(screen.queryByText('결제가 완료되었습니다!')).not.toBeInTheDocument();
    expect(screen.getByText('FAILED')).toHaveClass('status-failed');
  });

  it('reuses the same idempotencyKey when retrying after a network error', async () => {
    vi.mocked(axios.post).mockRejectedValueOnce(new Error('network down'));

    renderPayment();
    const buyBtn = screen.getAllByRole('button', { name: /구매하기/i })[0];
    await act(async () => {
      buyBtn.click();
    });

    expect(screen.getByText('결제 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    const firstKey = (vi.mocked(axios.post).mock.calls[0][1] as { idempotencyKey: string }).idempotencyKey;

    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        data: {
          paymentId: 997,
          accountId: 101,
          amount: 1000,
          currency: 'KRW',
          productId: 'gold_100',
          status: 'COMPLETED',
        },
      },
    });

    await act(async () => {
      buyBtn.click();
    });

    const secondKey = (vi.mocked(axios.post).mock.calls[1][1] as { idempotencyKey: string }).idempotencyKey;
    expect(secondKey).toBe(firstKey);
  });

  it('polls for the final status when the payment starts as PENDING', async () => {
    vi.useFakeTimers();
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        data: {
          paymentId: 555,
          accountId: 101,
          amount: 1000,
          currency: 'KRW',
          productId: 'gold_100',
          status: 'PENDING',
        },
      },
    });
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: {
        data: {
          paymentId: 555,
          accountId: 101,
          amount: 1000,
          currency: 'KRW',
          productId: 'gold_100',
          status: 'COMPLETED',
        },
      },
    });

    renderPayment();
    const buyBtn = screen.getAllByRole('button', { name: /구매하기/i })[0];

    await act(async () => {
      buyBtn.click();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText('결제를 확인하고 있습니다')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(axios.get).toHaveBeenCalledWith('/payments/555');
    expect(screen.getByText('결제가 완료되었습니다!')).toBeInTheDocument();
  });

  it('switches to the 결제 내역 tab and fetches the payment list, hiding the shop grid', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: {
        data: {
          payments: [
            {
              paymentId: 321,
              accountId: 101,
              amount: 4500,
              currency: 'KRW',
              productId: 'gold_500',
              status: 'COMPLETED',
            },
          ],
          page: 1,
          take: 20,
          itemCount: 1,
          pageCount: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      },
    });

    renderPayment();

    await act(async () => {
      screen.getByRole('button', { name: '결제 내역' }).click();
    });

    expect(axios.get).toHaveBeenCalledWith('/payments', { params: { page: 1, take: 20 } });
    expect(screen.queryByText('100 Gold Coins')).not.toBeInTheDocument();
    expect(screen.getByText('321')).toBeInTheDocument();
  });
});
