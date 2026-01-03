/**
 * User Authentication API Route
 *
 * Handles user login, logout, and session management
 * Uses localStorage-based user storage for simplicity
 */

import { NextRequest, NextResponse } from 'next/server';
import { User, UserInfo, LoginResponse } from '@/types';

// Simple hash function for passwords (in production, use bcrypt)
function hashPassword(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'hash_' + Math.abs(hash).toString(16);
}

// Verify password
function verifyPassword(password: string, hashedPassword: string): boolean {
  return hashPassword(password) === hashedPassword;
}

// Generate simple token
function generateToken(userId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2);
  // Use btoa for base64 encoding (works in both browser and Node.js 16+)
  return btoa(`${userId}:${timestamp}:${random}`);
}

// Parse token to get user ID
function parseToken(token: string): string | null {
  try {
    const decoded = atob(token);
    const [userId] = decoded.split(':');
    return userId || null;
  } catch {
    return null;
  }
}

// In-memory user storage (in production, use a database)
// This will be initialized with default admin user
const USERS_STORAGE_KEY = 'better-prompt-users';
const SESSIONS_STORAGE_KEY = 'better-prompt-sessions';

// Default admin user
const DEFAULT_ADMIN: User = {
  id: 'admin',
  username: 'admin',
  password: hashPassword('admin123'),
  role: 'admin',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

// Server-side user storage (simulated with global variable for serverless)
declare global {
  // eslint-disable-next-line no-var
  var __users: User[] | undefined;
  // eslint-disable-next-line no-var
  var __sessions: Map<string, string> | undefined;
}

function getUsers(): User[] {
  if (!globalThis.__users) {
    globalThis.__users = [DEFAULT_ADMIN];
  }
  return globalThis.__users;
}

function setUsers(users: User[]): void {
  globalThis.__users = users;
}

function getSessions(): Map<string, string> {
  if (!globalThis.__sessions) {
    globalThis.__sessions = new Map();
  }
  return globalThis.__sessions;
}

// Convert User to UserInfo (remove password)
function toUserInfo(user: User): UserInfo {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// POST /api/v1/auth - Login
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json<LoginResponse>(
        { success: false, message: '用户名和密码不能为空' },
        { status: 400 }
      );
    }

    const users = getUsers();
    const user = users.find((u) => u.username === username);

    if (!user) {
      return NextResponse.json<LoginResponse>(
        { success: false, message: '用户名或密码错误' },
        { status: 401 }
      );
    }

    if (!verifyPassword(password, user.password)) {
      return NextResponse.json<LoginResponse>(
        { success: false, message: '用户名或密码错误' },
        { status: 401 }
      );
    }

    // Generate token and store session
    const token = generateToken(user.id);
    const sessions = getSessions();
    sessions.set(token, user.id);

    return NextResponse.json<LoginResponse>({
      success: true,
      user: toUserInfo(user),
      token,
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    return NextResponse.json<LoginResponse>(
      { success: false, message: '登录失败，请稍后重试' },
      { status: 500 }
    );
  }
}

// GET /api/v1/auth - Get current user info
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return NextResponse.json<LoginResponse>(
        { success: false, message: '未登录' },
        { status: 401 }
      );
    }

    const sessions = getSessions();
    const userId = sessions.get(token);

    if (!userId) {
      return NextResponse.json<LoginResponse>(
        { success: false, message: '会话已过期，请重新登录' },
        { status: 401 }
      );
    }

    const users = getUsers();
    const user = users.find((u) => u.id === userId);

    if (!user) {
      return NextResponse.json<LoginResponse>(
        { success: false, message: '用户不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json<LoginResponse>({
      success: true,
      user: toUserInfo(user),
      token,
    });
  } catch (error) {
    console.error('[Auth] Get user error:', error);
    return NextResponse.json<LoginResponse>(
      { success: false, message: '获取用户信息失败' },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/auth - Logout
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (token) {
      const sessions = getSessions();
      sessions.delete(token);
    }

    return NextResponse.json({ success: true, message: '已退出登录' });
  } catch (error) {
    console.error('[Auth] Logout error:', error);
    return NextResponse.json(
      { success: false, message: '退出登录失败' },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/auth - Update current user (username/password)
export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return NextResponse.json(
        { success: false, message: '未登录' },
        { status: 401 }
      );
    }

    const sessions = getSessions();
    const userId = sessions.get(token);

    if (!userId) {
      return NextResponse.json(
        { success: false, message: '会话已过期，请重新登录' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { username, password, currentPassword } = body;

    const users = getUsers();
    const userIndex = users.findIndex((u) => u.id === userId);

    if (userIndex === -1) {
      return NextResponse.json(
        { success: false, message: '用户不存在' },
        { status: 404 }
      );
    }

    const user = users[userIndex];

    // If changing password, verify current password
    if (password) {
      if (!currentPassword) {
        return NextResponse.json(
          { success: false, message: '请输入当前密码' },
          { status: 400 }
        );
      }
      if (!verifyPassword(currentPassword, user.password)) {
        return NextResponse.json(
          { success: false, message: '当前密码错误' },
          { status: 400 }
        );
      }
    }

    // Check username uniqueness
    if (username && username !== user.username) {
      const existingUser = users.find((u) => u.username === username && u.id !== userId);
      if (existingUser) {
        return NextResponse.json(
          { success: false, message: '用户名已存在' },
          { status: 400 }
        );
      }
    }

    // Update user
    const updatedUser: User = {
      ...user,
      username: username || user.username,
      password: password ? hashPassword(password) : user.password,
      updatedAt: Date.now(),
    };

    users[userIndex] = updatedUser;
    setUsers(users);

    return NextResponse.json({
      success: true,
      message: '更新成功',
      user: toUserInfo(updatedUser),
    });
  } catch (error) {
    console.error('[Auth] Update user error:', error);
    return NextResponse.json(
      { success: false, message: '更新失败，请稍后重试' },
      { status: 500 }
    );
  }
}

// Export helper functions for other routes
export { getUsers, setUsers, getSessions, hashPassword, verifyPassword, toUserInfo };
