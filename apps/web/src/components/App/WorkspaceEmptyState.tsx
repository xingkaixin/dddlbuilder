import { memo, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { DraftSummary } from '@ddlbuilder/shared-types/workspace';
import { ArrowRight } from '@/components/icons';
import { openTool, type ToolActions } from '@/components/schema-tools/toolActions';
import { TOOL_GROUPS } from '@/components/schema-tools/toolCatalog';
import { FeatureTile } from '@/components/ui/feature-tile';
import { Ink } from '@/components/ui/sketch';
import type { SavedTableSummary } from '@/hooks/useSavedTables';
import { followAppLink } from '@/lib/appNavigation';
import { useWorkspaceYDoc } from '@/providers/WorkspaceYDocProvider';
import { usePreferencesStore } from '@/stores/preferencesStore';

const MAX_RECENT = 6;

const MODULE_LINKS = ['moduleRbac', 'moduleBooking', 'moduleInventory'] as const;

const linkClass = 'text-[var(--blue-strong)] underline underline-offset-4';

interface WorkspaceEmptyStateProps {
  hasContent: boolean;
  recentDrafts: DraftSummary[];
  recentTables: SavedTableSummary[];
  onCreateNewTable: () => void;
  onOpenDraft: (draftId: string) => void;
  onOpenTable: (table: SavedTableSummary) => void;
  onLoadExample: () => void;
  onOpenImport: () => void;
  onOpenAIGenerate: () => void;
  toolActions: ToolActions;
}

function CardGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-3">
      {children}
    </div>
  );
}

function FirstRunHome({
  awaitingCloud,
  onCreateNewTable,
  onLoadExample,
  onOpenImport,
  onOpenAIGenerate,
}: Pick<
  WorkspaceEmptyStateProps,
  'onCreateNewTable' | 'onLoadExample' | 'onOpenImport' | 'onOpenAIGenerate'
> & { awaitingCloud: boolean }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-1 flex-col items-center gap-8 overflow-auto px-6 pb-8 pt-14">
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 className="text-[34px] font-normal leading-10">
          {t(awaitingCloud ? 'emptyState.initialSyncTitle' : 'home.title')}
        </h2>
        <p className="max-w-md font-text text-muted-foreground">
          {t(awaitingCloud ? 'emptyState.initialSyncDescription' : 'home.subtitle')}
        </p>
      </div>
      <div className="flex w-full max-w-[1040px] flex-col gap-6">
        <div className="lm-sketch tile-frame relative">
          <Ink radius={8} />
          <div className="tile-grid">
            <FeatureTile
              scene="ddl"
              order={0}
              title={t('home.blankTitle')}
              description={t('home.blankDescription')}
              onClick={onCreateNewTable}
            />
            <FeatureTile
              scene="import"
              order={1}
              title={t('home.importTitle')}
              description={t('home.importDescription')}
              onClick={onOpenImport}
            />
            <FeatureTile
              scene="ai"
              order={2}
              title={t('home.aiTitle')}
              description={t('home.aiDescription')}
              onClick={onOpenAIGenerate}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
          <span>{t('home.tryExample')}</span>
          <button type="button" className={linkClass} onClick={onLoadExample}>
            {t('home.example')}
          </button>
          <span aria-hidden>·</span>
          <span>{t('home.modules')}</span>
          {MODULE_LINKS.map((key) => (
            <a
              key={key}
              href="/tools/modules"
              className={linkClass}
              onClick={(event) => followAppLink(event, '/tools/modules')}
            >
              {t(`home.${key}`)}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function RecentCard({
  title,
  meta,
  onClick,
}: {
  title: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="lm-sketch relative flex min-h-16 min-w-0 flex-col justify-center gap-0.5 rounded-md px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Ink radius={6} />
      <span className="truncate font-mono text-sm">{title}</span>
      <span className="truncate font-text text-[13px] text-muted-foreground">{meta}</span>
    </button>
  );
}

function ReturningHome({
  recentDrafts,
  recentTables,
  onOpenDraft,
  onOpenTable,
  toolActions,
}: Pick<
  WorkspaceEmptyStateProps,
  'recentDrafts' | 'recentTables' | 'onOpenDraft' | 'onOpenTable' | 'toolActions'
>) {
  const { t } = useTranslation();
  const pinnedIds = usePreferencesStore((state) => state.pinnedTools);

  const pinnedTools = useMemo(
    () => TOOL_GROUPS.flatMap((group) => group.tools).filter((tool) => pinnedIds.includes(tool.id)),
    [pinnedIds],
  );

  const recent = useMemo(
    () =>
      [
        ...recentDrafts.map((draft) => ({
          key: `draft:${draft.draftId}`,
          title: draft.name,
          meta: t('emptyState.draftMeta', { count: draft.fieldCount }),
          updatedAt: draft.updatedAt,
          open: () => onOpenDraft(draft.draftId),
        })),
        ...recentTables.map((table) => ({
          key: `table:${table.tableId}`,
          title: table.name,
          meta: t('emptyState.tableMeta', { count: table.fieldCount }),
          updatedAt: table.updatedAt,
          open: () => onOpenTable(table),
        })),
      ]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_RECENT),
    [onOpenDraft, onOpenTable, recentDrafts, recentTables, t],
  );

  return (
    <div className="flex flex-1 flex-col overflow-auto px-6 pb-8 pt-12">
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-8">
        <h2 className="text-[28px] font-normal leading-9">{t('home.continueTitle')}</h2>
        {recent.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-normal text-muted-foreground">{t('home.recent')}</h3>
            <CardGrid>
              {recent.map(({ key, title, meta, open }) => (
                <RecentCard key={key} title={title} meta={meta} onClick={open} />
              ))}
            </CardGrid>
          </section>
        )}
        {pinnedTools.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-normal text-muted-foreground">{t('home.pinnedTools')}</h3>
              <a
                href="/tools"
                className="text-sm text-muted-foreground underline underline-offset-4"
                onClick={(event) => followAppLink(event, '/tools')}
              >
                {t('home.manage')}
              </a>
            </div>
            <CardGrid>
              {pinnedTools.map((tool) => {
                const Icon = tool.icon;

                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => openTool(tool.id, toolActions)}
                    className="flex min-w-0 items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{t(tool.label)}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                );
              })}
            </CardGrid>
          </section>
        )}
      </div>
    </div>
  );
}

export const WorkspaceEmptyState = memo<WorkspaceEmptyStateProps>(
  ({ hasContent, onCreateNewTable, onLoadExample, onOpenImport, onOpenAIGenerate, ...recent }) => {
    const workspace = useWorkspaceYDoc();

    if (hasContent) return <ReturningHome {...recent} />;

    return (
      <FirstRunHome
        awaitingCloud={Boolean(workspace.doc && !workspace.remoteLoaded)}
        onCreateNewTable={onCreateNewTable}
        onLoadExample={onLoadExample}
        onOpenImport={onOpenImport}
        onOpenAIGenerate={onOpenAIGenerate}
      />
    );
  },
);

WorkspaceEmptyState.displayName = 'WorkspaceEmptyState';
