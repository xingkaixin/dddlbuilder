import { memo, useCallback, useReducer } from 'react';
import { Pencil } from '@/components/icons';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { EnumValueMeta } from '@ddlbuilder/shared-types';
import { useTranslation } from 'react-i18next';
import { EnumSetEditor } from './EnumSetEditor';
import { ENUM_COLORS } from './EnumSetEditor';

interface LogicalEnumCellProps {
  fieldType: string;
  enumMeta: EnumValueMeta[] | undefined;
  onTypeChange: (value: string) => void;
  onEnumSave: (fieldType: string, enumMeta: EnumValueMeta[]) => void;
  onTabNavigate?: (direction: 1 | -1) => void;
}

const MAX_VISIBLE_CHIPS = 4;

type CellState = { enumEditorOpen: boolean; isEditing: boolean; editValue: string };

type CellEvent =
  | { type: 'enumEditorOpened' }
  | { type: 'enumEditorClosed' }
  | { type: 'editStarted'; value: string }
  | { type: 'editValueChanged'; value: string }
  | { type: 'editFinished' }
  | { type: 'editCancelled'; fieldType: string };

function cellReducer(state: CellState, event: CellEvent): CellState {
  switch (event.type) {
    case 'enumEditorOpened':
      return { ...state, enumEditorOpen: true };
    case 'enumEditorClosed':
      return { ...state, enumEditorOpen: false };
    case 'editStarted':
      return { ...state, isEditing: true, editValue: event.value };
    case 'editValueChanged':
      return { ...state, editValue: event.value };
    case 'editFinished':
      return { ...state, isEditing: false };
    case 'editCancelled':
      return { ...state, isEditing: false, editValue: event.fieldType };
  }
}

const createCellState = (fieldType: string): CellState => ({
  enumEditorOpen: false,
  isEditing: false,
  editValue: fieldType,
});

const focusAndSelect = (input: HTMLInputElement | null) => {
  input?.focus();
  input?.select();
};

export const LogicalEnumCell = memo<LogicalEnumCellProps>(
  ({ fieldType, enumMeta, onTypeChange, onEnumSave, onTabNavigate }) => {
    const { t } = useTranslation();

    const [{ enumEditorOpen: open, isEditing, editValue }, dispatch] = useReducer(
      cellReducer,
      fieldType,
      createCellState,
    );

    const chips = enumMeta && enumMeta.length > 0 ? enumMeta : [];
    const visibleChips = chips.slice(0, MAX_VISIBLE_CHIPS);
    const hiddenCount = chips.length - MAX_VISIBLE_CHIPS;

    const finishEditing = useCallback(
      (value: string) => {
        dispatch({ type: 'editFinished' });

        if (value !== fieldType) {
          onTypeChange(value);
        }
      },
      [fieldType, onTypeChange],
    );

    const handleContainerKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (isEditing) return;

        if (e.key === 'Enter' || e.key === 'F2') {
          e.preventDefault();
          dispatch({ type: 'enumEditorOpened' });

          return;
        }

        if (e.key === 'Tab') {
          e.preventDefault();
          onTabNavigate?.(e.shiftKey ? -1 : 1);

          return;
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          dispatch({ type: 'editStarted', value: '' });

          return;
        }

        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          dispatch({ type: 'editStarted', value: e.key });
        }
      },
      [isEditing, onTabNavigate],
    );

    const handleInputKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          finishEditing(editValue);
          setTimeout(() => onTabNavigate?.(e.shiftKey ? -1 : 1), 0);

          return;
        }

        if (e.key === 'Enter') {
          e.preventDefault();
          finishEditing(editValue);

          return;
        }

        if (e.key === 'Escape') {
          e.preventDefault();
          dispatch({ type: 'editCancelled', fieldType });
        }
      },
      [editValue, fieldType, finishEditing, onTabNavigate],
    );

    const handleDoubleClick = useCallback(() => {
      dispatch({ type: 'editStarted', value: fieldType });
    }, [fieldType]);

    if (isEditing) {
      return (
        <Input
          ref={focusAndSelect}
          value={editValue}
          onChange={(e) => dispatch({ type: 'editValueChanged', value: e.target.value })}
          onBlur={() => finishEditing(editValue)}
          onKeyDown={handleInputKeyDown}
          className="h-7 w-full border-primary/50 bg-background px-2 py-1 text-xs any-pointer-coarse:text-base focus:ring-1 focus:ring-primary/30"
          placeholder={t('dataTable.placeholder.fieldType')}
        />
      );
    }

    return (
      <>
        <div
          tabIndex={0}
          role="button"
          aria-label={t('enumEditor.editTip')}
          onKeyDown={handleContainerKeyDown}
          onDoubleClick={handleDoubleClick}
          className={cn(
            'group flex h-7 w-full cursor-pointer items-center gap-1 truncate px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-primary/30',
          )}
        >
          <span
            className={cn(
              'min-w-0 flex-1 truncate font-mono text-xs',
              !fieldType && 'text-muted-foreground/50',
            )}
            title={fieldType || undefined}
          >
            {fieldType || t('dataTable.placeholder.fieldType')}
          </span>

          {visibleChips.map((chip, idx) => (
            <span
              key={`${chip.value}-${idx}`}
              className="shrink-0 rounded-full px-1.5 py-0 text-[10px] font-medium text-white"
              style={{
                backgroundColor: chip.color ?? ENUM_COLORS[idx % ENUM_COLORS.length],
              }}
              title={chip.value}
            >
              {chip.value}
            </span>
          ))}

          {hiddenCount > 0 && (
            <span className="shrink-0 text-[10px] text-muted-foreground">+{hiddenCount}</span>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              dispatch({ type: 'enumEditorOpened' });
            }}
            className="ml-auto shrink-0 opacity-0 transition-opacity group-focus:opacity-100 group-hover:opacity-100 outline-none hover:text-primary"
            aria-label={t('enumEditor.editTip')}
          >
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>

        {open && (
          <EnumSetEditor
            open={open}
            onOpenChange={(next) =>
              dispatch({ type: next ? 'enumEditorOpened' : 'enumEditorClosed' })
            }
            fieldType={fieldType}
            enumMeta={enumMeta}
            onSave={onEnumSave}
            mode="logical"
          />
        )}
      </>
    );
  },
);

LogicalEnumCell.displayName = 'LogicalEnumCell';
