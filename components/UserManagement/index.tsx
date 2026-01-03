'use client';

/**
 * User Management Component
 * 
 * Allows users to edit their profile and admins to manage all users
 */

import { useState, useCallback, useEffect } from 'react';
import { Modal, Form, Input, Button, Table, Tag, message, Popconfirm, Space } from 'antd';
import { UserOutlined, LockOutlined, PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { UserInfo, UserRole } from '@/types';
import styles from './index.module.css';

interface UserManagementProps {
  open: boolean;
  onClose: () => void;
  currentUser: UserInfo | null;
  token: string | null;
  isAdmin: boolean;
  onUpdateProfile: (data: { username?: string; password?: string; currentPassword?: string }) => Promise<{ success: boolean; message?: string }>;
}

interface UserFormValues {
  username: string;
  password: string;
  currentPassword?: string;
}

export const UserManagement = ({
  open,
  onClose,
  currentUser,
  token,
  isAdmin,
  onUpdateProfile,
}: UserManagementProps) => {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserInfo | null>(null);
  const [form] = Form.useForm();
  const [createForm] = Form.useForm();

  // Fetch users list (admin only)
  const fetchUsers = useCallback(async () => {
    if (!isAdmin || !token) return;

    setLoading(true);
    try {
      const response = await fetch('/api/v1/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setUsers(data.users);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, token]);

  // Load users when modal opens
  useEffect(() => {
    if (open && isAdmin) {
      fetchUsers();
    }
  }, [open, isAdmin, fetchUsers]);

  // Handle edit profile (current user)
  const handleEditProfile = useCallback(() => {
    if (!currentUser) return;
    setEditingUser(currentUser);
    form.setFieldsValue({
      username: currentUser.username,
      password: '',
      currentPassword: '',
    });
    setEditModalOpen(true);
  }, [currentUser, form]);

  // Handle save profile
  const handleSaveProfile = useCallback(async (values: UserFormValues) => {
    const updateData: { username?: string; password?: string; currentPassword?: string } = {};
    
    if (values.username && values.username !== editingUser?.username) {
      updateData.username = values.username;
    }
    
    if (values.password) {
      updateData.password = values.password;
      updateData.currentPassword = values.currentPassword;
    }

    if (Object.keys(updateData).length === 0) {
      message.info('没有需要更新的内容');
      setEditModalOpen(false);
      return;
    }

    const result = await onUpdateProfile(updateData);
    if (result.success) {
      message.success('更新成功');
      setEditModalOpen(false);
      form.resetFields();
    } else {
      message.error(result.message || '更新失败');
    }
  }, [editingUser, form, onUpdateProfile]);

  // Handle create user (admin only)
  const handleCreateUser = useCallback(async (values: { username: string; password: string }) => {
    if (!token) return;

    try {
      const response = await fetch('/api/v1/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(values),
      });

      const data = await response.json();
      if (data.success) {
        message.success('用户创建成功');
        setCreateModalOpen(false);
        createForm.resetFields();
        fetchUsers();
      } else {
        message.error(data.message || '创建失败');
      }
    } catch (error) {
      message.error('创建失败，请稍后重试');
    }
  }, [token, createForm, fetchUsers]);

  // Handle delete user (admin only)
  const handleDeleteUser = useCallback(async (userId: string) => {
    if (!token) return;

    try {
      const response = await fetch(`/api/v1/users?id=${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (data.success) {
        message.success('用户删除成功');
        fetchUsers();
      } else {
        message.error(data.message || '删除失败');
      }
    } catch (error) {
      message.error('删除失败，请稍后重试');
    }
  }, [token, fetchUsers]);

  // Table columns for admin view
  const columns = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role: UserRole) => (
        <Tag color={role === 'admin' ? 'gold' : 'blue'}>
          {role === 'admin' ? '管理员' : '普通用户'}
        </Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (timestamp: number) => new Date(timestamp).toLocaleString(),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: UserInfo) => (
        <Space>
          {record.id !== 'admin' && record.id !== currentUser?.id && (
            <Popconfirm
              title="确定要删除此用户吗？"
              onConfirm={() => handleDeleteUser(record.id)}
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button type="text" danger icon={<DeleteOutlined />} size="small">
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Modal
        title="用户管理"
        open={open}
        onCancel={onClose}
        footer={null}
        width={isAdmin ? 700 : 400}
        className={styles.modal}
      >
        {/* Current user profile section */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>我的账号</h3>
          <div className={styles.profileCard}>
            <div className={styles.profileInfo}>
              <div className={styles.avatar}>
                <UserOutlined />
              </div>
              <div className={styles.profileDetails}>
                <div className={styles.username}>{currentUser?.username}</div>
                <Tag color={currentUser?.role === 'admin' ? 'gold' : 'blue'}>
                  {currentUser?.role === 'admin' ? '管理员' : '普通用户'}
                </Tag>
              </div>
            </div>
            <Button icon={<EditOutlined />} onClick={handleEditProfile}>
              编辑
            </Button>
          </div>
        </div>

        {/* Admin: User list section */}
        {isAdmin && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>用户列表</h3>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setCreateModalOpen(true)}
              >
                新增用户
              </Button>
            </div>
            <Table
              dataSource={users}
              columns={columns}
              rowKey="id"
              loading={loading}
              size="small"
              pagination={false}
              className={styles.table}
            />
          </div>
        )}
      </Modal>

      {/* Edit profile modal */}
      <Modal
        title="编辑个人信息"
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          form.resetFields();
        }}
        footer={null}
        width={400}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSaveProfile}
          className={styles.form}
        >
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少3个字符' },
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>

          <Form.Item
            name="password"
            label="新密码"
            rules={[
              { min: 6, message: '密码至少6个字符' },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="留空则不修改密码" />
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.password !== currentValues.password}
          >
            {({ getFieldValue }) =>
              getFieldValue('password') ? (
                <Form.Item
                  name="currentPassword"
                  label="当前密码"
                  rules={[{ required: true, message: '请输入当前密码' }]}
                >
                  <Input.Password prefix={<LockOutlined />} placeholder="请输入当前密码验证" />
                </Form.Item>
              ) : null
            }
          </Form.Item>

          <Form.Item className={styles.formActions}>
            <Space>
              <Button onClick={() => {
                setEditModalOpen(false);
                form.resetFields();
              }}>
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                保存
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Create user modal (admin only) */}
      <Modal
        title="新增用户"
        open={createModalOpen}
        onCancel={() => {
          setCreateModalOpen(false);
          createForm.resetFields();
        }}
        footer={null}
        width={400}
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreateUser}
          className={styles.form}
        >
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少3个字符' },
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>

          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少6个字符' },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>

          <Form.Item className={styles.formActions}>
            <Space>
              <Button onClick={() => {
                setCreateModalOpen(false);
                createForm.resetFields();
              }}>
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                创建
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
