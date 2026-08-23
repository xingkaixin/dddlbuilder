import { useCallback, useMemo, useState } from 'react';
import type { DatabaseType, RoutineTemplateKind } from '@ddlbuilder/shared-types';
import { buildRoutineTemplateDDL } from '@ddlbuilder/ddl-core';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from 'react-i18next';
import { CopyOutputButton, OutputCode, OutputHeading } from './OutputPrimitives';

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      return copied;
    } catch {
      return false;
    }
  }
};

export function RoutineOutputPanel({
  dbType,
  tableNameDefault,
}: {
  dbType: DatabaseType;
  tableNameDefault?: string;
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<RoutineTemplateKind>('updated_at_trigger');
  const [name, setName] = useState('trg_set_updated_at');
  const [tableName, setTableName] = useState('');
  const [parameters, setParameters] = useState('');
  const [returnType, setReturnType] = useState('INTEGER');
  const [timestampColumn, setTimestampColumn] = useState('updated_at');
  const [auditTableName, setAuditTableName] = useState('');
  const [body, setBody] = useState('');
  const resolvedTableName = tableName || tableNameDefault || '';
  const code = useMemo(
    () =>
      buildRoutineTemplateDDL(dbType, {
        kind,
        routineName: name,
        tableName: resolvedTableName,
        parameters,
        returnType,
        body,
        timestampColumn,
        auditTableName,
      }),
    [
      auditTableName,
      body,
      dbType,
      kind,
      name,
      parameters,
      resolvedTableName,
      returnType,
      timestampColumn,
    ],
  );
  const handleCopy = useCallback(() => copyText(code), [code]);

  return (
    <div className="relative flex flex-col">
      <OutputHeading
        title={t('ddlOutput.routineTitle')}
        description={t('ddlOutput.routineDesc')}
        dbType={dbType}
        actions={
          <CopyOutputButton
            copy={handleCopy}
            label={t('ddlOutput.copyRoutine')}
            tooltip={t('ddlOutput.copyRoutineTip')}
          />
        }
      />
      <div className="grid gap-4 border-b border-primary/10 px-4 py-3.5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="routine-kind">{t('ddlOutput.routineKind')}</Label>
          <SearchableSelect
            id="routine-kind"
            value={kind}
            onValueChange={(value) => setKind(value as RoutineTemplateKind)}
            options={[
              { value: 'updated_at_trigger', label: t('ddlOutput.routineKinds.updatedAt') },
              { value: 'audit_trigger', label: t('ddlOutput.routineKinds.audit') },
              { value: 'procedure', label: t('ddlOutput.routineKinds.procedure') },
              { value: 'function', label: t('ddlOutput.routineKinds.function') },
              { value: 'custom_trigger', label: t('ddlOutput.routineKinds.trigger') },
            ]}
            triggerClassName="h-9 rounded-md px-3 py-2 text-sm"
            emptyMessage={t('searchableSelect.empty')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="routine-name">{t('ddlOutput.routineName')}</Label>
          <Input
            id="routine-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('ddlOutput.routineNamePlaceholder')}
          />
        </div>
        {kind !== 'procedure' && kind !== 'function' ? (
          <div className="space-y-2">
            <Label htmlFor="routine-table">{t('ddlOutput.routineTable')}</Label>
            <Input
              id="routine-table"
              value={resolvedTableName}
              onChange={(event) => setTableName(event.target.value)}
              placeholder={t('ddlOutput.routineTablePlaceholder')}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="routine-parameters">{t('ddlOutput.routineParameters')}</Label>
            <Input
              id="routine-parameters"
              value={parameters}
              onChange={(event) => setParameters(event.target.value)}
              placeholder={t('ddlOutput.routineParametersPlaceholder')}
            />
          </div>
        )}
        {kind === 'function' && (
          <div className="space-y-2">
            <Label htmlFor="routine-return-type">{t('ddlOutput.routineReturnType')}</Label>
            <Input
              id="routine-return-type"
              value={returnType}
              onChange={(event) => setReturnType(event.target.value)}
              placeholder={t('ddlOutput.routineReturnTypePlaceholder')}
            />
          </div>
        )}
        {kind === 'updated_at_trigger' && (
          <div className="space-y-2">
            <Label htmlFor="routine-timestamp-column">
              {t('ddlOutput.routineTimestampColumn')}
            </Label>
            <Input
              id="routine-timestamp-column"
              value={timestampColumn}
              onChange={(event) => setTimestampColumn(event.target.value)}
              placeholder={t('ddlOutput.routineTimestampColumnPlaceholder')}
            />
          </div>
        )}
        {kind === 'audit_trigger' && (
          <div className="space-y-2">
            <Label htmlFor="routine-audit-table">{t('ddlOutput.routineAuditTable')}</Label>
            <Input
              id="routine-audit-table"
              value={auditTableName}
              onChange={(event) => setAuditTableName(event.target.value)}
              placeholder={t('ddlOutput.routineAuditTablePlaceholder')}
            />
          </div>
        )}
        {(kind === 'procedure' || kind === 'function' || kind === 'custom_trigger') && (
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="routine-body">{t('ddlOutput.routineBody')}</Label>
            <Textarea
              id="routine-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={t('ddlOutput.routineBodyPlaceholder')}
              className="min-h-24 font-mono text-sm"
            />
          </div>
        )}
      </div>
      <OutputCode code={code} />
    </div>
  );
}
