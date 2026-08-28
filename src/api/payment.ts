import client from './client';

export interface PaymentReply {
  paymentId: number;
  accountId: number;
  amount: number;
  currency: string;
  productId: string;
  status: string;
}

export interface PaymentListReply {
  payments: PaymentReply[];
  page: number;
  take: number;
  itemCount: number;
  pageCount: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export type PaymentErrorKind = 'validation' | 'conflict' | 'server';

interface HttpErrorLike {
  response?: { status?: number };
}

const isHttpErrorLike = (error: unknown): error is HttpErrorLike =>
  typeof error === 'object' && error !== null && 'response' in error;

export const classifyPaymentError = (error: unknown): PaymentErrorKind => {
  if (isHttpErrorLike(error)) {
    const status = error.response?.status;
    if (status === 409) return 'conflict';
    if (status !== undefined && status >= 400 && status < 500) return 'validation';
  }
  return 'server';
};

export const createIdempotencyKey = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const createPayment = async (
  amount: number,
  currency: string,
  productId: string,
  idempotencyKey: string = createIdempotencyKey()
): Promise<PaymentReply> => {
  const response = await client.post('/payments', { amount, currency, productId, idempotencyKey });
  return response.data?.data;
};

export const getPayment = async (paymentId: number): Promise<PaymentReply> => {
  const response = await client.get(`/payments/${paymentId}`);
  return response.data?.data;
};

export const listPayments = async (page = 1, take = 20): Promise<PaymentListReply> => {
  const response = await client.get('/payments', { params: { page, take } });
  return response.data?.data;
};
