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

import { login, register, getGameAccount, sendMail } from './identity';

const mockAxios = axios as unknown as {
  post: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
};

describe('identity API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('login posts uuid and returns auth token response', async () => {
    mockAxios.post.mockResolvedValueOnce({
      data: { data: { token: 'jwt-abc', uuid: 'user-1', nickName: 'Alice' } },
    });
    const result = await login('user-1');
    expect(mockAxios.post).toHaveBeenCalledWith('/auth/login', { uuid: 'user-1' });
    expect(result.token).toBe('jwt-abc');
    expect(result.nickName).toBe('Alice');
  });

  it('register posts optional nickName and returns auth token response', async () => {
    mockAxios.post.mockResolvedValueOnce({
      data: { data: { token: 'jwt-xyz', uuid: 'user-2', nickName: 'Bob' } },
    });
    const result = await register('Bob');
    expect(mockAxios.post).toHaveBeenCalledWith('/auth/register', { nickName: 'Bob' });
    expect(result.uuid).toBe('user-2');
  });

  it('register without nickName passes undefined', async () => {
    mockAxios.post.mockResolvedValueOnce({
      data: { data: { token: 'jwt-anon', uuid: 'user-3', nickName: '' } },
    });
    await register(undefined);
    expect(mockAxios.post).toHaveBeenCalledWith('/auth/register', { nickName: undefined });
  });

  it('getGameAccount fetches account by uuid', async () => {
    mockAxios.get.mockResolvedValueOnce({
      data: { data: { accountId: 77, uuid: 'user-1', nickName: 'Alice' } },
    });
    const result = await getGameAccount('user-1');
    expect(mockAxios.get).toHaveBeenCalledWith('/accounts/user-1');
    expect(result.accountId).toBe(77);
  });

  it('sendMail posts mail payload and returns success', async () => {
    mockAxios.post.mockResolvedValueOnce({
      data: { data: { success: true } },
    });
    const result = await sendMail(77, 'Hello', 'World');
    expect(mockAxios.post).toHaveBeenCalledWith('/mails', { accountId: 77, title: 'Hello', body: 'World' });
    expect(result.success).toBe(true);
  });
});
