import { useAtomValue, useSetAtom } from 'jotai';
import { Button, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import { themeModeAtom, type ThemeMode } from '../store/theme';

export function ThemeToggle() {
  const { t } = useTranslation();
  const theme = useAtomValue(themeModeAtom);
  const setTheme = useSetAtom(themeModeAtom);

  const options: { value: ThemeMode; labelKey: string }[] = [
    { value: 'light', labelKey: 'common.light' },
    { value: 'dark', labelKey: 'common.dark' },
    { value: 'system', labelKey: 'common.system' },
  ];

  return (
    <Space.Compact size="small">
      {options.map(({ value, labelKey }) => (
        <Button
          key={value}
          type={theme === value ? 'primary' : 'default'}
          onClick={() => setTheme(value)}
          size="small"
        >
          {t(labelKey)}
        </Button>
      ))}
    </Space.Compact>
  );
}
