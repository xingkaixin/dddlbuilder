import type {
  NormalizedField,
  IndexDefinition,
  ForeignKeyDefinition,
} from '@ddlbuilder/shared-types';

export type ORMTarget = 'prisma' | 'typeorm' | 'sqlalchemy' | 'gorm' | 'jpa';

export interface ORMGenerator {
  generateModel(
    tableName: string,
    tableComment: string,
    fields: NormalizedField[],
    indexes: IndexDefinition[],
    foreignKeys: ForeignKeyDefinition[],
  ): string;
}
