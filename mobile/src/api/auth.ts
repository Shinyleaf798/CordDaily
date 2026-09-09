import { apiClient } from './client';
import { AuthUser } from '@/store/auth.store';

type AuthResponse = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
};

// 后端统一响应格式是 { success, data, error }，这里直接把 data 摘出来给调用方用
export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await apiClient.post('/auth/login', { email, password });
  return res.data.data;
}

export async function register(email: string, password: string, name?: string): Promise<AuthResponse> {
  const res = await apiClient.post('/auth/register', { email, password, name });
  return res.data.data;
}
