import { join } from 'node:path';

import ExcelJS from 'exceljs';
import { z } from 'zod';

import { ToolRiskLevel, type ToolDef } from '../types.js';
import {
  buildOutputFileRef,
  ensureOutputDir,
  formatOutputFileResult,
  sanitizeBaseName,
} from '../outputFiles.js';

const cellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const sheetSchema = z.object({
  name: z.string().trim().min(1).max(31),
  columns: z.array(z.string().trim().min(1)).optional(),
  rows: z.array(z.array(cellSchema)).min(1),
  freezeHeader: z.boolean().optional(),
});

const argsSchema = z.object({
  filename: z.string().trim().min(1),
  sheets: z.array(sheetSchema).min(1),
});

export const xlsxWriterTool: ToolDef = {
  name: 'xlsx_writer',
  description:
    '生成 Excel 工作簿（.xlsx）并写入输出目录，适合表格整理、汇总和多 sheet 数据交付。',
  permission: {
    riskLevel: ToolRiskLevel.write,
    requiresApproval: false,
    pathScopes: ['data/outputs/'],
    sideEffectSummary: 'Writes a generated .xlsx workbook into the local outputs directory.',
  },
  parameters: {
    filename: {
      type: 'string',
      description: '输出文件名，不带扩展名，例如 metrics-summary',
      required: true,
    },
    sheets: {
      type: 'array',
      description:
        'sheet 数组。每项包含 name、rows，可选 columns 和 freezeHeader。rows 为二维数组，支持 string/number/boolean/null。',
      required: true,
      items: { type: 'object' },
    },
  },
  async execute(args) {
    const parsed = argsSchema.safeParse(args);
    if (!parsed.success) {
      return `xlsx_writer 参数校验失败：${parsed.error.issues[0]?.message ?? 'invalid args'}`;
    }

    const workbook = new ExcelJS.Workbook();
    for (const sheet of parsed.data.sheets) {
      const worksheet = workbook.addWorksheet(sheet.name);
      if (sheet.columns?.length) {
        worksheet.columns = sheet.columns.map((header) => ({
          header,
          key: header,
          width: Math.max(14, Math.min(32, header.length + 6)),
        }));
      }

      for (const row of sheet.rows) {
        worksheet.addRow(row);
      }

      const hasHeader = Boolean(sheet.columns?.length);
      const headerRow = hasHeader ? 1 : 0;
      if (sheet.freezeHeader && headerRow > 0) {
        worksheet.views = [{ state: 'frozen', ySplit: 1 }];
      }

      if (headerRow > 0) {
        worksheet.getRow(1).font = { bold: true };
      }
    }

    const outputDir = ensureOutputDir();
    const safeBase = sanitizeBaseName(parsed.data.filename, 'workbook');
    const outputPath = join(outputDir, `${safeBase}.xlsx`);
    await workbook.xlsx.writeFile(outputPath);

    const ref = buildOutputFileRef(`${safeBase}.xlsx`, outputPath);
    return formatOutputFileResult('Excel 工作簿', ref, [
      `- Sheet 数：${parsed.data.sheets.length}`,
    ]);
  },
};
