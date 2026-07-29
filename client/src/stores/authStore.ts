import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../api/axios';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
}

interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, name: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<string>;
  checkAuth: () => Promise<void>;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: true,

      clearAuth: () => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isLoading: false,
        });
      },

      login: async (email, password) => {
        const { data } = await api.post<AuthResponse>('/api/auth/login', { email, password });
        set({
          user: data.user,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          isAuthenticated: true,
          isLoading: false,
        });
      },

      signup: async (email, name, password) => {
        const { data } = await api.post<AuthResponse>('/api/auth/signup', { email, name, password });
        set({
          user: data.user,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          isAuthenticated: true,
          isLoading: false,
        });
      },

      logout: async () => {
        try {
          await api.post('/api/auth/logout');
        } finally {
          get().clearAuth();
        }
      },

      refreshTokens: async () => {
        const currentRefreshToken = get().refreshToken;
        if (!currentRefreshToken) {
          throw new Error('No refresh token available');
        }
        const { data } = await api.post<{ accessToken: string; refreshToken: string }>('/api/auth/refresh', {
          refreshToken: currentRefreshToken,
        });
        set({ accessToken: data.accessToken, refreshToken: data.refreshToken });
        return data.accessToken;
      },

      checkAuth: async () => {
        const { accessToken } = get();
        if (!accessToken) {
          set({ isLoading: false, isAuthenticated: false });
          return;
        }
        try {
          const { data } = await api.get<{ user: AuthUser }>('/api/auth/me');
          set({ user: data.user, isAuthenticated: true, isLoading: false });
        } catch {
          get().clearAuth();
        }
      },
    }),
    {
      name: 'collab-editor-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
    }
  )
);
