import { useAtomValue, useSetAtom } from 'jotai';
import { Button, Dropdown } from 'antd';
import { SunOutlined, MoonOutlined, DesktopOutlined, CheckOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { themeModeAtom, type ThemeMode } from '../store/theme';

const THEME_ICONS: Record<ThemeMode, React.ReactNode> = {
  light: <SunOutlined />,
  dark: <MoonOutlined />,
  system: <DesktopOutlined />,
};

export function ThemeToggle() {
  const { t } = useTranslation();
  const theme = useAtomValue(themeModeAtom);
  const setTheme = useSetAtom(themeModeAtom);

  const items = (
    [
      { value: 'light' as ThemeMode, labelKey: 'common.light' },
      { value: 'dark' as ThemeMode, labelKey: 'common.dark' },
      { value: 'system' as ThemeMode, labelKey: 'common.system' },
    ] as const
  ).map(({ value, labelKey }) => ({
    key: value,
    icon: THEME_ICONS[value],
    label: t(labelKey),
    onClick: () => setTheme(value),
    itemIcon: theme === value ? <CheckOutlined /> : null,
  }));

  return (
    <Dropdown menu={{ items, selectedKeys: [theme] }} trigger={['click']} placement="bottomRight">
      <Button size="small" icon={THEME_ICONS[theme]} />
    </Dropdown>
  );
}
