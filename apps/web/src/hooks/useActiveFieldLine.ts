import { useMemo } from 'react';
import { useAppUiStore, useEditorStore } from '@/stores';

const QUOTES = /[`"[\]]/g;

function findFieldLine(sql: string, fieldName: string) {
  const line = sql
    .split('\n')
    .findIndex((text) => text.trim().split(/\s+/)[0]?.replace(QUOTES, '') === fieldName);

  return line === -1 ? undefined : line;
}

export function useActiveFieldLine(sql: string) {
  const fieldName = useEditorStore((state) => {
    const { activeFieldId } = useAppUiStore.getState();

    return state.rows.find((row) => row.id === activeFieldId)?.fieldName?.trim();
  });
  const activeFieldId = useAppUiStore((state) => state.activeFieldId);

  return useMemo(
    () => (fieldName && activeFieldId ? findFieldLine(sql, fieldName) : undefined),
    [activeFieldId, fieldName, sql],
  );
}
