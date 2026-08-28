import axios from 'axios';
import { GATEWAY_BASE_URL } from '../utils/gateway-url';

// admin API는 gateway를 거쳐 admin-server(gRPC)로 프록시된다.
const identityClient = axios.create({
  baseURL: GATEWAY_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

identityClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

identityClient.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_info');
    }
    return Promise.reject(error);
  },
);

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: string;
  activatedAt: string | null;
}

export interface PageMeta {
  page: number;
  take: number;
  itemCount: number;
  pageCount: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export const adminSignup = async (
  name: string,
  email: string,
  password: string,
): Promise<AdminUser> => {
  const res = await identityClient.post('/admin/auth/signup', { name, email, password });
  return res.data?.data;
};

export const adminLogin = async (
  email: string,
  password: string,
): Promise<{ token: string; user: AdminUser }> => {
  const res = await identityClient.post('/admin/auth/login', { email, password });
  return res.data?.data;
};

export const getUsers = async (
  page = 1,
  take = 10,
): Promise<{ data: AdminUser[]; meta: PageMeta }> => {
  const res = await identityClient.get('/admin/user', { params: { page, take } });
  return { data: res.data?.data ?? [], meta: res.data?.meta };
};

export const getUserById = async (id: number): Promise<AdminUser> => {
  const res = await identityClient.get(`/admin/user/${id}`);
  return res.data?.data;
};

export const activateUser = async (userId: number, activate: boolean): Promise<AdminUser> => {
  const res = await identityClient.put('/admin/user/activate', { userId, activate });
  return res.data?.data;
};

export const updateUserRole = async (userId: number, role: string): Promise<AdminUser> => {
  const res = await identityClient.put('/admin/user/role', { userId, role });
  return res.data?.data;
};

export const changePassword = async (email: string, password: string): Promise<void> => {
  await identityClient.post('/admin/user/change/password', { email, password });
};

export const deleteUser = async (id: number): Promise<void> => {
  await identityClient.delete(`/admin/user/${id}`);
};

