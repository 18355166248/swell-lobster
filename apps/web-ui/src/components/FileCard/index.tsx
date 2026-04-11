import {
  DownloadOutlined,
  FolderOpenOutlined,
  LoadingOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { getApiBase } from '../../api/base';
import { isTauri } from '../../utils/platform';

interface FileCardProps {
  filename: string;
  /** 相对路径，如 /api/files/report.pptx?localPath=... */
  href: string;
}

interface FileTypeInfo {
  emoji: string;
  color: string;
  label: string;
}

const FILE_TYPE_MAP: Record<string, FileTypeInfo> = {
  pptx: { emoji: '📊', color: 'var(--orange, #f97316)', label: 'PowerPoint' },
  ppt: { emoji: '📊', color: 'var(--orange, #f97316)', label: 'PowerPoint' },
  xlsx: { emoji: '📈', color: 'var(--green, #22c55e)', label: 'Excel' },
  xls: { emoji: '📈', color: 'var(--green, #22c55e)', label: 'Excel' },
  csv: { emoji: '📋', color: 'var(--green, #22c55e)', label: 'CSV' },
  docx: { emoji: '📄', color: 'var(--blue, #3b82f6)', label: 'Word' },
  doc: { emoji: '📄', color: 'var(--blue, #3b82f6)', label: 'Word' },
  pdf: { emoji: '📕', color: 'var(--red, #ef4444)', label: 'PDF' },
  zip: { emoji: '📦', color: 'var(--gray, #6b7280)', label: 'ZIP' },
  png: { emoji: '🖼️', color: 'var(--purple, #a855f7)', label: 'PNG' },
  jpg: { emoji: '🖼️', color: 'var(--purple, #a855f7)', label: 'JPEG' },
  jpeg: { emoji: '🖼️', color: 'var(--purple, #a855f7)', label: 'JPEG' },
};

function getFileTypeInfo(filename: string): FileTypeInfo {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return (
    FILE_TYPE_MAP[ext] ?? {
      emoji: '📁',
      color: 'var(--gray, #6b7280)',
      label: ext.toUpperCase() || 'File',
    }
  );
}

/** 从 /api/files/xxx?localPath=... 中解析本地路径 */
function parseLocalPath(href: string): string | null {
  try {
    const qIndex = href.indexOf('?');
    if (qIndex === -1) return null;
    const params = new URLSearchParams(href.slice(qIndex + 1));
    return params.get('localPath');
  } catch {
    return null;
  }
}

/** 返回纯下载 URL（去掉 query 参数） */
function toDownloadHref(href: string): string {
  const qIndex = href.indexOf('?');
  return qIndex === -1 ? href : href.slice(0, qIndex);
}

export function FileCard({ filename, href }: FileCardProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exists, setExists] = useState<boolean | null>(null);
  const typeInfo = getFileTypeInfo(filename);
  const inTauri = isTauri();
  const localPath = parseLocalPath(href);
  const downloadHref = toDownloadHref(href);

  // 挂载时 HEAD 检查文件是否可访问，不存在则不渲染卡片
  useEffect(() => {
    const url = `${getApiBase()}${downloadHref}`;
    fetch(url, { method: 'HEAD' })
      .then((res) => setExists(res.ok))
      .catch(() => setExists(false));
  }, [downloadHref]);

  // 检查中或文件不存在：不渲染
  if (exists !== true) return null;

  /** Web 模式：用 /api/shell/open 调系统默认程序打开 */
  const handleWebOpen = async () => {
    if (loading || !localPath) return;
    setLoading(true);
    setError(null);
    try {
      const url = `${getApiBase()}/api/shell/open?path=${encodeURIComponent(localPath)}`;
      const res = await fetch(url);
      if (!res.ok) setError(await res.text());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  /** Web 模式：触发文件下载 */
  const handleWebDownload = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const url = `${getApiBase()}${downloadHref}`;
      const check = await fetch(url, { method: 'HEAD' });
      if (!check.ok) {
        setError(`HTTP ${check.status}`);
        return;
      }
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  /** Tauri 模式：用 Rust command 打开 */
  const handleTauriOpen = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      // 优先用 localPath（后端实际保存路径），fallback 到 get_output_dir + filename
      let filePath: string;
      if (localPath) {
        filePath = localPath;
      } else {
        const outputDir: string = await invoke('get_output_dir');
        const s = outputDir.includes('\\') ? '\\' : '/';
        filePath = outputDir.replace(/[/\\]$/, '') + s + filename;
      }
      await invoke('open_file', { path: filePath });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  /** Tauri 模式：另存为 */
  const handleTauriSaveAs = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const ext = filename.split('.').pop() ?? '';
      const savePath = await save({
        defaultPath: filename,
        filters: ext ? [{ name: typeInfo.label, extensions: [ext] }] : [],
      });
      if (!savePath) return;
      const url = `${getApiBase()}${downloadHref}`;
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      await writeFile(savePath, new Uint8Array(buf));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  // 截取路径尾部用于展示（最多 48 字符）
  const pathLabel = localPath
    ? localPath.length > 48
      ? '…' + localPath.slice(-48)
      : localPath
    : null;

  return (
    <div className="inline-flex items-center gap-3 my-2 px-4 py-3 rounded-xl border border-border bg-muted max-w-sm w-full">
      {/* 文件图标 */}
      <span className="text-2xl leading-none flex-shrink-0" role="img" aria-label={typeInfo.label}>
        {typeInfo.emoji}
      </span>

      {/* 文件信息 */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate" title={filename}>
          {filename}
        </p>
        {error ? (
          <p className="text-xs text-red-500 mt-0.5 flex items-center gap-1 truncate" title={error}>
            <WarningOutlined />
            {error}
          </p>
        ) : pathLabel ? (
          <p
            className="text-xs text-muted-foreground mt-0.5 truncate font-mono"
            title={localPath ?? undefined}
          >
            {pathLabel}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground mt-0.5">{typeInfo.label}</p>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {inTauri ? (
          <>
            <button
              onClick={handleTauriOpen}
              disabled={loading}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors bg-background hover:bg-muted text-foreground border border-border disabled:opacity-50"
              title={t('chat.fileOpen')}
            >
              {loading ? <LoadingOutlined /> : <FolderOpenOutlined />}
              {t('chat.fileOpen')}
            </button>
            <button
              onClick={handleTauriSaveAs}
              disabled={loading}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors bg-background hover:bg-muted text-foreground border border-border disabled:opacity-50"
              title={t('chat.fileSaveAs')}
            >
              <DownloadOutlined />
              {t('chat.fileSaveAs')}
            </button>
          </>
        ) : (
          <>
            {/* Web 模式：打开（调系统默认程序）*/}
            {localPath && (
              <button
                onClick={handleWebOpen}
                disabled={loading}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors bg-background hover:bg-muted text-foreground border border-border disabled:opacity-50"
                title={t('chat.fileOpen')}
              >
                {loading ? <LoadingOutlined /> : <FolderOpenOutlined />}
                {t('chat.fileOpen')}
              </button>
            )}
            {/* Web 模式：下载 */}
            <button
              onClick={handleWebDownload}
              disabled={loading}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors bg-background hover:bg-muted text-foreground border border-border disabled:opacity-50"
              title={t('chat.fileDownload')}
            >
              {loading ? <LoadingOutlined /> : <DownloadOutlined />}
              {t('chat.fileDownload')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
