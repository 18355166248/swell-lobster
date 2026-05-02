import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Table, Alert, Space, Badge, Typography, Select, message } from 'antd';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAtomValue, useSetAtom } from 'jotai';
import { TableActions } from '../../../components/TableActions';
import { apiDelete, apiPatch, apiPost } from '../../../api/base';
import {
  compilerEndpointIdAtom,
  endpointsAtom,
  endpointsLoadedAtom,
  refreshEndpointsAtom,
  sttEndpointsAtom,
} from '../../../store/endpoints';
import { AddEndpointDialog } from './AddEndpointDialog';
import type { EndpointFormData, EndpointItem } from './types';

const { Title, Text } = Typography;

export function ConfigLLMPage() {
  const { t } = useTranslation();
  const [messageApi, contextHolder] = message.useMessage();
  const endpoints = useAtomValue(endpointsAtom);
  const sttEndpoints = useAtomValue(sttEndpointsAtom);
  const storedCompilerEndpointId = useAtomValue(compilerEndpointIdAtom);
  const endpointsLoaded = useAtomValue(endpointsLoadedAtom);
  const refreshEndpoints = useSetAtom(refreshEndpointsAtom);
  // 编译器端点选择是 "草稿"：用户改完之后再点保存，因此保留本地 state，仅在远端值变化时同步
  const [compilerEndpointId, setCompilerEndpointId] = useState<string | null>(
    storedCompilerEndpointId
  );
  const [loading, setLoading] = useState(!endpointsLoaded);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [compilerSaving, setCompilerSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [addEndpointOpen, setAddEndpointOpen] = useState(false);
  const [editEndpointOpen, setEditEndpointOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<EndpointItem | null>(null);
  const [addSttEndpointOpen, setAddSttEndpointOpen] = useState(false);
  const [editSttEndpointOpen, setEditSttEndpointOpen] = useState(false);
  const [editingSttTarget, setEditingSttTarget] = useState<EndpointItem | null>(null);

  useEffect(() => {
    setCompilerEndpointId(storedCompilerEndpointId);
  }, [storedCompilerEndpointId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await refreshEndpoints();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('llm.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [refreshEndpoints, t]);

  useEffect(() => {
    if (endpointsLoaded) {
      setLoading(false);
      return;
    }
    void load();
  }, [endpointsLoaded, load]);

  const handleApplyRestart = async () => {
    setReloading(true);
    setError(null);
    try {
      await apiPost('/api/config/reload', {});
    } catch (e) {
      setError(e instanceof Error ? e.message : t('llm.applyFailed'));
    } finally {
      setReloading(false);
    }
  };

  const compilerOptions = useMemo(
    () =>
      endpoints
        .filter((item) => item.id && item.name)
        .map((item) => ({ value: String(item.id), label: String(item.name) })),
    [endpoints]
  );

  const handleAddEndpoint = useCallback(
    async (data: EndpointFormData) => {
      setError(null);
      setSavingId('__new__');
      if (data.api_key_value && data.api_key_env) {
        try {
          await apiPost('/api/config/env', { entries: { [data.api_key_env]: data.api_key_value } });
        } catch (e) {
          setError(e instanceof Error ? e.message : t('llm.writeKeyFailed'));
          setSavingId(null);
          throw e;
        }
      }
      try {
        await apiPost('/api/config/endpoints/item', {
          endpoint: {
            name: data.name,
            model: data.model,
            api_type: data.api_type,
            base_url: data.base_url,
            api_key_env: data.api_key_env,
            priority: data.priority,
            enabled: data.enabled !== false,
            provider: data.provider,
            capabilities: data.capabilities,
            max_tokens: data.max_tokens,
            context_window: data.context_window,
            timeout: data.timeout,
            rpm_limit: data.rpm_limit,
            fallback_endpoint_id: data.fallback_endpoint_id,
            cost_per_1m_input: data.cost_per_1m_input,
            cost_per_1m_output: data.cost_per_1m_output,
          },
        });
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : t('llm.saveFailed'));
        throw e;
      } finally {
        setSavingId(null);
      }
    },
    [load, t]
  );

  const handleEditEndpoint = useCallback(
    async (data: EndpointFormData) => {
      setError(null);
      const targetId = String(editingTarget?.id ?? '');
      if (!targetId) return;
      setSavingId(targetId);
      if (data.api_key_value && data.api_key_env) {
        try {
          await apiPost('/api/config/env', { entries: { [data.api_key_env]: data.api_key_value } });
        } catch (e) {
          setError(e instanceof Error ? e.message : t('llm.writeKeyFailed'));
          setSavingId(null);
          throw e;
        }
      }
      try {
        await apiPatch(`/api/config/endpoints/${targetId}`, {
          endpoint: {
            id: targetId,
            name: data.name,
            model: data.model,
            api_type: data.api_type,
            base_url: data.base_url,
            api_key_env: data.api_key_env,
            priority: data.priority,
            enabled: data.enabled !== false,
            provider: data.provider,
            capabilities: data.capabilities,
            max_tokens: data.max_tokens,
            context_window: data.context_window,
            timeout: data.timeout,
            rpm_limit: data.rpm_limit,
            fallback_endpoint_id: data.fallback_endpoint_id,
            cost_per_1m_input: data.cost_per_1m_input,
            cost_per_1m_output: data.cost_per_1m_output,
          },
        });
        setEditEndpointOpen(false);
        setEditingTarget(null);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : t('llm.saveFailed'));
        throw e;
      } finally {
        setSavingId(null);
      }
    },
    [editingTarget, load, t]
  );

  const handleDeleteEndpoint = useCallback(
    async (record: EndpointItem) => {
      const id = String(record.id ?? '');
      if (!id) return;
      setSavingId(id);
      setError(null);
      try {
        await apiDelete(`/api/config/endpoints/${id}`);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : t('llm.saveFailed'));
      } finally {
        setSavingId(null);
      }
    },
    [load, t]
  );

  const columns = [
    {
      title: t('llm.colEndpoint'),
      dataIndex: 'name',
      render: (v: string) => v ?? '-',
    },
    {
      title: t('llm.colModel'),
      dataIndex: 'model',
      render: (v: string) => v ?? '-',
    },
    {
      title: t('llm.colKey'),
      dataIndex: 'api_key_env',
      render: (v: string) =>
        v ? <Badge status="success" text={t('llm.configured')} /> : <Text type="secondary">-</Text>,
    },
    {
      title: t('llm.colPriority'),
      dataIndex: 'priority',
      render: (v: number) => v ?? 1,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 100,
      render: (_: unknown, record: EndpointItem) => (
        <TableActions
          actions={[
            {
              key: 'edit',
              icon: <EditOutlined />,
              tooltip: t('common.edit'),
              onClick: () => {
                setEditingTarget(record);
                setEditEndpointOpen(true);
              },
            },
            {
              key: 'delete',
              icon: <DeleteOutlined />,
              tooltip: t('common.delete'),
              danger: true,
              popconfirm: {
                title: t('llm.deleteConfirm'),
                onConfirm: () => handleDeleteEndpoint(record),
                okText: t('common.confirm'),
                cancelText: t('common.cancel'),
              },
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="p-6 animate-in fade-in-50 duration-200">
      <Title level={4} style={{ marginBottom: 4 }}>
        {t('llm.title')}
      </Title>
      <Text type="secondary">{t('llm.subtitle')}</Text>

      {error && <Alert type="error" title={error} className="mt-3" showIcon />}

      <div className="mt-6 flex items-center justify-between">
        <Title level={5} style={{ margin: 0 }}>
          {t('llm.mainEndpoints')}
        </Title>
        <Button type="primary" onClick={() => setAddEndpointOpen(true)}>
          {t('llm.addEndpoint')}
        </Button>
        <AddEndpointDialog
          open={addEndpointOpen}
          onOpenChange={setAddEndpointOpen}
          onConfirm={handleAddEndpoint}
          saving={savingId === '__new__'}
          existingNames={endpoints.map((e) => String(e.name ?? '')).filter(Boolean)}
          endpointCount={endpoints.length}
          fallbackOptions={endpoints
            .filter((item) => item.id && item.name)
            .map((item) => ({ value: item.id!, label: String(item.name) }))}
        />
      </div>

      <Table
        className="mt-2"
        size="small"
        loading={loading}
        dataSource={endpoints}
        columns={columns}
        rowKey={(r) => String(r.name ?? '')}
        locale={{ emptyText: t('llm.emptyEndpoints') }}
        pagination={false}
      />

      <div className="mt-8">
        <Title level={5}>{t('llm.compilerModel')}</Title>
        <Text type="secondary" className="block mb-2">
          {t('llm.compilerModelHint')}
        </Text>
        <div className="flex gap-3 items-center mt-3">
          <Select
            allowClear
            className="min-w-[320px]"
            value={compilerEndpointId ?? undefined}
            options={compilerOptions}
            placeholder={t('llm.emptyEndpointsHint')}
            onChange={(value) => setCompilerEndpointId(value ?? null)}
          />
          <Button
            onClick={async () => {
              setCompilerSaving(true);
              setError(null);
              try {
                await apiPost('/api/config/compiler-endpoint', {
                  endpoint_id: compilerEndpointId,
                });
                messageApi.success(t('configAdvanced.saveSuccess'));
              } catch (e) {
                setError(e instanceof Error ? e.message : t('llm.saveFailed'));
              } finally {
                setCompilerSaving(false);
              }
            }}
            loading={compilerSaving}
            disabled={compilerSaving}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>

      <div className="mt-6">
        <Title level={5}>{t('llm.sttEndpoints')}</Title>
        <Text type="secondary" className="block mb-2">
          {t('llm.sttHint')}
        </Text>
        <div className="mt-3 flex items-center justify-between">
          <div />
          <Button type="primary" onClick={() => setAddSttEndpointOpen(true)}>
            {t('llm.addEndpoint')}
          </Button>
        </div>
        <Table
          className="mt-2"
          size="small"
          dataSource={sttEndpoints}
          columns={[
            {
              title: t('llm.colEndpoint'),
              dataIndex: 'name',
              render: (v: string) => v ?? '-',
            },
            {
              title: t('llm.colModel'),
              dataIndex: 'model',
              render: (v: string) => v ?? '-',
            },
            {
              title: t('llm.colKey'),
              dataIndex: 'api_key_env',
              render: (v: string) =>
                v ? (
                  <Badge status="success" text={t('llm.configured')} />
                ) : (
                  <Text type="secondary">-</Text>
                ),
            },
            {
              title: t('common.actions'),
              key: 'actions',
              width: 100,
              render: (_: unknown, record: EndpointItem) => (
                <TableActions
                  actions={[
                    {
                      key: 'edit',
                      icon: <EditOutlined />,
                      tooltip: t('common.edit'),
                      onClick: () => {
                        setEditingSttTarget(record);
                        setEditSttEndpointOpen(true);
                      },
                    },
                    {
                      key: 'delete',
                      icon: <DeleteOutlined />,
                      tooltip: t('common.delete'),
                      danger: true,
                      popconfirm: {
                        title: t('llm.deleteConfirm'),
                        onConfirm: async () => {
                          const id = String(record.id ?? '');
                          if (!id) return;
                          setSavingId(`stt-${id}`);
                          setError(null);
                          try {
                            await apiDelete(`/api/config/stt-endpoints/${id}`);
                            await load();
                          } catch (e) {
                            setError(e instanceof Error ? e.message : t('llm.saveFailed'));
                          } finally {
                            setSavingId(null);
                          }
                        },
                        okText: t('common.confirm'),
                        cancelText: t('common.cancel'),
                      },
                    },
                  ]}
                />
              ),
            },
          ]}
          rowKey={(r) => String(r.id ?? r.name ?? '')}
          locale={{ emptyText: t('llm.emptyEndpoints') }}
          pagination={false}
        />
      </div>

      <Space className="mt-8">
        <Button
          type="primary"
          onClick={handleApplyRestart}
          loading={reloading}
          disabled={reloading}
        >
          {t('llm.applyRestart')}
        </Button>
      </Space>

      <AddEndpointDialog
        open={editEndpointOpen}
        onOpenChange={setEditEndpointOpen}
        onConfirm={handleEditEndpoint}
        existingNames={endpoints
          .map((e) => String(e.name ?? ''))
          .filter(Boolean)
          .filter((n) => n !== String(editingTarget?.name ?? ''))}
        endpointCount={endpoints.length}
        mode="edit"
        initial={editingTarget}
        saving={savingId === String(editingTarget?.id ?? '')}
        fallbackOptions={endpoints
          .filter((item) => item.id && item.name && item.id !== editingTarget?.id)
          .map((item) => ({ value: item.id!, label: String(item.name) }))}
      />
      <AddEndpointDialog
        open={addSttEndpointOpen}
        onOpenChange={setAddSttEndpointOpen}
        onConfirm={async (data) => {
          setError(null);
          setSavingId('stt-new');
          if (data.api_key_value && data.api_key_env) {
            try {
              await apiPost('/api/config/env', {
                entries: { [data.api_key_env]: data.api_key_value },
              });
            } catch (e) {
              setError(e instanceof Error ? e.message : t('llm.writeKeyFailed'));
              setSavingId(null);
              throw e;
            }
          }
          try {
            await apiPost('/api/config/stt-endpoints/item', {
              endpoint: {
                name: data.name,
                model: data.model,
                api_type: data.api_type,
                base_url: data.base_url,
                api_key_env: data.api_key_env,
                priority: data.priority,
                enabled: data.enabled !== false,
                provider: data.provider,
                capabilities: data.capabilities,
                max_tokens: data.max_tokens,
                context_window: data.context_window,
                timeout: data.timeout,
                rpm_limit: data.rpm_limit,
                fallback_endpoint_id: data.fallback_endpoint_id,
                cost_per_1m_input: data.cost_per_1m_input,
                cost_per_1m_output: data.cost_per_1m_output,
              },
            });
            await load();
          } catch (e) {
            setError(e instanceof Error ? e.message : t('llm.saveFailed'));
            throw e;
          } finally {
            setSavingId(null);
          }
        }}
        saving={savingId === 'stt-new'}
        existingNames={sttEndpoints.map((e) => String(e.name ?? '')).filter(Boolean)}
        endpointCount={sttEndpoints.length}
      />
      <AddEndpointDialog
        open={editSttEndpointOpen}
        onOpenChange={setEditSttEndpointOpen}
        onConfirm={async (data) => {
          const targetId = String(editingSttTarget?.id ?? '');
          if (!targetId) return;
          setError(null);
          setSavingId(`stt-${targetId}`);
          if (data.api_key_value && data.api_key_env) {
            try {
              await apiPost('/api/config/env', {
                entries: { [data.api_key_env]: data.api_key_value },
              });
            } catch (e) {
              setError(e instanceof Error ? e.message : t('llm.writeKeyFailed'));
              setSavingId(null);
              throw e;
            }
          }
          try {
            await apiPatch(`/api/config/stt-endpoints/${targetId}`, {
              endpoint: {
                id: targetId,
                name: data.name,
                model: data.model,
                api_type: data.api_type,
                base_url: data.base_url,
                api_key_env: data.api_key_env,
                priority: data.priority,
                enabled: data.enabled !== false,
                provider: data.provider,
                capabilities: data.capabilities,
                max_tokens: data.max_tokens,
                context_window: data.context_window,
                timeout: data.timeout,
                rpm_limit: data.rpm_limit,
                fallback_endpoint_id: data.fallback_endpoint_id,
                cost_per_1m_input: data.cost_per_1m_input,
                cost_per_1m_output: data.cost_per_1m_output,
              },
            });
            setEditSttEndpointOpen(false);
            setEditingSttTarget(null);
            await load();
          } catch (e) {
            setError(e instanceof Error ? e.message : t('llm.saveFailed'));
            throw e;
          } finally {
            setSavingId(null);
          }
        }}
        saving={savingId === `stt-${String(editingSttTarget?.id ?? '')}`}
        existingNames={sttEndpoints
          .map((e) => String(e.name ?? ''))
          .filter(Boolean)
          .filter((n) => n !== String(editingSttTarget?.name ?? ''))}
        endpointCount={sttEndpoints.length}
        mode="edit"
        initial={editingSttTarget}
      />
      {contextHolder}
    </div>
  );
}
