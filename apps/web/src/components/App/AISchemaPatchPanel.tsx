import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, Check, Loader2, RotateCcw, Send, X } from 'lucide-react';
import type { DatabaseType, PersistedState } from '@ddlbuilder/shared-types';
import type { FieldTemplate } from '@/hooks/useFieldTemplates';
import type { TableTemplate } from '@/hooks/useTableTemplates';
import { useAIGenerateTable } from '@/hooks/useAIGenerateTable';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  buildAISchemaChanges,
  buildCandidateStateFromAISchema,
  type AISchemaChange,
  type AISchemaChangeStatus,
} from '@/utils/aiSchemaChanges';
import { useAuthSession } from '@/auth/AuthSessionProvider';

const MAX_INPUT_LENGTH = 500;

interface AISchemaPatchPanelProps {
  dbType: DatabaseType;
  currentState: PersistedState;
  templates?: Array<FieldTemplate | TableTemplate>;
  onApplyChange: (change: AISchemaChange, candidateState: PersistedState) => void;
  onFocusChange?: (change: AISchemaChange) => void;
}

function describeIndex(index?: AISchemaChange & { kind: 'index' }) {
  const next = index?.newIndex || index?.oldIndex;
  if (!next) return '';
  const fields = next.fields.map((field) => field.name).join(', ');
  const type = next.isPrimary ? 'PK' : next.unique ? 'UQ' : 'IDX';
  return `${type} · ${fields}`;
}

export function AISchemaPatchPanel({
  dbType,
  currentState,
  templates,
  onApplyChange,
  onFocusChange,
}: AISchemaPatchPanelProps) {
  const { t } = useTranslation();
  const authSession = useAuthSession();
  const [input, setInput] = useState('');
  const [statuses, setStatuses] = useState<Record<string, AISchemaChangeStatus>>({});
  const {
    isLoading,
    error,
    result,
    partialResult,
    conversationHistory,
    generateTable,
    clearResult,
    clearConversation,
    cancelGeneration,
  } = useAIGenerateTable();

  const candidateState = useMemo(() => {
    if (!result) return null;
    return buildCandidateStateFromAISchema(currentState, result);
  }, [currentState, result]);

  const changes = useMemo(() => {
    if (!candidateState) return [];
    return buildAISchemaChanges(currentState, candidateState).map((change) => ({
      ...change,
      status: statuses[change.id] || 'pending',
    }));
  }, [candidateState, currentState, statuses]);

  useEffect(() => {
    setStatuses({});
  }, [result]);

  const pendingChanges = changes.filter((change) => change.status === 'pending');
  const displayFieldCount = result?.fields.length ?? partialResult?.fields?.length ?? 0;

  const handleGenerate = useCallback(() => {
    const description = input.trim();
    if (!description) return;
    void generateTable(description, dbType, {
      existingConfig: {
        schemaName: currentState.schemaName,
        tableName: currentState.tableName,
        tableComment: currentState.tableComment,
        rows: currentState.rows,
        indexes: currentState.indexes,
      },
      templates,
      mode: 'patch',
      continueConversation: conversationHistory.length > 0,
    });
    setInput('');
  }, [conversationHistory.length, currentState, dbType, generateTable, input, templates]);

  const handleReset = useCallback(() => {
    clearResult();
    clearConversation();
    setStatuses({});
    setInput('');
  }, [clearConversation, clearResult]);

  const setChangeStatus = useCallback((id: string, status: AISchemaChangeStatus) => {
    setStatuses((prev) => ({ ...prev, [id]: status }));
  }, []);

  const handleAccept = useCallback(
    (change: AISchemaChange) => {
      if (!candidateState) return;
      onApplyChange(change, candidateState);
      setChangeStatus(change.id, 'accepted');
    },
    [candidateState, onApplyChange, setChangeStatus],
  );

  const handleAcceptAll = useCallback(() => {
    if (!candidateState) return;
    for (const change of pendingChanges) {
      onApplyChange(change, candidateState);
    }
    setStatuses((prev) => {
      const next = { ...prev };
      for (const change of pendingChanges) {
        next[change.id] = 'accepted';
      }
      return next;
    });
  }, [candidateState, onApplyChange, pendingChanges]);

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value.slice(0, MAX_INPUT_LENGTH));
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        handleGenerate();
      }
    },
    [handleGenerate],
  );

  const renderChangeBody = (change: AISchemaChange) => {
    if (change.kind === 'table') {
      return (
        <div className="grid gap-1 text-xs">
          <div className="text-muted-foreground">{change.oldValue || t('aiPatch.emptyValue')}</div>
          <div className="font-medium text-foreground">
            {change.newValue || t('aiPatch.emptyValue')}
          </div>
        </div>
      );
    }

    if (change.kind === 'field') {
      const row = change.newRow || change.oldRow;
      return (
        <div className="grid gap-1 text-xs">
          <div className="font-mono font-medium">{row?.fieldName || change.fieldName}</div>
          {row?.fieldType && <div className="text-muted-foreground">{row.fieldType}</div>}
          {row?.fieldComment && <div className="text-muted-foreground">{row.fieldComment}</div>}
          {change.changes?.length ? (
            <div className="text-primary">
              {change.changes.map((item) => t(`aiPatch.fieldChangeType.${item}`)).join('、')}
            </div>
          ) : null}
        </div>
      );
    }

    return <div className="text-xs text-muted-foreground">{describeIndex(change)}</div>;
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

  return (
    <div className="flex min-h-[520px] flex-col">
      <div className="border-b border-primary/10 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <div>
            <h2 className="text-base font-semibold">{t('aiPatch.title')}</h2>
            <p className="text-xs text-muted-foreground">{t('aiPatch.description')}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-auto px-4 py-3.5">
        {authSession.status !== 'signed_in' ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {t('services.authRequired')}
          </div>
        ) : null}
        {authSession.status === 'signed_in' &&
        authSession.creditsStatus === 'ready' &&
        (authSession.creditBalance ?? 0) <= 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {t('services.creditExhausted')}
          </div>
        ) : null}

        {isLoading && (
          <output
            aria-live="polite"
            aria-busy="true"
            className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t('aiPatch.generating', { count: displayFieldCount })}
          </output>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        {result && changes.length === 0 && (
          <div className="rounded-md border bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
            {t('aiPatch.noChanges')}
          </div>
        )}

        {changes.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-muted-foreground">
                {t('aiPatch.changeCount', { count: pendingChanges.length })}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={handleAcceptAll}
                disabled={pendingChanges.length === 0}
              >
                <Check className="h-3.5 w-3.5" />
                {t('aiPatch.acceptAll')}
              </Button>
            </div>

            {changes.map((change) => (
              <div
                key={change.id}
                className={cn(
                  'rounded-md border bg-background px-3 py-2.5 transition-colors',
                  change.status === 'accepted' && 'border-emerald-300 bg-emerald-50/60',
                  change.status === 'rejected' && 'border-muted bg-muted/40 opacity-70',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    className="min-w-0 text-left text-sm font-medium hover:text-primary"
                    onClick={() => onFocusChange?.(change)}
                  >
                    {renderChangeTitle(change)}
                  </button>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {t(`aiPatch.status.${change.status}`)}
                  </span>
                </div>
                <div className="mt-2">{renderChangeBody(change)}</div>
                {change.status === 'pending' && (
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
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => handleAccept(change)}
                    >
                      <Check className="h-3.5 w-3.5" />
                      {t('aiPatch.accept')}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3 border-t px-4 py-3.5">
        <Textarea
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={t('aiPatch.inputPlaceholder')}
          disabled={isLoading}
          maxLength={MAX_INPUT_LENGTH}
          rows={3}
          className="resize-none"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {input.length}/{MAX_INPUT_LENGTH}
          </span>
          <div className="flex items-center gap-2">
            {result && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={handleReset}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t('aiPatch.reset')}
              </Button>
            )}
            {isLoading ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={cancelGeneration}
              >
                {t('aiPatch.cancel')}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={handleGenerate}
                disabled={!input.trim()}
              >
                <Send className="h-3.5 w-3.5" />
                {result ? t('aiPatch.sendNext') : t('aiPatch.send')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
