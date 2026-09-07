import { memo } from 'react';
import type { DatabaseType, SqlFormatMode } from '@ddlbuilder/shared-types';
import type {
  DDLReviewResult,
  DDLReviewStructuredSuggestion,
} from '@ddlbuilder/shared-types/ddl-review';
import type { ORMTarget } from '@ddlbuilder/ddl-core';
import type { PartialReviewResult } from '@/utils/parsePartialJson';
import type { SchemaLintIssue } from '@/utils/schemaLint';
import { Code, Maximize, X, ScrollText, ShieldCheck, Workflow } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from 'react-i18next';
import { DclOutputPanel } from './ddl-output/DclOutputPanel';
import { DdlOutputPanel } from './ddl-output/DdlOutputPanel';
import { OrmOutputPanel } from './ddl-output/OrmOutputPanel';
import { RoutineOutputPanel } from './ddl-output/RoutineOutputPanel';

interface DDLOutputProps {
  generatedSql: string;
  generatedDcl: string;
  dbType: DatabaseType;
  routineTableNameDefault?: string;
  sqlFormatMode: SqlFormatMode;
  onSqlFormatModeChange: (mode: SqlFormatMode) => void;
  onCopySql: () => Promise<boolean>;
  onCopyDcl: () => Promise<boolean>;
  generatedOrm: string;
  ormTarget: ORMTarget;
  onOrmTargetChange: (target: ORMTarget) => void;
  onCopyOrm: () => Promise<boolean>;
  isReviewing: boolean;
  reviewPartialResult: PartialReviewResult | null;
  reviewResult: DDLReviewResult | null;
  reviewError: string | null;
  schemaLintIssues: SchemaLintIssue[];
  onStartReview: () => void;
  onViewReviewHistory?: () => void;
  onApplySuggestion?: (suggestion: DDLReviewStructuredSuggestion) => void;
  onCollapsePanel?: () => void;
  onMaximizePanel?: () => void;
}

export const DDLOutput = memo<DDLOutputProps>((props) => {
  const { t } = useTranslation();
  const tabs = [
    { value: 'ddl', label: t('ddlOutput.ddlTab'), icon: ScrollText },
    { value: 'dcl', label: t('ddlOutput.dclTab'), icon: ShieldCheck },
    { value: 'orm', label: t('ddlOutput.ormTab'), icon: Code },
    { value: 'routine', label: t('ddlOutput.routineTab'), icon: Workflow },
  ] as const;

  return (
    <div className="relative flex w-full min-w-0 flex-col bg-background">
      <Tabs defaultValue="ddl" className="relative flex flex-col">
        <div className="sticky top-0 z-10 border-b bg-background px-4 py-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            {props.onMaximizePanel && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={props.onMaximizePanel}
                aria-label={t('editorLayout.maximize')}
              >
                <Maximize className="h-4 w-4" />
              </Button>
            )}
            {props.onCollapsePanel && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={props.onCollapsePanel}
                    aria-label={t('ddlOutput.collapsePanel')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('ddlOutput.collapsePanel')}</p>
                </TooltipContent>
              </Tooltip>
            )}
            <TabsList className="grid h-9 flex-1 grid-cols-4 bg-transparent p-0">
              {tabs.map(({ value, label, icon: Icon }) => (
                <TabsTrigger key={value} value={value} className="w-full gap-2">
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>
        <TabsContent value="ddl" className="mt-0">
          <DdlOutputPanel
            code={props.generatedSql}
            dbType={props.dbType}
            formatMode={props.sqlFormatMode}
            onFormatModeChange={props.onSqlFormatModeChange}
            onCopy={props.onCopySql}
            isReviewing={props.isReviewing}
            reviewPartialResult={props.reviewPartialResult}
            reviewResult={props.reviewResult}
            reviewError={props.reviewError}
            schemaLintIssues={props.schemaLintIssues}
            onStartReview={props.onStartReview}
            onViewReviewHistory={props.onViewReviewHistory}
            onApplySuggestion={props.onApplySuggestion}
          />
        </TabsContent>
        <TabsContent value="dcl" className="mt-0">
          <DclOutputPanel
            code={props.generatedDcl}
            dbType={props.dbType}
            onCopy={props.onCopyDcl}
          />
        </TabsContent>
        <TabsContent value="orm" className="mt-0">
          <OrmOutputPanel
            code={props.generatedOrm}
            target={props.ormTarget}
            onTargetChange={props.onOrmTargetChange}
            onCopy={props.onCopyOrm}
          />
        </TabsContent>
        <TabsContent value="routine" className="mt-0">
          <RoutineOutputPanel
            dbType={props.dbType}
            tableNameDefault={props.routineTableNameDefault}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
});
