import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import type { FolderTreeNode } from '@/hooks/useFolders';
import type { SavedTableSummary } from '@/hooks/useSavedTables';
import { useFolderExpansion } from '../FolderTree';
import { buildFolderParentMap, resolveDropAction } from './dnd';
import { useSavedTablesFilter } from './useSavedTablesFilter';

export type MoveOperationResult = { ok: boolean; message?: string };

type DragFeedback = {
  type: 'success' | 'blocked' | 'error';
  message: string;
};

interface UseWorkspaceTreeControlsParams {
  items: SavedTableSummary[];
  folders: FolderTreeNode[];
  initiallyExpandedFolderIds?: string[];
  onMoveToFolder?: (
    item: SavedTableSummary,
    folderId?: string,
  ) => MoveOperationResult | Promise<MoveOperationResult | undefined> | undefined;
  onMoveFolder?: (
    folder: FolderTreeNode,
    parentId?: string,
  ) => MoveOperationResult | Promise<MoveOperationResult | undefined> | undefined;
}

export function useWorkspaceTreeControls({
  items,
  folders,
  initiallyExpandedFolderIds,
  onMoveToFolder,
  onMoveFolder,
}: UseWorkspaceTreeControlsParams) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string>();
  const [dragFeedback, setDragFeedback] = useState<DragFeedback | null>(null);
  const dragFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { expandedFolders, toggleFolder, expandFolder } = useFolderExpansion(
    initiallyExpandedFolderIds,
  );
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );
  const { foldersWithCount, filteredItems, ungroupedItems, isSearching } = useSavedTablesFilter({
    items,
    folders,
    searchQuery,
  });

  const itemMap = useMemo(() => new Map(items.map((item) => [item.normalizedName, item])), [items]);
  const tableFolderMap = useMemo(
    () =>
      items.reduce<Record<string, string | undefined>>((map, item) => {
        map[item.normalizedName] = item.folderId;
        return map;
      }, {}),
    [items],
  );
  const folderParentMap = useMemo(() => buildFolderParentMap(foldersWithCount), [foldersWithCount]);
  const folderNodeMap = useMemo(() => {
    const map = new Map<string, FolderTreeNode>();
    const visit = (nodes: FolderTreeNode[]) => {
      for (const node of nodes) {
        map.set(node.id, node);
        visit(node.children);
      }
    };
    visit(foldersWithCount);
    return map;
  }, [foldersWithCount]);

  useEffect(
    () => () => {
      if (dragFeedbackTimerRef.current) {
        clearTimeout(dragFeedbackTimerRef.current);
      }
    },
    [],
  );

  const showDragFeedback = useCallback((feedback: DragFeedback) => {
    setDragFeedback(feedback);
    if (dragFeedbackTimerRef.current) {
      clearTimeout(dragFeedbackTimerRef.current);
    }
    dragFeedbackTimerRef.current = setTimeout(() => setDragFeedback(null), 2400);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const action = resolveDropAction({
        activeId: event.active.id,
        overId: event.over?.id ?? null,
        isSearching,
        tableFolderMap,
        folderParentMap,
      });

      if (action.kind === 'none') return;
      if (action.kind === 'invalid_folder_cycle') {
        showDragFeedback({
          type: 'blocked',
          message: t('savedTables.dragFeedback.folderCycle'),
        });
        return;
      }
      if (action.kind === 'move_table') {
        if (!onMoveToFolder) return;
        const item = itemMap.get(action.normalizedName);
        if (!item) return;
        try {
          const result = await Promise.resolve(onMoveToFolder(item, action.folderId));
          if (result && result.ok === false) {
            showDragFeedback({
              type: 'error',
              message: result.message ?? t('savedTables.dragFeedback.moveFailed'),
            });
            return;
          }
          if (action.folderId) expandFolder(action.folderId);
          showDragFeedback({
            type: 'success',
            message: action.folderId
              ? t('savedTables.dragFeedback.tableMovedToFolder', {
                  name:
                    folderNodeMap.get(action.folderId)?.name ??
                    t('savedTables.dragFeedback.unknownFolder'),
                })
              : t('savedTables.dragFeedback.tableMovedToRoot'),
          });
        } catch {
          showDragFeedback({
            type: 'error',
            message: t('savedTables.dragFeedback.moveFailed'),
          });
        }
        return;
      }

      if (!onMoveFolder) return;
      const folder = folderNodeMap.get(action.folderId);
      if (!folder) return;
      try {
        const result = await Promise.resolve(onMoveFolder(folder, action.parentId));
        if (result && result.ok === false) {
          showDragFeedback({
            type: 'error',
            message: result.message ?? t('savedTables.dragFeedback.moveFailed'),
          });
          return;
        }
        if (action.parentId) expandFolder(action.parentId);
        showDragFeedback({
          type: 'success',
          message: action.parentId
            ? t('savedTables.dragFeedback.folderMovedToFolder', {
                name:
                  folderNodeMap.get(action.parentId)?.name ??
                  t('savedTables.dragFeedback.unknownFolder'),
              })
            : t('savedTables.dragFeedback.folderMovedToRoot'),
        });
      } catch {
        showDragFeedback({
          type: 'error',
          message: t('savedTables.dragFeedback.moveFailed'),
        });
      }
    },
    [
      expandFolder,
      folderNodeMap,
      folderParentMap,
      isSearching,
      itemMap,
      onMoveFolder,
      onMoveToFolder,
      showDragFeedback,
      tableFolderMap,
      t,
    ],
  );

  return {
    searchQuery,
    setSearchQuery,
    selectedFolderId,
    setSelectedFolderId,
    expandedFolders,
    toggleFolder,
    sensors,
    foldersWithCount,
    filteredItems,
    ungroupedItems,
    isSearching,
    dragFeedback,
    handleDragEnd,
  };
}
