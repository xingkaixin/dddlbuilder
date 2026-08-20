import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface NamePromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idPrefix: string;
  title: string;
  description: string;
  label: string;
  placeholder: string;
  value: string;
  onValueChange: (value: string) => void;
  error: string;
  /** 非空表示输入框被锁定，并把该文案作为原因提示展示。 */
  disabledHint?: string | null;
  cancelLabel: string;
  confirmLabel: string;
  confirmDisabled?: boolean;
  onConfirm: () => void;
}

export function NamePromptDialog({
  open,
  onOpenChange,
  idPrefix,
  title,
  description,
  label,
  placeholder,
  value,
  onValueChange,
  error,
  disabledHint,
  cancelLabel,
  confirmLabel,
  confirmDisabled,
  onConfirm,
}: NamePromptDialogProps) {
  const errorRef = useRef<HTMLParagraphElement>(null);
  const inputId = `${idPrefix}-name`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  useEffect(() => {
    if (open && error) {
      const timer = window.setTimeout(() => {
        errorRef.current?.focus();
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [open, error]);

  const describedBy = [disabledHint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label htmlFor={inputId}>{label}</Label>
          <Input
            id={inputId}
            value={value}
            onChange={(event) => {
              onValueChange(event.target.value);
            }}
            placeholder={placeholder}
            disabled={Boolean(disabledHint)}
            aria-describedby={describedBy || undefined}
          />
          {disabledHint && (
            <p id={hintId} className="text-xs text-muted-foreground">
              {disabledHint}
            </p>
          )}
          {error && (
            <p
              id={errorId}
              ref={errorRef}
              tabIndex={-1}
              role="alert"
              aria-live="assertive"
              className="text-xs text-destructive"
            >
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button onClick={onConfirm} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
