'use client';

/**
 * Login Page Component
 */

import { useState, useCallback } from 'react';
import { Form, Input, Button, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import styles from './login.module.css';

interface LoginPageProps {
  onLoginSuccess: () => void;
  login: (credentials: { username: string; password: string }) => Promise<{ success: boolean; message?: string }>;
}

export const LoginPage = ({ onLoginSuccess, login }: LoginPageProps) => {
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const result = await login(values);
      if (result.success) {
        message.success('登录成功');
        onLoginSuccess();
      } else {
        message.error(result.message || '登录失败');
      }
    } catch (error) {
      message.error('登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [login, onLoginSuccess]);

  return (
    <div className={styles.container}>
      <div className={styles.loginBox}>
        <div className={styles.header}>
          <div className={styles.logoIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="32" height="32">
              <polyline points="13 17 18 12 13 7" />
              <polyline points="6 17 11 12 6 7" />
            </svg>
          </div>
          <h1 className={styles.title}>
            <span className={styles.better}>better</span>
            <span className={styles.prompt}>prompt</span>
          </h1>
          <p className={styles.subtitle}>AI 提示词优化工具</p>
        </div>

        <Form
          name="login"
          onFinish={handleSubmit}
          autoComplete="off"
          size="large"
          className={styles.form}
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="用户名"
              autoComplete="username"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
              autoComplete="current-password"
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              className={styles.submitBtn}
            >
              登录
            </Button>
          </Form.Item>
        </Form>

        <div className={styles.footer}>
          <p>默认管理员账号: admin / admin123</p>
        </div>
      </div>
    </div>
  );
};
