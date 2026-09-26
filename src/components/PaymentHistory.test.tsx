import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { PaymentHistory } from './PaymentHistory';
import axios from 'axios';

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

describe('PaymentHistory Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and renders the payment list with createdAt and default pagination info', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: {
        data: {
          payments: [
            {
              paymentId: 101,
              accountId: 42,
              amount: 5000,
              currency: 'KRW',
              productId: 'gold_500',
              status: 'COMPLETED',
              createdAt: '2026-09-12T14:30:00.000Z',
            },
            {
              paymentId: 102,
              accountId: 42,
              amount: 1000,
              currency: 'KRW',
              productId: 'gold_100',
              status: 'FAILED',
              createdAt: '',
            },
          ],
          page: 1,
          take: 20,
          itemCount: 2,
          pageCount: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      },
    });

    render(<PaymentHistory />);

    expect(axios.get).toHaveBeenCalledWith('/payments', { params: { page: 1, take: 20 } });
    expect(screen.queryByPlaceholderText('결제 ID 입력')).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('101')).toBeInTheDocument());
    expect(screen.getByText('gold_500')).toBeInTheDocument();
    expect(screen.getByText('gold_100')).toBeInTheDocument();
    expect(screen.getByText('COMPLETED')).toHaveClass('status-success');
    expect(screen.getByText('FAILED')).toHaveClass('status-failed');

    // 결제 일시 렌더링 및 빈 값 폴백 확인
    expect(screen.getAllByText('결제 일시')).toHaveLength(2);
    expect(screen.getByText('2026-09-12 14:30:00')).toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument();

    // 페이지네이션 컨트롤 확인 (1 / 1, 둘 다 비활성화)
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    const prevBtn = screen.getByRole('button', { name: '이전' });
    const nextBtn = screen.getByRole('button', { name: '다음' });
    expect(prevBtn).toBeDisabled();
    expect(nextBtn).toBeDisabled();
  });

  it('handles multi-page pagination navigation correctly', async () => {
    // 1페이지 응답 (총 25건 중 20건, 총 2페이지)
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: {
        data: {
          payments: Array.from({ length: 20 }, (_, i) => ({
            paymentId: i + 1,
            accountId: 42,
            amount: 1000,
            currency: 'KRW',
            productId: `gold_${i + 1}`,
            status: 'COMPLETED',
            createdAt: '2026-09-12T14:30:00.000Z',
          })),
          page: 1,
          take: 20,
          itemCount: 25,
          pageCount: 2,
          hasPreviousPage: false,
          hasNextPage: true,
        },
      },
    });

    render(<PaymentHistory />);

    await waitFor(() => expect(screen.getByText('1 / 2')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음' })).not.toBeDisabled();

    // 2페이지 응답 모킹 및 다음 버튼 클릭
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: {
        data: {
          payments: Array.from({ length: 5 }, (_, i) => ({
            paymentId: 21 + i,
            accountId: 42,
            amount: 1000,
            currency: 'KRW',
            productId: `gold_${21 + i}`,
            status: 'COMPLETED',
            createdAt: '2026-09-12T15:00:00.000Z',
          })),
          page: 2,
          take: 20,
          itemCount: 25,
          pageCount: 2,
          hasPreviousPage: true,
          hasNextPage: false,
        },
      },
    });

    await act(async () => {
      screen.getByRole('button', { name: '다음' }).click();
    });

    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledWith('/payments', { params: { page: 2, take: 20 } });
    });

    await waitFor(() => expect(screen.getByText('2 / 2')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '이전' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    expect(screen.getByText('gold_21')).toBeInTheDocument();
  });

  it('shows an empty state when there are no payments', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: {
        data: {
          payments: [],
          page: 1,
          take: 20,
          itemCount: 0,
          pageCount: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      },
    });

    render(<PaymentHistory />);

    await waitFor(() => expect(screen.getByText('아직 결제 내역이 없습니다.')).toBeInTheDocument());
  });

  it('shows an error message when the request fails', async () => {
    vi.mocked(axios.get).mockRejectedValueOnce(new Error('network down'));

    render(<PaymentHistory />);

    await waitFor(() =>
      expect(
        screen.getByText('결제 내역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'),
      ).toBeInTheDocument(),
    );
  });
});

