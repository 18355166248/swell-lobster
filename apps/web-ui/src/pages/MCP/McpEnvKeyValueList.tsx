import { Button, Form, Input, Space } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

type Props = {
  /** Form.List 名称，默认 extraEnv */
  name?: string | string[];
};

/**
 * 环境变量键值对列表（与市场安装弹窗「额外环境变量」一致，可多处复用）。
 */
export function McpEnvKeyValueList({ name = 'extraEnv' }: Props) {
  const { t } = useTranslation();

  return (
    <Form.List name={name}>
      {(fields, { add, remove }) => (
        <>
          {fields.map((field) => (
            <Space key={field.key} align="baseline" className="w-full mb-2" wrap>
              <Form.Item name={[field.name, 'key']} className="mb-0 flex-1 min-w-[140px]">
                <Input placeholder={t('mcp.envKey')} autoComplete="off" />
              </Form.Item>
              <Form.Item name={[field.name, 'value']} className="mb-0 flex-1 min-w-[180px]">
                <Input placeholder={t('mcp.envValue')} autoComplete="off" />
              </Form.Item>
              <MinusCircleOutlined
                className="text-red-500 cursor-pointer shrink-0"
                onClick={() => remove(field.name)}
              />
            </Space>
          ))}
          <Form.Item className="mb-0">
            <Button
              type="dashed"
              onClick={() => add({ key: '', value: '' })}
              block
              icon={<PlusOutlined />}
            >
              {t('mcp.envAddPair')}
            </Button>
          </Form.Item>
        </>
      )}
    </Form.List>
  );
}
