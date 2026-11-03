import { describe, expect, it } from 'vitest';
import { quoteIdentifier } from '../utils/databaseFamily';

describe('database capabilities', () => {
  it.each(['mysql'] as const)('%s 使用反引号引用标识符', (databaseType) => {
    expect(quoteIdentifier('order`item', databaseType)).toBe('`order``item`');
  });

  it('按数据库族转义标识符中的定界符', () => {
    expect(quoteIdentifier('order]item', 'sqlserver')).toBe('[order]]item]');
    expect(quoteIdentifier('order"item', 'postgresql')).toBe('"order""item"');
  });
});
