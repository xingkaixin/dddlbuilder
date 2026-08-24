import { useEditorStore } from '@/stores';
import { useShallow } from 'zustand/react/shallow';

/**
 * 聚合 App 组件所需的所有 zustand selector，按功能分组。
 *
 * action 走 getState()：它们在 store 的生命周期内引用恒定，订阅它们只会让每次 store
 * 变更都多跑一遍 selector 和一次比较，换不到任何重渲染。只有真正会变的状态值才订阅。
 */
export function useAppSelectors() {
  const {
    setSchemaName,
    setTableName,
    setTableComment,
    setObjectType,
    setViewDefinition,
    setViewCreateOrReplace,
    setDbType,
    setSqlFormatMode,
    setAddCount,
    setActiveTab,
    resetTableConfig,
    resetTableViewConfig,
    setFieldTableFreezeEnabled,
    setFieldTableFreezeColumns,
  } = useEditorStore.getState();

  const { setRows, resetRows: resetTableRows } = useEditorStore.getState();

  const { setIndexInput, setCurrentIndexFields, updateIndexNames, resetIndexState, setIndexes } =
    useEditorStore.getState();

  const {
    setForeignKeys,
    resetForeignKeyState,
    addForeignKey,
    removeForeignKey,
    updateForeignKey,
    syncForeignKeyFieldRename,
  } = useEditorStore.getState();

  const state = useEditorStore(
    useShallow((current) => ({
      schemaName: current.schemaName,
      tableName: current.tableName,
      tableComment: current.tableComment,
      objectType: current.objectType,
      viewDefinition: current.viewDefinition,
      viewCreateOrReplace: current.viewCreateOrReplace,
      dbType: current.dbType,
      sqlFormatMode: current.sqlFormatMode,
      addCount: current.addCount,
      activeTab: current.activeTab,
      fieldTableFreezeEnabled: current.fieldTableFreezeEnabled,
      fieldTableFreezeColumns: current.fieldTableFreezeColumns,
      rows: current.rows,
      indexInput: current.indexInput,
      currentIndexFields: current.currentIndexFields,
      indexes: current.indexes,
      foreignKeys: current.foreignKeys,
    })),
  );

  return {
    ...state,
    // 基础表配置
    setSchemaName,
    setTableName,
    setTableComment,
    setObjectType,
    setViewDefinition,
    setViewCreateOrReplace,
    setDbType,
    setSqlFormatMode,
    setAddCount,
    setActiveTab,
    resetTableConfig,
    resetTableViewConfig,
    // 冻结列
    setFieldTableFreezeEnabled,
    setFieldTableFreezeColumns,
    // Field store
    setRows,
    resetTableRows,
    // Index store
    setIndexInput,
    setCurrentIndexFields,
    updateIndexNames,
    resetIndexState,
    setIndexes,
    // ForeignKey store
    setForeignKeys,
    resetForeignKeyState,
    addForeignKey,
    removeForeignKey,
    updateForeignKey,
    syncForeignKeyFieldRename,
  };
}
