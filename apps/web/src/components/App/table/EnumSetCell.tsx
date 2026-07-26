import { memo, useState, useCallback } from 'react';
import { Pencil } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { EnumValueMeta } from '@ddlbuilder/shared-types';
import { useTranslation } from 'react-i18next';
import { EnumSetEditor } from './EnumSetEditor';
import { ENUM_COLORS } from './EnumSetEditor';

interface EnumSetCellProps {
  fieldType: string;
  enumMeta: EnumValueMeta[] | undefined;
  onSave: (fieldType: string, enumMeta: EnumValueMeta[]) => void;
  onTabNavigate?: (direction: 1 | -1) => void;
}

const MAX_VISIBLE_CHIPS = 4;

export const EnumSetCell = memo<EnumSetCellProps>(
  ({ fieldType, enumMeta, onSave, onTabNavigate }) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);

    const baseType = fieldType.match(/^(enum|set)\s*/i)?.[1]?.toUpperCase() ?? 'ENUM';

    // Build chip list from enumMeta or fall back to type-string labels
    const chips = enumMeta && enumMeta.length > 0 ? enumMeta : [];

    const visibleChips = chips.slice(0, MAX_VISIBLE_CHIPS);
    const hiddenCount = chips.length - MAX_VISIBLE_CHIPS;

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === 'F2') {
          e.preventDefault();
          setOpen(true);
        } else if (e.key === 'Tab') {
          e.preventDefault();
          onTabNavigate?.(e.shiftKey ? -1 : 1);
        }
      },
      [onTabNavigate],
    );

    return (
      <>
        <div
          tabIndex={0}
          role="button"
          aria-label={t('enumEditor.editTip')}
          onKeyDown={handleKeyDown}
          onDoubleClick={() => setOpen(true)}
          className={cn(
            'group flex h-7 w-full cursor-pointer items-center gap-1 truncate px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-primary/30',
          )}
        >
          <span className="shrink-0 rounded bg-muted px-1 py-0 font-mono text-[10px] font-medium text-muted-foreground">
            {baseType}
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

          {chips.length === 0 && (
            <span className="text-xs text-muted-foreground/50">{t('enumEditor.noValues')}</span>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
            }}
            className="ml-auto shrink-0 opacity-0 transition-opacity group-focus:opacity-100 group-hover:opacity-100 outline-none hover:text-primary"
            aria-label={t('enumEditor.editTip')}
          >
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>

        <EnumSetEditor
          open={open}
          onOpenChange={setOpen}
          fieldType={fieldType}
          enumMeta={enumMeta}
          onSave={onSave}
        />
      </>
    );
  },
);

EnumSetCell.displayName = 'EnumSetCell';
