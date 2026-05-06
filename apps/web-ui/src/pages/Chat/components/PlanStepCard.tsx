import { Tag, Typography, Collapse } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  ClockCircleOutlined,
  MinusCircleOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { PlanStepState } from '../types';

const { Text, Paragraph } = Typography;

const STATUS_ICON: Record<PlanStepState['status'], React.ReactNode> = {
  pending: <ClockCircleOutlined style={{ color: '#8c8c8c' }} />,
  running: <LoadingOutlined style={{ color: '#1677ff' }} spin />,
  completed: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
  failed: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
  skipped: <MinusCircleOutlined style={{ color: '#d9d9d9' }} />,
};

const STATUS_COLOR: Record<PlanStepState['status'], string> = {
  pending: 'default',
  running: 'processing',
  completed: 'success',
  failed: 'error',
  skipped: 'default',
};

interface PlanStepCardProps {
  step: PlanStepState;
  index: number;
}

export function PlanStepCard({ step, index }: PlanStepCardProps) {
  const { t } = useTranslation();

  const statusLabel: Record<PlanStepState['status'], string> = {
    pending: t('plan.stepStatusPending'),
    running: t('plan.stepStatusRunning'),
    completed: t('plan.stepStatusCompleted'),
    failed: t('plan.stepStatusFailed'),
    skipped: t('plan.stepStatusSkipped'),
  };

  const header = (
    <div className="flex items-center gap-2">
      {STATUS_ICON[step.status]}
      <Text strong>
        {index + 1}. {step.title}
      </Text>
      <Tag color={STATUS_COLOR[step.status]}>{statusLabel[step.status]}</Tag>
      {step.mode === 'delegate_agent' && (
        <Tag icon={<RobotOutlined />} color="purple">
          {t('plan.modeDelegateAgent')}
        </Tag>
      )}
    </div>
  );

  return (
    <div
      className={
        step.status === 'failed'
          ? 'rounded-lg border border-red-200 bg-red-50/70'
          : 'rounded-lg border border-transparent'
      }
    >
      <Collapse
        size="small"
        ghost
        items={[
          {
            key: step.id,
            label: header,
            children: (
              <div className="pl-6 space-y-2">
                <Paragraph type="secondary" className="mb-1 text-sm">
                  {step.description}
                </Paragraph>
                <div className="flex items-center gap-2 flex-wrap">
                  {typeof step.durationMs === 'number' && (
                    <Tag color="blue">
                      {t('plan.stepDuration')}:{' '}
                      {(step.durationMs / 1000).toFixed(step.durationMs >= 10_000 ? 0 : 1)}s
                    </Tag>
                  )}
                  {step.mode === 'delegate_agent' && (
                    <Tag icon={<RobotOutlined />} color="purple">
                      {t('plan.modeDelegateAgent')}
                    </Tag>
                  )}
                </div>
                {step.outputSummary && (
                  <div>
                    <Text type="secondary" className="text-xs">
                      输出：
                    </Text>
                    <Paragraph className="text-sm mt-1 bg-gray-50 dark:bg-gray-800 rounded p-2 mb-0">
                      {step.outputSummary}
                    </Paragraph>
                  </div>
                )}
                {step.errorMessage && (
                  <Paragraph type="danger" className="text-sm mb-0">
                    错误：{step.errorMessage}
                  </Paragraph>
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
