import type { ORMGenerator, ORMTarget } from '../interfaces/ORMGenerator.js';
import {
  PrismaGenerator,
  TypeORMGenerator,
  SQLAlchemyGenerator,
  GORMGenerator,
  JPAGenerator,
} from '../generators/index.js';

const generators = new Map<ORMTarget, ORMGenerator>();

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

  static getSupportedTargets(): ORMTarget[] {
    return Array.from(generators.keys());
  }

  static registerGenerator(target: ORMTarget, generator: ORMGenerator): void {
    generators.set(target, generator);
  }
}
