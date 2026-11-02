import { lazy, Suspense, useMemo, useReducer, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Pin, Search } from '@/components/icons';
import { Input } from '@/components/ui/input';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { followAppLink } from '@/lib/appNavigation';
import { cn } from '@/lib/utils';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { getWorkspaceScopeStorageKey } from '@/utils/workspaceScope';
import {
  ACTION_TOOL_GROUPS,
  isPageToolId,
  PAGE_TOOL_GROUPS,
  TOOL_GROUPS,
  type ToolEntry,
} from './toolCatalog';
import { openTool, type ToolActions } from './toolActions';

const ToolDetail = lazy(() => import('./ToolDetail'));

interface ToolsPageProps {
  toolId: string | null;
  actions: ToolActions;
}

const queryReducer = (_query: string, next: string) => next;

const toolRowClass =
  'flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2.5 text-left text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function ToolRowContent({ tool }: { tool: ToolEntry }) {
  const { t } = useTranslation();
  const { icon: Icon } = tool;

  return (
    <>
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0">
        <span className="block text-[15px]">{t(tool.label)}</span>
        <span className="block font-text text-[13px] leading-5 text-muted-foreground">
          {t(`toolsPage.description.${tool.id}`)}
        </span>
      </span>
    </>
  );
}

function PinButton({ tool }: { tool: ToolEntry }) {
  const { t } = useTranslation();
  const pinned = usePreferencesStore((state) => state.pinnedTools);
  const setPreference = usePreferencesStore((state) => state.setPreference);
  const isPinned = pinned.includes(tool.id);

  return (
    <button
      type="button"
      aria-label={t('toolsPage.pin', { name: t(tool.label) })}
      aria-pressed={isPinned}
      onClick={() =>
        setPreference(
          'pinnedTools',
          isPinned ? pinned.filter((id) => id !== tool.id) : [...pinned, tool.id],
        )
      }
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isPinned ? 'text-[var(--blue-strong)]' : 'text-muted-foreground',
      )}
    >
      <Pin className="h-4 w-4" aria-hidden />
    </button>
  );
}

function ToolList({ actions }: { actions: ToolActions }) {
  const { t } = useTranslation();
  const [query, setQuery] = useReducer(queryReducer, '');

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return (tool: ToolEntry) =>
      !needle ||
      `${t(tool.label)} ${t(`toolsPage.description.${tool.id}`)}`.toLowerCase().includes(needle);
  }, [query, t]);

  const hasMatches = TOOL_GROUPS.some((group) => group.tools.some(matches));

  const renderGroup = <Tool extends ToolEntry>(
    group: { id: string; label: string; tools: readonly Tool[] },
    renderRow: (tool: Tool) => ReactNode,
  ) => {
    const tools = group.tools.filter(matches);

    if (tools.length === 0) return null;

    return (
      <section key={group.id} aria-labelledby={`tool-group-${group.id}`}>
        <h2 id={`tool-group-${group.id}`} className="relative mb-3 pb-2 text-lg font-normal">
          {t(group.label)}
          <span aria-hidden className="lm-rule" />
        </h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-x-4 gap-y-2">
          {tools.map((tool) => (
            <div key={tool.id} className="flex items-center gap-1">
              {renderRow(tool)}
              <PinButton tool={tool} />
            </div>
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-6 pb-14 pt-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[28px] font-normal leading-9">{t('schemaTools.title')}</h1>
        <label className="relative block w-full sm:w-[280px]">
          <span className="sr-only">{t('toolsPage.search')}</span>
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('toolsPage.search')}
            className="pl-8"
          />
        </label>
      </header>
      {PAGE_TOOL_GROUPS.map((group) =>
        renderGroup<ToolEntry>(group, (tool) => (
          <a
            href={`/tools/${tool.id}`}
            className={toolRowClass}
            onClick={(event) => followAppLink(event, `/tools/${tool.id}`)}
          >
            <ToolRowContent tool={tool} />
          </a>
        )),
      )}
      {ACTION_TOOL_GROUPS.map((group) =>
        renderGroup<ToolEntry>(group, (tool) => (
          <button type="button" className={toolRowClass} onClick={() => openTool(tool.id, actions)}>
            <ToolRowContent tool={tool} />
          </button>
        )),
      )}
      {!hasMatches && <p className="text-sm text-muted-foreground">{t('toolsPage.noResults')}</p>}
    </div>
  );
}

export default function ToolsPage({ toolId, actions }: ToolsPageProps) {
  const { t } = useTranslation();
  const scope = useWorkspaceScope();

  if (!toolId || !isPageToolId(toolId)) return <ToolList actions={actions} />;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 pb-14 pt-5 sm:px-6">
      <a
        href="/tools"
        className="inline-flex w-fit items-center gap-1.5 rounded-md px-1 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={(event) => followAppLink(event, '/tools')}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t('schemaTools.title')}
      </a>
      <Suspense fallback={<span role="status">{t('schemaTools.loading')}</span>}>
        <ToolDetail key={scope ? getWorkspaceScopeStorageKey(scope) : 'loading'} toolId={toolId} />
      </Suspense>
    </div>
  );
}
