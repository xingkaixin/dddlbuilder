import { memo } from 'react';
import packageInfo from '../../../package.json';
import {
  CircleHelp,
  Loader2,
  BookOpen,
  LayoutGrid,
  LogIn,
  Search,
  Settings,
  MessageCircle,
  Table,
  Waypoints,
} from '@/components/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLocale } from '@/i18n/LocaleContext';
import { getDocsUrl } from '@/utils/docsLink';
import { useTranslation } from 'react-i18next';
import {
  useAuthActions,
  useAuthCredits,
  useAuthDialog,
  useAuthIdentity,
} from '@/auth/AuthSessionProvider';
import { followAppLink } from '@/lib/appNavigation';
import { commandShortcutLabel } from '@/lib/commandShortcut';
import { useAppUiStore } from '@/stores/appUiStore';
import { cn } from '@/lib/utils';
import { useAppRoute } from '@/hooks/useAppRoute';
import { useShareRoute } from '@/hooks/workspacePersistence/shareRoute';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { WorkspaceYDocStatus } from './WorkspaceYDocStatus';

const navItemClass =
  'inline-flex h-[38px] items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const NAV_ITEMS = [
  { view: 'tables', href: '/', label: 'header.nav.tables', icon: Table },
  { view: 'er', href: '/er', label: 'header.nav.er', icon: Waypoints },
  { view: 'tools', href: '/tools', label: 'header.nav.tools', icon: LayoutGrid },
] as const;

const FEEDBACK_URL = 'https://my.feishu.cn/share/base/form/shrcnqGnCdcvgRomQ5syagGW2He';

interface HeaderProps {
  onPlayFireworks?: () => void;
}

export const Header = memo<HeaderProps>(({ onPlayFireworks }) => {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { view } = useAppRoute();
  const { shareId } = useShareRoute();
  const openPalette = useAppUiStore((state) => state.setIsCommandPaletteOpen);
  const docsUrl = getDocsUrl(locale);
  const authIdentity = useAuthIdentity();
  const authActions = useAuthActions();
  const authDialog = useAuthDialog();
  const authSession = { ...authIdentity, ...authActions, ...authDialog };
  const authCredits = useAuthCredits();

  const actionBtnClass =
    'group inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-primary transition-all duration-200 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';
  const ghostIconBtnClass =
    'inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const accountLabel = authSession.name ?? authSession.email ?? t('header.auth.account');

  const userInitials = (
    authSession.name?.trim() ||
    authSession.email?.trim() ||
    t('header.auth.account')
  )
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      {onPlayFireworks ? (
        <style>{`
            @keyframes header-lantern-sway {
              0%, 100% { transform: rotate(-4deg); }
              50% { transform: rotate(4deg); }
            }

            .header-lantern-btn {
              transform-origin: 50% 0%;
              animation: header-lantern-sway 4.8s ease-in-out infinite;
            }

            .header-lantern-btn:hover {
              filter: drop-shadow(0 0 10px hsl(var(--primary)));
            }
          `}</style>
      ) : null}
      <header className="@container/header relative isolate flex h-16 shrink-0 items-center gap-2 bg-background px-3 @min-[720px]/header:gap-4 @min-[720px]/header:px-5">
        <div className="flex shrink-0 items-center gap-2">
          <img
            src="/logo.svg"
            alt={`${t('header.appName')} Logo`}
            width={32}
            height={32}
            className="h-8 w-8"
          />
          <h1 className="hidden text-xl font-normal text-foreground @min-[720px]/header:block">
            {t('header.appName')}
          </h1>
          <p className="sr-only">{t('header.appDescription')}</p>
          {onPlayFireworks ? <HeaderLantern onPlay={onPlayFireworks} /> : null}
        </div>
        <span
          aria-hidden
          className="hidden h-7 w-px shrink-0 bg-border @min-[720px]/header:block"
        />
        <nav className="flex min-w-0 items-center gap-1" aria-label={t('header.navLabel')}>
          {NAV_ITEMS.map(({ view: itemView, href, label, icon: Icon }) => (
            <a
              key={itemView}
              href={href}
              aria-label={t(label)}
              aria-current={view === itemView ? 'page' : undefined}
              className={cn(navItemClass, view === itemView && 'lm-hatch text-foreground')}
              onClick={(event) => followAppLink(event, href)}
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className="hidden @min-[860px]/header:inline">{t(label)}</span>
            </a>
          ))}
        </nav>
        {!shareId && (
          <button
            type="button"
            aria-label={t('commandPalette.search')}
            className="lm-field flex h-10 w-11 shrink-0 items-center justify-center gap-2 rounded-md px-3 text-sm text-muted-foreground @min-[860px]/header:w-[200px] @min-[860px]/header:justify-start @min-[1180px]/header:w-[280px]"
            onClick={() => openPalette(true)}
          >
            <Search className="h-4 w-4 shrink-0" aria-hidden />
            <span className="hidden truncate @min-[860px]/header:inline">
              {t('commandPalette.search')}
            </span>
            <kbd className="ml-auto hidden font-mono text-xs @min-[860px]/header:inline">
              {commandShortcutLabel()}
            </kbd>
          </button>
        )}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1 @min-[720px]/header:gap-3">
          {authSession.workspaceScope ? <WorkspaceYDocStatus /> : null}
          {authCredits.creditBalance !== null ? (
            <span className="hidden whitespace-nowrap text-[13px] text-muted-foreground @min-[1180px]/header:inline">
              {t('header.credits')}{' '}
              <span className="font-mono">{authCredits.creditBalance.toLocaleString()}</span>
            </span>
          ) : null}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={ghostIconBtnClass} aria-label={t('header.help')}>
                    <CircleHelp className="h-5 w-5" aria-hidden />
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('header.help')}</p>
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-52" finalFocus={false}>
              <DropdownMenuGroup fluidHover>
                <DropdownMenuItem asChild>
                  <a href={docsUrl} target="_blank" rel="noopener noreferrer">
                    <BookOpen className="h-4 w-4" aria-hidden />
                    {t('header.docs')}
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-4 w-4" aria-hidden />
                    {t('header.feedback')}
                  </a>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <div className="px-2 py-1 font-mono text-xs text-muted-foreground">
                v{packageInfo.version}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <a
            href="/settings"
            className={cn(ghostIconBtnClass, view === 'settings' && 'text-foreground')}
            aria-label={t('header.auth.settings')}
            aria-current={view === 'settings' ? 'page' : undefined}
            title={t('header.auth.settings')}
            onClick={(event) => followAppLink(event, '/settings')}
          >
            <Settings className="h-5 w-5" aria-hidden />
          </a>
          {authSession.status === 'signed_in' ? (
            <a
              href="/settings"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-[0_0_0_3px_hsl(var(--primary)/0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              title={accountLabel}
              onClick={(event) => followAppLink(event, '/settings')}
            >
              {userInitials}
            </a>
          ) : (
            <button
              type="button"
              className={actionBtnClass}
              onClick={authSession.openAuthDialog}
              disabled={authSession.status === 'loading'}
            >
              {authSession.status === 'loading' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <LogIn className="h-4 w-4" aria-hidden />
              )}
              <span className="sr-only sm:not-sr-only">{t('header.auth.signIn')}</span>
            </button>
          )}
        </div>
        <span aria-hidden className="lm-rule" />
      </header>
    </>
  );
});

function HeaderLantern({ onPlay }: { onPlay: () => void }) {
  const { t } = useTranslation();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={t('header.playFireworks')}
          onClick={onPlay}
          className="header-lantern-btn transition-transform duration-300 hover:scale-105"
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 100 100"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <line x1="50" y1="0" x2="50" y2="15" stroke="#FFD700" strokeWidth="2" />
            <rect x="35" y="15" width="30" height="6" rx="2" fill="#FFD700" />
            <ellipse cx="50" cy="45" rx="35" ry="28" fill="#D32F2F" />
            <path d="M50 17 V 73" stroke="#B71C1C" strokeWidth="1" fill="none" />
            <path d="M35 19 Q 25 45 35 71" stroke="#B71C1C" strokeWidth="1" fill="none" />
            <path d="M65 19 Q 75 45 65 71" stroke="#B71C1C" strokeWidth="1" fill="none" />
            <rect x="35" y="70" width="30" height="6" rx="2" fill="#FFD700" />
            <path d="M50 76 V 85" stroke="#D32F2F" strokeWidth="3" />
            <path d="M50 85 Q 45 95 40 98" stroke="#D32F2F" strokeWidth="2" fill="none" />
            <path d="M50 85 Q 55 95 60 98" stroke="#D32F2F" strokeWidth="2" fill="none" />
            <path d="M50 85 V 100" stroke="#D32F2F" strokeWidth="2" fill="none" />
            <circle cx="50" cy="45" r="8" fill="#FFD700" opacity="0.8" />
            <text
              x="50"
              y="49"
              fontSize="10"
              textAnchor="middle"
              fill="#D32F2F"
              fontFamily="serif"
              fontWeight="700"
            >
              福
            </text>
          </svg>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{t('header.playFireworks')}</p>
      </TooltipContent>
    </Tooltip>
  );
}
