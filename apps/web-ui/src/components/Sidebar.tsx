import { NavLink } from 'react-router';
import { ROUTES } from '../routes';

const mainNav = [
  { path: ROUTES.CHAT, label: '聊天' },
  { path: ROUTES.IM, label: '消息通道' },
  { path: ROUTES.SKILLS, label: '技能' },
  { path: ROUTES.MCP, label: 'MCP' },
  { path: ROUTES.SCHEDULER, label: '计划任务' },
  { path: ROUTES.MEMORY, label: '记忆管理' },
  { path: ROUTES.STATUS, label: '状态面板' },
  { path: ROUTES.TOKEN_STATS, label: 'Token 统计' },
] as const;

const configNav = [
  { path: ROUTES.CONFIG_LLM, label: 'LLM 端点' },
  { path: ROUTES.CONFIG_IM, label: 'IM 通道' },
  { path: ROUTES.CONFIG_TOOLS, label: '工具与技能' },
  { path: ROUTES.CONFIG_SOUL, label: '灵魂与意志' },
  { path: ROUTES.CONFIG_IDENTITY, label: '身份配置' },
  { path: ROUTES.CONFIG_ADVANCED, label: '高级配置' },
] as const;

function navLinkClass({ isActive }: { isActive: boolean }) {
  return `block px-4 py-2.5 text-sm rounded-md transition-colors ${
    isActive
      ? 'bg-sidebar-foreground/15 text-sidebar-foreground font-medium'
      : 'text-sidebar-foreground/80 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground'
  }`;
}

export function Sidebar({ currentPath }: { currentPath: string }) {
  return (
    <>
      <div className="p-4 border-b border-sidebar-border">
        <div className="font-semibold text-sidebar-foreground text-lg">SwellLobster</div>
        <div className="text-xs text-sidebar-foreground/60 mt-0.5">桌面终端</div>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {mainNav.map(({ path, label }) => (
          <NavLink key={path} to={path} className={({ isActive }) => navLinkClass({ isActive })}>
            {label}
          </NavLink>
        ))}
        <div className="mt-4 pt-3 border-t border-sidebar-border">
          <div className="px-4 py-2 text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider">
            配置
          </div>
          {configNav.map(({ path, label }) => (
            <NavLink key={path} to={path} className={({ isActive }) => navLinkClass({ isActive })}>
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
      <div className="p-3 border-t border-sidebar-border text-xs text-sidebar-foreground/50">
        <div>Desktop v0.1.0</div>
        <div className="mt-1">Backend -</div>
      </div>
    </>
  );
}
