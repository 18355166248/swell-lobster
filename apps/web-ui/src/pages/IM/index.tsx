import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/base';
import { TableActions } from '../../components/TableActions';

const { Title, Text } = Typography;

type ChannelStatus = 'running' | 'stopped' | 'error';

type Channel = {
  id: string;
  channel_type: string;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  status: ChannelStatus;
  error_message: string | null;
  created_at: string;
};

type FieldOption = { value: string; label: string };

type ChannelFieldDef = {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  required?: boolean;
  hint?: string;
  options?: FieldOption[];
};

type ChannelTypeDef = {
  type: string;
  label: string;
  fields: ChannelFieldDef[];
};

type PendingRequest = {
  user_id: number;
  code: string;
  created_at: string;
  first_name?: string;
  username?: string;
};

/** config 字段反序列化为表单初始值 */
function configToFormValues(
  fields: ChannelFieldDef[],
  config: Record<string, unknown>
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = config[field.key];
    if (raw === undefined || raw === null) continue;
    if (field.key === 'allowed_user_ids' && Array.isArray(raw)) {
      values[field.key] = raw.join(', ');
    } else {
      values[field.key] = raw;
    }
  }
  return values;
}

/** 表单值序列化为 config 对象 */
function formValuesToConfig(
  fields: ChannelFieldDef[],
  values: Record<string, unknown>
): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = values[field.key];
    if (raw === undefined || raw === '') continue;
    if (field.key === 'allowed_user_ids' && typeof raw === 'string') {
      config[field.key] = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number)
        .filter((n) => !isNaN(n));
    } else if (field.type === 'number') {
      const num = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isFinite(num)) config[field.key] = num;
    } else {
      config[field.key] = raw;
    }
  }
  return config;
}

export function IMPage() {
  const { t } = useTranslation();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelTypes, setChannelTypes] = useState<ChannelTypeDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 新增弹窗
  const [addOpen, setAddOpen] = useState(false);
  const [addStep, setAddStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState<ChannelTypeDef | null>(null);
  const [addSaving, setAddSaving] = useState(false);
  const [addForm] = Form.useForm();

  // 编辑弹窗
  const [editChannel, setEditChannel] = useState<Channel | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm] = Form.useForm();

  // 操作状态
  const [operating, setOperating] = useState<Set<string>>(new Set());

  // 配对管理弹窗
  const [pairingChannel, setPairingChannel] = useState<Channel | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<number[]>([]);
  const [pairingLoading, setPairingLoading] = useState(false);

  const [messageApi, contextHolder] = message.useMessage();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [chData, typeData] = await Promise.all([
        apiGet<{ channels: Channel[] }>('/api/im/channels'),
        apiGet<ChannelTypeDef[]>('/api/im/channel-types'),
      ]);
      setChannels(chData.channels ?? []);
      setChannelTypes(typeData ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('im.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setOperatingId = (id: string, val: boolean) => {
    setOperating((prev) => {
      const next = new Set(prev);
      if (val) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleStart = async (channel: Channel) => {
    setOperatingId(channel.id, true);
    try {
      await apiPost(`/api/im/channels/${channel.id}/start`, {});
      setChannels((prev) =>
        prev.map((c) => (c.id === channel.id ? { ...c, status: 'running', enabled: true } : c))
      );
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : t('im.startFailed'));
    } finally {
      setOperatingId(channel.id, false);
    }
  };

  const handleStop = async (channel: Channel) => {
    setOperatingId(channel.id, true);
    try {
      await apiPost(`/api/im/channels/${channel.id}/stop`, {});
      setChannels((prev) =>
        prev.map((c) => (c.id === channel.id ? { ...c, status: 'stopped', enabled: false } : c))
      );
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : t('im.stopFailed'));
    } finally {
      setOperatingId(channel.id, false);
    }
  };

  const handleDelete = async (channel: Channel) => {
    setOperatingId(channel.id, true);
    try {
      await apiDelete(`/api/im/channels/${channel.id}`);
      setChannels((prev) => prev.filter((c) => c.id !== channel.id));
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : t('im.deleteFailed'));
    } finally {
      setOperatingId(channel.id, false);
    }
  };

  // ── 新增 ──────────────────────────────────────
  const openAdd = () => {
    addForm.resetFields();
    setSelectedType(null);
    setAddStep(1);
    setAddOpen(true);
  };

  const handleSelectType = (typeDef: ChannelTypeDef) => {
    setSelectedType(typeDef);
    setAddStep(2);
    addForm.setFieldValue('channel_type', typeDef.type);
  };

  const handleAddSubmit = async () => {
    let values: Record<string, unknown>;
    try {
      values = await addForm.validateFields();
    } catch {
      return;
    }
    setAddSaving(true);
    try {
      const config = formValuesToConfig(selectedType?.fields ?? [], values);
      const channel = await apiPost<Channel>('/api/im/channels', {
        channel_type: values.channel_type,
        name: values.channel_name,
        config,
        enabled: false,
      });
      setChannels((prev) => [...prev, channel]);
      setAddOpen(false);
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : t('im.saveFailed'));
    } finally {
      setAddSaving(false);
    }
  };

  // ── 编辑 ──────────────────────────────────────
  const openEdit = (channel: Channel) => {
    const typeDef = channelTypes.find((t) => t.type === channel.channel_type);
    if (!typeDef) return;
    editForm.resetFields();
    editForm.setFieldsValue({
      channel_name: channel.name,
      ...configToFormValues(typeDef.fields, channel.config),
    });
    setEditChannel(channel);
  };

  const handleEditSubmit = async () => {
    if (!editChannel) return;
    let values: Record<string, unknown>;
    try {
      values = await editForm.validateFields();
    } catch {
      return;
    }
    const typeDef = channelTypes.find((t) => t.type === editChannel.channel_type);
    if (!typeDef) return;

    setEditSaving(true);
    try {
      const config = formValuesToConfig(typeDef.fields, values);
      const updated = await apiPatch<Channel>(`/api/im/channels/${editChannel.id}`, {
        name: String(values.channel_name ?? editChannel.name),
        config,
      });
      setChannels((prev) => prev.map((c) => (c.id === editChannel.id ? { ...c, ...updated } : c)));
      setEditChannel(null);
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : t('im.updateFailed'));
    } finally {
      setEditSaving(false);
    }
  };

  // ── 配对管理 ───────────────────────────────────
  const openPairing = async (channel: Channel) => {
    setPairingChannel(channel);
    await loadPairingData(channel.id);
  };

  const loadPairingData = async (channelId: string) => {
    setPairingLoading(true);
    try {
      const [pendingData, approvedData] = await Promise.all([
        apiGet<{ pending: PendingRequest[] }>(`/api/im/channels/${channelId}/pairing/pending`),
        apiGet<{ approved: number[] }>(`/api/im/channels/${channelId}/pairing/approved`),
      ]);
      setPendingRequests(pendingData.pending ?? []);
      setApprovedUsers(approvedData.approved ?? []);
    } catch {
      // ignore
    } finally {
      setPairingLoading(false);
    }
  };

  const handleApprove = async (userId: number) => {
    if (!pairingChannel) return;
    try {
      await apiPost(`/api/im/channels/${pairingChannel.id}/pairing/approve`, { user_id: userId });
      await loadPairingData(pairingChannel.id);
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : t('im.pairingApproveFailed'));
    }
  };

  const handleRevoke = async (userId: number) => {
    if (!pairingChannel) return;
    try {
      await apiDelete(`/api/im/channels/${pairingChannel.id}/pairing/approved/${userId}`);
      setApprovedUsers((prev) => prev.filter((id) => id !== userId));
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : t('im.pairingRevokeFailed'));
    }
  };

  const statusBadge = (status: ChannelStatus) => {
    const map = {
      running: { status: 'success' as const, text: t('im.statusRunning') },
      stopped: { status: 'default' as const, text: t('im.statusStopped') },
      error: { status: 'error' as const, text: t('im.statusError') },
    };
    const { status: badgeStatus, text } = map[status] ?? map.stopped;
    return <Badge status={badgeStatus} text={text} />;
  };

  /** 通用字段渲染（新增 & 编辑共用） */
  const renderField = (field: ChannelFieldDef) => {
    if (field.type === 'select') {
      return (
        <Select
          placeholder={field.hint}
          options={field.options?.map((o) => ({ value: o.value, label: o.label }))}
        />
      );
    }
    if (field.type === 'number') {
      return <InputNumber className="w-full" placeholder={field.hint} />;
    }
    if (field.type === 'boolean') {
      return (
        <Select
          placeholder={field.hint}
          options={[
            { value: true, label: 'true' },
            { value: false, label: 'false' },
          ]}
        />
      );
    }
    return <Input placeholder={field.hint} />;
  };

  return (
    <div className="p-6">
      {contextHolder}
      <div className="flex items-center justify-between mb-1">
        <Title level={4} style={{ margin: 0 }}>
          {t('im.title')}
        </Title>
        <Space>
          <Button onClick={() => void load()} loading={loading} size="small">
            {t('common.refresh')}
          </Button>
          <Button type="primary" size="small" onClick={openAdd}>
            {t('im.addChannel')}
          </Button>
        </Space>
      </div>
      <Text type="secondary">{t('im.subtitle')}</Text>

      {error && <Alert type="error" message={error} className="mt-3" showIcon />}

      {loading ? (
        <div className="mt-6 flex items-center gap-2">
          <Spin size="small" />
          <Text type="secondary">{t('common.loading')}</Text>
        </div>
      ) : (
        <div className="mt-6 rounded border border-border bg-background">
          <Table<Channel>
            rowKey="id"
            dataSource={channels}
            pagination={false}
            size="small"
            locale={{ emptyText: t('im.noChannels') }}
            columns={[
              {
                title: t('im.channelType'),
                dataIndex: 'channel_type',
                key: 'type',
                width: 120,
                render: (val: string) => <Tag>{val}</Tag>,
              },
              {
                title: t('common.api'),
                dataIndex: 'name',
                key: 'name',
                render: (name: string, record) => (
                  <div>
                    <div className="font-medium text-foreground">{name}</div>
                    {record.status === 'error' && record.error_message && (
                      <div className="text-xs text-destructive mt-0.5">{record.error_message}</div>
                    )}
                  </div>
                ),
              },
              {
                title: '状态',
                key: 'status',
                width: 120,
                render: (_, record) => statusBadge(record.status),
              },
              {
                title: t('common.actions'),
                key: 'actions',
                width: 130,
                render: (_, record) => {
                  const busy = operating.has(record.id);
                  return (
                    <TableActions
                      actions={[
                        {
                          key: 'toggle',
                          icon:
                            record.status === 'running' ? (
                              <PauseCircleOutlined />
                            ) : (
                              <PlayCircleOutlined />
                            ),
                          tooltip:
                            record.status === 'running'
                              ? t('im.stopChannel')
                              : t('im.startChannel'),
                          type: record.status === 'running' ? 'text' : 'primary',
                          loading: busy,
                          onClick: () =>
                            void (record.status === 'running'
                              ? handleStop(record)
                              : handleStart(record)),
                        },
                        {
                          key: 'edit',
                          icon: <EditOutlined />,
                          tooltip: t('common.edit'),
                          onClick: () => openEdit(record),
                        },
                        {
                          key: 'manage',
                          icon: <SettingOutlined />,
                          tooltip: t('im.manage'),
                          hidden: record.channel_type !== 'telegram',
                          onClick: () => void openPairing(record),
                        },
                        {
                          key: 'delete',
                          icon: <DeleteOutlined />,
                          tooltip: t('common.delete'),
                          danger: true,
                          disabled: busy,
                          popconfirm: {
                            title: t('im.deleteConfirm'),
                            onConfirm: () => void handleDelete(record),
                            okText: t('common.confirm'),
                            cancelText: t('common.cancel'),
                          },
                        },
                      ]}
                    />
                  );
                },
              },
            ]}
          />
        </div>
      )}

      {/* 新增通道弹窗（两步） */}
      <Modal
        title={addStep === 1 ? t('im.selectChannelType') : t('im.configureChannel')}
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        footer={
          addStep === 2 ? (
            <Space>
              <Button onClick={() => setAddStep(1)}>{t('common.cancel')}</Button>
              <Button type="primary" loading={addSaving} onClick={() => void handleAddSubmit()}>
                {t('common.save')}
              </Button>
            </Space>
          ) : null
        }
        width={480}
      >
        <Form form={addForm} layout="vertical" className="mt-4">
          {addStep === 1 && (
            <div className="grid grid-cols-2 gap-3">
              {channelTypes.map((typeDef) => (
                <button
                  key={typeDef.type}
                  type="button"
                  className="rounded-lg border border-border p-4 text-left hover:border-primary hover:bg-accent/30 transition-colors cursor-pointer bg-transparent"
                  onClick={() => handleSelectType(typeDef)}
                >
                  <div className="font-medium text-foreground">{typeDef.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">{typeDef.type}</div>
                </button>
              ))}
            </div>
          )}

          {addStep === 2 && selectedType && (
            <>
              <Form.Item name="channel_type" hidden>
                <Input />
              </Form.Item>
              <Form.Item
                name="channel_name"
                label={t('im.channelName')}
                rules={[{ required: true, message: t('im.channelNameRequired') }]}
              >
                <Input placeholder={t('im.channelNamePlaceholder')} />
              </Form.Item>
              {selectedType.fields.map((field) => (
                <Form.Item
                  key={field.key}
                  name={field.key}
                  label={field.label}
                  rules={
                    field.required ? [{ required: true, message: `${field.label} 不能为空` }] : []
                  }
                  extra={field.hint}
                >
                  {renderField(field)}
                </Form.Item>
              ))}
            </>
          )}
        </Form>
      </Modal>

      {/* 编辑通道弹窗 */}
      <Modal
        title={t('im.editChannel')}
        open={!!editChannel}
        onCancel={() => setEditChannel(null)}
        footer={
          <Space>
            <Button onClick={() => setEditChannel(null)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={editSaving} onClick={() => void handleEditSubmit()}>
              {t('common.save')}
            </Button>
          </Space>
        }
        width={480}
      >
        {editChannel && (
          <Form form={editForm} layout="vertical" className="mt-4">
            <Form.Item
              name="channel_name"
              label={t('im.channelName')}
              rules={[{ required: true, message: t('im.channelNameRequired') }]}
            >
              <Input />
            </Form.Item>
            {(channelTypes.find((t) => t.type === editChannel.channel_type)?.fields ?? []).map(
              (field) => (
                <Form.Item
                  key={field.key}
                  name={field.key}
                  label={field.label}
                  rules={
                    field.required ? [{ required: true, message: `${field.label} 不能为空` }] : []
                  }
                  extra={field.hint}
                >
                  {renderField(field)}
                </Form.Item>
              )
            )}
          </Form>
        )}
      </Modal>

      {/* 配对管理弹窗 */}
      <Modal
        title={`${t('im.pairing')} — ${pairingChannel?.name ?? ''}`}
        open={!!pairingChannel}
        onCancel={() => setPairingChannel(null)}
        footer={null}
        width={600}
      >
        {pairingLoading ? (
          <div className="flex items-center gap-2 py-4">
            <Spin size="small" />
            <Text type="secondary">{t('common.loading')}</Text>
          </div>
        ) : (
          <Tabs
            items={[
              {
                key: 'pending',
                label: `${t('im.pairingPending')} (${pendingRequests.length})`,
                children: (
                  <Table<PendingRequest>
                    rowKey="user_id"
                    dataSource={pendingRequests}
                    pagination={false}
                    size="small"
                    locale={{ emptyText: t('im.pairingNoPending') }}
                    columns={[
                      {
                        title: t('im.pairingUserId'),
                        dataIndex: 'user_id',
                        key: 'user_id',
                        width: 120,
                      },
                      {
                        title: t('im.pairingUsername'),
                        key: 'username',
                        render: (_, r) =>
                          r.first_name
                            ? `${r.first_name}${r.username ? ` (@${r.username})` : ''}`
                            : (r.username ?? '—'),
                      },
                      {
                        title: t('im.pairingCode'),
                        dataIndex: 'code',
                        key: 'code',
                        width: 100,
                        render: (code: string) => (
                          <Tag color="blue" style={{ fontFamily: 'monospace' }}>
                            {code}
                          </Tag>
                        ),
                      },
                      {
                        title: t('im.pairingRequestedAt'),
                        dataIndex: 'created_at',
                        key: 'created_at',
                        render: (v: string) => new Date(v).toLocaleString(),
                      },
                      {
                        title: t('common.actions'),
                        key: 'actions',
                        width: 80,
                        render: (_, r) => (
                          <Button
                            type="primary"
                            size="small"
                            onClick={() => void handleApprove(r.user_id)}
                          >
                            {t('im.pairingApprove')}
                          </Button>
                        ),
                      },
                    ]}
                  />
                ),
              },
              {
                key: 'approved',
                label: `${t('im.pairingApproved')} (${approvedUsers.length})`,
                children: (
                  <Table<{ id: number }>
                    rowKey="id"
                    dataSource={approvedUsers.map((id) => ({ id }))}
                    pagination={false}
                    size="small"
                    locale={{ emptyText: t('im.pairingNoApproved') }}
                    columns={[
                      {
                        title: t('im.pairingUserId'),
                        dataIndex: 'id',
                        key: 'id',
                      },
                      {
                        title: t('common.actions'),
                        key: 'actions',
                        width: 80,
                        render: (_, r) => (
                          <Popconfirm
                            title={t('im.pairingRevokeConfirm')}
                            onConfirm={() => void handleRevoke(r.id)}
                            okText={t('common.confirm')}
                            cancelText={t('common.cancel')}
                          >
                            <Button size="small" danger>
                              {t('im.pairingRevoke')}
                            </Button>
                          </Popconfirm>
                        ),
                      },
                    ]}
                  />
                ),
              },
            ]}
          />
        )}
      </Modal>
    </div>
  );
}
