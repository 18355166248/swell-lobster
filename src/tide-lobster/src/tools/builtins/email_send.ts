import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';

import { z } from 'zod';
import type Mail from 'nodemailer/lib/mailer/index.js';

import { settings } from '../../config.js';
import { getSmtpConfig } from '../../store/emailSmtpConfig.js';
import { ToolRiskLevel, type ToolDef } from '../types.js';

const emailSchema = z.object({
  to: z.array(z.string().trim().email()).min(1),
  cc: z.array(z.string().trim().email()).optional(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().min(1),
  bodyType: z.enum(['text', 'html']).optional(),
  attachments: z.array(z.string().trim().min(1)).optional(),
}).superRefine((value, ctx) => {
  const total = value.to.length + (value.cc?.length ?? 0);
  if (total > 20) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['to'],
      message: 'total recipients must not exceed 20',
    });
  }
});

function resolveAttachment(relativePath: string): string {
  const absolute = resolve(settings.dataDir, relativePath);
  const dataRoot = resolve(settings.dataDir);
  if (absolute !== dataRoot && !absolute.startsWith(dataRoot + sep)) {
    throw new Error(`附件路径越界：${relativePath}`);
  }
  if (!existsSync(absolute)) {
    throw new Error(`附件不存在：${relativePath}`);
  }
  return absolute;
}

async function buildTransporter() {
  const config = getSmtpConfig();
  if (!config) {
    throw new Error('未配置 SMTP。请先保存 email.smtp.config');
  }
  const nodemailer = await import('nodemailer');
  const createTransport =
    nodemailer.default?.createTransport?.bind(nodemailer.default) ??
    nodemailer.createTransport?.bind(nodemailer);
  return {
    transporter: createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.password,
      },
    }),
    config,
  };
}

export const emailSendTool: ToolDef = {
  name: 'email_send',
  description: '通过已配置的 SMTP 发送邮件，支持抄送与 data/ 下的附件。',
  permission: {
    riskLevel: ToolRiskLevel.network,
    requiresApproval: true,
    networkScopes: ['smtp://*'],
    pathScopes: ['data/**'],
    sideEffectSummary: '通过 SMTP 发送邮件（外向网络副作用）',
  },
  parameters: {
    to: {
      type: 'array',
      description: '收件人邮箱数组',
      required: true,
      items: { type: 'string' },
    },
    cc: {
      type: 'array',
      description: '抄送邮箱数组，可选',
      items: { type: 'string' },
    },
    subject: {
      type: 'string',
      description: '邮件标题',
      required: true,
    },
    body: {
      type: 'string',
      description: '邮件正文，支持纯文本或 HTML',
      required: true,
    },
    bodyType: {
      type: 'string',
      description: '正文类型，text 或 html，默认 text',
      enum: ['text', 'html'],
    },
    attachments: {
      type: 'array',
      description: '相对于 data/ 的附件路径数组',
      items: { type: 'string' },
    },
  },
  async execute(args) {
    const parsed = emailSchema.safeParse(args);
    if (!parsed.success) {
      return `email_send 参数校验失败：${parsed.error.issues[0]?.message ?? 'invalid args'}`;
    }

    const { to, cc, subject, body, bodyType = 'text', attachments = [] } = parsed.data;
    const resolvedAttachments = attachments.map((path) => ({
      path: resolveAttachment(path),
      filename: path.split('/').pop() || 'attachment',
    }));

    const { transporter, config } = await buildTransporter();
    const payload: Mail.Options = {
      from: config.from,
      to: to.join(', '),
      cc: cc?.join(', '),
      subject,
      attachments: resolvedAttachments,
      ...(bodyType === 'html' ? { html: body } : { text: body }),
    };

    const info = await transporter.sendMail(payload);
    return [
      '邮件已发送。',
      `- Message ID：${info.messageId}`,
      `- 收件人：${to.join(', ')}`,
      ...(cc?.length ? [`- 抄送：${cc.join(', ')}`] : []),
      `- 标题：${subject}`,
      ...(resolvedAttachments.length ? [`- 附件数：${resolvedAttachments.length}`] : []),
    ].join('\n');
  },
};
