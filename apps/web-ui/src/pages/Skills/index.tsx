import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Input,
  Modal,
  Spin,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { apiGet, apiPost, apiPatch } from '../../api/base';

const { Title, Text } = Typography;
const { TextArea } = Input;

// ─── Claude Code 技能 ─────────────────────────────────────────────────────────

type ClaudeSkill = {
  skill_id: string;
  name: string;
  description: string;
  version?: string;
  category: string;
  system: boolean;
  enabled: boolean;
  path: string;
};

function ClaudeCodeSkillsTab() {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<ClaudeSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [descModal, setDescModal] = useState<{ name: string; description: string } | null>(null);
  const [messageApi, contextHolder] = message.useMessage();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ skills: ClaudeSkill[] }>('/api/skills');
      setSkills(data.skills ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('skills.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []); // eslint-disable-line

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
    <>
      {contextHolder}
      <div className="flex items-center justify-between mb-3">
        <Text type="secondary">{t('skills.claudeCodeSubtitle')}</Text>
        <Button onClick={() => void load()} loading={loading} size="small">
          {t('common.refresh')}
        </Button>
      </div>
      {error && <Alert type="error" message={error} className="mb-3" showIcon />}
      {loading ? (
        <div className="flex items-center gap-2">
          <Spin size="small" />
          <Text type="secondary">{t('common.loading')}</Text>
        </div>
      ) : (
        <div className="rounded border border-border bg-background">
          <Table<ClaudeSkill>
            rowKey="skill_id"
            dataSource={skills}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
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
                        className="mt-0.5 w-full text-left text-sm text-muted-foreground line-clamp-2 cursor-pointer rounded-sm border-0 bg-transparent p-0 hover:text-foreground/90"
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
    </>
  );
}

// ─── 助手技能 ─────────────────────────────────────────────────────────────────

type AssistantSkill = {
  name: string;
  display_name: string;
  description: string;
  version: string;
  trigger: 'manual' | 'llm_call';
  enabled: boolean;
  tags: string[];
  prompt_template: string;
  file_path: string;
  source: 'builtin' | 'user';
};

function AssistantSkillsTab() {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<AssistantSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [executeModal, setExecuteModal] = useState<AssistantSkill | null>(null);
  const [context, setContext] = useState('');
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<string | null>(null);
  const [promptModal, setPromptModal] = useState<AssistantSkill | null>(null);
  const [messageApi, contextHolder] = message.useMessage();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ skills: AssistantSkill[] }>('/api/assistant-skills');
      setSkills(data.skills ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('skills.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []); // eslint-disable-line

  const handleToggle = async (skill: AssistantSkill, enabled: boolean) => {
    setToggling((prev) => new Set(prev).add(skill.name));
    try {
      await apiPatch(`/api/assistant-skills/${skill.name}/${enabled ? 'enable' : 'disable'}`, {});
      setSkills((prev) => prev.map((s) => (s.name === skill.name ? { ...s, enabled } : s)));
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : t('skills.toggleFailed'));
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(skill.name);
        return next;
      });
    }
  };

  const openExecute = (skill: AssistantSkill) => {
    setContext('');
    setExecuteResult(null);
    setExecuteModal(skill);
  };

  const handleExecute = async () => {
    if (!executeModal) return;
    setExecuting(true);
    setExecuteResult(null);
    try {
      const data = await apiPost<{ result: string }>(
        `/api/assistant-skills/${executeModal.name}/execute`,
        { context }
      );
      setExecuteResult(data.result);
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : t('skills.executeFailed'));
    } finally {
      setExecuting(false);
    }
  };

  return (
    <>
      {contextHolder}
      <div className="flex items-center justify-between mb-3">
        <Text type="secondary">{t('skills.assistantSubtitle')}</Text>
        <Button onClick={() => void load()} loading={loading} size="small">
          {t('common.refresh')}
        </Button>
      </div>
      {error && <Alert type="error" message={error} className="mb-3" showIcon />}
      {loading ? (
        <div className="flex items-center gap-2">
          <Spin size="small" />
          <Text type="secondary">{t('common.loading')}</Text>
        </div>
      ) : (
        <div className="rounded border border-border bg-background">
          <Table<AssistantSkill>
            rowKey="name"
            dataSource={skills}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            size="small"
            locale={{ emptyText: t('skills.assistantEmpty') }}
            columns={[
              {
                title: t('common.api'),
                key: 'name',
                render: (_, record) => (
                  <div>
                    <div className="font-medium text-foreground flex items-center gap-2">
                      {record.display_name}
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        v{record.version}
                      </Text>
                      <Tag
                        color={record.source === 'builtin' ? 'default' : 'blue'}
                        style={{ fontSize: 11 }}
                      >
                        {record.source === 'builtin'
                          ? t('skills.sourceBuiltin')
                          : t('skills.sourceUser')}
                      </Tag>
                    </div>
                    {record.description && (
                      <div className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                        {record.description}
                      </div>
                    )}
                    {record.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {record.tags.map((tag) => (
                          <Tag key={tag} style={{ fontSize: 11 }}>
                            {tag}
                          </Tag>
                        ))}
                      </div>
                    )}
                  </div>
                ),
              },
              {
                title: t('skills.trigger'),
                key: 'trigger',
                width: 100,
                render: (_, record) => (
                  <Tag color={record.trigger === 'llm_call' ? 'purple' : 'cyan'}>
                    {record.trigger === 'llm_call'
                      ? t('skills.triggerLLM')
                      : t('skills.triggerManual')}
                  </Tag>
                ),
              },
              {
                title: t('skills.enabled'),
                key: 'enabled',
                width: 80,
                align: 'center',
                render: (_, record) => (
                  <Switch
                    checked={record.enabled}
                    loading={toggling.has(record.name)}
                    onChange={(checked) => void handleToggle(record, checked)}
                    size="small"
                  />
                ),
              },
              {
                title: t('common.actions'),
                key: 'actions',
                width: 140,
                render: (_, record) => (
                  <div className="flex gap-1">
                    <Button size="small" onClick={() => setPromptModal(record)}>
                      Prompt
                    </Button>
                    {record.trigger === 'manual' && (
                      <Button
                        type="primary"
                        size="small"
                        disabled={!record.enabled}
                        onClick={() => openExecute(record)}
                      >
                        {t('skills.executeSkill')}
                      </Button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}

      {/* 执行技能弹窗 */}
      <Modal
        title={`${t('skills.executeSkill')}：${executeModal?.display_name}`}
        open={!!executeModal}
        onCancel={() => setExecuteModal(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setExecuteModal(null)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={executing} onClick={() => void handleExecute()}>
              {executing ? t('skills.executing') : t('skills.executeSkill')}
            </Button>
          </div>
        }
        destroyOnHidden
        width={600}
      >
        <div className="space-y-3 mt-2">
          <div>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {t('skills.contextInput')}
            </Text>
            <TextArea
              className="mt-1"
              rows={4}
              placeholder={t('skills.contextInputPlaceholder')}
              value={context}
              onChange={(e) => setContext(e.target.value)}
            />
          </div>
          {executeResult !== null && (
            <div>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {t('skills.executeResult')}
              </Text>
              <div className="mt-1 rounded border border-border p-3 bg-muted/30 max-h-64 overflow-y-auto text-sm prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{executeResult}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Prompt 模板查看弹窗 */}
      <Modal
        title={`${t('skills.promptTemplate')}：${promptModal?.display_name}`}
        open={!!promptModal}
        onCancel={() => setPromptModal(null)}
        footer={null}
        destroyOnHidden
        width={600}
      >
        <pre className="mt-2 max-h-[60vh] overflow-y-auto text-sm text-muted-foreground whitespace-pre-wrap break-words">
          {promptModal?.prompt_template}
        </pre>
      </Modal>
    </>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────

export function SkillsPage() {
  const { t } = useTranslation();

  return (
    <div className="p-6">
      <Title level={4} style={{ marginBottom: 4 }}>
        {t('skills.title')}
      </Title>
      <Text type="secondary">{t('skills.subtitle')}</Text>

      <div className="mt-4">
        <Tabs
          defaultActiveKey="assistant"
          items={[
            {
              key: 'assistant',
              label: t('skills.tabAssistant'),
              children: <AssistantSkillsTab />,
            },
            {
              key: 'claude-code',
              label: t('skills.tabClaudeCode'),
              children: <ClaudeCodeSkillsTab />,
            },
          ]}
        />
      </div>
    </div>
  );
}
