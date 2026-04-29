import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, Tabs } from 'antd';
import { apiGet } from '../../../api/base';
import type { AgentTemplate } from '../types';

interface TemplatePickerModalProps {
  open: boolean;
  onCancel: () => void;
  onSelect: (templateId: string | null) => void;
}

export function TemplatePickerModal({ open, onCancel, onSelect }: TemplatePickerModalProps) {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await apiGet<{ templates: AgentTemplate[] }>('/api/agent-templates');
      setTemplates(res.templates);
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        void loadTemplates();
      });
    }
  }, [open]);

  const categories = Array.from(new Set(templates.map((t) => t.category)));
  const filteredTemplates = selectedCategory
    ? templates.filter((t) => t.category === selectedCategory)
    : templates;

  return (
    <Modal
      title={t('chat.selectTemplate')}
      open={open}
      onCancel={onCancel}
      footer={<Button onClick={() => onSelect(null)}>{t('chat.skipTemplate')}</Button>}
      width={640}
    >
      <Tabs
        activeKey={selectedCategory ?? 'all'}
        onChange={(key) => setSelectedCategory(key === 'all' ? null : key)}
        items={[
          { key: 'all', label: t('common.all') },
          ...categories.map((cat) => ({ key: cat, label: cat })),
        ]}
      />

      <div className="grid grid-cols-2 gap-3 mt-4">
        {filteredTemplates.map((template) => (
          <button
            key={template.id}
            type="button"
            className="rounded-lg border border-border p-4 text-left hover:border-primary hover:bg-accent/30 transition-colors cursor-pointer bg-transparent"
            onClick={() => onSelect(template.id)}
          >
            <div className="flex items-center gap-2 mb-2">
              {template.icon && <span className="text-2xl">{template.icon}</span>}
              <div className="font-medium text-foreground">{template.name}</div>
            </div>
            <div className="text-xs text-muted-foreground">{template.description}</div>
            {template.tags && template.tags.length > 0 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                {template.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 rounded bg-accent/50 text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-8">{t('common.loading')}</div>}
      {!loading && filteredTemplates.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">{t('common.noData')}</div>
      )}
    </Modal>
  );
}
