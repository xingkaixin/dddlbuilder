---
created: "2026-02-08"
updated: "2026-02-09"
status: "Almost Complete"
---

# DDLBuilder 架构与代码质量评估报告

**评估日期**: 2026-02-08
**评估范围**: 核心组件架构、代码质量、设计模式应用
**主组件**: src/components/App/index.tsx (1979行代码)

---

## 执行摘要

DDLBuilder的主组件存在**严重的架构问题**:

- ✅ **测试覆盖优秀**: 545个测试全部通过,测试覆盖率高
- ✅ **代码规范良好**: 通过所有lint检查,使用TypeScript严格模式
- ⚠️ **组件过大**: 主组件1979行,包含42个useState,严重违反单一职责原则
- ⚠️ **状态管理混乱**: 状态分散在42个独立的useState中,缺乏统一管理
- ❌ **耦合度过高**: 大量props drilling和重复的对话框处理逻辑
- ❌ **代码重复严重**: 32个对话框遵循相同模式但未提取公共逻辑

**核心建议**: 立即启动重构计划,优先解决状态管理和组件拆分问题。

---

## 1. 架构问题清单

### P0 (Critical) - 严重架构缺陷

#### 1.1 单体组件违反单一职责原则

**位置**: `src/components/App/index.tsx:1-1979`

**问题描述**:
- 主组件包含1979行代码,1775行实际代码
- 包含42个useState声明
- 32个对话框处理器函数(handleOpen, handleConfirm, handleCancel等)
- 19个自定义hooks的调用和协调
- 混合了多种职责: 状态管理、业务逻辑、UI渲染、事件处理

**影响**:
- 可维护性极差: 需要理解全部代码才能修改任何功能
- 测试困难: 组件过于复杂,难以编写单元测试
- 性能风险: 任何状态变更都会触发整个组件重新渲染
- 代码复用性差: 业务逻辑与UI强耦合,无法复用

**重构方案**:

```typescript
// 方案1: 按功能域拆分为多个容器组件

// src/components/App/containers/TableManagementContainer.tsx
export function TableManagementContainer() {
  const tableState = useTableState();
  const saveHandlers = useTableSaveHandlers(tableState);

  return (
    <>
      <TableConfig {...tableState.config} {...saveHandlers} />
      <DataTable {...tableState.fields} {...tableState.fieldHandlers} />
      {/* 其他表格相关组件 */}
    </>
  );
}

// src/components/App/containers/SavedTablesContainer.tsx
export function SavedTablesContainer() {
  const savedTables = useSavedTables();
  const dialogState = useDialogState<'save' | 'rename' | 'delete' | 'load'>();

  return (
    <>
      <SavedTablesDrawer {...savedTables} />
      <SaveDialog {...dialogState.save} {...savedTables.handlers} />
      <RenameDialog {...dialogState.rename} {...savedTables.handlers} />
      {/* 其他对话框 */}
    </>
  );
}

// src/components/App/index.tsx (重构后)
export function App() {
  return (
    <div>
      <Header />
      <div className="flex">
        <SavedTablesContainer />
        <TableManagementContainer />
      </div>
      <DDLOutputContainer />
    </div>
  );
}
```

```typescript
// 方案2: 使用Context API减少props drilling

// src/contexts/TableContext.tsx
interface TableContextValue {
  config: TableConfig;
  fields: FieldState;
  indexes: IndexState;
  actions: TableActions;
}

export const TableContext = createContext<TableContextValue | null>(null);

export function TableProvider({ children }) {
  const value = useTableState(); // 整合所有table相关状态
  return (
    <TableContext.Provider value={value}>
      {children}
    </TableContext.Provider>
  );
}

// 使用
export function DataTable() {
  const { fields, actions } = useContext(TableContext)!;
  // 不需要从props传递
}
```

---

#### 1.2 状态管理混乱 - 过度使用useState

**位置**: `src/components/App/index.tsx:108-512`

**问题描述**:
```typescript
// 基础配置状态 (4个)
const [tableName, setTableName] = useState('');
const [tableComment, setTableComment] = useState('');
const [dbType, setDbType] = useState<DatabaseType>('mysql');
const [addCount, setAddCount] = useState<number>(10);

// UI状态 (6个)
const [showChangelog, setShowChangelog] = useState(false);
const [showFireworks, setShowFireworks] = useState(false);
const [activeTab, setActiveTab] = useState<string>('fields');
const [savedTablesDrawerOpen, setSavedTablesDrawerOpen] = useState(false);

// 已保存表状态 (10个)
const [loadedTableNormalizedName, setLoadedTableNormalizedName] = useState<string | null>(null);
const [loadedTableName, setLoadedTableName] = useState<string | null>(null);
const [loadedTableSignature, setLoadedTableSignature] = useState<string | null>(null);
const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
const [saveName, setSaveName] = useState('');
const [saveError, setSaveError] = useState('');
const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
const [renameName, setRenameName] = useState('');
const [renameError, setRenameError] = useState('');
const [renameTarget, setRenameTarget] = useState<SavedTableSummary | null>(null);

// 对话框状态 (12个)
const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
const [deleteTarget, setDeleteTarget] = useState<SavedTableSummary | null>(null);
const [isLoadConfirmOpen, setIsLoadConfirmOpen] = useState(false);
const [pendingLoadTarget, setPendingLoadTarget] = useState<SavedTableSummary | null>(null);
// ... 还有8个类似的对话框状态

// 文件夹状态 (4个)
const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
const [folderDialogMode, setFolderDialogMode] = useState<'create' | 'rename'>('create');
const [folderDialogParent, setFolderDialogParent] = useState<FolderTreeNode | null>(null);
const [folderDialogTarget, setFolderDialogTarget] = useState<FolderTreeNode | null>(null);

// 模板状态 (3个)
const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);
const [isCreateTemplateDialogOpen, setIsCreateTemplateDialogOpen] = useState(false);
const [selectedFieldsForTemplate, setSelectedFieldsForTemplate] = useState<typeof rows>([]);

// 其他对话框状态 (3个)
const [isDiffDialogOpen, setIsDiffDialogOpen] = useState(false);
const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
const [isReviewHistoryOpen, setIsReviewHistoryOpen] = useState(false);
const [isStorageEstimatorOpen, setIsStorageEstimatorOpen] = useState(false);
const [isAIGenerateDialogOpen, setIsAIGenerateDialogOpen] = useState(false);
```

**问题分析**:
1. **状态碎片化**: 42个独立状态难以统一管理和追踪
2. **逻辑重复**: 12个对话框都使用相同的模式(isOpen, data, error, handlers)
3. **状态同步困难**: 多个相关状态需要手动同步(如loadedTable的3个状态)
4. **性能问题**: 任何状态变更都会触发整个App组件重新渲染
5. **测试困难**: 需要模拟42个状态才能测试一个功能

**重构方案 - 使用useReducer**:

```typescript
// src/contexts/AppContext.tsx
interface AppState {
  // 表配置
  tableConfig: {
    name: string;
    comment: string;
    dbType: DatabaseType;
  };

  // UI状态
  ui: {
    activeTab: string;
    drawerOpen: boolean;
  };

  // 对话框状态 (统一管理)
  dialogs: {
    save: { open: boolean; data?: SaveDialogData };
    rename: { open: boolean; data?: RenameDialogData };
    delete: { open: boolean; data?: DeleteDialogData };
    load: { open: boolean; data?: LoadDialogData };
    folder: { open: boolean; mode: 'create' | 'rename'; data?: FolderDialogData };
    // ... 其他对话框
  };

  // 已加载表状态
  loadedTable: {
    normalizedName: string | null;
    name: string | null;
    signature: string | null;
    isDirty: boolean;
  };
}

type AppAction =
  | { type: 'SET_TABLE_NAME'; payload: string }
  | { type: 'SET_TABLE_COMMENT'; payload: string }
  | { type: 'OPEN_DIALOG'; payload: { dialog: keyof AppState['dialogs']; data?: any } }
  | { type: 'CLOSE_DIALOG'; payload: keyof AppState['dialogs'] }
  | { type: 'LOAD_TABLE'; payload: SavedTable }
  | { type: 'UNLOAD_TABLE' }
  // ... 其他actions

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_TABLE_NAME':
      return {
        ...state,
        tableConfig: { ...state.tableConfig, name: action.payload }
      };
    case 'OPEN_DIALOG':
      return {
        ...state,
        dialogs: {
          ...state.dialogs,
          [action.payload.dialog]: { open: true, data: action.payload.data }
        }
      };
    case 'CLOSE_DIALOG':
      return {
        ...state,
        dialogs: {
          ...state.dialogs,
          [action.payload]: { open: false, data: undefined }
        }
      };
    // ... 其他cases
    default:
      return state;
  }
}

// 使用
export function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // 打开对话框
  const handleOpenSave = () => {
    dispatch({ type: 'OPEN_DIALOG', payload: { dialog: 'save' } });
  };

  // 关闭对话框
  const handleCloseSave = () => {
    dispatch({ type: 'CLOSE_DIALOG', payload: 'save' });
  };

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {/* 组件树 */}
    </AppContext.Provider>
  );
}
```

**重构方案 - 考虑状态管理库**:

```typescript
// 方案2: 使用Zustand (推荐)
// src/stores/appStore.ts
import { create } from 'zustand';

interface AppStore {
  // 表配置
  tableName: string;
  setTableName: (name: string) => void;

  // 对话框状态 (使用map统一管理)
  dialogs: Record<string, { open: boolean; data?: any }>;
  openDialog: (name: string, data?: any) => void;
  closeDialog: (name: string) => void;

  // 已加载表
  loadedTable: LoadedTable | null;
  loadTable: (table: LoadedTable) => void;
  unloadTable: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  tableName: '',
  setTableName: (name) => set({ tableName: name }),

  dialogs: {},
  openDialog: (name, data) =>
    set((state) => ({
      dialogs: { ...state.dialogs, [name]: { open: true, data } }
    })),
  closeDialog: (name) =>
    set((state) => ({
      dialogs: { ...state.dialogs, [name]: { open: false } }
    })),

  loadedTable: null,
  loadTable: (table) => set({ loadedTable: table }),
  unloadTable: () => set({ loadedTable: null }),
}));

// 使用
export function SaveDialog() {
  const { dialogs, closeDialog } = useAppStore();
  const isOpen = dialogs.save?.open ?? false;

  return (
    <Dialog open={isOpen} onOpenChange={() => closeDialog('save')}>
      {/* 内容 */}
    </Dialog>
  );
}
```

---

#### 1.3 对话框处理逻辑重复严重

**位置**: `src/components/App/index.tsx:758-971`

**问题描述**:

32个对话框的处理逻辑高度相似,但每个都重复实现:

```typescript
// 保存对话框 (示例1)
const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
const [saveName, setSaveName] = useState('');
const [saveError, setSaveError] = useState('');

const handleOpenSaveDialog = useCallback(() => {
  const defaultName = loadedTableName || tableName.trim() || DEFAULT_SAVED_TABLE_NAME;
  setSaveName(defaultName);
  setSaveError('');
  setIsSaveDialogOpen(true);
}, [loadedTableName, tableName]);

const handleSaveDialogOpenChange = useCallback((open: boolean) => {
  setIsSaveDialogOpen(open);
  if (!open) {
    setSaveError('');
  }
}, []);

const handleConfirmSave = useCallback(async () => {
  // ... 业务逻辑
  setIsSaveDialogOpen(false);
  setSaveError('');
}, [...]);

// 重命名对话框 (示例2) - 完全相同的模式
const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
const [renameName, setRenameName] = useState('');
const [renameError, setRenameError] = useState('');
const [renameTarget, setRenameTarget] = useState<SavedTableSummary | null>(null);

const handleOpenRenameDialog = useCallback((item: SavedTableSummary) => {
  setRenameTarget(item);
  setRenameName(item.name);
  setRenameError('');
  setIsRenameDialogOpen(true);
}, []);

const handleRenameDialogOpenChange = useCallback((open: boolean) => {
  setIsRenameDialogOpen(open);
  if (!open) {
    setRenameTarget(null);
    setRenameError('');
  }
}, []);

const handleConfirmRename = useCallback(async () => {
  // ... 业务逻辑
  setIsRenameDialogOpen(false);
  setRenameTarget(null);
  setRenameError('');
}, [...]);
```

**重复模式**:
- 每个对话框4个state: isOpen + data + error + target
- 每个对话框3个handlers: open + close + confirm
- 完全相同的状态管理和清理逻辑

**重构方案 - 提取通用Hook**:

```typescript
// src/hooks/useDialogState.ts
interface UseDialogStateOptions<T> {
  onOpen?: (data?: T) => void;
  onClose?: () => void;
  onConfirm?: (data: T) => void | Promise<void>;
}

interface DialogState<T> {
  isOpen: boolean;
  data: T | null;
  error: string;
}

interface DialogHandlers<T> {
  open: (data?: T) => void;
  close: () => void;
  confirm: () => Promise<void>;
  setError: (error: string) => void;
}

export function useDialogState<T = any>(
  options: UseDialogStateOptions<T> = {}
): [DialogState<T>, DialogHandlers<T>] {
  const [state, setState] = useState<DialogState<T>>({
    isOpen: false,
    data: null,
    error: '',
  });

  const handlers = useMemo<DialogHandlers<T>>(
    () => ({
      open: (data) => {
        setState({ isOpen: true, data: data || null, error: '' });
        options.onOpen?.(data);
      },

      close: () => {
        setState({ isOpen: false, data: null, error: '' });
        options.onClose?.();
      },

      confirm: async () => {
        if (!state.data) return;
        try {
          await options.onConfirm?.(state.data);
          setState({ isOpen: false, data: null, error: '' });
        } catch (error) {
          setState((prev) => ({
            ...prev,
            error: error instanceof Error ? error.message : '操作失败',
          }));
        }
      },

      setError: (error) => {
        setState((prev) => ({ ...prev, error }));
      },
    }),
    [state.data, options]
  );

  return [state, handlers];
}

// 使用示例
export function App() {
  // 保存对话框 - 从3个state + 3个handlers减少到1行
  const [saveDialog, saveHandlers] = useDialogState<SavedTableData>({
    onConfirm: async (data) => {
      const result = await saveTable(data.name, data.state);
      if (!result.ok) {
        throw new Error(result.message);
      }
    },
  });

  // 重命名对话框
  const [renameDialog, renameHandlers] = useDialogState<RenameData>({
    onConfirm: async (data) => {
      const result = await renameTable(data.normalizedName, data.newName);
      if (!result.ok) {
        throw new Error(result.message);
      }
    },
  });

  return (
    <>
      <Dialog open={saveDialog.isOpen} onOpenChange={saveHandlers.close}>
        <DialogContent>
          <Input
            value={saveDialog.data?.name || ''}
            onChange={(e) => saveHandlers.setError('')}
            disabled={saveDialog.data?.isUpdate}
          />
          {saveDialog.error && <p className="text-destructive">{saveDialog.error}</p>}
          <DialogFooter>
            <Button onClick={saveHandlers.close}>取消</Button>
            <Button onClick={saveHandlers.confirm}>确认</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameDialog.isOpen} onOpenChange={renameHandlers.close}>
        {/* 重命名对话框内容 */}
      </Dialog>
    </>
  );
}
```

**效果**:
- 代码量从~300行减少到~50行
- 消除了所有重复逻辑
- 统一的错误处理和状态管理
- 更容易测试

---

### P1 (High) - 重要设计问题

#### 2.1 Props Drilling问题严重

**位置**: `src/components/App/index.tsx:1594-1802`

**问题描述**:

大量props需要层层传递,导致中间组件充当"管道"角色:

```typescript
// 主组件向子组件传递大量props
<DataTable
  rows={rows}
  duplicateNameSet={duplicateNameSet}
  dbType={dbType}
  addCount={addCount}
  onRowsChange={handleRowsChange}
  onCreateRow={handleCreateRow}
  onRemoveRow={handleRemoveRow}
  onAddRows={handleAddRows}
  onAddCountChange={setAddCount}
  freezeEnabled={fieldTableFreezeEnabled}
  freezeColumns={fieldTableFreezeColumns}
  onFreezeEnabledChange={setFieldTableFreezeEnabled}
  onFreezeColumnsChange={setFieldTableFreezeColumns}
  isHighlighted={isFieldTableHighlighted}
  highlightedRowIndex={highlightedRowIndex}
  onOpenStorageEstimator={handleOpenStorageEstimator}
  toolbarLeft={dataTableToolbarLeft}
/>

<IndexPanel
  indexInput={indexInput}
  currentIndexFields={currentIndexFields}
  indexes={indexes}
  fieldSuggestions={fieldSuggestions}
  showFieldSuggestions={showFieldSuggestions}
  selectedSuggestionIndex={selectedSuggestionIndex}
  onIndexInputChange={setIndexInput}
  onSetShowFieldSuggestions={setShowFieldSuggestions}
  onSetSelectedSuggestionIndex={setSelectedSuggestionIndex}
  onAddFieldToIndex={addFieldToIndex}
  onRemoveFieldFromIndex={removeFieldFromIndex}
  onToggleFieldDirection={toggleFieldDirection}
  onAddIndex={(unique, primary) => addIndex(!!unique, primary)}
  onRemoveIndex={removeIndex}
  onUpdateIndexName={updateIndexName}
  animatingIndexIds={animatingIndexIds}
  removingIndexIds={removingIndexIds}
/>
```

**问题分析**:
- DataTable接收16个props
- IndexPanel接收15个props
- 每增加一个功能需要修改多个组件的props接口
- 组件复用困难(需要传递大量props)

**重构方案 - 组合模式 + Context**:

```typescript
// 方案1: 使用Context组合
// src/contexts/FieldTableContext.tsx
interface FieldTableContextValue {
  state: {
    rows: FieldRow[];
    duplicateNameSet: Set<string>;
    freezeConfig: FreezeConfig;
  };
  actions: {
    updateRows: (rows: FieldRow[]) => void;
    addRow: () => void;
    removeRow: (index: number) => void;
  };
}

export const FieldTableContext = createContext<FieldTableContextValue | null>(null);

export function useFieldTable() {
  const context = useContext(FieldTableContext);
  if (!context) throw new Error('useFieldTable must be used within FieldTableProvider');
  return context;
}

// src/components/App/DataTable.tsx (重构后)
export function DataTable() {
  const { state, actions } = useFieldTable();
  // 不需要任何props,直接使用context
  return (
    <HotTable
      data={state.rows}
      afterChange={(changes) => actions.updateRows(/* ... */)}
    />
  );
}

// 方案2: 使用Compound Components模式
// src/components/App/FieldTable.tsx
export function FieldTable({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<FieldRow[]>([]);
  const [freezeConfig, setFreezeConfig] = useState<FreezeConfig>(defaultConfig);

  return (
    <FieldTableContext.Provider value={{ rows, setRows, freezeConfig, setFreezeConfig }}>
      {children}
    </FieldTableContext.Provider>
  );
}

FieldTable.Grid = function Grid() {
  const { rows, freezeConfig } = useFieldTable();
  return <HotTable data={rows} settings={freezeConfig} />;
};

FieldTable.Toolbar = function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>;
};

FieldTable.FreezeControl = function FreezeControl() {
  const { freezeConfig, setFreezeConfig } = useFieldTable();
  return (
    <Switch
      checked={freezeConfig.enabled}
      onCheckedChange={(enabled) => setFreezeConfig({ ...freezeConfig, enabled })}
    />
  );
};

// 使用
<FieldTable>
  <FieldTable.Toolbar>
    <FieldTable.FreezeControl />
    <ApplyTemplateButton />
  </FieldTable.Toolbar>
  <FieldTable.Grid />
</FieldTable>
```

---

#### 2.2 缺乏明确的组件层级和边界

**当前组件树**:
```
App (1979行)
├── Header (外层组件)
├── SavedTablesDrawer (524行) - 独立功能域
├── FolderDialogs (185行)
├── TemplateManagerDialog (782行) - 独立功能域
├── AIGenerateDialog (407行) - 独立功能域
├── TableConfig (228行)
├── Tabs (主容器)
│   ├── DataTable (464行)
│   ├── IndexPanel (345行)
│   ├── AuthPanel
│   ├── ShardingPanel
│   ├── PartitionPanel (436行)
│   └── TableOptionsPanel (226行)
├── DDLOutput (282行)
└── 32个Dialog组件
```

**问题**:
1. App组件职责不清: 同时负责布局、状态管理、业务逻辑
2. 缺少中间层容器组件: 所有状态都在顶层,没有分层
3. 功能域边界模糊: 保存表、模板管理、AI生成等功能混在一起

**推荐的组件树**:
```
App (布局容器, <100行)
├── AppProviders (Context Providers)
├── Header
├── MainContent (布局)
│   ├── Sidebar (左侧边栏容器)
│   │   ├── SavedTablesSection
│   │   │   ├── SavedTablesList
│   │   │   ├── FolderTree
│   │   │   └── FolderDialogs
│   │   └── TemplatesSection
│   │       ├── TemplateList
│   │       └── TemplateEditor
│   └── Workspace (右侧工作区)
│       ├── TableBuilder (表构建器容器)
│       │   ├── TableConfig
│       │   ├── FieldTableSection
│       │   │   ├── FieldTableToolbar
│       │   │   └── DataTable
│       │   ├── IndexSection
│       │   │   └── IndexPanel
│       │   ├── AuthSection
│       │   │   └── AuthPanel
│       │   └── AdvancedOptions
│       │       ├── ShardingPanel
│       │       ├── PartitionPanel
│       │       └── TableOptionsPanel
│       └── OutputSection (输出区域容器)
│           ├── DDLOutput
│           └── ReviewPanel
└── GlobalDialogs (全局对话框)
    ├── SaveTableDialog
    ├── RenameDialog
    ├── DeleteDialog
    ├── AIGenerateDialog
    └── ...
```

**实现示例**:
```typescript
// src/components/App/index.tsx (重构后)
export function App() {
  return (
    <AppProviders>
      <div className="min-h-screen bg-background">
        <Header />
        <MainContent />
        <GlobalDialogs />
        <ToastContainer />
      </div>
    </AppProviders>
  );
}

// src/components/App/MainContent.tsx
export function MainContent() {
  return (
    <div className="flex">
      <Sidebar />
      <Workspace />
    </div>
  );
}

// src/components/App/Workspace/index.tsx
export function Workspace() {
  return (
    <div className="flex-1">
      <TableBuilder />
      <OutputSection />
    </div>
  );
}

// 每个容器组件只负责自己领域的状态和逻辑
```

---

#### 2.3 自定义Hooks职责不清

**问题分析**:

19个自定义hooks中,部分职责划分不清晰:

```typescript
// useTableData - 混合了数据和UI逻辑
export function useTableData(initialRows, persistedRows) {
  const [rows, setRows] = useState(initialRows);
  const [initialized, setInitialized] = useState(false); // UI状态

  // 数据处理逻辑
  const duplicateNameSet = useMemo(...);
  const normalizedFields = useMemo(...);

  // UI交互逻辑
  const handleRowsChange = useCallback(...);
  const handleCreateRow = useCallback(...);
  const handleRemoveRow = useCallback(...);

  return {
    rows,
    duplicateNameSet,
    normalizedFields,
    handleRowsChange,
    handleCreateRow,
    handleRemoveRow,
    setRows,
  };
}

// useIndexManagement - 混合了业务逻辑和UI状态
export function useIndexManagement(tableName, availableFields, persistedState, dbType) {
  const [indexInput, setIndexInput] = useState(''); // UI状态
  const [currentIndexFields, setCurrentIndexFields] = useState([]);
  const [indexes, setIndexes] = useState([]); // 业务数据
  const [showFieldSuggestions, setShowFieldSuggestions] = useState(false); // UI状态
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0); // UI状态
  const [initialized, setInitialized] = useState(false); // UI状态

  // 混合了索引业务逻辑和UI建议框逻辑
  const fieldSuggestions = useMemo(...);

  return {
    indexInput, // UI
    currentIndexFields, // UI临时状态
    indexes, // 业务数据
    fieldSuggestions, // UI
    showFieldSuggestions, // UI
    selectedSuggestionIndex, // UI
    setIndexInput, // UI
    setCurrentIndexFields, // UI
    setShowFieldSuggestions, // UI
    setSelectedSuggestionIndex, // UI
    addFieldToIndex, // 业务逻辑
    removeFieldFromIndex, // 业务逻辑
    toggleFieldDirection, // 业务逻辑
    addIndex, // 业务逻辑
    removeIndex, // 业务逻辑
    updateIndexName, // 业务逻辑
    resetIndexState, // 业务逻辑
    setIndexes, // 业务逻辑
  };
}
```

**重构建议 - 分离数据逻辑和UI逻辑**:

```typescript
// 方案1: 按职责分离hooks

// src/hooks/useFieldData.ts (纯数据逻辑)
export function useFieldData(initialFields: FieldRow[]) {
  const [fields, setFields] = useState<FieldRow[]>(initialFields);

  const duplicateNameSet = useMemo(() => {
    // 纯数据处理
  }, [fields]);

  const normalizedFields = useMemo(() => {
    // 纯数据处理
  }, [fields]);

  const addField = useCallback((field: FieldRow) => {
    setFields(prev => [...prev, field]);
  }, []);

  const removeField = useCallback((index: number) => {
    setFields(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateField = useCallback((index: number, updates: Partial<FieldRow>) => {
    setFields(prev => prev.map((f, i) => i === index ? { ...f, ...updates } : f));
  }, []);

  return {
    fields,
    duplicateNameSet,
    normalizedFields,
    actions: { addField, removeField, updateField }
  };
}

// src/hooks/useFieldTableUI.ts (UI交互逻辑)
export function useFieldTableUI(fieldData: ReturnType<typeof useFieldData>) {
  const [freezeConfig, setFreezeConfig] = useState<FreezeConfig>(defaultConfig);
  const [highlightedRow, setHighlightedRow] = useState<number | null>(null);

  const handleRowsChange = useCallback((changes: CellChange[]) => {
    // Handsontable变更处理
    changes.forEach(([rowIndex, , , value]) => {
      fieldData.actions.updateField(rowIndex, { [prop]: value });
    });
  }, [fieldData.actions]);

  return {
    freezeConfig,
    setFreezeConfig,
    highlightedRow,
    setHighlightedRow,
    handleRowsChange,
  };
}

// src/components/DataTable.tsx
export function DataTable() {
  const fieldData = useFieldData(INITIAL_ROWS);
  const uiState = useFieldTableUI(fieldData);

  return (
    <>
      <FreezeControl config={uiState.freezeConfig} onChange={uiState.setFreezeConfig} />
      <HotTable
        data={fieldData.fields}
        afterChange={uiState.handleRowsChange}
        highlightRow={uiState.highlightedRow}
      />
    </>
  );
}

// 方案2: 使用useImmer简化状态更新
import { useImmer } from 'use-immer';

export function useFieldData(initialFields: FieldRow[]) {
  const [fields, updateFields] = useImmer<FieldRow[]>(initialFields);

  const updateField = useCallback((index: number, updates: Partial<FieldRow>) => {
    updateFields(draft => {
      draft[index] = { ...draft[index], ...updates };
    });
  }, [updateFields]);

  const addField = useCallback((field: FieldRow) => {
    updateFields(draft => {
      draft.push(field);
    });
  }, [updateFields]);

  return { fields, updateField, addField };
}
```

---

## 3. 组件拆分方案

### 当前组件树分析

```
App (1979行, 42个useState)
├── 状态管理: 42个useState + 19个hooks
├── 业务逻辑: 32个对话框处理器 + 15个业务handler
├── UI渲染: 20+个子组件 + 大量JSX
└── 生命周期: 10个useEffect
```

**职责混乱度评分**: ⭐⭐⭐⭐⭐ (5/5 - 极度混乱)

### 推荐的新组件树

```
App (<100行)
├── AppProviders (Context/Store设置)
├── AppLayout (布局容器)
│   ├── Header
│   ├── AppRouter (路由,如使用)
│   └── MainContent
└── GlobalOverlays (全局覆盖层)
    ├── ToastContainer
    ├── DialogContainer
    └── FireworksOverlay

MainContent
├── TableManagementPage (主功能页面)
│   ├── TableEditor (表格编辑器)
│   │   ├── TableConfigPanel
│   │   ├── FieldTableSection
│   │   ├── IndexSection
│   │   └── AdvancedOptions
│   └── OutputPanel (输出面板)
│       ├── DDLOutput
│       └── DDLReview
│
├── SavedTablesPage (已保存表页面,或作为Drawer)
│   ├── SavedTablesList
│   ├── FolderTree
│   └── TableActions (CRUD)
│
└── TemplatesPage (模板管理,或作为Dialog)
    ├── TemplateList
    └── TemplateEditor
```

### 拆分步骤 (分阶段实施)

#### 阶段1: 提取Dialog管理逻辑 (1-2天)

**目标**: 创建通用的Dialog管理hook,减少重复代码

```typescript
// src/hooks/useDialogState.ts (已在上文展示)
// src/hooks/useDialogManager.ts (管理多个对话框)
interface DialogManagerState {
  dialogs: Record<string, DialogState>;
}

export function useDialogManager() {
  const [dialogs, setDialogs] = useState<DialogManagerState>({});

  const openDialog = useCallback((name: string, data?: any) => {
    setDialogs(prev => ({
      ...prev,
      [name]: { open: true, data, error: '' }
    }));
  }, []);

  const closeDialog = useCallback((name: string) => {
    setDialogs(prev => ({
      ...prev,
      [name]: { open: false, data: undefined, error: '' }
    }));
  }, []);

  const isDialogOpen = useCallback((name: string) => {
    return dialogs[name]?.open ?? false;
  }, [dialogs]);

  const getDialogData = useCallback((name: string) => {
    return dialogs[name]?.data;
  }, [dialogs]);

  return {
    dialogs,
    openDialog,
    closeDialog,
    isDialogOpen,
    getDialogData,
  };
}

// 使用
export function App() {
  const dialogs = useDialogManager();

  return (
    <>
      <Button onClick={() => dialogs.openDialog('save')}>保存</Button>
      <Button onClick={() => dialogs.openDialog('rename', { id: 1 })}>重命名</Button>

      <SaveDialog
        open={dialogs.isDialogOpen('save')}
        data={dialogs.getDialogData('save')}
        onClose={() => dialogs.closeDialog('save')}
      />
      <RenameDialog
        open={dialogs.isDialogOpen('rename')}
        data={dialogs.getDialogData('rename')}
        onClose={() => dialogs.closeDialog('rename')}
      />
    </>
  );
}
```

**收益**:
- 消除300+行重复代码
- 统一对话框状态管理
- 更容易添加新对话框

---

#### 阶段2: 拆分功能域容器组件 (3-5天)

**目标**: 按功能域创建独立的容器组件

```typescript
// src/components/App/containers/TableBuilderContainer.tsx
export function TableBuilderContainer() {
  const tableState = useTableState();
  const fieldState = useFieldState();
  const indexState = useIndexState();

  return (
    <TableBuilderContext.Provider value={{ tableState, fieldState, indexState }}>
      <TableConfig />
      <Tabs defaultValue="fields">
        <TabsList>
          <TabsTrigger value="fields">字段配置</TabsTrigger>
          <TabsTrigger value="indexes">索引配置</TabsTrigger>
        </TabsList>
        <TabsContent value="fields">
          <FieldTableSection />
        </TabsContent>
        <TabsContent value="indexes">
          <IndexSection />
        </TabsContent>
      </Tabs>
    </TableBuilderContext.Provider>
  );
}

// src/components/App/containers/SavedTablesContainer.tsx
export function SavedTablesContainer() {
  const savedTables = useSavedTables();
  const folders = useFolders();
  const dialogs = useDialogManager();

  return (
    <SavedTablesContext.Provider value={{ savedTables, folders, dialogs }}>
      <SavedTablesDrawer />
      <SaveTableDialog />
      <RenameTableDialog />
      <DeleteTableDialog />
      <FolderDialogs />
    </SavedTablesContext.Provider>
  );
}

// src/components/App/containers/OutputContainer.tsx
export function OutputContainer() {
  const { generatedSql, generatedDcl } = useSqlGeneration();
  const { review, startReview, applySuggestion } = useDDLReview();

  return (
    <OutputContext.Provider value={{ generatedSql, generatedDcl, review, startReview, applySuggestion }}>
      <DDLOutput />
      <ReviewPanel />
    </OutputContext.Provider>
  );
}

// src/components/App/index.tsx (重构后)
export function App() {
  return (
    <AppProviders>
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex">
          <SavedTablesContainer />
          <div className="flex-1">
            <TableBuilderContainer />
            <OutputContainer />
          </div>
        </div>
      </div>
    </AppProviders>
  );
}
```

**收益**:
- 主组件从1979行减少到~100行
- 每个容器组件职责单一
- 状态局部化,减少不必要的重渲染

---

#### 阶段3: 引入状态管理库 (可选,5-7天)

**目标**: 使用Zustand或Jotai统一管理全局状态

```typescript
// src/stores/tableStore.ts
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface TableState {
  // 表配置
  config: {
    name: string;
    comment: string;
    dbType: DatabaseType;
  };

  // 字段
  fields: FieldRow[];

  // 索引
  indexes: IndexDefinition[];

  // 操作
  setConfig: (config: Partial<TableState['config']>) => void;
  setFields: (fields: FieldRow[]) => void;
  addField: (field: FieldRow) => void;
  updateField: (index: number, updates: Partial<FieldRow>) => void;
  removeField: (index: number) => void;
  addIndex: (index: IndexDefinition) => void;
  removeIndex: (id: string) => void;
}

export const useTableStore = create<TableState>()(
  immer((set) => ({
    config: {
      name: '',
      comment: '',
      dbType: 'mysql',
    },
    fields: INITIAL_ROWS,
    indexes: [],

    setConfig: (config) =>
      set((state) => {
        state.config = { ...state.config, ...config };
      }),

    setFields: (fields) =>
      set((state) => {
        state.fields = fields;
      }),

    addField: (field) =>
      set((state) => {
        state.fields.push(field);
      }),

    updateField: (index, updates) =>
      set((state) => {
        state.fields[index] = { ...state.fields[index], ...updates };
      }),

    removeField: (index) =>
      set((state) => {
        state.fields.splice(index, 1);
      }),

    addIndex: (index) =>
      set((state) => {
        state.indexes.push(index);
      }),

    removeIndex: (id) =>
      set((state) => {
        state.indexes = state.indexes.filter((idx) => idx.id !== id);
      }),
  }))
);

// 使用 - 不再需要props drilling
export function DataTable() {
  const fields = useTableStore((state) => state.fields);
  const updateField = useTableStore((state) => state.updateField);
  const removeField = useTableStore((state) => state.removeField);

  return (
    <HotTable
      data={fields}
      afterChange={(changes) => {
        changes.forEach(([rowIndex, prop, , value]) => {
          updateField(rowIndex, { [prop]: value });
        });
      }}
    />
  );
}

export function IndexPanel() {
  const indexes = useTableStore((state) => state.indexes);
  const addIndex = useTableStore((state) => state.addIndex);
  const removeIndex = useTableStore((state) => state.removeIndex);

  return (
    <div>
      {indexes.map((index) => (
        <IndexItem
          key={index.id}
          index={index}
          onRemove={() => removeIndex(index.id)}
        />
      ))}
      <Button onClick={() => addIndex(newIndex)}>添加索引</Button>
    </div>
  );
}
```

**收益**:
- 消除所有props drilling
- 状态更新逻辑集中管理
- 自动优化重渲染(selectors)
- 易于调试(DevTools)
- 状态持久化简单

---

#### 阶段4: 优化组件通信 (3-4天)

**目标**: 使用事件总线或观察者模式处理跨组件通信

```typescript
// src/utils/eventBus.ts
type EventHandler<T = any> = (data: T) => void;

class EventBus {
  private events: Map<string, Set<EventHandler>> = new Map();

  on<T = any>(event: string, handler: EventHandler<T>): () => void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(handler);

    // 返回取消订阅函数
    return () => this.off(event, handler);
  }

  off<T = any>(event: string, handler: EventHandler<T>): void {
    const handlers = this.events.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  emit<T = any>(event: string, data?: T): void {
    const handlers = this.events.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(data));
    }
  }

  once<T = any>(event: string, handler: EventHandler<T>): void {
    const onceHandler: EventHandler<T> = (data) => {
      handler(data);
      this.off(event, onceHandler);
    };
    this.on(event, onceHandler);
  }
}

export const eventBus = new EventBus();

// 定义事件类型
export const Events = {
  TABLE_SAVED: 'table:saved',
  TABLE_LOADED: 'table:loaded',
  TABLE_DELETED: 'table:deleted',
  FIELD_ADDED: 'field:added',
  INDEX_ADDED: 'index:added',
  DDL_GENERATED: 'ddl:generated',
  REVIEW_COMPLETED: 'review:completed',
} as const;

// 使用示例
export function SaveTableDialog() {
  const { saveTable } = useSavedTables();

  const handleSave = async (data: SaveData) => {
    const result = await saveTable(data);
    if (result.ok) {
      // 通知其他组件表已保存
      eventBus.emit(Events.TABLE_SAVED, { name: result.name });
    }
  };

  return <Dialog onSave={handleSave} />;
}

export function SavedTablesList() {
  const [tables, setTables] = useState<SavedTable[]>([]);

  useEffect(() => {
    // 监听表保存事件,刷新列表
    const unsubscribe = eventBus.on(Events.TABLE_SAVED, () => {
      refreshTables();
    });

    return unsubscribe;
  }, []);

  return <TableList items={tables} />;
}
```

**使用场景**:
- 保存表后刷新列表
- 加载表后更新UI状态
- DDL生成后触发评审
- 字段变更后更新索引建议

**替代方案 - 使用React Context + useSyncExternalStore**:
```typescript
// src/stores/createTableStore.ts
import { createStore, useStore } from 'zustand/vanilla';

export const tableStore = createStore<TableState>((set) => ({
  fields: [],
  addField: (field) => set((state) => ({ fields: [...state.fields, field] })),
}));

// 在React组件中使用
export function DataTable() {
  const fields = useStore(tableStore, (state) => state.fields);
  const addField = useStore(tableStore, (state) => state.addField);

  return <HotTable data={fields} />;
}
```

---

## 4. 状态管理优化

### 当前状态管理问题

#### 问题1: 状态分散且难以追踪

```typescript
// 当前状态组织方式 - 按类型分散
const [tableName, setTableName] = useState('');           // 表配置
const [tableComment, setTableComment] = useState('');     // 表配置
const [dbType, setDbType] = useState<DatabaseType>('mysql'); // 表配置
const [rows, setRows] = useState<FieldRow[]>([]);         // 字段数据
const [indexes, setIndexes] = useState<IndexDefinition[]>([]); // 索引数据
const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false); // UI状态
const [saveName, setSaveName] = useState('');            // UI状态
const [saveError, setSaveError] = useState('');          // UI状态
// ... 还有34个状态
```

**问题**:
- 相关状态分散在不同位置
- 难以理解状态之间的关系
- 状态更新逻辑分散在多个useCallback中

#### 问题2: 状态更新不一致

```typescript
// 更新表名需要同时更新多个地方
const handleTableNameChange = useCallback((name: string) => {
  setTableName(name);
  // 可能还需要更新索引名(因为索引名包含表名)
  updateIndexNames(name);
  // 可能还需要更新其他依赖表名的状态
}, [updateIndexNames]);

// 加载表时需要同步更新多个状态
const applySavedState = useCallback((state: PersistedState) => {
  setTableName(state.tableName ?? '');
  setTableComment(state.tableComment ?? '');
  setDbType(state.dbType ?? 'mysql');
  setRows(state.rows ?? INITIAL_ROWS);
  setIndexes(state.indexes ?? []);
  setAuthObjects(state.authObjects ?? []);
  // ... 还有10多个setState调用
}, [setRows, setIndexes, setAuthObjects, ...]);
```

#### 问题3: 缺乏状态持久化策略

当前使用usePersistedState hook手动管理localStorage同步:

```typescript
// 保存到localStorage
useEffect(() => {
  if (!hydrated) return;
  const payload = {
    tableName,
    tableComment,
    dbType,
    rows: normalizedRowsForPersist,
    indexes: sanitizedIndexesForPersist,
    // ... 还有8个字段
  };
  saveState(payload);
}, [hydrated, tableName, tableComment, dbType, /* ... */]);

// 从localStorage恢复
useEffect(() => {
  if (!hydrated || !persistedState) return;
  if (persistedState.tableName) setTableName(persistedState.tableName);
  if (persistedState.tableComment) setTableComment(persistedState.tableComment);
  if (persistedState.dbType) setDbType(persistedState.dbType);
  // ... 还有10多行
}, [hydrated, persistedState]);
```

### 推荐的状态管理方案

#### 方案1: Zustand (推荐 ⭐⭐⭐⭐⭐)

**优势**:
- ✅ 简单易学,API直观
- ✅ 基于immer,不可变更新简单
- ✅ 内置DevTools支持
- ✅ 支持持久化中间件
- ✅ 无需Provider包装
- ✅ TypeScript支持优秀
- ✅ 包体积小(~1KB)

**实现**:

```typescript
// src/stores/tableStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

// 状态切片类型
interface TableConfig {
  name: string;
  comment: string;
  dbType: DatabaseType;
}

interface FieldState {
  rows: FieldRow[];
  addCount: number;
  freezeEnabled: boolean;
  freezeColumns: number;
}

interface IndexState {
  indexes: IndexDefinition[];
  currentIndexFields: IndexField[];
  indexInput: string;
}

interface DialogState {
  save: { open: boolean; data?: SaveDialogData };
  rename: { open: boolean; data?: RenameDialogData };
  delete: { open: boolean; data?: DeleteDialogData };
  // ... 其他对话框
}

interface LoadedTableState {
  normalizedName: string | null;
  name: string | null;
  signature: string | null;
  isDirty: boolean;
}

// 主store
interface TableStore {
  // 状态
  config: TableConfig;
  fields: FieldState;
  indexes: IndexState;
  dialogs: DialogState;
  loadedTable: LoadedTableState;

  // Config actions
  setTableName: (name: string) => void;
  setTableComment: (comment: string) => void;
  setDbType: (type: DatabaseType) => void;

  // Field actions
  setRows: (rows: FieldRow[]) => void;
  addRow: (row: FieldRow) => void;
  updateRow: (index: number, updates: Partial<FieldRow>) => void;
  removeRow: (index: number) => void;
  setAddCount: (count: number) => void;

  // Index actions
  setIndexes: (indexes: IndexDefinition[]) => void;
  addIndex: (index: IndexDefinition) => void;
  removeIndex: (id: string) => void;
  updateIndexName: (id: string, name: string) => void;

  // Dialog actions
  openDialog: <T>(name: keyof DialogState, data?: T) => void;
  closeDialog: (name: keyof DialogState) => void;

  // Loaded table actions
  loadTable: (table: SavedTable) => void;
  unloadTable: () => void;
  markDirty: () => void;
}

export const useTableStore = create<TableStore>()(
  immer(
    persist(
      (set, get) => ({
        // 初始状态
        config: {
          name: '',
          comment: '',
          dbType: 'mysql',
        },
        fields: {
          rows: INITIAL_ROWS,
          addCount: 10,
          freezeEnabled: true,
          freezeColumns: 3,
        },
        indexes: {
          indexes: [],
          currentIndexFields: [],
          indexInput: '',
        },
        dialogs: {
          save: { open: false },
          rename: { open: false },
          delete: { open: false },
        },
        loadedTable: {
          normalizedName: null,
          name: null,
          signature: null,
          isDirty: false,
        },

        // Config actions
        setTableName: (name) =>
          set((state) => {
            state.config.name = name;
          }),

        setTableComment: (comment) =>
          set((state) => {
            state.config.comment = comment;
          }),

        setDbType: (dbType) =>
          set((state) => {
            state.config.dbType = dbType;
          }),

        // Field actions
        setRows: (rows) =>
          set((state) => {
            state.fields.rows = rows;
          }),

        addRow: (row) =>
          set((state) => {
            state.fields.rows.push(row);
          }),

        updateRow: (index, updates) =>
          set((state) => {
            state.fields.rows[index] = { ...state.fields.rows[index], ...updates };
          }),

        removeRow: (index) =>
          set((state) => {
            state.fields.rows.splice(index, 1);
          }),

        // Index actions
        addIndex: (index) =>
          set((state) => {
            state.indexes.indexes.push(index);
          }),

        removeIndex: (id) =>
          set((state) => {
            state.indexes.indexes = state.indexes.indexes.filter((idx) => idx.id !== id);
          }),

        // Dialog actions
        openDialog: (name, data) =>
          set((state) => {
            state.dialogs[name] = { open: true, data };
          }),

        closeDialog: (name) =>
          set((state) => {
            state.dialogs[name] = { open: false, data: undefined };
          }),

        // Loaded table actions
        loadTable: (table) =>
          set((state) => {
            state.loadedTable = {
              normalizedName: table.normalizedName,
              name: table.name,
              signature: JSON.stringify(table.state),
              isDirty: false,
            };
            // 同时更新其他状态
            state.config.name = table.state.tableName;
            state.config.comment = table.state.tableComment;
            state.config.dbType = table.state.dbType;
            state.fields.rows = table.state.rows;
            state.indexes.indexes = table.state.indexes;
          }),

        unloadTable: () =>
          set((state) => {
            state.loadedTable = {
              normalizedName: null,
              name: null,
              signature: null,
              isDirty: false,
            };
          }),

        markDirty: () =>
          set((state) => {
            state.loadedTable.isDirty = true;
          }),
      }),
      {
        name: 'ddlbuilder-storage', // localStorage key
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          // 只持久化部分状态
          config: state.config,
          fields: state.fields,
          indexes: state.indexes,
        }),
      }
    )
  )
);

// 选择器hooks (优化性能)
export function useTableName() {
  return useTableStore((state) => state.config.name);
}

export function useTableConfig() {
  return useTableStore((state) => state.config);
}

export function useFields() {
  return useTableStore((state) => state.fields.rows);
}

export function useFieldActions() {
  return useTableStore((state) => ({
    setRows: state.setRows,
    addRow: state.addRow,
    updateRow: state.updateRow,
    removeRow: state.removeRow,
  }));
}

export function useDialog(name: keyof DialogState) {
  const open = useTableStore((state) => state.dialogs[name]?.open ?? false);
  const data = useTableStore((state) => state.dialogs[name]?.data);
  const openDialog = useTableStore((state) => state.openDialog);
  const closeDialog = useTableStore((state) => state.closeDialog);

  return {
    open,
    data,
    onOpen: (data?: any) => openDialog(name, data),
    onClose: () => closeDialog(name),
  };
}

// 使用示例
export function DataTable() {
  const rows = useFields();
  const { updateRow, removeRow } = useFieldActions();

  return (
    <HotTable
      data={rows}
      afterChange={(changes) => {
        changes.forEach(([rowIndex, prop, , value]) => {
          updateRow(rowIndex, { [prop]: value });
        });
      }}
    />
  );
}

export function SaveDialog() {
  const { open, data, onClose } = useDialog('save');

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        {/* 使用data */}
      </DialogContent>
    </Dialog>
  );
}
```

---

#### 方案2: Jotai (备选 ⭐⭐⭐⭐)

**优势**:
- ✅ 原子化状态,更细粒度控制
- ✅ 无需定义复杂的状态树
- ✅ 支持派生atom
- ✅ TypeScript支持优秀
- ✅ 包体积小(~3KB)

**劣势**:
- ⚠️ 需要定义更多atoms
- ⚠️ 状态组织不如Zustand直观

**实现**:

```typescript
// src/atoms/tableAtoms.ts
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

// 原子化状态
export const tableNameAtom = atomWithStorage('tableName', '');
export const tableCommentAtom = atomWithStorage('tableComment', '');
export const dbTypeAtom = atomWithStorage<DatabaseType>('dbType', 'mysql');

export const rowsAtom = atomWithStorage<FieldRow[]>('rows', INITIAL_ROWS);
export const indexesAtom = atomWithStorage<IndexDefinition[]>('indexes', []);

// 派生atom
export const filledRowCountAtom = atom((get) => {
  const rows = get(rowsAtom);
  return rows.filter((row) => row.fieldName?.trim()).length;
});

export const indexStatsAtom = atom((get) => {
  const indexes = get(indexesAtom);
  return indexes.reduce(
    (acc, index) => {
      if (index.isPrimary) acc.primary += 1;
      else if (index.unique) acc.unique += 1;
      else acc.normal += 1;
      return acc;
    },
    { primary: 0, unique: 0, normal: 0 }
  );
});

// 只写atom (actions)
export const updateRowAtom = atom(
  null,
  (get, set, { index, updates }: { index: number; updates: Partial<FieldRow> }) => {
    const rows = get(rowsAtom);
    const newRows = [...rows];
    newRows[index] = { ...newRows[index], ...updates };
    set(rowsAtom, newRows);
  }
);

export const addIndexAtom = atom(
  null,
  (get, set, index: IndexDefinition) => {
    const indexes = get(indexesAtom);
    set(indexesAtom, [...indexes, index]);
  }
);

// 使用
export function DataTable() {
  const [rows, setRows] = useAtom(rowsAtom);
  const [, updateRow] = useAtom(updateRowAtom);

  return (
    <HotTable
      data={rows}
      afterChange={(changes) => {
        changes.forEach(([rowIndex, prop, , value]) => {
          updateRow({ index: rowIndex, updates: { [prop]: value } });
        });
      }}
    />
  );
}

export function IndexPanel() {
  const [indexes, setIndexes] = useAtom(indexesAtom);
  const [stats] = useAtom(indexStatsAtom);
  const [, addIndex] = useAtom(addIndexAtom);

  return (
    <div>
      <div>主键: {stats.primary}</div>
      <div>唯一索引: {stats.unique}</div>
      <div>普通索引: {stats.normal}</div>
      <Button onClick={() => addIndex(newIndex)}>添加索引</Button>
    </div>
  );
}
```

---

#### 方案3: Redux Toolkit (不推荐)

**劣势**:
- ❌ 样板代码多
- ❌ 学习曲线陡峭
- ❌ 对于当前应用规模过于重量级
- ❌ 配置复杂

**适用场景**:
- 大型企业应用(>50个开发者)
- 需要时间旅行调试
- 需要服务器端状态同步

---

### 迁移路径

#### 阶段1: 引入状态管理库 (1-2天)

```bash
# 安装Zustand
bun add zustand immer
bun add -D @types/spy-unit # 用于测试
```

```typescript
// src/stores/tableStore.ts - 先创建简单store
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useTableStore = create(
  persist(
    (set) => ({
      tableName: '',
      setTableName: (name: string) => set({ tableName: name }),
    }),
    { name: 'ddlbuilder-storage' }
  )
);

// 逐步迁移,不替换现有代码
export function App() {
  // 新代码使用store
  const tableName = useTableStore((state) => state.tableName);
  const setTableName = useTableStore((state) => state.setTableName);

  // 旧代码保持不变
  const [tableComment, setTableComment] = useState('');

  return <TableConfig tableName={tableName} onTableNameChange={setTableName} />;
}
```

#### 阶段2: 逐步迁移状态 (3-5天)

```typescript
// Day 1-2: 迁移表配置状态
// src/stores/tableStore.ts
export const useTableStore = create(
  persist(
    (set) => ({
      // 表配置
      tableName: '',
      tableComment: '',
      dbType: 'mysql',
      setTableName: (name) => set({ tableName: name }),
      setTableComment: (comment) => set({ tableComment: comment }),
      setDbType: (type) => set({ dbType: type }),
    }),
    { name: 'ddlbuilder-storage' }
  )
);

// Day 3-4: 迁移字段和索引状态
export const useTableStore = create(
  persist(
    (set) => ({
      // ... 表配置
      rows: INITIAL_ROWS,
      setRows: (rows) => set({ rows }),
      addRow: (row) => set((state) => ({ rows: [...state.rows, row] })),
      updateRow: (index, updates) => set((state) => {
        const newRows = [...state.rows];
        newRows[index] = { ...newRows[index], ...updates };
        return { rows: newRows };
      }),
      removeRow: (index) => set((state) => ({
        rows: state.rows.filter((_, i) => i !== index)
      })),

      indexes: [],
      setIndexes: (indexes) => set({ indexes }),
      addIndex: (index) => set((state) => ({ indexes: [...state.indexes, index] })),
      removeIndex: (id) => set((state) => ({
        indexes: state.indexes.filter((idx) => idx.id !== id)
      })),
    }),
    { name: 'ddlbuilder-storage' }
  )
);

// Day 5: 迁移对话框状态
export const useDialogStore = create((set) => ({
  dialogs: {
    save: { open: false, data: null },
    rename: { open: false, data: null },
    delete: { open: false, data: null },
  },
  openDialog: (name, data) => set((state) => ({
    dialogs: { ...state.dialogs, [name]: { open: true, data } }
  })),
  closeDialog: (name) => set((state) => ({
    dialogs: { ...state.dialogs, [name]: { open: false, data: null } }
  })),
}));
```

#### 阶段3: 移除旧代码 (2-3天)

```typescript
// 移除useState
- const [tableName, setTableName] = useState('');
- const [tableComment, setTableComment] = useState('');
- const [dbType, setDbType] = useState<DatabaseType>('mysql');
- // ... 移除所有42个useState

// 移除useEffect
- useEffect(() => {
-   if (persistedState?.tableName) setTableName(persistedState.tableName);
-   // ... 移除所有恢复逻辑
- }, [persistedState]);

// 简化组件
export function App() {
  return (
    <div>
      <Header />
      <TableBuilder />
      <OutputPanel />
      <GlobalDialogs />
    </div>
  );
}
```

#### 阶段4: 优化和测试 (2-3天)

```typescript
// 添加DevTools
import { devtools } from 'zustand/middleware';

export const useTableStore = create(
  devtools(
    persist(
      (set) => ({
        // ... 状态
      }),
      { name: 'ddlbuilder-storage' }
    ),
    { name: 'DDLBuilder Store' }
  )
);

// 编写迁移测试
describe('State Migration', () => {
  it('should migrate tableName from useState to zustand', () => {
    const { result } = renderHook(() => useTableStore());

    act(() => {
      result.current.setTableName('test_table');
    });

    expect(result.current.tableName).toBe('test_table');
  });

  it('should persist state to localStorage', () => {
    const { result } = renderHook(() => useTableStore());

    act(() => {
      result.current.setTableName('test_table');
    });

    expect(localStorage.getItem('ddlbuilder-storage')).toContain('test_table');
  });
});
```

---

## 5. 设计模式建议

### 5.1 容器/展示组件模式 (Container/Presentational Pattern)

**当前问题**: 混合了业务逻辑和UI渲染

**解决方案**:

```typescript
// ❌ 当前 - 混合逻辑和UI
export function IndexPanel() {
  const [indexes, setIndexes] = useState<IndexDefinition[]>([]);
  const [currentIndexFields, setCurrentIndexFields] = useState<IndexField[]>([]);
  const [indexInput, setIndexInput] = useState('');

  const addIndex = useCallback((unique: boolean) => {
    if (currentIndexFields.length === 0) return;
    const newIndex: IndexDefinition = {
      id: Date.now().toString(),
      name: buildIndexName(tableName, currentIndexFields),
      fields: currentIndexFields,
      unique,
    };
    setIndexes((prev) => [...prev, newIndex]);
    setCurrentIndexFields([]);
    setIndexInput('');
  }, [currentIndexFields, tableName]);

  return (
    <div>
      <IndexBuilder
        fields={currentIndexFields}
        input={indexInput}
        onAddField={addField}
        onRemoveField={removeField}
      />
      <IndexList indexes={indexes} onRemove={removeIndex} />
    </div>
  );
}

// ✅ 重构后 - 分离容器和展示组件
// src/components/App/containers/IndexPanelContainer.tsx
export function IndexPanelContainer() {
  const indexState = useIndexState();

  return (
    <IndexPanel
      indexes={indexState.indexes}
      currentIndexFields={indexState.currentIndexFields}
      indexInput={indexState.indexInput}
      fieldSuggestions={indexState.fieldSuggestions}
      onAddIndex={indexState.addIndex}
      onRemoveIndex={indexState.removeIndex}
      onAddFieldToIndex={indexState.addField}
      onRemoveFieldFromIndex={indexState.removeField}
      onIndexInputChange={indexState.setIndexInput}
    />
  );
}

// src/components/App/IndexPanel.tsx (展示组件)
export interface IndexPanelProps {
  indexes: IndexDefinition[];
  currentIndexFields: IndexField[];
  indexInput: string;
  fieldSuggestions: string[];
  onAddIndex: (unique: boolean) => void;
  onRemoveIndex: (id: string) => void;
  onAddFieldToIndex: (field: string) => void;
  onRemoveFieldFromIndex: (index: number) => void;
  onIndexInputChange: (value: string) => void;
}

export function IndexPanel(props: IndexPanelProps) {
  return (
    <div className="index-panel">
      <IndexBuilder
        fields={props.currentIndexFields}
        input={props.indexInput}
        suggestions={props.fieldSuggestions}
        onAddField={props.onAddFieldToIndex}
        onRemoveField={props.onRemoveFieldFromIndex}
        onInputChange={props.onIndexInputChange}
        onAddIndex={props.onAddIndex}
      />
      <IndexList indexes={props.indexes} onRemove={props.onRemoveIndex} />
    </div>
  );
}
```

**收益**:
- 展示组件可复用
- 业务逻辑集中管理
- 更容易测试

---

### 5.2 组合组件模式 (Compound Components Pattern)

**适用场景**: DataTable及其工具栏

**实现**:

```typescript
// src/components/App/FieldTable.tsx
interface FieldTableContextValue {
  rows: FieldRow[];
  duplicateNameSet: Set<string>;
  freezeConfig: FreezeConfig;
  actions: FieldTableActions;
}

const FieldTableContext = createContext<FieldTableContextValue | null>(null);

export function FieldTable({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<FieldRow[]>(INITIAL_ROWS);
  const [freezeConfig, setFreezeConfig] = useState<FreezeConfig>(defaultConfig);
  const duplicateNameSet = useDuplicateNameSet(rows);

  const actions = useMemo(
    () => ({
      updateRows: setRows,
      addRow: () => setRows((prev) => [...prev, createEmptyRow(prev.length)]),
      removeRow: (index: number) =>
        setRows((prev) => prev.filter((_, i) => i !== index)),
    }),
    []
  );

  return (
    <FieldTableContext.Provider value={{ rows, duplicateNameSet, freezeConfig, actions }}>
      {children}
    </FieldTableContext.Provider>
  );
}

// 子组件
FieldTable.Grid = function Grid() {
  const { rows, duplicateNameSet } = useFieldTableContext();
  return <HotTable data={rows} duplicateNameSet={duplicateNameSet} />;
};

FieldTable.Toolbar = function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2 mb-4">{children}</div>;
};

FieldTable.FreezeControl = function FreezeControl() {
  const { freezeConfig, actions } = useFieldTableContext();
  return (
    <Switch
      checked={freezeConfig.enabled}
      onCheckedChange={(enabled) => actions.setFreezeConfig({ ...freezeConfig, enabled })}
    />
  );
};

FieldTable.TemplateButton = function TemplateButton() {
  const { actions } = useFieldTableContext();
  return <ApplyTemplatePopover onApply={actions.applyTemplate} />;
};

// 使用
<FieldTable>
  <FieldTable.Toolbar>
    <FieldTable.FreezeControl />
    <FieldTable.TemplateButton />
    <AddRowsButton />
  </FieldTable.Toolbar>
  <FieldTable.Grid />
</FieldTable>
```

**收益**:
- 灵活的API
- 清晰的组件层级
- 减少props传递

---

### 5.3 自定义Hook模式

**当前问题**: Hooks职责不清

**解决方案**:

```typescript
// ✅ 单一职责的hooks

// src/hooks/useFieldData.ts - 纯数据逻辑
export function useFieldData(initialRows: FieldRow[]) {
  const [rows, setRows] = useState<FieldRow[]>(initialRows);

  const duplicateNameSet = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((r) => {
      const name = r.fieldName?.trim();
      if (!name) return;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    return new Set(
      Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([name]) => name)
    );
  }, [rows]);

  const normalizedFields = useMemo(() => normalizeFields(rows), [rows]);

  const actions = useMemo(
    () => ({
      setRows,
      addRow: (row: FieldRow) => setRows((prev) => [...prev, row]),
      updateRow: (index: number, updates: Partial<FieldRow>) =>
        setRows((prev) =>
          prev.map((r, i) => (i === index ? { ...r, ...updates } : r))
        ),
      removeRow: (index: number) =>
        setRows((prev) => prev.filter((_, i) => i !== index)),
    }),
    []
  );

  return { rows, duplicateNameSet, normalizedFields, actions };
}

// src/hooks/useFieldTableUI.ts - UI交互逻辑
export function useFieldTableUI(fieldData: ReturnType<typeof useFieldData>) {
  const [freezeConfig, setFreezeConfig] = useState<FreezeConfig>(defaultConfig);
  const [highlightedRow, setHighlightedRow] = useState<number | null>(null);

  const handleRowsChange = useCallback(
    (changes: Handsontable.CellChange[] | null, source: Handsontable.ChangeSource) => {
      if (!changes || source === 'loadData') return;

      changes.forEach(([rowIndex, prop, , value]) => {
        if (typeof prop !== 'string' || prop === 'order') return;
        fieldData.actions.updateRow(rowIndex, { [prop]: value ?? '' });
      });
    },
    [fieldData.actions]
  );

  const handleAddRows = useCallback(
    (count: number) => {
      for (let i = 0; i < count; i++) {
        fieldData.actions.addRow(createEmptyRow(fieldData.rows.length));
      }
    },
    [fieldData.actions, fieldData.rows.length]
  );

  return {
    freezeConfig,
    setFreezeConfig,
    highlightedRow,
    setHighlightedRow,
    handleRowsChange,
    handleAddRows,
  };
}

// src/hooks/useFieldTable.ts - 组合hook
export function useFieldTable(initialRows: FieldRow[]) {
  const fieldData = useFieldData(initialRows);
  const uiState = useFieldTableUI(fieldData);

  return {
    // 数据
    rows: fieldData.rows,
    duplicateNameSet: fieldData.duplicateNameSet,
    normalizedFields: fieldData.normalizedFields,

    // UI状态
    freezeConfig: uiState.freezeConfig,
    highlightedRow: uiState.highlightedRow,

    // 所有操作
    ...fieldData.actions,
    ...uiState,
  };
}

// 使用
export function DataTable() {
  const fieldTable = useFieldTable(INITIAL_ROWS);

  return (
    <>
      <FreezeControl
        enabled={fieldTable.freezeConfig.enabled}
        columns={fieldTable.freezeConfig.columns}
        onChange={fieldTable.setFreezeConfig}
      />
      <HotTable
        data={fieldTable.rows}
        afterChange={fieldTable.handleRowsChange}
        highlightRow={fieldTable.highlightedRow}
      />
    </>
  );
}
```

---

### 5.4 策略模式 (Strategy Pattern)

**适用场景**: 不同数据库类型的DDL生成

**当前实现**: 已在strategies文件夹中使用

**优化建议**:

```typescript
// src/strategies/DDLStrategy.ts
export interface DDLStrategy {
  generateCreateTable(config: TableConfig): string;
  generateAddColumn(column: Column): string;
  generateAddIndex(index: Index): string;
  getTypeMapping(): TypeMapping;
}

// src/strategies/MysqlStrategy.ts
export class MySQLStrategy implements DDLStrategy {
  generateCreateTable(config: TableConfig): string {
    // MySQL特定的生成逻辑
  }

  generateAddColumn(column: Column): string {
    // MySQL特定的ADD COLUMN语法
  }

  getTypeMapping(): TypeMapping {
    return MYSQL_TYPE_MAPPING;
  }
}

// src/strategies/PostgreSQLStrategy.ts
export class PostgreSQLStrategy implements DDLStrategy {
  generateCreateTable(config: TableConfig): string {
    // PostgreSQL特定的生成逻辑
  }

  generateAddColumn(column: Column): string {
    // PostgreSQL特定的ADD COLUMN语法
  }

  getTypeMapping(): TypeMapping {
    return POSTGRESQL_TYPE_MAPPING;
  }
}

// src/strategies/DDLStrategyFactory.ts
export class DDLStrategyFactory {
  private strategies = new Map<DatabaseType, DDLStrategy>();

  register(dbType: DatabaseType, strategy: DDLStrategy) {
    this.strategies.set(dbType, strategy);
  }

  getStrategy(dbType: DatabaseType): DDLStrategy {
    const strategy = this.strategies.get(dbType);
    if (!strategy) {
      throw new Error(`No strategy found for database type: ${dbType}`);
    }
    return strategy;
  }
}

// 使用
const factory = new DDLStrategyFactory();
factory.register('mysql', new MySQLStrategy());
factory.register('postgresql', new PostgreSQLStrategy());
// ... 注册其他策略

export function useDDLSql(dbType: DatabaseType) {
  const strategy = factory.getStrategy(dbType);

  const generateCreateTable = useCallback(
    (config: TableConfig) => {
      return strategy.generateCreateTable(config);
    },
    [strategy]
  );

  return { generateCreateTable };
}
```

---

### 5.5 观察者模式 (Observer Pattern)

**适用场景**: 跨组件事件通信

**实现**: (已在上文"事件总线"部分展示)

---

### 5.6 工厂模式 (Factory Pattern)

**适用场景**: 创建对话框组件

**当前问题**: 32个对话框手动创建和维护

**解决方案**:

```typescript
// src/components/DialogFactory.tsx
interface DialogConfig {
  id: string;
  title: string;
  description?: string;
  content: ReactNode;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function DialogFactory() {
  const dialogs = useDialogManager();

  const createDialog = useCallback((config: DialogConfig) => {
    return (
      <Dialog
        open={dialogs.isDialogOpen(config.id)}
        onOpenChange={() => dialogs.closeDialog(config.id)}
      >
        <DialogContent className={`max-w-${config.size || 'sm'}`}>
          <DialogHeader>
            <DialogTitle>{config.title}</DialogTitle>
            {config.description && (
              <DialogDescription>{config.description}</DialogDescription>
            )}
          </DialogHeader>
          {config.content}
          <DialogFooter>
            {config.onCancel && (
              <Button variant="outline" onClick={config.onCancel}>
                {config.cancelLabel || '取消'}
              </Button>
            )}
            {config.onConfirm && (
              <Button onClick={config.onConfirm}>
                {config.confirmLabel || '确认'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }, [dialogs]);

  return { createDialog };
}

// 使用
export function GlobalDialogs() {
  const { createDialog } = DialogFactory();
  const dialogs = useDialogManager();

  return (
    <>
      {createDialog({
        id: 'save',
        title: '保存表',
        description: '保存当前表结构以便后续使用',
        content: <SaveDialogContent />,
        onConfirm: handleConfirmSave,
        confirmLabel: '保存',
      })}

      {createDialog({
        id: 'delete',
        title: '确认删除',
        description: `即将删除「${dialogs.getDialogData('delete')?.name}」`,
        content: <DeleteWarningContent />,
        onConfirm: handleConfirmDelete,
        confirmLabel: '删除',
        size: 'sm',
      })}
    </>
  );
}
```

---

## 6. 技术债务清单

### 按影响范围排序

#### 6.1 高优先级技术债务 (P0)

| ID | 问题 | 位置 | 影响 | 修复成本 | 建议修复时间 |
|----|------|------|------|----------|--------------|
| TD-001 | 主组件1979行,违反单一职责 | src/components/App/index.tsx:1-1979 | 可维护性、可扩展性、性能 | 高 | 1-2周 |
| TD-002 | 42个useState,状态管理混乱 | src/components/App/index.tsx:108-512 | 可维护性、性能 | 高 | 3-5天 |
| TD-003 | 32个对话框处理逻辑重复 | src/components/App/index.tsx:758-971 | 可维护性、代码量 | 中 | 2-3天 |
| TD-004 | 严重的props drilling | src/components/App/index.tsx:1594-1802 | 可维护性、性能 | 中 | 2-3天 |
| TD-005 | 缺少统一的错误处理 | 全局 | 用户体验、调试 | 中 | 1-2天 |

#### 6.2 中优先级技术债务 (P1)

| ID | 问题 | 位置 | 影响 | 修复成本 | 建议修复时间 |
|----|------|------|------|----------|--------------|
| TD-006 | 自定义hooks职责不清 | src/hooks/ | 可维护性 | 中 | 2-3天 |
| TD-007 | 缺少组件边界和层级 | src/components/App/ | 可维护性 | 中 | 3-4天 |
| TD-008 | 缺少loading状态管理 | 全局 | 用户体验 | 低 | 1天 |
| TD-009 | console.error未清理 | src/components/App/index.tsx:539, 565 | 代码质量 | 低 | 1小时 |
| TD-010 | 缺少性能监控 | 全局 | 性能优化 | 低 | 1天 |

#### 6.3 低优先级技术债务 (P2)

| ID | 问题 | 位置 | 影响 | 修复成本 | 建议修复时间 |
|----|------|------|------|----------|--------------|
| TD-011 | 部分组件未使用memo优化 | src/components/App/ | 性能 | 低 | 2-3天 |
| TD-012 | 缺少键盘导航支持 | 全局 | 可访问性 | 中 | 2-3天 |
| TD-013 | 缺少国际化支持 | 全局 | 可扩展性 | 高 | 1周 |
| TD-014 | 部分utils函数可合并 | src/utils/ | 代码组织 | 低 | 1天 |

---

### 建议修复顺序

#### 第1周: 紧急修复 (TD-009, TD-005)

```bash
# Day 1-2: 清理debug代码
- 移除所有console.error
- 添加统一的错误处理中间件

# Day 3-5: 添加错误边界
export function ErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <React.ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error) => {
        console.error('Caught error:', error);
        // 上报错误到监控服务
      }}
    >
      {children}
    </React.ErrorBoundary>
  );
}
```

#### 第2-3周: 重构主组件 (TD-001, TD-002)

```bash
# Week 1: 拆分容器组件
- 提取TableBuilderContainer
- 提取SavedTablesContainer
- 提取OutputContainer

# Week 2: 引入状态管理
- 安装Zustand
- 创建tableStore
- 逐步迁移状态
```

#### 第4周: 消除重复代码 (TD-003, TD-004)

```bash
# Week 1: 提取通用对话框hook
- 创建useDialogState
- 创建useDialogManager
- 重构所有对话框

# Week 2: 解决props drilling
- 创建Context
- 重构DataTable和IndexPanel
```

#### 第5-6周: 优化hooks和组件 (TD-006, TD-007)

```bash
# Week 1: 重构hooks
- 分离数据逻辑和UI逻辑
- 创建组合hooks

# Week 2: 优化组件层级
- 创建容器/展示组件
- 应用组合组件模式
```

---

## 7. 实施路线图

### 短期目标 (1-2个月)

#### 里程碑1: 消除代码重复 (2周)
- [ ] 提取useDialogState hook
- [ ] 提取useDialogManager hook
- [ ] 重构所有32个对话框
- [ ] 消除300+行重复代码

**验收标准**:
- 对话框相关代码减少70%以上
- 新增对话框时间从1小时减少到10分钟
- 所有对话框行为一致

#### 里程碑2: 拆分主组件 (3周)
- [ ] 创建TableBuilderContainer
- [ ] 创建SavedTablesContainer
- [ ] 创建OutputContainer
- [ ] 创建GlobalDialogs组件

**验收标准**:
- 主组件从1979行减少到<200行
- 每个容器组件<300行
- 所有测试通过

#### 里程碑3: 引入状态管理 (2周)
- [ ] 安装Zustand
- [ ] 创建tableStore
- [ ] 创建dialogStore
- [ ] 迁移表配置状态
- [ ] 迁移字段和索引状态
- [ ] 迁移对话框状态

**验收标准**:
- useState数量从42个减少到<10个
- 状态更新逻辑集中管理
- localStorage自动持久化

---

### 中长期架构演进 (3-6个月)

#### 里程碑4: 性能优化 (1个月)
- [ ] 添加React.memo优化
- [ ] 使用useMemo和useCallback
- [ ] 实现虚拟滚动
- [ ] 代码分割和懒加载

**目标**:
- 首屏加载时间<2秒
- 交互响应时间<100ms
- Bundle大小减少30%

#### 里程碑5: 可访问性改进 (2周)
- [ ] 添加键盘导航
- [ ] 添加ARIA标签
- [ ] 添加屏幕阅读器支持
- [ ] 通过WCAG 2.1 AA标准

**目标**:
- 可访问性评分>90分
- 支持键盘操作所有功能

#### 里程碑6: 国际化支持 (2周)
- [ ] 提取所有文本到i18n文件
- [ ] 安装i18next
- [ ] 支持中英文切换
- [ ] 支持日期/数字格式本地化

**目标**:
- 支持中文和英文
- 易于添加新语言

---

## 8. 代码质量指标

### 当前指标

| 指标 | 当前值 | 目标值 | 状态 |
|------|--------|--------|------|
| 主组件行数 | 1979 | <300 | ❌ |
| useState数量 | 42 | <10 | ❌ |
| 测试覆盖率 | ~85% | >90% | ⚠️ |
| 圈复杂度 | 高 | <10 | ❌ |
| 代码重复率 | ~15% | <5% | ❌ |
| 平均组件行数 | 250 | <150 | ⚠️ |
| Props drilling | 严重 | 无 | ❌ |
| TypeScript覆盖率 | 100% | 100% | ✅ |
| Lint通过率 | 100% | 100% | ✅ |
| 测试通过率 | 100% (545/545) | 100% | ✅ |

### 改进后预期指标

| 指标 | 预期值 | 改进幅度 |
|------|--------|----------|
| 主组件行数 | <150 | ↓92% |
| useState数量 | <5 | ↓88% |
| 测试覆盖率 | >90% | ↑5% |
| 圈复杂度 | <10 | ↓70% |
| 代码重复率 | <3% | ↓80% |
| 平均组件行数 | <100 | ↓60% |
| Props drilling | 无 | ↓100% |
| TypeScript覆盖率 | 100% | - |
| Lint通过率 | 100% | - |
| 测试通过率 | 100% | - |

---

## 9. 总结与建议

### 核心问题

DDLBuilder的主组件存在**严重的架构问题**:

1. ✅ **代码质量**: 测试覆盖率高,通过所有lint检查,TypeScript使用规范
2. ❌ **架构设计**: 主组件1979行,42个useState,严重违反单一职责原则
3. ❌ **状态管理**: 状态分散,逻辑重复,难以维护
4. ❌ **代码重复**: 32个对话框处理逻辑高度相似但未提取
5. ❌ **组件耦合**: 严重的props drilling,组件职责不清

### 紧急建议

#### 立即行动 (1周内)
1. **清理debug代码**: 移除console.error
2. **添加错误边界**: 防止应用崩溃
3. **统一错误处理**: 提升用户体验

#### 短期目标 (1-2个月)
1. **提取通用Dialog hook**: 消除300+行重复代码
2. **拆分主组件**: 按功能域创建容器组件
3. **引入状态管理**: 使用Zustand统一管理状态

#### 中长期目标 (3-6个月)
1. **性能优化**: React.memo、虚拟滚动、代码分割
2. **可访问性**: 键盘导航、ARIA标签
3. **国际化**: 支持中英文

### 重构收益

实施完整的重构方案后:

**代码质量**:
- 主组件从1979行减少到<150行 (↓92%)
- useState从42个减少到<5个 (↓88%)
- 代码重复率从15%降低到<3% (↓80%)

**开发效率**:
- 新功能开发时间减少50%
- Bug修复时间减少60%
- 代码审查时间减少40%

**性能提升**:
- 首屏加载时间<2秒
- 交互响应时间<100ms
- Bundle大小减少30%

**可维护性**:
- 组件职责单一,易于理解
- 状态集中管理,易于调试
- 代码复用性高,易于扩展

### 风险评估

**低风险**:
- 提取Dialog hook - 不影响现有功能
- 拆分容器组件 - 渐进式重构
- 添加状态管理 - 可以并行运行

**中风险**:
- 重构hooks - 需要充分测试
- 修改组件层级 - 可能影响样式

**高风险**:
- 大规模重写 - 不建议,应采用渐进式重构

### 下一步行动

**Week 1**: 创建Dialog管理hook
**Week 2-3**: 拆分容器组件
**Week 4**: 引入Zustand
**Week 5-6**: 迁移状态到Zustand
**Week 7-8**: 优化和测试

---

**报告完成时间**: 2026-02-08
**评估人员**: AI架构师
**下次评估**: 重构完成后

---

## 附录

### A. 重构检查清单

- [ ] 提取useDialogState hook
- [ ] 提取useDialogManager hook
- [ ] 创建TableBuilderContainer
- [ ] 创建SavedTablesContainer
- [ ] 创建OutputContainer
- [ ] 安装Zustand
- [ ] 创建tableStore
- [ ] 创建dialogStore
- [ ] 迁移表配置状态
- [ ] 迁移字段状态
- [ ] 迁移索引状态
- [ ] 迁移对话框状态
- [ ] 移除旧useState
- [ ] 更新测试
- [ ] 性能测试
- [ ] E2E测试

### B. 参考资料

- [Zustand官方文档](https://zustand-demo.pmnd.rs/)
- [React性能优化最佳实践](https://react.dev/learn/render-and-commit)
- [Container/Presentational模式](https://medium.com/@dan_abramov/smart-and-dumb-components-7caaa4f07b7d)
- [Compound Components模式](https://kentcdodds.com/blog/compound-components-with-react-hooks)
- [React设计模式](https://reactpatterns.com/)

### C. 工具推荐

- **状态管理**: Zustand
- **表单**: React Hook Form
- **数据获取**: TanStack Query
- **DevTools**: Redux DevTools (支持Zustand)
- **性能分析**: React Profiler
- **Bundle分析**: webpack-bundle-analyzer

---

**END OF REPORT**
