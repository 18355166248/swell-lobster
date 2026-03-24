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
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { useTranslation } from 'react-i18next';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../api/base';

const { Title, Text } = Typography;
const { Search } = Input;

type MemoryType = 'fact' | 'preference' | 'event' | 'rule';

type MemoryItem = {
  id: string;
  content: string;
  memory_type: MemoryType;
  source_session_id?: string;
  tags: string[];
  importance: number;
  access_count: number;
  created_at: string;
  updated_at: string;
  expires_at?: string;
};

type MemoryFormValues = {
  content: string;
  memory_type: MemoryType;
  importance: number;
  tagsText?: string;
};

export function MemoryPage() {
  const { t } = useTranslation();
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | MemoryType>('all');
  const [keyword, setKeyword] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MemoryItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<MemoryFormValues>();

  const loadMemories = async (query?: { type?: MemoryType; keyword?: string }) => {
    setLoading(true);
    setError(null);
    try {
      if (query?.keyword?.trim()) {
        const params = new URLSearchParams({
          q: query.keyword.trim(),
          limit: '100',
        });
        const data = await apiGet<{ memories: MemoryItem[] }>(`/api/memories/search?${params}`);
        setMemories(data.memories ?? []);
        return;
      }

      const params = new URLSearchParams();
      if (query?.type) params.set('type', query.type);
      params.set('limit', '100');
      const data = await apiGet<{ memories: MemoryItem[] }>(
        `/api/memories${params.size > 0 ? `?${params.toString()}` : ''}`
      );
      setMemories(data.memories ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('memory.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMemories();
    // 初始加载只需要跑一次；筛选和搜索走显式动作触发，避免输入时频繁请求。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  const memoryTypeOptions = useMemo(
    () => [
      { value: 'fact' as const, label: t('memory.types.fact') },
      { value: 'preference' as const, label: t('memory.types.preference') },
      { value: 'event' as const, label: t('memory.types.event') },
      { value: 'rule' as const, label: t('memory.types.rule') },
    ],
    [t]
  );

  const openCreateModal = () => {
    setEditing(null);
    form.setFieldsValue({
      content: '',
      memory_type: 'fact',
      importance: 5,
      tagsText: '',
    });
    setModalOpen(true);
  };

  const openEditModal = (memory: MemoryItem) => {
    setEditing(memory);
    form.setFieldsValue({
      content: memory.content,
      memory_type: memory.memory_type,
      importance: memory.importance,
      tagsText: memory.tags.join(', '),
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const payload = {
      content: values.content.trim(),
      memory_type: values.memory_type,
      importance: values.importance,
      tags: (values.tagsText ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    };

    setSaving(true);
    try {
      if (editing) {
        await apiPatch(`/api/memories/${editing.id}`, {
          content: payload.content,
          importance: payload.importance,
          tags: payload.tags,
        });
      } else {
        await apiPost('/api/memories', payload);
      }
      setModalOpen(false);
      await loadMemories({
        type: filterType === 'all' ? undefined : filterType,
        keyword,
      });
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (memoryId: string) => {
    await apiDelete(`/api/memories/${memoryId}`);
    await loadMemories({
      type: filterType === 'all' ? undefined : filterType,
      keyword,
    });
  };

  const handleClearAll = async () => {
    await apiDelete('/api/memories?confirm=true');
    await loadMemories();
  };

  const applyFilters = async (nextType: 'all' | MemoryType, nextKeyword: string) => {
    setFilterType(nextType);
    setKeyword(nextKeyword);
    await loadMemories({
      type: nextType === 'all' ? undefined : nextType,
      keyword: nextKeyword,
    });
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2">
        <Spin size="small" />
        <Text type="secondary">{t('common.loading')}</Text>
      </div>
    );
  }

  return (
    <div className="p-6">
      {contextHolder}
      <Title level={4} style={{ marginBottom: 4 }}>
        {t('memory.title')}
      </Title>
      <Text type="secondary">{t('memory.subtitle')}</Text>

      {error && <Alert type="error" message={error} className="mt-3" showIcon />}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Space wrap>
          <Button
            type={filterType === 'all' ? 'primary' : 'default'}
            onClick={() => void applyFilters('all', keyword)}
          >
            {t('common.all')}
          </Button>
          {memoryTypeOptions.map((option) => (
            <Button
              key={option.value}
              type={filterType === option.value ? 'primary' : 'default'}
              onClick={() => void applyFilters(option.value, keyword)}
            >
              {option.label}
            </Button>
          ))}
        </Space>
        <Space wrap>
          <Search
            allowClear
            placeholder={t('memory.searchPlaceholder')}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onSearch={(value) => void applyFilters(filterType, value)}
            style={{ width: 280 }}
          />
          <Button type="primary" onClick={openCreateModal}>
            {t('memory.addMemory')}
          </Button>
          <Popconfirm
            title={t('memory.clearAll')}
            description={t('memory.clearConfirm')}
            onConfirm={() => void handleClearAll()}
          >
            <Button danger>{t('memory.clearAll')}</Button>
          </Popconfirm>
        </Space>
      </div>

      <div className="mt-6 rounded border border-border bg-background">
        <Table<MemoryItem>
          rowKey="id"
          dataSource={memories}
          pagination={false}
          locale={{ emptyText: t('memory.noMemories') }}
          columns={[
            {
              title: t('memory.content'),
              dataIndex: 'content',
              key: 'content',
              render: (_, record) => (
                <div>
                  <div>{record.content}</div>
                  {record.tags.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {record.tags.map((tag) => (
                        <Tag key={tag}>{tag}</Tag>
                      ))}
                    </div>
                  ) : null}
                </div>
              ),
            },
            {
              title: t('memory.type'),
              dataIndex: 'memory_type',
              key: 'memory_type',
              width: 120,
              render: (value: MemoryType) => {
                const label =
                  memoryTypeOptions.find((item) => item.value === value)?.label ?? value;
                return <Tag color="blue">{label}</Tag>;
              },
            },
            {
              title: t('memory.importance'),
              dataIndex: 'importance',
              key: 'importance',
              width: 110,
            },
            {
              title: t('common.date'),
              dataIndex: 'created_at',
              key: 'created_at',
              width: 200,
              render: (value: string) => new Date(value).toLocaleString(),
            },
            {
              title: t('common.actions'),
              key: 'actions',
              width: 160,
              render: (_, record) => (
                <Space>
                  <Button size="small" onClick={() => openEditModal(record)}>
                    {t('common.edit')}
                  </Button>
                  <Popconfirm
                    title={t('common.delete')}
                    description={t('memory.deleteConfirm')}
                    onConfirm={() => void handleDelete(record.id)}
                  >
                    <Button danger size="small">
                      {t('common.delete')}
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </div>

      <Modal
        title={editing ? t('memory.editMemory') : t('memory.addMemory')}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void handleSubmit()}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="content"
            label={t('memory.content')}
            rules={[{ required: true, message: t('memory.contentRequired') }]}
          >
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="memory_type" label={t('memory.type')} rules={[{ required: true }]}>
            <Select options={memoryTypeOptions} />
          </Form.Item>
          <Form.Item name="importance" label={t('memory.importance')} rules={[{ required: true }]}>
            <InputNumber min={1} max={10} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="tagsText" label={t('memory.tags')}>
            <Input placeholder={t('memory.tagsPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
