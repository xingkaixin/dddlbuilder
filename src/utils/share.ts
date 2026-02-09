import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from 'lz-string';
import type { PersistedState } from '@/types';
import { reportError } from './errorReporter';

// Minified types to reduce URL length
type MinifiedFieldRow = {
  n: string; // name
  t: string; // type
  c?: string; // comment
  nu?: 0 | 1; // nullable
  dk?: string; // defaultKind
  dv?: string; // defaultValue
  ou?: string; // onUpdate
};

type MinifiedIndex = {
  n: string; // name
  f: { n: string; d: 0 | 1 }[]; // fields: name, direction (0=ASC, 1=DESC)
  u?: 0 | 1; // unique
  p?: 0 | 1; // primary
};

type MinifiedState = {
  tn: string; // tableName
  tc?: string; // tableComment
  dt: string; // dbType
  r: MinifiedFieldRow[]; // rows
  i?: MinifiedIndex[]; // indexes
  a?: string[]; // authObjects
};

export const compressState = (state: Partial<PersistedState>): string => {
  const minified: MinifiedState = {
    tn: state.tableName || '',
    tc: state.tableComment || undefined,
    dt: state.dbType || 'mysql',
    r: (state.rows || []).map((row) => ({
      n: row.fieldName,
      t: row.fieldType,
      c: row.fieldComment || undefined,
      nu: row.nullable === '是' ? 1 : 0,
      dk: row.defaultKind === '无' ? undefined : row.defaultKind,
      dv: row.defaultValue || undefined,
      ou: row.onUpdate === '无' ? undefined : row.onUpdate,
    })),
    i: (state.indexes || []).map((idx) => ({
      n: idx.name,
      f: idx.fields.map((f) => ({
        n: f.name,
        d: f.direction === 'ASC' ? 0 : 1,
      })),
      u: idx.unique ? 1 : 0,
      p: idx.isPrimary ? 1 : 0,
    })),
    a:
      state.authObjects && state.authObjects.length > 0
        ? state.authObjects
        : undefined,
  };

  return compressToEncodedURIComponent(JSON.stringify(minified));
};

export const decompressState = (
  compressed: string,
): Partial<PersistedState> | null => {
  try {
    const jsonString = decompressFromEncodedURIComponent(compressed);
    if (!jsonString) return null;

    const minified = JSON.parse(jsonString) as MinifiedState;

    // Restore to full state
    return {
      tableName: minified.tn,
      tableComment: minified.tc || '',
      dbType: minified.dt as any,
      rows: minified.r.map((r, index) => ({
        order: index + 1,
        fieldName: r.n,
        fieldType: r.t,
        fieldComment: r.c || '',
        nullable: r.nu === 1 ? '是' : '否',
        defaultKind: r.dk || '无',
        defaultValue: r.dv || '',
        onUpdate: r.ou || '无',
      })),
      addCount: 10, // Default
      indexInput: '',
      currentIndexFields: [],
      indexes: (minified.i || []).map((idx, i) => ({
        id: `idx_${Date.now()}_${i}`, // Generate new IDs
        name: idx.n,
        fields: idx.f.map((f) => ({
          name: f.n,
          direction: f.d === 0 ? 'ASC' : 'DESC',
        })),
        unique: idx.u === 1,
        isPrimary: idx.p === 1,
      })),
      authInput: '',
      authObjects: minified.a || [],
    };
  } catch (e) {
    reportError(e, {
      scope: 'Share',
      action: 'decompressState',
    });
    return null;
  }
};
