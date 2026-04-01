import type { ReactNode } from 'react';
import { Modal } from 'antd';

const MODAL_WIDTH = 720;

const bodyStyle = {
  maxHeight: '75vh' as const,
  overflowY: 'auto' as const,
  paddingTop: 8,
};

export type McpServerFormModalProps = {
  open: boolean;
  title: string;
  onCancel: () => void;
  onOk: () => void;
  confirmLoading?: boolean;
  okText?: string;
  /** 弹窗宽度，默认与市场安装一致 */
  width?: number;
  children: ReactNode;
};

/**
 * MCP 表单弹窗外壳：宽度、正文滚动与市场「从市场安装」弹窗一致，供市场安装 / 已安装编辑等复用。
 */
export function McpServerFormModal({
  open,
  title,
  onCancel,
  onOk,
  confirmLoading,
  okText,
  width = MODAL_WIDTH,
  children,
}: McpServerFormModalProps) {
  return (
    <Modal
      title={title}
      width={width}
      styles={{ body: bodyStyle }}
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      confirmLoading={confirmLoading}
      okText={okText}
    >
      {children}
    </Modal>
  );
}
