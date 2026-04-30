import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOrmGeneration } from '@/hooks/useOrmGeneration';
import type { NormalizedField, IndexDefinition } from '@ddlbuilder/shared-types';

const createField = (overrides: Partial<NormalizedField> = {}): NormalizedField => ({
  name: 'id',
  type: 'bigint',
  comment: '',
  nullable: false,
  defaultKind: 'auto_increment',
  defaultValue: '',
  onUpdate: 'none',
  ...overrides,
});

describe('useOrmGeneration', () => {
  it('defaults to prisma target', () => {
    const { result } = renderHook(() =>
      useOrmGeneration('users', '用户表', [createField()], [], []),
    );
    expect(result.current.ormTarget).toBe('prisma');
    expect(result.current.generatedOrm).toContain('model Users {');
  });

  it('switches ORM target', () => {
    const { result } = renderHook(() =>
      useOrmGeneration('users', '用户表', [createField()], [], []),
    );

    act(() => {
      result.current.setOrmTarget('typeorm');
    });

    expect(result.current.ormTarget).toBe('typeorm');
    expect(result.current.generatedOrm).toContain('@Entity');
  });

  it('generates GORM model', () => {
    const { result } = renderHook(() =>
      useOrmGeneration('users', '用户表', [createField()], [], []),
    );

    act(() => {
      result.current.setOrmTarget('gorm');
    });

    expect(result.current.generatedOrm).toContain('package models');
    expect(result.current.generatedOrm).toContain('type Users struct {');
  });

  it('generates SQLAlchemy model', () => {
    const { result } = renderHook(() =>
      useOrmGeneration('users', '用户表', [createField()], [], []),
    );

    act(() => {
      result.current.setOrmTarget('sqlalchemy');
    });

    expect(result.current.generatedOrm).toContain('from sqlalchemy import Column');
    expect(result.current.generatedOrm).toContain('class Users(Base):');
  });

  it('generates JPA entity', () => {
    const { result } = renderHook(() =>
      useOrmGeneration('users', '用户表', [createField()], [], []),
    );

    act(() => {
      result.current.setOrmTarget('jpa');
    });

    expect(result.current.generatedOrm).toContain('@Entity');
    expect(result.current.generatedOrm).toContain('public class Users {');
  });

  it('copies ORM to clipboard', async () => {
    const { result } = renderHook(() =>
      useOrmGeneration('users', '用户表', [createField()], [], []),
    );

    let copied = false;
    await act(async () => {
      copied = await result.current.copyOrm();
    });

    expect(copied).toBe(true);
  });

  it('includes indexes in generated ORM', () => {
    const indexes: IndexDefinition[] = [
      { name: 'pk_id', fields: [{ name: 'id', direction: 'ASC' }], unique: false, isPrimary: true },
    ];
    const { result } = renderHook(() =>
      useOrmGeneration('users', '用户表', [createField()], indexes, []),
    );

    expect(result.current.generatedOrm).toContain('@id');
  });

  it('handles empty fields gracefully', () => {
    const { result } = renderHook(() => useOrmGeneration('users', '用户表', [], [], []));

    expect(result.current.generatedOrm).toBeTruthy();
  });
});
