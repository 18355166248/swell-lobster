import { NavLink } from 'react-router';
import {
  MessageSquare,
  Radio,
  Zap,
  Puzzle,
  CalendarClock,
  Brain,
  Activity,
  BarChart3,
  Cpu,
  MessageCircle,
  Wrench,
  Sparkles,
  UserCircle,
  Settings2,
} from 'lucide-react';
import { ROUTES } from '../routes';

const mainNav = [
  { path: ROUTES.CHAT, label: '聊天', icon: MessageSquare },
  { path: ROUTES.IM, label: '消息通道', icon: Radio },
  { path: ROUTES.SKILLS, label: '技能', icon: Zap },
  { path: ROUTES.MCP, label: 'MCP', icon: Puzzle },
  { path: ROUTES.SCHEDULER, label: '计划任务', icon: CalendarClock },
  { path: ROUTES.MEMORY, label: '记忆管理', icon: Brain },
  { path: ROUTES.STATUS, label: '状态面板', icon: Activity },
  { path: ROUTES.TOKEN_STATS, label: 'Token 统计', icon: BarChart3 },
] as const;

const configNav = [
  { path: ROUTES.CONFIG_LLM, label: 'LLM 端点', icon: Cpu },
  { path: ROUTES.CONFIG_IM, label: 'IM 通道', icon: MessageCircle },
  { path: ROUTES.CONFIG_TOOLS, label: '工具与技能', icon: Wrench },
  { path: ROUTES.CONFIG_SOUL, label: '灵魂与意志', icon: Sparkles },
  { path: ROUTES.CONFIG_IDENTITY, label: '身份配置', icon: UserCircle },
  { path: ROUTES.CONFIG_ADVANCED, label: '高级配置', icon: Settings2 },
] as const;

function NavItem({
  path,
  label,
  icon: Icon,
}: {
  path: string;
  label: string;
  icon: React.ElementType;
}) {
  return (
    <NavLink
      to={path}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-all duration-150 ${
          isActive
            ? 'bg-sidebar-foreground/15 text-sidebar-foreground font-medium border-l-2 border-accent pl-[10px]'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground border-l-2 border-transparent pl-[10px]'
        }`
      }
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span>{label}</span>
    </NavLink>
  );
}

export function Sidebar({ currentPath }: { currentPath: string }) {
  void currentPath;
  return (
    <>
      <div className="px-4 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-accent" />
          </div>
          <div>
            <div className="font-semibold text-sidebar-foreground text-sm leading-tight">
              SwellLobster
            </div>
            <div className="text-[11px] text-sidebar-foreground/50 leading-tight">桌面终端</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {mainNav.map(({ path, label, icon }) => (
          <NavItem key={path} path={path} label={label} icon={icon} />
        ))}
        <div className="mt-3 pt-3 border-t border-sidebar-border">
          <div className="px-3 pb-1 text-[11px] font-medium text-sidebar-foreground/40 uppercase tracking-wider">
            配置
          </div>
          <div className="space-y-0.5">
            {configNav.map(({ path, label, icon }) => (
              <NavItem key={path} path={path} label={label} icon={icon} />
            ))}
          </div>
        </div>
      </nav>

      <div className="px-4 py-3 border-t border-sidebar-border">
        <div className="text-[11px] text-sidebar-foreground/40 space-y-0.5">
          <div>Desktop v0.1.0</div>
          <div>Backend -</div>
        </div>
      </div>
    </>
  );
}
