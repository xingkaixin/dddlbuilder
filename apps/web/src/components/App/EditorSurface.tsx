import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EditorView } from '@/stores/appUiStore';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
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
  editorView: EditorView;
  setEditorView: (view: EditorView) => void;
  tableBuilderProps: TableBuilderContainerProps;
  outputProps: OutputContainerProps;
}

export function EditorSurface({ model }: { model: EditorSurfaceModel }) {
  const { documentId, isShareView, editorView, setEditorView, tableBuilderProps, outputProps } =
    model;
  const { t } = useTranslation();
  const [shareView, setShareView] = useState<EditorView>('output');
  const view = isShareView ? shareView : editorView;
  const selectView = isShareView ? setShareView : setEditorView;
  const [splitPercent, setSplitPercent] = useState(55);
  const panesRef = useRef<HTMLDivElement>(null);
  const builderId = useId();
  const issues = outputProps.ddlOutputProps.schemaLintIssues ?? [];
  const resize = (value: number) => setSplitPercent(Math.max(30, Math.min(75, value)));

  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-background"
      data-testid="editor-surface"
      data-view={view}
    >
      <div className="shrink-0 border-b px-4 pt-3">
        <div
          className={isShareView ? 'pointer-events-none select-none opacity-80' : undefined}
          inert={isShareView}
        >
          <TableConfig key={documentId} {...tableBuilderProps.tableConfigProps} />
        </div>
        <div className="flex items-center justify-between gap-2 py-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-7 px-2 text-xs',
                  issues.length > 0 && 'text-amber-700 dark:text-amber-400',
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
              className="max-h-[60dvh] w-[min(32rem,calc(100vw-2rem))] overflow-auto p-0"
            >
              <SchemaLintPanel issues={issues} />
            </PopoverContent>
          </Popover>
          <div
            className="flex shrink-0 rounded-md border p-0.5"
            role="group"
            aria-label={t('editorLayout.label')}
          >
            {(['design', 'output', 'split'] as const).map((mode) => (
              <Button
                key={mode}
                variant="ghost"
                size="sm"
                className={cn(
                  'h-7 rounded-sm px-3 text-xs',
                  view === mode && 'bg-primary/10 text-primary',
                )}
                aria-pressed={view === mode}
                onClick={() => selectView(mode)}
              >
                {t(`editorLayout.${mode}`)}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <div ref={panesRef} className="flex min-h-0 flex-1 flex-col">
        <div
          id={builderId}
          hidden={view === 'output'}
          className={cn(
            'min-h-0 overflow-auto px-4 py-3',
            view === 'design' ? 'flex-1' : 'shrink-0',
          )}
          style={view === 'split' ? { height: `${splitPercent}%` } : undefined}
          data-testid="design-panel"
        >
          <div
            className={isShareView ? 'pointer-events-none select-none opacity-80' : undefined}
            inert={isShareView}
          >
            <TableBuilderContainer key={documentId} {...tableBuilderProps} />
          </div>
        </div>
        {view === 'split' && (
          <div
            role="separator"
            tabIndex={0}
            aria-label={t('editorLayout.resize')}
            aria-orientation="horizontal"
            aria-controls={builderId}
            aria-valuemin={30}
            aria-valuemax={75}
            aria-valuenow={Math.round(splitPercent)}
            className="flex h-3 shrink-0 touch-none cursor-row-resize items-center justify-center border-y bg-muted/40 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
              const bounds = panesRef.current?.getBoundingClientRect();
              if (bounds?.height) resize(((event.clientY - bounds.top) / bounds.height) * 100);
            }}
            onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
            onKeyDown={(event) => {
              if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              resize(
                event.key === 'Home'
                  ? 30
                  : event.key === 'End'
                    ? 75
                    : splitPercent + (event.key === 'ArrowUp' ? -5 : 5),
              );
            }}
          >
            <span className="h-0.5 w-8 rounded-full bg-muted-foreground/40" />
          </div>
        )}
        <div
          hidden={view === 'design'}
          className="min-h-0 flex-1 overflow-auto"
          data-testid="generated-results"
        >
          <OutputContainer
            {...outputProps}
            onCollapse={() => selectView('design')}
            onMaximize={view === 'split' ? () => selectView('output') : undefined}
          />
        </div>
      </div>
    </section>
  );
}
