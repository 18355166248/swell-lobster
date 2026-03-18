import { Dialog } from '@radix-ui/themes';

export type DialogSize = '1' | '2' | '3' | '4';

export type SharedDialogProps = {
  /** 是否打开 */
  open: boolean;
  /** 打开状态变化回调 */
  onOpenChange: (open: boolean) => void;
  /** 标题 */
  title: string;
  /** 可选描述，不传则不会渲染 Description */
  description?: string;
  /** 弹窗主体内容 */
  children: React.ReactNode;
  /** 底部区域（如按钮组），可选 */
  footer?: React.ReactNode;
  /** 尺寸：1 最小，4 最大，默认 3 */
  size?: DialogSize;
  /** 是否显示关闭按钮（在标题右侧），默认 true */
  showClose?: boolean;
  /** Content 的 className，用于覆盖样式 */
  contentClassName?: string;
};

/**
 * 基于 @radix-ui/themes Dialog 的公共弹窗组件。
 * 受控用法：由外部通过 open / onOpenChange 控制开关。
 */
export function SharedDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = '3',
  showClose = true,
  contentClassName,
}: SharedDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content
        size={size}
        className={`shared-dialog-content ${contentClassName ?? ''}`.trim()}
        aria-describedby={description ? undefined : undefined}
      >
        <div className="shared-dialog-header">
          <Dialog.Title className="shared-dialog-title">{title}</Dialog.Title>
          {showClose && (
            <Dialog.Close className="shared-dialog-close" aria-label="关闭">
              <span>×</span>
            </Dialog.Close>
          )}
        </div>
        {description && (
          <Dialog.Description className="shared-dialog-description">
            {description}
          </Dialog.Description>
        )}
        <div className="shared-dialog-body">{children}</div>
        {footer != null && <div className="shared-dialog-footer">{footer}</div>}
      </Dialog.Content>
    </Dialog.Root>
  );
}
