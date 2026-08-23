import { memo, useMemo, useState } from 'react';
import type { DatabaseType, IndexDefinition, IndexField } from '@ddlbuilder/shared-types';
import { buildPrimaryKeyName } from '@ddlbuilder/ddl-core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DragDropVerticalIcon, Hash, Key, Lock, Pencil, Trash2, X } from '@/components/icons';
import { cn } from '@/lib/utils';
import { buildNormalizedFields, useEditorStore } from '@/stores';
import {
  buildIndexName,
  getIdentifierNameMaxLength as getIndexNameMaxLength,
  truncateIdentifierName as truncateIndexName,
} from '@ddlbuilder/ddl-core';
import { useTranslation } from 'react-i18next';

interface IndexPanelProps {
  animatingIndexIds?: Set<string>;
  removingIndexIds?: Set<string>;
}

type IndexType = 'normal' | 'unique' | 'primary';
type PanelMode = 'view' | 'edit';

type DraftIndex = {
  id: string | null;
  name: string;
  type: IndexType;
  fields: IndexField[];
};

const getIndexType = (index: IndexDefinition): IndexType => {
  if (index.isPrimary) return 'primary';
  return index.unique ? 'unique' : 'normal';
};

export const IndexPanel = memo<IndexPanelProps>(({ animatingIndexIds, removingIndexIds }) => {
  const { t } = useTranslation();
  const rows = useEditorStore((state) => state.rows);
  const tableName = useEditorStore((state) => state.tableName);
  const dbType = useEditorStore((state) => state.dbType);
  const indexes = useEditorStore((state) => state.indexes);
  const setIndexes = useEditorStore((state) => state.setIndexes);
  const removeIndex = useEditorStore((state) => state.removeIndex);

  const availableFields = useMemo(
    () =>
      buildNormalizedFields(rows)
        .map((field) => field.name)
        .filter((name) => name.length > 0),
    [rows],
  );

  const [selectedIndexId, setSelectedIndexId] = useState<string | null>(indexes[0]?.id ?? null);
  const [mode, setMode] = useState<PanelMode>(indexes.length ? 'view' : 'edit');
  const [draft, setDraft] = useState<DraftIndex>({
    id: null,
    name: '',
    type: 'normal',
    fields: [],
  });
  const [fieldQuery, setFieldQuery] = useState('');
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<number>(-1);
  const [draggedFieldIndex, setDraggedFieldIndex] = useState<number | null>(null);

  const isCreating = mode === 'edit' && !draft.id;
  const requestedIndex = indexes.find((index) => index.id === selectedIndexId) ?? null;
  const selectedIndex = requestedIndex ?? (isCreating ? null : (indexes[0] ?? null));
  const visibleMode: PanelMode =
    !requestedIndex && !isCreating && selectedIndex
      ? 'view'
      : selectedIndex || isCreating
        ? mode
        : 'edit';
  const selectedFieldNames = useMemo(
    () => new Set(draft.fields.map((field) => field.name)),
    [draft.fields],
  );

  const fieldSuggestions = useMemo(() => {
    const query = fieldQuery.trim().toLowerCase();
    if (!query) return [];
    return availableFields.filter(
      (field) => field.toLowerCase().includes(query) && !selectedFieldNames.has(field),
    );
  }, [availableFields, fieldQuery, selectedFieldNames]);

  const visibleSuggestionIndex =
    fieldSuggestions.length === 0
      ? -1
      : Math.min(Math.max(activeSuggestionIndex, 0), fieldSuggestions.length - 1);

  const startCreate = (type: IndexType) => {
    setDraft({
      id: null,
      name: '',
      type,
      fields: [],
    });
    setSelectedIndexId(null);
    setMode('edit');
    setFieldQuery('');
  };

  const startEdit = (index: IndexDefinition) => {
    setDraft({
      id: index.id,
      name: index.name,
      type: getIndexType(index),
      fields: [...index.fields],
    });
    setSelectedIndexId(index.id);
    setMode('edit');
    setFieldQuery('');
  };

  const selectIndex = (index: IndexDefinition) => {
    setSelectedIndexId(index.id);
    setMode('view');
  };

  const buildDraftName = () => {
    const trimmedName = draft.name.trim();
    const maxLength = getIndexNameMaxLength(dbType as DatabaseType);
    if (trimmedName) return truncateIndexName(trimmedName, maxLength);
    if (draft.type === 'primary') return buildPrimaryKeyName(tableName, maxLength);
    return buildIndexName(
      draft.type === 'unique' ? 'uk' : 'idx',
      tableName || 'table',
      draft.fields.map((field) => field.name),
      maxLength,
    );
  };

  const saveDraft = () => {
    if (draft.fields.length === 0) return;
    if (!draft.id && draft.type === 'primary' && indexes.some((index) => index.isPrimary)) return;

    const nextIndex: IndexDefinition = {
      id: draft.id ?? Date.now().toString(),
      name: buildDraftName(),
      fields: [...draft.fields],
      unique: draft.type !== 'normal',
      isPrimary: draft.type === 'primary',
    };

    setIndexes((prev) =>
      draft.id
        ? prev.map((index) => (index.id === draft.id ? nextIndex : index))
        : [...prev, nextIndex],
    );
    setSelectedIndexId(nextIndex.id);
    setMode('view');
    setFieldQuery('');
  };

  const addField = (fieldName: string) => {
    setDraft((prev) => ({
      ...prev,
      fields: [...prev.fields, { name: fieldName, direction: 'ASC' }],
    }));
    setFieldQuery('');
  };

  const removeField = (fieldIndex: number) => {
    setDraft((prev) => ({
      ...prev,
      fields: prev.fields.filter((_, index) => index !== fieldIndex),
    }));
  };

  const moveField = (from: number, to: number) => {
    if (from === to) return;
    setDraft((prev) => {
      const nextFields = [...prev.fields];
      const [moved] = nextFields.splice(from, 1);
      nextFields.splice(to, 0, moved);
      return { ...prev, fields: nextFields };
    });
  };

  const toggleFieldDirection = (fieldIndex: number) => {
    setDraft((prev) => ({
      ...prev,
      fields: prev.fields.map((field, index) =>
        index === fieldIndex
          ? {
              ...field,
              direction: field.direction === 'ASC' ? 'DESC' : 'ASC',
            }
          : field,
      ),
    }));
  };

  const renderTypeBadge = (type: IndexType) => {
    const Icon = type === 'primary' ? Key : type === 'unique' ? Lock : Hash;
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold',
          type === 'primary' && 'bg-orange-100 text-orange-700 dark:bg-orange-900/40',
          type === 'unique' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/40',
          type === 'normal' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40',
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {t(`indexPanel.type.${type}`)}
      </span>
    );
  };

  const detailIndex =
    visibleMode === 'edit'
      ? ({
          id: draft.id ?? 'draft',
          name: draft.name,
          fields: draft.fields,
          unique: draft.type !== 'normal',
          isPrimary: draft.type === 'primary',
        } satisfies IndexDefinition)
      : selectedIndex;

  return (
    <div className="relative overflow-hidden rounded-lg border bg-card/95 shadow-sm">
      <div className="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-br from-primary/5 via-transparent to-transparent" />

      <div className="relative border-b px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">{t('indexPanel.configTitle')}</h3>
            <p className="text-xs text-muted-foreground">{t('indexPanel.configDescription')}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => startCreate('normal')}
            >
              <Hash className="h-3.5 w-3.5" />
              {t('indexPanel.addIndex')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => startCreate('unique')}
            >
              <Lock className="h-3.5 w-3.5" />
              {t('indexPanel.addUnique')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => startCreate('primary')}
              disabled={indexes.some((index) => index.isPrimary)}
            >
              <Key className="h-3.5 w-3.5" />
              {t('indexPanel.addPrimary')}
            </Button>
          </div>
        </div>
      </div>

      <div className="relative grid min-h-[320px] gap-0 2xl:grid-cols-[minmax(320px,1.05fr)_minmax(300px,1fr)]">
        <div className="border-b p-3 2xl:border-r 2xl:border-b-0">
          <div className="space-y-1.5">
            {visibleMode === 'edit' && !draft.id && (
              <button
                type="button"
                className="relative flex w-full items-start gap-2 rounded-md border border-primary bg-primary/5 px-3 py-2.5 pr-24 text-left shadow-sm"
              >
                <DragDropVerticalIcon className="mt-1 h-4 w-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold leading-snug">
                    {t('indexPanel.draftTitle')}
                  </div>
                  <div className="mt-1.5 break-words text-xs leading-relaxed text-muted-foreground">
                    {draft.fields.length
                      ? t('indexPanel.fieldsMeta', {
                          fields: draft.fields.map((field) => field.name).join(', '),
                        })
                      : t('indexPanel.emptyDraftMeta')}
                  </div>
                </div>
                <div className="absolute top-2.5 right-3">{renderTypeBadge(draft.type)}</div>
              </button>
            )}

            {indexes.map((index) => {
              const type = getIndexType(index);
              const active = selectedIndex?.id === index.id;
              return (
                <div
                  key={index.id}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    'group relative cursor-pointer rounded-md border px-3 py-2.5 pr-24 transition-colors hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    active && 'border-primary bg-primary/5 shadow-sm',
                    animatingIndexIds?.has(index.id) && 'animate-suggestion-add',
                    removingIndexIds?.has(index.id) && 'animate-suggestion-remove',
                  )}
                  onClick={() => selectIndex(index)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      selectIndex(index);
                    }
                  }}
                >
                  <div className="flex min-w-0 gap-3 text-left">
                    <DragDropVerticalIcon className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="break-all pr-2 text-sm font-semibold leading-snug">
                        {index.name}
                      </div>
                      <div className="mt-1.5 break-words text-xs leading-relaxed text-muted-foreground">
                        {t('indexPanel.fieldsMeta', {
                          fields: index.fields.map((field) => field.name).join(', '),
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="absolute top-2.5 right-3">{renderTypeBadge(type)}</div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-10 bottom-2 h-6 w-6 opacity-0 group-hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      startEdit(index);
                    }}
                    aria-label={t('indexPanel.edit')}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-3 bottom-2 h-6 w-6 text-destructive opacity-0 hover:text-destructive group-hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeIndex(index.id);
                    }}
                    aria-label={t('indexPanel.deleteIndexTip')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}

            {indexes.length === 0 && visibleMode !== 'edit' && (
              <div className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                {t('indexPanel.emptyList')}
              </div>
            )}
          </div>
          {indexes.length > 0 && (
            <div className="mt-4 text-center text-xs text-muted-foreground">
              {t('indexPanel.total', { count: indexes.length })}
            </div>
          )}
        </div>

        <div className="p-3">
          {detailIndex ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold">
                  {visibleMode === 'edit' ? t('indexPanel.editTitle') : t('indexPanel.detailTitle')}
                </h4>
                {visibleMode === 'view' && selectedIndex && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 px-2 text-xs"
                    onClick={() => startEdit(selectedIndex)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {t('indexPanel.edit')}
                  </Button>
                )}
              </div>

              <div className="grid gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">
                    {t('indexPanel.nameLabel')}
                  </label>
                  {visibleMode === 'edit' ? (
                    <Input
                      value={draft.name}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          name: event.target.value,
                        }))
                      }
                      placeholder={t('indexPanel.namePlaceholder')}
                      className="h-8 text-sm"
                    />
                  ) : (
                    <div className="break-all rounded-md border bg-muted/20 px-3 py-2 text-xs">
                      {detailIndex.name}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-muted-foreground">
                    {t('indexPanel.typeLabel')}
                  </div>
                  <div className="rounded-md border bg-muted/20 px-3 py-2">
                    {renderTypeBadge(getIndexType(detailIndex))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-muted-foreground">
                    {t('indexPanel.methodLabel')}
                  </div>
                  <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    {t('indexPanel.methodAuto')}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-muted-foreground">
                    {t('indexPanel.fieldsLabel')}
                  </div>
                  {visibleMode === 'edit' ? (
                    <div className="rounded-md border bg-muted/10 p-2.5">
                      <div className="relative">
                        <Input
                          value={fieldQuery}
                          onChange={(event) => {
                            setFieldQuery(event.target.value);
                            setActiveSuggestionIndex(0);
                          }}
                          onKeyDown={(event) => {
                            if (fieldSuggestions.length === 0) return;
                            if (event.key === 'ArrowDown') {
                              event.preventDefault();
                              setActiveSuggestionIndex(
                                visibleSuggestionIndex < fieldSuggestions.length - 1
                                  ? visibleSuggestionIndex + 1
                                  : 0,
                              );
                            } else if (event.key === 'ArrowUp') {
                              event.preventDefault();
                              setActiveSuggestionIndex(
                                visibleSuggestionIndex > 0
                                  ? visibleSuggestionIndex - 1
                                  : fieldSuggestions.length - 1,
                              );
                            } else if (event.key === 'Enter') {
                              event.preventDefault();
                              addField(fieldSuggestions[visibleSuggestionIndex]);
                            } else if (event.key === 'Escape') {
                              setFieldQuery('');
                            }
                          }}
                          placeholder={t('indexPanel.inputPlaceholder')}
                          className="h-8 text-sm"
                          role="combobox"
                          tabIndex={0}
                          aria-autocomplete="list"
                          aria-expanded={fieldSuggestions.length > 0}
                          aria-controls="index-field-suggestions-listbox"
                          aria-activedescendant={
                            visibleSuggestionIndex >= 0
                              ? `index-field-suggestion-${visibleSuggestionIndex}`
                              : undefined
                          }
                        />
                        {fieldSuggestions.length > 0 && (
                          <div
                            id="index-field-suggestions-listbox"
                            role="listbox"
                            aria-label={t('indexPanel.fieldSuggestionsLabel', '字段建议')}
                            className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg"
                          >
                            {fieldSuggestions.map((field, idx) => (
                              <button
                                key={field}
                                id={`index-field-suggestion-${idx}`}
                                type="button"
                                role="option"
                                aria-selected={idx === visibleSuggestionIndex}
                                className={cn(
                                  'block w-full px-3 py-2 text-left text-sm hover:bg-accent',
                                  idx === visibleSuggestionIndex && 'bg-accent',
                                )}
                                onClick={() => addField(field)}
                              >
                                {field}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {draft.fields.map((field, index) => (
                          <div
                            key={`${field.name}-${index}`}
                            draggable
                            onDragStart={() => setDraggedFieldIndex(index)}
                            onDragEnter={() => {
                              if (draggedFieldIndex == null || draggedFieldIndex === index) return;
                              moveField(draggedFieldIndex, index);
                              setDraggedFieldIndex(index);
                            }}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => {
                              setDraggedFieldIndex(null);
                            }}
                            onDragEnd={() => setDraggedFieldIndex(null)}
                            className="inline-flex cursor-grab items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs shadow-sm active:cursor-grabbing"
                          >
                            <DragDropVerticalIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{field.name}</span>
                            <button
                              type="button"
                              className="rounded border bg-background px-1 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
                              onClick={() => toggleFieldDirection(index)}
                            >
                              {field.direction}
                            </button>
                            <button type="button" onClick={() => removeField(index)}>
                              <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                            </button>
                          </div>
                        ))}
                        {draft.fields.length === 0 && (
                          <div className="text-xs text-muted-foreground">
                            {t('indexPanel.emptyFields')}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 rounded-md border bg-muted/20 p-2.5">
                      {detailIndex.fields.map((field) => (
                        <span
                          key={`${field.name}-${field.direction}`}
                          className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs shadow-sm"
                        >
                          {field.name}
                          <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                            {field.direction}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {visibleMode === 'edit' && (
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (selectedIndex) {
                        setMode('view');
                        return;
                      }
                      const nextIndex = indexes[0] ?? null;
                      setSelectedIndexId(nextIndex?.id ?? null);
                      setMode(nextIndex ? 'view' : 'edit');
                      setDraft({ id: null, name: '', type: draft.type, fields: [] });
                    }}
                  >
                    {t('indexPanel.cancel')}
                  </Button>
                  <Button onClick={saveDraft} disabled={draft.fields.length === 0}>
                    {t('indexPanel.saveIndex')}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full min-h-64 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              {t('indexPanel.emptyDetail')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

IndexPanel.displayName = 'IndexPanel';
