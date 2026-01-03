'use client';

/**
 * SettingsDrawer - Unified settings panel
 */

import { Drawer, Tabs, Button } from 'antd';
import { SettingOutlined, CloseOutlined, AppstoreOutlined, UserOutlined, LogoutOutlined } from '@ant-design/icons';
import { ModelOption, UserInfo } from '@/types';
import { ApiSettings } from './ApiSettings';
import { ModelSettings } from './ModelSettings';
import styles from './index.module.css';

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  // API settings
  apiBase: string;
  apiKey: string;
  onApiBaseChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  // Model settings
  models: ModelOption[];
  onModelAdd: (model: Omit<ModelOption, 'id' | 'isBuiltIn'>) => string;
  onModelUpdate: (id: string, updates: Partial<Pick<ModelOption, 'value' | 'label'>>) => void;
  onModelDelete: (id: string) => void;
  // Template management
  onOpenTemplateDrawer: () => void;
  // User management
  onOpenUserManagement: () => void;
  onLogout: () => void;
  currentUser: UserInfo | null;
}

export const SettingsDrawer = ({
  open,
  onClose,
  apiBase,
  apiKey,
  onApiBaseChange,
  onApiKeyChange,
  models,
  onModelAdd,
  onModelUpdate,
  onModelDelete,
  onOpenTemplateDrawer,
  onOpenUserManagement,
  onLogout,
  currentUser,
}: SettingsDrawerProps) => {
  const handleOpenTemplates = () => {
    onClose();
    onOpenTemplateDrawer();
  };

  const handleOpenUserManagement = () => {
    onClose();
    onOpenUserManagement();
  };

  const handleLogout = () => {
    onClose();
    onLogout();
  };

  const tabItems = [
    {
      key: 'api',
      label: 'API 配置',
      children: (
        <ApiSettings
          apiBase={apiBase}
          apiKey={apiKey}
          onApiBaseChange={onApiBaseChange}
          onApiKeyChange={onApiKeyChange}
        />
      ),
    },
    {
      key: 'models',
      label: '模型管理',
      children: (
        <ModelSettings
          models={models}
          onAdd={onModelAdd}
          onUpdate={onModelUpdate}
          onDelete={onModelDelete}
        />
      ),
    },
    {
      key: 'templates',
      label: '模板管理',
      children: (
        <div className={styles.content}>
          <div className={styles.templateEntry}>
            <AppstoreOutlined className={styles.templateEntryIcon} />
            <div className={styles.templateEntryText}>
              <div className={styles.templateEntryTitle}>提示词模板</div>
              <div className={styles.templateEntryDesc}>管理和配置提示词优化模板</div>
            </div>
            <Button type="primary" ghost onClick={handleOpenTemplates}>
              管理模板
            </Button>
          </div>
        </div>
      ),
    },
    {
      key: 'users',
      label: '用户管理',
      children: (
        <div className={styles.content}>
          <div className={styles.templateEntry}>
            <UserOutlined className={styles.templateEntryIcon} />
            <div className={styles.templateEntryText}>
              <div className={styles.templateEntryTitle}>用户管理</div>
              <div className={styles.templateEntryDesc}>
                当前用户: {currentUser?.username || '未登录'}
                {currentUser?.role === 'admin' && ' (管理员)'}
              </div>
            </div>
            <Button type="primary" ghost onClick={handleOpenUserManagement}>
              管理用户
            </Button>
          </div>
          <div className={styles.templateEntry} style={{ marginTop: 16 }}>
            <LogoutOutlined className={styles.templateEntryIcon} />
            <div className={styles.templateEntryText}>
              <div className={styles.templateEntryTitle}>退出登录</div>
              <div className={styles.templateEntryDesc}>退出当前账号</div>
            </div>
            <Button danger ghost onClick={handleLogout}>
              退出
            </Button>
          </div>
        </div>
      ),
    },
  ];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="right"
      title={null}
      closable={false}
      className={styles.drawer}
      styles={{
        wrapper: { width: 480 },
        body: { padding: 0 },
        header: { display: 'none' },
      }}
    >
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <SettingOutlined />
            <span>设置</span>
          </div>
          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={onClose}
            className={styles.closeBtn}
          />
        </div>

        {/* Tabs */}
        <Tabs
          items={tabItems}
          className={styles.tabs}
        />
      </div>
    </Drawer>
  );
};
