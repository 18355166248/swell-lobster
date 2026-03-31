import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Form,
  Input,
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
import { useTranslation } from 'react-i18next';
import { apiGet, apiPost, apiDelete } from '../../api/base';

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

export function IMPage() {
  const { t } = useTranslation();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelTypes, setChannelTypes] = useState<ChannelTypeDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addStep, setAddStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState<ChannelTypeDef | null>(null);
  const [saving, setSaving] = useState(false);
  const [operating, setOperating] = useState<Set<string>>(new Set());
  const [pairingChannel, setPairingChannel] = useState<Channel | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<number[]>([]);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm();

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

  const openAdd = () => {
    form.resetFields();
    setSelectedType(null);
    setAddStep(1);
    setAddOpen(true);
  };

  const handleSelectType = (typeDef: ChannelTypeDef) => {
    setSelectedType(typeDef);
    setAddStep(2);
    form.setFieldValue('channel_type', typeDef.type);
  };

  const handleAddSubmit = async () => {
    let values: Record<string, unknown>;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    setSaving(true);
    try {
      // 将 fields 中的值组合为 config 对象
      const config: Record<string, unknown> = {};
      for (const field of selectedType?.fields ?? []) {
        const raw = values[field.key];
        if (raw !== undefined && raw !== '') {
          if (field.key === 'allowed_user_ids' && typeof raw === 'string') {
            config[field.key] = raw
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
              .map(Number)
              .filter((n) => !isNaN(n));
          } else {
            config[field.key] = raw;
          }
        }
      }
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
      setSaving(false);
    }
  };

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
                width: 200,
                render: (_, record) => {
                  const busy = operating.has(record.id);
                  return (
                    <Space size="small">
                      {record.status === 'running' ? (
                        <Button size="small" loading={busy} onClick={() => void handleStop(record)}>
                          {t('im.stopChannel')}
                        </Button>
                      ) : (
                        <Button
                          type="primary"
                          size="small"
                          loading={busy}
                          onClick={() => void handleStart(record)}
                        >
                          {t('im.startChannel')}
                        </Button>
                      )}
                      {record.channel_type === 'telegram' && (
                        <Button size="small" onClick={() => void openPairing(record)}>
                          {t('im.manage')}
                        </Button>
                      )}
                      <Popconfirm
                        title={t('im.deleteConfirm')}
                        onConfirm={() => void handleDelete(record)}
                        okText={t('common.confirm')}
                        cancelText={t('common.cancel')}
                      >
                        <Button size="small" danger disabled={busy}>
                          {t('common.delete')}
                        </Button>
                      </Popconfirm>
                    </Space>
                  );
                },
              },
            ]}
          />
        </div>
      )}

      {/* 添加通道弹窗（两步） */}
      <Modal
        title={addStep === 1 ? t('im.selectChannelType') : t('im.configureChannel')}
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        footer={
          addStep === 2 ? (
            <Space>
              <Button onClick={() => setAddStep(1)}>{t('common.cancel')}</Button>
              <Button type="primary" loading={saving} onClick={() => void handleAddSubmit()}>
                {t('common.save')}
              </Button>
            </Space>
          ) : null
        }
        width={480}
      >
        {/* 与 Form.useForm() 绑定的 <Form> 必须在弹窗打开时始终挂载；勿与 destroyOnHidden 组合，勿仅在第二步才渲染 Form */}
        <Form form={form} layout="vertical" className="mt-4">
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
                  {field.type === 'select' ? (
                    <Select
                      placeholder={field.hint}
                      options={field.options?.map((o) => ({ value: o.value, label: o.label }))}
                    />
                  ) : (
                    <Input placeholder={field.hint} />
                  )}
                </Form.Item>
              ))}
            </>
          )}
        </Form>
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
