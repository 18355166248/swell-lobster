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
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { apiGet, apiPatch, apiPost } from '../../api/base';
import MarkdownContent from '../../components/MarkdownContent';

const { Title, Text } = Typography;
const { TextArea } = Input;

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

type AssistantSkill = {
  name: string;
  display_name: string;
  description: string;
  version: string;
  enabled: boolean;
  tags: string[];
  prompt_template: string;
  file_path: string;
  source: 'builtin' | 'user';
  parameters?: Record<
    string,
    {
      type: 'string' | 'number' | 'boolean';
      description: string;
      required?: boolean;
    }
  >;
};

type SkillLogEntry = {
  id: string;
  skill_name: string;
  trigger_type: 'manual' | 'llm_call';
  invoked_by: 'ui' | 'llm' | 'im';
  input_context: string;
  output: string | null;
  status: 'success' | 'failed';
  error_message: string | null;
  duration_ms: number | null;
  session_id: string | null;
  endpoint_name: string | null;
  created_at: string;
};

function formatRelativeTime(value: string, locale: string): string {
  const date = new Date(value);
  const diff = date.getTime() - Date.now();
  const absSeconds = Math.abs(diff) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale.startsWith('zh') ? 'zh-CN' : 'en', {
    numeric: 'auto',
  });

  if (absSeconds < 60) return rtf.format(Math.round(diff / 1000), 'second');
  if (absSeconds < 3600) return rtf.format(Math.round(diff / 60000), 'minute');
  if (absSeconds < 86400) return rtf.format(Math.round(diff / 3600000), 'hour');
  return rtf.format(Math.round(diff / 86400000), 'day');
}

function SkillSourceTag({ skill }: { skill: AssistantSkill }) {
  const { t } = useTranslation();
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      <Tag>{t(`skills.${skill.source === 'builtin' ? 'sourceBuiltin' : 'sourceUser'}`)}</Tag>
    </div>
  );
}

function SkillLogsTable({
  logs,
  loading,
  page,
  onPageChange,
  emptyText,
}: {
  logs: SkillLogEntry[];
  loading: boolean;
  page: number;
  onPageChange: (page: number) => void;
  emptyText: string;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';

  const columns: ColumnsType<SkillLogEntry> = [
    {
      title: t('skills.assistantTitle'),
      dataIndex: 'skill_name',
      key: 'skill_name',
      width: 180,
    },
    {
      title: t('skills.invokedBy'),
      key: 'invoked_by',
      width: 120,
      render: (_, record) => {
        if (record.invoked_by === 'llm') return t('skills.invokedByLlm');
        if (record.invoked_by === 'im') return t('skills.invokedByIm');
        return t('skills.invokedByUi');
      },
    },
    {
      title: t('common.status'),
      key: 'status',
      width: 100,
      render: (_, record) => (
        <Tag color={record.status === 'success' ? 'success' : 'error'}>
          {record.status === 'success' ? t('skills.statusSuccess') : t('skills.statusFailed')}
        </Tag>
      ),
    },
    {
      title: t('skills.duration'),
      key: 'duration_ms',
      width: 100,
      render: (_, record) => (record.duration_ms == null ? '-' : `${record.duration_ms} ms`),
    },
    {
      title: t('common.time'),
      key: 'created_at',
      width: 140,
      render: (_, record) => (
        <Tooltip title={new Date(record.created_at).toLocaleString()}>
          <span>{formatRelativeTime(record.created_at, locale)}</span>
        </Tooltip>
      ),
    },
  ];

  return (
    <div className="rounded border border-border bg-background">
      <Table<SkillLogEntry>
        rowKey="id"
        columns={columns}
        dataSource={logs}
        loading={loading}
        size="small"
        locale={{ emptyText }}
        expandable={{
          expandedRowRender: (record) => (
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-xs text-muted-foreground">{t('skills.inputLabel')}</div>
                <pre className="m-0 rounded border border-border bg-muted/20 p-3 text-xs whitespace-pre-wrap break-words">
                  {record.input_context || '-'}
                </pre>
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">{t('skills.outputLabel')}</div>
                <div className="rounded border border-border bg-muted/20 p-3 text-sm prose prose-sm max-w-none">
                  <ReactMarkdown>{record.output ?? record.error_message ?? '-'}</ReactMarkdown>
                </div>
              </div>
            </div>
          ),
        }}
        pagination={{
          current: page,
          total: logs.length,
          pageSize: 20,
          onChange: onPageChange,
          hideOnSinglePage: logs.length <= 20,
        }}
      />
    </div>
  );
}

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
    } catch (error) {
      setError(error instanceof Error ? error.message : t('skills.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = async (skillId: string, enabled: boolean) => {
    setToggling((prev) => new Set(prev).add(skillId));
    try {
      await apiPost('/api/skills/toggle', { skill_id: skillId, enabled });
      setSkills((prev) =>
        prev.map((skill) => (skill.skill_id === skillId ? { ...skill, enabled } : skill))
      );
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : t('skills.toggleFailed'));
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
      <div className="mb-3 flex items-center justify-between">
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
            size="small"
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            locale={{ emptyText: t('skills.empty') }}
            columns={[
              {
                title: t('common.api'),
                key: 'name',
                render: (_, record) => (
                  <div>
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      {record.name}
                      {record.system && <Tag>{t('skills.system')}</Tag>}
                      {record.version && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          v{record.version}
                        </Text>
                      )}
                    </div>
                    {record.description && (
                      <button
                        type="button"
                        className="mt-0.5 w-full cursor-pointer rounded-sm border-0 bg-transparent p-0 text-left text-sm text-muted-foreground"
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
                render: (value: string) => <Tag>{value}</Tag>,
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
  const [historySkill, setHistorySkill] = useState<AssistantSkill | null>(null);
  const [historyLogs, setHistoryLogs] = useState<SkillLogEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [messageApi, contextHolder] = message.useMessage();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ skills: AssistantSkill[] }>('/api/assistant-skills');
      setSkills(data.skills ?? []);
    } catch (error) {
      setError(error instanceof Error ? error.message : t('skills.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const loadSkillLogs = async (skillName: string) => {
    setHistoryLoading(true);
    try {
      const data = await apiGet<{ logs: SkillLogEntry[] }>(
        `/api/assistant-skills/${skillName}/logs?limit=200&offset=0`
      );
      setHistoryLogs(data.logs ?? []);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : t('skills.loadFailed'));
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = async (skill: AssistantSkill, enabled: boolean) => {
    setToggling((prev) => new Set(prev).add(skill.name));
    try {
      await apiPatch(`/api/assistant-skills/${skill.name}/${enabled ? 'enable' : 'disable'}`, {});
      setSkills((prev) => prev.map((row) => (row.name === skill.name ? { ...row, enabled } : row)));
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : t('skills.toggleFailed'));
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(skill.name);
        return next;
      });
    }
  };

  const openExecute = (skill: AssistantSkill) => {
    setExecuteModal(skill);
    setContext('');
    setExecuteResult(null);
  };

  const openHistory = (skill: AssistantSkill) => {
    setHistorySkill(skill);
    setHistoryPage(1);
    void loadSkillLogs(skill.name);
  };

  const handleExecute = async () => {
    if (!executeModal) return;
    setExecuting(true);
    setExecuteResult(null);
    try {
      const data = await apiPost<{ result: string }>(
        `/api/assistant-skills/${executeModal.name}/execute`,
        {
          context,
        }
      );
      setExecuteResult(data.result);
      void loadSkillLogs(executeModal.name);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : t('skills.executeFailed'));
    } finally {
      setExecuting(false);
    }
  };

  const columns: ColumnsType<AssistantSkill> = [
    {
      title: t('common.api'),
      key: 'name',
      render: (_, record) => (
        <div>
          <div className="flex items-center gap-2 font-medium text-foreground">
            {record.display_name}
            <Text type="secondary" style={{ fontSize: 12 }}>
              v{record.version}
            </Text>
          </div>
          {record.description && (
            <div className="mt-0.5 text-sm text-muted-foreground">{record.description}</div>
          )}
          <SkillSourceTag skill={record} />
          {record.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {record.tags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </div>
          )}
        </div>
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
      width: 190,
      render: (_, record) => (
        <div className="flex gap-1">
          <Button size="small" onClick={() => setPromptModal(record)}>
            Prompt
          </Button>
          <Button size="small" onClick={() => openHistory(record)}>
            {t('skills.viewHistory')}
          </Button>
          <Button
            type="primary"
            size="small"
            disabled={!record.enabled}
            onClick={() => openExecute(record)}
          >
            {t('skills.executeSkill')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      {contextHolder}
      <div className="mb-3 flex items-center justify-between">
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
            columns={columns}
            size="small"
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            locale={{ emptyText: t('skills.assistantEmpty') }}
          />
        </div>
      )}

      <Modal
        title={`${t('skills.executeSkill')}：${executeModal?.display_name ?? ''}`}
        open={!!executeModal}
        onCancel={() => setExecuteModal(null)}
        destroyOnHidden
        width={640}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setExecuteModal(null)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={executing} onClick={() => void handleExecute()}>
              {executing ? t('skills.executing') : t('skills.executeSkill')}
            </Button>
          </div>
        }
      >
        <div className="mt-2 space-y-3">
          <div>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {t('skills.contextInput')}
            </Text>
            <TextArea
              className="mt-1"
              rows={4}
              value={context}
              placeholder={t('skills.contextInputPlaceholder')}
              onChange={(event) => setContext(event.target.value)}
            />
          </div>
          {executeResult !== null && (
            <div>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {t('skills.executeResult')}
              </Text>
              <div className="mt-1 max-h-64 overflow-y-auto rounded border border-border bg-muted/30 p-3 text-sm prose prose-sm max-w-none">
                <ReactMarkdown>{executeResult}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        title={`${t('skills.promptTemplate')}：${promptModal?.display_name ?? ''}`}
        open={!!promptModal}
        onCancel={() => setPromptModal(null)}
        footer={null}
        destroyOnHidden
        width={640}
      >
        <div className="mt-2 max-h-[60vh] overflow-y-auto rounded border border-border bg-muted/30 p-3 text-sm text-foreground [&_.markdown-content]:max-w-none">
          <MarkdownContent content={promptModal?.prompt_template ?? ''} />
        </div>
      </Modal>

      <Modal
        title={`${t('skills.viewHistory')}：${historySkill?.display_name ?? ''}`}
        open={!!historySkill}
        onCancel={() => setHistorySkill(null)}
        footer={null}
        destroyOnHidden
        width={980}
      >
        <SkillLogsTable
          logs={historyLogs}
          loading={historyLoading}
          page={historyPage}
          onPageChange={setHistoryPage}
          emptyText={t('skills.historyEmpty')}
        />
      </Modal>
    </>
  );
}

function SkillLogsTab() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<SkillLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ logs: SkillLogEntry[] }>(
        '/api/assistant-skill-logs?limit=200&offset=0'
      );
      setLogs(data.logs ?? []);
    } catch (error) {
      setError(error instanceof Error ? error.message : t('skills.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <Text type="secondary">{t('skills.tabHistory')}</Text>
        <Button onClick={() => void load()} loading={loading} size="small">
          {t('common.refresh')}
        </Button>
      </div>
      {error && <Alert type="error" message={error} className="mb-3" showIcon />}
      <SkillLogsTable
        logs={logs}
        loading={loading}
        page={page}
        onPageChange={setPage}
        emptyText={t('skills.historyEmpty')}
      />
    </>
  );
}

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
            { key: 'assistant', label: t('skills.tabAssistant'), children: <AssistantSkillsTab /> },
            { key: 'history', label: t('skills.tabHistory'), children: <SkillLogsTab /> },
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
