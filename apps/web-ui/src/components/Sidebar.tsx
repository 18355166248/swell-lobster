import { NavLink, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
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

export function Sidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  void location;

  const mainNav = [
    { path: ROUTES.CHAT, labelKey: 'sidebar.chat', icon: MessageSquare },
    { path: ROUTES.IM, labelKey: 'sidebar.im', icon: Radio },
    { path: ROUTES.SKILLS, labelKey: 'sidebar.skills', icon: Zap },
    { path: ROUTES.MCP, labelKey: 'sidebar.mcp', icon: Puzzle },
    { path: ROUTES.SCHEDULER, labelKey: 'sidebar.scheduler', icon: CalendarClock },
    { path: ROUTES.MEMORY, labelKey: 'sidebar.memory', icon: Brain },
    { path: ROUTES.STATUS, labelKey: 'sidebar.status', icon: Activity },
    { path: ROUTES.TOKEN_STATS, labelKey: 'sidebar.tokenStats', icon: BarChart3 },
  ] as const;

  const configNav = [
    { path: ROUTES.CONFIG_LLM, labelKey: 'sidebar.llmEndpoints', icon: Cpu },
    { path: ROUTES.CONFIG_IM, labelKey: 'sidebar.imChannel', icon: MessageCircle },
    { path: ROUTES.CONFIG_TOOLS, labelKey: 'sidebar.toolsSkills', icon: Wrench },
    { path: ROUTES.CONFIG_SOUL, labelKey: 'sidebar.soul', icon: Sparkles },
    { path: ROUTES.CONFIG_IDENTITY, labelKey: 'sidebar.identity', icon: UserCircle },
    { path: ROUTES.CONFIG_ADVANCED, labelKey: 'sidebar.advanced', icon: Settings2 },
  ] as const;

  return (
    <>
      <div className="px-4 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-accent" />
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

      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {mainNav.map(({ path, labelKey, icon }) => (
          <NavItem key={path} path={path} label={t(labelKey)} icon={icon} />
        ))}
        <div className="mt-3 pt-3 border-t border-sidebar-border">
          <div className="px-3 pb-1 text-[11px] font-medium text-sidebar-foreground/40 uppercase tracking-wider">
            {t('sidebar.config')}
          </div>
          <div className="space-y-0.5">
            {configNav.map(({ path, labelKey, icon }) => (
              <NavItem key={path} path={path} label={t(labelKey)} icon={icon} />
            ))}
          </div>
        </div>
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
