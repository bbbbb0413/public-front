import client from './client';

export interface AuthTokenResponse {
  token: string;
  uuid: string;
  nickName: string;
}

export interface GameAccountReply {
  accountId: number;
  uuid: string;
  nickName: string;
}

export interface SendMailResponse {
  success: boolean;
}

export const login = async (uuid: string): Promise<AuthTokenResponse> => {
  const response = await client.post('/auth/login', { uuid });
  return response.data?.data;
};

export const register = async (nickName?: string): Promise<AuthTokenResponse> => {
  const response = await client.post('/auth/register', { nickName });
  return response.data?.data;
};

export const getGameAccount = async (uuid: string): Promise<GameAccountReply> => {
  const response = await client.get(`/accounts/${uuid}`);
  return response.data?.data;
};

export const sendMail = async (accountId: number, title: string, body: string): Promise<SendMailResponse> => {
  const response = await client.post('/mails', { accountId, title, body });
  return response.data?.data;
};
