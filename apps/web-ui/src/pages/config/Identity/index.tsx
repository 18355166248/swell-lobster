import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../../api/base';

type FileItem = { path: string; name: string };

export function ConfigIdentityPage() {
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
      setError(e instanceof Error ? e.message : '加载失败');
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
      setError(e instanceof Error ? e.message : '读取失败');
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
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-stone-600">加载中...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-stone-800">身份配置</h1>
      <p className="mt-1 text-stone-600 text-sm">
        SOUL、AGENT、USER、MEMORY、personas、policies 等
      </p>
      {error && (
        <div className="mt-3 px-3 py-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>
      )}
      <div className="mt-6 flex gap-6">
        <div className="w-48 flex-shrink-0 border border-stone-200 rounded overflow-hidden">
          <div className="px-3 py-2 bg-stone-100 text-sm font-medium text-stone-700">文件列表</div>
          <ul className="max-h-80 overflow-auto">
            {files.length === 0 ? (
              <li className="px-3 py-2 text-stone-500 text-sm">暂无文件</li>
            ) : (
              files.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    onClick={() => loadContent(f.path)}
                    className={`w-full text-left px-3 py-2 text-sm block hover:bg-stone-100 ${
                      selected === f.path ? 'bg-stone-200 font-medium' : ''
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
                className="w-full h-80 p-3 border border-stone-200 rounded font-mono text-sm"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </>
          ) : (
            <p className="text-stone-500 text-sm">选择左侧文件进行编辑</p>
          )}
        </div>
      </div>
    </div>
  );
}
