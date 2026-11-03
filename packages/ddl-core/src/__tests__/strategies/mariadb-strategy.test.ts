import { describe, it, expect } from 'vitest';
import { ProfiledDDLStrategy } from '../../strategies/ProfiledDDLStrategy.js';
import type { NormalizedField } from '@ddlbuilder/shared-types';

describe('MariaDbStrategy', () => {
  const strategy = new ProfiledDDLStrategy('mariadb');

  it('应该支持 UUID 默认值', () => {
    const fields: NormalizedField[] = [
      {
        name: 'trace_id',
        type: 'uuid',
        comment: '',
        nullable: false,
        defaultKind: 'uuid',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const result = strategy.generateTableDDL('test', '', fields);

    expect(result).toContain('trace_id CHAR(36) NOT NULL DEFAULT (UUID())');
  });
});
