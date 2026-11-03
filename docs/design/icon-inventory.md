# Web 图标语义清单（apps/web）

迁移前的快照："当前 hugeicons" 列和行号对应替换前的代码，用于追溯每个槽位的来源。现行规范见 [icon-system.md](icon-system.md)。

路径约定：`App/X` = `apps/web/src/components/App/X.tsx`；`ui/`、`schema-tools/`、`ImportSqlDialog/`、`FireworksOverlay` 同理位于 `components/` 下；`admin/`、`auth/` 位于 `apps/web/src/` 下。`.ts` 文件保留扩展名。

尺寸换算：h-2=8、h-2.5=10、h-3=12、h-3.5=14、h-4/size-4=16、h-5/size-5=20、h-6/size-6=24、h-8=32（px）。未写颜色即继承 `currentColor`（通常是按钮/菜单文字色）。

统计：74 个文件从 `components/icons.tsx` 导入，共约 384 处图标引用（含 16 条 databaseOptions 映射和 toolCatalog 15 条），另有 1 处直接导入（`ui/input-otp`，所在组件 `InputOTPSeparator` 目前没有任何调用方）。归并后得到 **190 个语义槽位**：feature 92（含 16 个 `db-dialect-*`）、action 54、status 19、control 25（`scroll-up`/`scroll-down`、`play`/`pause` 各占一行两个槽位）。

`toolCatalog.ts` 的条目在三处渲染：ToolsPage 卡片（20px，muted）、WorkspaceEmptyState 已固定工具（20px，muted）、CommandPalette 工具组（16px，muted）。`databaseOptions.ts` 在三处渲染：TableConfig 下拉触发器（14px，text-primary）、下拉选项（16px，text-primary）、`ddl-output/OutputPrimitives` DatabaseBadge（14px，text-primary）。

---

## 1. 语义槽位

### feature

| slot id | 中文含义 | 当前 hugeicons | tier | 次数 | 尺寸(px) | 颜色/动画 | 位置 |
|---|---|---|---|---|---|---|---|
| `db-dialect-*` | 数据库方言（16 种） | Database, HardDrive, GitBranch, Layers, Share2 | feature | 16 | 14,16 | text-primary | `App/databaseOptions.ts:11-26`，见下方映射表 |
| `table` | 表（对象 / 表导航 / 表列表项） | Table, Table2 | feature | 8 | 14,16 | muted / text-primary / primary/80 | 顶部导航“表” `App/Header:44`；对象类型“表” `App/TableConfig:229,243`；命令面板表项 `App/CommandPalette:167`；侧栏已存表 `App/saved-tables/TableItem:113`；数据字典表头 `schema-tools/DictionaryReader:78`；选表列表 `schema-tools/TableSource:271`；AI 修改上下文“表” `App/AISchemaPatchPanel:96` |
| `ai-generate` | AI 建表 | Sparkles | feature | 4 | 16,20 | text-primary（弹窗头） | 弹窗标题 `App/AIGenerateDialog:267`；命令面板 `App/CommandPalette:142`；侧栏“新建”菜单 `App/WorkspaceSidebar:244`；工具目录 `schema-tools/toolCatalog.ts:80` |
| `primary-key` | 主键 | Key | feature | 4 | 12,14 | orange 徽标 / text-primary | 索引类型徽标 `App/IndexPanel:303`；“添加主键”按钮 `App/IndexPanel:368`；索引统计徽标 `App/containers/TableBuilderContainer:53`；ER 表节点主键字段 `App/er-diagram/ErTableNode:62` |
| `field-template` | 字段模板 | LayoutTemplate, FileText | feature | 4 | 14,16,20 | text-blue-500（列表） | 工具目录 `toolCatalog.ts:72`（LayoutTemplate）；“应用模板”触发器 `App/ApplyTemplatePopover:157`、列表项 `:136`；模板管理列表项 `App/TemplateListItem:25`（均为 FileText） |
| `draft` | 草稿（对象） | FileEdit | feature | 3 | 16 | text-amber-600 | 命令面板草稿项 `App/CommandPalette:159`；侧栏草稿行 `App/WorkspaceSidebar:312`；已存表列表草稿 `App/saved-tables/TableItem:108` |
| `workspace` | 工作区（已存表集合） | Database, FolderOpen | feature | 3 | 14,16,20 | text-primary / muted | 抽屉标题“工作区” `App/SavedTablesDrawer:193`（Database）；侧栏“工作区”按钮 `App/WorkspaceSidebar:215`（FolderOpen）；工具页无已存表空态 `schema-tools/TableSource:292`（Database） |
| `unique-index` | 唯一索引 | Lock | feature | 3 | 12,14 | blue 徽标 | 索引类型徽标 `App/IndexPanel:305`；“添加唯一索引” `App/IndexPanel:358`；统计徽标 `App/containers/TableBuilderContainer:58` |
| `normal-index` | 普通索引 | Hash | feature | 3 | 12,14 | emerald 徽标 | 索引类型徽标 `App/IndexPanel:306`；“添加索引” `App/IndexPanel:349`；统计徽标 `App/containers/TableBuilderContainer:63` |
| `table-blueprint` | 整表蓝本 | Table2, LayoutTemplate | feature | 3 | 14,16,20 | text-emerald-600（列表） | 工具目录 `toolCatalog.ts:73`（Table2）；“整表蓝本”触发器 `App/TableTemplatePopover:120`、列表项 `:158`（LayoutTemplate） |
| `version-history` | 历史版本 | History | feature | 2 | 16,20 | — | 弹窗标题 `App/VersionHistoryDialog:289`；表配置栏“历史版本” `App/TableConfig:267` |
| `review-history` | 评审历史 | History | feature | 2 | 14,20 | — | 弹窗标题 `App/ReviewHistoryDialog:143`；DDL 输出栏 `App/ddl-output/DdlOutputPanel:119` |
| `er-diagram` | ER 关系图 | Waypoints | feature | 2 | 16 | muted（导航） | 顶部导航 `App/Header:45`；表配置“更多”菜单 `App/TableConfig:307` |
| `view-diff` | 表结构变更对比 | GitCompare | feature | 2 | 16 | muted | 命令面板 `App/CommandPalette:126`；表配置“更多”菜单 `App/TableConfig:313` |
| `data-dictionary` | 数据字典 | BookOpen | feature | 2 | 20,24 | muted | 工具目录 `toolCatalog.ts:39`；字典空态 `schema-tools/DictionaryReader:40` |
| `publication` | 发布与管理 | Share2 | feature | 2 | 14,20 | muted | 工具目录 `toolCatalog.ts:40`；字典工具“发布”折叠区 `schema-tools/DictionaryTool:155` |
| `ai-patch` | AI 修改当前表 | Sparkles, Bot | feature | 2 | 16,20 | 白字 on bg-primary（面板头） | 工具目录 `toolCatalog.ts:81`（Sparkles）；面板标题 `App/AISchemaPatchPanel:279`（Bot） |
| `ai-index-advisor` | AI 索引优化顾问 | Zap, Sparkles | feature | 2 | 16,20 | text-primary（弹窗头） | 工具目录 `toolCatalog.ts:83`（Zap）；弹窗标题 `App/AIIndexAdvisorDialog:71`（Sparkles） |
| `ai-explain` | AI 代码解释 | Lightbulb | feature | 2 | 14 | 白字 on primary 按钮 / text-primary | 选中 SQL 后“解释选中”浮动按钮 `App/ExplainPopover:169`；解释气泡标题 `:194` |
| `review-score` | 评审得分 | Star | feature | 2 | 16,20 | 按分数变色，结果页 fill | 评审结果分数 `App/ReviewResult:77`；评审历史列表 `App/ReviewHistoryDialog:173` |
| `review-suggestions` | 评审建议（区块标题） | Lightbulb | feature | 2 | 16 | muted | `App/ReviewResult:242`、`:277` |
| `mock-data` | Mock 数据生成器 | TableProperties | feature | 2 | 16,20 | text-primary（弹窗头） | 弹窗标题 `App/MockDataDialog:131`；“数据工具”菜单项 `App/table/DataTableToolbar:201` |
| `storage-estimator` | 存储容量估算 | HardDrive | feature | 2 | 16,24 | text-primary（弹窗头） | 弹窗标题 `App/StorageEstimatorDialog:138`；“数据工具”菜单项 `App/table/DataTableToolbar:195` |
| `storage-data` | 容量：裸数据 / 数据特点 | Layers, Database | feature | 2 | 16 | text-primary（说明区） | 估算器分项卡 `App/StorageEstimatorDialog:201`（Layers）；说明区 `:224`（Database） |
| `storage-index` | 容量：索引占用 | GitBranch | feature | 2 | 16 | text-emerald-600（说明区） | 分项卡 `App/StorageEstimatorDialog:207`；说明区 `:231` |
| `storage-redundancy` | 容量：冗余开销 | Zap | feature | 2 | 16 | text-amber-600（说明区） | 分项卡 `App/StorageEstimatorDialog:213`；说明区 `:238` |
| `index-count` | 索引（数量摘要） | KeyRound | feature | 2 | 14,16 | text-primary / muted | AI 修改上下文“索引” `App/AISchemaPatchPanel:106`；蓝本预览“索引” `App/TableTemplatePreview:38` |
| `field-count` | 字段（数量摘要） | FileText, ListTree | feature | 2 | 14,16 | text-primary / muted | AI 修改上下文“字段” `App/AISchemaPatchPanel:101`（FileText）；蓝本预览“字段” `App/TableTemplatePreview:31`（ListTree） |
| `db-type` | 数据库类型（摘要标签） | Database | feature | 2 | 14,16 | text-primary / muted | AI 修改上下文“数据库” `App/AISchemaPatchPanel:91`；蓝本预览 `App/TableTemplatePreview:24` |
| `table-config-summary` | 其他配置 / 表配置（摘要） | ShieldCheck, Settings2 | feature | 2 | 14,16 | text-primary / muted | AI 修改上下文“其他配置” `App/AISchemaPatchPanel:111`（ShieldCheck）；蓝本预览“表配置” `App/TableTemplatePreview:45`（Settings2） |
| `relation` | 关系 / 外键 | Link2 | feature | 2 | 14,20 | text-primary（弹窗头）；indigo 徽标 | 创建关系弹窗标题 `App/er-diagram/RelationCreationDialog:176`；外键卡片 FK/逻辑关系徽标 `App/ForeignKeyPanel:433` |
| `settings` | 设置页 | Settings | feature | 2 | 16,20 | muted | 顶栏设置 `App/Header:200`；命令面板“打开设置” `App/CommandPalette:216` |
| `trash-bin` | 回收站（入口 / 已删除项） | Trash2 | feature | 2 | 16 | muted | 侧栏“回收站”折叠行 `App/WorkspaceSidebar:465`；回收站条目行首 `:531` |
| `db-view` | 视图（对象类型） | Eye | feature | 2 | 16 | text-primary | 对象类型选择触发器/选项 `App/TableConfig:229`、`:243` |
| `layout-side` | 编辑器布局：左右分屏 | LayoutTwoColumn | feature | 1 | 16 | muted / 选中 foreground | `App/EditorLayoutControl:8` |
| `layout-split` | 编辑器布局：上下分屏 | LayoutTwoRow | feature | 1 | 16 | 同上 | `App/EditorLayoutControl:9` |
| `layout-design-only` | 编辑器布局：只看设计 | Table | feature | 1 | 16 | 同上 | `App/EditorLayoutControl:10` |
| `layout-output-only` | 编辑器布局：只看结果 | Code2 | feature | 1 | 16 | 同上 | `App/EditorLayoutControl:11` |
| `sql-format-compact` | SQL 格式：紧凑 | AlignLeft | feature | 1 | 14 | muted / 选中 foreground | `App/ddl-output/DdlOutputPanel:55` |
| `sql-format-aligned` | SQL 格式：对齐 | AlignJustify | feature | 1 | 14 | 同上 | `App/ddl-output/DdlOutputPanel:55` |
| `view-definition` | 视图定义 | Code2 | feature | 1 | 16 | text-primary | 视图定义面板标题 `App/ViewDefinitionPanel:28` |
| `schema-lint` | 结构规范检查 | ShieldCheck | feature | 1 | 16 | text-primary | 面板标题 `App/SchemaLintPanel:45` |
| `migration-assessment` | 迁移兼容性评估 | ShieldCheck | feature | 1 | 16,20 | muted | `toolCatalog.ts:52` |
| `schema-compare` | 结构对比（工具） | GitCompare | feature | 1 | 16,20 | muted | `toolCatalog.ts:51` |
| `sqlite-export` | SQLite / D1 导出 | HardDrive | feature | 1 | 16,20 | muted | `toolCatalog.ts:41` |
| `query-design` | 查询设计 | Search | feature | 1 | 16,20 | muted | `toolCatalog.ts:48` |
| `business-modules` | 业务模块 | Layers | feature | 1 | 16,20 | muted | `toolCatalog.ts:49` |
| `impact-analysis` | 影响分析 | Network | feature | 1 | 16,20 | muted | `toolCatalog.ts:50` |
| `seed-data` | 关联测试数据 | Table2 | feature | 1 | 16,20 | muted | `toolCatalog.ts:59` |
| `data-import` | 业务数据导入 | FileInput | feature | 1 | 16,20 | muted | `toolCatalog.ts:60` |
| `schema-refresh` | 结构刷新 | RefreshCw | feature | 1 | 16,20 | muted | `toolCatalog.ts:61` |
| `field-standards` | 字段标准库 | ListChecks | feature | 1 | 16,20 | muted | `toolCatalog.ts:71` |
| `ai-comments` | AI 注释 | Bot | feature | 1 | 16,20 | muted | `toolCatalog.ts:82` |
| `ai-context` | AI 修改所依据的上下文 | Sparkles | feature | 1 | 16 | text-primary | `App/AISchemaPatchPanel:300` |
| `ai-tools` | AI 工具（菜单） | WandSparkles | feature | 1 | 14 | — | 字段表工具栏 `App/table/DataTableToolbar:138` |
| `ai-review` | 大师评审 | GraduationCap | feature | 1 | 14 | — | DDL 输出栏“评审” `App/ddl-output/DdlOutputPanel:100` |
| `data-tools` | 数据工具（菜单） | TableProperties | feature | 1 | 14 | — | `App/table/DataTableToolbar:186` |
| `column-settings` | 表格列显示设置 | Columns3Cog | feature | 1 | 14 | — | `App/table/DataTableToolbar:66` |
| `table-properties` | 表属性（弹出层） | SlidersHorizontal | feature | 1 | 16 | — | `App/TableConfig:209` |
| `partition-type` | 分区类型 | Layers | feature | 1 | 16 | text-primary | `App/PartitionPanel:179` |
| `bucketing` | 分桶（Hive clustering） | Grid3x3 | feature | 1 | 16 | muted | `App/HivePartitionPanel:195` |
| `sharding-mode` | 分片：表模式（标签） | Database | feature | 1 | 16 | text-primary | `App/ShardingPanel:39` |
| `replica-table` | 副本表 | Database | feature | 1 | 32 | 选中 primary，否则 muted | `App/ShardingPanel:52` |
| `distributed-table` | 分片表 | GitBranch | feature | 1 | 32 | 选中 primary，否则 muted | `App/ShardingPanel:75` |
| `shard-key` | 分片字段 | GitBranch | feature | 1 | 16 | text-primary | `App/ShardingPanel:95` |
| `storage-total` | 磁盘占用合计 | BarChart3 | feature | 1 | 16 | text-violet-500 | `App/StorageEstimatorDialog:185` |
| `key-field` | 可作为关联目标的键字段 | KeyRound | feature | 1 | 14 | 键字段 primary，否则 muted/40 | 关系弹窗目标字段选项 `App/er-diagram/RelationCreationDialog:251` |
| `grantee` | 授权对象（用户/角色） | UserRound | feature | 1 | 14 | text-primary on primary/10 圆底 | `App/AuthPanel:81` |
| `tools-nav` | 工具（导航） | LayoutGrid | feature | 1 | 16 | muted | `App/Header:46` |
| `docs` | 文档 | BookOpen | feature | 1 | 16 | — | 帮助菜单 `App/Header:176` |
| `feedback` | 反馈 | MessageCircle | feature | 1 | 16 | — | 帮助菜单 `App/Header:182` |
| `help` | 帮助 | CircleHelp | feature | 1 | 20 | muted | 顶栏 `App/Header:164` |
| `language` | 切换语言 | Languages | feature | 1 | 16 | muted | `App/CommandPalette:198` |
| `timestamp` | 时间（版本时间） | Clock | feature | 1 | 12 | muted | 回放帧时间 `App/SchemaTimelinePlayer:337` |
| `folder` | 文件夹（收起） | Folder | feature | 1 | 16 | text-amber-500 | `App/FolderTree:99` |
| `folder-open` | 文件夹（展开） | FolderOpen | feature | 1 | 16 | text-amber-500 | `App/FolderTree:99` |
| `import-preview` | 导入预览摘要 | Eye | feature | 1 | 20 | — | `ImportSqlDialog/PreviewStep:34` |

`db-dialect-*` 映射（`App/databaseOptions.ts`）：

| slot | 方言 | 当前图标 |
|---|---|---|
| `db-dialect-sqlite` | SQLite / D1 | Database |
| `db-dialect-mysql` | MySQL | Database |
| `db-dialect-postgresql` | PostgreSQL | HardDrive |
| `db-dialect-postgresql-citus` | PostgreSQL (Citus) | HardDrive |
| `db-dialect-sqlserver` | SQL Server | GitBranch |
| `db-dialect-oracle` | Oracle | Layers |
| `db-dialect-mariadb` | MariaDB | Share2 |
| `db-dialect-tidb` | TiDB | Database |
| `db-dialect-dm` | 达梦 | Database |
| `db-dialect-oceanbase` | OceanBase (MySQL) | Database |
| `db-dialect-oceanbase-oracle` | OceanBase (Oracle) | Layers |
| `db-dialect-kingbase` | Kingbase | HardDrive |
| `db-dialect-gbase` | GBase | Database |
| `db-dialect-polardb` | PolarDB | Database |
| `db-dialect-gaussdb` | GaussDB | HardDrive |
| `db-dialect-hive` | Hive | Database |

### action

| slot id | 中文含义 | 当前 hugeicons | tier | 次数 | 尺寸(px) | 颜色/动画 | 位置 |
|---|---|---|---|---|---|---|---|
| `delete` | 删除此项 | Trash2 | action | 12 | 14,16 | 菜单项 text-destructive；部分 muted | 文件夹菜单 `App/FolderTree:202`；索引行 `App/IndexPanel:459`；评审历史 `App/ReviewHistoryDialog:216`；蓝本管理 `App/TableTemplateManagerDialog:213`；字段模板列表 `App/TemplateListItem:70`；历史版本 `App/VersionHistoryDialog:456`；删除草稿 `App/WorkspaceSidebar:360`；删除确认按钮 `App/containers/GlobalDialogs:267`；已存表菜单 `App/saved-tables/TableItem:163`；枚举值 `App/table/EnumSetEditor:243`；字段行 `App/table/RowActions:49`；导入预览字段 `ImportSqlDialog/PreviewStep:133` |
| `add` | 添加 / 新建 | Plus | action | 9 | 12,14,16 | — | 添加外键 `App/ForeignKeyPanel:183`；添加分区列 `App/HivePartitionPanel:112`；添加分桶列 `:228`；添加分区 `App/PartitionPanel:403`；新建字段模板 `App/TemplateManagerDialog:330`；模板添加字段 `:419`；添加枚举值 `App/table/EnumSetEditor:451`；ER 添加表 `App/er-diagram/ErDiagramToolbar:37`；侧栏“新建”下拉 `App/WorkspaceSidebar:233` |
| `edit` | 编辑 | Pencil | action | 6 | 12,14,16 | 枚举单元格 muted、悬停显示 | 索引行 `App/IndexPanel:447`；索引详情 `:494`；蓝本管理 `App/TableTemplateManagerDialog:199`；字段模板列表 `App/TemplateListItem:46`；枚举单元格 `App/table/EnumSetCell:92`、`App/table/LogicalEnumCell:207` |
| `remove` | 从列表移除一行 | X | action | 6 | 10,12,14,16 | 多为 text-destructive；FK 悬停 rotate-90 | 删除外键 `App/ForeignKeyPanel:516`；删除分区列 `App/HivePartitionPanel:179`；删除分桶列 `:249`；删除分区 `App/PartitionPanel:467`；移除授权对象 `App/AuthPanel:95`；ER 连线删除 `App/er-diagram/ErRelationEdge:79` |
| `download` | 下载 / 导出文件 | Download, FileText | action | 5 | 14,16 | — | 下载 Mock 数据 `App/MockDataDialog:254`；下载 Excel 模板 `ImportSqlDialog/SqlInputStep:189`；字典导出 HTML `schema-tools/DictionaryTool:109`；导出 Markdown `:125`（FileText）；导出结构快照 `:141` |
| `copy` | 复制到剪贴板 | Copy | action | 4 | 14 | — | 复制变更 SQL `App/DiffDialog:362`；复制回滚脚本 `:406`；复制 Mock 数据 `App/MockDataDialog:237`；复制 DDL `App/ddl-output/OutputPrimitives:83` |
| `new-draft` | 新建草稿 | FilePlus, FileEdit, Plus | action | 4 | 14,16 | — | 命令面板 `App/CommandPalette:135`（FilePlus）；抽屉头 `App/SavedTablesDrawer:210`（FilePlus）；侧栏“新建”菜单 `App/WorkspaceSidebar:240`（FileEdit）；标签栏新标签 `App/TabBar:210`（Plus） |
| `ai-send` | 发送提示词 / 生成 | Send | action | 3 | 14,16 | — | AI 建表“继续生成” `App/AIGenerateDialog:577`；“生成” `:600`；AI 修改“发送” `App/AISchemaPatchPanel:483` |
| `import-sql` | 导入结构（SQL/Excel） | Upload, FileInput | action | 3 | 16 | — | 命令面板 `App/CommandPalette:149`（Upload）；侧栏“导入”按钮 `App/WorkspaceSidebar:260`（Upload）；侧栏“新建”菜单 `:248`（FileInput） |
| `rename` | 重命名 | Pencil | action | 3 | 12,16 | FK 名称悬停 opacity-50 | 文件夹菜单 `App/FolderTree:194`；已存表菜单 `App/saved-tables/TableItem:155`；外键名双击改名提示 `App/ForeignKeyPanel:464` |
| `new-folder` | 新建文件夹 / 子文件夹 | FolderPlus, Plus | action | 3 | 14,16 | — | 文件夹菜单“新建子文件夹” `App/FolderTree:190`；抽屉头 `App/SavedTablesDrawer:221`；侧栏搜索旁 `App/WorkspaceSidebar:284`（Plus） |
| `apply` | 应用结果 | Check | action | 2 | 14,16 | — | AI 建表“应用” `App/AIGenerateDialog:586`；AI 修改“应用所选” `App/AISchemaPatchPanel:494` |
| `sign-in` | 登录 | LogIn | action | 2 | 16 | — | 顶栏 `App/Header:221`；登录弹窗提交 `auth/AuthDialogs:427` |
| `save` | 保存 | Save | action | 2 | 16 | 宽屏隐藏图标 | 命令面板 `App/CommandPalette:115`；表配置保存按钮 `App/TableConfig:336` |
| `duplicate` | 复制一份（模板） | Copy | action | 2 | 14,16 | — | 蓝本管理 `App/TableTemplateManagerDialog:206`；字段模板列表 `App/TemplateListItem:58` |
| `reset-conversation` | 重新开始 / 重置 AI 会话 | RotateCcw | action | 2 | 14,16 | — | `App/AIGenerateDialog:293`；`App/AISchemaPatchPanel:460` |
| `rollback` | 回滚 | RotateCcw | action | 2 | 14 | — | “回滚脚本”折叠标题 `App/DiffDialog:391`；回滚到版本 `App/VersionHistoryDialog:490` |
| `reject` | 拒绝 AI 变更 | X | action | 2 | 14 | — | `App/AISchemaPatchPanel:241`、`:264` |
| `save-as-template` | 将当前保存为模板/蓝本 | Plus | action | 2 | 16 | muted | `App/ApplyTemplatePopover:218`；`App/TableTemplatePopover:185` |
| `manage-templates` | 管理模板/蓝本 | Settings | action | 2 | 16 | muted | `App/ApplyTemplatePopover:226`；`App/TableTemplatePopover:196` |
| `back` | 返回 | ArrowLeft | action | 2 | 16 | muted（工具页） | 管理后台用户详情 `admin/AdminUserDetail:244`；工具详情返回工具页 `schema-tools/ToolsPage:170` |
| `next-step` | 下一步 | ArrowRight | action | 2 | 16 | — | 导入向导 `ImportSqlDialog/index:636`、`:654` |
| `accept` | 接受 AI 变更 | Check | action | 1 | 14 | — | `App/AISchemaPatchPanel:251` |
| `move-up` | 字段上移 | ArrowLeft | action | 1 | 16 | — | `ImportSqlDialog/PreviewStep:114` |
| `move-down` | 字段下移 | ArrowRight | action | 1 | 16 | — | `ImportSqlDialog/PreviewStep:124` |
| `pin-tool` | 固定工具到首页 | Pin | action | 1 | 16 | 固定后 blue-strong，否则 muted | `schema-tools/ToolsPage:70` |
| `freeze-columns` | 冻结列 | Pin | action | 1 | 14 | muted | `App/table/DataTableToolbar:227` |
| `add-rows` | 添加行 | ListPlus | action | 1 | 14 | — | `App/table/DataTableToolbar:311` |
| `apply-index` | 添加建议索引 | ListChecks | action | 1 | 14 | — | `App/AIIndexAdvisorDialog:148` |
| `regenerate` | 重新生成 Mock 数据 | RefreshCw | action | 1 | 14 | muted | `App/MockDataDialog:219` |
| `refresh` | 刷新已存表列表 | RefreshCw | action | 1 | 14 | 拉取中 motion-safe:animate-spin | `schema-tools/TableSource:151` |
| `retry` | 重试同步 | RefreshCw | action | 1 | 12 | — | `App/WorkspaceYDocStatus:111` |
| `restore` | 从回收站恢复 | RotateCcw | action | 1 | 16 | — | `App/WorkspaceSidebar:542` |
| `delete-permanently` | 彻底删除 | X | action | 1 | 16 | text-destructive | `App/WorkspaceSidebar:551` |
| `empty-trash` | 清空回收站（全部删除） | Trash2 | action | 1 | 16 | 白字 on destructive | `App/containers/GlobalDialogs:291` |
| `clear-all` | 清空所有表配置 | Trash2 | action | 1 | 16 | text-destructive | `App/TableConfig:319` |
| `share-link` | 生成分享链接 | Share2 | action | 1 | 16 | — | `App/TableConfig:285` |
| `move-to-folder` | 移动到文件夹 | FolderOpen | action | 1 | 16 | — | 草稿菜单子菜单 `App/WorkspaceSidebar:335` |
| `zoom-in` | 放大 | ZoomIn | action | 1 | 14 | — | `App/er-diagram/ErDiagramToolbar:47` |
| `zoom-out` | 缩小 | ZoomOut | action | 1 | 14 | — | `App/er-diagram/ErDiagramToolbar:56` |
| `fit-view` | 适应视图 | Maximize | action | 1 | 14 | — | `App/er-diagram/ErDiagramToolbar:65` |
| `auto-layout` | 自动布局 | LayoutGrid | action | 1 | 14 | — | `App/er-diagram/ErDiagramToolbar:74` |
| `generate-by-year` | 按年生成分区 | Calendar | action | 1 | 12 | — | `App/PartitionPanel:352` |
| `change-layout` | 切换编辑器布局 | LayoutTwoColumn | action | 1 | 16 | muted | `App/CommandPalette:205` |
| `theme-to-light` | 切换到浅色 | Sun | action | 1 | 16 | muted | `App/CommandPalette:191` |
| `theme-to-dark` | 切换到深色 | Moon | action | 1 | 16 | muted | `App/CommandPalette:191` |
| `play-timeline` | 播放变更回放 | Play | action | 1 | 14 | — | `App/VersionHistoryDialog:478` |
| `sign-out` | 退出登录 | LogOut | action | 1 | 16 | — | `admin/AdminLayout:30` |
| `send-reset-email` | 发送重置密码邮件 | Mail | action | 1 | 16 | — | `admin/AdminUserDetail:287` |
| `send-verification-code` | 发送验证码 | MailCheck | action | 1 | 16 | — | `auth/AuthDialogs:416` |
| `enable-user` | 启用用户 | PlusCircle | action | 1 | 16 | — | `admin/AdminUserDetail:303` |
| `disable-user` | 禁用用户 | Ban | action | 1 | 16 | 白字 on destructive | `admin/AdminUserDetail:312` |
| `add-credits` | 增加额度 | PlusCircle | action | 1 | 16 | — | `admin/AdminUserDetail:322` |
| `view-detail` | 查看详情 | Eye | action | 1 | 16 | — | `admin/AdminUserList:90` |

### status

| slot id | 中文含义 | 当前 hugeicons | tier | 次数 | 尺寸(px) | 颜色/动画 | 位置 |
|---|---|---|---|---|---|---|---|
| `loading` | 加载 / 进行中 | Loader2 | status | 19 | 12,14,16,24 | 全部 animate-spin；多为 muted，ExplainPopover primary/60 | `auth/AuthDialogs:425`；`auth/EmailVerificationForm:182,193`；`App/AIGenerateDialog:425,442,598`；`App/AIIndexAdvisorDialog:184`；`App/AISchemaPatchPanel:346`；`App/ExplainPopover:197`；`App/Header:219`；`App/ReviewHistoryDialog:154`；`App/ReviewResult:80,244,279`；`App/SchemaTimelinePlayer:271`；`App/TabBar:77,182`；`App/TableConfig:283`；`App/VersionHistoryDialog:355` |
| `warning` | 警告 | AlertTriangle | status | 5 | 12,14,16 | amber/red/warning/destructive | 评审性能警告 `App/ReviewResult:138`；结构检查 warning `App/SchemaLintPanel:18`；目标表无键 `App/er-diagram/RelationCreationDialog:267`；字段类型不匹配 `:471`；导入表名冲突徽标 `ImportSqlDialog/TableSelectStep:101` |
| `error` | 错误 | AlertCircle, AlertTriangle | status | 4 | 16,20 | red-500 / destructive / muted | 评审错误 `App/ReviewResult:324`；结构检查 error `App/SchemaLintPanel:17`；SQL 校验失败 `ImportSqlDialog/SqlInputStep:248`；关系创建错误 `App/er-diagram/RelationCreationDialog:480`（AlertTriangle） |
| `danger-confirm` | 危险操作确认（弹窗头） | AlertTriangle | status | 3 | 20 | text-destructive | 危险变更 `App/table/DangerousChangeDialog:43`；删除确认 `App/containers/GlobalDialogs:247`；清空回收站确认 `:281` |
| `change-add` | 变更：新增 | Plus | status | 3 | 14,16 | green-500 / emerald-400 | 字段 diff `App/DiffDialog:41`；索引 diff `:102`；评审建议 add_* `App/ReviewResult:134` |
| `change-remove` | 变更：删除 | Minus | status | 3 | 14,16 | red-500 / red-400 | `App/DiffDialog:43`；`:104`；`App/ReviewResult:132` |
| `done` | 已完成 | Check | status | 3 | 12,16 | green-500 + zoom-in；emerald-500；白 on green | 解释完成 `App/ExplainPopover:200`；建议已应用 `App/ReviewResult:130`；导入向导步骤已完成 `ImportSqlDialog/index:539` |
| `change-modify` | 变更：修改 | RefreshCw, ArrowRight | status | 2 | 14,16 | amber-500 / amber-400 | 字段 diff `App/DiffDialog:45`（RefreshCw）；评审 modify_field `App/ReviewResult:136`（ArrowRight） |
| `success` | 成功 / 无问题 | CheckCircle2 | status | 2 | 16,20 | emerald-600 / green-700 | 结构检查无问题 `App/SchemaLintPanel:57`；SQL 校验通过 `ImportSqlDialog/SqlInputStep:246` |
| `copied` | 已复制 | Check | status | 2 | 14 | MockData text-green-500 | `App/MockDataDialog:235`；`App/ddl-output/OutputPrimitives:83` |
| `info` | 说明 | Info, InfoIcon | status | 2 | 16 | muted / text-primary | 分区类型说明 `App/PartitionPanel:210`（Info）；容量估算说明条目 `App/StorageEstimatorDialog:275`（InformationCircleIcon） |
| `suggestion` | 建议级别 | Info, Lightbulb | status | 2 | 16 | muted / blue-400 | 结构检查 suggestion `App/SchemaLintPanel:19`（Info）；评审一般建议 `App/ReviewResult:142`（Lightbulb） |
| `syncing` | 工作区同步中 | Loader2 | status | 2 | 14 | animate-spin | `App/WorkspaceYDocStatus:20`（本地未同步）、`:38`（connecting） |
| `saved-locally` | 仅本地保存 | HardDrive | status | 2 | 14 | muted | `App/WorkspaceYDocStatus:56`（idle，本地副本）、`:82`（默认，已本地保存） |
| `synced` | 已同步到云端 | CheckCircle2 | status | 1 | 14 | emerald | `App/WorkspaceYDocStatus:29` |
| `offline` | 离线（已本地保存） | WifiOff | status | 1 | 14 | lm-chip-warning | `App/WorkspaceYDocStatus:47` |
| `sync-failed` | 同步失败 | AlertCircle | status | 1 | 14 | destructive | `App/WorkspaceYDocStatus:74` |
| `change-accepted` | AI 变更已接受/已应用 | Check | status | 1 | 14 | — | 变更勾选框 `App/AISchemaPatchPanel:214` |
| `change-rejected` | AI 变更已拒绝 | X | status | 1 | 14 | — | 变更勾选框 `App/AISchemaPatchPanel:216` |

`syncing`、`saved-locally`、`synced`、`offline`、`sync-failed` 都来自 `App/WorkspaceYDocStatus` 的同一个状态 chip。

### control

| slot id | 中文含义 | 当前 hugeicons | tier | 次数 | 尺寸(px) | 颜色/动画 | 位置 |
|---|---|---|---|---|---|---|---|
| `search` | 搜索（输入框前缀 / 打开搜索） | Search | control | 10 | 14,16,20 | 多为 muted | 顶栏打开命令面板 `App/Header:142`；命令面板输入 `App/CommandPalette:294`（20）；`App/ApplyTemplatePopover:167`；`App/SavedTablesDrawer:240`；`App/TableTemplateManagerDialog:161`；`App/TableTemplatePopover:129`；`App/TemplateManagerDialog:319`；`App/WorkspaceSidebar:268`；`schema-tools/DictionaryReader:24`；`schema-tools/ToolsPage:121` |
| `dropdown-caret` | 下拉触发器箭头 | ChevronDown | control | 8 | 12,14,16 | 部分 opacity-50 | `App/ApplyTemplatePopover:159`；`App/TableTemplatePopover:122`；标签栏“更多” `App/TabBar:156`；侧栏“新建” `App/WorkspaceSidebar:235`；AI 工具 `App/table/DataTableToolbar:140`；数据工具 `:188`；`ui/select:124`、`:196` |
| `drag-handle` | 拖拽手柄 | DragDropVerticalIcon | control | 8 | 14,16 | muted | 字段表 `App/DataTable:231`；文件夹 `App/FolderTree:135`；已存表 `App/saved-tables/TableItem:90`；模板字段表 `App/TemplateFieldTable:109`；枚举值 `App/table/EnumSetEditor:206`；索引字段 chip `App/IndexPanel:634`；索引列表行 `App/IndexPanel:383`、`:424`（这两处不可拖拽，仅装饰） |
| `close` | 关闭 | X | control | 7 | 12,14,16 | — | 通用弹窗 `ui/dialog:58`；抽屉 `App/SavedTablesDrawer:231`；解释气泡 `App/ExplainPopover:207`；关闭标签 `App/TabBar:92`、`:196`；收起首页清单 `App/WorkspaceSidebar:503`；关闭烟花 `FireworksOverlay:344` |
| `disclosure` | 展开 / 收起 | ChevronRight, ChevronDown, ChevronUp | control | 6 | 14,16 | 两处用 rotate-180 | `App/AIGenerateDialog:490/492`；`App/DiffDialog:387/389`；`App/FolderTree:98`；`App/ReviewHistoryDialog:197/199`；`App/TableConfig:114`；`App/table/DataTableToolbar:123` |
| `more` | 更多操作 | MoreHorizontal | control | 5 | 14,16 | 悬停显示 | `App/FolderTree:185`；`App/TableConfig:300`；`App/WorkspaceSidebar:328`、`:536`；`App/saved-tables/TableItem:149` |
| `prev` | 上一页 / 上一帧 | ChevronLeft | control | 3 | 16 | — | `admin/AdminUserList:111`；`App/settings/CreditSettings:275`；`App/SchemaTimelinePlayer:483` |
| `next` | 下一页 / 下一帧 | ChevronRight | control | 3 | 16 | — | `admin/AdminUserList:122`；`App/settings/CreditSettings:291`；`App/SchemaTimelinePlayer:500` |
| `increment` | 数值 +1 | Plus | control | 3 | 12 | muted | Mock 行数 `App/MockDataDialog:175`；冻结列数 `App/table/DataTableToolbar:284`；添加行数 `:350` |
| `decrement` | 数值 −1 | Minus | control | 3 | 12 | muted | `App/MockDataDialog:151`；`App/table/DataTableToolbar:253`；`:329` |
| `check` | 选中标记（复选/菜单/下拉） | Check | control | 3 | 12,14,16 | — | `ui/checkbox:20`；`ui/dropdown-menu:184`；`ui/select:270` |
| `maps-to` | 指向 / 变为（A → B） | ArrowRight | control | 3 | 12,16,20 | text-primary | 关系源→目标 `App/er-diagram/RelationCreationDialog:231`、预览 `:448`；评审字段修改 `App/ReviewResult:168` |
| `remove-chip` | 移除标签 chip | X | control | 2 | 12,14 | muted，悬停 destructive | 索引字段 chip `App/IndexPanel:651`；外键引用字段 chip `App/ForeignKeyPanel:283` |
| `scroll-up` / `scroll-down` | 下拉列表滚动箭头 | ChevronUp, ChevronDown | control | 2 | 16 | — | `ui/select:237`、`:241` |
| `sidebar-collapse` | 收起侧栏 | ChevronLeft | control | 1 | 16 | — | `App/WorkspaceSidebar:225` |
| `sidebar-expand` | 展开侧栏 | ChevronRight | control | 1 | 16 | muted | `App/AppWorkspace:72` |
| `submenu` | 子菜单箭头 | ChevronRight | control | 1 | 16（`[&_svg]:size-4`） | — | `ui/dropdown-menu:110` |
| `radio-dot` | 单选标记 | Circle | control | 1 | 8 | fill-current | `ui/dropdown-menu:210` |
| `skip-first` | 跳到第一帧 | SkipBack | control | 1 | 16 | — | `App/SchemaTimelinePlayer:474` |
| `skip-last` | 跳到最后一帧 | SkipForward | control | 1 | 16 | — | `App/SchemaTimelinePlayer:509` |
| `play` / `pause` | 播放 / 暂停 | Play, Pause | control | 1 | 16 | 白 on primary | `App/SchemaTimelinePlayer:491` |
| `row-arrow` | 行入口箭头 | ArrowRight | control | 1 | 16 | muted | 首页已固定工具行 `App/WorkspaceEmptyState:215` |
| `otp-separator` | 验证码分隔符 | MinusSignIcon（直接导入） | control | 1 | 16 | — | `ui/input-otp:77`（`InputOTPSeparator` 无调用方） |

---

## 2. A→B toggle pairs

同一元素按状态换图标：

| 位置 | 状态变量 | A → B | 含义 |
|---|---|---|---|
| `App/SchemaTimelinePlayer:491` | `isPlaying` | Play → Pause | 回放播放中显示暂停 |
| `App/FolderTree:98` | `isExpanded` | ChevronRight → ChevronDown | 文件夹展开 |
| `App/FolderTree:99` | `isExpanded` | Folder → FolderOpen | 文件夹展开 |
| `App/AIGenerateDialog:489-493` | `showTemplateSelection` | ChevronRight → ChevronDown | 展开模板选择 |
| `App/DiffDialog:386-390` | `showRollback` | ChevronRight → ChevronDown | 展开回滚脚本 |
| `App/ReviewHistoryDialog:196-200` | `expandedId === r.id` | ChevronDown → ChevronUp | 展开评审详情 |
| `App/TableConfig:114` | `detailsOpen` | ChevronDown → ChevronDown + rotate-180 | 展开表详情（同一图标旋转） |
| `App/table/DataTableToolbar:123` | `toolsOpen` | ChevronDown → ChevronDown + rotate-180 | 窄屏展开字段工具 |
| `App/WorkspaceSidebar:225` ↔ `App/AppWorkspace:72` | `workspaceSidebarOpen` | ChevronLeft（收起）↔ ChevronRight（展开） | 侧栏收起/展开，两个组件分别渲染 |
| `App/CommandPalette:191` | `dark` | Moon → Sun | 深色模式下显示“切到浅色” |
| `App/ddl-output/OutputPrimitives:83` | `copied` | Copy → Check | 复制 DDL 后短暂显示已复制 |
| `App/MockDataDialog:234-238` | `copied` | Copy → Check（green-500） | 复制 Mock 数据后显示已复制 |
| `auth/AuthDialogs:424-428` | `isSubmittingAuth` | LogIn → Loader2（spin） | 登录/注册提交中 |
| `App/Header:218-222` | `authSession.status === 'loading'` | LogIn → Loader2（spin） | 会话加载中 |
| `App/TableConfig:282-286` | `isSharing` | Share2 → Loader2（spin） | 生成分享链接中 |
| `App/AIGenerateDialog:597-601` | `isLoading` | Send → Loader2（spin） | AI 生成中 |
| `App/AISchemaPatchPanel:213-216` | `change.status` | 空 → Check（accepted/applied）/ X（rejected） | AI 变更勾选框三态 |
| `App/TableConfig:229` | `objectType` | Table ↔ Eye | 对象类型表/视图（触发器随选择换图标） |
| `App/saved-tables/TableItem:107-117` | `isDraft` | Table2 ↔ FileEdit | 已存表 vs 草稿 |
| `ImportSqlDialog/SqlInputStep:245-249` | `validationResult.success` | AlertCircle ↔ CheckCircle2 | SQL 校验失败/通过 |
| `ImportSqlDialog/index:539` | `currentStepIndex > i` | 步骤序号 → Check | 向导步骤完成 |
| `App/ExplainPopover:196-201` | `isLoading \|\| isStreaming` → `isComplete` | Loader2（spin）→ Check（green，zoom-in） | AI 解释进行中 → 完成 |
| `App/ReviewResult:129-143` | `suggestion.applied` / `suggestion.type` | Plus/Minus/ArrowRight/AlertTriangle/Lightbulb → Check | 建议应用后变为已完成；未应用时按类型取图标 |
| `App/DiffDialog:39-46`、`:100-105` | `diff.type` | Plus / Minus / RefreshCw | 新增/删除/修改（按数据，不随交互切换） |
| `App/WorkspaceYDocStatus:17-86` | `localSynced`、`connectionState`、`synced`、`failureReason` | Loader2(spin) → Loader2(spin) → CheckCircle2 → WifiOff → HardDrive → AlertCircle → HardDrive | 本地同步中 → 连接中 → 已云同步 → 离线 → 本地副本(idle) → 同步失败（同时出现 RefreshCw 重试按钮 `:111`）→ 默认已本地保存 |
| `schema-tools/TableSource:151` | `saved.isFetching` | RefreshCw → RefreshCw + animate-spin | 刷新中（同一图标加动画） |
| `schema-tools/ToolsPage:70` | `isPinned` | Pin muted → Pin blue-strong | 固定/取消固定（只换颜色） |
| `App/ShardingPanel:52`、`:75` | `config.mode` | muted → text-primary | 选中副本表/分片表（只换颜色） |
| `App/IndexPanel:301-306` | 索引 `type` | Key / Lock / Hash | 按索引类型取图标（状态映射） |
| `App/SchemaLintPanel:16-20` | `issue.severity` | AlertCircle / AlertTriangle / Info | 按严重级别取图标（状态映射） |

只在状态满足时追加 Loader2、本身没有图标可替换的位置：`auth/EmailVerificationForm:182,193`、`App/AIIndexAdvisorDialog:184`、`App/TabBar:77,182`（加载中时菜单内的未保存红点隐藏）、`App/ReviewResult:80,244`。`App/EditorLayoutControl` 与 `App/ddl-output/DdlOutputPanel:55` 是分段按钮，每个按钮的图标固定，选中只改样式，不算切换。

---

## 3. Semantic mismatches

- `App/databaseOptions.ts:15` SQL Server 用 GitBranch（分支）。
- `App/databaseOptions.ts:17` MariaDB 用 Share2（分享）。
- `App/databaseOptions.ts:13-14,22,25` PostgreSQL / Citus / Kingbase / GaussDB 用 HardDrive（硬盘）；`:16,21` Oracle / OceanBase-Oracle 用 Layers。这些图标与方言无关，而且在别处另有含义（存储估算、分区、发布）。
- Sparkles 同时代表 AI 建表、AI 修改（工具目录）、AI 索引顾问（弹窗头）和 AI 上下文（`toolCatalog.ts:80,81`、`App/AIIndexAdvisorDialog:71`、`App/AISchemaPatchPanel:300`）。
- AI 修改：工具目录用 Sparkles（`toolCatalog.ts:81`），面板头用 Bot（`App/AISchemaPatchPanel:279`）；而 Bot 在工具目录里代表 AI 注释（`toolCatalog.ts:82`）。
- AI 索引顾问：工具目录用 Zap（`toolCatalog.ts:83`），弹窗头用 Sparkles；Zap 还代表容量估算的冗余开销（`App/StorageEstimatorDialog:213,238`）。
- 字段模板和整表蓝本的图标互换了：工具目录中字段模板用 LayoutTemplate、蓝本用 Table2（`toolCatalog.ts:72-73`）；弹出层里字段模板用 FileText（`App/ApplyTemplatePopover:136,157`、`App/TemplateListItem:25`），蓝本用 LayoutTemplate（`App/TableTemplatePopover:120,158`）。
- Table2 同时代表表对象、关联测试数据工具和整表蓝本（`toolCatalog.ts:59,73`）。
- “工作区”有两个图标：Database（`App/SavedTablesDrawer:193`）和 FolderOpen（`App/WorkspaceSidebar:215`）；FolderOpen 还表示“移动到文件夹”（`:335`）和展开的文件夹（`App/FolderTree:99`）。
- 导入结构：Upload（`App/CommandPalette:149`、`App/WorkspaceSidebar:260`）和 FileInput（`App/WorkspaceSidebar:248`）混用；FileInput 还代表业务数据导入工具（`toolCatalog.ts:60`）。
- 新建草稿有三种图标：FilePlus（`App/CommandPalette:135`、`App/SavedTablesDrawer:210`）、FileEdit（`App/WorkspaceSidebar:240`，同时是草稿对象图标）、Plus（`App/TabBar:210`）。
- 新建文件夹：`App/WorkspaceSidebar:284` 用 Plus，其他位置用 FolderPlus。
- 唯一索引用 Lock（`App/IndexPanel:305,358`、`App/containers/TableBuilderContainer:58`），看起来像“锁定/权限”。
- 普通索引用 Hash（`App/IndexPanel:306,349`），看起来像“编号”。
- 索引数量用 KeyRound（`App/AISchemaPatchPanel:106`、`App/TableTemplatePreview:38`）；KeyRound 在关系弹窗里表示“键字段”（`App/er-diagram/RelationCreationDialog:251`）。
- 字段数量：AI 修改用 FileText（`App/AISchemaPatchPanel:101`），蓝本预览用 ListTree（`App/TableTemplatePreview:31`）。
- “其他配置”用 ShieldCheck（`App/AISchemaPatchPanel:111`），蓝本预览的同类信息用 Settings2；ShieldCheck 还代表结构规范检查（`App/SchemaLintPanel:45`）和迁移兼容性评估（`toolCatalog.ts:52`）。
- 视图对象类型用 Eye（`App/TableConfig:229,243`），读起来像“预览/显示”；Eye 还用于“查看详情”（`admin/AdminUserList:90`）和导入预览（`ImportSqlDialog/PreviewStep:34`）。
- GitBranch 表示索引占用（`App/StorageEstimatorDialog:207,231`）、分片表和分片字段（`App/ShardingPanel:75,95`）和 SQL Server。
- 容量估算的“数据”在分项卡用 Layers（`:201`），在说明区用 Database（`:224`）。
- 副本表用 Database（`App/ShardingPanel:52`），和数据库类型图标相同。
- LayoutGrid 同时是“工具”导航（`App/Header:46`）和 ER 自动布局（`App/er-diagram/ErDiagramToolbar:74`）。
- Search 被用作“查询设计”工具图标（`toolCatalog.ts:48`），和搜索框前缀相同。
- “修改”类变更：DiffDialog 用 RefreshCw（`App/DiffDialog:45`），评审建议用 ArrowRight（`App/ReviewResult:136`）。RefreshCw 还表示结构刷新、重新生成、刷新列表和重试。
- History 同时表示历史版本和评审历史（`App/VersionHistoryDialog:289` vs `App/ReviewHistoryDialog:143`）。
- Lightbulb 同时表示 AI 解释、评审建议标题和“一般建议”（`App/ExplainPopover:169`、`App/ReviewResult:142,242`）。
- 建议级别：结构检查用 Info（`App/SchemaLintPanel:19`），评审用 Lightbulb（`App/ReviewResult:142`）。
- `App/er-diagram/RelationCreationDialog:480` 的错误提示用 AlertTriangle，其他错误用 AlertCircle。
- 彻底删除用 X（`App/WorkspaceSidebar:551`），比普通删除的 Trash2 还弱。
- 删除列表行时，分区、Hive 列、外键、授权对象、ER 连线用 X（`App/PartitionPanel:467`、`App/HivePartitionPanel:179,249`、`App/ForeignKeyPanel:516`、`App/AuthPanel:95`、`App/er-diagram/ErRelationEdge:79`），其他列表用 Trash2。
- Trash2 同时代表删除单项、回收站入口、清空回收站和清空所有表配置（`App/WorkspaceSidebar:465`、`App/containers/GlobalDialogs:291`、`App/TableConfig:319`）。
- 启用用户和增加额度都用 PlusCircle（`admin/AdminUserDetail:303,322`）。
- “添加建议索引”用 ListChecks（`App/AIIndexAdvisorDialog:148`），和字段标准库图标相同。
- 导入预览中的字段上移/下移是垂直列表，却用 ArrowLeft/ArrowRight（`ImportSqlDialog/PreviewStep:114,124`；aria-label 写的是 Move up/down）。
- RotateCcw 同时表示重置 AI 会话、回滚和从回收站恢复。
- Pin 同时表示固定工具（`schema-tools/ToolsPage:70`）和冻结列（`App/table/DataTableToolbar:227`）。
- TableProperties 同时表示 Mock 数据和“数据工具”菜单（`App/table/DataTableToolbar:186,201`）。
- HardDrive 同时表示容量估算、SQLite 导出、“仅本地保存”状态和 4 种方言。
- Copy 同时表示复制到剪贴板和复制一份模板（`App/TemplateListItem:58`、`App/TableTemplateManagerDialog:206`）。
- Settings 同时表示设置页和管理模板（`App/ApplyTemplatePopover:226`、`App/TableTemplatePopover:196`）。
- Code2 同时表示视图定义（`App/ViewDefinitionPanel:28`）和“只看结果”布局（`App/EditorLayoutControl:11`）。
- Table 同时表示“表”导航、表对象类型和“只看设计”布局（`App/EditorLayoutControl:10`）。
- Plus 同时表示添加、数值 +1、变更新增、保存为模板、新建菜单、新标签和新建文件夹。
- 索引列表行显示了拖拽手柄（`App/IndexPanel:383,424`），但这些行不能拖拽。
- 字典导出 Markdown 用 FileText（`schema-tools/DictionaryTool:125`），旁边导出 HTML/JSON 用 Download。
