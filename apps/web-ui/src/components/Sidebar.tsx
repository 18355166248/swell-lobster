import { useNavigate, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Menu } from 'antd';
import type { MenuProps } from 'antd';
import {
  MessageOutlined,
  WifiOutlined,
  ThunderboltOutlined,
  AppstoreOutlined,
  ScheduleOutlined,
  DatabaseOutlined,
  DashboardOutlined,
  BarChartOutlined,
  CloudServerOutlined,
  CommentOutlined,
  ToolOutlined,
  UserOutlined,
  SettingOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import { ROUTES } from '../routes';
import { isTauri } from '../utils/platform';

export function Sidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const items: MenuProps['items'] = [
    { key: ROUTES.CHAT, icon: <MessageOutlined />, label: t('sidebar.chat') },
    { key: ROUTES.IM, icon: <WifiOutlined />, label: t('sidebar.im') },
    { key: ROUTES.SKILLS, icon: <ThunderboltOutlined />, label: t('sidebar.skills') },
    { key: ROUTES.MCP, icon: <AppstoreOutlined />, label: t('sidebar.mcp') },
    { key: ROUTES.SCHEDULER, icon: <ScheduleOutlined />, label: t('sidebar.scheduler') },
    { key: ROUTES.MEMORY, icon: <DatabaseOutlined />, label: t('sidebar.memory') },
    { key: ROUTES.STATUS, icon: <DashboardOutlined />, label: t('sidebar.status') },
    { key: ROUTES.TOKEN_STATS, icon: <BarChartOutlined />, label: t('sidebar.tokenStats') },
    { type: 'divider' },
    {
      type: 'group',
      label: t('sidebar.config'),
      children: [
        { key: ROUTES.CONFIG_LLM, icon: <CloudServerOutlined />, label: t('sidebar.llmEndpoints') },
        { key: ROUTES.CONFIG_IM, icon: <CommentOutlined />, label: t('sidebar.imChannel') },
        { key: ROUTES.CONFIG_TOOLS, icon: <ToolOutlined />, label: t('sidebar.toolsSkills') },
        { key: ROUTES.CONFIG_IDENTITY, icon: <UserOutlined />, label: t('sidebar.identity') },
        { key: ROUTES.CONFIG_ADVANCED, icon: <SettingOutlined />, label: t('sidebar.advanced') },
      ],
    },
  ];

  return (
    <>
      <div
        className="px-4 py-4 border-b border-sidebar-border"
        {...(isTauri() ? { 'data-tauri-drag-region': true } : {})}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
            <BulbOutlined style={{ fontSize: 14, color: 'var(--accent)' }} />
          </div>
          <div>
            <div className="font-semibold text-sidebar-foreground text-sm leading-tight">
              {t('sidebar.appName')}
            </div>
            <div className="text-[11px] text-sidebar-foreground/50 leading-tight">
              {t('sidebar.appSubtitle')}
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto">
        <Menu
          mode="inline"
          selectedKeys={[pathname]}
          items={items}
          onClick={({ key }) => navigate(key)}
        />
      </nav>

      <div className="px-4 py-3 border-t border-sidebar-border">
        <div className="text-[11px] text-sidebar-foreground/40 space-y-0.5">
          <div>{t('sidebar.version')}</div>
          <div>{t('sidebar.backend')}</div>
        </div>
      </div>
    </>
  );
}
