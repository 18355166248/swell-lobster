import { Modal } from 'antd';

export type DialogSize = '1' | '2' | '3' | '4';

const sizeWidthMap: Record<DialogSize, number> = {
  '1': 400,
  '2': 520,
  '3': 640,
  '4': 800,
};

export type SharedDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: DialogSize;
  showClose?: boolean;
  contentClassName?: string;
};

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
    <Modal
      open={open}
      onCancel={() => onOpenChange(false)}
      title={title}
      footer={footer ?? null}
      width={sizeWidthMap[size]}
      closable={showClose}
      destroyOnHidden
      styles={{
        body: { maxHeight: '70vh', overflowY: 'auto' },
      }}
      className={contentClassName}
    >
      {description && <p className="text-sm text-muted-foreground mb-3">{description}</p>}
      {children}
    </Modal>
  );
}
