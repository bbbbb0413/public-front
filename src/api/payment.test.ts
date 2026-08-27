import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

vi.mock('axios', () => ({
  default: {
    create: vi.fn().mockReturnThis(),
    interceptors: {
      request: { use: vi.fn(), eject: vi.fn() },
      response: { use: vi.fn(), eject: vi.fn() },
    },
    post: vi.fn(),
    get: vi.fn(),
  },
}));

import { createPayment, getPayment } from './payment';

const mockAxios = axios as unknown as {
  post: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
};

describe('payment API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createPayment posts correct payload and returns PaymentReply', async () => {
    mockAxios.post.mockResolvedValueOnce({
      data: {
        data: {
          paymentId: 101,
          accountId: 42,
          amount: 5000,
          currency: 'KRW',
          productId: 'gold_500',
          status: 'SUCCESS',
        },
      },
    });
    const result = await createPayment(5000, 'KRW', 'gold_500');
    expect(mockAxios.post).toHaveBeenCalledWith('/payments', {
      amount: 5000,
      currency: 'KRW',
      productId: 'gold_500',
      idempotencyKey: expect.any(String),
    });
    expect(result.paymentId).toBe(101);
    expect(result.status).toBe('SUCCESS');
  });

  it('getPayment fetches payment by id', async () => {
    mockAxios.get.mockResolvedValueOnce({
      data: {
        data: {
          paymentId: 101,
          accountId: 42,
          amount: 5000,
          currency: 'KRW',
          productId: 'gold_500',
          status: 'SUCCESS',
        },
      },
    });
    const result = await getPayment(101);
    expect(mockAxios.get).toHaveBeenCalledWith('/payments/101');
    expect(result.paymentId).toBe(101);
    expect(result.productId).toBe('gold_500');
  });
});
