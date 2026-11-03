import { useMemo, useReducer, type ComponentType, type KeyboardEvent } from 'react';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';
import type { DraftSummary } from '@ddlbuilder/shared-types/workspace';
import {
  FileEdit,
  FileInput,
  FilePlus,
  GitCompare,
  Languages,
  LayoutTwoColumn,
  Moon,
  Save,
  Search,
  Settings,
  Sparkles,
  Sun,
  Table,
  type AppIconProps,
} from '@/components/icons';
import { useLocale } from '@/i18n/LocaleContext';
import { LOCALES } from '@/i18n/types';
import { openTool, type ToolActions } from '@/components/schema-tools/toolActions';
import { TOOL_GROUPS } from '@/components/schema-tools/toolCatalog';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { SavedTableSummary } from '@/hooks/useSavedTables';
import { navigateApp } from '@/lib/appNavigation';
import { cn } from '@/lib/utils';
import { usePreferencesStore, type EditorLayout } from '@/stores/preferencesStore';

const MAX_TABLES = 20;

const LAYOUT_ORDER: EditorLayout[] = ['side', 'split', 'design', 'output'];

const GROUP_ORDER = ['actions', 'tables', 'tools', 'settings'] as const;

type CommandGroup = (typeof GROUP_ORDER)[number];

interface Command {
  id: string;
  group: CommandGroup;
  label: string;
  icon: ComponentType<AppIconProps>;
  mono?: boolean;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tables: SavedTableSummary[];
  drafts: DraftSummary[];
  onOpenTable: (table: SavedTableSummary) => void;
  onOpenDraft: (draftId: string) => void;
  onCreateDraft: () => void;
  onOpenImport: () => void;
  onSave?: () => void;
  onViewDiff?: () => void;
  toolActions: ToolActions;
}

type PaletteState = { query: string; active: number };

type PaletteEvent =
  | { type: 'queryChanged'; query: string }
  | { type: 'moved'; delta: number; count: number }
  | { type: 'hovered'; index: number };

function paletteReducer(state: PaletteState, event: PaletteEvent): PaletteState {
  switch (event.type) {
    case 'queryChanged':
      return { query: event.query, active: 0 };
    case 'moved':
      return {
        ...state,
        active: event.count === 0 ? 0 : (state.active + event.delta + event.count) % event.count,
      };
    case 'hovered':
      return { ...state, active: event.index };
  }
}

function useCommands({
  tables,
  drafts,
  onOpenTable,
  onOpenDraft,
  onCreateDraft,
  onOpenImport,
  onSave,
  onViewDiff,
  toolActions,
}: Omit<CommandPaletteProps, 'open' | 'onOpenChange'>) {
  const { t } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();
  const { locale, setLocale } = useLocale();
  const pinned = usePreferencesStore((state) => state.pinnedTools);
  const layout = usePreferencesStore((state) => state.layout);
  const setPreference = usePreferencesStore((state) => state.setPreference);
  const dark = resolvedTheme === 'dark';

  return useMemo<Command[]>(() => {
    const onTablesView = (run: () => void) => () => {
      navigateApp('/');
      run();
    };

    const actions: Command[] = [
      ...(onSave
        ? [
            {
              id: 'save',
              group: 'actions',
              label: t('commandPalette.save'),
              icon: Save,
              run: onTablesView(onSave),
            } satisfies Command,
          ]
        : []),
      ...(onViewDiff
        ? [
            {
              id: 'diff',
              group: 'actions',
              label: t('commandPalette.viewDiff'),
              icon: GitCompare,
              run: onTablesView(onViewDiff),
            } satisfies Command,
          ]
        : []),
      {
        id: 'new-draft',
        group: 'actions',
        label: t('commandPalette.newDraft'),
        icon: FilePlus,
        run: onTablesView(onCreateDraft),
      },
      {
        id: 'ai',
        group: 'actions',
        label: t('commandPalette.openAI'),
        icon: Sparkles,
        run: onTablesView(toolActions.onOpenAIGenerate),
      },
      {
        id: 'import',
        group: 'actions',
        label: t('commandPalette.import'),
        icon: FileInput,
        run: onTablesView(onOpenImport),
      },
    ];

    const tableCommands: Command[] = [
      ...drafts.map((draft) => ({
        id: `draft:${draft.draftId}`,
        group: 'tables' as const,
        label: draft.name,
        icon: FileEdit,
        mono: true,
        run: onTablesView(() => onOpenDraft(draft.draftId)),
      })),
      ...tables.map((table) => ({
        id: `table:${table.tableId}`,
        group: 'tables' as const,
        label: table.name,
        icon: Table,
        mono: true,
        run: onTablesView(() => onOpenTable(table)),
      })),
    ];

    const tools = TOOL_GROUPS.flatMap((group) => group.tools).sort(
      (a, b) => Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)),
    );

    return [
      ...actions,
      ...tableCommands,
      ...tools.map((tool) => ({
        id: `tool:${tool.id}`,
        group: 'tools' as const,
        label: t(tool.label),
        icon: tool.icon,
        run: () => openTool(tool.id, toolActions),
      })),
      {
        id: 'theme',
        group: 'settings',
        label: t(dark ? 'commandPalette.toLight' : 'commandPalette.toDark'),
        icon: dark ? Sun : Moon,
        run: () => setTheme(dark ? 'light' : 'dark'),
      },
      ...LOCALES.filter(({ value }) => value !== locale).map(({ value, label }) => ({
        id: `locale:${value}`,
        group: 'settings' as const,
        label: t('commandPalette.switchLocale', { language: t(label) }),
        icon: Languages,
        run: () => setLocale(value),
      })),
      {
        id: 'layout',
        group: 'settings',
        label: t('commandPalette.changeLayout'),
        icon: LayoutTwoColumn,
        run: () =>
          setPreference(
            'layout',
            LAYOUT_ORDER[(LAYOUT_ORDER.indexOf(layout) + 1) % LAYOUT_ORDER.length],
          ),
      },
      {
        id: 'settings',
        group: 'settings',
        label: t('commandPalette.openSettings'),
        icon: Settings,
        run: () => navigateApp('/settings'),
      },
    ];
  }, [
    dark,
    drafts,
    layout,
    locale,
    onCreateDraft,
    onOpenDraft,
    onOpenImport,
    onOpenTable,
    onSave,
    onViewDiff,
    pinned,
    setLocale,
    setPreference,
    setTheme,
    t,
    tables,
    toolActions,
  ]);
}

function filterCommands(commands: Command[], query: string) {
  const needle = query.trim().toLowerCase();

  const matched = needle
    ? commands.filter((command) => command.label.toLowerCase().includes(needle))
    : commands;
  let tableCount = 0;

  return matched.filter((command) => {
    if (command.group !== 'tables') return true;
    tableCount += 1;

    return tableCount <= MAX_TABLES;
  });
}

function PaletteBody({ onOpenChange, ...props }: Omit<CommandPaletteProps, 'open'>) {
  const { t } = useTranslation();
  const commands = useCommands(props);
  const [{ query, active }, dispatch] = useReducer(paletteReducer, { query: '', active: 0 });
  const visible = useMemo(() => filterCommands(commands, query), [commands, query]);

  const ordered = useMemo(
    () => GROUP_ORDER.flatMap((group) => visible.filter((command) => command.group === group)),
    [visible],
  );

  const run = (command: Command | undefined) => {
    if (!command) return;
    onOpenChange(false);
    command.run();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      dispatch({
        type: 'moved',
        delta: event.key === 'ArrowDown' ? 1 : -1,
        count: ordered.length,
      });
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      run(ordered[active]);
    }
  };

  return (
    <>
      <DialogTitle className="sr-only">{t('commandPalette.search')}</DialogTitle>
      <div className="flex items-center gap-2.5 px-4 py-3.5 text-muted-foreground">
        <Search className="h-5 w-5 shrink-0" aria-hidden />
        <input
          role="combobox"
          aria-expanded
          aria-controls="command-palette-list"
          aria-activedescendant={ordered[active] ? `command-${active}` : undefined}
          aria-label={t('commandPalette.search')}
          placeholder={t('commandPalette.search')}
          value={query}
          onChange={(event) => dispatch({ type: 'queryChanged', query: event.target.value })}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 border-0 bg-transparent pr-6 font-text text-[17px] text-foreground outline-none placeholder:font-ui placeholder:text-muted-foreground"
        />
      </div>
      <div className="relative">
        <span aria-hidden className="lm-rule" />
      </div>
      <div
        id="command-palette-list"
        role="listbox"
        aria-label={t('commandPalette.search')}
        className="min-h-0 overflow-auto px-2 pb-3 pt-1"
      >
        {ordered.length === 0 && (
          <p className="px-2 py-3 text-sm text-muted-foreground">{t('commandPalette.noResults')}</p>
        )}
        {GROUP_ORDER.map((group) => {
          const items = ordered.filter((command) => command.group === group);

          if (items.length === 0) return null;

          return (
            <div key={group} role="group" aria-label={t(`commandPalette.groups.${group}`)}>
              <div className="px-2 pb-1 pt-2.5 text-xs text-muted-foreground">
                {t(`commandPalette.groups.${group}`)}
              </div>
              {items.map((command) => {
                const index = ordered.indexOf(command);
                const Icon = command.icon;

                return (
                  <button
                    key={command.id}
                    id={`command-${index}`}
                    ref={
                      index === active
                        ? (node) => node?.scrollIntoView({ block: 'nearest' })
                        : undefined
                    }
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={index === active}
                    className={cn(
                      'flex min-h-[38px] w-full items-center gap-2.5 rounded-md px-2 text-left text-foreground',
                      index === active && 'lm-hatch',
                    )}
                    onClick={() => run(command)}
                    onPointerMove={() => dispatch({ type: 'hovered', index })}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className={cn('truncate', command.mono && 'font-mono text-[13px]')}>
                      {command.label}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}

export function CommandPalette({ open, onOpenChange, ...props }: CommandPaletteProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[calc(12vh+min(33vh,240px))] flex h-[min(66vh,480px)] w-[min(620px,calc(100%-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0">
        <PaletteBody onOpenChange={onOpenChange} {...props} />
      </DialogContent>
    </Dialog>
  );
}
