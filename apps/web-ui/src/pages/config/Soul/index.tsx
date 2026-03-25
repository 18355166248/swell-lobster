import { Alert, Typography } from 'antd';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

export function ConfigSoulPage() {
  const { t } = useTranslation();
  return (
    <div className="p-6">
      <Title level={4} style={{ marginBottom: 4 }}>
        {t('configSoul.title')}
      </Title>
      <Text type="secondary">{t('configSoul.subtitle')}</Text>
      <Alert
        className="mt-6"
        type="info"
        title="SOUL、AGENT 等身份与行为配置入口。可与「身份配置」页配合使用，编辑 SOUL.md、AGENT.md 等文件。"
      />
    </div>
  );
}
