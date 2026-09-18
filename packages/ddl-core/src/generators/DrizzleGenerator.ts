import type { ORMGenerator, ORMModelInput } from '../interfaces/ORMGenerator';
import { buildSqliteDrizzle } from '../utils/sqliteSchema';

export class DrizzleGenerator implements ORMGenerator {
  generateModel(input: ORMModelInput): string {
    if (input.schemaName) throw new Error('SQLite / D1 does not support schema-qualified models.');

    return buildSqliteDrizzle([input]);
  }
}
