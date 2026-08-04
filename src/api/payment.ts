import client from './client';

export interface PaymentReply {
  paymentId: number;
  accountId: number;
  amount: number;
  currency: string;
  productId: string;
  status: string;
}

export const createPayment = async (
  amount: number,
  currency: string,
  productId: string
): Promise<PaymentReply> => {
  const response = await client.post('/payments', { amount, currency, productId });
  return response.data?.data;
};

export const getPayment = async (paymentId: number): Promise<PaymentReply> => {
  const response = await client.get(`/payments/${paymentId}`);
  return response.data?.data;
};
