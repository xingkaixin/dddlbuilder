import { memo, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, Loader2, ChevronDown } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { WorkspaceTab } from '@/stores';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface TabBarProps {
  leadingAction?: ReactNode;
  trailingAction?: ReactNode;
  tabs: WorkspaceTab[];
  tabTitles: ReadonlyMap<string, string>;
  dirtyTabIds: ReadonlySet<string>;
  activeTabId: string | null;
  onActivateTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onCreateTab: () => void;
}

const MAX_VISIBLE_TABS = 6;

const TabItem = memo(
  ({
    tab,
    title,
    isActive,
    isDirty,
    onActivate,
    onClose,
  }: {
    tab: WorkspaceTab;
    title: string;
    isActive: boolean;
    isDirty: boolean;
    onActivate: (id: string) => void;
    onClose: (id: string) => void;
  }) => {
    const { t } = useTranslation();
    const isDraft = tab.source.kind === 'draft';

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onActivate(tab.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onActivate(tab.id);
          }
        }}
        className={cn(
          'group relative flex h-[34px] max-w-[200px] shrink-0 cursor-pointer items-center gap-2 rounded-md px-2.5 text-sm transition-colors',
          isActive
            ? 'bg-card text-foreground shadow-[inset_0_0_0_1px_var(--line-faint)]'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <span
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            isDraft ? 'shadow-[inset_0_0_0_1.5px_var(--warning)]' : 'bg-[var(--blue)]',
          )}
        />

        <span className="min-w-0 flex-1 truncate font-mono select-none">
          {title}
          {isDirty ? ' *' : ''}
        </span>

        {tab.isLoading && (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose(tab.id);
          }}
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-sm opacity-0 transition-opacity hover:bg-accent',
            isActive ? 'opacity-100' : 'group-hover:opacity-100',
          )}
          aria-label={t('tabBar.close')}
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  },
);

TabItem.displayName = 'TabItem';

export const TabBar = memo(
  ({
    leadingAction,
    trailingAction,
    tabs,
    tabTitles,
    dirtyTabIds,
    activeTabId,
    onActivateTab,
    onCloseTab,
    onCreateTab,
  }: TabBarProps) => {
    const { t } = useTranslation();

    const { visibleTabs, hiddenTabs } = useMemo(() => {
      if (tabs.length <= MAX_VISIBLE_TABS) {
        // SAFETY: the tab value is selected from the typed tab list before navigation.
        return { visibleTabs: tabs, hiddenTabs: [] as WorkspaceTab[] };
      }

      return {
        visibleTabs: tabs.slice(0, MAX_VISIBLE_TABS),
        hiddenTabs: tabs.slice(MAX_VISIBLE_TABS),
      };
    }, [tabs]);

    return (
      <div className="flex shrink-0 items-center gap-1 px-3 pt-2" data-testid="workspace-tab-bar">
        {leadingAction}
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {visibleTabs.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              title={tabTitles.get(tab.id) ?? ''}
              isActive={tab.id === activeTabId}
              isDirty={dirtyTabIds.has(tab.id)}
              onActivate={onActivateTab}
              onClose={onCloseTab}
            />
          ))}

          {hiddenTabs.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex h-[34px] shrink-0 cursor-pointer items-center gap-1 rounded-md px-3 text-sm transition-colors',
                    hiddenTabs.some((t) => t.id === activeTabId)
                      ? 'bg-card text-foreground shadow-[inset_0_0_0_1px_var(--line-faint)]'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span className="select-none">{t('tabBar.more')}</span>
                  <ChevronDown className="h-3 w-3" />
                  {hiddenTabs.some((t) => t.id === activeTabId && dirtyTabIds.has(t.id)) && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                {hiddenTabs.map((tab) => (
                  <DropdownMenuItem
                    key={tab.id}
                    className={cn('flex items-center gap-2', tab.id === activeTabId && 'bg-accent')}
                    onClick={() => onActivateTab(tab.id)}
                  >
                    <span
                      className={cn(
                        'h-2 w-2 shrink-0 rounded-full',
                        tab.source.kind === 'draft'
                          ? 'shadow-[inset_0_0_0_1.5px_var(--warning)]'
                          : 'bg-[var(--blue)]',
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {tabTitles.get(tab.id)}
                      {dirtyTabIds.has(tab.id) ? ' *' : ''}
                    </span>
                    {tab.isLoading && (
                      <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
                    )}
                    {dirtyTabIds.has(tab.id) && !tab.isLoading && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" />
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseTab(tab.id);
                      }}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm hover:bg-accent"
                      aria-label={t('tabBar.close')}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <button
            type="button"
            onClick={onCreateTab}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={t('tabBar.createDraft')}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {trailingAction && <div className="shrink-0 pl-2">{trailingAction}</div>}
      </div>
    );
  },
);

TabBar.displayName = 'TabBar';
