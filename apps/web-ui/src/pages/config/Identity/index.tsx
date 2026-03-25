import { useEffect, useState } from 'react';
import { Button, Alert, Spin, Typography, Tree } from 'antd';
import type { TreeDataNode } from 'antd';
import { useTranslation } from 'react-i18next';
import { apiGet, apiPost } from '../../../api/base';

const { Title, Text } = Typography;

type FileItem = { path: string; name: string };

function buildTree(files: FileItem[]): TreeDataNode[] {
  const dirMap = new Map<string, TreeDataNode>();
  const roots: TreeDataNode[] = [];

  for (const file of files) {
    const parts = file.path.split('/');

    // ensure all parent dirs exist
    for (let i = 1; i < parts.length; i++) {
      const dirKey = parts.slice(0, i).join('/');
      if (!dirMap.has(dirKey)) {
        const node: TreeDataNode = {
          title: parts[i - 1],
          key: dirKey,
          children: [],
          isLeaf: false,
          selectable: false,
        };
        dirMap.set(dirKey, node);
        if (i === 1) {
          roots.push(node);
        } else {
          const parentKey = parts.slice(0, i - 1).join('/');
          (dirMap.get(parentKey)!.children as TreeDataNode[]).push(node);
        }
      }
    }

    const fileNode: TreeDataNode = {
      title: file.name,
      key: file.path,
      isLeaf: true,
    };

    if (parts.length === 1) {
      roots.push(fileNode);
    } else {
      const parentKey = parts.slice(0, -1).join('/');
      (dirMap.get(parentKey)!.children as TreeDataNode[]).push(fileNode);
    }
  }

  return roots;
}

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

  const treeData = buildTree(files);

  return (
    <div className="p-6">
      <Title level={4} style={{ marginBottom: 4 }}>
        {t('configIdentity.title')}
      </Title>
      <Text type="secondary">{t('configIdentity.subtitle')}</Text>

      {error && <Alert type="error" title={error} className="mt-3" showIcon />}

      <div className="mt-6 flex gap-6">
        <div className="w-52 flex-shrink-0 border border-border rounded overflow-hidden">
          <div className="px-3 py-2 bg-muted text-sm font-medium text-foreground">
            {t('configIdentity.fileList')}
          </div>
          <div className="max-h-80 overflow-auto p-2">
            {treeData.length === 0 ? (
              <div className="px-1 py-1 text-muted-foreground text-sm">
                {t('configIdentity.noFiles')}
              </div>
            ) : (
              <Tree
                treeData={treeData}
                defaultExpandAll
                selectedKeys={selected ? [selected] : []}
                onSelect={(keys) => {
                  const key = keys[0] as string | undefined;
                  if (key) loadContent(key);
                }}
              />
            )}
          </div>
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
