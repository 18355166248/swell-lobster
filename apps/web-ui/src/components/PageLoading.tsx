import { Spin, Typography } from 'antd';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

export function PageLoading() {
  const { t } = useTranslation();

  return (
    <div className="p-6 flex items-center gap-2">
      <Spin size="small" />
      <Text type="secondary">{t('common.loading')}</Text>
    </div>
  );
}
