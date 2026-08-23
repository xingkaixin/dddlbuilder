import { memo } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, ShieldCheck } from '@/components/icons';
import type { SchemaLintIssue, SchemaLintSeverity } from '@/utils/schemaLint';
import { useTranslation } from 'react-i18next';

interface SchemaLintPanelProps {
  issues: SchemaLintIssue[];
}

const severityOrder: Record<SchemaLintSeverity, number> = {
  error: 0,
  warning: 1,
  suggestion: 2,
};

const severityIcon = {
  error: AlertCircle,
  warning: AlertTriangle,
  suggestion: Info,
} satisfies Record<SchemaLintSeverity, typeof AlertCircle>;

const severityClassName = {
  error: 'text-red-600 bg-red-50 border-red-100 dark:bg-red-950/30 dark:border-red-900',
  warning: 'text-amber-600 bg-amber-50 border-amber-100 dark:bg-amber-950/30 dark:border-amber-900',
  suggestion: 'text-blue-600 bg-blue-50 border-blue-100 dark:bg-blue-950/30 dark:border-blue-900',
} satisfies Record<SchemaLintSeverity, string>;

const severityBadgeKey = {
  error: 'schemaLint.error',
  warning: 'schemaLint.warning',
  suggestion: 'schemaLint.suggestion',
} satisfies Record<SchemaLintSeverity, string>;

export const SchemaLintPanel = memo<SchemaLintPanelProps>(({ issues }) => {
  const { t } = useTranslation();
  const sortedIssues = issues
    .slice()
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return (
    <div className="mt-4 rounded-lg border border-border/70 bg-card/50 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span>{t('schemaLint.title')}</span>
        </div>
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {issues.length === 0
            ? t('schemaLint.pass')
            : t('schemaLint.issueCount', { count: issues.length })}
        </span>
      </div>

      {sortedIssues.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-emerald-600">
          <CheckCircle2 className="h-4 w-4" />
          <span>{t('schemaLint.empty')}</span>
        </div>
      ) : (
        <ul className="space-y-2">
          {sortedIssues.map((issue) => {
            const Icon = severityIcon[issue.severity];
            const translationParams = { target: issue.target, ...issue.params };
            const ruleKey = `schemaLint.rules.${issue.ruleId}`;
            return (
              <li
                key={issue.id}
                className="rounded-md border border-border/60 bg-background/70 p-3"
              >
                <div className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${severityClassName[issue.severity]}`}
                      >
                        {t(severityBadgeKey[issue.severity])}
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {t(`${ruleKey}.title`, translationParams)}
                      </span>
                      <span className="max-w-full truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {issue.target}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {t(`${ruleKey}.reason`, translationParams)}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-foreground/75">
                      {t(`${ruleKey}.suggestion`, translationParams)}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});

SchemaLintPanel.displayName = 'SchemaLintPanel';
