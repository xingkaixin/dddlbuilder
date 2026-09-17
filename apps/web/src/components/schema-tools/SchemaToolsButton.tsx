import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { getWorkspaceScopeStorageKey } from '@/utils/workspaceScope';

const SchemaToolsDialog = lazy(() => import('./SchemaToolsDialog'));

export function SchemaToolsButton() {
  const { t } = useTranslation();
  const scope = useWorkspaceScope();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <BookOpen className="h-4 w-4" aria-hidden />
        {t('schemaTools.title')}
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
