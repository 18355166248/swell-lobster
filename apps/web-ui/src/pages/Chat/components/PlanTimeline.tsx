import { Badge, Typography } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { PlanState } from '../types';
import { PlanStepCard } from './PlanStepCard';

const { Text, Title } = Typography;

interface PlanTimelineProps {
  plan: PlanState;
}

export function PlanTimeline({ plan }: PlanTimelineProps) {
  const { t } = useTranslation();

  const statusBadge = {
    draft: <Badge status="default" text={t('plan.statusDraft')} />,
    running: <Badge status="processing" text={t('plan.statusRunning')} />,
    completed: (
      <Badge
        status="success"
        text={
          <span className="flex items-center gap-1">
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            {t('plan.statusCompleted')}
          </span>
        }
      />
    ),
    failed: (
      <Badge
        status="error"
        text={
          <span className="flex items-center gap-1">
            <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
            {t('plan.statusFailed')}
          </span>
        }
      />
    ),
    cancelled: <Badge status="default" text={t('plan.statusCancelled')} />,
  };

  const runningCount = plan.steps.filter((s) => s.status === 'running').length;
  const completedCount = plan.steps.filter((s) => s.status === 'completed').length;

  return (
    <div className="border border-border rounded-lg p-4 my-2 bg-bg-subtle">
      <div className="flex items-start gap-2 mb-3">
        {plan.status === 'running' ? (
          <LoadingOutlined style={{ color: '#1677ff', marginTop: 3 }} />
        ) : (
          <BulbOutlined style={{ color: '#faad14', marginTop: 3 }} />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Title level={5} style={{ margin: 0 }}>
              {t('plan.title')}
            </Title>
            {statusBadge[plan.status]}
          </div>
          <Text type="secondary" className="text-sm block mt-1">
            {plan.goal}
          </Text>
          <Text type="secondary" className="text-xs mt-1 block">
            {completedCount}/{plan.steps.length} {t('plan.stepOf', { total: plan.steps.length })}
            {runningCount > 0 && ` · 执行中：${runningCount}`}
          </Text>
        </div>
      </div>

      <div className="space-y-1">
        {plan.steps.map((step, i) => (
          <PlanStepCard key={step.id} step={step} index={i} />
        ))}
      </div>
    </div>
  );
}
