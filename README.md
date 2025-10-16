# DDLBuilder —— 多数据库建表语句生成器

一个基于 React + TypeScript + Vite 的轻量工具：通过表单与表格输入，实时生成不同数据库（MySQL / PostgreSQL / SQL Server / Oracle）的建表 DDL，并支持一键复制。

## 功能特性

- 支持数据库：MySQL、PostgreSQL、SQL Server、Oracle
- 实时生成建表语句；支持表注释与列注释
- 类型智能映射与别名识别（如 varchar/varchar2、json/jsonb、serial/identity 等）
- 便捷表格编辑（序号自动维护、行增删、是否为空下拉）
- 一键复制 SQL，白底代码主题，便于文档或评审拷贝

## 开发与构建

依赖 Node.js 与包管理器（npm/pnpm/yarn/bun 均可）：

```bash
# 安装依赖
npm i

# 本地开发
npm run dev

# 产物构建
npm run build

# 本地预览
npm run preview
```

## 使用说明

1. 填写表名与表中文名，选择数据库类型。
2. 在表格中按列填写：字段名、字段中文名、字段类型、是否为空。
3. 右侧区域将实时生成对应数据库的建表 DDL，可点击“全部复制”。

### 字段类型与空值规则

- 类型别名示例：
  - 文本类：varchar/nvarchar/char/nchar/text/mediumtext/longtext/clob
  - 数值类：tinyint/smallint/int/bigint/decimal(18,2)/float/double/real/number
  - 日期时间：date/time/timetz/timestamp/timestamptz/datetime/datetime2
  - 其它：uuid/json/jsonb/blob/varbinary/raw/xml/serial
- “是否为空”支持值：是/否、y/yes/true/1/√（其余视为否）。

### 各数据库生成规则要点（摘录）

- MySQL：列注释使用 COMMENT；text/json 等类型直接映射；serial → BIGINT UNSIGNED AUTO_INCREMENT。
- PostgreSQL：表与列注释使用 COMMENT 语句；json → jsonb；timestamp/time 带/不带时区遵循输入。
- SQL Server：text/json 使用 NVARCHAR(MAX)；日期时间使用 DATETIME2；注释用扩展属性 sp_addextendedproperty；uuid → UNIQUEIDENTIFIER；自增为 IDENTITY。
- Oracle：varchar → VARCHAR2，nvarchar → NVARCHAR2；整型映射为 NUMBER(n)；长文本用 CLOB，二进制用 BLOB；自增为 NUMBER GENERATED ALWAYS AS IDENTITY。

## 技术栈

- React 19、TypeScript、Vite 7
- UI 与交互：Handsontable 表格、Radix UI、Lucide 图标、Tailwind CSS
- 代码高亮：react-syntax-highlighter（白底主题）

---

本项目旨在快速生成可读、可复制的建表 DDL，适用于评审与落库前的沟通与对齐场景。
