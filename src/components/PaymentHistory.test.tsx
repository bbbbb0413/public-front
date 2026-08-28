import { render, screen, waitFor } from '@testing-library/react';
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

  it('fetches and renders the payment list without requiring the user to type an id', async () => {
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
            },
            {
              paymentId: 102,
              accountId: 42,
              amount: 1000,
              currency: 'KRW',
              productId: 'gold_100',
              status: 'FAILED',
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
    expect(screen.getByText('COMPLETED')).toHaveClass('status-success');
    expect(screen.getByText('FAILED')).toHaveClass('status-failed');
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
