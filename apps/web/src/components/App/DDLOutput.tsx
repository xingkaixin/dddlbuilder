import { memo } from 'react';
import type { DatabaseType, SqlFormatMode } from '@ddlbuilder/shared-types';
import type {
  DDLReviewResult,
  DDLReviewStructuredSuggestion,
} from '@ddlbuilder/shared-types/ddl-review';
import type { ORMTarget } from '@ddlbuilder/ddl-core';
import type { PartialReviewResult } from '@/utils/parsePartialJson';
import type { SchemaLintIssue } from '@/utils/schemaLint';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  generateOrm: () => string;
  ormTarget: ORMTarget;
  onOrmTargetChange: (target: ORMTarget) => void;
  onCopyOrm: () => Promise<boolean>;
  isReviewing: boolean;
  reviewThinking?: string;
  reviewPartialResult: PartialReviewResult | null;
  reviewResult: DDLReviewResult | null;
  reviewError: string | null;
  schemaLintIssues: SchemaLintIssue[];
  onStartReview: () => void;
  onViewReviewHistory?: () => void;
  onApplySuggestion?: (suggestion: DDLReviewStructuredSuggestion) => void;
}

export const DDLOutput = memo<DDLOutputProps>((props) => {
  const { t } = useTranslation();

  const tabs = [
    { value: 'ddl', label: t('ddlOutput.ddlTab') },
    { value: 'dcl', label: t('ddlOutput.dclTab') },
    { value: 'orm', label: t('ddlOutput.ormTab') },
    { value: 'routine', label: t('ddlOutput.routineTab') },
  ] as const;

  return (
    <div className="relative flex w-full min-w-0 flex-col bg-background">
      <Tabs key={props.dbType} defaultValue="ddl" className="relative flex flex-col">
        <div className="sticky top-0 z-10 bg-background pb-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <TabsList className="min-w-0 max-w-full justify-start overflow-x-auto p-0">
              {tabs.flatMap(({ value, label }) =>
                props.dbType === 'sqlite' && (value === 'dcl' || value === 'routine')
                  ? []
                  : [
                      <TabsTrigger key={value} value={value} className="h-9 shrink-0">
                        <span>{label}</span>
                      </TabsTrigger>,
                    ],
              )}
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
            reviewThinking={props.reviewThinking}
            reviewResult={props.reviewResult}
            reviewError={props.reviewError}
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
            dbType={props.dbType}
            generateCode={props.generateOrm}
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
