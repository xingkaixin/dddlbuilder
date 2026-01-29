import { memo, lazy, Suspense } from 'react';
import { ImportSqlDialog } from '@/components/ImportSqlDialog';
import { ThemeToggle } from '@/components/ThemeToggle';
import type { DatabaseType } from '@/types';
import type { ParsedResult } from '@/utils/SqlParser';
import packageInfo from '../../../package.json';
import { Share2, FileInput, History, Github } from 'lucide-react';

const ChangelogModal = lazy(() =>
  import('@/components/ChangelogModal').then((module) => ({
    default: module.ChangelogModal,
  })),
);

interface HeaderProps {
  showChangelog: boolean;
  setShowChangelog: (show: boolean) => void;
  onShare: () => void;
  currentDbType: DatabaseType;
  onImport: (result: ParsedResult, dbType: DatabaseType) => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

export const Header = memo<HeaderProps>(
  ({
    showChangelog,
    setShowChangelog,
    onShare,
    currentDbType,
    onImport,
    isDark,
    onToggleTheme,
  }) => {
    return (
      <>
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto px-4">
            <div className="flex h-14 items-center justify-between">
              {/* Logo & Title */}
              <div className="flex items-center gap-3">
                <img
                  src="/logo.svg"
                  alt="筑表师"
                  className="h-8 w-8 text-primary"
                />
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold tracking-tight">筑表师</h1>
                  <span className="text-xs text-muted-foreground">
                    v{packageInfo.version}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                {/* Import SQL */}
                <ImportSqlDialog
                  currentDbType={currentDbType}
                  onImport={onImport}
                  triggerClassName="inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                  triggerIcon={<FileInput className="h-4 w-4" />}
                  triggerLabel=""
                />

                {/* Share */}
                <button
                  onClick={onShare}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                  title="分享链接"
                >
                  <Share2 className="h-4 w-4" />
                </button>

                {/* Changelog */}
                <button
                  onClick={() => setShowChangelog(true)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                  title="更新日志"
                >
                  <History className="h-4 w-4" />
                </button>

                {/* GitHub */}
                <a
                  href="https://github.com/your-repo/ddlbuilder"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                  title="GitHub"
                >
                  <Github className="h-4 w-4" />
                </a>

                <div className="mx-1 h-4 w-px bg-border" />

                {/* Theme Toggle */}
                <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
              </div>
            </div>
          </div>
        </header>

        {showChangelog && (
          <Suspense fallback={null}>
            <ChangelogModal
              open={showChangelog}
              onOpenChange={setShowChangelog}
            />
          </Suspense>
        )}
      </>
    );
  },
);
