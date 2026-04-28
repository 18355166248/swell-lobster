import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  Badge,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Button,
  List,
  Popconfirm,
  Tag,
  Typography,
  Space,
  Empty,
} from 'antd';
import type { CalendarProps } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import {
  fetchJournalMonth,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
} from '../api';
import type { JournalEntry } from '../types';

const { TextArea } = Input;

interface JournalTabProps {
  /** 当前选中年份 */
  year: number;
  month: number;
  onDateChange: (year: number, month: number) => void;
}

export function JournalTab({ year, month, onDateChange }: JournalTabProps) {
  const { t } = useTranslation();

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [datesWithEntries, setDatesWithEntries] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<string>(dayjs().format('YYYY-MM-DD'));
  const [loading, setLoading] = useState(false);

  // 弹窗状态
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [form] = Form.useForm();

  const loadMonth = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try {
      const res = await fetchJournalMonth(y, m);
      setEntries(res.entries);
      setDatesWithEntries(new Set(res.datesWithEntries));
    } finally {
      setLoading(false);
    }
  }, []);

  // 初始加载和月份切换
  useEffect(() => {
    loadMonth(year, month);
  }, [loadMonth, year, month]);

  const handlePanelChange = (value: Dayjs) => {
    const y = value.year();
    const m = value.month() + 1;
    onDateChange(y, m);
    loadMonth(y, m);
  };

  const handleSelect = (date: Dayjs) => {
    setSelectedDate(date.format('YYYY-MM-DD'));
  };

  const fullCellRender: CalendarProps<Dayjs>['fullCellRender'] = (current, info) => {
    if (info.type !== 'date') return <div className="ant-picker-cell-inner">{info.originNode}</div>;
    const dateStr = current.format('YYYY-MM-DD');
    const hasEntry = datesWithEntries.has(dateStr);
    return (
      <div className="ant-picker-cell-inner ant-picker-calendar-date">
        <div className="ant-picker-calendar-date-value relative">
          {current.date()}
          {hasEntry && (
            <Badge status="processing" className="absolute left-1/2 -translate-x-1/2 top-5" />
          )}
        </div>
        <div className="ant-picker-calendar-date-content" />
      </div>
    );
  };

  const dayEntries = entries.filter((e) => e.entry_date === selectedDate);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ entry_date: dayjs(selectedDate), mood: undefined });
    setModalOpen(true);
  };

  const openEdit = (entry: JournalEntry) => {
    setEditing(entry);
    form.setFieldsValue({
      title: entry.title,
      content: entry.content,
      category: entry.category,
      tags: entry.tags,
      entry_date: dayjs(entry.entry_date),
      mood: entry.mood,
      weather: entry.weather,
      location: entry.location,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const data = {
      ...values,
      entry_date: (values.entry_date as Dayjs).format('YYYY-MM-DD'),
      tags: values.tags ?? [],
      mood: values.mood ?? undefined,
      weather: values.weather ?? undefined,
      location: values.location ?? undefined,
    };
    if (editing) {
      await updateJournalEntry(editing.id, data);
    } else {
      await createJournalEntry(data);
    }
    setModalOpen(false);
    await loadMonth(year, month);
  };

  const handleDelete = async (id: number) => {
    await deleteJournalEntry(id);
    await loadMonth(year, month);
  };

  return (
    <div className="flex gap-4 h-full">
      {/* 日历 */}
      <div className="w-80 flex-shrink-0 border border-border rounded-xl overflow-hidden bg-background">
        <Calendar
          fullscreen={false}
          onPanelChange={handlePanelChange}
          onSelect={handleSelect}
          fullCellRender={fullCellRender}
        />
      </div>

      {/* 当天条目列表 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <Typography.Text strong className="text-base">
            {selectedDate}
          </Typography.Text>
          <Button type="primary" size="small" onClick={openCreate}>
            {t('journal.newEntry')}
          </Button>
        </div>

        {loading ? null : dayEntries.length === 0 ? (
          <Empty description={t('journal.noEntries')} className="mt-8" />
        ) : (
          <List
            dataSource={dayEntries}
            renderItem={(entry) => (
              <List.Item className="!px-0 !py-0 !border-none mb-2">
                <div className="w-full px-4 py-3 rounded-xl border border-border bg-background hover:bg-muted/30 transition-colors">
                  {/* 操作按钮 */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {/* 第一行：标题 */}
                      <div className="flex items-center gap-2 mb-1">
                        {entry.mood && (
                          <span className="text-base leading-none flex-shrink-0">
                            {entry.mood === 'happy' && '😊'}
                            {entry.mood === 'sad' && '😢'}
                            {entry.mood === 'neutral' && '😐'}
                            {entry.mood === 'excited' && '🤩'}
                            {entry.mood === 'anxious' && '😰'}
                            {entry.mood === 'calm' && '😌'}
                            {entry.mood === 'angry' && '😠'}
                          </span>
                        )}
                        <span className="font-medium text-sm truncate">
                          {entry.title || (
                            <span className="text-muted-foreground italic font-normal">
                              {t('journal.noTitle')}
                            </span>
                          )}
                        </span>
                      </div>
                      {/* 第二行：分类 + 标签 */}
                      {(entry.category || entry.tags.length > 0) && (
                        <div className="flex flex-wrap gap-1 mb-1">
                          {entry.category && (
                            <Tag color="blue" className="!text-xs !m-0">
                              {entry.category}
                            </Tag>
                          )}
                          {entry.tags.map((tag) => (
                            <Tag key={tag} className="!text-xs !m-0">
                              {tag}
                            </Tag>
                          ))}
                        </div>
                      )}
                      {/* 第三行：内容预览 */}
                      {entry.content && (
                        <Typography.Paragraph
                          ellipsis={{ rows: 2 }}
                          className="!text-xs !text-muted-foreground !mb-0 !mt-0.5"
                        >
                          {entry.content}
                        </Typography.Paragraph>
                      )}
                    </div>
                    {/* 操作按钮 */}
                    <Space size={0} className="flex-shrink-0">
                      <Button size="small" type="text" onClick={() => openEdit(entry)}>
                        {t('common.edit')}
                      </Button>
                      <Popconfirm
                        title={t('journal.deleteConfirm')}
                        onConfirm={() => handleDelete(entry.id)}
                      >
                        <Button size="small" type="text" danger>
                          {t('common.delete')}
                        </Button>
                      </Popconfirm>
                    </Space>
                  </div>
                </div>
              </List.Item>
            )}
          />
        )}
      </div>

      {/* 新建/编辑弹窗 */}
      <Modal
        open={modalOpen}
        title={editing ? t('journal.editEntry') : t('journal.newEntry')}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={560}
      >
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item name="entry_date" label={t('journal.fields.entryDate')}>
            <DatePicker className="w-full" />
          </Form.Item>

          <Form.Item name="mood" label={t('journal.fields.mood')}>
            <Select placeholder={t('journal.fields.moodPlaceholder')} allowClear>
              <Select.Option value="happy">😊 {t('journal.moods.happy')}</Select.Option>
              <Select.Option value="sad">😢 {t('journal.moods.sad')}</Select.Option>
              <Select.Option value="neutral">😐 {t('journal.moods.neutral')}</Select.Option>
              <Select.Option value="excited">🤩 {t('journal.moods.excited')}</Select.Option>
              <Select.Option value="anxious">😰 {t('journal.moods.anxious')}</Select.Option>
              <Select.Option value="calm">😌 {t('journal.moods.calm')}</Select.Option>
              <Select.Option value="angry">😠 {t('journal.moods.angry')}</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="title" label={t('journal.fields.title')}>
            <Input placeholder={t('journal.fields.title')} />
          </Form.Item>
          <Form.Item name="content" label={t('journal.fields.content')}>
            <TextArea rows={6} placeholder={t('journal.fields.content')} />
          </Form.Item>
          <div className="flex gap-3">
            <Form.Item name="category" label={t('journal.fields.category')} className="flex-1">
              <Input placeholder={t('journal.fields.category')} />
            </Form.Item>
            <Form.Item name="tags" label={t('journal.fields.tags')} className="flex-1">
              <Select mode="tags" placeholder={t('journal.fields.tags')} tokenSeparators={[',']} />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
