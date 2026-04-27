import { memo, useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Pencil, Link2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useForeignKeyStore, useAppStore } from '@/stores';
import type { ForeignKeyAction } from '@ddlbuilder/shared-types';
import { useTranslation } from 'react-i18next';

const FK_ACTIONS: ForeignKeyAction[] = [
  'CASCADE',
  'SET NULL',
  'SET DEFAULT',
  'RESTRICT',
  'NO ACTION',
];

interface ForeignKeyPanelProps {
  availableFields: string[];
}

export const ForeignKeyPanel = memo<ForeignKeyPanelProps>(({ availableFields }) => {
  const { t } = useTranslation();
  const tableName = useAppStore((state) => state.tableName);
  const foreignKeys = useForeignKeyStore((state) => state.foreignKeys);
  const addForeignKey = useForeignKeyStore((state) => state.addForeignKey);
  const removeForeignKey = useForeignKeyStore((state) => state.removeForeignKey);
  const updateForeignKey = useForeignKeyStore((state) => state.updateForeignKey);

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // Add form state
  const [newFkName, setNewFkName] = useState('');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [refSchema, setRefSchema] = useState('');
  const [refTable, setRefTable] = useState('');
  const [refFields, setRefFields] = useState<string[]>([]);
  const [onDelete, setOnDelete] = useState<ForeignKeyAction | undefined>(undefined);
  const [onUpdate, setOnUpdate] = useState<ForeignKeyAction | undefined>(undefined);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleStartEdit = (fk: (typeof foreignKeys)[number]) => {
    setEditingId(fk.id);
    setEditingName(fk.name);
  };

  const handleConfirmEdit = () => {
    if (editingId && editingName.trim()) {
      updateForeignKey(editingId, { name: editingName.trim() });
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleToggleField = (field: string) => {
    setSelectedFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field],
    );
  };

  const handleToggleRefField = (field: string) => {
    setRefFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field],
    );
  };

  const handleAdd = () => {
    if (selectedFields.length === 0 || !refTable.trim() || refFields.length === 0) return;

    const name = newFkName.trim() || `fk_${tableName || 'table'}_${selectedFields.join('_')}`;

    addForeignKey({
      name,
      fields: selectedFields,
      refSchema: refSchema.trim() || undefined,
      refTable: refTable.trim(),
      refFields,
      onDelete,
      onUpdate,
    });

    // Reset form
    setNewFkName('');
    setSelectedFields([]);
    setRefSchema('');
    setRefTable('');
    setRefFields([]);
    setOnDelete(undefined);
    setOnUpdate(undefined);
    setIsAdding(false);
  };

  const handleCancelAdd = () => {
    setIsAdding(false);
    setNewFkName('');
    setSelectedFields([]);
    setRefSchema('');
    setRefTable('');
    setRefFields([]);
    setOnDelete(undefined);
    setOnUpdate(undefined);
  };

  return (
    <div className="relative group rounded-lg border bg-card/95 backdrop-blur-sm shadow-lg shadow-primary/5 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent rounded-lg" />
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/30 to-transparent rounded-t-lg" />

      <div className="relative p-4">
        <div className="space-y-3">
          {/* Add button */}
          {!isAdding && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2 text-xs font-medium transition-all duration-200 hover:scale-105 hover:shadow-md"
              onClick={() => setIsAdding(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              {t('foreignKeyPanel.add')}
            </Button>
          )}

          {/* Add form */}
          {isAdding && (
            <div className="space-y-4 rounded-xl border bg-muted/40 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {t('foreignKeyPanel.name')}
                  </label>
                  <Input
                    placeholder={t('foreignKeyPanel.namePlaceholder')}
                    value={newFkName}
                    onChange={(e) => setNewFkName(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {t('foreignKeyPanel.refSchema')}
                  </label>
                  <Input
                    placeholder={t('foreignKeyPanel.refSchemaPlaceholder')}
                    value={refSchema}
                    onChange={(e) => setRefSchema(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t('foreignKeyPanel.refTable')} *
                </label>
                <Input
                  placeholder={t('foreignKeyPanel.refTablePlaceholder')}
                  value={refTable}
                  onChange={(e) => setRefTable(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>

              {/* Local fields */}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t('foreignKeyPanel.localFields')} *
                </label>
                {availableFields.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {availableFields.map((field) => (
                      <button
                        key={field}
                        type="button"
                        onClick={() => handleToggleField(field)}
                        className={cn(
                          'rounded-md border px-2.5 py-1 text-xs transition-all duration-200',
                          selectedFields.includes(field)
                            ? 'border-primary bg-primary/10 text-primary font-medium'
                            : 'border-border bg-background text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {field}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{t('foreignKeyPanel.noFields')}</p>
                )}
              </div>

              {/* Reference fields */}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t('foreignKeyPanel.refFields')} *
                </label>
                <div className="flex flex-wrap gap-2">
                  {refFields.map((field) => (
                    <span
                      key={field}
                      className="inline-flex items-center gap-1 rounded-md border border-primary bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                    >
                      {field}
                      <button
                        type="button"
                        onClick={() => handleToggleRefField(field)}
                        className="rounded-full p-0.5 hover:bg-primary/20"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <Input
                    placeholder={t('foreignKeyPanel.refFieldPlaceholder')}
                    className="h-7 w-32 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const value = e.currentTarget.value.trim();
                        if (value && !refFields.includes(value)) {
                          setRefFields((prev) => [...prev, value]);
                          e.currentTarget.value = '';
                        }
                      }
                    }}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {t('foreignKeyPanel.onDelete')}
                  </label>
                  <select
                    value={onDelete || ''}
                    onChange={(e) => setOnDelete((e.target.value as ForeignKeyAction) || undefined)}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">{t('foreignKeyPanel.noAction')}</option>
                    {FK_ACTIONS.map((action) => (
                      <option key={action} value={action}>
                        {action}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {t('foreignKeyPanel.onUpdate')}
                  </label>
                  <select
                    value={onUpdate || ''}
                    onChange={(e) => setOnUpdate((e.target.value as ForeignKeyAction) || undefined)}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">{t('foreignKeyPanel.noAction')}</option>
                    {FK_ACTIONS.map((action) => (
                      <option key={action} value={action}>
                        {action}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 text-xs"
                  onClick={handleAdd}
                  disabled={
                    selectedFields.length === 0 || !refTable.trim() || refFields.length === 0
                  }
                >
                  {t('foreignKeyPanel.confirmAdd')}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleCancelAdd}>
                  {t('foreignKeyPanel.cancel')}
                </Button>
              </div>
            </div>
          )}

          {/* Foreign Key List */}
          {foreignKeys.length > 0 && (
            <div className="space-y-3">
              <div className="text-sm font-semibold relative pb-2">
                {t('foreignKeyPanel.listTitle')}
                <div className="absolute bottom-0 left-0 w-10 h-0.5 bg-gradient-to-r from-primary to-transparent rounded" />
              </div>
              <div className="grid gap-3 sm:grid-cols-1 xl:grid-cols-2">
                {foreignKeys.map((fk) => (
                  <div
                    key={fk.id}
                    className="group/item relative flex items-start justify-between gap-4 rounded-xl border bg-muted/50 px-5 py-4 transition-all duration-300 hover:bg-muted/70 hover:-translate-y-1 hover:shadow-lg overflow-hidden"
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary/30 to-transparent transition-all duration-300 group-hover/item:w-2" />

                    <div className="relative flex flex-1 flex-col gap-2 pl-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200">
                          <Link2 className="h-3.5 w-3.5" />
                          FK
                        </span>
                        {editingId === fk.id ? (
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
                            className="h-7 text-base font-semibold px-2 py-0 w-48"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span
                            className="break-all text-base font-semibold leading-snug transition-colors duration-200 group-hover/item:text-primary cursor-pointer hover:underline hover:decoration-dashed hover:underline-offset-4"
                            onDoubleClick={() => handleStartEdit(fk)}
                          >
                            {fk.name}
                            <Pencil className="inline-block ml-1.5 h-3 w-3 opacity-0 group-hover/item:opacity-50 transition-opacity" />
                          </span>
                        )}
                      </div>
                      <div className="text-sm leading-relaxed text-muted-foreground space-y-1">
                        <div>
                          <span className="text-xs font-medium text-foreground/70">
                            {t('foreignKeyPanel.local')}:
                          </span>{' '}
                          {fk.fields.join(', ')}
                        </div>
                        <div>
                          <span className="text-xs font-medium text-foreground/70">
                            {t('foreignKeyPanel.references')}:
                          </span>{' '}
                          {fk.refSchema ? `${fk.refSchema}.` : ''}
                          {fk.refTable}({fk.refFields.join(', ')})
                        </div>
                        {(fk.onDelete || fk.onUpdate) && (
                          <div className="flex gap-3 text-xs">
                            {fk.onDelete && (
                              <span>
                                <span className="font-medium text-foreground/60">ON DELETE:</span>{' '}
                                {fk.onDelete}
                              </span>
                            )}
                            {fk.onUpdate && (
                              <span>
                                <span className="font-medium text-foreground/60">ON UPDATE:</span>{' '}
                                {fk.onUpdate}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="transition-all duration-200 hover:scale-110 hover:bg-destructive/10"
                          onClick={() => removeForeignKey(fk.id)}
                        >
                          <X className="h-4 w-4 transition-transform duration-200 group-hover/item:rotate-90" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('foreignKeyPanel.deleteTip')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                ))}
              </div>
            </div>
          )}

          {foreignKeys.length === 0 && !isAdding && (
            <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
              {t('foreignKeyPanel.empty')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

ForeignKeyPanel.displayName = 'ForeignKeyPanel';
