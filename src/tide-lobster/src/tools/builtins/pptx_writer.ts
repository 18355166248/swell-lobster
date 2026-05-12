import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import { ToolRiskLevel, type ToolDef } from '../types.js';
import {
  buildOutputFileRef,
  ensureOutputDir,
  formatOutputFileResult,
  sanitizeBaseName,
} from '../outputFiles.js';

const slideSchema = z.object({
  layout: z
    .enum(['title', 'content', 'title-content', 'two-column', 'table', 'image'])
    .optional()
    .default('content'),
  title: z.string().trim().min(1),
  subtitle: z.string().trim().optional(),
  body: z.array(z.string().trim().min(1)).optional(),
  bullets: z.array(z.string().trim().min(1)).optional(),
  leftBody: z.array(z.string().trim().min(1)).optional(),
  rightBody: z.array(z.string().trim().min(1)).optional(),
  left: z.array(z.string().trim().min(1)).optional(),
  right: z.array(z.string().trim().min(1)).optional(),
  imagePath: z.string().trim().min(1).optional(),
  caption: z.string().trim().optional(),
  table: z
    .object({
      headers: z.array(z.string()).min(1),
      rows: z.array(z.array(z.string())),
    })
    .optional(),
  notes: z.string().trim().optional(),
});

const argsSchema = z.object({
  filename: z.string().trim().min(1),
  theme: z.enum(['default', 'calm', 'bold', 'dark', 'business']).optional().default('default'),
  slides: z.array(slideSchema).min(1),
});

type SlideDef = z.infer<typeof slideSchema>;

function addBullets(
  slide: {
    addText: (text: unknown, options?: Record<string, unknown>) => unknown;
  },
  lines: string[],
  options: { x: number; y: number; w: number; h: number }
) {
  slide.addText(
    lines.map((line) => ({ text: line, options: { bullet: { indent: 12 } } })),
    {
      ...options,
      fontSize: 20,
      color: '203040',
      breakLine: true,
      margin: 0.08,
      valign: 'top',
    }
  );
}

function applyTheme(
  pptx: {
    theme: Record<string, unknown>;
  },
  theme: 'default' | 'calm' | 'bold' | 'dark' | 'business'
) {
  if (theme === 'calm' || theme === 'business') {
    pptx.theme = {
      headFontFace: 'Aptos Display',
      bodyFontFace: 'Aptos',
      lang: 'zh-CN',
    };
    return;
  }
  if (theme === 'bold') {
    pptx.theme = {
      headFontFace: 'Arial',
      bodyFontFace: 'Arial',
      lang: 'zh-CN',
    };
  }
}

function getBodyLines(slideDef: SlideDef): string[] {
  return slideDef.bullets ?? slideDef.body ?? [];
}

function getColumnLines(slideDef: SlideDef, side: 'left' | 'right'): string[] {
  if (side === 'left') return slideDef.left ?? slideDef.leftBody ?? [];
  return slideDef.right ?? slideDef.rightBody ?? [];
}

export const pptxWriterTool: ToolDef = {
  name: 'pptx_writer',
  description:
    '生成 PowerPoint 演示文稿（.pptx）并写入输出目录，支持标题页、标题内容页、双栏页和表格页。',
  permission: {
    riskLevel: ToolRiskLevel.write,
    requiresApproval: false,
    pathScopes: ['data/outputs/'],
    sideEffectSummary: 'Writes a generated .pptx presentation into the local outputs directory.',
  },
  parameters: {
    filename: {
      type: 'string',
      description: '输出文件名，不带扩展名，例如 project-brief',
      required: true,
    },
    theme: {
      type: 'string',
      description: '演示主题，可选 default / dark / business；兼容 calm / bold',
      enum: ['default', 'dark', 'business', 'calm', 'bold'],
    },
    slides: {
      type: 'array',
      description:
        'slide 数组。每项包含 title，layout 可选 title/content/two-column/image；兼容 title-content/table。可附 subtitle、bullets、left/right、imagePath、caption、notes。',
      required: true,
      items: { type: 'object' },
    },
  },
  async execute(args) {
    const parsed = argsSchema.safeParse(args);
    if (!parsed.success) {
      return `pptx_writer 参数校验失败：${parsed.error.issues[0]?.message ?? 'invalid args'}`;
    }

    const module = await import('pptxgenjs');
    const PptxCtor = module.default as unknown as new () => {
      layout: string;
      author: string;
      theme: Record<string, unknown>;
      addSlide: () => {
        addText: (text: unknown, options?: Record<string, unknown>) => unknown;
        addImage: (options: Record<string, unknown>) => unknown;
        addTable: (rows: string[][], options?: Record<string, unknown>) => unknown;
        addNotes: (notes: string) => unknown;
      };
      writeFile: (props: { fileName: string }) => Promise<string>;
    };
    const pptx = new PptxCtor();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = 'SwellLobster';
    applyTheme(pptx, parsed.data.theme);

    for (const slideDef of parsed.data.slides) {
      const slide = pptx.addSlide();
      slide.addText(slideDef.title, {
        x: 0.6,
        y: 0.4,
        w: 12,
        h: 0.6,
        fontSize: slideDef.layout === 'title' ? 26 : 24,
        bold: true,
        color: '0F172A',
      });

      if (slideDef.layout === 'title') {
        const titleBody = slideDef.subtitle
          ? [slideDef.subtitle, ...getBodyLines(slideDef)]
          : getBodyLines(slideDef);
        if (titleBody.length) {
          slide.addText(titleBody.join('\n'), {
            x: 0.9,
            y: 1.6,
            w: 11,
            h: 3.5,
            align: 'center',
            fontSize: 20,
            color: '334155',
          });
        }
      } else if (slideDef.layout === 'two-column') {
        addBullets(slide, getColumnLines(slideDef, 'left'), { x: 0.6, y: 1.4, w: 5.6, h: 4.8 });
        addBullets(slide, getColumnLines(slideDef, 'right'), { x: 6.6, y: 1.4, w: 5.6, h: 4.8 });
      } else if (slideDef.layout === 'table' && slideDef.table) {
        slide.addTable([slideDef.table.headers, ...slideDef.table.rows], {
          x: 0.6,
          y: 1.4,
          w: 11.5,
          border: { type: 'solid', color: 'CBD5E1', pt: 1 },
          fontSize: 16,
          color: '1E293B',
          fill: 'FFFFFF',
          rowH: 0.45,
        });
      } else if (slideDef.layout === 'image') {
        if (!slideDef.imagePath || !existsSync(slideDef.imagePath)) {
          return `pptx_writer 参数校验失败：imagePath 文件不存在`;
        }
        slide.addImage({ path: slideDef.imagePath, x: 1.4, y: 1.25, w: 10.5, h: 4.8 });
        if (slideDef.caption) {
          slide.addText(slideDef.caption, {
            x: 1.4,
            y: 6.15,
            w: 10.5,
            h: 0.35,
            align: 'center',
            fontSize: 12,
            color: '64748B',
          });
        }
      } else {
        addBullets(slide, getBodyLines(slideDef), { x: 0.8, y: 1.4, w: 11, h: 4.8 });
      }

      if (slideDef.notes) {
        slide.addNotes(slideDef.notes);
      }
    }

    const outputDir = ensureOutputDir();
    const safeBase = sanitizeBaseName(parsed.data.filename, 'presentation');
    const outputPath = join(outputDir, `${safeBase}.pptx`);
    await pptx.writeFile({ fileName: outputPath });

    const ref = buildOutputFileRef(`${safeBase}.pptx`, outputPath);
    return formatOutputFileResult('PowerPoint 演示文稿', ref, [
      `- 幻灯片数：${parsed.data.slides.length}`,
      `- 主题：${parsed.data.theme}`,
    ]);
  },
};
