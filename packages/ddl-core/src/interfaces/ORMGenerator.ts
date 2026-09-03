import type {
  DatabaseType,
  NormalizedField,
  IndexDefinition,
  ForeignKeyDefinition,
} from '@ddlbuilder/shared-types';

export type ORMTarget = 'prisma' | 'typeorm' | 'sqlalchemy' | 'gorm' | 'jpa';

export interface ORMReferencedModel {
  schemaName?: string;
  tableName: string;
  fields: Array<Pick<NormalizedField, 'name'>>;
}

export interface ORMModelInput {
  dbType: DatabaseType;
  schemaName?: string;
  tableName: string;
  tableComment: string;
  fields: NormalizedField[];
  indexes?: IndexDefinition[];
  foreignKeys?: ForeignKeyDefinition[];
  referencedModels?: ORMReferencedModel[];
}

export interface ORMGenerator {
  generateModel(input: ORMModelInput): string;
}
