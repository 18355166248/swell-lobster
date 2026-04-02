import { Button, Popconfirm, Space, Tooltip } from 'antd';
import type { ButtonProps } from 'antd';
import type { ReactNode } from 'react';

export interface TableActionItem {
  /** 唯一标识，用作 key */
  key: string;
  /** 按钮图标 */
  icon: ReactNode;
  /** Tooltip 提示文字 */
  tooltip: string;
  /** 点击回调（与 popconfirm 二选一） */
  onClick?: () => void;
  /** 按钮类型 */
  type?: ButtonProps['type'];
  /** 危险样式 */
  danger?: boolean;
  /** 禁用 */
  disabled?: boolean;
  /** 加载中 */
  loading?: boolean;
  /** 为 true 时不渲染该按钮 */
  hidden?: boolean;
  /** 配置后包裹 Popconfirm，点击需确认 */
  popconfirm?: {
    title: string;
    description?: string;
    onConfirm: () => void;
    okText?: string;
    cancelText?: string;
  };
}

interface TableActionsProps {
  actions: TableActionItem[];
}

export function TableActions({ actions }: TableActionsProps) {
  return (
    <Space size={4}>
      {actions.map((action) => {
        if (action.hidden) return null;

        const btn = (
          <Tooltip key={action.key} title={action.tooltip}>
            <Button
              type={action.type ?? 'text'}
              size="small"
              icon={action.icon}
              danger={action.danger}
              disabled={action.disabled}
              loading={action.loading}
              onClick={action.popconfirm ? undefined : action.onClick}
            />
          </Tooltip>
        );

        if (action.popconfirm) {
          return (
            <Popconfirm
              key={action.key}
              title={action.popconfirm.title}
              description={action.popconfirm.description}
              onConfirm={action.popconfirm.onConfirm}
              okText={action.popconfirm.okText}
              cancelText={action.popconfirm.cancelText}
              disabled={action.disabled}
            >
              {btn}
            </Popconfirm>
          );
        }

        return btn;
      })}
    </Space>
  );
}
