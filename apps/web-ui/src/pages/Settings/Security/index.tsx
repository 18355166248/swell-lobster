import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Radio,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { CopyOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../../api/base';
import { clearTokenCache, setStoredToken } from '../../../api/authToken';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ROUTES } from '../../../routes';

const { Title, Text, Paragraph } = Typography;

type RemoteToken = {
  id: number;
  label: string;
  scope: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
};

type CreatedToken = RemoteToken & { token: string };

type MasterKeyStatus = 'present' | 'missing';

type SmtpConfigView = {
  host: string;
  port: number;
  user: string;
  from: string;
  secure: boolean;
  passwordConfigured: boolean;
};

type SmtpFormValues = {
  host: string;
  port: number;
  user: string;
  password?: string;
  from: string;
  secure: boolean;
};

type HealthView = {
  listen_host?: string;
  remote_mode_desired?: boolean;
  remote_mode_active?: boolean;
};

type SandboxConfig = {
  mode: 'open' | 'allowlist';
  allowlist: string[];
};

function formatTime(ms: number | null | undefined): string {
  if (!ms) return '—';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export default function SecuritySettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [masterKeyStatus, setMasterKeyStatus] = useState<MasterKeyStatus | null>(null);
  const [tokens, setTokens] = useState<RemoteToken[]>([]);
  const [remoteEnabled, setRemoteEnabled] = useState<boolean>(false);
  const [health, setHealth] = useState<HealthView | null>(null);
  const [smtpConfig, setSmtpConfig] = useState<SmtpConfigView | null>(null);
  const [sandboxConfig, setSandboxConfig] = useState<SandboxConfig>({
    mode: 'open',
    allowlist: [],
  });
  const [sandboxSaving, setSandboxSaving] = useState<boolean>(false);
  const [newRule, setNewRule] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [smtpSaving, setSmtpSaving] = useState<boolean>(false);
  const [createForm] = Form.useForm<{ label: string }>();
  const [smtpForm] = Form.useForm<SmtpFormValues>();
  const [creating, setCreating] = useState<boolean>(false);
  const [createdSecret, setCreatedSecret] = useState<CreatedToken | null>(null);
  const [enableConfirmOpen, setEnableConfirmOpen] = useState<boolean>(false);
  const [disableRevokeAllOpen, setDisableRevokeAllOpen] = useState<boolean>(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, tokensRes, remoteRes, smtpRes, healthRes, sandboxRes] = await Promise.all([
        apiGet<{ status: MasterKeyStatus }>('/api/auth/master-key/status'),
        apiGet<{ tokens: RemoteToken[] }>('/api/auth/tokens'),
        apiGet<{ enabled: boolean }>('/api/auth/remote-mode'),
        apiGet<{ config: SmtpConfigView | null }>('/api/config/email-smtp'),
        apiGet<HealthView>('/api/health'),
        apiGet<SandboxConfig>('/api/config/sandbox'),
      ]);
      setMasterKeyStatus(statusRes.status);
      setTokens(tokensRes.tokens);
      setRemoteEnabled(remoteRes.enabled);
      setSmtpConfig(smtpRes.config);
      setHealth(healthRes);
      setSandboxConfig(sandboxRes);
    } catch (e) {
      message.error(t('security.errors.load', { message: (e as Error).message }));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!smtpConfig) {
      smtpForm.resetFields();
      smtpForm.setFieldsValue({ port: 465, secure: true });
      return;
    }
    smtpForm.setFieldsValue({
      host: smtpConfig.host,
      port: smtpConfig.port,
      user: smtpConfig.user,
      from: smtpConfig.from,
      secure: smtpConfig.secure,
      password: '',
    });
  }, [smtpConfig, smtpForm]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onCreateToken = async () => {
    const values = await createForm.validateFields();
    setCreating(true);
    try {
      const created = await apiPost<CreatedToken>('/api/auth/tokens', { label: values.label });
      setCreatedSecret(created);
      createForm.resetFields();
      await refresh();
    } catch (e) {
      message.error(t('security.errors.createToken', { message: (e as Error).message }));
    } finally {
      setCreating(false);
    }
  };

  const onRevokeToken = useCallback(
    async (id: number) => {
      try {
        await apiDelete(`/api/auth/tokens/${id}`);
        message.success(t('security.messages.revoked'));
        await refresh();
      } catch (e) {
        message.error(t('security.errors.revokeToken', { message: (e as Error).message }));
      }
    },
    [refresh, t]
  );

  const onResetLocalToken = async () => {
    try {
      const res = await apiPost<{ token: string }>('/api/auth/local-token/reset', {});
      // 写入本地缓存，下次请求自动用新 token
      setStoredToken(res.token);
      message.success(t('security.messages.localTokenReset'));
    } catch (e) {
      message.error(t('security.errors.resetLocalToken', { message: (e as Error).message }));
    }
  };

  const onConfirmEnableRemote = async () => {
    setEnableConfirmOpen(false);
    try {
      await apiPost('/api/auth/remote-mode', { enabled: true });
      setRemoteEnabled(true);
      message.success(t('security.messages.remoteEnabled'));
      await refresh();
    } catch (e) {
      message.error(t('security.errors.enableRemote', { message: (e as Error).message }));
    }
  };

  const onDisableRemote = async (revokeAll: boolean) => {
    setDisableRevokeAllOpen(false);
    try {
      const res = await apiPost<{ enabled: boolean; revokedTokens: number }>(
        '/api/auth/remote-mode',
        {
          enabled: false,
          revokeAllTokens: revokeAll,
        }
      );
      setRemoteEnabled(res.enabled);
      if (res.revokedTokens > 0) {
        message.success(t('security.messages.remoteDisabledRevoked', { count: res.revokedTokens }));
      } else {
        message.success(t('security.messages.remoteDisabled'));
      }
      await refresh();
    } catch (e) {
      message.error(t('security.errors.disableRemote', { message: (e as Error).message }));
    }
  };

  const remoteRestartRequired =
    health !== null &&
    typeof health.remote_mode_desired === 'boolean' &&
    typeof health.remote_mode_active === 'boolean' &&
    health.remote_mode_desired !== health.remote_mode_active;

  const onCopyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      message.success(t('security.messages.copied'));
    } catch {
      message.warning(t('security.messages.copyUnavailable'));
    }
  };

  const onSaveSmtpConfig = async () => {
    const values = await smtpForm.validateFields();
    setSmtpSaving(true);
    try {
      const response = await apiPost<{ config: SmtpConfigView | null }>(
        '/api/config/email-smtp',
        values
      );
      setSmtpConfig(response.config);
      smtpForm.setFieldValue('password', '');
      message.success(t('security.messages.smtpSaved'));
    } catch (e) {
      message.error(t('security.errors.saveSmtp', { message: (e as Error).message }));
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleSandboxModeChange = async (mode: 'open' | 'allowlist') => {
    setSandboxSaving(true);
    try {
      const res = await apiPatch<SandboxConfig>('/api/config/sandbox', { mode });
      setSandboxConfig(res);
      message.success(t('security.messages.sandboxModeSaved'));
    } catch (e) {
      message.error(t('security.errors.saveSandbox', { message: (e as Error).message }));
    } finally {
      setSandboxSaving(false);
    }
  };

  const handleAddSandboxRule = async () => {
    const rule = newRule.trim();
    if (!rule) return;
    setSandboxSaving(true);
    try {
      const res = await apiPost<SandboxConfig>('/api/config/sandbox/allowlist', { rule });
      setSandboxConfig(res);
      setNewRule('');
      message.success(t('security.messages.sandboxRuleAdded'));
    } catch (e) {
      message.error(t('security.errors.saveSandbox', { message: (e as Error).message }));
    } finally {
      setSandboxSaving(false);
    }
  };

  const handleDeleteSandboxRule = async (rule: string) => {
    setSandboxSaving(true);
    try {
      const res = await apiDelete<SandboxConfig>(
        `/api/config/sandbox/allowlist/${encodeURIComponent(rule)}`
      );
      setSandboxConfig(res);
      message.success(t('security.messages.sandboxRuleDeleted'));
    } catch (e) {
      message.error(t('security.errors.saveSandbox', { message: (e as Error).message }));
    } finally {
      setSandboxSaving(false);
    }
  };

  const tokenColumns = useMemo(
    () => [
      { title: t('security.tokenTable.id'), dataIndex: 'id', width: 60 },
      { title: t('security.tokenTable.label'), dataIndex: 'label' },
      {
        title: t('security.tokenTable.scope'),
        dataIndex: 'scope',
        render: (s: string) => <Tag>{s}</Tag>,
      },
      {
        title: t('security.tokenTable.createdAt'),
        dataIndex: 'createdAt',
        render: formatTime,
      },
      {
        title: t('security.tokenTable.lastUsedAt'),
        dataIndex: 'lastUsedAt',
        render: formatTime,
      },
      {
        title: t('common.actions'),
        render: (_: unknown, row: RemoteToken) => (
          <Popconfirm
            title={t('security.tokenTable.revokeConfirm')}
            onConfirm={() => onRevokeToken(row.id)}
          >
            <Button type="link" danger>
              {t('security.actions.revoke')}
            </Button>
          </Popconfirm>
        ),
      },
    ],
    [onRevokeToken, t]
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Title level={3}>{t('security.title')}</Title>
      <Paragraph type="secondary">{t('security.subtitle')}</Paragraph>

      {remoteRestartRequired && (
        <Alert
          className="mb-4"
          type="warning"
          message={t('security.remote.restartRequiredTitle')}
          description={t('security.remote.restartRequiredDescription', {
            host: health?.remote_mode_desired ? '0.0.0.0' : '127.0.0.1',
          })}
          action={
            <Button size="small" onClick={() => navigate(ROUTES.STATUS)}>
              {t('security.remote.goToStatus')}
            </Button>
          }
          showIcon
        />
      )}

      <Card title={t('security.masterKey.title')} className="mb-4">
        <Space>
          <Text>{t('security.masterKey.status')}</Text>
          {masterKeyStatus === 'present' ? (
            <Tag color="green">{t('security.masterKey.present')}</Tag>
          ) : masterKeyStatus === 'missing' ? (
            <Tag color="red">{t('security.masterKey.missing')}</Tag>
          ) : (
            <Tag>—</Tag>
          )}
          <Button icon={<ReloadOutlined />} onClick={() => void refresh()} loading={loading}>
            {t('common.refresh')}
          </Button>
        </Space>
        {masterKeyStatus === 'missing' && (
          <Alert
            className="mt-3"
            type="error"
            message={t('security.masterKey.alertTitle')}
            description={t('security.masterKey.alertDescription')}
          />
        )}
      </Card>

      <Card title={t('security.localToken.title')} className="mb-4">
        <Paragraph type="secondary">{t('security.localToken.description')}</Paragraph>
        <Popconfirm title={t('security.localToken.resetConfirm')} onConfirm={onResetLocalToken}>
          <Button danger>{t('security.localToken.reset')}</Button>
        </Popconfirm>
      </Card>

      <Card
        title={
          <Space>
            <span>{t('security.remote.title')}</span>
            <Switch
              checked={remoteEnabled}
              onChange={(checked) => {
                if (checked) setEnableConfirmOpen(true);
                else setDisableRevokeAllOpen(true);
              }}
            />
          </Space>
        }
        className="mb-4"
      >
        <Paragraph type="secondary">{t('security.remote.description')}</Paragraph>
        {remoteEnabled && (
          <Alert
            type="warning"
            message={t('security.remote.enabledTitle')}
            description={t('security.remote.enabledDescription', {
              host: health?.listen_host ?? '0.0.0.0',
            })}
          />
        )}
      </Card>

      <Card
        title={t('security.smtp.title')}
        className="mb-4"
        extra={
          <Button type="primary" loading={smtpSaving} onClick={() => void onSaveSmtpConfig()}>
            {smtpSaving ? t('common.saving') : t('common.save')}
          </Button>
        }
      >
        <Paragraph type="secondary">{t('security.smtp.description')}</Paragraph>
        <Form form={smtpForm} layout="vertical">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Form.Item
              label={t('security.smtp.host')}
              name="host"
              rules={[{ required: true, message: t('security.smtp.hostRequired') }]}
            >
              <Input placeholder="smtp.example.com" />
            </Form.Item>
            <Form.Item
              label={t('security.smtp.port')}
              name="port"
              rules={[{ required: true, message: t('security.smtp.portRequired') }]}
            >
              <InputNumber className="w-full" min={1} max={65535} />
            </Form.Item>
            <Form.Item
              label={t('security.smtp.user')}
              name="user"
              rules={[{ required: true, message: t('security.smtp.userRequired') }]}
            >
              <Input placeholder="bot@example.com" />
            </Form.Item>
            <Form.Item
              label={t('security.smtp.from')}
              name="from"
              rules={[{ required: true, message: t('security.smtp.fromRequired') }]}
            >
              <Input placeholder="bot@example.com" />
            </Form.Item>
            <Form.Item
              label={t('security.smtp.password')}
              name="password"
              extra={
                smtpConfig?.passwordConfigured
                  ? t('security.smtp.passwordRetainHint')
                  : t('security.smtp.passwordRequiredHint')
              }
            >
              <Input.Password placeholder={t('security.smtp.passwordPlaceholder')} />
            </Form.Item>
            <Form.Item
              label={t('security.smtp.secure')}
              name="secure"
              valuePropName="checked"
              initialValue={true}
            >
              <Switch />
            </Form.Item>
          </div>
          {smtpConfig && (
            <Alert
              className="mt-2"
              type="info"
              message={t('security.smtp.savedTitle')}
              description={t('security.smtp.savedDescription', {
                host: smtpConfig.host,
                from: smtpConfig.from,
              })}
            />
          )}
        </Form>
      </Card>

      <Card
        title={t('security.remoteTokens.title')}
        className="mb-4"
        extra={
          <Button type="primary" onClick={() => createForm.submit()} loading={creating}>
            {t('security.remoteTokens.create')}
          </Button>
        }
      >
        <Form form={createForm} layout="inline" onFinish={onCreateToken} className="mb-3">
          <Form.Item
            label={t('security.remoteTokens.label')}
            name="label"
            rules={[{ required: true, message: t('security.remoteTokens.labelRequired') }]}
          >
            <Input placeholder="mac" maxLength={80} />
          </Form.Item>
        </Form>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={tokens}
          columns={tokenColumns}
          size="small"
          pagination={false}
        />
      </Card>

      <Card title={t('security.sandbox.title')} className="mb-4">
        <p className="text-sm text-gray-500 mb-4">{t('security.sandbox.description')}</p>

        <div className="mb-4">
          <div className="font-medium mb-2">{t('security.sandbox.modeLabel')}</div>
          <Radio.Group
            value={sandboxConfig.mode}
            onChange={(e) => void handleSandboxModeChange(e.target.value as 'open' | 'allowlist')}
            disabled={sandboxSaving}
          >
            <Space direction="vertical">
              <Radio value="open">
                <span className="font-medium">{t('security.sandbox.modeOpen')}</span>
                <span className="text-gray-400 ml-2 text-sm">
                  {t('security.sandbox.modeOpenDesc')}
                </span>
              </Radio>
              <Radio value="allowlist">
                <span className="font-medium">{t('security.sandbox.modeAllowlist')}</span>
                <span className="text-gray-400 ml-2 text-sm">
                  {t('security.sandbox.modeAllowlistDesc')}
                </span>
              </Radio>
            </Space>
          </Radio.Group>
        </div>

        {sandboxConfig.mode === 'allowlist' && (
          <>
            <Divider />
            <div className="mb-3 font-medium">{t('security.sandbox.allowlistTitle')}</div>
            <div className="flex gap-2 mb-3">
              <Input
                value={newRule}
                onChange={(e) => setNewRule(e.target.value)}
                placeholder={t('security.sandbox.addRulePlaceholder')}
                onPressEnter={() => void handleAddSandboxRule()}
                disabled={sandboxSaving}
                className="max-w-sm"
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                loading={sandboxSaving}
                onClick={() => void handleAddSandboxRule()}
              >
                {t('security.sandbox.addRule')}
              </Button>
            </div>
            {sandboxConfig.allowlist.length === 0 ? (
              <p className="text-gray-400 text-sm">{t('security.sandbox.noRules')}</p>
            ) : (
              <Space wrap>
                {sandboxConfig.allowlist.map((rule) => (
                  <Tag
                    key={rule}
                    closable
                    onClose={() => void handleDeleteSandboxRule(rule)}
                    icon={<DeleteOutlined />}
                  >
                    {rule}
                  </Tag>
                ))}
              </Space>
            )}
          </>
        )}

        <Divider />
        <div className="mb-1 font-medium">{t('security.sandbox.envSanitizeTitle')}</div>
        <p className="text-sm text-gray-500 mb-2">{t('security.sandbox.envSanitizeDesc')}</p>
        <Tag color="green">{t('security.sandbox.envSanitizeStatus')}</Tag>

        <Divider />
        <div className="mb-1 font-medium">{t('security.sandbox.managedTools')}</div>
        <Space wrap>
          {['web_search', 'browser_automation', 'email_send'].map((tool) => (
            <Tag key={tool} color="blue">
              {tool}
            </Tag>
          ))}
        </Space>
      </Card>

      <Modal
        open={createdSecret !== null}
        title={t('security.createdToken.title')}
        onCancel={() => {
          setCreatedSecret(null);
          clearTokenCache();
        }}
        footer={[
          <Button
            key="copy"
            type="primary"
            icon={<CopyOutlined />}
            onClick={() => createdSecret && onCopyToken(createdSecret.token)}
          >
            {t('security.createdToken.copy')}
          </Button>,
          <Button
            key="close"
            onClick={() => {
              setCreatedSecret(null);
              clearTokenCache();
            }}
          >
            {t('security.createdToken.saved')}
          </Button>,
        ]}
      >
        <Alert type="warning" message={t('security.createdToken.warning')} className="mb-3" />
        <Paragraph copyable={{ text: createdSecret?.token ?? '' }}>
          <Text code style={{ wordBreak: 'break-all' }}>
            {createdSecret?.token ?? ''}
          </Text>
        </Paragraph>
        <Divider />
        <Space direction="vertical">
          <Text type="secondary">
            {t('security.createdToken.label')}
            {createdSecret?.label}
          </Text>
          <Text type="secondary">
            {t('security.createdToken.scope')}
            {createdSecret?.scope}
          </Text>
        </Space>
      </Modal>

      <Modal
        open={enableConfirmOpen}
        title={t('security.remote.enableConfirmTitle')}
        onOk={onConfirmEnableRemote}
        onCancel={() => setEnableConfirmOpen(false)}
        okText={t('security.remote.enableConfirm')}
        okButtonProps={{ danger: true }}
      >
        <Alert
          type="error"
          message={t('security.remote.riskTitle')}
          description={t('security.remote.riskDescription')}
        />
      </Modal>

      <Modal
        open={disableRevokeAllOpen}
        title={t('security.remote.disableConfirmTitle')}
        onCancel={() => setDisableRevokeAllOpen(false)}
        footer={[
          <Button key="keep" onClick={() => onDisableRemote(false)}>
            {t('security.remote.keepTokens')}
          </Button>,
          <Button key="revoke" type="primary" danger onClick={() => onDisableRemote(true)}>
            {t('security.remote.revokeAll')}
          </Button>,
        ]}
      >
        <Paragraph>{t('security.remote.disableDescription')}</Paragraph>
      </Modal>
    </div>
  );
}
