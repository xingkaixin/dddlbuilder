import { memo, useMemo, useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronUp, ChevronDown, X, Key, Lock, Hash, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { buildNormalizedFields, useAppStore, useFieldStore, useIndexStore } from '@/stores';
import { useTranslation } from 'react-i18next';

interface IndexPanelProps {
  // Animation props
  animatingIndexIds?: Set<string>;
  removingIndexIds?: Set<string>;
}

export const IndexPanel = memo<IndexPanelProps>(({ animatingIndexIds, removingIndexIds }) => {
  const { t } = useTranslation();
  const rows = useFieldStore((state) => state.rows);
  const tableName = useAppStore((state) => state.tableName);
  const dbType = useAppStore((state) => state.dbType);
  const indexInput = useIndexStore((state) => state.indexInput);
  const currentIndexFields = useIndexStore((state) => state.currentIndexFields);
  const indexes = useIndexStore((state) => state.indexes);
  const showFieldSuggestions = useIndexStore((state) => state.showFieldSuggestions);
  const selectedSuggestionIndex = useIndexStore((state) => state.selectedSuggestionIndex);
  const onIndexInputChange = useIndexStore((state) => state.setIndexInput);
  const onSetShowFieldSuggestions = useIndexStore((state) => state.setShowFieldSuggestions);
  const onSetSelectedSuggestionIndex = useIndexStore((state) => state.setSelectedSuggestionIndex);
  const onAddFieldToIndex = useIndexStore((state) => state.addFieldToIndex);
  const onSetCurrentIndexFields = useIndexStore((state) => state.setCurrentIndexFields);
  const onRemoveFieldFromIndex = useIndexStore((state) => state.removeFieldFromIndex);
  const onToggleFieldDirection = useIndexStore((state) => state.toggleFieldDirection);
  const onAddIndex = useIndexStore((state) => state.addIndex);
  const onRemoveIndex = useIndexStore((state) => state.removeIndex);
  const onUpdateIndexName = useIndexStore((state) => state.updateIndexName);

  const availableFields = useMemo(
    () =>
      buildNormalizedFields(rows)
        .map((field) => field.name)
        .filter((name) => name.length > 0),
    [rows],
  );

  const fieldSuggestions = useMemo(() => {
    if (!indexInput.trim()) return [];
    const input = indexInput.toLowerCase().trim();
    return availableFields.filter(
      (field) =>
        field.toLowerCase().includes(input) &&
        !currentIndexFields.some((item) => item.name === field),
    );
  }, [indexInput, availableFields, currentIndexFields]);

  const [editingIndexId, setEditingIndexId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [pendingIndexType, setPendingIndexType] = useState<'normal' | 'unique' | 'primary' | null>(
    null,
  );
  const editInputRef = useRef<HTMLInputElement>(null);
  const suggestionsListId = 'index-field-suggestions-listbox';
  const hasSuggestions = showFieldSuggestions && fieldSuggestions.length > 0;
  const activeSuggestionId =
    hasSuggestions && selectedSuggestionIndex >= 0
      ? `index-field-suggestion-${selectedSuggestionIndex}`
      : undefined;

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingIndexId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingIndexId]);

  const handleStartEdit = (index: (typeof indexes)[number]) => {
    setEditingIndexId(index.id);
    setEditingName(index.name);
  };

  const handleConfirmEdit = () => {
    if (editingIndexId && editingName.trim()) {
      onUpdateIndexName(editingIndexId, editingName, dbType);
    }
    setEditingIndexId(null);
    setEditingName('');
  };

  const handleCancelEdit = () => {
    setEditingIndexId(null);
    setEditingName('');
  };

  const handleStartCreate = (type: 'normal' | 'unique' | 'primary') => {
    setPendingIndexType(type);
    onIndexInputChange('');
    onSetCurrentIndexFields([]);
  };

  const handleSavePendingIndex = () => {
    if (!pendingIndexType || currentIndexFields.length === 0) return;
    onAddIndex(pendingIndexType !== 'normal', pendingIndexType === 'primary', tableName, dbType);
    setPendingIndexType(null);
  };

  const handleCancelPendingIndex = () => {
    setPendingIndexType(null);
    onIndexInputChange('');
    onSetCurrentIndexFields([]);
  };

  return (
    <div className="relative group rounded-lg border bg-card/95 backdrop-blur-sm shadow-lg shadow-primary/5 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5">
      {/* Decorative gradient overlay */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent rounded-lg" />

      {/* Top gradient bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/30 to-transparent rounded-t-lg" />

      <div className="relative p-4">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={pendingIndexType === 'normal' ? 'default' : 'outline'}
              className="h-8 gap-1.5 px-3 text-xs font-medium"
              onClick={() => handleStartCreate('normal')}
            >
              <Hash className="h-3.5 w-3.5" />
              {t('indexPanel.addIndex')}
            </Button>
            <Button
              size="sm"
              variant={pendingIndexType === 'unique' ? 'default' : 'outline'}
              className="h-8 gap-1.5 px-3 text-xs font-medium"
              onClick={() => handleStartCreate('unique')}
            >
              <Lock className="h-3.5 w-3.5" />
              {t('indexPanel.addUnique')}
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex"
                  tabIndex={indexes.some((index) => index.isPrimary) ? 0 : -1}
                >
                  <Button
                    size="sm"
                    variant={pendingIndexType === 'primary' ? 'default' : 'outline'}
                    className="h-8 gap-1.5 px-3 text-xs font-medium"
                    onClick={() => handleStartCreate('primary')}
                    disabled={indexes.some((index) => index.isPrimary)}
                  >
                    <Key className="h-3.5 w-3.5" />
                    {t('indexPanel.addPrimary')}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {indexes.some((index) => index.isPrimary)
                    ? t('indexPanel.primaryExists')
                    : t('indexPanel.addPrimaryTip')}
                </p>
              </TooltipContent>
            </Tooltip>
          </div>

          {pendingIndexType ? (
            <div className="rounded-lg border bg-background p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{t('indexPanel.createTitle')}</div>
                  <div className="text-xs text-muted-foreground">
                    {t('indexPanel.createDescription')}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-3 text-xs"
                    onClick={handleCancelPendingIndex}
                  >
                    {t('indexPanel.cancel')}
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 px-3 text-xs"
                    onClick={handleSavePendingIndex}
                    disabled={currentIndexFields.length === 0}
                  >
                    {t('indexPanel.saveIndex')}
                  </Button>
                </div>
              </div>

              <div className="relative group/input">
                <div className="w-full max-w-sm">
                  <Input
                    placeholder={t('indexPanel.inputPlaceholder')}
                    value={indexInput}
                    onChange={(e) => {
                      onIndexInputChange(e.target.value);
                      onSetShowFieldSuggestions(e.target.value.trim().length > 0);
                      onSetSelectedSuggestionIndex(0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && fieldSuggestions.length > 0) {
                        e.preventDefault();
                        onAddFieldToIndex(fieldSuggestions[selectedSuggestionIndex]);
                      } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        onSetSelectedSuggestionIndex((prev) =>
                          prev < fieldSuggestions.length - 1 ? prev + 1 : prev,
                        );
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        onSetSelectedSuggestionIndex((prev) => (prev > 0 ? prev - 1 : 0));
                      } else if (e.key === 'Escape') {
                        onSetShowFieldSuggestions(false);
                      } else if (
                        e.key === 'Backspace' &&
                        indexInput === '' &&
                        currentIndexFields.length > 0
                      ) {
                        e.preventDefault();
                        onRemoveFieldFromIndex(currentIndexFields.length - 1);
                      }
                    }}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={hasSuggestions}
                    aria-controls={hasSuggestions ? suggestionsListId : undefined}
                    aria-activedescendant={activeSuggestionId}
                    className="pr-4 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                {showFieldSuggestions && fieldSuggestions.length > 0 ? (
                  <div
                    id={suggestionsListId}
                    role="listbox"
                    aria-label={t('indexPanel.suggestionAria')}
                    className="absolute z-10 mt-2 w-full overflow-hidden rounded-lg border bg-popover shadow-xl"
                  >
                    <div className="max-h-32 overflow-auto">
                      {fieldSuggestions.map((field, index) => (
                        <div
                          key={field}
                          id={`index-field-suggestion-${index}`}
                          role="option"
                          aria-selected={index === selectedSuggestionIndex}
                          tabIndex={-1}
                          className={`flex cursor-pointer items-center px-3 py-2 text-sm transition-all duration-150 ${
                            index === selectedSuggestionIndex
                              ? 'bg-accent text-accent-foreground pl-4'
                              : 'hover:bg-accent hover:text-accent-foreground hover:pl-4'
                          }`}
                          onClick={() => onAddFieldToIndex(field)}
                          onMouseEnter={() => onSetSelectedSuggestionIndex(index)}
                        >
                          <span className="mr-2 text-primary transition-transform duration-200 group-hover/input:scale-110">
                            ›
                          </span>
                          {field}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {currentIndexFields.length > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {currentIndexFields.map((field, index) => (
                    <div
                      key={index}
                      className="group inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 text-xs transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary/10 hover:shadow-md"
                      onClick={() => onToggleFieldDirection(index)}
                    >
                      <span className="font-medium text-foreground transition-colors hover:text-primary">
                        {field.name}
                      </span>
                      {field.direction === 'ASC' ? (
                        <ChevronUp className="h-3 w-3 text-primary transition-transform duration-200 group-hover:scale-110" />
                      ) : (
                        <ChevronDown className="h-3 w-3 text-primary transition-transform duration-200 group-hover:scale-110" />
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveFieldFromIndex(index);
                            }}
                            className="rounded-full p-0.5 text-muted-foreground transition-all duration-200 hover:rotate-90 hover:bg-destructive hover:text-destructive-foreground"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('indexPanel.removeFieldTip')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Added Indexes */}
          {indexes.length > 0 && (
            <div className="space-y-3">
              <div className="text-sm font-semibold relative pb-2">
                {t('indexPanel.addedTitle')}
                <div className="absolute bottom-0 left-0 w-10 h-0.5 bg-gradient-to-r from-primary to-transparent rounded" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {indexes.map((index) => {
                  const badge = index.isPrimary
                    ? {
                        label: t('indexPanel.badgePrimary'),
                        className:
                          'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
                        Icon: Key,
                      }
                    : index.unique
                      ? {
                          label: t('indexPanel.badgeUnique'),
                          className:
                            'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
                          Icon: Lock,
                        }
                      : {
                          label: t('indexPanel.badgeNormal'),
                          className:
                            'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
                          Icon: Hash,
                        };

                  const isAnimatingAdd = animatingIndexIds?.has(index.id);
                  const isAnimatingRemove = removingIndexIds?.has(index.id);

                  return (
                    <div
                      key={index.id}
                      className={cn(
                        'group/item relative flex items-start justify-between gap-4 rounded-xl border bg-muted/50 px-5 py-4 transition-all duration-300 hover:bg-muted/70 hover:-translate-y-1 hover:shadow-lg overflow-hidden',
                        isAnimatingAdd && 'animate-suggestion-add',
                        isAnimatingRemove && 'animate-suggestion-remove',
                      )}
                    >
                      {/* Left gradient bar */}
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary/30 to-transparent transition-all duration-300 group-hover/item:w-2" />

                      <div className="relative flex flex-1 flex-wrap items-center gap-3 pl-2">
                        <span
                          className={`inline-flex items-center gap-2 rounded-md px-3 py-1 text-sm font-semibold transition-transform duration-200 ${badge.className} group-hover/item:scale-105`}
                        >
                          <badge.Icon className="h-4 w-4" />
                          {badge.label}
                        </span>
                        {editingIndexId === index.id ? (
                          <Input
                            ref={editInputRef}
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleConfirmEdit();
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                handleCancelEdit();
                              }
                            }}
                            onBlur={handleConfirmEdit}
                            className="h-7 text-base font-semibold px-2 py-0"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <>
                            <span
                              className="break-all text-base font-semibold leading-snug transition-colors duration-200 group-hover/item:text-primary cursor-pointer hover:underline hover:decoration-dashed hover:underline-offset-4"
                              onDoubleClick={() => handleStartEdit(index)}
                              title={t('indexPanel.editNameTitle')}
                            >
                              {index.name}
                              <Pencil className="inline-block ml-1.5 h-3 w-3 opacity-0 group-hover/item:opacity-50 transition-opacity" />
                            </span>
                            <span className="sr-only">{t('indexPanel.editNameSrHint')}</span>
                          </>
                        )}
                        <div className="w-full pl-1">
                          <span className="break-words text-sm leading-relaxed text-muted-foreground transition-colors duration-200 group-hover/item:text-muted-foreground/80">
                            (
                            {index.fields
                              .map((f) => `${f.name}${f.direction === 'DESC' ? ' DESC' : ''}`)
                              .join(', ')}
                            )
                          </span>
                        </div>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="transition-all duration-200 hover:scale-110 hover:bg-destructive/10"
                            onClick={() => onRemoveIndex(index.id)}
                          >
                            <X className="h-4 w-4 transition-transform duration-200 group-hover/item:rotate-90" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('indexPanel.deleteIndexTip')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
