export const YES_VALUES = new Set(['y', 'yes', 'true', '1', '是', '√']);

// default helpers
export const DEFAULT_KIND_OPTIONS = [
  '无',
  '自增',
  '常量',
  '当前时间',
  'uuid',
] as const;

export const ON_UPDATE_OPTIONS = ['无', '当前时间'] as const;

export const COLUMN_HEADERS = [
  '序号',
  '字段名',
  '字段中文名',
  '字段类型',
  '是否为空',
  '默认类型',
  '默认值',
  '更新策略',
];

export const STORAGE_KEY = 'ddlbuilder:state:v1';
