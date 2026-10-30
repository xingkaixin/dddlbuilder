import { useCallback, useMemo, useReducer } from 'react';
import { PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import type { FolderTreeNode } from '@/hooks/useFolders';
import type { SavedTableSummary } from '@/hooks/useSavedTables';
import { useTimers } from '@/hooks/useTimers';
import { useFolderExpansion } from '../FolderTree';
import { buildFolderParentMap, resolveDropAction } from './dnd';
import { useSavedTablesFilter } from './useSavedTablesFilter';

export type MoveOperationResult = { ok: boolean; message?: string };

type DragFeedback = {
  type: 'success' | 'blocked' | 'error';
  message: string;
};

type TreeControlsState = {
  searchQuery: string;
  selectedFolderId: string | undefined;
  dragFeedback: DragFeedback | null;
};

type TreeControlsEvent =
  | { type: 'searchChanged'; searchQuery: string }
  | { type: 'folderSelected'; folderId: string | undefined }
  | { type: 'dragFeedbackShown'; feedback: DragFeedback }
  | { type: 'dragFeedbackExpired' };

const initialTreeControlsState: TreeControlsState = {
  searchQuery: '',
  selectedFolderId: undefined,
  dragFeedback: null,
};

function treeControlsReducer(
  state: TreeControlsState,
  event: TreeControlsEvent,
): TreeControlsState {
  switch (event.type) {
    case 'searchChanged':
      return { ...state, searchQuery: event.searchQuery };
    case 'folderSelected':
      return { ...state, selectedFolderId: event.folderId };
    case 'dragFeedbackShown':
      return { ...state, dragFeedback: event.feedback };
    case 'dragFeedbackExpired':
      return { ...state, dragFeedback: null };
  }
}

interface UseWorkspaceTreeControlsParams {
  items: SavedTableSummary[];
  folders: FolderTreeNode[];
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
  onMoveToFolder,
  onMoveFolder,
}: UseWorkspaceTreeControlsParams) {
  const { t } = useTranslation();

  const [{ searchQuery, selectedFolderId, dragFeedback }, dispatch] = useReducer(
    treeControlsReducer,
    initialTreeControlsState,
  );
  const { schedule, clearAll } = useTimers();
  const { expandedFolders, toggleFolder, expandFolder } = useFolderExpansion(folders);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );
  const { foldersWithCount, filteredItems, itemsByFolder, ungroupedItems, isSearching } =
    useSavedTablesFilter({
      items,
      folders,
      searchQuery,
    });

  const itemMap = useMemo(() => new Map(items.map((item) => [item.tableId, item])), [items]);

  const tableFolderMap = useMemo(
    () =>
      items.reduce<Record<string, string | undefined>>((map, item) => {
        map[item.tableId] = item.folderId;

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

  const setSearchQuery = useCallback(
    (query: string) => dispatch({ type: 'searchChanged', searchQuery: query }),
    [],
  );

  const setSelectedFolderId = useCallback(
    (folderId: string | undefined) => dispatch({ type: 'folderSelected', folderId }),
    [],
  );

  const showDragFeedback = useCallback(
    (feedback: DragFeedback) => {
      dispatch({ type: 'dragFeedbackShown', feedback });
      clearAll();
      schedule(() => dispatch({ type: 'dragFeedbackExpired' }), 2400);
    },
    [clearAll, schedule],
  );

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
        const item = itemMap.get(action.tableId);

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
    itemsByFolder,
    ungroupedItems,
    isSearching,
    dragFeedback,
    handleDragEnd,
  };
}
