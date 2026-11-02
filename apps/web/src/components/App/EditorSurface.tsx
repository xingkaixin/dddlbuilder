import { useId, useReducer, useRef, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import type { EditorLayout } from '@/stores/preferencesStore';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/stores';
import { DATABASE_OPTIONS } from './databaseOptions';
import { TableConfig } from './TableConfig';
import { SchemaLintPanel } from './SchemaLintPanel';
import { OutputContainer, type OutputContainerProps } from './containers/OutputContainer';
import {
  TableBuilderContainer,
  type TableBuilderContainerProps,
} from './containers/TableBuilderContainer';

export interface EditorSurfaceModel {
  documentId: string;
  isShareView: boolean;
  tableConfigProps: ComponentProps<typeof TableConfig>;
  tableBuilderProps: TableBuilderContainerProps;
  outputProps: OutputContainerProps;
}

const SPLIT_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'] as const;

type SplitEvent =
  | { type: 'dragged'; percent: number }
  | { type: 'keyPressed'; key: (typeof SPLIT_KEYS)[number] };

function splitPercentReducer(percent: number, event: SplitEvent) {
  const next =
    event.type === 'dragged'
      ? event.percent
      : event.key === 'Home'
        ? 30
        : event.key === 'End'
          ? 75
          : percent + (event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -5 : 5);

  return Math.max(30, Math.min(75, next));
}

function EditorStatus() {
  const { t } = useTranslation();

  const fieldCount = useEditorStore(
    (state) => state.rows.filter((row) => row.fieldName?.trim()).length,
  );
  const dbType = useEditorStore((state) => state.dbType);

  return (
    <>
      <span>{t('editorLayout.fieldCount', { count: fieldCount })}</span>
      <span className="ml-auto font-mono">
        {DATABASE_OPTIONS.find((option) => option.value === dbType)?.label}
      </span>
    </>
  );
}

export function EditorSurface({
  model,
  layout: view,
}: {
  model: EditorSurfaceModel;
  layout: EditorLayout;
}) {
  const { documentId, isShareView, tableConfigProps, tableBuilderProps, outputProps } = model;
  const { t } = useTranslation();
  const [splitPercent, dispatchSplit] = useReducer(splitPercentReducer, 55);
  const paired = view === 'side' || view === 'split';
  const panesRef = useRef<HTMLDivElement>(null);
  const builderId = useId();
  const issues = outputProps.ddlOutputProps.schemaLintIssues ?? [];

  return (
    <section
      className="@container/editor flex min-h-0 flex-1 flex-col bg-background"
      data-testid="editor-surface"
      data-view={view}
    >
      <div className="shrink-0 px-4 pb-2 pt-2.5">
        <div
          className={isShareView ? 'pointer-events-none select-none opacity-80' : undefined}
          inert={isShareView}
        >
          <TableConfig key={documentId} {...tableConfigProps} />
        </div>
      </div>
      <div
        ref={panesRef}
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-auto',
          view === 'side'
            ? '@min-[980px]/editor:flex-row @min-[980px]/editor:overflow-hidden'
            : 'sm:overflow-hidden',
        )}
      >
        <div
          id={builderId}
          hidden={view === 'output'}
          className={cn(
            'min-h-0 min-w-0 overflow-auto px-4 pb-2',
            view === 'design' && 'flex-1',
            view === 'split' && 'min-h-[26rem] shrink-0 sm:min-h-0',
            view === 'side' && 'min-h-[26rem] shrink-0 @min-[980px]/editor:min-h-0',
          )}
          style={paired ? { flexBasis: `${splitPercent}%` } : undefined}
          data-testid="design-panel"
        >
          <div
            className={isShareView ? 'pointer-events-none select-none opacity-80' : undefined}
            inert={isShareView}
          >
            <TableBuilderContainer key={documentId} {...tableBuilderProps} />
          </div>
        </div>
        {paired && (
          <div
            role="separator"
            tabIndex={0}
            aria-label={t('editorLayout.resize')}
            aria-orientation={view === 'side' ? 'vertical' : 'horizontal'}
            aria-controls={builderId}
            aria-valuemin={30}
            aria-valuemax={75}
            aria-valuenow={Math.round(splitPercent)}
            className={cn(
              'hidden shrink-0 touch-none items-center justify-center hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              view === 'side'
                ? 'w-3 cursor-col-resize @min-[980px]/editor:flex'
                : 'h-3 cursor-row-resize sm:flex',
            )}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
              const bounds = panesRef.current?.getBoundingClientRect();

              if (bounds?.height) {
                dispatchSplit({
                  type: 'dragged',
                  percent:
                    view === 'side'
                      ? ((event.clientX - bounds.left) / bounds.width) * 100
                      : ((event.clientY - bounds.top) / bounds.height) * 100,
                });
              }
            }}
            onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
            onKeyDown={(event) => {
              const key = SPLIT_KEYS.find((candidate) => candidate === event.key);

              if (!key) return;
              event.preventDefault();
              dispatchSplit({ type: 'keyPressed', key });
            }}
          >
            <span className={cn('bg-border', view === 'side' ? 'h-full w-px' : 'h-px w-full')} />
          </div>
        )}
        <div
          hidden={view === 'design'}
          className={cn(
            'min-h-0 min-w-0 flex-1 overflow-auto px-4 pb-2',
            view === 'split' && 'min-h-[20rem] shrink-0 sm:min-h-0 sm:shrink',
            view === 'side' &&
              'min-h-[20rem] shrink-0 @min-[980px]/editor:min-h-0 @min-[980px]/editor:shrink',
          )}
          data-testid="generated-results"
        >
          <OutputContainer {...outputProps} frozen={view === 'design'} />
        </div>
      </div>
      <footer className="flex h-8 shrink-0 items-center gap-4 overflow-hidden whitespace-nowrap bg-muted px-4 text-[13px] text-muted-foreground">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-7 px-0 text-[13px] hover:bg-transparent',
                issues.length > 0 && 'text-[var(--warning)]',
              )}
            >
              {t('schemaLint.title')} ·{' '}
              {issues.length
                ? t('schemaLint.issueCount', { count: issues.length })
                : t('schemaLint.pass')}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="top"
            className="max-h-[60dvh] w-[min(32rem,calc(100vw-2rem))] overflow-auto p-0"
          >
            <SchemaLintPanel issues={issues} />
          </PopoverContent>
        </Popover>
        <EditorStatus />
      </footer>
    </section>
  );
}
