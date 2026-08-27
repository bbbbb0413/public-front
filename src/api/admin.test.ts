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
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import {
  adminLogin,
  adminSignup,
  getUsers,
  activateUser,
  updateUserRole,
  deleteUser,
} from './admin';

const mockAxios = axios as unknown as {
  post: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

describe('admin API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adminLogin returns token and user', async () => {
    mockAxios.post.mockResolvedValueOnce({
      data: { data: { token: 'admin-jwt', user: { id: 1, email: 'a@b.com', name: 'Admin', role: 'admin', activatedAt: null } } },
    });
    const result = await adminLogin('a@b.com', 'password');
    expect(mockAxios.post).toHaveBeenCalledWith('/admin/auth/login', { email: 'a@b.com', password: 'password' });
    expect(result.token).toBe('admin-jwt');
    expect(result.user.email).toBe('a@b.com');
  });

  it('adminSignup returns created admin user', async () => {
    mockAxios.post.mockResolvedValueOnce({
      data: { data: { id: 2, email: 'new@b.com', name: 'New', role: 'admin', activatedAt: null } },
    });
    const result = await adminSignup('New', 'new@b.com', 'pass');
    expect(mockAxios.post).toHaveBeenCalledWith('/admin/auth/signup', {
      name: 'New',
      email: 'new@b.com',
      password: 'pass',
    });
    expect(result.id).toBe(2);
  });

  it('getUsers returns paginated users', async () => {
    mockAxios.get.mockResolvedValueOnce({
      data: {
        data: [{ id: 1, email: 'u@b.com', name: 'User', role: 'user', activatedAt: null }],
        meta: { page: 1, take: 10, itemCount: 1, pageCount: 1, hasPreviousPage: false, hasNextPage: false },
      },
    });
    const result = await getUsers(1, 10);
    expect(mockAxios.get).toHaveBeenCalledWith('/admin/user', { params: { page: 1, take: 10 } });
    expect(result.data).toHaveLength(1);
    expect(result.meta.itemCount).toBe(1);
  });

  it('activateUser sends correct payload', async () => {
    mockAxios.put.mockResolvedValueOnce({
      data: { data: { id: 1, email: 'u@b.com', name: 'User', role: 'user', activatedAt: '2026-01-01' } },
    });
    const result = await activateUser(1, true);
    expect(mockAxios.put).toHaveBeenCalledWith('/admin/user/activate', { userId: 1, activate: true });
    expect(result.activatedAt).toBe('2026-01-01');
  });

  it('updateUserRole sends correct role', async () => {
    mockAxios.put.mockResolvedValueOnce({
      data: { data: { id: 1, email: 'u@b.com', name: 'User', role: 'admin', activatedAt: null } },
    });
    const result = await updateUserRole(1, 'admin');
    expect(mockAxios.put).toHaveBeenCalledWith('/admin/user/role', { userId: 1, role: 'admin' });
    expect(result.role).toBe('admin');
  });

  it('deleteUser calls DELETE endpoint', async () => {
    mockAxios.delete.mockResolvedValueOnce({ data: {} });
    await deleteUser(5);
    expect(mockAxios.delete).toHaveBeenCalledWith('/admin/user/5');
  });
});
