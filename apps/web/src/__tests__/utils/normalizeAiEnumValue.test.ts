import { describe, expect, it } from 'vitest';
import { normalizeGeneratedTableSchema } from '@/utils/normalizeAiEnumValue';
import type { GeneratedField, GeneratedTableSchema } from '@ddlbuilder/shared-types/ai-generate';

const field = (fieldName: string, id?: string | null): GeneratedField => ({
  id,
  fieldName,
  fieldType: 'int',
  fieldComment: '',
  nullable: true,
  defaultKind: 'none',
});
const schema = (fields: GeneratedField[]): GeneratedTableSchema => ({
  tableName: 'users',
  tableComment: '',
  fields,
});

describe('normalizeAiEnumValue', () => {
  it('preserves renamed identities and assigns new identities once for later conversation turns', () => {
    const first = normalizeGeneratedTableSchema(
      schema([field('phone', 'contact'), field('email', null)]),
      'mysql',
      [field('mobile', 'contact')],
    );
    expect(first.fields[0].id).toBe('contact');
    expect(first.fields[1].id).toBeTruthy();

    const second = normalizeGeneratedTableSchema(
      schema([first.fields[0], { ...first.fields[1], fieldName: 'address' }]),
      'mysql',
      first.fields,
    );
    expect(second.fields.map((row) => row.id)).toEqual(first.fields.map((row) => row.id));
  });

  it('requires explicit new-field intent when replacing an existing field', () => {
    const base = [field('phone', 'contact')];
    expect(() => normalizeGeneratedTableSchema(schema([field('email')]), 'mysql', base)).toThrow(
      'explicit identity',
    );

    const replacement = normalizeGeneratedTableSchema(
      schema([field('email', null)]),
      'mysql',
      base,
    );
    expect(replacement.fields[0].id).not.toBe('contact');
  });
});
