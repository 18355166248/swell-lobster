import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';
import type * as Docx from 'docx';

import { ToolRiskLevel, type ToolDef } from '../types.js';
import {
  buildOutputFileRef,
  ensureOutputDir,
  formatOutputFileResult,
  sanitizeBaseName,
} from '../outputFiles.js';

const headingSchema = z.object({
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: z.string().trim().min(1),
});

const paragraphItemSchema = z.union([
  z.string().trim().min(1),
  z.object({
    text: z.string().trim().min(1),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
  }),
]);

const tableSchema = z.object({
  headers: z.array(z.string()).min(1),
  rows: z.array(z.array(z.string())),
});

const sectionSchema = z.object({
  heading: headingSchema.optional(),
  paragraphs: z.array(paragraphItemSchema).optional(),
  bullets: z.array(z.string().trim().min(1)).optional(),
  table: tableSchema.optional(),
});

const argsSchema = z.object({
  filename: z.string().trim().min(1),
  title: z.string().trim().optional(),
  sections: z.array(sectionSchema).min(1),
});

type DocxModule = typeof Docx;
type DocxChild = InstanceType<DocxModule['Paragraph']> | InstanceType<DocxModule['Table']>;

function toHeading(
  docx: DocxModule,
  level: 1 | 2 | 3
): (typeof Docx.HeadingLevel)[keyof typeof Docx.HeadingLevel] {
  if (level === 1) return docx.HeadingLevel.HEADING_1;
  if (level === 2) return docx.HeadingLevel.HEADING_2;
  return docx.HeadingLevel.HEADING_3;
}

function buildParagraph(docx: DocxModule, item: z.infer<typeof paragraphItemSchema>) {
  if (typeof item === 'string') {
    return new docx.Paragraph({ children: [new docx.TextRun(item)] });
  }
  return new docx.Paragraph({
    children: [
      new docx.TextRun({
        text: item.text,
        bold: item.bold,
        italics: item.italic,
      }),
    ],
  });
}

function buildTable(docx: DocxModule, table: z.infer<typeof tableSchema>) {
  const rows = [
    new docx.TableRow({
      children: table.headers.map(
        (header) =>
          new docx.TableCell({
            children: [
              new docx.Paragraph({
                children: [new docx.TextRun({ text: header, bold: true })],
              }),
            ],
          })
      ),
    }),
    ...table.rows.map(
      (row) =>
        new docx.TableRow({
          children: row.map(
            (cell) =>
              new docx.TableCell({
                children: [new docx.Paragraph(cell)],
              })
          ),
        })
    ),
  ];

  return new docx.Table({
    width: { size: 100, type: docx.WidthType.PERCENTAGE },
    rows,
  });
}

export const docxWriterTool: ToolDef = {
  name: 'docx_writer',
  description:
    '生成 Word 文档（.docx）并写入输出目录，适合总结、报告、纪要和结构化文稿交付。',
  permission: {
    riskLevel: ToolRiskLevel.write,
    requiresApproval: false,
    pathScopes: ['data/outputs/'],
    sideEffectSummary: 'Writes a generated .docx document into the local outputs directory.',
  },
  parameters: {
    filename: {
      type: 'string',
      description: '输出文件名，不带扩展名，例如 weekly-report',
      required: true,
    },
    title: {
      type: 'string',
      description: '文档标题，可选',
    },
    sections: {
      type: 'array',
      description:
        '文档章节数组。每项可包含 heading、paragraphs、bullets、table；paragraphs 支持字符串或 {text,bold,italic}。',
      required: true,
      items: { type: 'object' },
    },
  },
  async execute(args) {
    const parsed = argsSchema.safeParse(args);
    if (!parsed.success) {
      return `docx_writer 参数校验失败：${parsed.error.issues[0]?.message ?? 'invalid args'}`;
    }

    const { filename, title, sections } = parsed.data;
    const docx = await import('docx');
    const children: DocxChild[] = [];

    if (title) {
      children.push(
        new docx.Paragraph({
          heading: docx.HeadingLevel.TITLE,
          children: [new docx.TextRun({ text: title, bold: true })],
        })
      );
    }

    for (const section of sections) {
      if (section.heading) {
        children.push(
          new docx.Paragraph({
            heading: toHeading(docx, section.heading.level),
            children: [new docx.TextRun(section.heading.text)],
          })
        );
      }

      for (const paragraph of section.paragraphs ?? []) {
        children.push(buildParagraph(docx, paragraph));
      }

      for (const bullet of section.bullets ?? []) {
        children.push(
          new docx.Paragraph({
            bullet: { level: 0 },
            children: [new docx.TextRun(bullet)],
          })
        );
      }

      if (section.table) {
        children.push(buildTable(docx, section.table));
      }
    }

    const doc = new docx.Document({
      sections: [
        {
          children,
        },
      ],
    });

    const outputDir = ensureOutputDir();
    const safeBase = sanitizeBaseName(filename, 'document');
    const outputPath = join(outputDir, `${safeBase}.docx`);
    const buffer = await docx.Packer.toBuffer(doc);
    await writeFile(outputPath, buffer);

    const ref = buildOutputFileRef(`${safeBase}.docx`, outputPath);
    return formatOutputFileResult('Word 文档', ref, title ? [`- 标题：${title}`] : []);
  },
};
