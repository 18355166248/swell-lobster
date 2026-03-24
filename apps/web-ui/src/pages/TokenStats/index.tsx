import { useEffect, useState } from 'react';
import { Alert, Card, Col, Row, Skeleton, Statistic, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';

import { apiGet } from '../../api/base';

import styles from './TokenStats.module.css';

const { Title, Text } = Typography;

type PeriodStat = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  request_count: number;
};

type SummaryResponse = {
  today: PeriodStat;
  thisWeek: PeriodStat;
  thisMonth: PeriodStat;
  total: PeriodStat;
};

type EndpointStat = {
  endpoint_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  request_count: number;
  updated_at?: string | null;
};

type DailyStat = {
  date: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  request_count: number;
};

type SummaryPeriodKey = keyof Pick<SummaryResponse, 'today' | 'thisWeek' | 'thisMonth' | 'total'>;

const SUMMARY_PERIODS: { periodKey: SummaryPeriodKey; titleKey: string }[] = [
  { periodKey: 'today', titleKey: 'tokenStats.today' },
  { periodKey: 'thisWeek', titleKey: 'tokenStats.thisWeek' },
  { periodKey: 'thisMonth', titleKey: 'tokenStats.thisMonth' },
  { periodKey: 'total', titleKey: 'tokenStats.total' },
];

/** 与后端数值展示一致（千分位）；若要做多语言可再接入 locale。 */
function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value);
}

export function TokenStatsPage() {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [endpointStats, setEndpointStats] = useState<EndpointStat[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 并行拉取三块数据；卸载时 cancelled 防止 setState 竞态。
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [summaryData, endpointData, dailyData] = await Promise.all([
          apiGet<SummaryResponse>('/api/stats/tokens'),
          apiGet<EndpointStat[]>('/api/stats/tokens/by-endpoint'),
          apiGet<DailyStat[]>('/api/stats/tokens/daily'),
        ]);
        if (cancelled) return;
        setSummary(summaryData);
        setEndpointStats(endpointData);
        setDailyStats(dailyData);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : t('tokenStats.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const endpointColumns: ColumnsType<EndpointStat> = [
    {
      title: t('tokenStats.byEndpoint'),
      dataIndex: 'endpoint_name',
      key: 'endpoint_name',
      render: (value: string) => value || 'unknown',
    },
    {
      title: t('tokenStats.tokens'),
      dataIndex: 'total_tokens',
      key: 'total_tokens',
      align: 'right',
      render: (value: number) => formatNumber(value),
    },
    {
      title: 'Prompt',
      dataIndex: 'prompt_tokens',
      key: 'prompt_tokens',
      align: 'right',
      render: (value: number) => formatNumber(value),
    },
    {
      title: 'Completion',
      dataIndex: 'completion_tokens',
      key: 'completion_tokens',
      align: 'right',
      render: (value: number) => formatNumber(value),
    },
    {
      title: t('tokenStats.requests'),
      dataIndex: 'request_count',
      key: 'request_count',
      align: 'right',
      render: (value: number) => formatNumber(value),
    },
  ];

  const dailyColumns: ColumnsType<DailyStat> = [
    {
      title: t('common.date'),
      dataIndex: 'date',
      key: 'date',
    },
    {
      title: t('tokenStats.tokens'),
      dataIndex: 'total_tokens',
      key: 'total_tokens',
      align: 'right',
      render: (value: number) => formatNumber(value),
    },
    {
      title: t('tokenStats.requests'),
      dataIndex: 'request_count',
      key: 'request_count',
      align: 'right',
      render: (value: number) => formatNumber(value),
    },
  ];

  return (
    <div className={`p-6 ${styles.page}`}>
      <Title level={4} className={styles.heroTitle} style={{ marginBottom: 4 }}>
        {t('tokenStats.title')}
      </Title>
      <Text type="secondary">{t('tokenStats.subtitle')}</Text>

      {error && <Alert type="error" message={error} className="mt-3" showIcon />}

      {(loading || summary) && (
        <div className={`${styles.statStrip} mt-6`}>
          <Row gutter={[16, 16]}>
            {SUMMARY_PERIODS.map(({ periodKey, titleKey }) => {
              const period = summary?.[periodKey];
              return (
                <Col xs={24} sm={12} xl={6} key={periodKey}>
                  <Card size="small" className={styles.statCard}>
                    <Statistic
                      loading={loading}
                      title={t(titleKey)}
                      value={period?.total_tokens ?? 0}
                      suffix={t('tokenStats.tokens')}
                      formatter={(value) => formatNumber(Number(value))}
                    />
                    {loading ? (
                      <Skeleton
                        active
                        title={false}
                        paragraph={{ rows: 1, width: ['60%'] }}
                        className="mt-1"
                      />
                    ) : period ? (
                      <Text type="secondary">
                        {t('tokenStats.requests')} {formatNumber(period.request_count)}
                      </Text>
                    ) : null}
                  </Card>
                </Col>
              );
            })}
          </Row>
        </div>
      )}

      <Card className={`mt-6 ${styles.tableCard}`} title={t('tokenStats.byEndpoint')}>
        <Table
          rowKey="endpoint_name"
          columns={endpointColumns}
          dataSource={endpointStats}
          pagination={false}
          loading={loading}
          locale={{ emptyText: t('common.noData') }}
        />
      </Card>

      <Card className={`mt-6 ${styles.tableCard}`} title={t('tokenStats.dailyTrend')}>
        <Table
          rowKey="date"
          columns={dailyColumns}
          dataSource={dailyStats}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          loading={loading}
          locale={{ emptyText: t('common.noData') }}
        />
      </Card>
    </div>
  );
}
