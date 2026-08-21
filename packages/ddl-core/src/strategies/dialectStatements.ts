import { escapeSingleQuotes } from '../utils/databaseTypeMapping';
import {
  buildCitusShardingDDL,
  buildMysqlPartitionClause,
  buildOracleSynonyms,
} from '../utils/tableFeatures';

export { buildCitusShardingDDL as buildCitusShardingStatement };
export { buildMysqlPartitionClause };
export { buildOracleSynonyms as buildOracleSynonym };

interface ExtendedPropertyInput {
  value: string;
  schema: string;
  table: string;
  column?: string;
}

const buildExtendedProperty = ({ value, schema, table, column }: ExtendedPropertyInput) => {
  const level0name = schema ? `N'${escapeSingleQuotes(schema)}'` : 'NULL';
  const level1name = `N'${escapeSingleQuotes(table)}'`;

  if (!column) {
    return `EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'${escapeSingleQuotes(value)}',
    @level0type = N'SCHEMA', @level0name = ${level0name},
    @level1type = N'TABLE', @level1name = ${level1name};`;
  }
  const level2name = `N'${escapeSingleQuotes(column)}'`;
  return `EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'${escapeSingleQuotes(value)}',
    @level0type = N'SCHEMA', @level0name = ${level0name},
    @level1type = N'TABLE', @level1name = ${level1name},
    @level2type = N'COLUMN', @level2name = ${level2name};`;
};

export { buildExtendedProperty };
