import {
  validateBusinessData,
  type BusinessData,
  type DataImportColumn,
  type DataImportOptions,
  type DataImportResult,
  type DataImportTarget,
} from '@ddlbuilder/ddl-core';
import {
  BUSINESS_EXCEL_BYTES,
  BUSINESS_TEXT_BYTES,
  readBusinessExcel,
  readBusinessText,
  type BusinessDataSource,
  type BusinessSeparator,
} from './readBusinessData';

export type BusinessDataTask =
  | { kind: 'text'; text: string; separator: BusinessSeparator }
  | { kind: 'file'; file: File; sheet: string; separator: BusinessSeparator }
  | {
      kind: 'validate';
      data: BusinessData;
      target: DataImportTarget;
      columns: DataImportColumn[];
      options: DataImportOptions;
      createTable: boolean;
    };

export type BusinessDataTaskResult = { source: BusinessDataSource } | { result: DataImportResult };

export type BusinessDataReply = { output: BusinessDataTaskResult } | { error: string };

export async function executeBusinessDataTask(
  task: BusinessDataTask,
): Promise<BusinessDataTaskResult> {
  if (task.kind === 'validate')
    return {
      result: validateBusinessData(
        task.data,
        task.target,
        task.columns,
        task.options,
        task.createTable,
      ),
    };
  if (task.kind === 'text')
    return { source: { data: readBusinessText(task.text, task.separator), sheets: [], sheet: '' } };
  const isExcel = /\.xlsx$/i.test(task.file.name);

  if (!isExcel && !/\.(csv|tsv|txt)$/i.test(task.file.name))
    throw new Error('dataImport.errors.file');

  if (task.file.size > (isExcel ? BUSINESS_EXCEL_BYTES : BUSINESS_TEXT_BYTES))
    throw new Error('dataImport.errors.limits');
  const bytes = await task.file.arrayBuffer();

  if (isExcel) return { source: await readBusinessExcel(bytes, task.sheet) };
  let text: string;

  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('dataImport.errors.encoding');
  }

  return { source: { data: readBusinessText(text, task.separator), sheets: [], sheet: '' } };
}
