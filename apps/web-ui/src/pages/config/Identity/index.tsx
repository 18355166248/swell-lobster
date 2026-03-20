import { useEffect, useState } from 'react';
import { Button, Alert, Spin, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { apiGet, apiPost } from '../../../api/base';

const { Title, Text } = Typography;

type FileItem = { path: string; name: string };

export function ConfigIdentityPage() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ files: FileItem[] }>('/api/identity/files');
      setFiles(data.files ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('configIdentity.loadFailed'));
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const loadContent = async (path: string) => {
    setSelected(path);
    setError(null);
    try {
      const data = await apiGet<{ content: string }>(`/api/identity/files/${path}`);
      setContent(data.content ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('configIdentity.readFailed'));
      setContent('');
    }
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await apiPost(`/api/identity/files/${selected}`, { content });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('configIdentity.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2">
        <Spin size="small" />
        <Text type="secondary">{t('common.loading')}</Text>
      </div>
    );
  }

  return (
    <div className="p-6">
      <Title level={4} style={{ marginBottom: 4 }}>
        {t('configIdentity.title')}
      </Title>
      <Text type="secondary">{t('configIdentity.subtitle')}</Text>

      {error && <Alert type="error" message={error} className="mt-3" showIcon />}

      <div className="mt-6 flex gap-6">
        <div className="w-48 flex-shrink-0 border border-border rounded overflow-hidden">
          <div className="px-3 py-2 bg-muted text-sm font-medium text-foreground">
            {t('configIdentity.fileList')}
          </div>
          <ul className="max-h-80 overflow-auto">
            {files.length === 0 ? (
              <li className="px-3 py-2 text-muted-foreground text-sm">
                {t('configIdentity.noFiles')}
              </li>
            ) : (
              files.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    onClick={() => loadContent(f.path)}
                    className={`w-full text-left px-3 py-2 text-sm block hover:bg-muted transition-colors ${
                      selected === f.path ? 'bg-muted font-medium' : 'text-foreground'
                    }`}
                  >
                    {f.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="flex-1 min-w-0">
          {selected ? (
            <>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full h-80 p-3 border border-border rounded font-mono text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                spellCheck={false}
              />
              <Button type="primary" className="mt-2" onClick={handleSave} loading={saving}>
                {saving ? t('configIdentity.saving') : t('configIdentity.save')}
              </Button>
            </>
          ) : (
            <Text type="secondary">{t('configIdentity.selectFile')}</Text>
          )}
        </div>
      </div>
    </div>
  );
}
