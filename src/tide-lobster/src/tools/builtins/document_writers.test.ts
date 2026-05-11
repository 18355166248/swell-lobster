import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('document writer builtins', () => {
  let repoRoot = '';
  let dataDir = '';

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'swell-doc-writers-test-'));
    dataDir = join(repoRoot, 'data');
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(join(repoRoot, 'identity'), { recursive: true });
    writeFileSync(join(repoRoot, 'identity', 'assistant.md'), 'You are a test assistant.');
    process.env.SWELL_PROJECT_ROOT = repoRoot;
    process.env.SWELL_DATA_DIR = dataDir;
    process.env.SWELL_IDENTITY_DIR = join(repoRoot, 'identity');
    process.env.SWELL_GLOBAL_ENV_DIR = repoRoot;
    vi.resetModules();
  });

  afterEach(async () => {
    const { closeDb } = await import('../../db/index.js');
    closeDb();
    rmSync(repoRoot, { recursive: true, force: true });
    delete process.env.SWELL_PROJECT_ROOT;
    delete process.env.SWELL_DATA_DIR;
    delete process.env.SWELL_IDENTITY_DIR;
    delete process.env.SWELL_GLOBAL_ENV_DIR;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns validation errors for invalid args', async () => {
    const { docxWriterTool } = await import('./docx_writer.js');
    const result = await docxWriterTool.execute({ filename: '', sections: [] });
    expect(result).toContain('参数校验失败');
  });

  it('writes docx/xlsx/pptx outputs into the outputs directory', async () => {
    const { docxWriterTool } = await import('./docx_writer.js');
    const { xlsxWriterTool } = await import('./xlsx_writer.js');
    const { pptxWriterTool } = await import('./pptx_writer.js');

    const docxResult = await docxWriterTool.execute({
      filename: 'weekly-report',
      title: 'Weekly Report',
      sections: [
        {
          heading: { level: 1, text: 'Summary' },
          paragraphs: ['Completed the milestone.'],
          bullets: ['Item A', 'Item B'],
        },
      ],
    });
    const xlsxResult = await xlsxWriterTool.execute({
      filename: 'metrics-summary',
      sheets: [
        {
          name: 'Metrics',
          columns: ['Metric', 'Value'],
          rows: [
            ['Coverage', '80%'],
            ['Latency', '120ms'],
          ],
          freezeHeader: true,
        },
      ],
    });
    const pptxResult = await pptxWriterTool.execute({
      filename: 'project-brief',
      slides: [
        {
          layout: 'title',
          title: 'Project Brief',
          body: ['Status update'],
        },
        {
          layout: 'title-content',
          title: 'Highlights',
          body: ['Done', 'Risks'],
        },
      ],
    });

    const outputDir = join(dataDir, 'outputs');
    expect(docxResult).toContain('/api/files/weekly-report.docx');
    expect(xlsxResult).toContain('/api/files/metrics-summary.xlsx');
    expect(pptxResult).toContain('/api/files/project-brief.pptx');
    expect(existsSync(join(outputDir, 'weekly-report.docx'))).toBe(true);
    expect(existsSync(join(outputDir, 'metrics-summary.xlsx'))).toBe(true);
    expect(existsSync(join(outputDir, 'project-brief.pptx'))).toBe(true);
  });

  it('registers document writers into the builtin registry', async () => {
    const { initializeBuiltinTools } = await import('../index.js');
    const { globalToolRegistry } = await import('../registry.js');
    initializeBuiltinTools();

    expect(globalToolRegistry.get('docx_writer')?.name).toBe('docx_writer');
    expect(globalToolRegistry.get('xlsx_writer')?.name).toBe('xlsx_writer');
    expect(globalToolRegistry.get('pptx_writer')?.name).toBe('pptx_writer');
  });
});
