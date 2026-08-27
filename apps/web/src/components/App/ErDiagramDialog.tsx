import { type SavedTableTarget } from '@ddlbuilder/shared-types/workspace';
import { memo, useCallback, useEffect, useState } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { SaveTableResult } from '@/hooks/useSavedTables';
import type { SavedTableRecord } from '@/utils/workspaceStorageTypes';
import type { SavedTableStateUpdate } from '@/utils/savedTableStateUpdate';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useToast';
import { createEmptyRow } from '@/utils/helpers';
import ErDiagramCanvas from './er-diagram/ErDiagramCanvas';

interface ErDiagramDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTable: (state: PersistedState) => void;
  saveTable: (name: string, state: PersistedState) => Promise<SaveTableResult>;
  overwriteTable: (
    normalizedName: SavedTableTarget,
    state: SavedTableStateUpdate,
  ) => Promise<SaveTableResult>;
  loadTables: () => Promise<SavedTableRecord[]>;
}

const INITIAL_ROWS = Array.from({ length: 4 }, () => createEmptyRow());

export const ErDiagramDialog = memo<ErDiagramDialogProps>(
  ({ open, onOpenChange, onSelectTable, saveTable, overwriteTable, loadTables }) => {
    const { t } = useTranslation();
    const { showToast } = useToast();
    const [tables, setTables] = useState<SavedTableRecord[]>([]);
    const [loading, setLoading] = useState(open);

    const refresh = useCallback(async () => {
      const records = await loadTables();
      setTables(records);
    }, [loadTables]);

    useEffect(() => {
      if (!open) return;
      void loadTables()
        .then(setTables)
        .finally(() => setLoading(false));
    }, [loadTables, open]);

    const handleSelectTable = useCallback(
      (state: PersistedState) => {
        onSelectTable(state);
        onOpenChange(false);
      },
      [onSelectTable, onOpenChange],
    );

    const handleAddTable = useCallback(() => {
      const name = window.prompt(t('erDiagram.addTablePrompt') || '请输入表名');
      if (!name?.trim()) return;

      const trimmed = name.trim();
      const state: PersistedState = {
        schemaName: '',
        tableName: trimmed,
        tableComment: '',
        dbType: 'mysql',
        sqlFormatMode: 'compact',
        rows: INITIAL_ROWS,
        addCount: 4,
        indexInput: '',
        currentIndexFields: [],
        indexes: [],
        authInput: '',
        authObjects: [],
      };

      void saveTable(trimmed, state).then((result) => {
        if (result.ok) {
          showToast(t('erDiagram.toast.tableSaved'));
          void refresh();
        } else if (result.reason === 'duplicate') {
          showToast(t('erDiagram.toast.tableDuplicate') || '表名已存在');
        } else {
          showToast(result.message || t('erDiagram.toast.tableSaveFailed') || '保存失败');
        }
      });
    }, [saveTable, refresh, showToast, t]);

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] w-[1200px] h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>{t('erDiagram.title')}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 relative">
            <ErDiagramCanvas
              tables={tables}
              loading={loading}
              onSelectTable={handleSelectTable}
              onRefresh={refresh}
              onAddTable={handleAddTable}
              onUpdateTable={overwriteTable}
            />
          </div>
        </DialogContent>
      </Dialog>
    );
  },
);

ErDiagramDialog.displayName = 'ErDiagramDialog';

export default ErDiagramDialog;
