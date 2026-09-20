import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { getWorkspaceScopeStorageKey } from '@/utils/workspaceScope';

const SchemaToolsDialog = lazy(() => import('./SchemaToolsDialog'));

export function SchemaToolsButton({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const scope = useWorkspaceScope();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={compact ? 'px-2.5 sm:px-4' : undefined}
        onClick={() => setOpen(true)}
      >
        <BookOpen className="h-4 w-4" aria-hidden />
        <span className={compact ? 'sr-only sm:not-sr-only' : undefined}>
          {t('schemaTools.title')}
        </span>
      </Button>
      {open && (
        <Suspense fallback={<span role="status">{t('schemaTools.loading')}</span>}>
          <SchemaToolsDialog
            key={scope ? getWorkspaceScopeStorageKey(scope) : 'loading'}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}
