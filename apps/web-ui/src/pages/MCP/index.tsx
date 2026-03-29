import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../api/base';

const { Title, Text } = Typography;

type MCPTool = {
  name: string;
  description?: string;
};

type MCPServer = {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  status: 'running' | 'stopped' | 'error';
  error_message?: string;
  tool_count: number;
  created_at: string;
};

type FormValues = {
  name: string;
  command: string;
  argsText: string;
  envText: string;
  enabled: boolean;
};

function statusColor(status: MCPServer['status']): string {
  if (status === 'running') return 'green';
  if (status === 'error') return 'red';
  return 'default';
}

export function MCPPage() {
  const { t } = useTranslation();
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [switchingIds, setSwitchingIds] = useState<Set<string>>(new Set());
  const [toolsByServer, setToolsByServer] = useState<Record<string, MCPTool[]>>({});
  const [loadingTools, setLoadingTools] = useState<Set<string>>(new Set());
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<FormValues>();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ servers: MCPServer[] }>('/api/mcp/servers');
      setServers(data.servers ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('mcp.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTools = async (serverId: string) => {
    if (toolsByServer[serverId] || loadingTools.has(serverId)) return;
    setLoadingTools((prev) => new Set(prev).add(serverId));
    try {
      const data = await apiGet<{ tools: MCPTool[] }>(`/api/mcp/servers/${serverId}/tools`);
      setToolsByServer((prev) => ({ ...prev, [serverId]: data.tools ?? [] }));
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : t('mcp.toolsLoadFailed'));
    } finally {
      setLoadingTools((prev) => {
        const next = new Set(prev);
        next.delete(serverId);
        return next;
      });
    }
  };

  const openAdd = () => {
    form.setFieldsValue({
      name: '',
      command: '',
      argsText: '',
      envText: '',
      enabled: true,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await apiPost('/api/mcp/servers', {
        name: values.name,
        command: values.command,
        args: values.argsText
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
        envText: values.envText,
        enabled: values.enabled,
      });
      setModalOpen(false);
      await load();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : t('mcp.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiDelete(`/api/mcp/servers/${id}`);
      setToolsByServer((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await load();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : t('mcp.deleteFailed'));
    }
  };

  const handleReloadAll = async () => {
    setReloading(true);
    try {
      await apiPost('/api/mcp/reload', {});
      setToolsByServer({});
      await load();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : t('mcp.reloadFailed'));
    } finally {
      setReloading(false);
    }
  };

  const handleToggle = async (server: MCPServer, enabled: boolean) => {
    setSwitchingIds((prev) => new Set(prev).add(server.id));
    try {
      await apiPatch(`/api/mcp/servers/${server.id}/${enabled ? 'enable' : 'disable'}`, {});
      if (!enabled) {
        setToolsByServer((prev) => {
          const next = { ...prev };
          delete next[server.id];
          return next;
        });
      }
      await load();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : t('mcp.toggleFailed'));
    } finally {
      setSwitchingIds((prev) => {
        const next = new Set(prev);
        next.delete(server.id);
        return next;
      });
    }
  };

  const columns: ColumnsType<MCPServer> = [
    {
      title: t('mcp.name'),
      key: 'name',
      render: (_, record) => (
        <div>
          <div className="font-medium text-foreground">{record.name}</div>
          <div className="text-sm text-muted-foreground font-mono">
            {record.command}
            {record.args.length ? ` ${record.args.join(' ')}` : ''}
          </div>
          {record.error_message ? (
            <div className="text-xs text-red-500 mt-1">{record.error_message}</div>
          ) : null}
        </div>
      ),
    },
    {
      title: t('mcp.status'),
      dataIndex: 'status',
      width: 120,
      render: (status: MCPServer['status']) => (
        <Tag color={statusColor(status)}>{t(`mcp.statuses.${status}`)}</Tag>
      ),
    },
    {
      title: t('mcp.tools'),
      dataIndex: 'tool_count',
      width: 120,
      render: (count: number) => t('mcp.toolCount', { n: count }),
    },
    {
      title: t('mcp.enabled'),
      width: 100,
      render: (_, record) => (
        <Switch
          checked={record.enabled}
          loading={switchingIds.has(record.id)}
          onChange={(checked) => void handleToggle(record, checked)}
          size="small"
        />
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 170,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => void fetchTools(record.id)}>
            {t('mcp.reload')}
          </Button>
          <Popconfirm title={t('mcp.deleteConfirm')} onConfirm={() => void handleDelete(record.id)}>
            <Button danger size="small">
              {t('common.delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="p-6">
      {contextHolder}
      <div className="flex items-center justify-between mb-1 gap-3">
        <div>
          <Title level={4} style={{ margin: 0 }}>
            {t('mcp.title')}
          </Title>
          <Text type="secondary">{t('mcp.subtitle')}</Text>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            loading={reloading}
            onClick={() => void handleReloadAll()}
          >
            {t('mcp.reloadAll')}
          </Button>
          <Button type="primary" onClick={openAdd}>
            {t('mcp.addServer')}
          </Button>
        </Space>
      </div>

      {error ? <Alert type="error" message={error} className="mt-4" showIcon /> : null}

      {loading ? (
        <div className="mt-6 flex items-center gap-2">
          <Spin size="small" />
          <Text type="secondary">{t('common.loading')}</Text>
        </div>
      ) : (
        <div className="mt-6 rounded border border-border bg-background">
          <Table<MCPServer>
            rowKey="id"
            dataSource={servers}
            pagination={false}
            locale={{ emptyText: t('mcp.noServers') }}
            columns={columns}
            expandable={{
              onExpand: (expanded, record) => {
                if (expanded) void fetchTools(record.id);
              },
              expandedRowRender: (record) => {
                if (loadingTools.has(record.id)) {
                  return (
                    <div className="flex items-center gap-2 py-2">
                      <Spin size="small" />
                      <Text type="secondary">{t('common.loading')}</Text>
                    </div>
                  );
                }
                const tools = toolsByServer[record.id] ?? [];
                return tools.length ? (
                  <div className="space-y-2">
                    {tools.map((tool) => (
                      <div key={tool.name} className="rounded border border-border px-3 py-2">
                        <div className="font-medium">{tool.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {tool.description || t('common.noData')}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Text type="secondary">{t('mcp.noTools')}</Text>
                );
              },
            }}
          />
        </div>
      )}

      <Modal
        title={t('mcp.addServer')}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void handleSubmit()}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label={t('mcp.name')}
            rules={[{ required: true, message: t('mcp.nameRequired') }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="command"
            label={t('mcp.command')}
            extra={t('mcp.commandHint')}
            rules={[{ required: true, message: t('mcp.commandRequired') }]}
          >
            <Input placeholder="npx" />
          </Form.Item>
          <Form.Item name="argsText" label={t('mcp.args')}>
            <Input.TextArea rows={4} placeholder={t('mcp.argsPlaceholder')} />
          </Form.Item>
          <Form.Item name="envText" label={t('mcp.envVars')}>
            <Input.TextArea
              rows={4}
              placeholder="KEY=value&#10;ANOTHER=value"
            />
          </Form.Item>
          <Form.Item name="enabled" label={t('mcp.enabled')} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
