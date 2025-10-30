import type {
  DatabaseType,
  NormalizedField,
  IndexDefinition,
} from "../types";
import { DDLStrategyFactory } from "../factories/DDLStrategyFactory";

export const buildDDL = (
  dbType: DatabaseType,
  tableName: string,
  tableComment: string,
  fields: NormalizedField[],
  indexes: IndexDefinition[] = []
) => {
  if (!tableName.trim()) {
    return "-- 请填写表名";
  }
  if (fields.length === 0) {
    return "-- 请补充字段信息";
  }

  const strategy = DDLStrategyFactory.create(dbType);
  const tableDDL = strategy.generateTableDDL(tableName.trim(), tableComment, fields);

  // Build index DDL statements
  const indexDDLs = indexes.map((index) =>
    strategy.generateIndexDDL(tableName.trim(), index, fields)
  );

  return indexDDLs.length > 0
    ? `${tableDDL}\n\n${indexDDLs.join("\n")}`
    : tableDDL;
};

export const buildDCL = (
  dbType: DatabaseType,
  tableName: string,
  authorizationObjects: string[]
) => {
  if (!tableName.trim() || authorizationObjects.length === 0) {
    return "";
  }

  const cleanTableName = tableName.trim();
  const statements: string[] = [];

  switch (dbType) {
    case "oracle":
      authorizationObjects.forEach((authObject) => {
        statements.push(
          `GRANT SELECT ON ${cleanTableName} TO ${authObject.trim()};`
        );
      });
      break;
    default:
      authorizationObjects.forEach((authObject) => {
        statements.push(
          `GRANT SELECT ON ${cleanTableName} TO ${authObject.trim()};`
        );
      });
      break;
  }

  return statements.join("\n");
};

export const buildOracleSynonyms = (tableName: string) => {
  const cleanTableName = tableName.trim();
  if (!cleanTableName) return "";

  return `CREATE OR REPLACE PUBLIC SYNONYM ${cleanTableName} FOR ${cleanTableName};`;
};
