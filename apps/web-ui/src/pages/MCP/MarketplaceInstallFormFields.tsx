import { Alert, Divider, Form, Input, Tag, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import type { MarketplaceServer } from './types';
import { McpEnvKeyValueList } from './McpEnvKeyValueList';

const { Text, Paragraph } = Typography;

type Props = {
  entry: MarketplaceServer;
  isZh: boolean;
};

/**
 * 市场安装表单内容：说明、传输/命令/参数（只读）、模板 env、额外 env（与 McpEnvKeyValueList 一致）。
 */
export function MarketplaceInstallFormFields({ entry, isZh }: Props) {
  const { t } = useTranslation();
  const desc = isZh ? entry.description_zh : entry.description_en;
  const required = entry.requiredEnvKeys ?? [];
  const optional = entry.optionalEnvKeys ?? [];
  const argsLines = entry.defaultArgs.join('\n');
  const argsRows = Math.min(8, Math.max(2, entry.defaultArgs.length));

  const transportLabel =
    entry.transportType === 'stdio'
      ? t('mcp.transportStdio')
      : entry.transportType === 'sse'
        ? t('mcp.transportSse')
        : entry.transportType === 'http'
          ? t('mcp.transportHttp')
          : entry.transportType;

  return (
    <>
      <Alert type="info" showIcon message={t('mcp.marketplaceTemplateHint')} className="mb-4" />
      {desc ? (
        <div className="mb-4">
          <Text type="secondary">{t('mcp.marketplaceDescription')}</Text>
          <Paragraph className="mb-0 mt-1 text-foreground">{desc}</Paragraph>
        </div>
      ) : null}

      <Form.Item
        name="name"
        label={t('mcp.name')}
        rules={[{ required: true, message: t('mcp.nameRequired') }]}
      >
        <Input />
      </Form.Item>

      <Divider orientation="left">{t('mcp.transportType')}</Divider>
      <Form.Item label={t('mcp.transportType')}>
        <Input
          readOnly
          value={`${entry.transportType} — ${transportLabel}`}
          addonAfter={t('mcp.marketplaceReadonly')}
        />
      </Form.Item>

      <Form.Item label={t('mcp.marketplaceTemplateCommand')}>
        <Input
          readOnly
          className="font-mono"
          value={entry.command}
          addonAfter={t('mcp.marketplaceReadonly')}
        />
      </Form.Item>

      <Form.Item label={t('mcp.marketplaceTemplateArgs')}>
        <Input.TextArea readOnly rows={argsRows} value={argsLines} className="font-mono text-sm" />
      </Form.Item>

      <Divider orientation="left">{t('mcp.envTemplateSection')}</Divider>
      {required.length === 0 && optional.length === 0 ? (
        <Text type="secondary" className="mb-4 block">
          {t('mcp.noEnvTemplateKeys')}
        </Text>
      ) : null}

      {required.map((envKey) => (
        <Form.Item
          key={`req-${envKey}`}
          name={['templateEnv', envKey]}
          label={
            <span>
              <Tag color="red">{t('mcp.envRequiredTag')}</Tag> {envKey}
            </span>
          }
          rules={[{ required: true, message: t('mcp.envValueRequired') }]}
        >
          <Input autoComplete="off" placeholder={envKey} />
        </Form.Item>
      ))}
      {optional.map((envKey) => (
        <Form.Item
          key={`opt-${envKey}`}
          name={['templateEnv', envKey]}
          label={
            <span>
              <Tag>{t('common.optional')}</Tag> {envKey}
            </span>
          }
        >
          <Input autoComplete="off" placeholder={envKey} />
        </Form.Item>
      ))}

      <Divider orientation="left">{t('mcp.envExtraSection')}</Divider>
      <Text type="secondary" className="mb-3 block text-sm">
        {t('mcp.envExtraHint')}
      </Text>
      <McpEnvKeyValueList />
    </>
  );
}
