import { useCallback, useEffect, useState } from 'react';
import { Button, Alert, Spin, Typography, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { apiGet } from '../../../api/base';
import { ROUTES } from '../../../routes';

const { Title, Text } = Typography;

type EnvMap = Record<string, string>;
type EnvData = { env: EnvMap; path?: string };

const IM_ENV_KEY_PATTERN =
  /(DINGTALK|TELEGRAM|LARK|FEISHU|SLACK|DISCORD|WECHAT|WX|BOT|WEBHOOK|CLIENT_ID|CLIENT_SECRET|APP_SECRET|APP_KEY|ROBOT)/i;

export function ConfigIMPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [env, setEnv] = useState<EnvMap>({});
  const [envPath, setEnvPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<EnvData>('/api/config/env');
      const imEnv = Object.fromEntries(
        Object.entries(data.env ?? {})
          .filter(([key]) => IM_ENV_KEY_PATTERN.test(key))
          .sort(([a], [b]) => a.localeCompare(b))
      );
      setEnv(imEnv);
      setEnvPath(data.path ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('configIM.loadFailed'));
      setEnv({});
      setEnvPath('');
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2">
        <Spin size="small" />
        <Text type="secondary">{t('common.loading')}</Text>
      </div>
    );
  }

  return (
    <div className="p-6">
      <Title level={4} style={{ marginBottom: 4 }}>
        {t('configIM.title')}
      </Title>
      <Text type="secondary">{t('configIM.subtitle')}</Text>

      {error && <Alert type="error" title={error} className="mt-3" showIcon />}
      {!error && envPath && (
        <Alert
          type="info"
          showIcon
          className="mt-3"
          message={t('configIM.envPathLabel')}
          description={<code>{envPath}</code>}
        />
      )}

      <div className="mt-6 border border-border rounded overflow-hidden">
        <div className="px-4 py-3 bg-muted text-sm text-muted-foreground">
          {t('configIM.envHint')}
        </div>
        {Object.keys(env).length === 0 ? (
          <div className="px-4 py-6 text-muted-foreground text-sm text-center">
            {t('configIM.noEnv')}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {Object.entries(env).map(([k, v]) => (
              <li key={k} className="px-4 py-2 flex justify-between text-sm">
                <span className="font-mono text-foreground">{k}</span>
                <span className="text-muted-foreground truncate max-w-[60%]">{v}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-6">
        <Space wrap>
          <Button type="primary" onClick={() => navigate(ROUTES.CONFIG_ADVANCED)}>
            {t('configIM.editEnv')}
          </Button>
          <Button onClick={() => navigate(ROUTES.IM)}>{t('configIM.openBotConfig')}</Button>
        </Space>
      </div>
    </div>
  );
}
