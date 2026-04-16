import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';

const FIELD_ROW_COUNT = 6;

export function MainWorkspaceSkeleton() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4 xl:flex-row" aria-busy="true">
      <output className="sr-only" aria-live="polite">
        {t('app.loadingWorkspace')}
      </output>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <section
            data-testid="main-skeleton-table-config"
            className="relative rounded-lg border bg-card/95 shadow-lg shadow-primary/5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/10 px-4 py-3.5">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary">
                {t('tableConfig.title')}
              </span>
              <span className="text-xs text-muted-foreground">{t('app.loadingWorkspace')}</span>
            </div>
            <div className="p-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">
                    {t('tableConfig.tableName')}
                  </p>
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">
                    {t('tableConfig.tableComment')}
                  </p>
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">{t('tableConfig.dbType')}</p>
                  <Skeleton className="h-10 w-full" />
                </div>
              </div>
            </div>
          </section>

          <section
            data-testid="main-skeleton-fields"
            className="relative min-h-[420px] rounded-lg border bg-card/95 shadow-lg shadow-primary/5"
          >
            <div className="border-b border-primary/10 p-2">
              <div className="grid grid-cols-4 gap-1 rounded-md bg-muted p-1 text-sm">
                <span className="rounded bg-background px-3 py-2 font-medium text-foreground">
                  {t('builderTabs.fields')}
                </span>
                <span className="rounded px-3 py-2 text-muted-foreground">
                  {t('builderTabs.indexes')}
                </span>
                <span className="rounded px-3 py-2 text-muted-foreground">
                  {t('builderTabs.auth')}
                </span>
                <span className="rounded px-3 py-2 text-muted-foreground">
                  {t('builderTabs.misc')}
                </span>
              </div>
            </div>

            <div className="border-b border-primary/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {t('dataTable.toolbar.freeze')}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t('dataTable.toolbar.addRows')}
                </span>
              </div>
            </div>

            <div className="p-4">
              <div className="overflow-hidden rounded-md border border-border/60">
                <div className="grid grid-cols-[48px_1.2fr_1.2fr_1.2fr_0.9fr_1fr_1fr_1fr_64px] gap-2 border-b border-border/60 bg-muted/30 px-2 py-2 text-xs text-muted-foreground">
                  <span>{t('dataTable.headers.order')}</span>
                  <span>{t('dataTable.headers.fieldName')}</span>
                  <span>{t('dataTable.headers.fieldComment')}</span>
                  <span>{t('dataTable.headers.fieldType')}</span>
                  <span>{t('dataTable.headers.nullable')}</span>
                  <span>{t('dataTable.headers.defaultKind')}</span>
                  <span>{t('dataTable.headers.defaultValue')}</span>
                  <span>{t('dataTable.headers.onUpdate')}</span>
                  <span />
                </div>

                {Array.from({ length: FIELD_ROW_COUNT }).map((_, index) => (
                  <div
                    key={`main-workspace-skeleton-row-${index + 1}`}
                    className="grid grid-cols-[48px_1.2fr_1.2fr_1.2fr_0.9fr_1fr_1fr_1fr_64px] gap-2 border-b border-border/30 px-2 py-2 last:border-b-0"
                  >
                    <Skeleton className="h-6 w-8" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-10" />
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>

      <section
        data-testid="main-skeleton-ddl-output"
        className="relative flex w-full flex-col rounded-lg border bg-card/95 shadow-lg shadow-primary/5 xl:w-[34rem] xl:shrink-0 2xl:w-[38rem]"
      >
        <div className="border-b border-primary/10 p-4">
          <div className="grid w-full grid-cols-2 gap-1 rounded-md bg-muted p-1 text-sm">
            <span className="rounded bg-background px-3 py-2 font-medium text-foreground">
              {t('ddlOutput.ddlTab')}
            </span>
            <span className="rounded px-3 py-2 text-muted-foreground">{t('ddlOutput.dclTab')}</span>
          </div>
        </div>

        <div className="border-b border-primary/10 px-4 py-3.5">
          <p className="text-xl font-bold">{t('ddlOutput.ddlTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('ddlOutput.ddlDesc')}</p>
        </div>

        <div className="flex-1 space-y-2 p-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-10/12" />
          <Skeleton className="h-4 w-4/6" />
          <Skeleton className="h-4 w-9/12" />
          <Skeleton className="h-4 w-3/6" />
        </div>
      </section>
    </div>
  );
}
