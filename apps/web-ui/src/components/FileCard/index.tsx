import {
  DownloadOutlined,
  FolderOpenOutlined,
  LoadingOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiBase } from '../../api/base';
import { isTauri } from '../../utils/platform';

interface FileCardProps {
  filename: string;
  /** 相对路径，如 /api/files/report.pptx */
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

export function FileCard({ filename, href }: FileCardProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const typeInfo = getFileTypeInfo(filename);
  const inTauri = isTauri();

  const handleOpen = async () => {
    if (loading) return;
    setLoading(true);
    setError(false);
    try {
      if (inTauri) {
        // Tauri 模式：通过 Rust command 用系统默认程序打开文件
        const { invoke } = await import(/* @vite-ignore */ '@tauri-apps/api/core');
        // get_output_dir 返回本地输出目录，拼接文件名得到本地路径
        const outputDir: string = await invoke('get_output_dir');
        const localPath =
          outputDir.replace(/[/\\]$/, '') + (outputDir.includes('\\') ? '\\' : '/') + filename;
        await invoke('open_file', { path: localPath });
      } else {
        // Web 模式：先 HEAD 验证文件存在，再触发下载
        const url = `${getApiBase()}${href}`;
        const check = await fetch(url, { method: 'HEAD' });
        if (!check.ok) {
          setError(true);
          return;
        }
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAs = async () => {
    if (!inTauri || loading) return;
    setLoading(true);
    try {
      const { save } = await import(/* @vite-ignore */ '@tauri-apps/plugin-dialog');
      const ext = filename.split('.').pop() ?? '';
      const savePath = await save({
        defaultPath: filename,
        filters: ext ? [{ name: typeInfo.label, extensions: [ext] }] : [],
      });
      if (!savePath) return;

      // 从 tide-lobster HTTP API 下载文件内容，再写入用户选择的路径
      const { writeFile } = await import(/* @vite-ignore */ '@tauri-apps/plugin-fs');
      const url = `${getApiBase()}${href}`;
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      await writeFile(savePath, new Uint8Array(buf));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-3 my-2 px-4 py-3 rounded-xl border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surfaceHover max-w-xs w-full">
      {/* 文件图标 */}
      <span className="text-2xl leading-none flex-shrink-0" role="img" aria-label={typeInfo.label}>
        {typeInfo.emoji}
      </span>

      {/* 文件信息 */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium dark:text-claude-darkText text-claude-text truncate"
          title={filename}
        >
          {filename}
        </p>
        {error ? (
          <p className="text-xs text-red-500 mt-0.5 flex items-center gap-1">
            <WarningOutlined />
            {t('chat.fileNotFound')}
          </p>
        ) : (
          <p className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary mt-0.5">
            {typeInfo.label}
          </p>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={handleOpen}
          disabled={loading}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors dark:bg-claude-darkSurfaceMuted dark:hover:bg-claude-darkSurfaceHover bg-white hover:bg-claude-surface dark:text-claude-darkText text-claude-text border dark:border-claude-darkBorder border-claude-border disabled:opacity-50"
          title={inTauri ? t('chat.fileOpen') : t('chat.fileDownload')}
        >
          {loading ? (
            <LoadingOutlined className="h-3.5 w-3.5" />
          ) : inTauri ? (
            <FolderOpenOutlined className="h-3.5 w-3.5" />
          ) : (
            <DownloadOutlined className="h-3.5 w-3.5" />
          )}
          {inTauri ? t('chat.fileOpen') : t('chat.fileDownload')}
        </button>

        {/* Tauri 模式额外提供「另存为」 */}
        {inTauri && (
          <button
            onClick={handleSaveAs}
            disabled={loading}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors dark:bg-claude-darkSurfaceMuted dark:hover:bg-claude-darkSurfaceHover bg-white hover:bg-claude-surface dark:text-claude-darkText text-claude-text border dark:border-claude-darkBorder border-claude-border disabled:opacity-50"
            title={t('chat.fileSaveAs')}
          >
            <DownloadOutlined className="h-3.5 w-3.5" />
            {t('chat.fileSaveAs')}
          </button>
        )}
      </div>
    </div>
  );
}
