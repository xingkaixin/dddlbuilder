import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Check, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

interface SearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
  triggerClassName?: string;
  renderTrigger?: (value: string, isOpen: boolean) => React.ReactNode;
  renderItem?: (option: { value: string; label: string }) => React.ReactNode;
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
    const [searchValue, setSearchValue] = React.useState('');
    const inputRef = React.useRef<HTMLInputElement>(null);

    const filteredOptions = React.useMemo(() => {
      if (!searchValue) return options;
      const lowerSearch = searchValue.toLowerCase();
      return options.filter((opt) => opt.label.toLowerCase().includes(lowerSearch));
    }, [options, searchValue]);

    const selectedOption = options.find((opt) => opt.value === value);
    const selectedLabel = selectedOption?.label || placeholder;

    const handleSelect = (selectedValue: string) => {
      onValueChange(selectedValue);
      setOpen(false);
      setSearchValue('');
    };

    React.useEffect(() => {
      if (open && inputRef.current) {
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    }, [open]);

    return (
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          <button
            ref={ref}
            type="button"
            {...triggerProps}
            className={cn(
              't-ui-button flex h-9 w-full items-center justify-between rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
              triggerClassName,
              triggerProps?.className,
            )}
          >
            {renderTrigger ? (
              renderTrigger(selectedLabel, open)
            ) : (
              <>
                <span className="truncate">{selectedLabel}</span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </>
            )}
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            className="t-dropdown t-radix-dropdown z-[1000] w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
            sideOffset={4}
            align="start"
          >
            <div className="flex items-center border-b bg-transparent px-2.5 py-1.5">
              <input
                ref={inputRef}
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder={t('searchableSelect.searchDatabase')}
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setOpen(false);
                  }
                }}
              />
            </div>
            <div className="max-h-[400px] overflow-y-auto p-1">
              {filteredOptions.length > 0 && !searchValue && options.length > 8 && (
                <div className="border-b py-2 text-center text-xs text-muted-foreground">
                  {t('searchableSelect.totalDatabases', {
                    count: options.length,
                  })}
                </div>
              )}
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <div
                    key={option.value}
                    role="option"
                    aria-selected={value === option.value}
                    tabIndex={0}
                    className={cn(
                      'relative flex w-full cursor-default select-none items-center rounded-md px-2.5 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
                      value === option.value && 'bg-accent',
                      option.disabled && 'opacity-50 cursor-not-allowed',
                    )}
                    onClick={() => {
                      if (!option.disabled) {
                        handleSelect(option.value);
                      }
                    }}
                  >
                    {renderItem ? (
                      renderItem(option)
                    ) : (
                      <span className="font-medium">{option.label}</span>
                    )}
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</div>
              )}
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    );
  },
);
SearchableSelect.displayName = 'SearchableSelect';

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      't-ui-button flex h-9 w-full items-center justify-between rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        't-dropdown t-radix-dropdown relative z-[1000] min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md',
        className,
      )}
      position={position}
      {...props}
    >
      <SelectPrimitive.Viewport
        className={cn(
          'p-1',
          position === 'popper' &&
            'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]',
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn('px-2 py-1.5 text-xs font-semibold text-muted-foreground', className)}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-default select-none items-center rounded-md py-1.5 pl-8 pr-2.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <span className="absolute left-2.5 flex h-4 w-4 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-3.5 w-3.5" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-muted', className)}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

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
