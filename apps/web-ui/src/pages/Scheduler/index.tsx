import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
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
import { PlayCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../api/base';

const { Title, Text } = Typography;

type FrequencyType = 'daily' | 'weekly' | 'monthly' | 'custom';

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
  enabled: boolean;
  next_run_at?: string;
  created_at: string;
  updated_at: string;
};

type TaskRun = {
  id: string;
  task_id: string;
  triggered_by: 'cron' | 'manual';
  status: 'success' | 'error' | 'timeout';
  result?: string;
  duration_ms?: number;
  created_at: string;
};

type FormValues = {
  name: string;
  description?: string;
  frequency: FrequencyType;
  time_hour: number;
  time_minute: number;
  weekly_day: number;
  monthly_day: number;
  cron_expr?: string;
  task_prompt: string;
  endpoint_name?: string;
  nl_text?: string;
};

function formatDate(value?: string): string {
  return value ? new Date(value).toLocaleString() : '-';
}

function buildCronExpr(values: FormValues): string {
  const h = values.time_hour ?? 9;
  const m = values.time_minute ?? 0;
  switch (values.frequency) {
    case 'daily':
      return `${m} ${h} * * *`;
    case 'weekly':
      return `${m} ${h} * * ${values.weekly_day ?? 1}`;
    case 'monthly':
      return `${m} ${h} ${values.monthly_day ?? 1} * *`;
    default:
      return values.cron_expr?.trim() ?? '';
  }
}

function parseCronToForm(cronExpr?: string): Partial<FormValues> {
  if (!cronExpr) return { frequency: 'daily', time_hour: 9, time_minute: 0 };
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return { frequency: 'custom', cron_expr: cronExpr };
  const [m, h, dom, mon, dow] = parts;
  const isNum = (s: string) => /^\d+$/.test(s);
  if (dom === '*' && mon === '*' && dow === '*' && isNum(m) && isNum(h)) {
    return { frequency: 'daily', time_hour: parseInt(h), time_minute: parseInt(m) };
  }
  if (dom === '*' && mon === '*' && /^\d$/.test(dow) && isNum(m) && isNum(h)) {
    return {
      frequency: 'weekly',
      time_hour: parseInt(h),
      time_minute: parseInt(m),
      weekly_day: parseInt(dow),
    };
  }
  if (dow === '*' && mon === '*' && isNum(dom) && isNum(m) && isNum(h)) {
    return {
      frequency: 'monthly',
      time_hour: parseInt(h),
      time_minute: parseInt(m),
      monthly_day: parseInt(dom),
    };
  }
  return { frequency: 'custom', cron_expr: cronExpr };
}

/** 每日/周/月「时间」字段：用 `Space.Compact` 替代已弃用的 `InputNumber.addonAfter`（见 `.cursor/rules/antd-input-addonafter.mdc`）。 */
function TimeOfDayFields() {
  const { t } = useTranslation();
  const suffixStyle: CSSProperties = {
    width: 48,
    textAlign: 'center',
    pointerEvents: 'none',
  };
  return (
    <Space>
      <Space.Compact>
        <Form.Item name="time_hour" noStyle rules={[{ required: true }]}>
          <InputNumber min={0} max={23} style={{ width: 90 }} />
        </Form.Item>
        <Input readOnly value={t('scheduler.hourLabel')} style={suffixStyle} tabIndex={-1} />
      </Space.Compact>
      <Space.Compact>
        <Form.Item name="time_minute" noStyle rules={[{ required: true }]}>
          <InputNumber min={0} max={59} style={{ width: 90 }} />
        </Form.Item>
        <Input readOnly value={t('scheduler.minuteLabel')} style={suffixStyle} tabIndex={-1} />
      </Space.Compact>
    </Space>
  );
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
  const [frequency, setFrequency] = useState<FrequencyType>('daily');
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<FormValues>();

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

  const frequencyOptions = useMemo(
    () =>
      (['daily', 'weekly', 'monthly', 'custom'] as FrequencyType[]).map((v) => ({
        value: v,
        label: t(`scheduler.frequencyOptions.${v}`),
      })),
    [t]
  );

  const weekDayOptions = useMemo(
    () =>
      [1, 2, 3, 4, 5, 6, 0].map((d) => ({
        value: d,
        label: t(`scheduler.weekDays.${d}`),
      })),
    [t]
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

  const defaultFormValues = (): Partial<FormValues> => ({
    name: '',
    description: '',
    frequency: 'daily',
    time_hour: 9,
    time_minute: 0,
    weekly_day: 1,
    monthly_day: 1,
    cron_expr: '0 9 * * *',
    task_prompt: '',
    endpoint_name: '',
    nl_text: '',
  });

  const openCreate = () => {
    setEditing(null);
    setFrequency('daily');
    form.setFieldsValue(defaultFormValues());
    setModalOpen(true);
  };

  const openEdit = (task: ScheduledTask) => {
    setEditing(task);
    const parsed = parseCronToForm(task.cron_expr);
    const freq = (parsed.frequency ?? 'daily') as FrequencyType;
    setFrequency(freq);
    form.setFieldsValue({
      ...defaultFormValues(),
      name: task.name,
      description: task.description,
      task_prompt: task.task_prompt,
      endpoint_name: task.endpoint_name ?? '',
      nl_text: '',
      ...parsed,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const cronExpr = buildCronExpr(values);
      const payload = {
        name: values.name,
        description: values.description,
        trigger_type: 'cron' as const,
        cron_expr: cronExpr,
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
      title: t('scheduler.nextRun'),
      dataIndex: 'next_run_at',
      width: 180,
      render: (value: string) => (value ? formatDate(value) : t('scheduler.never')),
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
                    <div className="text-sm text-muted-foreground">
                      <Text strong>{t('scheduler.cronExpr')}:</Text> {record.cron_expr || '-'}
                    </div>

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
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onValuesChange={(changed) => {
            if (changed.frequency !== undefined) setFrequency(changed.frequency as FrequencyType);
          }}
        >
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

          <Form.Item name="frequency" label={t('scheduler.frequency')} rules={[{ required: true }]}>
            <Select options={frequencyOptions} />
          </Form.Item>

          {frequency === 'daily' && (
            <Form.Item label={t('scheduler.timeOfDay')} required>
              <TimeOfDayFields />
            </Form.Item>
          )}

          {frequency === 'weekly' && (
            <>
              <Form.Item
                name="weekly_day"
                label={t('scheduler.weekDay')}
                rules={[{ required: true }]}
              >
                <Select options={weekDayOptions} style={{ width: 140 }} />
              </Form.Item>
              <Form.Item label={t('scheduler.timeOfDay')} required>
                <TimeOfDayFields />
              </Form.Item>
            </>
          )}

          {frequency === 'monthly' && (
            <>
              <Form.Item label={t('scheduler.monthDay')} required>
                <Space.Compact>
                  <Form.Item name="monthly_day" noStyle rules={[{ required: true }]}>
                    <InputNumber min={1} max={31} style={{ width: 120 }} />
                  </Form.Item>
                  {t('scheduler.monthDaySuffix') ? (
                    <Input
                      readOnly
                      value={t('scheduler.monthDaySuffix')}
                      style={{ width: 48, textAlign: 'center', pointerEvents: 'none' }}
                      tabIndex={-1}
                    />
                  ) : null}
                </Space.Compact>
              </Form.Item>
              <Form.Item label={t('scheduler.timeOfDay')} required>
                <TimeOfDayFields />
              </Form.Item>
            </>
          )}

          {frequency === 'custom' && (
            <>
              <Form.Item
                name="cron_expr"
                label={t('scheduler.cronExpr')}
                rules={[{ required: true, message: t('scheduler.cronRequired') }]}
              >
                <Input placeholder="0 9 * * *" />
              </Form.Item>
              <Form.Item label={t('scheduler.nlToCron')}>
                <Space.Compact style={{ width: '100%' }}>
                  <Form.Item name="nl_text" noStyle>
                    <Input placeholder={t('scheduler.nlPlaceholder')} style={{ width: '100%' }} />
                  </Form.Item>
                  <Button
                    type="link"
                    loading={convertingCron}
                    onClick={() => void handleConvertNl()}
                  >
                    {t('scheduler.nlToCron')}
                  </Button>
                </Space.Compact>
              </Form.Item>
            </>
          )}

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
