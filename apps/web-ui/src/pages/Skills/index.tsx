import { useEffect, useState } from 'react';
import { Alert, Button, Modal, Spin, Switch, Table, Tag, Typography, message } from 'antd';
import { useTranslation } from 'react-i18next';
import { apiGet, apiPost } from '../../api/base';

const { Title, Text } = Typography;

type Skill = {
  skill_id: string;
  name: string;
  description: string;
  version?: string;
  category: string;
  system: boolean;
  enabled: boolean;
  path: string;
};

export function SkillsPage() {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [descModal, setDescModal] = useState<{ name: string; description: string } | null>(null);
  const [messageApi, contextHolder] = message.useMessage();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ skills: Skill[] }>('/api/skills');
      setSkills(data.skills ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('skills.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggle = async (skillId: string, enabled: boolean) => {
    setToggling((prev) => new Set(prev).add(skillId));
    try {
      await apiPost('/api/skills/toggle', { skill_id: skillId, enabled });
      setSkills((prev) => prev.map((s) => (s.skill_id === skillId ? { ...s, enabled } : s)));
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : t('skills.toggleFailed'));
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(skillId);
        return next;
      });
    }
  };

  return (
    <div className="p-6">
      {contextHolder}
      <div className="flex items-center justify-between mb-1">
        <Title level={4} style={{ margin: 0 }}>
          {t('skills.title')}
        </Title>
        <Button onClick={() => void load()} loading={loading} size="small">
          {t('common.refresh')}
        </Button>
      </div>
      <Text type="secondary">{t('skills.subtitle')}</Text>

      {error && <Alert type="error" message={error} className="mt-3" showIcon />}

      {loading ? (
        <div className="mt-6 flex items-center gap-2">
          <Spin size="small" />
          <Text type="secondary">{t('common.loading')}</Text>
        </div>
      ) : (
        <div className="mt-6 rounded border border-border bg-background">
          <Table<Skill>
            rowKey="skill_id"
            dataSource={skills}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              hideOnSinglePage: true,
            }}
            size="small"
            locale={{ emptyText: t('skills.empty') }}
            columns={[
              {
                title: t('common.api'),
                dataIndex: 'name',
                key: 'name',
                render: (_, record) => (
                  <div>
                    <div className="font-medium text-foreground flex items-center gap-2">
                      {record.name}
                      {record.system && (
                        <Tag color="default" style={{ fontSize: 11 }}>
                          {t('skills.system')}
                        </Tag>
                      )}
                      {record.version && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          v{record.version}
                        </Text>
                      )}
                    </div>
                    {record.description && (
                      <button
                        type="button"
                        className="mt-0.5 w-full max-w-full text-left text-sm text-muted-foreground line-clamp-2 cursor-pointer rounded-sm border-0 bg-transparent p-0 hover:text-foreground/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        title={t('skills.viewFullDescription')}
                        onClick={() =>
                          setDescModal({ name: record.name, description: record.description })
                        }
                      >
                        {record.description}
                      </button>
                    )}
                  </div>
                ),
              },
              {
                title: t('skills.category'),
                dataIndex: 'category',
                key: 'category',
                width: 120,
                render: (val: string) => <Tag>{val}</Tag>,
              },
              {
                title: t('skills.enabled'),
                key: 'enabled',
                width: 100,
                align: 'center',
                render: (_, record) => (
                  <Switch
                    checked={record.enabled}
                    loading={toggling.has(record.skill_id)}
                    onChange={(checked) => void handleToggle(record.skill_id, checked)}
                    size="small"
                  />
                ),
              },
            ]}
          />
        </div>
      )}

      <Modal
        title={descModal?.name}
        open={!!descModal}
        onCancel={() => setDescModal(null)}
        footer={null}
        destroyOnHidden
        width={560}
      >
        <div className="max-h-[min(60vh,480px)] overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">
          {descModal?.description}
        </div>
      </Modal>
    </div>
  );
}
