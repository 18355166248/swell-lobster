import { Alert, Divider, Form, Input, Select, Switch, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { McpEnvKeyValueList } from './McpEnvKeyValueList';

const { Text } = Typography;

type Props = {
  /** 编辑且来自市场时展示 */
  showRegistryAlert?: boolean;
};

/**
 * 自定义 MCP / 已安装编辑：名称、传输、stdio 或远程字段、环境变量（键值列表，与市场「额外环境变量」一致）、启用。
 * 须放在 `<Form>` 内使用。
 */
export function McpCustomFormFields({ showRegistryAlert }: Props) {
  const { t } = useTranslation();
  const transport = Form.useWatch('transportType');

  return (
    <>
      {showRegistryAlert ? (
        <Alert type="warning" showIcon message={t('mcp.editRegistryHint')} className="mb-4" />
      ) : null}

      <Form.Item
        name="name"
        label={t('mcp.name')}
        rules={[{ required: true, message: t('mcp.nameRequired') }]}
      >
        <Input />
      </Form.Item>

      <Form.Item name="transportType" label={t('mcp.transportType')}>
        <Select
          options={[
            { value: 'stdio', label: t('mcp.transportStdio') },
            { value: 'sse', label: t('mcp.transportSse') },
            { value: 'http', label: t('mcp.transportHttp') },
          ]}
        />
      </Form.Item>

      {transport === 'sse' || transport === 'http' ? (
        <>
          <Form.Item
            name="url"
            label={t('mcp.endpointUrl')}
            rules={[{ required: true, message: t('mcp.urlRequired') }]}
          >
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item name="headersText" label={t('mcp.headers')} extra={t('mcp.headersHint')}>
            <Input.TextArea rows={4} placeholder={'Authorization: Bearer ...'} />
          </Form.Item>
        </>
      ) : (
        <>
          <Form.Item
            name="command"
            label={t('mcp.command')}
            extra={t('mcp.commandHint')}
            rules={[{ required: true, message: t('mcp.commandRequired') }]}
          >
            <Input placeholder="npx" />
          </Form.Item>
          <Form.Item name="argsText" label={t('mcp.args')}>
            <Input.TextArea rows={4} placeholder={t('mcp.argsPlaceholder')} />
          </Form.Item>
        </>
      )}

      <Divider orientation="left">{t('mcp.envKeyValueSection')}</Divider>
      <Text type="secondary" className="mb-3 block text-sm">
        {t('mcp.envKeyValueIntro')}
      </Text>
      <McpEnvKeyValueList />

      <Form.Item name="enabled" label={t('mcp.enabled')} valuePropName="checked">
        <Switch />
      </Form.Item>
    </>
  );
}
