export type DatabaseType = "mysql" | "postgresql" | "sqlserver" | "oracle";

export type FieldRow = {
  order: number;
  fieldName: string;
  fieldType: string;
  fieldComment: string;
  nullable: string;
  defaultKind?: string;
  defaultValue?: string;
  onUpdate?: string;
};

export type NormalizedField = {
  name: string;
  type: string;
  comment: string;
  nullable: boolean;
  defaultKind:
    | "none"
    | "auto_increment"
    | "constant"
    | "current_timestamp"
    | "uuid";
  defaultValue: string;
  onUpdate: "none" | "current_timestamp";
};

export type IndexField = {
  name: string;
  direction: "ASC" | "DESC";
};

export type IndexDefinition = {
  id: string;
  name: string;
  fields: IndexField[];
  unique: boolean;
  isPrimary?: boolean;
};

export type ParsedFieldType = {
  baseType: string;
  args: string[];
  unsigned: boolean;
  raw: string;
};

export type UiDefaultKind = "无" | "自增" | "常量" | "当前时间" | "uuid";
export type UiOnUpdate = "无" | "当前时间";

export type PersistedState = {
  tableName: string;
  tableComment: string;
  dbType: DatabaseType;
  rows: FieldRow[];
  addCount: number;
  indexInput: string;
  currentIndexFields: IndexField[];
  indexes: IndexDefinition[];
  authInput: string;
  authObjects: string[];
};