import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { DatabaseType } from '@ddlbuilder/shared-types';
import { Check, Copy } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DATABASE_OPTIONS } from '@/utils/constants';
import { useToast } from '@/hooks/useToast';
import { useTranslation } from 'react-i18next';

const SqlCodeBlock = lazy(() => import('../SqlCodeBlock'));

const CODE_FALLBACK_STYLE: CSSProperties = {
  fontFamily: '"Roboto Mono", monospace',
  fontSize: '0.775rem',
  whiteSpace: 'pre-wrap',
  background: 'transparent',
  margin: 0,
};

export function OutputCode({ code }: { code: string }) {
  return (
    <div className="relative flex-1 overflow-auto px-4 py-3.5">
      <Suspense fallback={<pre style={CODE_FALLBACK_STYLE}>{code}</pre>}>
        <SqlCodeBlock code={code} />
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
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const handleCopy = useCallback(async () => {
    if (!(await copy())) {
      showToast(t('ddlOutput.copyFailed'));
      return;
    }
    window.clearTimeout(timerRef.current);
    setCopied(true);
    timerRef.current = window.setTimeout(() => setCopied(false), 3000);
  }, [copy, showToast, t]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs font-medium transition-all duration-200 hover:scale-105 hover:shadow-md"
          onClick={handleCopy}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
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
    <div className="border-b border-primary/10 px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <h2 className="bg-linear-to-r from-foreground to-primary bg-clip-text text-xl font-bold text-transparent">
              {title}
            </h2>
            {dbType && (
              <span className="transition-transform duration-200 hover:scale-105">
                <DatabaseBadge dbType={dbType} />
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
      </div>
    </div>
  );
}
