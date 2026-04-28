import type { DatabaseType, RoutineTemplateConfig } from '@ddlbuilder/shared-types';
import { DDLStrategyFactory } from '../factories/DDLStrategyFactory';

const MYSQL_FAMILY: DatabaseType[] = ['mysql', 'mariadb', 'tidb', 'oceanbase', 'gbase', 'polardb'];
const POSTGRES_FAMILY: DatabaseType[] = ['postgresql', 'postgresql-citus', 'kingbase', 'gaussdb'];
const ORACLE_FAMILY: DatabaseType[] = ['oracle', 'dm', 'oceanbase-oracle'];

const cleanSqlBody = (body: string | undefined, fallback: string) =>
  (body?.trim() || fallback).replace(/;+\s*$/, '');

const cleanName = (value: string | undefined) => value?.trim() || '';

export function buildRoutineTemplateDDL(dbType: DatabaseType, config: RoutineTemplateConfig) {
  const tableName = cleanName(config.tableName);
  const routineName = cleanName(config.routineName);

  if (dbType === 'hive') {
    return '-- Hive 不支持通用存储过程、函数或触发器模板';
  }
  if (!routineName) {
    return '-- 请填写程序单元名称';
  }

  switch (config.kind) {
    case 'procedure':
      return buildProcedureDDL(dbType, routineName, config);
    case 'function':
      return buildFunctionDDL(dbType, routineName, config);
    case 'updated_at_trigger':
      if (!tableName) return '-- 请填写触发表名';
      return buildUpdatedAtTriggerDDL(dbType, routineName, tableName, config.timestampColumn);
    case 'audit_trigger':
      if (!tableName) return '-- 请填写触发表名';
      return buildAuditTriggerDDL(dbType, routineName, tableName, config.auditTableName);
    case 'custom_trigger':
      if (!tableName) return '-- 请填写触发表名';
      return buildCustomTriggerDDL(dbType, routineName, tableName, config.body);
  }
}

function buildProcedureDDL(
  dbType: DatabaseType,
  routineName: string,
  config: RoutineTemplateConfig,
) {
  const params = cleanName(config.parameters);
  const body = cleanSqlBody(config.body, '-- 在这里编写过程逻辑');

  if (MYSQL_FAMILY.includes(dbType)) {
    return `DELIMITER //\nCREATE PROCEDURE ${routineName}(${params})\nBEGIN\n  ${body}\nEND//\nDELIMITER ;`;
  }
  if (POSTGRES_FAMILY.includes(dbType)) {
    return `CREATE OR REPLACE PROCEDURE ${routineName}(${params})\nLANGUAGE plpgsql\nAS $$\nBEGIN\n  ${body};\nEND;\n$$;`;
  }
  if (dbType === 'sqlserver') {
    return `CREATE OR ALTER PROCEDURE ${routineName}${params ? `\n  ${params}` : ''}\nAS\nBEGIN\n  ${body};\nEND;`;
  }
  if (ORACLE_FAMILY.includes(dbType)) {
    return `CREATE OR REPLACE PROCEDURE ${routineName}${params ? `(${params})` : ''}\nAS\nBEGIN\n  ${body};\nEND;\n/`;
  }

  return `CREATE PROCEDURE ${routineName}(${params})\nBEGIN\n  ${body};\nEND;`;
}

function buildFunctionDDL(
  dbType: DatabaseType,
  routineName: string,
  config: RoutineTemplateConfig,
) {
  const params = cleanName(config.parameters);
  const returnType = cleanName(config.returnType) || 'INTEGER';
  const body = cleanSqlBody(config.body, 'RETURN 1');

  if (MYSQL_FAMILY.includes(dbType)) {
    return `DELIMITER //\nCREATE FUNCTION ${routineName}(${params})\nRETURNS ${returnType}\nDETERMINISTIC\nBEGIN\n  ${body};\nEND//\nDELIMITER ;`;
  }
  if (POSTGRES_FAMILY.includes(dbType)) {
    return `CREATE OR REPLACE FUNCTION ${routineName}(${params})\nRETURNS ${returnType}\nLANGUAGE plpgsql\nAS $$\nBEGIN\n  ${body};\nEND;\n$$;`;
  }
  if (dbType === 'sqlserver') {
    return `CREATE OR ALTER FUNCTION ${routineName}(${params})\nRETURNS ${returnType}\nAS\nBEGIN\n  ${body};\nEND;`;
  }
  if (ORACLE_FAMILY.includes(dbType)) {
    return `CREATE OR REPLACE FUNCTION ${routineName}${params ? `(${params})` : ''}\nRETURN ${returnType}\nAS\nBEGIN\n  ${body};\nEND;\n/`;
  }

  return `CREATE FUNCTION ${routineName}(${params}) RETURNS ${returnType}\nBEGIN\n  ${body};\nEND;`;
}

function buildUpdatedAtTriggerDDL(
  dbType: DatabaseType,
  routineName: string,
  tableName: string,
  timestampColumn = 'updated_at',
) {
  const strategy = DDLStrategyFactory.create(dbType);
  const table = strategy.formatTableName(tableName);
  const column = strategy.formatFieldName(cleanName(timestampColumn) || 'updated_at');

  if (MYSQL_FAMILY.includes(dbType)) {
    return `DELIMITER //\nCREATE TRIGGER ${routineName}\nBEFORE UPDATE ON ${table}\nFOR EACH ROW\nBEGIN\n  SET NEW.${column} = CURRENT_TIMESTAMP;\nEND//\nDELIMITER ;`;
  }
  if (POSTGRES_FAMILY.includes(dbType)) {
    return `CREATE OR REPLACE FUNCTION ${routineName}_fn()\nRETURNS TRIGGER\nLANGUAGE plpgsql\nAS $$\nBEGIN\n  NEW.${column} = CURRENT_TIMESTAMP;\n  RETURN NEW;\nEND;\n$$;\n\nCREATE TRIGGER ${routineName}\nBEFORE UPDATE ON ${table}\nFOR EACH ROW\nEXECUTE FUNCTION ${routineName}_fn();`;
  }
  if (dbType === 'sqlserver') {
    return `CREATE OR ALTER TRIGGER ${routineName}\nON ${table}\nAFTER UPDATE\nAS\nBEGIN\n  SET NOCOUNT ON;\n  UPDATE target\n  SET ${column} = SYSDATETIME()\n  FROM ${table} AS target\n  INNER JOIN inserted AS i ON target.id = i.id;\nEND;`;
  }
  if (ORACLE_FAMILY.includes(dbType)) {
    return `CREATE OR REPLACE TRIGGER ${routineName}\nBEFORE UPDATE ON ${table}\nFOR EACH ROW\nBEGIN\n  :NEW.${column} := SYSTIMESTAMP;\nEND;\n/`;
  }

  return `CREATE TRIGGER ${routineName}\nBEFORE UPDATE ON ${table}\nFOR EACH ROW\nBEGIN\n  SET NEW.${column} = CURRENT_TIMESTAMP;\nEND;`;
}

function buildAuditTriggerDDL(
  dbType: DatabaseType,
  routineName: string,
  tableName: string,
  auditTableName = `${tableName}_audit`,
) {
  const strategy = DDLStrategyFactory.create(dbType);
  const table = strategy.formatTableName(tableName);
  const auditTable = strategy.formatTableName(cleanName(auditTableName) || `${tableName}_audit`);

  if (MYSQL_FAMILY.includes(dbType)) {
    return `DELIMITER //\nCREATE TRIGGER ${routineName}\nAFTER UPDATE ON ${table}\nFOR EACH ROW\nBEGIN\n  INSERT INTO ${auditTable} (table_name, operation, changed_at)\n  VALUES ('${tableName}', 'UPDATE', CURRENT_TIMESTAMP);\nEND//\nDELIMITER ;`;
  }
  if (POSTGRES_FAMILY.includes(dbType)) {
    return `CREATE OR REPLACE FUNCTION ${routineName}_fn()\nRETURNS TRIGGER\nLANGUAGE plpgsql\nAS $$\nBEGIN\n  INSERT INTO ${auditTable} (table_name, operation, changed_at)\n  VALUES ('${tableName}', TG_OP, CURRENT_TIMESTAMP);\n  RETURN NEW;\nEND;\n$$;\n\nCREATE TRIGGER ${routineName}\nAFTER INSERT OR UPDATE OR DELETE ON ${table}\nFOR EACH ROW\nEXECUTE FUNCTION ${routineName}_fn();`;
  }
  if (dbType === 'sqlserver') {
    return `CREATE OR ALTER TRIGGER ${routineName}\nON ${table}\nAFTER INSERT, UPDATE, DELETE\nAS\nBEGIN\n  SET NOCOUNT ON;\n  INSERT INTO ${auditTable} (table_name, operation, changed_at)\n  VALUES ('${tableName}', 'CHANGE', SYSDATETIME());\nEND;`;
  }
  if (ORACLE_FAMILY.includes(dbType)) {
    return `CREATE OR REPLACE TRIGGER ${routineName}\nAFTER INSERT OR UPDATE OR DELETE ON ${table}\nFOR EACH ROW\nBEGIN\n  INSERT INTO ${auditTable} (table_name, operation, changed_at)\n  VALUES ('${tableName}', ORA_SYSEVENT, SYSTIMESTAMP);\nEND;\n/`;
  }

  return `CREATE TRIGGER ${routineName}\nAFTER UPDATE ON ${table}\nFOR EACH ROW\nBEGIN\n  INSERT INTO ${auditTable} (table_name, operation, changed_at)\n  VALUES ('${tableName}', 'UPDATE', CURRENT_TIMESTAMP);\nEND;`;
}

function buildCustomTriggerDDL(
  dbType: DatabaseType,
  routineName: string,
  tableName: string,
  body: string | undefined,
) {
  const strategy = DDLStrategyFactory.create(dbType);
  const table = strategy.formatTableName(tableName);
  const triggerBody = cleanSqlBody(body, '-- 在这里编写触发器逻辑');

  if (MYSQL_FAMILY.includes(dbType)) {
    return `DELIMITER //\nCREATE TRIGGER ${routineName}\nBEFORE INSERT ON ${table}\nFOR EACH ROW\nBEGIN\n  ${triggerBody};\nEND//\nDELIMITER ;`;
  }
  if (POSTGRES_FAMILY.includes(dbType)) {
    return `CREATE OR REPLACE FUNCTION ${routineName}_fn()\nRETURNS TRIGGER\nLANGUAGE plpgsql\nAS $$\nBEGIN\n  ${triggerBody};\n  RETURN NEW;\nEND;\n$$;\n\nCREATE TRIGGER ${routineName}\nBEFORE INSERT ON ${table}\nFOR EACH ROW\nEXECUTE FUNCTION ${routineName}_fn();`;
  }
  if (dbType === 'sqlserver') {
    return `CREATE OR ALTER TRIGGER ${routineName}\nON ${table}\nAFTER INSERT\nAS\nBEGIN\n  SET NOCOUNT ON;\n  ${triggerBody};\nEND;`;
  }
  if (ORACLE_FAMILY.includes(dbType)) {
    return `CREATE OR REPLACE TRIGGER ${routineName}\nBEFORE INSERT ON ${table}\nFOR EACH ROW\nBEGIN\n  ${triggerBody};\nEND;\n/`;
  }

  return `CREATE TRIGGER ${routineName}\nBEFORE INSERT ON ${table}\nFOR EACH ROW\nBEGIN\n  ${triggerBody};\nEND;`;
}
