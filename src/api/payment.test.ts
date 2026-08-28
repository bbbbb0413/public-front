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

import { classifyPaymentError, createPayment, getPayment } from './payment';

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
          status: 'COMPLETED',
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
    expect(result.status).toBe('COMPLETED');
  });

  it('createPayment reuses a caller-supplied idempotencyKey instead of generating a new one', async () => {
    mockAxios.post.mockResolvedValueOnce({
      data: {
        data: {
          paymentId: 101,
          accountId: 42,
          amount: 5000,
          currency: 'KRW',
          productId: 'gold_500',
          status: 'COMPLETED',
        },
      },
    });
    await createPayment(5000, 'KRW', 'gold_500', 'fixed-retry-key');
    expect(mockAxios.post).toHaveBeenCalledWith('/payments', {
      amount: 5000,
      currency: 'KRW',
      productId: 'gold_500',
      idempotencyKey: 'fixed-retry-key',
    });
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
          status: 'COMPLETED',
        },
      },
    });
    const result = await getPayment(101);
    expect(mockAxios.get).toHaveBeenCalledWith('/payments/101');
    expect(result.paymentId).toBe(101);
    expect(result.productId).toBe('gold_500');
  });
});

describe('classifyPaymentError', () => {
  it('classifies HTTP 409 as conflict', () => {
    expect(classifyPaymentError({ response: { status: 409 } })).toBe('conflict');
  });

  it('classifies other 4xx as validation', () => {
    expect(classifyPaymentError({ response: { status: 400 } })).toBe('validation');
  });

  it('classifies 5xx and network errors (no response) as server', () => {
    expect(classifyPaymentError({ response: { status: 500 } })).toBe('server');
    expect(classifyPaymentError(new Error('network down'))).toBe('server');
  });
});
