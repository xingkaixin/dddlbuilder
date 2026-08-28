import { memo } from 'react';
import { createPortal } from 'react-dom';
import type { AppLocale } from '@ddlbuilder/shared-types/locale';
import packageInfo from '../../../package.json';
import {
  Share2,
  FileInput,
  Loader2,
  BookOpen,
  LogIn,
  LogOut,
  Settings,
  Sparkles,
  MessageCircle,
  MoreHorizontal,
  Languages,
  Laptop,
  Moon,
  Sun,
} from '@/components/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLocale } from '@/i18n/LocaleContext';
import { getDocsUrl } from '@/utils/docsLink';
import { useTranslation } from 'react-i18next';
import { useAuthSession } from '@/auth/AuthSessionProvider';
import { useToast } from '@/hooks/useToast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from 'next-themes';
import { useThemeTransition } from './hooks/useThemeTransition';
import { WorkspaceYDocStatus } from './WorkspaceYDocStatus';
const FEEDBACK_URL = 'https://my.feishu.cn/share/base/form/shrcnqGnCdcvgRomQ5syagGW2He';

interface HeaderProps {
  onShare: () => void;
  isSharing: boolean;
  onOpenImport: () => void;
  onOpenSettings: () => void;
  onPlayFireworks?: () => void;
  onOpenAIGenerate?: () => void;
}

export const Header = memo<HeaderProps>(
  ({
    onShare,
    isSharing,
    onOpenImport,
    onOpenSettings,
    onPlayFireworks,
    onOpenAIGenerate = () => {},
  }) => {
    const { t } = useTranslation();
    const { locale, setLocale } = useLocale();
    const { success, error } = useToast();
    const docsUrl = getDocsUrl(locale);
    const authSession = useAuthSession();
    const { theme, resolvedTheme, setTheme } = useTheme();
    const selectedTheme: 'system' | 'light' | 'dark' =
      theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system';
    const { phase, isTransitioning, targetEffectiveTheme, runThemeTransition } = useThemeTransition(
      {
        theme: selectedTheme,
        resolvedTheme,
        setTheme,
      },
    );
    const actionBtnClass =
      'group inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-primary transition-all duration-200 hover:translate-x-0.5 hover:bg-primary/10 hover:text-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60';
    const primaryActionBtnClass =
      'group inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-all duration-200 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60';
    const ghostIconBtnClass =
      'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-60';
    const localeLabels: Record<AppLocale, string> = {
      'zh-CN': t('locale.zhCN'),
      'en-US': t('locale.enUS'),
      'ja-JP': t('locale.jaJP'),
    };
    const themeLabels = {
      system: t('theme.system'),
      light: t('theme.light'),
      dark: t('theme.dark'),
    };
    const userInitials = (
      authSession.name?.trim() ||
      authSession.email?.trim() ||
      t('header.auth.account')
    )
      .slice(0, 2)
      .toUpperCase();
    const themeOverlay =
      phase === 'wipe' || phase === 'fade' ? (
        <div
          aria-hidden
          data-testid="theme-transition-overlay"
          className={`theme-transition-overlay ${
            phase === 'wipe' ? 'theme-transition-overlay--wipe' : 'theme-transition-overlay--fade'
          } ${
            targetEffectiveTheme === 'dark'
              ? 'theme-transition-overlay--to-dark'
              : 'theme-transition-overlay--to-light'
          }`}
        />
      ) : null;

    const handleSignOut = async () => {
      try {
        await authSession.signOut();
        success(t('header.auth.signedOut'));
      } catch (err) {
        error(err instanceof Error ? err.message : t('header.auth.signOutFailed'));
      }
    };

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
        <header className="relative border-b bg-card/95 backdrop-blur-sm shadow-sm">
          {/* Decorative gradient overlay */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />

          <div className="relative px-4 py-2">
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <div className="group flex items-center gap-3">
                  <img
                    src="/logo.svg"
                    alt={`${t('header.appName')} Logo`}
                    width={32}
                    height={32}
                    className="h-8 w-8 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h1 className="bg-gradient-to-r from-foreground to-primary bg-clip-text text-lg font-bold tracking-tight text-transparent">
                        {t('header.appName')}
                      </h1>
                      {onPlayFireworks ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label={t('header.playFireworks')}
                              onClick={onPlayFireworks}
                              className="header-lantern-btn transition-transform duration-300 hover:scale-105"
                            >
                              <svg
                                width="26"
                                height="26"
                                viewBox="0 0 100 100"
                                xmlns="http://www.w3.org/2000/svg"
                                aria-hidden="true"
                              >
                                <line
                                  x1="50"
                                  y1="0"
                                  x2="50"
                                  y2="15"
                                  stroke="#FFD700"
                                  strokeWidth="2"
                                />
                                <rect x="35" y="15" width="30" height="6" rx="2" fill="#FFD700" />
                                <ellipse cx="50" cy="45" rx="35" ry="28" fill="#D32F2F" />
                                <path
                                  d="M50 17 V 73"
                                  stroke="#B71C1C"
                                  strokeWidth="1"
                                  fill="none"
                                />
                                <path
                                  d="M35 19 Q 25 45 35 71"
                                  stroke="#B71C1C"
                                  strokeWidth="1"
                                  fill="none"
                                />
                                <path
                                  d="M65 19 Q 75 45 65 71"
                                  stroke="#B71C1C"
                                  strokeWidth="1"
                                  fill="none"
                                />
                                <rect x="35" y="70" width="30" height="6" rx="2" fill="#FFD700" />
                                <path d="M50 76 V 85" stroke="#D32F2F" strokeWidth="3" />
                                <path
                                  d="M50 85 Q 45 95 40 98"
                                  stroke="#D32F2F"
                                  strokeWidth="2"
                                  fill="none"
                                />
                                <path
                                  d="M50 85 Q 55 95 60 98"
                                  stroke="#D32F2F"
                                  strokeWidth="2"
                                  fill="none"
                                />
                                <path
                                  d="M50 85 V 100"
                                  stroke="#D32F2F"
                                  strokeWidth="2"
                                  fill="none"
                                />
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
                      ) : null}
                    </div>
                    <p className="text-xs leading-none text-muted-foreground transition-colors duration-300 group-hover:text-foreground/80">
                      {t('header.appDescription')}
                    </p>
                  </div>
                </div>
                <div className="h-5 w-px shrink-0 bg-border" />
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className={primaryActionBtnClass}
                        onClick={onOpenImport}
                      >
                        <FileInput className="h-4 w-4" aria-hidden />
                        {t('header.importSql')}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('importSql.triggerTip')}</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" onClick={onOpenAIGenerate} className={actionBtnClass}>
                        <Sparkles className="h-4 w-4" aria-hidden />
                        {t('tableConfig.aiGenerate')}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('tableConfig.aiGenerateTip')}</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={onShare}
                        className={actionBtnClass}
                        disabled={isSharing}
                        aria-busy={isSharing}
                      >
                        {isSharing ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Share2 className="h-4 w-4" aria-hidden />
                        )}
                        {isSharing ? t('header.generatingShareLink') : t('header.shareLink')}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {isSharing
                          ? t('header.generatingShareLink')
                          : t('header.generateShareLink')}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <div className="flex shrink-0 items-center justify-end gap-2">
                {authSession.workspaceScope ? <WorkspaceYDocStatus /> : null}
                <div className="hidden rounded-full bg-muted/60 px-2 py-1 text-[10px] text-muted-foreground sm:inline-flex">
                  v{packageInfo.version}
                </div>
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className={ghostIconBtnClass}
                          aria-label={t('header.moreActions')}
                        >
                          <MoreHorizontal className="h-4 w-4" aria-hidden />
                        </button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('header.moreActions')}</p>
                    </TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align="end" className="w-52" finalFocus={false}>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <Languages className="h-4 w-4" aria-hidden />
                        <span className="min-w-0 flex-1">{t('locale.label')}</span>
                        <span className="text-xs text-muted-foreground">
                          {localeLabels[locale]}
                        </span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-36">
                        <DropdownMenuRadioGroup
                          value={locale}
                          onValueChange={(value) => setLocale(value as AppLocale)}
                        >
                          <DropdownMenuRadioItem value="zh-CN">
                            {t('locale.zhCN')}
                          </DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="en-US">
                            {t('locale.enUS')}
                          </DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="ja-JP">
                            {t('locale.jaJP')}
                          </DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        {selectedTheme === 'dark' ? (
                          <Moon className="h-4 w-4" aria-hidden />
                        ) : selectedTheme === 'light' ? (
                          <Sun className="h-4 w-4" aria-hidden />
                        ) : (
                          <Laptop className="h-4 w-4" aria-hidden />
                        )}
                        <span className="min-w-0 flex-1">{t('theme.label')}</span>
                        <span className="text-xs text-muted-foreground">
                          {themeLabels[selectedTheme]}
                        </span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-36">
                        <DropdownMenuRadioGroup
                          value={selectedTheme}
                          onValueChange={(value) =>
                            runThemeTransition(value as 'system' | 'light' | 'dark')
                          }
                        >
                          <DropdownMenuRadioItem value="system" disabled={isTransitioning}>
                            {t('theme.system')}
                          </DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="light" disabled={isTransitioning}>
                            {t('theme.light')}
                          </DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="dark" disabled={isTransitioning}>
                            {t('theme.dark')}
                          </DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
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
                  </DropdownMenuContent>
                </DropdownMenu>
                {authSession.status === 'signed_in' ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-[0_0_0_3px_hsl(var(--primary)/0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        title={authSession.name ?? authSession.email ?? t('header.auth.account')}
                      >
                        {userInitials}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-48">
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        {authSession.name ?? authSession.email ?? t('header.auth.account')}
                      </div>
                      <DropdownMenuItem onClick={onOpenSettings}>
                        <Settings className="h-4 w-4" aria-hidden />
                        {t('header.auth.settings')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleSignOut}>
                        <LogOut className="h-4 w-4" aria-hidden />
                        {t('header.auth.signOut')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
                    {t('header.auth.signIn')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </header>
        {themeOverlay && typeof document !== 'undefined'
          ? createPortal(themeOverlay, document.body)
          : null}
      </>
    );
  },
);
