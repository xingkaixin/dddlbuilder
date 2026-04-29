import { memo, type ReactNode } from 'react';
import { Plus, Lightbulb, Table2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface WorkspaceEmptyStateProps {
  hasContent: boolean;
  onCreateNewTable: () => void;
  onLoadExample: () => void;
  importButton: ReactNode;
  templateButton: ReactNode;
}

export const WorkspaceEmptyState = memo<WorkspaceEmptyStateProps>(
  ({ hasContent, onCreateNewTable, onLoadExample, importButton, templateButton }) => {
    const { t } = useTranslation();

    return (
      <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center px-4 py-12">
        {/* Illustration */}
        <div className="mb-8 flex h-32 w-32 items-center justify-center rounded-2xl bg-muted/50">
          <Table2 className="h-16 w-16 text-muted-foreground/40" />
        </div>

        {/* Title */}
        <h2 className="mb-3 text-xl font-semibold text-foreground">
          {hasContent ? t('emptyState.noTabOpenTitle') : t('emptyState.completelyEmptyTitle')}
        </h2>

        {/* Description */}
        <p className="mb-8 max-w-md text-center text-sm text-muted-foreground">
          {t('emptyState.description')}
        </p>

        {/* Primary action */}
        <button
          type="button"
          onClick={onCreateNewTable}
          className="mb-4 flex w-full max-w-sm items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          {t('emptyState.createNewTable')}
        </button>

        {/* Secondary actions */}
        <div className="mb-10 grid w-full max-w-sm grid-cols-2 gap-3">
          {importButton}
          {templateButton}
        </div>

        {/* Quick experience section */}
        <div className="w-full max-w-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">{t('emptyState.quickExperience')}</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-1 text-sm font-medium">{t('emptyState.exampleTitle')}</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              {t('emptyState.exampleDescription')}
            </p>
            <button
              type="button"
              onClick={onLoadExample}
              className="w-full rounded-md border px-3 py-2 text-xs font-medium transition-colors hover:bg-accent"
            >
              {t('emptyState.loadExample')}
            </button>
          </div>
        </div>

        {/* Tip (only shown when there is content in sidebar) */}
        {hasContent && (
          <div className="mt-6 flex max-w-sm gap-3 rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{t('emptyState.tip')}</p>
          </div>
        )}
      </div>
    );
  },
);

WorkspaceEmptyState.displayName = 'WorkspaceEmptyState';
