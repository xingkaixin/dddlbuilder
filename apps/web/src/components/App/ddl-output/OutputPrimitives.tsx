import { lazy, Suspense, useCallback, useReducer, type CSSProperties } from 'react';
import type { DatabaseType } from '@ddlbuilder/shared-types';
import { Check, Copy, IconSwap } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DATABASE_OPTIONS } from '../databaseOptions';
import { useTimers } from '@/hooks/useTimers';
import { useToast } from '@/hooks/useToast';
import { useTranslation } from 'react-i18next';

const SqlCodeBlock = lazy(() =>
  import('../SqlCodeBlock').then((m) => ({ default: m.SqlCodeBlock })),
);

const CODE_FALLBACK_STYLE: CSSProperties = {
  fontFamily: '"Roboto Mono", monospace',
  fontSize: '0.775rem',
  whiteSpace: 'pre-wrap',
  background: 'transparent',
  margin: 0,
};

export function OutputCode({ code, activeLine }: { code: string; activeLine?: number }) {
  return (
    <div
      data-testid="ddl-output"
      className="relative flex-1 overflow-auto rounded-lg bg-muted py-2.5 pr-3"
    >
      <Suspense fallback={<pre style={CODE_FALLBACK_STYLE}>{code}</pre>}>
        <SqlCodeBlock code={code} activeLine={activeLine} />
      </Suspense>
    </div>
  );
}

export function DatabaseBadge({ dbType }: { dbType: DatabaseType }) {
  const option = DATABASE_OPTIONS.find((item) => item.value === dbType);
  const Icon = option?.icon;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {option?.label ?? dbType.toUpperCase()}
    </span>
  );
}

const copiedReducer = (_copied: boolean, event: 'copied' | 'expired') => event === 'copied';

export function CopyOutputButton({
  copy,
  label,
  tooltip,
}: {
  copy: () => Promise<boolean>;
  label: string;
  tooltip: string;
}) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [copied, dispatchCopied] = useReducer(copiedReducer, false);
  const { schedule, clearAll } = useTimers();

  const handleCopy = useCallback(async () => {
    if (!(await copy())) {
      showToast(t('ddlOutput.copyFailed'));

      return;
    }

    clearAll();
    dispatchCopied('copied');
    schedule(() => dispatchCopied('expired'), 3000);
  }, [clearAll, copy, schedule, showToast, t]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-8 gap-1.5 px-3"
          onClick={handleCopy}
        >
          <IconSwap state={copied}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </IconSwap>
          {copied ? t('ddlOutput.copied') : label}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function OutputHeading({
  title,
  description,
  dbType,
  actions,
}: {
  title: string;
  description: string;
  dbType?: DatabaseType;
  actions: React.ReactNode;
}) {
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-1 pb-2">
      <h2 className="sr-only">{title}</h2>
      <p className="sr-only">{description}</p>
      {dbType && (
        <span className="sr-only">
          <DatabaseBadge dbType={dbType} />
        </span>
      )}
      {actions}
    </div>
  );
}
