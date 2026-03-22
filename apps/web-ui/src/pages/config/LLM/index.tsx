import { useCallback, useEffect, useState } from 'react';
import { Button, Table, Alert, Space, Badge, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { apiGet, apiPost } from '../../../api/base';
import { AddEndpointDialog } from './AddEndpointDialog';
import type { EndpointFormData, EndpointItem } from './types';

const { Title, Text } = Typography;

type EndpointsResponse = {
  endpoints: EndpointItem[];
  raw?: {
    endpoints?: EndpointItem[];
    compiler_endpoints?: EndpointItem[];
    stt_endpoints?: EndpointItem[];
  };
};

export function ConfigLLMPage() {
  const { t } = useTranslation();
  const [endpoints, setEndpoints] = useState<EndpointItem[]>([]);
  const [raw, setRaw] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [addEndpointOpen, setAddEndpointOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<EndpointsResponse>('/api/config/endpoints');
      setEndpoints(data.endpoints ?? []);
      setRaw((data.raw as Record<string, unknown>) ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : t('llm.loadFailed'));
      setEndpoints([]);
      setRaw({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      console.log('raw', raw);
      console.log('endpoints', endpoints);
      await apiPost('/api/config/endpoints', { content: { ...raw, endpoints } });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('llm.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

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

  const handleAddEndpoint = useCallback(
    async (data: EndpointFormData) => {
      setError(null);
      if (data.api_key_value && data.api_key_env) {
        try {
          await apiPost('/api/config/env', { entries: { [data.api_key_env]: data.api_key_value } });
        } catch (e) {
          setError(e instanceof Error ? e.message : t('llm.writeKeyFailed'));
        }
      }
      const newItem: EndpointItem = {
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
      };
      setEndpoints((prev) =>
        [...prev, newItem].sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))
      );
    },
    [t]
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
  ];

  return (
    <div className="p-6 animate-in fade-in-50 duration-200">
      <Title level={4} style={{ marginBottom: 4 }}>
        {t('llm.title')}
      </Title>
      <Text type="secondary">{t('llm.subtitle')}</Text>

      {error && <Alert type="error" message={error} className="mt-3" showIcon />}

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
          existingNames={endpoints.map((e) => String(e.name ?? '')).filter(Boolean)}
          endpointCount={endpoints.length}
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
        <div className="px-4 py-6 border border-dashed border-border rounded-xl text-center text-muted-foreground text-sm">
          {t('llm.emptyEndpointsHint')}
        </div>
      </div>

      <div className="mt-6">
        <Title level={5}>{t('llm.sttEndpoints')}</Title>
        <Text type="secondary" className="block mb-2">
          {t('llm.sttHint')}
        </Text>
        <div className="px-4 py-6 border border-dashed border-border rounded-xl text-center text-muted-foreground text-sm">
          {t('llm.emptyEndpointsHint')}
        </div>
      </div>

      <Space className="mt-8">
        <Button onClick={handleSave} loading={saving} disabled={saving}>
          {t('llm.saveConfig')}
        </Button>
        <Button
          type="primary"
          onClick={handleApplyRestart}
          loading={reloading}
          disabled={reloading}
        >
          {t('llm.applyRestart')}
        </Button>
      </Space>
    </div>
  );
}
