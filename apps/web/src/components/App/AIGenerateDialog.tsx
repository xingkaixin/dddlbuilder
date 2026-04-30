import { memo, useState, useCallback, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Sparkles, Check, RotateCcw, Send, ChevronDown, ChevronRight } from 'lucide-react';
import {
  useAIGenerateTable,
  type GeneratedTableSchema,
  type PartialTableSchema,
} from '@/hooks/useAIGenerateTable';
import type { FieldRow, IndexDefinition, DatabaseType } from '@ddlbuilder/shared-types';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { diffPersistedState, type FieldDiff } from '@ddlbuilder/ddl-core';
import type { FieldTemplate } from '@/hooks/useFieldTemplates';
import type { TableTemplate } from '@/hooks/useTableTemplates';
import { useTranslation } from 'react-i18next';
import { useAuthSession } from '@/auth/AuthSessionProvider';

const MAX_INPUT_LENGTH = 500;

function toPersistedState(schema: GeneratedTableSchema): PersistedState {
  return {
    schemaName: schema.schemaName ?? '',
    tableName: schema.tableName,
    tableComment: schema.tableComment,
    rows: schema.fields.map((field, index) => ({
      id: `ai-preview-${index}`,
      fieldName: field.fieldName,
      fieldType: field.fieldType,
      fieldComment: field.fieldComment,
      nullable: field.nullable,
      defaultKind: field.defaultKind,
      defaultValue: field.defaultValue ?? '',
      onUpdate: field.onUpdate ?? '无',
    })),
    indexes: schema.indexes ?? [],
    foreignKeys: [],
  } as PersistedState;
}

function getFieldChangeKey(diff: FieldDiff) {
  return `${diff.type}:${diff.fieldName}:${diff.oldFieldName ?? ''}:${diff.newFieldName ?? ''}`;
}

interface AIGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbType: DatabaseType;
  existingConfig?: {
    schemaName?: string;
    tableName?: string;
    rows?: FieldRow[];
    indexes?: IndexDefinition[];
  };
  templates?: Array<FieldTemplate | TableTemplate>;
  onApply: (schema: GeneratedTableSchema) => void;
}

export const AIGenerateDialog = memo<AIGenerateDialogProps>(
  ({ open, onOpenChange, dbType, existingConfig, templates, onApply }) => {
    const { t } = useTranslation();
    const authSession = useAuthSession();
    const [input, setInput] = useState('');
    const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set());
    const [showTemplateSelection, setShowTemplateSelection] = useState(false);
    const {
      isLoading,
      error,
      result,
      previousResult,
      partialResult,
      conversationHistory,
      generateTable,
      clearResult,
      clearConversation,
      cancelGeneration,
    } = useAIGenerateTable();

    const hasExistingConfig =
      existingConfig?.schemaName ||
      existingConfig?.tableName ||
      (existingConfig?.rows && existingConfig.rows.length > 0);

    const isStreaming = isLoading && !result;
    const displayResult: PartialTableSchema | GeneratedTableSchema | null =
      result || (isLoading ? partialResult : null);

    // Reset template selection when dialog opens
    useEffect(() => {
      if (open && templates && templates.length > 0) {
        // Select all templates by default
        setSelectedTemplateIds(new Set(templates.map((t) => t.id)));
      }
    }, [open, templates]);

    const handleGenerate = useCallback(() => {
      if (!input.trim()) return;
      const selectedTemplates = templates?.filter((t) => selectedTemplateIds.has(t.id)) || [];
      void generateTable(input, dbType, {
        templates: selectedTemplates.length > 0 ? selectedTemplates : undefined,
        existingConfig: hasExistingConfig ? existingConfig : undefined,
        continueConversation: conversationHistory.length > 0,
      });
      setInput('');
    }, [
      input,
      dbType,
      templates,
      selectedTemplateIds,
      existingConfig,
      hasExistingConfig,
      conversationHistory.length,
      generateTable,
    ]);

    const toggleTemplate = useCallback((id: string) => {
      setSelectedTemplateIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    }, []);

    const toggleAllTemplates = useCallback(() => {
      if (!templates) return;
      if (selectedTemplateIds.size === templates.length) {
        setSelectedTemplateIds(new Set());
      } else {
        setSelectedTemplateIds(new Set(templates.map((t) => t.id)));
      }
    }, [templates, selectedTemplateIds.size]);

    const handleApply = useCallback(() => {
      if (result) {
        onApply(result);
        onOpenChange(false);
        clearResult();
        clearConversation();
      }
    }, [result, onApply, onOpenChange, clearResult, clearConversation]);

    const handleReset = useCallback(() => {
      clearResult();
      clearConversation();
      setInput('');
    }, [clearResult, clearConversation]);

    const getTemplateFieldCount = useCallback((template: FieldTemplate | TableTemplate) => {
      if ('fields' in template) return template.fields.length;
      return template.blueprint.rows.length;
    }, []);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          handleGenerate();
        }
      },
      [handleGenerate],
    );

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setInput(value.slice(0, MAX_INPUT_LENGTH));
    }, []);

    const generatedFieldCount = displayResult?.fields?.length ?? 0;
    const fieldChanges = useMemo(() => {
      if (!previousResult || !result) {
        return [];
      }
      return diffPersistedState(toPersistedState(previousResult), toPersistedState(result)).fields;
    }, [previousResult, result]);

    const describeFieldChange = useCallback(
      (change: FieldDiff) => {
        if (change.type === 'add') {
          return t('aiGenerate.fieldChangeAdd', {
            field: change.newField?.name ?? change.fieldName,
            type: change.newField?.type ?? '',
          });
        }
        if (change.type === 'remove') {
          return t('aiGenerate.fieldChangeRemove', {
            field: change.oldField?.name ?? change.fieldName,
          });
        }
        if (change.type === 'rename') {
          return t('aiGenerate.fieldChangeRename', {
            oldField: change.oldFieldName,
            newField: change.newFieldName,
          });
        }
        return t('aiGenerate.fieldChangeModify', {
          field: change.fieldName,
          changes: (change.changes ?? [])
            .map((item) => t(`aiGenerate.fieldChangeType.${item}`))
            .join('、'),
        });
      },
      [t],
    );

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {t('aiGenerate.title')}
            </DialogTitle>
            <DialogDescription>{t('aiGenerate.description')}</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
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
            {/* Existing config hint */}
            {hasExistingConfig && !conversationHistory.length && (
              <div className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
                {t('aiGenerate.existingConfigHint')}
              </div>
            )}

            {/* Conversation history */}
            {conversationHistory.length > 0 && (
              <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t('aiGenerate.conversationHistory')}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-xs font-medium"
                    onClick={handleReset}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t('aiGenerate.restart')}
                  </Button>
                </div>
                {conversationHistory.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`text-sm ${
                      msg.role === 'user' ? 'text-foreground font-medium' : 'text-muted-foreground'
                    }`}
                  >
                    {msg.role === 'user'
                      ? `${t('aiGenerate.userPrefix')}${msg.content}`
                      : `${t('aiGenerate.assistantPrefix')}${t('aiGenerate.assistantGenerated')}`}
                  </div>
                ))}
              </div>
            )}

            {/* Generated result preview */}
            {displayResult && (
              <div className="border rounded-lg p-4 bg-card space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm">
                    {displayResult.tableName || t('aiGenerate.tableGenerating')}
                  </h4>
                  {displayResult.tableComment && (
                    <span className="text-xs text-muted-foreground">
                      {displayResult.tableComment}
                    </span>
                  )}
                </div>

                {/* Field changes preview */}
                {fieldChanges.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t('aiGenerate.fieldChanges')}
                    </span>
                    <div className="grid gap-1 text-xs">
                      {fieldChanges.map((change) => (
                        <div
                          key={getFieldChangeKey(change)}
                          className="rounded bg-primary/5 px-2 py-1 text-primary"
                        >
                          {describeFieldChange(change)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Fields preview */}
                {displayResult.fields && displayResult.fields.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t('aiGenerate.fields', {
                        count: displayResult.fields.length,
                      })}
                    </span>
                    <div className="grid gap-1 text-xs">
                      {displayResult.fields.map((field, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 px-2 py-1 rounded bg-muted/50"
                        >
                          {field.isPrimaryKey && (
                            <span className="text-[10px] font-bold text-primary">PK</span>
                          )}
                          <span className="font-mono font-medium">{field.fieldName}</span>
                          <span className="text-muted-foreground">{field.fieldType}</span>
                          {field.fieldComment && (
                            <span className="text-muted-foreground/70 truncate max-w-[150px]">
                              {/* 字段注释 */}
                              {field.fieldComment}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Indexes preview */}
                {displayResult.indexes && displayResult.indexes.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t('aiGenerate.indexes', {
                        count: displayResult.indexes.length,
                      })}
                    </span>
                    <div className="grid gap-1 text-xs">
                      {displayResult.indexes.map((idx, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 px-2 py-1 rounded bg-muted/50"
                        >
                          {idx.unique && (
                            <span className="text-[10px] font-bold text-amber-600">UQ</span>
                          )}
                          <span className="font-mono">{idx.name}</span>
                          <span className="text-muted-foreground">
                            ({idx.fields?.map((f) => f.name).join(', ')})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {displayResult.designDecisions && displayResult.designDecisions.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t('aiGenerate.designDecisions')}
                    </span>
                    <div className="grid gap-1.5 text-xs">
                      {displayResult.designDecisions.map((decision, i) => (
                        <div key={i} className="rounded bg-muted/50 px-2 py-1.5">
                          <div className="font-medium text-foreground">{decision.title}</div>
                          <div className="mt-0.5 text-muted-foreground">{decision.rationale}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {isLoading && (
                  <output
                    aria-live="polite"
                    aria-busy="true"
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                  >
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    {isStreaming
                      ? t('aiGenerate.generatingFields', {
                          count: generatedFieldCount,
                        })
                      : t('aiGenerate.generating')}
                  </output>
                )}
              </div>
            )}

            {isLoading && !displayResult && (
              <output
                aria-live="polite"
                aria-busy="true"
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                {t('aiGenerate.generating')}
              </output>
            )}

            {/* Error display */}
            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-md px-3 py-2"
              >
                {error}
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="space-y-3 pt-4 border-t">
            <Textarea
              placeholder={
                conversationHistory.length > 0
                  ? t('aiGenerate.inputContinuePlaceholder')
                  : t('aiGenerate.inputPlaceholder')
              }
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              rows={3}
              className="resize-none"
              disabled={isLoading}
              maxLength={MAX_INPUT_LENGTH}
              aria-describedby="ai-generate-input-hint ai-generate-input-counter"
            />
            <span id="ai-generate-input-hint" className="sr-only">
              {t('aiGenerate.inputHint')}
            </span>

            <div className="flex items-center justify-between">
              {/* Template selection */}
              {templates && templates.length > 0 ? (
                <div className="flex-1 mr-4">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowTemplateSelection(!showTemplateSelection)}
                  >
                    {showTemplateSelection ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    {t('aiGenerate.templateSelected', {
                      selected: selectedTemplateIds.size,
                      total: templates.length,
                    })}
                  </button>
                  {showTemplateSelection && (
                    <div className="mt-2 space-y-1.5 pl-5">
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={toggleAllTemplates}
                      >
                        {selectedTemplateIds.size === templates.length
                          ? t('aiGenerate.unselectAll')
                          : t('aiGenerate.selectAll')}
                      </button>
                      {templates.map((template) => (
                        <div
                          key={template.id}
                          className="flex items-center gap-2 text-xs cursor-pointer"
                          onClick={() => toggleTemplate(template.id)}
                        >
                          <Checkbox
                            id={`template-${template.id}`}
                            checked={selectedTemplateIds.has(template.id)}
                            onClick={(e) => e.stopPropagation()}
                            onCheckedChange={() => toggleTemplate(template.id)}
                          />
                          <span className="font-medium">{template.name}</span>
                          {template.description && (
                            <span className="text-muted-foreground truncate max-w-[150px]">
                              - {template.description}
                            </span>
                          )}
                          <span className="text-muted-foreground/60">
                            {t('aiGenerate.templateFields', {
                              count: getTemplateFieldCount(template),
                            })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {t('aiGenerate.templateHint')}
                </span>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2">
                <span
                  id="ai-generate-input-counter"
                  className="text-xs text-muted-foreground"
                  aria-live="polite"
                >
                  {input.length}/{MAX_INPUT_LENGTH}
                </span>
                {isLoading ? (
                  <Button
                    variant="outline"
                    onClick={cancelGeneration}
                    size="sm"
                    className="h-7 px-2 text-xs font-medium"
                  >
                    {t('aiGenerate.cancel')}
                  </Button>
                ) : result ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={handleReset}
                      size="sm"
                      className="h-7 px-2 text-xs font-medium"
                    >
                      {t('aiGenerate.restart')}
                    </Button>
                    {input.trim() && (
                      <Button
                        onClick={handleGenerate}
                        className="h-7 gap-1.5 px-2 text-xs font-medium"
                        size="sm"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {t('aiGenerate.continueGenerate')}
                      </Button>
                    )}
                    <Button
                      onClick={handleApply}
                      className="h-7 gap-1.5 px-2 text-xs font-medium"
                      size="sm"
                    >
                      <Check className="h-3.5 w-3.5" />
                      {t('aiGenerate.apply')}
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={handleGenerate}
                    disabled={!input.trim() || isLoading}
                    className="h-7 gap-1.5 px-2 text-xs font-medium"
                    size="sm"
                  >
                    {isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    {t('aiGenerate.generate')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  },
);

AIGenerateDialog.displayName = 'AIGenerateDialog';
