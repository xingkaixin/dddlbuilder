import * as React from 'react';
import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { Select as SelectPrimitive } from '@base-ui/react/select';
import { Check, ChevronDown, ChevronUp } from '@/components/icons';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

type SelectProps = Omit<SelectPrimitive.Root.Props<string>, 'onValueChange'> & {
  onValueChange?: (value: string, eventDetails: SelectPrimitive.Root.ChangeEventDetails) => void;
};

function Select({ onValueChange, ...props }: SelectProps) {
  return (
    <SelectPrimitive.Root
      {...props}
      onValueChange={(value, eventDetails) => {
        if (value !== null) onValueChange?.(value, eventDetails);
      }}
    />
  );
}

type SearchableSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

interface SearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  triggerClassName?: string;
  renderTrigger?: (value: string, isOpen: boolean) => React.ReactNode;
  renderItem?: (option: SearchableSelectOption) => React.ReactNode;
  emptyMessage?: string;
}

const SearchableSelect = React.forwardRef<
  HTMLButtonElement,
  SearchableSelectProps & React.ComponentPropsWithoutRef<'button'>
>(
  (
    {
      value,
      onValueChange,
      options,
      placeholder = 'Select an option',
      triggerClassName,
      renderTrigger,
      renderItem,
      emptyMessage = 'No results found',
      ...triggerProps
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const [open, setOpen] = React.useState(false);
    const [inputValue, setInputValue] = React.useState('');
    const selectedOption = options.find((option) => option.value === value) ?? null;
    const selectedLabel = selectedOption?.label ?? placeholder;

    const handleOpenChange = (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) setInputValue('');
    };

    return (
      <ComboboxPrimitive.Root
        items={options}
        value={selectedOption}
        inputValue={inputValue}
        open={open}
        onOpenChange={handleOpenChange}
        onInputValueChange={setInputValue}
        onValueChange={(option) => {
          if (!option) return;
          onValueChange(option.value);
          setInputValue('');
        }}
        itemToStringLabel={(option) => option.label}
        isItemEqualToValue={(option, selected) => option.value === selected.value}
      >
        <ComboboxPrimitive.Trigger
          render={
            <button
              ref={ref}
              type="button"
              {...triggerProps}
              className={cn(
                't-ui-button flex h-9 w-full items-center justify-between rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                triggerClassName,
                triggerProps.className,
              )}
            />
          }
        >
          {renderTrigger ? (
            renderTrigger(selectedLabel, open)
          ) : (
            <>
              <span className="truncate">{selectedLabel}</span>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </>
          )}
        </ComboboxPrimitive.Trigger>
        <ComboboxPrimitive.Portal>
          <ComboboxPrimitive.Positioner sideOffset={4} align="start" className="isolate z-[1000]">
            <ComboboxPrimitive.Popup className="t-dropdown t-base-popup w-[var(--anchor-width)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
              <div className="flex items-center border-b bg-transparent px-2.5 py-1.5">
                <ComboboxPrimitive.Input
                  aria-label={t('searchableSelect.searchDatabase')}
                  placeholder={t('searchableSelect.searchDatabase')}
                  className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                />
              </div>
              <div className="max-h-[400px] overflow-y-auto p-1">
                {!inputValue && options.length > 8 && (
                  <div className="border-b py-2 text-center text-xs text-muted-foreground">
                    {t('searchableSelect.totalDatabases', {
                      count: options.length,
                    })}
                  </div>
                )}
                <ComboboxPrimitive.Empty className="py-6 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </ComboboxPrimitive.Empty>
                <ComboboxPrimitive.List>
                  {(option: SearchableSelectOption) => (
                    <ComboboxPrimitive.Item
                      key={option.value}
                      value={option}
                      disabled={option.disabled}
                      className={cn(
                        'relative flex w-full cursor-default select-none items-center rounded-md px-2.5 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground data-selected:bg-accent data-disabled:pointer-events-none data-disabled:opacity-50',
                      )}
                    >
                      {renderItem ? (
                        renderItem(option)
                      ) : (
                        <span className="font-medium">{option.label}</span>
                      )}
                    </ComboboxPrimitive.Item>
                  )}
                </ComboboxPrimitive.List>
              </div>
            </ComboboxPrimitive.Popup>
          </ComboboxPrimitive.Positioner>
        </ComboboxPrimitive.Portal>
      </ComboboxPrimitive.Root>
    );
  },
);
SearchableSelect.displayName = 'SearchableSelect';

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return <SelectPrimitive.Group className={cn('p-1', className)} {...props} />;
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value className={cn('flex flex-1 text-left', className)} {...props} />;
}

function SelectTrigger({ className, children, ...props }: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        't-ui-button flex h-9 w-full items-center justify-between rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={<ChevronDown className="pointer-events-none h-4 w-4 opacity-50" />}
      />
    </SelectPrimitive.Trigger>
  );
}

type SelectContentProps = SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    'align' | 'alignOffset' | 'side' | 'sideOffset' | 'alignItemWithTrigger'
  >;

function SelectContent({
  className,
  children,
  side = 'bottom',
  sideOffset = 4,
  align = 'center',
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: SelectContentProps) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-[1000]"
      >
        <SelectPrimitive.Popup
          data-align-trigger={alignItemWithTrigger}
          className={cn(
            't-dropdown t-base-popup relative max-h-[var(--available-height)] w-[var(--anchor-width)] min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md',
            className,
          )}
          {...props}
        >
          <SelectPrimitive.ScrollUpArrow className="sticky top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1">
            <ChevronUp className="h-4 w-4" />
          </SelectPrimitive.ScrollUpArrow>
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectPrimitive.ScrollDownArrow className="sticky bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1">
            <ChevronDown className="h-4 w-4" />
          </SelectPrimitive.ScrollDownArrow>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      className={cn('px-2 py-1.5 text-xs font-semibold text-muted-foreground', className)}
      {...props}
    />
  );
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'relative flex w-full cursor-default select-none items-center rounded-md py-1.5 pl-8 pr-2.5 text-sm outline-none transition-colors data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemIndicator
        render={<span className="absolute left-2.5 flex h-4 w-4 items-center justify-center" />}
      >
        <Check className="h-3.5 w-3.5" />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({ className, ...props }: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-muted', className)} {...props} />
  );
}

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SearchableSelect,
};
