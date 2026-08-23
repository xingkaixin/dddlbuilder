import type { NormalizedField, DatabaseType } from '@ddlbuilder/shared-types';
import { buildDialectDefaultClause } from '../../strategies/dialectColumn';

export const buildDefaultClause = (field: NormalizedField, dbType: DatabaseType): string =>
  buildDialectDefaultClause(field, dbType);
