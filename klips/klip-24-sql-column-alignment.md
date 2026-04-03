---
Author: "@xingkaixin"
Updated: 2026-04-03
Status: Complete
---

## 现状结论

- 当前 SQL 生成链路为 `useSqlGeneration -> buildDDL -> DDLStrategyFactory -> strategy.generateTableDDL`
- 当前不是统一渲染器拿到结构化 AST 后再格式化，而是各个 strategy 直接拼接列定义字符串
- 因此对齐模式的真实落点不是“纯渲染层开关”，而是：
  - `PersistedState` / App 状态中保存 `sqlFormatMode`
  - `useSqlGeneration` / `buildDDL` 将模式参数透传到 strategy
  - strategy 先把列定义拆成结构片段，再决定按 compact 或 aligned 输出
- 已支持数据库中，MySQL 系、Hive 使用 `CREATE TABLE` 内联列注释；PostgreSQL / Oracle / DM / SQL Server 等数据库的列注释是独立语句，但它们的 `CREATE TABLE` 主字段列表仍然可以做“列名 + 类型/约束”两段对齐

## 背景

DDLBuilder 当前生成的 `CREATE TABLE` SQL 输出为紧凑格式，列定义各部分（列名、数据类型、约束/注释）之间仅以单个空格分隔。部分用户反馈，在复制 SQL 到文档、Wiki 或 Code Review 场景时，希望列定义能够垂直对齐，以提升可读性。

对齐需求具体表现为：

- 所有列名左对齐，宽度取列名最大长度
- 所有数据类型左对齐，宽度取类型字符串最大长度
- 行内注释（如 MySQL `COMMENT '...'`）左对齐

## 目标

- 在 SQL 输出链路新增「对齐模式」，支持 `CREATE TABLE` 主字段列表按两段或三段等距对齐输出
- 提供用户可控的模式切换：对齐模式（Aligned）/ 紧凑模式（Compact），默认保持现有紧凑模式不变
- 仅处理 `CREATE TABLE` 主字段列表，不影响表后追加的索引 / 注释 / 授权等独立语句块

## 非目标

- 不处理独立 `COMMENT ON COLUMN` / `sp_addextendedproperty` 等注释语句本身的对齐，这些语句保持现有输出
- 不对约束关键字（`NOT NULL`、`DEFAULT`、`REFERENCES` 等）做独立的列对齐，它们跟随数据类型段之后，整体作为第二段的后缀
- 不改变 SQL 的语义，生成结果与紧凑模式在语义上完全等价
- 不引入外部格式化库

## 设计概览

### 对齐适用范围

按数据库分类：

| 数据库 | 行内 COMMENT | 适用对齐 |
|---|---|---|
| MySQL / MariaDB / TiDB / OceanBase(MySQL) / PolarDB / GBase | 支持 `COMMENT '...'` | 列名 + 类型/约束 + COMMENT 三段对齐 |
| Hive | 支持列内 `COMMENT '...'` | 主字段列表按三段对齐；`PARTITIONED BY` 等区块不参与 |
| PostgreSQL / PostgreSQL-Citus / GaussDB / Kingbase | 注释独立 `COMMENT ON` | `CREATE TABLE` 主字段列表按列名 + 类型/约束 两段对齐 |
| Oracle / OceanBase-Oracle / DM | 注释独立 `COMMENT ON` | `CREATE TABLE` 主字段列表按列名 + 类型/约束 两段对齐 |
| SQL Server | 注释独立 `sp_addextendedproperty` | `CREATE TABLE` 主字段列表按列名 + 类型/约束 两段对齐 |

### 列定义结构

每一列定义在渲染前须先序列化为中间结构：

```typescript
interface ColumnSegments {
  name: string        // 列名（含反引号/引号等转义）
  body: string        // 数据类型 + NOT NULL/DEFAULT 等约束，整体作为一段
  comment?: string    // 行内 COMMENT 字符串（含 COMMENT 关键字及引号），可选
}
```

### 对齐算法

```
1. 遍历所有列定义，收集各段最大宽度：
   maxNameWidth    = max(len(col.name) for col in columns)
   maxBodyWidth    = max(len(col.body) for col in columns)

2. 格式化每一列：
   line = padEnd(col.name, maxNameWidth)
         + "  "
         + padEnd(col.body, maxBodyWidth if hasComment else len(col.body))
         + (col.comment ? "  " + col.comment : "")
```

段间分隔符固定为两个空格，不使用 Tab（Tab 宽度在不同编辑器中不一致）。

### 输出示例对比

紧凑模式（当前）：

```sql
CREATE TABLE orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  user_id BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  status TINYINT NOT NULL DEFAULT 0 COMMENT '订单状态',
  created_at DATETIME NOT NULL COMMENT '创建时间'
);
```

对齐模式：

```sql
CREATE TABLE orders (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT  COMMENT '主键',
  user_id     BIGINT UNSIGNED NOT NULL                 COMMENT '用户ID',
  status      TINYINT NOT NULL DEFAULT 0               COMMENT '订单状态',
  created_at  DATETIME NOT NULL                        COMMENT '创建时间'
);
```

### 生成链路改动位置

改动集中在 SQL 生成链路，不触及 AST、Schema 数据结构或解析逻辑：

- `src/types/index.ts`：新增 `SqlFormatMode`，并在 `PersistedState` 中持久化
- `src/stores/appStore.ts`、`src/components/App/index.tsx`：保存与切换输出模式
- `src/hooks/useSqlGeneration.ts`、`src/utils/ddlGenerators.ts`：将模式透传到 strategy
- `src/strategies/AbstractDDLStrategy.ts`：新增结构化列片段与公共对齐渲染逻辑
- 各 strategy：
  - MySQL 系 / Hive 方言输出三段对齐
  - PostgreSQL / Oracle / DM / SQL Server 系方言输出两段对齐

### 模式开关

在 DDL 输出面板中新增一个选项：

```
输出格式  ○ 紧凑  ● 对齐
```

- 默认值：紧凑（保持现有行为，不影响已有用户）
- 该设置持久化到 `PersistedState.sqlFormatMode`
- 对齐模式仅影响「复制 SQL」和「预览」的输出文本，不影响内部数据模型

## 验收标准

- [ ] MySQL / MariaDB / TiDB / OceanBase(MySQL) / PolarDB / GBase：列名、类型+约束、COMMENT 三段垂直对齐
- [ ] Hive：主字段列表三段垂直对齐；`PARTITIONED BY` / `CLUSTERED BY` / `STORED AS` / `LOCATION` 保持现有格式
- [ ] PostgreSQL / PostgreSQL-Citus / GaussDB / Kingbase：`CREATE TABLE` 主字段列表两段垂直对齐，`COMMENT ON` 语句保持现有格式
- [ ] Oracle / OceanBase-Oracle / DM：`CREATE TABLE` 主字段列表两段垂直对齐，`COMMENT ON` 语句保持现有格式
- [ ] SQL Server：`CREATE TABLE` 主字段列表两段垂直对齐，`sp_addextendedproperty` 语句保持现有格式
- [ ] 表后追加的索引、同义词、注释语句不受对齐处理影响，保持原有格式
- [ ] 紧凑模式输出与当前版本 byte-for-byte 一致（无回归）
- [ ] 模式切换开关在 UI 中可见且可操作
- [ ] 模式切换后复制内容与预览内容一致
- [ ] 用户切换模式后，预览区实时刷新

## 待讨论

- 对齐模式下，列名与类型之间的最小间距是固定 2 空格还是允许用户配置？-> 固定2空格
- 是否需要区分「仅对齐列名与类型」和「同时对齐注释」两个子选项，还是统一为一个开关？-> 统一开关
