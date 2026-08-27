import type {
  DatabaseType,
  NormalizedField,
  IndexDefinition,
  ForeignKeyDefinition,
} from '@ddlbuilder/shared-types';

export type ORMTarget = 'prisma' | 'typeorm' | 'sqlalchemy' | 'gorm' | 'jpa';

export interface ORMModelInput {
  dbType: DatabaseType;
  schemaName?: string;
  tableName: string;
  tableComment: string;
  fields: NormalizedField[];
  indexes?: IndexDefinition[];
  foreignKeys?: ForeignKeyDefinition[];
}

export interface ORMGenerator {
  generateModel(input: ORMModelInput): string;
}
