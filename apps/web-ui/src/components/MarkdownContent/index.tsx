import React, { useState, useRef, useEffect, useCallback, useMemo, useId } from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import { FileCard } from '../FileCard';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import 'katex/contrib/mhchem';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { CopyOutlined, CheckOutlined, ExpandOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { Modal } from 'antd';
import { useTranslation } from 'react-i18next'; // Using useTranslation instead of i18nService
import mermaid from 'mermaid';
import { getApiBase } from '../../api/base';
import { isTauri } from '../../utils/platform';

const CODE_BLOCK_LINE_LIMIT = 200;
const CODE_BLOCK_CHAR_LIMIT = 20000;
const SYNTAX_HIGHLIGHTER_STYLE = {
  margin: 0,
  borderRadius: 0,
  background: '#282c34',
};

// Initialize mermaid with configuration
mermaid.initialize({
  startOnLoad: false, // 禁用自动渲染 自定义渲染
  theme: 'default',
  securityLevel: 'strict',
});
const SAFE_URL_PROTOCOLS = new Set(['http', 'https', 'mailto', 'tel', 'file']);

const MermaidBlock: React.FC<{ code: string }> = ({ code }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const uniqueId = useId();

  useEffect(() => {
    const renderMermaid = async () => {
      if (!containerRef.current) return;

      // Sanitize LLM-generated Mermaid code:
      // 1. Remove inline class annotations (:::className) — often unsupported or misconfigured
      // 2. For mindmap: collapse multiple consecutive spaces within node content (not indentation)
      //    to prevent SPACELIST parse errors when LLM puts multiple items on one line
      let sanitizedCode = code.replace(/\s*:::[a-zA-Z][\w-]*/g, '');
      if (sanitizedCode.trimStart().startsWith('mindmap')) {
        sanitizedCode = sanitizedCode
          .split('\n')
          .map((line) => {
            const indentMatch = line.match(/^(\s*)/);
            const indent = indentMatch ? indentMatch[1] : '';
            const content = line.slice(indent.length);
            let sanitized = content.replace(/ {2,}/g, ' ');
            // Mermaid mindmap treats "(text)" as shape notation.
            // When (text) appears mid-line with content after it (e.g. "Poke (生鱼饭) 🍚"),
            // the parser errors with SPACELIST on the next line.
            // Strip parens only when something follows the closing ")" on the same line.
            sanitized = sanitized.replace(/\(([^)]*)\)(?=.)/g, '$1');
            return indent + sanitized;
          })
          .join('\n');
      }

      try {
        setError('');

        // First validate the diagram syntax
        try {
          await mermaid.parse(sanitizedCode);
        } catch (parseError) {
          console.error('Mermaid syntax validation failed:', parseError);
          setError(parseError instanceof Error ? parseError.message : 'Invalid Mermaid syntax');
          return;
        }

        // Generate a unique ID for this diagram
        const diagramId = `mermaid-${uniqueId}-${Date.now()}`;

        // Render the diagram
        const { svg: renderedSvg } = await mermaid.render(diagramId, sanitizedCode);

        // Check if SVG is empty or just contains empty elements
        const isEmptySvg =
          !renderedSvg ||
          renderedSvg.trim() === '' ||
          renderedSvg.includes('<svg></svg>') ||
          renderedSvg.includes('<svg/>') ||
          (renderedSvg.includes('<svg') &&
            renderedSvg.includes('</svg>') &&
            !renderedSvg
              .replace(/<svg[^>]*>/g, '')
              .replace(/<\/svg>/g, '')
              .trim());

        if (isEmptySvg) {
          console.error('Mermaid rendered empty SVG for code:', code);
          setError('Diagram rendered empty - check your Mermaid syntax');
          return;
        }

        setSvg(renderedSvg);
      } catch (err) {
        console.error('Mermaid rendering error:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to render diagram';
        setError(errorMessage);
      }
    };

    renderMermaid();
  }, [code, uniqueId]);

  if (error) {
    return (
      <div className="my-3 rounded-xl overflow-hidden border dark:border-claude-darkBorder border-claude-border">
        <div className="dark:bg-claude-darkSurfaceMuted bg-claude-surfaceMuted px-4 py-2 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary font-medium">
          mermaid (error)
        </div>
        <div className="p-4 text-red-500 text-sm">
          <div className="font-medium mb-2">Error rendering diagram:</div>
          <div className="text-xs font-mono bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-800">
            {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="my-3 rounded-xl overflow-hidden">
        <div className="dark:bg-claude-darkSurfaceMuted bg-claude-surfaceMuted px-4 py-2 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary font-medium flex items-center justify-between">
          <span>Mermaid</span>
          {svg && (
            <button
              onClick={() => setPreviewOpen(true)}
              className="flex items-center gap-1 hover:opacity-70 transition-opacity cursor-pointer"
              title="放大预览"
            >
              <ExpandOutlined />
            </button>
          )}
        </div>
        <div
          ref={containerRef}
          className="p-4 bg-white dark:bg-gray-900 overflow-auto cursor-zoom-in"
          onClick={() => svg && setPreviewOpen(true)}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
      <Modal
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={null}
        width="90vw"
        style={{ top: 20 }}
        styles={{ body: { padding: '24px', maxHeight: '85vh', overflow: 'auto' } }}
        title="Mermaid 预览"
      >
        <div
          className="flex items-center justify-center bg-white dark:bg-gray-900 rounded"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </Modal>
    </>
  );
};

const encodeFileUrl = (url: string): string => {
  const encoded = encodeURI(url);
  return encoded.replace(/\(/g, '%28').replace(/\)/g, '%29');
};

const encodeFileUrlDestination = (dest: string): string => {
  const trimmed = dest.trim();
  if (!/^<?file:\/\//i.test(trimmed)) {
    return dest;
  }

  let core = trimmed;
  let prefix = '';
  let suffix = '';
  if (core.startsWith('<') && core.endsWith('>')) {
    prefix = '<';
    suffix = '>';
    core = core.slice(1, -1);
  }

  const encoded = encodeFileUrl(core);
  return dest.replace(trimmed, `${prefix}${encoded}${suffix}`);
};

const findMarkdownLinkEnd = (input: string, start: number): number => {
  let depth = 1;
  for (let i = start; i < input.length; i += 1) {
    const char = input[i];
    if (char === '\\') {
      i += 1;
      continue;
    }
    if (char === '(') {
      depth += 1;
      continue;
    }
    if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
    if (char === '\n') {
      return -1;
    }
  }
  return -1;
};

const encodeFileUrlsInMarkdown = (content: string): string => {
  if (!content.includes('file://')) {
    return content;
  }

  let result = '';
  let cursor = 0;
  while (cursor < content.length) {
    const openIndex = content.indexOf('](', cursor);
    if (openIndex === -1) {
      result += content.slice(cursor);
      break;
    }

    result += content.slice(cursor, openIndex + 2);
    const destStart = openIndex + 2;
    const destEnd = findMarkdownLinkEnd(content, destStart);
    if (destEnd === -1) {
      result += content.slice(destStart);
      break;
    }

    const dest = content.slice(destStart, destEnd);
    result += encodeFileUrlDestination(dest);
    result += ')';
    cursor = destEnd + 1;
  }
  return result;
};

/**
 * Normalize multi-line display math blocks for remark-math compatibility.
 * remark-math treats $$ like code fences: opening $$ must be on its own line,
 * and closing $$ must also be on its own line.
 * LLMs often output $$content\n...\ncontent$$ which breaks parsing and corrupts
 * all subsequent markdown. This function normalizes such blocks.
 */
const normalizeDisplayMath = (content: string): string => {
  return content.replace(/\$\$([\s\S]+?)\$\$/g, (match, inner) => {
    if (!inner.includes('\n')) {
      return match;
    }
    return `$$\n${inner.trim()}\n$$`;
  });
};

/** 判断字符串是否是绝对文件路径（Windows 或 Unix），且带扩展名 */
function looksLikeFilePath(text: string): boolean {
  // Windows: C:\... 或 C:/...
  if (/^[A-Za-z]:[/\\]/.test(text) && /\.[a-zA-Z0-9]{2,8}$/.test(text)) return true;
  // Unix: /foo/bar.ext（排除 // 开头的协议 URL）
  if (/^\/(?!\/)/.test(text) && /\.[a-zA-Z0-9]{2,8}$/.test(text) && text.includes('/')) return true;
  return false;
}

/** inline 文件路径：显示路径 + 快捷打开按钮 */
const InlineFilePath: React.FC<{ path: string }> = ({ path }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const handleOpen = async () => {
    if (loading) return;
    setLoading(true);
    setError(false);
    try {
      if (isTauri()) {
        const { invoke } = await import(/* @vite-ignore */ '@tauri-apps/api/core');
        await invoke('open_file', { path });
      } else {
        const url = `${getApiBase()}/api/shell/open?path=${encodeURIComponent(path)}`;
        const res = await fetch(url);
        if (!res.ok) setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1">
      <code className="inline bg-transparent px-0.5 text-[0.92em] font-mono font-medium dark:text-claude-darkText text-claude-text">
        {path}
      </code>
      <button
        type="button"
        onClick={handleOpen}
        disabled={loading}
        className="inline-flex items-center px-1 py-0.5 text-xs rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
        title="在系统中打开"
      >
        {error ? '✗' : <FolderOpenOutlined />}
      </button>
    </span>
  );
};

const safeUrlTransform = (url: string): string => {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  const match = trimmed.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!match) {
    return trimmed;
  }

  const protocol = match[1].toLowerCase();
  if (SAFE_URL_PROTOCOLS.has(protocol)) {
    return trimmed;
  }

  return '';
};

// Electron-specific functions removed or commented out for web-ui
// const getHrefProtocol = (href: string): string | null => { /* ... */ };
// const isExternalHref = (href: string): boolean => { /* ... */ };
// const openExternalViaDefaultBrowser = async (url: string): Promise<boolean> => { /* ... */ };
// const openExternalViaAnchorFallback = (url: string): void => { /* ... */ };
// const safeDecodeURIComponent = (value: string): string => { /* ... */ };
// const stripHashAndQuery = (value: string): string => value.split('#')[0].split('?')[0];
// const stripFileProtocol = (value: string): string => { /* ... */ };
// const hasFileExtension = (value: string): boolean => /\.[A-Za-z0-9]{1,6}$/.test(value);
// const looksLikeDirectory = (value: string): boolean => { /* ... */ };
// const isLikelyLocalFilePath = (href: string): boolean => { /* ... */ };
// const toFileHref = (filePath: string): string => { /* ... */ };
// const getLocalPathFromLink = ( /* ... */ ) => { /* ... */ };
// const findFallbackPathFromContext = ( /* ... */ ) => { /* ... */ };

const CodeBlock: Components['code'] = ({ node, className, children, ...props }) => {
  const { t } = useTranslation(); // Use useTranslation hook
  const normalizedClassName = Array.isArray(className) ? className.join(' ') : className || '';
  const match = /language-([\w-]+)/.exec(normalizedClassName);
  const hasPosition = node?.position?.start?.line != null && node?.position?.end?.line != null;
  const isInline =
    typeof (props as { inline?: boolean }).inline === 'boolean'
      ? (props as { inline?: boolean }).inline
      : hasPosition && node?.position
        ? node.position.start.line === node.position.end.line
        : !match;
  const codeText = Array.isArray(children) ? children.join('') : String(children);
  const trimmedCodeText = codeText.replace(/\n$/, '');
  const shouldHighlight =
    !isInline &&
    match &&
    trimmedCodeText.length <= CODE_BLOCK_CHAR_LIMIT &&
    trimmedCodeText.split('\n').length <= CODE_BLOCK_LINE_LIMIT;
  const [isCopied, setIsCopied] = useState(false);
  const copyTimeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copyTimeoutRef.current != null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    },
    []
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(trimmedCodeText);
      setIsCopied(true);
      if (copyTimeoutRef.current != null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => setIsCopied(false), 1500);
    } catch (error) {
      console.error('Failed to copy code block: ', error);
    }
  }, [trimmedCodeText]);

  if (!isInline) {
    // Check if this is a mermaid code block
    if (match && match[1] === 'mermaid') {
      return <MermaidBlock code={trimmedCodeText} />;
    }

    // Simple code block without language - minimal styling
    if (!match) {
      return (
        <div className="my-2 relative group">
          <div className="overflow-x-auto rounded-lg bg-[#282c34] text-[13px] leading-6">
            <button
              type="button"
              onClick={handleCopy}
              className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-gray-700/80 text-gray-300 hover:bg-gray-600 transition-colors opacity-0 group-hover:opacity-100"
              title={t('copyToClipboard')} // Use t() for translation
              aria-label={t('copyToClipboard')} // Use t() for translation
            >
              {isCopied ? (
                <CheckOutlined className="h-4 w-4 text-green-500" />
              ) : (
                <CopyOutlined className="h-4 w-4" />
              )}
            </button>
            <code className="block px-4 py-3 font-mono text-claude-darkText whitespace-pre">
              {trimmedCodeText}
            </code>
          </div>
        </div>
      );
    }

    // Code block with language - show header with language name
    return (
      <div className="my-3 rounded-xl overflow-hidden border dark:border-claude-darkBorder border-claude-border relative shadow-subtle">
        <div className="dark:bg-claude-darkSurfaceMuted bg-claude-surfaceMuted px-4 py-2 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary font-medium flex items-center justify-between">
          <span>{match[1]}</span>
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded-md dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover transition-colors"
            title={t('copyToClipboard')} // Use t() for translation
            aria-label={t('copyToClipboard')} // Use t() for translation
          >
            {isCopied ? (
              <CheckOutlined className="h-4 w-4 text-green-500" />
            ) : (
              <CopyOutlined className="h-4 w-4" />
            )}
          </button>
        </div>
        {shouldHighlight ? (
          <SyntaxHighlighter
            style={oneDark}
            language={match[1]}
            PreTag="div"
            customStyle={SYNTAX_HIGHLIGHTER_STYLE}
          >
            {trimmedCodeText}
          </SyntaxHighlighter>
        ) : (
          <div className="m-0 overflow-x-auto bg-[#282c34] text-[13px] leading-6">
            <code className="block px-4 py-3 font-mono text-claude-darkText whitespace-pre">
              {trimmedCodeText}
            </code>
          </div>
        )}
      </div>
    );
  }

  const inlineClassName = [
    'inline bg-transparent px-0.5 text-[0.92em] font-mono font-medium dark:text-claude-darkText text-claude-text',
    normalizedClassName,
  ]
    .filter(Boolean)
    .join(' ');

  // 绝对文件路径：渲染为可点击打开的 inline 路径组件
  if (looksLikeFilePath(codeText)) {
    return <InlineFilePath path={codeText} />;
  }

  return (
    <code className={inlineClassName} {...props}>
      {children}
    </code>
  );
};

const createMarkdownComponents = () => {
  // Removed resolveLocalFilePath parameter
  return {
    p: ({ children, ...props }: ComponentPropsWithoutRef<'p'>) => (
      <p
        className="my-1 first:mt-0 last:mb-0 leading-6 dark:text-claude-darkText text-claude-text"
        {...props}
      >
        {children}
      </p>
    ),
    strong: ({ children, ...props }: ComponentPropsWithoutRef<'strong'>) => (
      <strong className="font-semibold dark:text-claude-darkText text-claude-text" {...props}>
        {children}
      </strong>
    ),
    h1: ({ children, ...props }: ComponentPropsWithoutRef<'h1'>) => (
      <h1
        className="text-2xl font-semibold mt-6 mb-3 dark:text-claude-darkText text-claude-text"
        {...props}
      >
        {children}
      </h1>
    ),
    h2: ({ children, ...props }: ComponentPropsWithoutRef<'h2'>) => (
      <h2
        className="text-xl font-semibold mt-5 mb-2 dark:text-claude-darkText text-claude-text"
        {...props}
      >
        {children}
      </h2>
    ),
    h3: ({ children, ...props }: ComponentPropsWithoutRef<'h3'>) => (
      <h3
        className="text-lg font-semibold mt-4 mb-2 dark:text-claude-darkText text-claude-text"
        {...props}
      >
        {children}
      </h3>
    ),
    ul: ({ children, ...props }: ComponentPropsWithoutRef<'ul'>) => (
      <ul className="list-disc pl-5 my-1.5 dark:text-claude-darkText text-claude-text" {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }: ComponentPropsWithoutRef<'ol'>) => (
      <ol
        className="list-decimal pl-6 my-1.5 dark:text-claude-darkText text-claude-text"
        {...props}
      >
        {children}
      </ol>
    ),
    li: ({ children, ...props }: ComponentPropsWithoutRef<'li'>) => (
      <li className="my-0.5 leading-6 dark:text-claude-darkText text-claude-text" {...props}>
        {children}
      </li>
    ),
    /**
     * @description 引用块
     * @param children 子元素
     * @param props 属性
     * @returns 引用块
     */
    blockquote: ({ children, ...props }: ComponentPropsWithoutRef<'blockquote'>) => (
      <blockquote
        className="border-l-4 border-claude-accent pl-4 py-1 my-2 dark:bg-claude-darkSurface/30 bg-claude-surfaceHover/30 rounded-r-lg dark:text-claude-darkText text-claude-text"
        {...props}
      >
        {children}
      </blockquote>
    ),
    code: CodeBlock,
    table: ({ children, ...props }: ComponentPropsWithoutRef<'table'>) => (
      <div className="my-4 overflow-x-auto rounded-xl border dark:border-claude-darkBorder border-claude-border">
        <table className="border-collapse w-full" {...props}>
          {children}
        </table>
      </div>
    ),
    thead: ({ children, ...props }: ComponentPropsWithoutRef<'thead'>) => (
      <thead className="dark:bg-claude-darkSurface bg-claude-surfaceHover" {...props}>
        {children}
      </thead>
    ),
    tbody: ({ children, ...props }: ComponentPropsWithoutRef<'tbody'>) => (
      <tbody className="divide-y dark:divide-claude-darkBorder divide-claude-border" {...props}>
        {children}
      </tbody>
    ),
    tr: ({ children, ...props }: ComponentPropsWithoutRef<'tr'>) => (
      <tr className="divide-x dark:divide-claude-darkBorder divide-claude-border" {...props}>
        {children}
      </tr>
    ),
    th: ({ children, ...props }: ComponentPropsWithoutRef<'th'>) => (
      <th
        className="px-4 py-2 text-left font-semibold dark:text-claude-darkText text-claude-text"
        {...props}
      >
        {children}
      </th>
    ),
    td: ({ children, ...props }: ComponentPropsWithoutRef<'td'>) => (
      <td className="px-4 py-2 dark:text-claude-darkText text-claude-text" {...props}>
        {children}
      </td>
    ),
    img: (props: ComponentPropsWithoutRef<'img'>) => (
      <img className="max-w-full h-auto rounded-xl my-4" {...props} />
    ),
    hr: (props: ComponentPropsWithoutRef<'hr'>) => (
      <hr className="my-5 dark:border-claude-darkBorder border-claude-border" {...props} />
    ),
    a: ({ href, children, ...props }: ComponentPropsWithoutRef<'a'>) => {
      const hrefValue = typeof href === 'string' ? href.trim() : '';

      // /api/files/ 开头 → 渲染为文件卡片（Web 下载 / Tauri 本地打开）
      if (hrefValue.startsWith('/api/files/')) {
        const pathPart = hrefValue.split('/').pop() ?? '';
        const filename = decodeURIComponent(pathPart.split('?')[0]);
        return <FileCard filename={filename} href={hrefValue} />;
      }

      const isExternalLink =
        hrefValue && !hrefValue.startsWith('#') && !hrefValue.startsWith('mailto:');

      if (isExternalLink) {
        return (
          <a
            href={hrefValue}
            target="_blank"
            rel="noopener noreferrer"
            className="text-claude-accent hover:text-claude-accentHover underline decoration-claude-accent/50 hover:decoration-claude-accent transition-colors"
            {...props}
          >
            {children}
          </a>
        );
      }

      return (
        <a
          href={hrefValue}
          className="text-claude-accent hover:text-claude-accentHover underline decoration-claude-accent/50 hover:decoration-claude-accent transition-colors"
          {...props}
        >
          {children}
        </a>
      );
    },
  };
};

interface MarkdownContentProps {
  content: string;
  className?: string;
  // resolveLocalFilePath?: (href: string, text: string) => string | null; // Removed Electron-specific prop
}

const MarkdownContent: React.FC<MarkdownContentProps> = ({
  content,
  className = '',
  // resolveLocalFilePath, // Removed Electron-specific prop
}) => {
  const components = useMemo(() => createMarkdownComponents(), []); // No dependencies needed
  const normalizedContent = useMemo(
    () => normalizeDisplayMath(encodeFileUrlsInMarkdown(content)),
    [content]
  );
  return (
    <div className={`markdown-content text-[15px] leading-6 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        urlTransform={safeUrlTransform}
        components={components}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownContent;
