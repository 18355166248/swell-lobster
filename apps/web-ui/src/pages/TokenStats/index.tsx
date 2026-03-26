import { useEffect, useMemo, useState } from 'react';
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
  cost_usd: number;
};

type SummaryResponse = {
  pricing_configured: boolean;
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
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
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

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
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

  const showPricing = summary?.pricing_configured === true;

  const endpointColumns: ColumnsType<EndpointStat> = useMemo(() => {
    const cols: ColumnsType<EndpointStat> = [
      {
        title: t('tokenStats.byEndpoint'),
        dataIndex: 'endpoint_name',
        key: 'endpoint_name',
        render: (value: string) => value || 'unknown',
      },
      {
        title: t('tokenStats.requests'),
        dataIndex: 'request_count',
        key: 'request_count',
        align: 'right',
        render: (value: number) => formatNumber(value),
      },
      {
        title: t('tokenStats.promptCol'),
        dataIndex: 'prompt_tokens',
        key: 'prompt_tokens',
        align: 'right',
        render: (value: number) => formatNumber(value),
      },
      {
        title: t('tokenStats.completionCol'),
        dataIndex: 'completion_tokens',
        key: 'completion_tokens',
        align: 'right',
        render: (value: number) => formatNumber(value),
      },
      {
        title: t('tokenStats.cacheRead'),
        dataIndex: 'cache_read_tokens',
        key: 'cache_read_tokens',
        align: 'right',
        render: (value: number) => formatNumber(value),
      },
      {
        title: t('tokenStats.cacheWrite'),
        dataIndex: 'cache_write_tokens',
        key: 'cache_write_tokens',
        align: 'right',
        render: (value: number) => formatNumber(value),
      },
      {
        title: t('tokenStats.tokens'),
        dataIndex: 'total_tokens',
        key: 'total_tokens',
        align: 'right',
        render: (value: number) => formatNumber(value),
      },
    ];
    if (showPricing) {
      cols.push({
        title: t('tokenStats.costUsd'),
        dataIndex: 'cost_usd',
        key: 'cost_usd',
        align: 'right',
        render: (value: number) => formatUsd(value),
      });
    }
    return cols;
  }, [showPricing, t]);

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

      {error && <Alert type="error" title={error} className="mt-3" showIcon />}

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
                      <div className="mt-1 space-y-0.5">
                        <Text type="secondary">
                          {t('tokenStats.requests')} {formatNumber(period.request_count)}
                        </Text>
                        {showPricing ? (
                          <div>
                            <Text type="secondary">
                              {t('tokenStats.costUsd')} {formatUsd(period.cost_usd ?? 0)}
                            </Text>
                          </div>
                        ) : null}
                      </div>
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
          scroll={{ x: showPricing ? 1100 : 960 }}
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
