import { memo, lazy, Suspense } from 'react';
import type { DatabaseType } from '@/types';
import type { ParsedResult } from '@/utils/SqlParser';
import packageInfo from '../../../package.json';
import { Share2, FileInput, Loader2, BookOpen } from 'lucide-react';
import { ThemeSwitcher } from './ThemeSwitcher';
import { LocaleSwitcher } from './LocaleSwitcher';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useLocale } from '@/i18n/LocaleContext';
import { getDocsUrl } from '@/utils/docsLink';
import { useTranslation } from 'react-i18next';

const ImportSqlDialog = lazy(() =>
  import('@/components/ImportSqlDialog').then((module) => ({
    default: module.ImportSqlDialog,
  })),
);

interface HeaderProps {
  onShare: () => void;
  isSharing: boolean;
  currentDbType: DatabaseType;
  onImport: (result: ParsedResult, dbType: DatabaseType) => void;
  onPlayFireworks?: () => void;
}

export const Header = memo<HeaderProps>(
  ({ onShare, isSharing, currentDbType, onImport, onPlayFireworks }) => {
    const { t } = useTranslation();
    const { locale } = useLocale();
    const docsUrl = getDocsUrl(locale);
    const actionBtnClass =
      'group inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-xs font-medium text-primary transition-all duration-200 hover:translate-x-0.5 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60';

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

          <div className="relative px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 group">
                <img
                  src="/logo.svg"
                  alt={`${t('header.appName')} Logo`}
                  width={40}
                  height={40}
                  className="h-10 w-10 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent tracking-tight">
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
                              width="30"
                              height="30"
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
                              <rect
                                x="35"
                                y="15"
                                width="30"
                                height="6"
                                rx="2"
                                fill="#FFD700"
                              />
                              <ellipse
                                cx="50"
                                cy="45"
                                rx="35"
                                ry="28"
                                fill="#D32F2F"
                              />
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
                              <rect
                                x="35"
                                y="70"
                                width="30"
                                height="6"
                                rx="2"
                                fill="#FFD700"
                              />
                              <path
                                d="M50 76 V 85"
                                stroke="#D32F2F"
                                strokeWidth="3"
                              />
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
                              <circle
                                cx="50"
                                cy="45"
                                r="8"
                                fill="#FFD700"
                                opacity="0.8"
                              />
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
                  <p className="text-sm text-muted-foreground transition-colors duration-300 group-hover:text-foreground/80">
                    {t('header.appDescription')}
                  </p>
                </div>
              </div>
              <div className="text-right space-y-1">
                <div className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-full inline-block">
                  v{packageInfo.version}
                </div>
                <div className="flex items-center gap-3">
                  <Suspense
                    fallback={
                      <button type="button" className={actionBtnClass} disabled>
                        <FileInput className="h-4 w-4" aria-hidden />
                        {t('header.importSql')}
                      </button>
                    }
                  >
                    <ImportSqlDialog
                      currentDbType={currentDbType}
                      onImport={onImport}
                      triggerClassName={actionBtnClass}
                      triggerIcon={
                        <FileInput className="h-4 w-4" aria-hidden />
                      }
                      triggerLabel={t('header.importSql')}
                    />
                  </Suspense>
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
                          <Loader2
                            className="h-4 w-4 animate-spin"
                            aria-hidden
                          />
                        ) : (
                          <Share2 className="h-4 w-4" aria-hidden />
                        )}
                        {isSharing
                          ? t('header.generatingShareLink')
                          : t('header.shareLink')}
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
                  <LocaleSwitcher triggerClassName={actionBtnClass} />
                  <ThemeSwitcher triggerClassName={actionBtnClass} />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={docsUrl}
                        className={actionBtnClass}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <BookOpen className="h-4 w-4" aria-hidden />
                        {t('header.docs')}
                      </a>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('header.viewDocs')}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>
          </div>
        </header>
      </>
    );
  },
);
