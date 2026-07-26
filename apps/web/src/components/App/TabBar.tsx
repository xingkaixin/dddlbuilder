import { memo, useMemo, type ReactNode } from 'react';
import { Plus, X, Loader2, ChevronDown } from 'lucide-react';
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
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  onActivateTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onCreateTab: () => void;
}

const MAX_VISIBLE_TABS = 6;

const TabItem = memo(
  ({
    tab,
    isActive,
    onActivate,
    onClose,
  }: {
    tab: WorkspaceTab;
    isActive: boolean;
    onActivate: () => void;
    onClose: (e: React.MouseEvent) => void;
  }) => {
    const isDraft = tab.source.kind === 'draft';

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onActivate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onActivate();
          }
        }}
        className={cn(
          'group relative flex h-9 max-w-[200px] shrink-0 cursor-pointer items-center gap-2 rounded-t-md border-t border-x px-3 text-sm transition-colors',
          isActive
            ? 'border-border bg-background text-foreground'
            : 'border-transparent bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground',
        )}
      >
        {/* 来源类型指示器 */}
        <span
          className={cn('h-2 w-2 shrink-0 rounded-full', isDraft ? 'bg-amber-500' : 'bg-primary')}
        />

        {/* 标题 */}
        <span className="min-w-0 flex-1 truncate select-none">
          {tab.title}
          {tab.isDirty ? ' *' : ''}
        </span>

        {/* 加载指示器 */}
        {tab.isLoading && (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
        )}

        {/* 关闭按钮 */}
        <button
          type="button"
          onClick={onClose}
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-sm opacity-0 transition-opacity hover:bg-accent',
            isActive ? 'opacity-100' : 'group-hover:opacity-100',
          )}
          aria-label="关闭标签页"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  },
);

TabItem.displayName = 'TabItem';

export const TabBar = memo(
  ({ leadingAction, tabs, activeTabId, onActivateTab, onCloseTab, onCreateTab }: TabBarProps) => {
    const { visibleTabs, hiddenTabs } = useMemo(() => {
      if (tabs.length <= MAX_VISIBLE_TABS) {
        return { visibleTabs: tabs, hiddenTabs: [] as WorkspaceTab[] };
      }
      return {
        visibleTabs: tabs.slice(0, MAX_VISIBLE_TABS),
        hiddenTabs: tabs.slice(MAX_VISIBLE_TABS),
      };
    }, [tabs]);

    return (
      <div className="flex items-end gap-1 border-b bg-muted/20 px-2 pt-1">
        {leadingAction}
        <div className="flex min-w-0 flex-1 items-end gap-1">
          {visibleTabs.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              onActivate={() => onActivateTab(tab.id)}
              onClose={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
            />
          ))}

          {hiddenTabs.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex h-9 shrink-0 cursor-pointer items-center gap-1 rounded-t-md border-t border-x px-3 text-sm transition-colors',
                    hiddenTabs.some((t) => t.id === activeTabId)
                      ? 'border-border bg-background text-foreground'
                      : 'border-transparent bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                  )}
                >
                  <span className="select-none">更多</span>
                  <ChevronDown className="h-3 w-3" />
                  {hiddenTabs.some((t) => t.id === activeTabId && t.isDirty) && (
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
                        tab.source.kind === 'draft' ? 'bg-amber-500' : 'bg-primary',
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {tab.title}
                      {tab.isDirty ? ' *' : ''}
                    </span>
                    {tab.isLoading && (
                      <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
                    )}
                    {tab.isDirty && !tab.isLoading && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" />
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseTab(tab.id);
                      }}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm hover:bg-accent"
                      aria-label="关闭标签页"
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
            className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="新建草稿"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  },
);

TabBar.displayName = 'TabBar';
