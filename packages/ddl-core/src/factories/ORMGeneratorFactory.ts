import { DrizzleGenerator } from '../generators/DrizzleGenerator';
import type { ORMGenerator, ORMTarget } from '../interfaces/ORMGenerator.js';
import { PrismaGenerator } from '../generators/PrismaGenerator.js';
import { TypeORMGenerator } from '../generators/TypeORMGenerator.js';
import { SQLAlchemyGenerator } from '../generators/SQLAlchemyGenerator.js';
import { GORMGenerator } from '../generators/GORMGenerator.js';
import { JPAGenerator } from '../generators/JPAGenerator.js';

const generators = new Map<ORMTarget, ORMGenerator>();

generators.set('drizzle', new DrizzleGenerator());

generators.set('prisma', new PrismaGenerator());

generators.set('typeorm', new TypeORMGenerator());

generators.set('sqlalchemy', new SQLAlchemyGenerator());

generators.set('gorm', new GORMGenerator());

generators.set('jpa', new JPAGenerator());

export class ORMGeneratorFactory {
  static create(target: ORMTarget): ORMGenerator {
    const generator = generators.get(target);

    if (!generator) {
      throw new Error(`Unsupported ORM target: ${target}`);
    }

    return generator;
  }
}
