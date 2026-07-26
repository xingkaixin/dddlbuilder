import { memo, type ReactNode } from 'react';
import { FileEdit, Lightbulb, Plus, Table2 } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import type { SavedTableSummary } from '@/hooks/useSavedTables';
import type { DraftSummary } from '@ddlbuilder/shared-types/workspace';

interface WorkspaceEmptyStateProps {
  hasContent: boolean;
  recentDrafts: DraftSummary[];
  recentTables: SavedTableSummary[];
  onCreateNewTable: () => void;
  onOpenDraft: (draftId: string) => void;
  onOpenTable: (table: SavedTableSummary) => void;
  onLoadExample: () => void;
  importButton: ReactNode;
  templateButton: ReactNode;
}

export const WorkspaceEmptyState = memo<WorkspaceEmptyStateProps>(
  ({
    hasContent,
    recentDrafts,
    recentTables,
    onCreateNewTable,
    onOpenDraft,
    onOpenTable,
    onLoadExample,
    importButton,
    templateButton,
  }) => {
    const { t } = useTranslation();
    const hasRecentItems = recentDrafts.length > 0 || recentTables.length > 0;

    return (
      <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="flex w-full max-w-[520px] flex-col items-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-xl border border-border bg-card shadow-sm">
            <Table2 className="h-8 w-8 text-primary" />
          </div>

          <h2 className="mb-2 text-center text-lg font-semibold tracking-tight text-foreground">
            {hasContent ? t('emptyState.noTabOpenTitle') : t('emptyState.completelyEmptyTitle')}
          </h2>

          <p className="mb-6 max-w-md text-center text-sm leading-7 text-muted-foreground">
            {t('emptyState.description')}
          </p>

          <div className="mb-8 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={onCreateNewTable}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-md"
            >
              <Plus className="h-4 w-4" />
              {t('emptyState.createNewTable')}
            </button>
            {importButton}
            {templateButton}
          </div>

          {hasRecentItems && (
            <div className="mb-8 w-full space-y-5">
              {recentDrafts.length > 0 && (
                <RecentSection title={t('emptyState.recentDrafts')}>
                  {recentDrafts.map((draft) => (
                    <RecentCard
                      key={draft.draftId}
                      title={draft.name}
                      meta={t('emptyState.draftMeta', {
                        count: draft.fieldCount,
                      })}
                      tone="draft"
                      onClick={() => onOpenDraft(draft.draftId)}
                    />
                  ))}
                </RecentSection>
              )}
              {recentTables.length > 0 && (
                <RecentSection title={t('emptyState.recentTables')}>
                  {recentTables.map((table) => (
                    <RecentCard
                      key={table.normalizedName}
                      title={table.name}
                      meta={t('emptyState.tableMeta', {
                        count: table.fieldCount,
                      })}
                      tone="table"
                      onClick={() => onOpenTable(table)}
                    />
                  ))}
                </RecentSection>
              )}
            </div>
          )}

          <div className="w-full max-w-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">
                {t('emptyState.quickExperience')}
              </span>
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

          {hasContent && (
            <div className="mt-6 flex max-w-sm gap-3 rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{t('emptyState.tip')}</p>
            </div>
          )}
        </div>
      </div>
    );
  },
);

function RecentSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="w-full">
      <div className="mb-3 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[11px] text-muted-foreground">{title}</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">{children}</div>
    </section>
  );
}

function RecentCard({
  title,
  meta,
  tone,
  onClick,
}: {
  title: string;
  meta: string;
  tone: 'draft' | 'table';
  onClick: () => void;
}) {
  const iconClass =
    tone === 'draft'
      ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300'
      : 'bg-primary/10 text-primary';
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 items-center gap-2.5 rounded-lg border border-border/80 bg-card px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm"
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${iconClass}`}>
        {tone === 'draft' ? <FileEdit className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-foreground">{title}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{meta}</span>
      </span>
    </button>
  );
}

WorkspaceEmptyState.displayName = 'WorkspaceEmptyState';
