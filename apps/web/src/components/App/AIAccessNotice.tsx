import { useAIRequestAccess } from '@/hooks/useAIRequestAccess';
import { Notice } from '@/components/ui/notice';

export function AIAccessNotice({ className }: { className?: string }) {
  const { accessError } = useAIRequestAccess();

  if (!accessError) return null;

  return (
    <Notice tone="warning" className={className}>
      {accessError}
    </Notice>
  );
}
