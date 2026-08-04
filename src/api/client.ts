import axios from 'axios';

if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) {
  console.warn('[client] VITE_API_BASE_URL is not set — falling back to localhost:3000');
}

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
  },
});

client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

client.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user_info');
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

export default client;
