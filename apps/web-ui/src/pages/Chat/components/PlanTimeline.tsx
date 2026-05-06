import { Badge, Typography } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  BulbOutlined,
  FieldTimeOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  WarningOutlined,
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
  const formatMs = (value: number) => `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}s`;
  const metricItems = [
    {
      key: 'planning',
      label: t('plan.metricsPlanning'),
      value: formatMs(plan.metrics.planningDurationMs),
      icon: <FieldTimeOutlined style={{ color: '#1677ff' }} />,
    },
    {
      key: 'execution',
      label: t('plan.metricsExecution'),
      value: formatMs(plan.metrics.executionDurationMs),
      icon: <LoadingOutlined style={{ color: '#13a8a8' }} />,
    },
    {
      key: 'total',
      label: t('plan.metricsTotal'),
      value: formatMs(plan.metrics.totalDurationMs),
      icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
    },
    {
      key: 'delegates',
      label: t('plan.metricsDelegates'),
      value: String(plan.metrics.delegateCount),
      icon: <RobotOutlined style={{ color: '#722ed1' }} />,
    },
    {
      key: 'approvals',
      label: t('plan.metricsApprovals'),
      value:
        plan.metrics.approvalWaitCount > 0
          ? `${plan.metrics.approvalWaitCount} · ${formatMs(plan.metrics.approvalWaitDurationMs)}`
          : '0',
      icon: <SafetyCertificateOutlined style={{ color: '#fa8c16' }} />,
    },
  ];

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

      <div className="rounded-lg border border-slate-200/80 bg-white/85 px-3 py-3 mb-3">
        <div className="flex items-center gap-2 mb-3">
          <FieldTimeOutlined style={{ color: '#1677ff' }} />
          <Text strong className="text-sm">
            {t('plan.metricsTitle')}
          </Text>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {metricItems.map((item) => (
            <div
              key={item.key}
              className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <div className="flex items-center gap-2 text-xs text-slate-500">
                {item.icon}
                <span>{item.label}</span>
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-800">{item.value}</div>
            </div>
          ))}
        </div>
        {plan.metrics.failedStepTitle && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <div className="flex items-center gap-2 font-medium">
              <WarningOutlined />
              <span>{t('plan.metricsFailedStep')}</span>
            </div>
            <div className="mt-1">
              {plan.metrics.failedStepOrder !== null && plan.metrics.failedStepOrder !== undefined
                ? `${plan.metrics.failedStepOrder + 1}. `
                : ''}
              {plan.metrics.failedStepTitle}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1">
        {plan.steps.map((step, i) => (
          <PlanStepCard key={step.id} step={step} index={i} />
        ))}
      </div>
    </div>
  );
}
