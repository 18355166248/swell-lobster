import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons';
import { TableActions } from '../../components/TableActions';
import { useTranslation } from 'react-i18next';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../api/base';
import { McpCustomFormFields } from './McpCustomFormFields';
import { McpServerFormModal } from './McpServerFormModal';
import { MarketplaceInstallFormFields } from './MarketplaceInstallFormFields';
import { envFromRows, envToRows, headersToText } from './mcpFormUtils';
import type {
  CustomFormValues,
  InstallMarketFormValues,
  MCPServer,
  MCPServerTransport,
  MarketplaceCatalog,
  MarketplaceServer,
  MCPTool,
} from './types';

const { Title, Text } = Typography;

function statusColor(status: MCPServer['status']): string {
  if (status === 'running') return 'green';
  if (status === 'error') return 'red';
  return 'default';
}

export function MCPPage() {
  const { t, i18n } = useTranslation();
  const isZh = (i18n.language || 'en').startsWith('zh');

  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [switchingIds, setSwitchingIds] = useState<Set<string>>(new Set());
  const [toolsByServer, setToolsByServer] = useState<Record<string, MCPTool[]>>({});
  const [loadingTools, setLoadingTools] = useState<Set<string>>(new Set());
  const [messageApi, contextHolder] = message.useMessage();

  const [marketplace, setMarketplace] = useState<MarketplaceCatalog | null>(null);
  const [marketplaceLoading, setMarketplaceLoading] = useState(false);
  const [marketplaceError, setMarketplaceError] = useState<string | null>(null);
  const [marketSearch, setMarketSearch] = useState('');
  const [marketCategory, setMarketCategory] = useState<string>('all');
  const [installEntry, setInstallEntry] = useState<MarketplaceServer | null>(null);
  const [installSaving, setInstallSaving] = useState(false);
  const [installForm] = Form.useForm<InstallMarketFormValues>();

  const [customForm] = Form.useForm<CustomFormValues>();
  const [editForm] = Form.useForm<CustomFormValues>();
  const [editingServer, setEditingServer] = useState<MCPServer | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
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
  }, [t]);

  const loadMarketplace = useCallback(async () => {
    setMarketplaceLoading(true);
    setMarketplaceError(null);
    try {
      const data = await apiGet<MarketplaceCatalog>('/api/mcp/marketplace');
      setMarketplace(data);
    } catch (e) {
      setMarketplaceError(e instanceof Error ? e.message : t('mcp.marketplaceLoadFailed'));
    } finally {
      setMarketplaceLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const installedRegistryIds = useMemo(() => {
    const s = new Set<string>();
    for (const x of servers) {
      if (x.registry_id) s.add(x.registry_id);
    }
    return s;
  }, [servers]);

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

  const openInstallMarket = (entry: MarketplaceServer) => {
    setInstallEntry(entry);
    const templateEnv: Record<string, string> = {};
    for (const k of entry.requiredEnvKeys ?? []) templateEnv[k] = '';
    for (const k of entry.optionalEnvKeys ?? []) templateEnv[k] = '';
    installForm.setFieldsValue({
      name: entry.name,
      templateEnv,
      extraEnv: [],
    });
  };

  const submitMarketInstall = async () => {
    if (!installEntry) return;
    const values = await installForm.validateFields();
    const name = String(values.name ?? '').trim();
    if (!name) return;
    const env: Record<string, string> = {};
    const templateEnv = values.templateEnv ?? {};
    for (const [k, v] of Object.entries(templateEnv)) {
      if (v !== undefined && String(v).trim() !== '') {
        env[k] = String(v).trim();
      }
    }
    Object.assign(env, envFromRows(values.extraEnv));
    setInstallSaving(true);
    try {
      await apiPost('/api/mcp/servers', {
        name,
        registry_id: installEntry.id,
        command: installEntry.command,
        args: installEntry.defaultArgs,
        env,
        enabled: true,
      });
      messageApi.success(t('common.success'));
      setInstallEntry(null);
      installForm.resetFields();
      await load();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : t('mcp.saveFailed'));
    } finally {
      setInstallSaving(false);
    }
  };

  const openEditServer = (server: MCPServer) => {
    setEditingServer(server);
    const ty = server.type ?? 'stdio';
    editForm.setFieldsValue({
      name: server.name,
      transportType: ty,
      command: server.command ?? '',
      argsText: (server.args ?? []).join('\n'),
      url: server.url ?? '',
      headersText: headersToText(server.headers),
      extraEnv: envToRows(server.env ?? {}),
      enabled: server.enabled,
    });
  };

  const handleEditSubmit = async () => {
    if (!editingServer) return;
    const values = await editForm.validateFields();
    const env = envFromRows(values.extraEnv);
    setEditSaving(true);
    try {
      const transportType = values.transportType ?? 'stdio';
      if (transportType === 'stdio') {
        await apiPatch(`/api/mcp/servers/${editingServer.id}`, {
          name: values.name,
          type: 'stdio',
          command: values.command,
          args: values.argsText
            .split('\n')
            .map((item) => item.trim())
            .filter(Boolean),
          env,
          enabled: values.enabled,
        });
      } else {
        await apiPatch(`/api/mcp/servers/${editingServer.id}`, {
          name: values.name,
          type: transportType,
          url: values.url,
          headersText: values.headersText,
          env,
          enabled: values.enabled,
        });
      }
      messageApi.success(t('common.success'));
      setEditingServer(null);
      editForm.resetFields();
      setToolsByServer((prev) => {
        const next = { ...prev };
        delete next[editingServer.id];
        return next;
      });
      await load();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : t('mcp.saveFailed'));
    } finally {
      setEditSaving(false);
    }
  };

  const handleCustomSubmit = async () => {
    const values = await customForm.validateFields();
    const env = envFromRows(values.extraEnv);
    setInstallSaving(true);
    try {
      const transportType = values.transportType ?? 'stdio';
      if (transportType === 'stdio') {
        await apiPost('/api/mcp/servers', {
          name: values.name,
          type: 'stdio',
          command: values.command,
          args: values.argsText
            .split('\n')
            .map((item) => item.trim())
            .filter(Boolean),
          env,
          enabled: values.enabled,
        });
      } else {
        await apiPost('/api/mcp/servers', {
          name: values.name,
          type: transportType,
          url: values.url,
          headersText: values.headersText,
          env,
          enabled: values.enabled,
        });
      }
      messageApi.success(t('common.success'));
      customForm.resetFields();
      customForm.setFieldsValue({
        transportType: 'stdio',
        enabled: true,
        argsText: '',
        url: '',
        headersText: '',
        extraEnv: [],
      });
      await load();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : t('mcp.saveFailed'));
    } finally {
      setInstallSaving(false);
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

  const getEndpointSummary = (record: MCPServer): string => {
    const ty = record.type ?? 'stdio';
    if (ty === 'sse' || ty === 'http') {
      return record.url ?? '';
    }
    const args = record.args?.length ? ` ${record.args.join(' ')}` : '';
    return `${record.command}${args}`;
  };

  const columns: ColumnsType<MCPServer> = [
    {
      title: t('mcp.name'),
      key: 'name',
      render: (_, record) => (
        <div>
          <div className="font-medium text-foreground">{record.name}</div>
          {record.registry_id ? (
            <Tag className="mt-1">
              {t('mcp.registryId')}: {record.registry_id}
            </Tag>
          ) : null}
          <div className="text-sm text-muted-foreground font-mono mt-1">
            <Tag>{record.type ?? 'stdio'}</Tag> {getEndpointSummary(record)}
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
      width: 110,
      render: (_, record) => (
        <TableActions
          actions={[
            {
              key: 'edit',
              icon: <EditOutlined />,
              tooltip: t('common.edit'),
              onClick: () => openEditServer(record),
            },
            {
              key: 'reload',
              icon: <ReloadOutlined />,
              tooltip: t('mcp.reload'),
              onClick: () => void fetchTools(record.id),
            },
            {
              key: 'delete',
              icon: <DeleteOutlined />,
              tooltip: t('common.delete'),
              danger: true,
              popconfirm: {
                title: t('mcp.deleteConfirm'),
                onConfirm: () => void handleDelete(record.id),
              },
            },
          ]}
        />
      ),
    },
  ];

  const filteredMarketServers = useMemo(() => {
    if (!marketplace) return [];
    const q = marketSearch.trim().toLowerCase();
    return marketplace.servers.filter((s) => {
      if (marketCategory !== 'all' && s.category !== marketCategory) return false;
      if (!q) return true;
      const zh = (s.description_zh ?? '').toLowerCase();
      const en = (s.description_en ?? '').toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        zh.includes(q) ||
        en.includes(q) ||
        s.id.toLowerCase().includes(q)
      );
    });
  }, [marketplace, marketSearch, marketCategory]);

  const categoryOptions = useMemo(() => {
    if (!marketplace) return [];
    return marketplace.categories.map((c) => ({
      value: c.id,
      label: isZh ? c.name_zh : c.name_en,
    }));
  }, [marketplace, isZh]);

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
        </Space>
      </div>

      {error ? <Alert type="error" message={error} className="mt-4" showIcon /> : null}

      <Tabs
        className="mt-4"
        items={[
          {
            key: 'installed',
            label: t('mcp.tabs.installed'),
            children: loading ? (
              <div className="mt-6 flex items-center gap-2">
                <Spin size="small" />
                <Text type="secondary">{t('common.loading')}</Text>
              </div>
            ) : (
              <div className="mt-2 rounded border border-border bg-background">
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
            ),
          },
          {
            key: 'marketplace',
            label: t('mcp.tabs.marketplace'),
            children: (
              <div className="mt-2">
                {marketplaceError ? (
                  <Alert type="error" message={marketplaceError} showIcon className="mb-4" />
                ) : null}
                <Space wrap className="mb-4">
                  <Input.Search
                    allowClear
                    placeholder={t('mcp.marketplaceSearchPlaceholder')}
                    onSearch={setMarketSearch}
                    onChange={(e) => setMarketSearch(e.target.value)}
                    style={{ width: 280 }}
                  />
                  <Select
                    value={marketCategory}
                    onChange={setMarketCategory}
                    options={categoryOptions}
                    style={{ minWidth: 140 }}
                    loading={marketplaceLoading}
                  />
                  <Button onClick={() => void loadMarketplace()} loading={marketplaceLoading}>
                    {t('mcp.reload')}
                  </Button>
                </Space>
                {marketplaceLoading && !marketplace ? (
                  <Spin />
                ) : !marketplace ? (
                  <Empty description={t('mcp.marketplaceLoadFailed')} />
                ) : filteredMarketServers.length === 0 ? (
                  <Empty />
                ) : (
                  <Row gutter={[16, 16]}>
                    {filteredMarketServers.map((entry) => {
                      const installed = installedRegistryIds.has(entry.id);
                      const desc = isZh ? entry.description_zh : entry.description_en;
                      return (
                        <Col xs={24} sm={12} lg={8} key={entry.id}>
                          <Card
                            size="small"
                            title={entry.name}
                            extra={
                              <Button
                                type="primary"
                                size="small"
                                disabled={installed}
                                onClick={() => openInstallMarket(entry)}
                              >
                                {installed ? t('mcp.installedBadge') : t('mcp.install')}
                              </Button>
                            }
                          >
                            <Text type="secondary" className="text-sm block min-h-[40px]">
                              {desc ?? '—'}
                            </Text>
                            <div className="text-xs font-mono text-muted-foreground mt-2 break-all">
                              {entry.command} {entry.defaultArgs.join(' ')}
                            </div>
                          </Card>
                        </Col>
                      );
                    })}
                  </Row>
                )}
              </div>
            ),
          },
          {
            key: 'custom',
            label: t('mcp.tabs.custom'),
            children: (
              <div className="mt-2 max-w-xl">
                <Form
                  form={customForm}
                  layout="vertical"
                  initialValues={{
                    transportType: 'stdio' as MCPServerTransport,
                    enabled: true,
                    argsText: '',
                    url: '',
                    headersText: '',
                    extraEnv: [],
                  }}
                >
                  <McpCustomFormFields />
                  <Form.Item>
                    <Button
                      type="primary"
                      loading={installSaving}
                      onClick={() => void handleCustomSubmit()}
                    >
                      {t('mcp.addServer')}
                    </Button>
                  </Form.Item>
                </Form>
              </div>
            ),
          },
        ]}
        onChange={(key) => {
          if (key === 'marketplace' && !marketplace && !marketplaceLoading) {
            void loadMarketplace();
          }
        }}
      />

      <McpServerFormModal
        open={!!installEntry}
        title={t('mcp.installFromMarket')}
        onCancel={() => {
          setInstallEntry(null);
          installForm.resetFields();
        }}
        onOk={() => void submitMarketInstall()}
        confirmLoading={installSaving}
      >
        {installEntry ? (
          <Form form={installForm} layout="vertical" autoComplete="off">
            <MarketplaceInstallFormFields entry={installEntry} isZh={isZh} />
          </Form>
        ) : null}
      </McpServerFormModal>

      <McpServerFormModal
        open={!!editingServer}
        title={t('mcp.editServer')}
        onCancel={() => {
          setEditingServer(null);
          editForm.resetFields();
        }}
        onOk={() => void handleEditSubmit()}
        confirmLoading={editSaving}
        okText={t('mcp.editSave')}
      >
        {editingServer ? (
          <Form form={editForm} layout="vertical" autoComplete="off">
            <McpCustomFormFields showRegistryAlert={!!editingServer.registry_id} />
          </Form>
        ) : null}
      </McpServerFormModal>
    </div>
  );
}
