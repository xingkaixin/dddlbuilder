import { memo, useState, useCallback, useEffect } from 'react';
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
import {
  Loader2,
  Sparkles,
  Check,
  RotateCcw,
  Send,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  useAIGenerateTable,
  type GeneratedTableSchema,
  type PartialTableSchema,
} from '@/hooks/useAIGenerateTable';
import type { FieldRow, IndexDefinition, DatabaseType } from '@/types';
import type { FieldTemplate } from '@/hooks/useFieldTemplates';

interface AIGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbType: DatabaseType;
  existingConfig?: {
    tableName?: string;
    rows?: FieldRow[];
    indexes?: IndexDefinition[];
  };
  templates?: FieldTemplate[];
  onApply: (schema: GeneratedTableSchema) => void;
}

export const AIGenerateDialog = memo<AIGenerateDialogProps>(
  ({ open, onOpenChange, dbType, existingConfig, templates, onApply }) => {
    const [input, setInput] = useState('');
    const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(
      new Set(),
    );
    const [showTemplateSelection, setShowTemplateSelection] = useState(false);
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

    const hasExistingConfig =
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

    const selectedTemplates =
      templates?.filter((t) => selectedTemplateIds.has(t.id)) || [];

    const handleGenerate = useCallback(() => {
      if (!input.trim()) return;
      generateTable(input, dbType, {
        templates: selectedTemplates.length > 0 ? selectedTemplates : undefined,
        existingConfig: hasExistingConfig ? existingConfig : undefined,
        continueConversation: conversationHistory.length > 0,
      });
      setInput('');
    }, [
      input,
      dbType,
      selectedTemplates,
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

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          handleGenerate();
        }
      },
      [handleGenerate],
    );

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI 智能建表
            </DialogTitle>
            <DialogDescription>
              用自然语言描述你需要的表结构，AI 会自动生成字段和索引配置
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Existing config hint */}
            {hasExistingConfig && !conversationHistory.length && (
              <div className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
                检测到当前已有表配置，AI 会参考现有结构进行生成或调整
              </div>
            )}

            {/* Conversation history */}
            {conversationHistory.length > 0 && (
              <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    对话历史
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={handleReset}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    重新开始
                  </Button>
                </div>
                {conversationHistory.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`text-sm ${
                      msg.role === 'user'
                        ? 'text-foreground font-medium'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {msg.role === 'user' ? '你: ' : 'AI: '}
                    {msg.role === 'user' ? msg.content : '已生成表结构'}
                  </div>
                ))}
              </div>
            )}

            {/* Generated result preview */}
            {displayResult && (
              <div className="border rounded-lg p-4 bg-card space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm">
                    {displayResult.tableName || '生成中...'}
                  </h4>
                  {displayResult.tableComment && (
                    <span className="text-xs text-muted-foreground">
                      {displayResult.tableComment}
                    </span>
                  )}
                </div>

                {/* Fields preview */}
                {displayResult.fields && displayResult.fields.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      字段 ({displayResult.fields.length})
                    </span>
                    <div className="grid gap-1 text-xs">
                      {displayResult.fields.map((field, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 px-2 py-1 rounded bg-muted/50"
                        >
                          {field.isPrimaryKey && (
                            <span className="text-[10px] font-bold text-primary">
                              PK
                            </span>
                          )}
                          <span className="font-mono font-medium">
                            {field.fieldName}
                          </span>
                          <span className="text-muted-foreground">
                            {field.fieldType}
                          </span>
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
                      索引 ({displayResult.indexes.length})
                    </span>
                    <div className="grid gap-1 text-xs">
                      {displayResult.indexes.map((idx, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 px-2 py-1 rounded bg-muted/50"
                        >
                          {idx.unique && (
                            <span className="text-[10px] font-bold text-amber-600">
                              UQ
                            </span>
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

                {isLoading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {isStreaming ? '正在生成字段...' : '生成中...'}
                  </div>
                )}
              </div>
            )}

            {/* Error display */}
            {error && (
              <div className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                {error}
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="space-y-3 pt-4 border-t">
            <Textarea
              placeholder={
                conversationHistory.length > 0
                  ? '继续描述你的需求，例如：添加一个状态字段...'
                  : '描述你需要的表结构，例如：创建一个订单表，包含订单号、用户ID、商品列表、金额、状态...'
              }
              value={input}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setInput(e.target.value)
              }
              onKeyDown={handleKeyDown}
              rows={3}
              className="resize-none"
              disabled={isLoading}
            />

            <div className="flex items-center justify-between">
              {/* Template selection */}
              {templates && templates.length > 0 ? (
                <div className="flex-1 mr-4">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() =>
                      setShowTemplateSelection(!showTemplateSelection)
                    }
                  >
                    {showTemplateSelection ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    已选择 {selectedTemplateIds.size}/{templates.length} 个模板
                  </button>
                  {showTemplateSelection && (
                    <div className="mt-2 space-y-1.5 pl-5">
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={toggleAllTemplates}
                      >
                        {selectedTemplateIds.size === templates.length
                          ? '取消全选'
                          : '全选'}
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
                            ({template.fields?.length || 0} 字段)
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">
                  提示：创建字段模板可让 AI 优先使用
                </span>
              )}

              <div className="flex gap-2">
                {isLoading ? (
                  <Button variant="outline" onClick={cancelGeneration}>
                    取消
                  </Button>
                ) : result ? (
                  <>
                    <Button variant="outline" onClick={handleReset}>
                      重新生成
                    </Button>
                    <Button onClick={handleApply} className="gap-1">
                      <Check className="h-4 w-4" />
                      应用到表配置
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={handleGenerate}
                    disabled={!input.trim() || isLoading}
                    className="gap-1"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    生成
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
