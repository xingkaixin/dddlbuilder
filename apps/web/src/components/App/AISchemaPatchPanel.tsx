import {
  Bot,
  Check,
  Database,
  FileText,
  KeyRound,
  Loader2,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Table2,
  X,
} from '@/components/icons';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { AISchemaChange } from '@/utils/aiSchemaChanges';
import { useAuthSession } from '@/auth/AuthSessionProvider';

import {
  MAX_PATCH_INPUT_LENGTH as MAX_INPUT_LENGTH,
  type useAISchemaPatchSession,
} from './hooks/useAISchemaPatchSession';

interface AISchemaPatchPanelProps {
  session: ReturnType<typeof useAISchemaPatchSession>;
  currentState: PersistedState;
  onReset: () => void;
  onFocusChange?: (change: AISchemaChange) => void;
}

function describeIndex(index?: AISchemaChange & { kind: 'index' }) {
  const next = index?.newIndex || index?.oldIndex;
  if (!next) return '';
  const fields = next.fields.map((field) => field.name).join(', ');
  const type = next.isPrimary ? 'PK' : next.unique ? 'UQ' : 'IDX';
  return `${type} · ${fields}`;
}

function countConfiguredPartitions(currentState: PersistedState) {
  const mysqlPartitions = currentState.mysqlPartitionConfig?.enabled ? 1 : 0;
  const hivePartitions = currentState.tableMiscConfig?.partitions?.enabled
    ? currentState.tableMiscConfig.partitions.columns.length
    : 0;
  return mysqlPartitions + hivePartitions;
}

export function AISchemaPatchPanel({
  currentState,
  session,
  onReset,
  onFocusChange,
}: AISchemaPatchPanelProps) {
  const { t } = useTranslation();
  const authSession = useAuthSession();
  const {
    input,
    isLoading,
    error,
    result,
    partialResult,
    changes,
    pendingChanges,
    acceptedChanges,
    appliedChanges,
    selectableChanges,
    handleGenerate,
    handleInputChange,
    handleKeyDown,
    handleAccept,
    handleApplyAccepted,
    handleSelectAll,
    handleUnselectAll,
    setChangeStatus,
    cancelGeneration,
  } = session;
  const dbType = currentState.dbType;
  const displayFieldCount = result?.fields.length ?? partialResult?.fields?.length ?? 0;
  const configuredRows = currentState.rows.filter((row) => row.fieldName.trim());
  const contextItems = [
    {
      icon: Database,
      label: t('aiPatch.context.database'),
      value: dbType.toUpperCase(),
    },
    {
      icon: Table2,
      label: t('aiPatch.context.table'),
      value: currentState.tableName || t('aiPatch.emptyValue'),
    },
    {
      icon: FileText,
      label: t('aiPatch.context.fields'),
      value: String(configuredRows.length),
    },
    {
      icon: KeyRound,
      label: t('aiPatch.context.indexes'),
      value: String(currentState.indexes.length),
    },
    {
      icon: ShieldCheck,
      label: t('aiPatch.context.moreConfig'),
      value: t('aiPatch.context.moreConfigValue', {
        foreignKeys: currentState.foreignKeys?.length ?? 0,
        authObjects: currentState.authObjects.length,
        partitions: countConfiguredPartitions(currentState),
      }),
    },
  ];
  const designDecisions = result?.designDecisions?.filter(
    (item) => item.title.trim() || item.rationale.trim(),
  );

  const renderChangeBody = (change: AISchemaChange) => {
    if (change.kind === 'table') {
      return (
        <div className="grid gap-1.5 text-xs">
          <div className="rounded bg-muted/40 px-2 py-1 text-muted-foreground">
            {t('aiPatch.oldValue')}: {change.oldValue || t('aiPatch.emptyValue')}
          </div>
          <div className="rounded bg-primary/5 px-2 py-1 font-medium text-foreground">
            {t('aiPatch.newValue')}: {change.newValue || t('aiPatch.emptyValue')}
          </div>
        </div>
      );
    }

    if (change.kind === 'field') {
      const row = change.newRow || change.oldRow;
      return (
        <div className="grid gap-1 text-xs">
          <div className="font-mono font-medium">{row?.fieldName || change.fieldName}</div>
          {row?.fieldType && (
            <div className="rounded bg-muted/40 px-2 py-1 font-mono text-muted-foreground">
              {row.fieldType}
            </div>
          )}
          {row?.fieldComment && <div className="text-muted-foreground">{row.fieldComment}</div>}
          {change.changes?.length ? (
            <div className="text-primary">
              {change.changes.map((item) => t(`aiPatch.fieldChangeType.${item}`)).join('、')}
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <div className="rounded bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
        {describeIndex(change)}
      </div>
    );
  };

  const renderChangeTitle = (change: AISchemaChange) => {
    if (change.kind === 'table') {
      return t(`aiPatch.change.table.${change.type}`);
    }
    if (change.kind === 'field') {
      return t(`aiPatch.change.field.${change.type}`, {
        field: change.newFieldName || change.newField?.name || change.fieldName,
        oldField: change.oldFieldName || change.oldField?.name || change.fieldName,
      });
    }
    return t(`aiPatch.change.index.${change.type}`, {
      index: change.indexName,
    });
  };

  const renderChangeCard = (change: AISchemaChange) => (
    <div
      key={change.id}
      className={cn(
        'rounded-md border bg-background px-3 py-3 transition-colors',
        change.status === 'pending' && 'border-primary/30 bg-primary/[0.03]',
        change.status === 'accepted' && 'border-emerald-300 bg-emerald-50/60',
        change.status === 'applied' && 'border-emerald-300 bg-emerald-50/60 opacity-70',
        change.status === 'rejected' && 'border-muted bg-muted/40 opacity-70',
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          className={cn(
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border',
            change.status === 'pending' && 'border-muted-foreground/40 bg-background',
            change.status === 'accepted' && 'border-emerald-500 bg-emerald-500 text-white',
            change.status === 'applied' && 'border-emerald-500 bg-emerald-500 text-white',
            change.status === 'rejected' &&
              'border-muted-foreground/40 bg-muted text-muted-foreground',
          )}
          onClick={() => {
            if (change.status !== 'applied') {
              setChangeStatus(change.id, change.status === 'accepted' ? 'pending' : 'accepted');
            }
          }}
          disabled={change.status === 'applied'}
          aria-label={t('aiPatch.toggleChange')}
        >
          {(change.status === 'accepted' || change.status === 'applied') && (
            <Check className="h-3.5 w-3.5" />
          )}
          {change.status === 'rejected' && <X className="h-3.5 w-3.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              className="min-w-0 text-left text-sm font-medium leading-5 hover:text-primary"
              onClick={() => onFocusChange?.(change)}
            >
              {renderChangeTitle(change)}
            </button>
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {t(`aiPatch.status.${change.status}`)}
            </span>
          </div>
          <div className="mt-2">{renderChangeBody(change)}</div>
          {change.status === 'applied' ? null : change.status !== 'accepted' ? (
            <div className="mt-2 flex justify-end gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => setChangeStatus(change.id, 'rejected')}
              >
                <X className="h-3.5 w-3.5" />
                {t('aiPatch.reject')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => handleAccept(change)}
              >
                <Check className="h-3.5 w-3.5" />
                {t('aiPatch.accept')}
              </Button>
            </div>
          ) : (
            <div className="mt-2 flex justify-end gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => setChangeStatus(change.id, 'rejected')}
              >
                <X className="h-3.5 w-3.5" />
                {t('aiPatch.reject')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-[680px] flex-col">
      <div className="border-b border-primary/10 px-6 py-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold leading-tight">{t('aiPatch.title')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('aiPatch.description')}</p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
        {authSession.status !== 'signed_in' ? (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {t('services.authRequired')}
          </div>
        ) : null}
        {authSession.status === 'signed_in' &&
        authSession.creditsStatus === 'ready' &&
        (authSession.creditBalance ?? 0) <= 0 ? (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {t('services.creditExhausted')}
          </div>
        ) : null}

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="rounded-md border border-primary/15 bg-primary/5 p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
                <Sparkles className="h-4 w-4" />
                {t('aiPatch.contextTitle')}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                {contextItems.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-start gap-2 rounded-md border border-primary/10 bg-background px-3 py-2.5"
                  >
                    <item.icon className="mt-0.5 h-4 w-4 text-primary" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-muted-foreground">{item.label}</div>
                      <div className="truncate text-sm font-medium">{item.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border bg-background p-3">
              <label htmlFor="ai-patch-input" className="text-sm font-semibold">
                {t('aiPatch.intentTitle')}
              </label>
              <Textarea
                id="ai-patch-input"
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={t('aiPatch.inputPlaceholder')}
                disabled={isLoading}
                maxLength={MAX_INPUT_LENGTH}
                rows={6}
                className="mt-2 resize-none"
              />
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{t('aiPatch.inputHint')}</span>
                <span>
                  {input.length}/{MAX_INPUT_LENGTH}
                </span>
              </div>
              {isLoading && (
                <output
                  aria-live="polite"
                  aria-busy="true"
                  className="mt-3 flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t('aiPatch.generating', { count: displayFieldCount })}
                </output>
              )}
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            <div className="rounded-md border bg-background p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">{t('aiPatch.directionTitle')}</div>
                {changes.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {t('aiPatch.changeCount', { count: pendingChanges.length })}
                  </div>
                )}
              </div>

              {designDecisions?.length ? (
                <div className="space-y-2">
                  {designDecisions.map((item, index) => (
                    <div
                      key={`${item.title}-${index}`}
                      className="rounded-md bg-primary/5 px-3 py-2"
                    >
                      {item.title && (
                        <div className="text-sm font-medium text-primary">{item.title}</div>
                      )}
                      {item.rationale && (
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">
                          {item.rationale}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : result ? (
                <div className="rounded-md bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
                  {t('aiPatch.noDirection')}
                </div>
              ) : (
                <div className="rounded-md bg-muted/20 px-3 py-8 text-center text-sm text-muted-foreground">
                  {t('aiPatch.emptyResult')}
                </div>
              )}
            </div>

            <div className="rounded-md border bg-background">
              <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                <div className="text-sm font-semibold">{t('aiPatch.changeDetailTitle')}</div>
                {changes.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={handleUnselectAll}
                      disabled={changes.length === 0}
                    >
                      {t('aiPatch.unselectAll')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={handleSelectAll}
                      disabled={selectableChanges.length === acceptedChanges.length}
                    >
                      {t('aiPatch.selectAll')}
                    </Button>
                  </div>
                )}
              </div>

              <div className="max-h-[390px] space-y-2 overflow-auto p-3">
                {changes.length > 0 ? (
                  changes.map(renderChangeCard)
                ) : result ? (
                  <div className="rounded-md bg-muted/20 px-3 py-8 text-center text-sm text-muted-foreground">
                    {t('aiPatch.noChanges')}
                  </div>
                ) : (
                  <div className="rounded-md bg-muted/20 px-3 py-8 text-center text-sm text-muted-foreground">
                    {t('aiPatch.emptyChanges')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t bg-background px-6 py-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {t('aiPatch.applyHint', {
              pending: pendingChanges.length,
              accepted: acceptedChanges.length,
              applied: appliedChanges.length,
            })}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 px-3 text-sm"
              onClick={onReset}
              disabled={isLoading}
            >
              <RotateCcw className="h-4 w-4" />
              {t('aiPatch.reset')}
            </Button>
            {isLoading ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 px-3 text-sm"
                onClick={cancelGeneration}
              >
                {t('aiPatch.cancel')}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant={result ? 'outline' : 'default'}
                  size="sm"
                  className="h-9 gap-1.5 px-3 text-sm"
                  onClick={handleGenerate}
                  disabled={!input.trim()}
                >
                  <Send className="h-4 w-4" />
                  {result ? t('aiPatch.sendNext') : t('aiPatch.send')}
                </Button>
                {result && (
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 gap-1.5 px-3 text-sm"
                    onClick={handleApplyAccepted}
                    disabled={acceptedChanges.length === 0}
                  >
                    <Check className="h-4 w-4" />
                    {t('aiPatch.applySelected', { count: acceptedChanges.length })}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
