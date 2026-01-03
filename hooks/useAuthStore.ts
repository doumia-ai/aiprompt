'use client';

/**
 * Auth Store - User authentication state management
 */

import { useState, useCallback, useEffect } from 'react';
import { UserInfo, LoginRequest, LoginResponse } from '@/types';

const TOKEN_KEY = 'better-prompt-token';
const USER_KEY = 'better-prompt-user';

// Load auth state from localStorage
const loadAuthState = (): { token: string | null; user: UserInfo | null } => {
  if (typeof window === 'undefined') {
    return { token: null, user: null };
  }

  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const userStr = localStorage.getItem(USER_KEY);
    const user = userStr ? JSON.parse(userStr) : null;
    return { token, user };
  } catch (e) {
    console.error('Failed to load auth state:', e);
    return { token: null, user: null };
  }
};

// Save auth state to localStorage
const saveAuthState = (token: string | null, user: UserInfo | null) => {
  if (typeof window === 'undefined') return;

  try {
    if (token && user) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  } catch (e) {
    console.error('Failed to save auth state:', e);
  }
};

// Auth store interface
interface AuthStore {
  user: UserInfo | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;

  // Actions
  login: (credentials: LoginRequest) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
  updateProfile: (data: { username?: string; password?: string; currentPassword?: string }) => Promise<{ success: boolean; message?: string }>;
}

export const useAuthStore = (): AuthStore => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load auth state on mount
  useEffect(() => {
    const { token: savedToken, user: savedUser } = loadAuthState();
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(savedUser);
    }
    setIsLoading(false);
  }, []);

  // Check if user is authenticated
  const isAuthenticated = Boolean(token && user);
  const isAdmin = user?.role === 'admin';

  // Login
  const login = useCallback(async (credentials: LoginRequest): Promise<{ success: boolean; message?: string }> => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/v1/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });

      const data: LoginResponse = await response.json();

      if (data.success && data.token && data.user) {
        setToken(data.token);
        setUser(data.user);
        saveAuthState(data.token, data.user);
        return { success: true };
      }

      return { success: false, message: data.message || '登录失败' };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, message: '网络错误，请稍后重试' };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Logout
  const logout = useCallback(async () => {
    try {
      if (token) {
        await fetch('/api/v1/auth', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setToken(null);
      setUser(null);
      saveAuthState(null, null);
    }
  }, [token]);

  // Check auth status
  const checkAuth = useCallback(async (): Promise<boolean> => {
    const { token: savedToken } = loadAuthState();
    
    if (!savedToken) {
      setToken(null);
      setUser(null);
      return false;
    }

    try {
      const response = await fetch('/api/v1/auth', {
        headers: { Authorization: `Bearer ${savedToken}` },
      });

      const data: LoginResponse = await response.json();

      if (data.success && data.user) {
        setToken(savedToken);
        setUser(data.user);
        saveAuthState(savedToken, data.user);
        return true;
      }

      // Token invalid, clear auth state
      setToken(null);
      setUser(null);
      saveAuthState(null, null);
      return false;
    } catch (error) {
      console.error('Check auth error:', error);
      return false;
    }
  }, []);

  // Update profile
  const updateProfile = useCallback(async (data: { username?: string; password?: string; currentPassword?: string }): Promise<{ success: boolean; message?: string }> => {
    if (!token) {
      return { success: false, message: '未登录' };
    }

    try {
      const response = await fetch('/api/v1/auth', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success && result.user) {
        setUser(result.user);
        saveAuthState(token, result.user);
        return { success: true, message: '更新成功' };
      }

      return { success: false, message: result.message || '更新失败' };
    } catch (error) {
      console.error('Update profile error:', error);
      return { success: false, message: '网络错误，请稍后重试' };
    }
  }, [token]);

  return {
    user,
    token,
    isLoading,
    isAuthenticated,
    isAdmin,
    login,
    logout,
    checkAuth,
    updateProfile,
  };
};
