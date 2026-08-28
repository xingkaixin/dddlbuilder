import { useAIRequestAccess } from '@/hooks/useAIRequestAccess';
import { cn } from '@/lib/utils';

export function AIAccessNotice({ className }: { className?: string }) {
  const { accessError } = useAIRequestAccess();
  if (!accessError) return null;
  return (
    <div
      className={cn(
        'rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800',
        className,
      )}
    >
      {accessError}
    </div>
  );
}
