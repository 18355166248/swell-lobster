import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CopyOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../api/base';

const { Title, Text } = Typography;

type EndpointItem = {
  name?: string;
};

type ScheduledTask = {
  id: string;
  name: string;
  description?: string;
  cron_expr?: string;
  task_prompt: string;
  endpoint_name?: string;
  trigger_type: 'cron' | 'webhook';
  webhook_secret?: string;
  enabled: boolean;
  next_run_at?: string;
  created_at: string;
  updated_at: string;
};

type TaskRun = {
  id: string;
  task_id: string;
  triggered_by: 'cron' | 'webhook' | 'manual';
  status: 'success' | 'error' | 'timeout';
  result?: string;
  duration_ms?: number;
  created_at: string;
};

type FormValues = {
  name: string;
  description?: string;
  trigger_type: 'cron' | 'webhook';
  cron_expr?: string;
  task_prompt: string;
  endpoint_name?: string;
  nl_text?: string;
};

function buildWebhookPath(taskId: string): string {
  return `/api/webhooks/${taskId}/trigger`;
}

function formatDate(value?: string): string {
  return value ? new Date(value).toLocaleString() : '-';
}

export function SchedulerPage() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [endpoints, setEndpoints] = useState<EndpointItem[]>([]);
  const [runsByTask, setRunsByTask] = useState<Record<string, TaskRun[]>>({});
  const [loadingRuns, setLoadingRuns] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledTask | null>(null);
  const [saving, setSaving] = useState(false);
  const [convertingCron, setConvertingCron] = useState(false);
  const [switchingIds, setSwitchingIds] = useState<Set<string>>(new Set());
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<FormValues>();
  const triggerType = Form.useWatch('trigger_type', form) ?? 'cron';

  const endpointOptions = useMemo(
    () => [
      { value: '', label: t('scheduler.defaultEndpoint') },
      ...endpoints
        .map((item) => item.name)
        .filter((item): item is string => Boolean(item))
        .map((name) => ({ value: name, label: name })),
    ],
    [endpoints, t]
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [taskData, endpointData] = await Promise.all([
        apiGet<{ tasks: ScheduledTask[] }>('/api/scheduler/tasks'),
        apiGet<{ endpoints: EndpointItem[] }>('/api/config/endpoints'),
      ]);
      setTasks(taskData.tasks ?? []);
      setEndpoints(endpointData.endpoints ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('scheduler.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRuns = async (taskId: string) => {
    if (runsByTask[taskId] || loadingRuns.has(taskId)) return;
    setLoadingRuns((prev) => new Set(prev).add(taskId));
    try {
      const data = await apiGet<{ runs: TaskRun[] }>(`/api/scheduler/tasks/${taskId}/runs`);
      setRunsByTask((prev) => ({ ...prev, [taskId]: data.runs ?? [] }));
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : t('scheduler.loadFailed'));
    } finally {
      setLoadingRuns((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  const openCreate = () => {
    setEditing(null);
    form.setFieldsValue({
      name: '',
      description: '',
      trigger_type: 'cron',
      cron_expr: '0 9 * * *',
      task_prompt: '',
      endpoint_name: '',
      nl_text: '',
    });
    setModalOpen(true);
  };

  const openEdit = (task: ScheduledTask) => {
    setEditing(task);
    form.setFieldsValue({
      name: task.name,
      description: task.description,
      trigger_type: task.trigger_type,
      cron_expr: task.cron_expr,
      task_prompt: task.task_prompt,
      endpoint_name: task.endpoint_name ?? '',
      nl_text: '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const payload = {
        name: values.name,
        description: values.description,
        trigger_type: values.trigger_type,
        cron_expr: values.trigger_type === 'cron' ? values.cron_expr : undefined,
        task_prompt: values.task_prompt,
        endpoint_name: values.endpoint_name || undefined,
      };
      if (editing) {
        await apiPatch(`/api/scheduler/tasks/${editing.id}`, payload);
      } else {
        await apiPost('/api/scheduler/tasks', payload);
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : t('scheduler.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiDelete(`/api/scheduler/tasks/${id}`);
      setRunsByTask((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await load();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : t('scheduler.deleteFailed'));
    }
  };

  const handleToggle = async (task: ScheduledTask, enabled: boolean) => {
    setSwitchingIds((prev) => new Set(prev).add(task.id));
    try {
      await apiPost(`/api/scheduler/tasks/${task.id}/${enabled ? 'enable' : 'disable'}`, {});
      await load();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : t('scheduler.toggleFailed'));
    } finally {
      setSwitchingIds((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  };

  const handleRunNow = async (taskId: string) => {
    setRunningIds((prev) => new Set(prev).add(taskId));
    try {
      const data = await apiPost<{ runs: TaskRun[] }>(`/api/scheduler/tasks/${taskId}/run`, {});
      setRunsByTask((prev) => ({ ...prev, [taskId]: data.runs ?? [] }));
      await load();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : t('scheduler.runFailed'));
    } finally {
      setRunningIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  const handleConvertNl = async () => {
    const text = String(form.getFieldValue('nl_text') ?? '').trim();
    if (!text) {
      messageApi.warning(t('scheduler.nlTextRequired'));
      return;
    }
    setConvertingCron(true);
    try {
      const data = await apiPost<{ cron_expr: string }>('/api/scheduler/nl-to-cron', { text });
      form.setFieldValue('cron_expr', data.cron_expr);
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : t('scheduler.nlToCronFailed'));
    } finally {
      setConvertingCron(false);
    }
  };

  const handleCopy = async (value: string, successText: string) => {
    await navigator.clipboard.writeText(value);
    messageApi.success(successText);
  };

  const handleRegenerateSecret = async (taskId: string) => {
    try {
      const data = await apiPost<{ task: ScheduledTask }>(
        `/api/scheduler/tasks/${taskId}/regenerate-secret`,
        {}
      );
      setTasks((prev) => prev.map((task) => (task.id === taskId ? data.task : task)));
      await load();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : t('scheduler.regenerateFailed'));
    }
  };

  const columns: ColumnsType<ScheduledTask> = [
    {
      title: t('scheduler.name'),
      key: 'name',
      render: (_, record) => (
        <div>
          <div className="font-medium">{record.name}</div>
          {record.description ? (
            <div className="text-sm text-muted-foreground">{record.description}</div>
          ) : null}
        </div>
      ),
    },
    {
      title: t('scheduler.triggerType'),
      dataIndex: 'trigger_type',
      width: 130,
      render: (value: ScheduledTask['trigger_type']) => (
        <Tag color={value === 'cron' ? 'blue' : 'purple'}>
          {t(`scheduler.triggerLabels.${value}`)}
        </Tag>
      ),
    },
    {
      title: t('scheduler.nextRun'),
      dataIndex: 'next_run_at',
      width: 180,
      render: (value: string, record) =>
        record.trigger_type === 'webhook' ? '-' : value ? formatDate(value) : t('scheduler.never'),
    },
    {
      title: t('scheduler.enabled'),
      width: 90,
      render: (_, record) => (
        <Switch
          checked={record.enabled}
          size="small"
          loading={switchingIds.has(record.id)}
          onChange={(checked) => void handleToggle(record, checked)}
        />
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 220,
      render: (_, record) => (
        <Space wrap>
          <Button size="small" onClick={() => openEdit(record)}>
            {t('common.edit')}
          </Button>
          <Button
            size="small"
            icon={<PlayCircleOutlined />}
            loading={runningIds.has(record.id)}
            onClick={() => void handleRunNow(record.id)}
          >
            {t('scheduler.runNow')}
          </Button>
          <Popconfirm
            title={t('scheduler.deleteConfirm')}
            onConfirm={() => void handleDelete(record.id)}
          >
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
            {t('scheduler.title')}
          </Title>
          <Text type="secondary">{t('scheduler.subtitle')}</Text>
        </div>
        <Button type="primary" onClick={openCreate}>
          {t('scheduler.createTask')}
        </Button>
      </div>

      {error ? <Alert type="error" message={error} className="mt-4" showIcon /> : null}

      {loading ? (
        <div className="mt-6 flex items-center gap-2">
          <Spin size="small" />
          <Text type="secondary">{t('common.loading')}</Text>
        </div>
      ) : (
        <div className="mt-6 rounded border border-border bg-background">
          <Table<ScheduledTask>
            rowKey="id"
            dataSource={tasks}
            pagination={false}
            locale={{ emptyText: t('scheduler.noTasks') }}
            columns={columns}
            expandable={{
              onExpand: (expanded, record) => {
                if (expanded) void loadRuns(record.id);
              },
              expandedRowRender: (record) => {
                const runs = runsByTask[record.id] ?? [];
                return (
                  <div className="space-y-3">
                    <div className="text-sm text-muted-foreground">{record.task_prompt}</div>
                    {record.trigger_type === 'webhook' ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Text strong>{t('scheduler.webhookUrl')}:</Text>
                          <Text code>{buildWebhookPath(record.id)}</Text>
                          <Button
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={() =>
                              void handleCopy(buildWebhookPath(record.id), t('scheduler.copied'))
                            }
                          >
                            {t('scheduler.copy')}
                          </Button>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Text strong>{t('scheduler.webhookSecret')}:</Text>
                          <Text code>{record.webhook_secret || '-'}</Text>
                          {record.webhook_secret ? (
                            <Button
                              size="small"
                              icon={<CopyOutlined />}
                              onClick={() =>
                                void handleCopy(record.webhook_secret!, t('scheduler.copied'))
                              }
                            >
                              {t('scheduler.copy')}
                            </Button>
                          ) : null}
                          <Button
                            size="small"
                            onClick={() => void handleRegenerateSecret(record.id)}
                          >
                            {t('scheduler.regenerateSecret')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        <Text strong>{t('scheduler.cronExpr')}:</Text> {record.cron_expr || '-'}
                      </div>
                    )}

                    <div>
                      <Text strong>{t('scheduler.executionHistory')}</Text>
                      {loadingRuns.has(record.id) ? (
                        <div className="flex items-center gap-2 mt-2">
                          <Spin size="small" />
                          <Text type="secondary">{t('common.loading')}</Text>
                        </div>
                      ) : runs.length ? (
                        <Table<TaskRun>
                          className="mt-2"
                          rowKey="id"
                          size="small"
                          dataSource={runs}
                          pagination={false}
                          columns={[
                            {
                              title: t('common.date'),
                              dataIndex: 'created_at',
                              render: (value: string) => formatDate(value),
                            },
                            {
                              title: t('scheduler.triggeredBy'),
                              dataIndex: 'triggered_by',
                              render: (value: TaskRun['triggered_by']) =>
                                t(`scheduler.triggeredByLabels.${value}`),
                            },
                            {
                              title: t('scheduler.status'),
                              dataIndex: 'status',
                              render: (value: TaskRun['status']) => (
                                <Tag
                                  color={
                                    value === 'success'
                                      ? 'green'
                                      : value === 'timeout'
                                        ? 'orange'
                                        : 'red'
                                  }
                                >
                                  {t(`scheduler.statusLabels.${value}`)}
                                </Tag>
                              ),
                            },
                            {
                              title: t('scheduler.duration'),
                              dataIndex: 'duration_ms',
                              render: (value?: number) =>
                                typeof value === 'number' ? `${value} ms` : '-',
                            },
                            {
                              title: t('scheduler.result'),
                              dataIndex: 'result',
                              render: (value?: string) => (
                                <div className="max-w-[480px] whitespace-pre-wrap break-all text-xs">
                                  {value || '-'}
                                </div>
                              ),
                            },
                          ]}
                        />
                      ) : (
                        <div className="mt-2 text-sm text-muted-foreground">
                          {t('common.noData')}
                        </div>
                      )}
                    </div>
                  </div>
                );
              },
            }}
          />
        </div>
      )}

      <Modal
        title={editing ? t('scheduler.editTask') : t('scheduler.createTask')}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void handleSubmit()}
        confirmLoading={saving}
        destroyOnHidden
        width={640}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label={t('scheduler.name')}
            rules={[{ required: true, message: t('scheduler.nameRequired') }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="description" label={t('scheduler.description')}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item
            name="trigger_type"
            label={t('scheduler.triggerType')}
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { value: 'cron', label: t('scheduler.triggerCron') },
                { value: 'webhook', label: t('scheduler.triggerWebhook') },
              ]}
            />
          </Form.Item>

          {triggerType === 'cron' ? (
            <>
              <Form.Item
                name="cron_expr"
                label={t('scheduler.cronExpr')}
                rules={[{ required: true, message: t('scheduler.cronRequired') }]}
              >
                <Input placeholder="0 9 * * *" />
              </Form.Item>
              <Form.Item name="nl_text" label={t('scheduler.nlToCron')}>
                <Input
                  addonAfter={
                    <Button
                      type="link"
                      loading={convertingCron}
                      onClick={() => void handleConvertNl()}
                    >
                      {t('scheduler.nlToCron')}
                    </Button>
                  }
                  placeholder={t('scheduler.nlPlaceholder')}
                />
              </Form.Item>
            </>
          ) : null}

          <Form.Item name="endpoint_name" label={t('scheduler.endpoint')}>
            <Select options={endpointOptions} />
          </Form.Item>
          <Form.Item
            name="task_prompt"
            label={t('scheduler.taskPrompt')}
            rules={[{ required: true, message: t('scheduler.promptRequired') }]}
          >
            <Input.TextArea rows={6} placeholder={t('scheduler.promptPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
