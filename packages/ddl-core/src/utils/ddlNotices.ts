// Comment lines the generators emit in place of SQL. The web app matches them to show the UI language.
export const DDL_NOTICES = {
  tableNameRequired: '-- 请填写表名',
  fieldsRequired: '-- 请补充字段信息',
  viewNameRequired: '-- 请填写视图名',
  viewSqlRequired: '-- 请填写视图 SQL',
  shardKeyRequired: '-- 请选择分片字段',
  routineNameRequired: '-- 请填写程序单元名称',
  triggerTableRequired: '-- 请填写触发表名',
  hiveRoutineUnsupported: '-- Hive 不支持通用存储过程、函数或触发器模板',
  sqliteRoutineUnsupported: '-- SQLite / D1 routine templates are not supported.',
  procedureBody: '-- 在这里编写过程逻辑',
  triggerBody: '-- 在这里编写触发器逻辑',
} as const;
