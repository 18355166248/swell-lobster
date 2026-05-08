import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Divider,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import { apiDelete, apiGet, apiPost } from '../../../api/base';
import { clearTokenCache, setStoredToken } from '../../../api/authToken';

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

function formatTime(ms: number | null | undefined): string {
  if (!ms) return '—';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export default function SecuritySettingsPage() {
  const [masterKeyStatus, setMasterKeyStatus] = useState<MasterKeyStatus | null>(null);
  const [tokens, setTokens] = useState<RemoteToken[]>([]);
  const [remoteEnabled, setRemoteEnabled] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [createForm] = Form.useForm<{ label: string }>();
  const [creating, setCreating] = useState<boolean>(false);
  const [createdSecret, setCreatedSecret] = useState<CreatedToken | null>(null);
  const [enableConfirmOpen, setEnableConfirmOpen] = useState<boolean>(false);
  const [disableRevokeAllOpen, setDisableRevokeAllOpen] = useState<boolean>(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, tokensRes, remoteRes] = await Promise.all([
        apiGet<{ status: MasterKeyStatus }>('/api/auth/master-key/status'),
        apiGet<{ tokens: RemoteToken[] }>('/api/auth/tokens'),
        apiGet<{ enabled: boolean }>('/api/auth/remote-mode'),
      ]);
      setMasterKeyStatus(statusRes.status);
      setTokens(tokensRes.tokens);
      setRemoteEnabled(remoteRes.enabled);
    } catch (e) {
      message.error(`加载失败：${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

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
      message.error(`创建失败：${(e as Error).message}`);
    } finally {
      setCreating(false);
    }
  };

  const onRevokeToken = async (id: number) => {
    try {
      await apiDelete(`/api/auth/tokens/${id}`);
      message.success('已撤销');
      await refresh();
    } catch (e) {
      message.error(`撤销失败：${(e as Error).message}`);
    }
  };

  const onResetLocalToken = async () => {
    try {
      const res = await apiPost<{ token: string }>('/api/auth/local-token/reset', {});
      // 写入本地缓存，下次请求自动用新 token
      setStoredToken(res.token);
      message.success('本机 token 已重置');
    } catch (e) {
      message.error(`重置失败：${(e as Error).message}`);
    }
  };

  const onConfirmEnableRemote = async () => {
    setEnableConfirmOpen(false);
    try {
      await apiPost('/api/auth/remote-mode', { enabled: true });
      setRemoteEnabled(true);
      message.success('已启用远程访问；请改 listen 为 0.0.0.0:18900 后重启服务');
    } catch (e) {
      message.error(`启用失败：${(e as Error).message}`);
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
        message.success(`已关闭远程访问，撤销了 ${res.revokedTokens} 个 token`);
      } else {
        message.success('已关闭远程访问');
      }
      await refresh();
    } catch (e) {
      message.error(`关闭失败：${(e as Error).message}`);
    }
  };

  const onCopyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      message.success('已复制到剪贴板');
    } catch {
      message.warning('剪贴板不可用，请手动复制');
    }
  };

  const tokenColumns = useMemo(
    () => [
      { title: 'ID', dataIndex: 'id', width: 60 },
      { title: '标签', dataIndex: 'label' },
      {
        title: '权限',
        dataIndex: 'scope',
        render: (s: string) => <Tag>{s}</Tag>,
      },
      {
        title: '创建时间',
        dataIndex: 'createdAt',
        render: formatTime,
      },
      {
        title: '最近使用',
        dataIndex: 'lastUsedAt',
        render: formatTime,
      },
      {
        title: '操作',
        render: (_: unknown, row: RemoteToken) => (
          <Popconfirm
            title="撤销后该 token 立即不可用，确认？"
            onConfirm={() => onRevokeToken(row.id)}
          >
            <Button type="link" danger>
              撤销
            </Button>
          </Popconfirm>
        ),
      },
    ],
    []
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Title level={3}>安全设置</Title>
      <Paragraph type="secondary">
        管理本机访问令牌、远程访问令牌、主密钥状态与远程访问开关。
      </Paragraph>

      <Card title="主密钥" className="mb-4">
        <Space>
          <Text>状态：</Text>
          {masterKeyStatus === 'present' ? (
            <Tag color="green">已就位</Tag>
          ) : masterKeyStatus === 'missing' ? (
            <Tag color="red">缺失</Tag>
          ) : (
            <Tag>—</Tag>
          )}
          <Button icon={<ReloadOutlined />} onClick={() => void refresh()} loading={loading}>
            刷新
          </Button>
        </Space>
        {masterKeyStatus === 'missing' && (
          <Alert
            className="mt-3"
            type="error"
            message="主密钥缺失"
            description="所有受保护字段（IM Token、Webhook Secret 等）将以 null 返回。请检查 data/auth/master.key 是否被删除，或恢复备份。"
          />
        )}
      </Card>

      <Card title="本机 token" className="mb-4">
        <Paragraph type="secondary">
          本机 token 由 sidecar 启动时自动生成（权限 0600），桌面端 UI 会自动注入到所有请求。
          重置后旧 token 立即失效。
        </Paragraph>
        <Popconfirm
          title="重置后所有现有连接都需要重新拿 token，确认？"
          onConfirm={onResetLocalToken}
        >
          <Button danger>重置本机 token</Button>
        </Popconfirm>
      </Card>

      <Card
        title={
          <Space>
            <span>远程访问</span>
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
        <Paragraph type="secondary">
          启用后，任何能访问本机端口的设备都将能调你的 LLM 凭据 / 邮箱 / IM
          通道。建议仅在受信网络下开启。
        </Paragraph>
        {remoteEnabled && (
          <Alert
            type="warning"
            message="远程访问已启用"
            description="请将后端 listen 改为 0.0.0.0:18900 并重启服务，否则远端设备仍无法连接。"
          />
        )}
      </Card>

      <Card
        title="远程访问令牌"
        className="mb-4"
        extra={
          <Button type="primary" onClick={() => createForm.submit()} loading={creating}>
            新建 token
          </Button>
        }
      >
        <Form form={createForm} layout="inline" onFinish={onCreateToken} className="mb-3">
          <Form.Item
            label="标签"
            name="label"
            rules={[{ required: true, message: '请输入标签（如 mac / mobile / hometown）' }]}
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

      <Modal
        open={createdSecret !== null}
        title="新 token 已创建（仅本次显示）"
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
            复制 token
          </Button>,
          <Button
            key="close"
            onClick={() => {
              setCreatedSecret(null);
              clearTokenCache();
            }}
          >
            我已保存
          </Button>,
        ]}
      >
        <Alert type="warning" message="请立即保存此 token，关闭后将无法再次查看" className="mb-3" />
        <Paragraph copyable={{ text: createdSecret?.token ?? '' }}>
          <Text code style={{ wordBreak: 'break-all' }}>
            {createdSecret?.token ?? ''}
          </Text>
        </Paragraph>
        <Divider />
        <Space direction="vertical">
          <Text type="secondary">标签：{createdSecret?.label}</Text>
          <Text type="secondary">权限：{createdSecret?.scope}</Text>
        </Space>
      </Modal>

      <Modal
        open={enableConfirmOpen}
        title="确认启用远程访问？"
        onOk={onConfirmEnableRemote}
        onCancel={() => setEnableConfirmOpen(false)}
        okText="确认启用"
        okButtonProps={{ danger: true }}
      >
        <Alert
          type="error"
          message="风险提示"
          description="启用后任何能访问本机端口的设备都将能调用 LLM 凭据 / 邮箱 / IM 通道。仅在受信网络下开启。"
        />
      </Modal>

      <Modal
        open={disableRevokeAllOpen}
        title="是否同时撤销所有远程 token？"
        onCancel={() => setDisableRevokeAllOpen(false)}
        footer={[
          <Button key="keep" onClick={() => onDisableRemote(false)}>
            保留 token，仅关闭开关
          </Button>,
          <Button key="revoke" type="primary" danger onClick={() => onDisableRemote(true)}>
            同时撤销所有 token
          </Button>,
        ]}
      >
        <Paragraph>
          关闭远程模式不会自动撤销已签发的 token；如需彻底吊销现有 token，请选择「同时撤销」。
        </Paragraph>
      </Modal>
    </div>
  );
}
