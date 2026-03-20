import { useEffect, useState } from 'react';
import { Alert, Spin, Statistic, Typography, Row, Col, Card } from 'antd';
import { useTranslation } from 'react-i18next';
import { apiGet } from '../../api/base';

const { Title, Text } = Typography;

type Summary = { total_input?: number; total_output?: number; requests?: number };

export function TokenStatsPage() {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Summary>('/api/stats/tokens/summary')
      .then(setSummary)
      .catch((e) => setError(e instanceof Error ? e.message : t('tokenStats.loadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

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
      <Title level={4} style={{ marginBottom: 4 }}>
        {t('tokenStats.title')}
      </Title>
      <Text type="secondary">{t('tokenStats.subtitle')}</Text>

      {error && <Alert type="error" message={error} className="mt-3" showIcon />}

      {summary && (
        <Row gutter={16} className="mt-6">
          <Col span={8}>
            <Card size="small">
              <Statistic title="输入 Token" value={summary.total_input ?? 0} />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small">
              <Statistic title="输出 Token" value={summary.total_output ?? 0} />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small">
              <Statistic title="请求数" value={summary.requests ?? 0} />
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
}
