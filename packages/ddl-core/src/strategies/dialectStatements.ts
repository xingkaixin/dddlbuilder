import {
  buildCitusShardingDDL,
  buildMysqlPartitionClause,
  buildOracleSynonyms,
} from '../utils/tableFeatures';

export { buildCitusShardingDDL as buildCitusShardingStatement };
export { buildMysqlPartitionClause };
export { buildOracleSynonyms as buildOracleSynonym };
