import api from './api';

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
    organizationId: string;
    organization?: {
      id: string;
      name: string;
      slug: string;
    };
  };
  token: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
  organizationName: string;
}

export const authService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await api.post<LoginResponse>('/api/auth/login', {
      email,
      password,
    });
    return response.data;
  },

  async register(data: RegisterData): Promise<LoginResponse> {
    const response = await api.post<LoginResponse>('/api/auth/register', data);
    return response.data;
  },

  async getCurrentUser() {
    const response = await api.get<{ user: LoginResponse['user'] }>('/api/auth/me');
    return response.data;
  },

  async refreshToken() {
    const response = await api.post<{ token: string }>('/api/auth/refresh');
    return response.data;
  },
};






