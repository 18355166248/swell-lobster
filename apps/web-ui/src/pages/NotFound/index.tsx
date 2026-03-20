import { Link } from 'react-router';
import { Typography, Result } from 'antd';
import { useTranslation } from 'react-i18next';
import { ROUTES } from '../../router';

const { Link: AntLink } = Typography;

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <Result
      status="404"
      title={t('notFound.title')}
      subTitle={t('notFound.subtitle')}
      extra={
        <Link to={ROUTES.HOME}>
          <AntLink>{t('notFound.back')}</AntLink>
        </Link>
      }
    />
  );
}
