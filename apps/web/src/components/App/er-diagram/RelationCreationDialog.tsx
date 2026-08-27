import { useMemo, useState } from 'react';
import type { ForeignKeyAction } from '@ddlbuilder/shared-types';
import { AlertTriangle, ArrowRight, KeyRound, Link2 } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  defaultRelationshipIntent,
  planTableRelationship,
  referencedKeyFields,
  type RelationshipCardinality,
  type RelationshipOptionality,
  type TableRelationshipDraft,
  type TableRelationshipIntent,
} from './tableRelationship';

const FOREIGN_KEY_ACTIONS: ForeignKeyAction[] = [
  'NO ACTION',
  'RESTRICT',
  'CASCADE',
  'SET NULL',
  'SET DEFAULT',
];

type RelationCreationDialogProps = {
  draft: TableRelationshipDraft;
  sourceField: string;
  targetField: string;
  onCancel: () => void;
  onConfirm: (intent: TableRelationshipIntent) => Promise<void>;
};

function fieldOptions(draft: TableRelationshipDraft, side: 'source' | 'target') {
  const keyFields = side === 'target' ? referencedKeyFields(draft.target) : null;
  const state = side === 'source' ? draft.source : draft.target;
  return state.rows
    .filter((row) => row.fieldName.trim())
    .map((row) => ({
      name: row.fieldName,
      type: row.fieldType,
      isKey: keyFields?.has(row.fieldName) ?? false,
    }));
}

function SelectionButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex-1 rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border bg-background text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

export function RelationCreationDialog({
  draft,
  sourceField,
  targetField,
  onCancel,
  onConfirm,
}: RelationCreationDialogProps) {
  const { t } = useTranslation();
  const [intent, setIntent] = useState<TableRelationshipIntent>(() =>
    defaultRelationshipIntent(draft, sourceField, targetField),
  );
  const [isSaving, setIsSaving] = useState(false);

  const sourceFields = useMemo(() => fieldOptions(draft, 'source'), [draft]);
  const targetFields = useMemo(() => fieldOptions(draft, 'target'), [draft]);
  const result = useMemo(() => planTableRelationship(draft, intent), [draft, intent]);

  const updateIntent = <Key extends keyof TableRelationshipIntent>(
    key: Key,
    value: TableRelationshipIntent[Key],
  ) => setIntent((current) => (current ? { ...current, [key]: value } : current));

  const selectCardinality = (cardinality: RelationshipCardinality) => {
    updateIntent('cardinality', cardinality);
    if (cardinality === 'one-to-one') updateIntent('createIndex', true);
  };

  const selectOptionality = (optionality: RelationshipOptionality) => {
    updateIntent('optionality', optionality);
    if (optionality === 'required') {
      if (intent.onDelete === 'SET NULL') updateIntent('onDelete', 'NO ACTION');
      if (intent.onUpdate === 'SET NULL') updateIntent('onUpdate', 'NO ACTION');
    }
  };

  const handleConfirm = async () => {
    if (!result?.ok || isSaving) return;
    setIsSaving(true);
    try {
      await onConfirm(intent);
    } finally {
      setIsSaving(false);
    }
  };

  const errorMessage =
    result && !result.ok ? t(`erDiagram.relationship.errors.${result.error}`) : '';
  const targetHasKeys = targetFields.some((field) => field.isKey);

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            {t('erDiagram.relationship.title')}
          </DialogTitle>
          <DialogDescription>{t('erDiagram.relationship.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6">
          <section className="rounded-lg border bg-muted/30 p-4">
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">
                  {t('erDiagram.relationship.source')}
                </div>
                <div className="truncate text-sm font-semibold">{draft.source.tableName}</div>
                <Select
                  value={intent.sourceField}
                  onValueChange={(value) => updateIntent('sourceField', value)}
                >
                  <SelectTrigger aria-label={t('erDiagram.relationship.sourceField')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceFields.map((field) => (
                      <SelectItem key={field.name} value={field.name}>
                        <span className="font-mono">{field.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{field.type}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <ArrowRight className="mb-2 h-5 w-5 text-primary" />
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">
                  {t('erDiagram.relationship.target')}
                </div>
                <div className="truncate text-sm font-semibold">{draft.target.tableName}</div>
                <Select
                  value={intent.targetField}
                  onValueChange={(value) => updateIntent('targetField', value)}
                >
                  <SelectTrigger aria-label={t('erDiagram.relationship.targetField')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {targetFields.map((field) => (
                      <SelectItem key={field.name} value={field.name} disabled={!field.isKey}>
                        <KeyRound
                          className={cn(
                            'mr-2 h-3.5 w-3.5',
                            field.isKey ? 'text-primary' : 'text-muted-foreground/40',
                          )}
                        />
                        <span className="font-mono">{field.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{field.type}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {!targetHasKeys && (
              <p className="mt-3 flex items-start gap-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {t('erDiagram.relationship.noTargetKey')}
              </p>
            )}
          </section>

          <div className="grid gap-5 sm:grid-cols-2">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                {t('erDiagram.relationship.cardinality')}
              </legend>
              <div className="flex gap-2">
                <SelectionButton
                  active={intent.cardinality === 'many-to-one'}
                  onClick={() => selectCardinality('many-to-one')}
                >
                  <span className="block text-sm font-medium">
                    {t('erDiagram.relationship.manyToOne')}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t('erDiagram.relationship.manyToOneHint')}
                  </span>
                </SelectionButton>
                <SelectionButton
                  active={intent.cardinality === 'one-to-one'}
                  onClick={() => selectCardinality('one-to-one')}
                >
                  <span className="block text-sm font-medium">
                    {t('erDiagram.relationship.oneToOne')}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t('erDiagram.relationship.oneToOneHint')}
                  </span>
                </SelectionButton>
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                {t('erDiagram.relationship.optionality')}
              </legend>
              <div className="flex gap-2">
                <SelectionButton
                  active={intent.optionality === 'required'}
                  onClick={() => selectOptionality('required')}
                >
                  <span className="block text-sm font-medium">
                    {t('erDiagram.relationship.required')}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">NOT NULL</span>
                </SelectionButton>
                <SelectionButton
                  active={intent.optionality === 'optional'}
                  onClick={() => selectOptionality('optional')}
                >
                  <span className="block text-sm font-medium">
                    {t('erDiagram.relationship.optional')}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">NULL</span>
                </SelectionButton>
              </div>
            </fieldset>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="relationship-name" className="text-sm font-medium">
              {t('erDiagram.relationship.name')}
            </label>
            <Input
              id="relationship-name"
              value={intent.name}
              onChange={(event) => updateIntent('name', event.target.value)}
              className="font-mono"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {(['onDelete', 'onUpdate'] as const).map((actionType) => (
              <div key={actionType} className="space-y-1.5">
                <div className="text-sm font-medium">
                  {t(`erDiagram.relationship.${actionType}`)}
                </div>
                <Select
                  value={intent[actionType]}
                  onValueChange={(value) => updateIntent(actionType, value as ForeignKeyAction)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FOREIGN_KEY_ACTIONS.map((action) => (
                      <SelectItem
                        key={action}
                        value={action}
                        disabled={action === 'SET NULL' && intent.optionality === 'required'}
                      >
                        {action}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-3 rounded-lg border px-4 py-3">
            <Checkbox
              aria-label={
                intent.cardinality === 'one-to-one'
                  ? t('erDiagram.relationship.uniqueIndex')
                  : t('erDiagram.relationship.createIndex')
              }
              checked={intent.createIndex}
              disabled={intent.cardinality === 'one-to-one'}
              onCheckedChange={(checked) => updateIntent('createIndex', checked === true)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium">
                {intent.cardinality === 'one-to-one'
                  ? t('erDiagram.relationship.uniqueIndex')
                  : t('erDiagram.relationship.createIndex')}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {intent.cardinality === 'one-to-one'
                  ? t('erDiagram.relationship.uniqueIndexHint')
                  : t('erDiagram.relationship.createIndexHint')}
              </span>
            </span>
          </div>

          {result?.ok && (
            <section className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
              <div className="text-xs font-medium text-muted-foreground">
                {t('erDiagram.relationship.preview')}
              </div>
              <div className="mt-1 font-mono text-sm">
                {draft.source.tableName}.{intent.sourceField}
                <ArrowRight className="mx-2 inline h-4 w-4 text-primary" />
                {draft.target.tableName}.{intent.targetField}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  {intent.cardinality === 'one-to-one'
                    ? t('erDiagram.relationship.oneToOne')
                    : t('erDiagram.relationship.manyToOne')}
                </span>
                <span>
                  {intent.optionality === 'required'
                    ? t('erDiagram.relationship.required')
                    : t('erDiagram.relationship.optional')}
                </span>
                {result.plan.addedIndex && (
                  <span>{t('erDiagram.relationship.willCreateIndex')}</span>
                )}
                {result.plan.changedNullability && (
                  <span>{t('erDiagram.relationship.willUpdateNullability')}</span>
                )}
              </div>
              {result.plan.warnings.includes('field-type-mismatch') && (
                <p className="mt-2 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {t('erDiagram.relationship.warnings.field-type-mismatch')}
                </p>
              )}
            </section>
          )}

          {errorMessage && (
            <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {errorMessage}
            </p>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isSaving}>
            {t('erDiagram.relationship.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!result?.ok || !intent.name.trim() || isSaving}
          >
            {isSaving ? t('erDiagram.relationship.saving') : t('erDiagram.relationship.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
