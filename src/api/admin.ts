import axios from 'axios';

const identityClient = axios.create({
  baseURL: import.meta.env.VITE_IDENTITY_API_BASE_URL || 'http://localhost:3001',
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

export const adminSignup = async (email: string, password: string): Promise<AdminUser> => {
  const res = await identityClient.post('/auth/signup', { email, password });
  return res.data?.data;
};

export const adminLogin = async (
  email: string,
  password: string,
): Promise<{ token: string; user: AdminUser }> => {
  const res = await identityClient.post('/auth/login', { email, password });
  return res.data?.data;
};

export const getUsers = async (
  page = 1,
  take = 10,
): Promise<{ data: AdminUser[]; meta: PageMeta }> => {
  const res = await identityClient.get('/user', { params: { page, take } });
  return { data: res.data?.data ?? [], meta: res.data?.meta };
};

export const getUserById = async (id: number): Promise<AdminUser> => {
  const res = await identityClient.get(`/user/${id}`);
  return res.data?.data;
};

export const activateUser = async (userId: number, activate: boolean): Promise<AdminUser> => {
  const res = await identityClient.put('/user/activate', { userId, activate });
  return res.data?.data;
};

export const updateUserRole = async (userId: number, role: string): Promise<AdminUser> => {
  const res = await identityClient.put('/user/role', { userId, role });
  return res.data?.data;
};

export const changePassword = async (email: string, password: string): Promise<void> => {
  await identityClient.post('/user/change/password', { email, password });
};

export const deleteUser = async (id: number): Promise<void> => {
  await identityClient.delete(`/user/${id}`);
};

export interface GroqMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export const groqChat = async (messages: GroqMessage[]): Promise<{ content: string }> => {
  const res = await identityClient.post('/chat/completion', { messages });
  return res.data?.data ?? res.data;
};

export const groqEmbedding = async (text: string): Promise<{ embedding: number[] }> => {
  const res = await identityClient.post('/chat/embedding', { text });
  return res.data?.data ?? res.data;
};

export const queueAdd = async (type: string, payload: Record<string, unknown>): Promise<{ jobId: string }> => {
  const res = await identityClient.post('/queue/add', { type, payload });
  return res.data?.data ?? res.data;
};
