import client from './client';

export interface PaymentReply {
  paymentId: number;
  accountId: number;
  amount: number;
  currency: string;
  productId: string;
  status: string;
}

const createIdempotencyKey = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const createPayment = async (
  amount: number,
  currency: string,
  productId: string
): Promise<PaymentReply> => {
  const idempotencyKey = createIdempotencyKey();
  const response = await client.post('/payments', { amount, currency, productId, idempotencyKey });
  return response.data?.data;
};

export const getPayment = async (paymentId: number): Promise<PaymentReply> => {
  const response = await client.get(`/payments/${paymentId}`);
  return response.data?.data;
};
