import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Table, Tag, Select, DatePicker, Space, Typography, Collapse } from 'antd';
import type { TableProps } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { fetchLogs } from '../api';
import type { AppLog } from '../types';

const LEVEL_COLOR: Record<string, string> = {
  error: 'error',
  warn: 'warning',
  info: 'processing',
};

export function LogsTab() {
  const { t } = useTranslation();

  const [logs, setLogs] = useState<AppLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [filterDate, setFilterDate] = useState<string | undefined>(undefined);
  const [filterLevel, setFilterLevel] = useState<string | undefined>(undefined);
  const [filterSource, setFilterSource] = useState<string | undefined>(undefined);

  const LIMIT = 50;

  const load = useCallback(async (p: number, date?: string, level?: string, source?: string) => {
    setLoading(true);
    try {
      const res = await fetchLogs({ page: p, limit: LIMIT, date, level, source });
      setLogs(res.logs);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page, filterDate, filterLevel, filterSource);
  }, [load, page, filterDate, filterLevel, filterSource]);

  const handleDateChange = (d: Dayjs | null) => {
    setFilterDate(d ? d.format('YYYY-MM-DD') : undefined);
    setPage(1);
  };

  const columns: TableProps<AppLog>['columns'] = [
    {
      title: t('journal.logs.time'),
      dataIndex: 'created_at',
      width: 180,
      render: (v: number) => dayjs(v).format('MM-DD HH:mm:ss'),
    },
    {
      title: t('journal.logs.level'),
      dataIndex: 'level',
      width: 80,
      render: (v: string) => <Tag color={LEVEL_COLOR[v] ?? 'default'}>{v.toUpperCase()}</Tag>,
    },
    {
      title: t('journal.logs.source'),
      dataIndex: 'source',
      width: 90,
      render: (v: string) => (
        <Tag color={v === 'backend' ? 'purple' : 'cyan'}>
          {v === 'backend' ? t('journal.logs.sourceBackend') : t('journal.logs.sourceFrontend')}
        </Tag>
      ),
    },
    {
      title: t('journal.logs.message'),
      dataIndex: 'message',
      ellipsis: true,
    },
  ];

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* 筛选栏 */}
      <Space wrap>
        <DatePicker
          placeholder={t('journal.logs.filterDate')}
          onChange={handleDateChange}
          allowClear
        />
        <Select
          placeholder={t('journal.logs.filterLevel')}
          allowClear
          style={{ width: 140 }}
          onChange={(v) => {
            setFilterLevel(v);
            setPage(1);
          }}
          options={[
            { value: 'error', label: 'ERROR' },
            { value: 'warn', label: 'WARN' },
            { value: 'info', label: 'INFO' },
          ]}
        />
        <Select
          placeholder={t('journal.logs.filterSource')}
          allowClear
          style={{ width: 140 }}
          onChange={(v) => {
            setFilterSource(v);
            setPage(1);
          }}
          options={[
            { value: 'backend', label: t('journal.logs.sourceBackend') },
            { value: 'frontend', label: t('journal.logs.sourceFrontend') },
          ]}
        />
      </Space>

      {/* 日志表格 */}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={logs}
        loading={loading}
        size="small"
        pagination={{
          current: page,
          pageSize: LIMIT,
          total,
          onChange: setPage,
          showTotal: (t) => `共 ${t} 条`,
        }}
        expandable={{
          rowExpandable: (r) => r.context != null,
          expandedRowRender: (r) => (
            <Collapse
              size="small"
              ghost
              items={[
                {
                  key: 'ctx',
                  label: (
                    <Typography.Text type="secondary">{t('journal.logs.context')}</Typography.Text>
                  ),
                  children: (
                    <Typography.Text code className="text-xs whitespace-pre-wrap break-all">
                      {typeof r.context === 'string'
                        ? r.context
                        : JSON.stringify(r.context, null, 2)}
                    </Typography.Text>
                  ),
                },
              ]}
            />
          ),
        }}
      />
    </div>
  );
}
