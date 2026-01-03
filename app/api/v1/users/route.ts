/**
 * User Management API Route
 * 
 * Admin-only endpoints for managing users
 */

import { NextRequest, NextResponse } from 'next/server';
import { User, UserInfo, CreateUserRequest } from '@/types';

// Simple hash function for passwords
function hashPassword(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'hash_' + Math.abs(hash).toString(16);
}

// Default admin user
const DEFAULT_ADMIN: User = {
  id: 'admin',
  username: 'admin',
  password: hashPassword('admin123'),
  role: 'admin',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

// Server-side user storage
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

// Generate unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Verify admin access
function verifyAdmin(request: NextRequest): { userId: string; isAdmin: boolean } | null {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) return null;

  const sessions = getSessions();
  const userId = sessions.get(token);
  if (!userId) return null;

  const users = getUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) return null;

  return { userId, isAdmin: user.role === 'admin' };
}

// GET /api/v1/users - List all users (admin only)
export async function GET(request: NextRequest) {
  try {
    const auth = verifyAdmin(request);
    
    if (!auth) {
      return NextResponse.json(
        { success: false, message: '未登录' },
        { status: 401 }
      );
    }

    if (!auth.isAdmin) {
      return NextResponse.json(
        { success: false, message: '无权限访问' },
        { status: 403 }
      );
    }

    const users = getUsers();
    return NextResponse.json({
      success: true,
      users: users.map(toUserInfo),
    });
  } catch (error) {
    console.error('[Users] List error:', error);
    return NextResponse.json(
      { success: false, message: '获取用户列表失败' },
      { status: 500 }
    );
  }
}

// POST /api/v1/users - Create new user (admin only)
export async function POST(request: NextRequest) {
  try {
    const auth = verifyAdmin(request);
    
    if (!auth) {
      return NextResponse.json(
        { success: false, message: '未登录' },
        { status: 401 }
      );
    }

    if (!auth.isAdmin) {
      return NextResponse.json(
        { success: false, message: '无权限创建用户' },
        { status: 403 }
      );
    }

    const body: CreateUserRequest = await request.json();
    const { username, password, role = 'user' } = body;

    if (!username || !password) {
      return NextResponse.json(
        { success: false, message: '用户名和密码不能为空' },
        { status: 400 }
      );
    }

    if (username.length < 3) {
      return NextResponse.json(
        { success: false, message: '用户名至少3个字符' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { success: false, message: '密码至少6个字符' },
        { status: 400 }
      );
    }

    const users = getUsers();
    
    // Check username uniqueness
    if (users.some((u) => u.username === username)) {
      return NextResponse.json(
        { success: false, message: '用户名已存在' },
        { status: 400 }
      );
    }

    const newUser: User = {
      id: generateId(),
      username,
      password: hashPassword(password),
      role,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    users.push(newUser);
    setUsers(users);

    return NextResponse.json({
      success: true,
      message: '用户创建成功',
      user: toUserInfo(newUser),
    });
  } catch (error) {
    console.error('[Users] Create error:', error);
    return NextResponse.json(
      { success: false, message: '创建用户失败' },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/users - Delete user (admin only)
export async function DELETE(request: NextRequest) {
  try {
    const auth = verifyAdmin(request);
    
    if (!auth) {
      return NextResponse.json(
        { success: false, message: '未登录' },
        { status: 401 }
      );
    }

    if (!auth.isAdmin) {
      return NextResponse.json(
        { success: false, message: '无权限删除用户' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');

    if (!userId) {
      return NextResponse.json(
        { success: false, message: '请指定要删除的用户ID' },
        { status: 400 }
      );
    }

    // Cannot delete self
    if (userId === auth.userId) {
      return NextResponse.json(
        { success: false, message: '不能删除自己的账号' },
        { status: 400 }
      );
    }

    // Cannot delete default admin
    if (userId === 'admin') {
      return NextResponse.json(
        { success: false, message: '不能删除默认管理员账号' },
        { status: 400 }
      );
    }

    const users = getUsers();
    const userIndex = users.findIndex((u) => u.id === userId);

    if (userIndex === -1) {
      return NextResponse.json(
        { success: false, message: '用户不存在' },
        { status: 404 }
      );
    }

    users.splice(userIndex, 1);
    setUsers(users);

    return NextResponse.json({
      success: true,
      message: '用户删除成功',
    });
  } catch (error) {
    console.error('[Users] Delete error:', error);
    return NextResponse.json(
      { success: false, message: '删除用户失败' },
      { status: 500 }
    );
  }
}
