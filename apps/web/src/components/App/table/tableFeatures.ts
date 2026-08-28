import {
  columnSizingFeature,
  tableFeatures,
  metaHelper,
  type ColumnDef,
  type Row,
} from '@tanstack/react-table';
import type { FieldRow } from '@ddlbuilder/shared-types';

// v9 要求显式声明启用的特性，字段表只用到核心行模型和列宽
export const fieldTableFeatures = tableFeatures({
  columnSizingFeature,
  columnMeta: metaHelper<{ editable?: 'text' | 'control' }>(),
});

export type FieldTableFeatures = typeof fieldTableFeatures;
export type FieldTableRow = Row<FieldTableFeatures, FieldRow>;
// 各列的单元格类型不同，列定义数组只能放开取值类型
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FieldTableColumnDef = ColumnDef<FieldTableFeatures, FieldRow, any>;
