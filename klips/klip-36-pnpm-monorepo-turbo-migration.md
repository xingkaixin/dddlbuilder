---
Author: "@xingkaixin"
Updated: 2026-04-15
Status: Draft
---

# klip-36-pnpm-monorepo-turbo-migration

## 现状结论（代码校准）

- **单 package 架构**：项目根只有一个 `package.json`（`name: "ddlbuilder"`, `version: "0.15.7"`），所有依赖混在一起，前端的 React、后端的 Hono、文档的 VitePress 全部共用同一份 node_modules。证据：[`package.json`](../package.json)

- **两套 Vite 构建**：`vite.config.ts` 输出前端产物至 `dist/client`，`vite.config.server.ts` 以 library 模式输出后端产物至 `dist/server.js`。两个配置都声明了 `@/*` → `./src/*` 的 path alias，worker bundle 因此依赖 `src/` 目录存在。证据：[`vite.config.ts`](../vite.config.ts)、[`vite.config.server.ts`](../vite.config.server.ts)

- **构建流程为单行串联脚本**：`build` script 是 `tsc -b ... && vite build --config server ... && verify && vite build && docs:build && cp -r`，无缓存、无并行、无增量。证据：[`package.json`](../package.json#L19)

- **DDL 策略引擎全部在前端目录**：`src/strategies/` 含 15 个文件（`AbstractDDLStrategy.ts` + 14 个具体策略），仅使用 `../types`、`../interfaces`、`../utils` 中的纯 TypeScript 类型和工具函数，无任何 DOM/React 依赖。但目前 `server-api/` 中的 AI 路由（explain、review、generateTable）也涉及 DDL 相关参数，两侧共享了 `DatabaseType` 类型。证据：[`src/strategies/AbstractDDLStrategy.ts`](../src/strategies/AbstractDDLStrategy.ts)

- **前后端共享类型**：`src/types/api.ts` 定义了 `ApiErrorCode`、`WorkspaceSnapshotResponse`、`MeApiResponse` 等前后端共用的 API 契约类型；`src/types/index.ts` 定义了 `DatabaseType`、`FieldRow`、`PersistedState` 等核心领域类型，同时被前端和 `server-api/` 路由引用。证据：[`src/types/api.ts`](../src/types/api.ts)、[`src/types/index.ts`](../src/types/index.ts)

- **Drizzle schema 分散**：DB schema 目前在 `server-api/lib/authSchema.ts`（Better Auth 表），用户系统相关表（credit_accounts、workspace_snapshots 等）也在 `server-api/lib/` 下不同文件中。迁移文件在根目录 `migrations/`（3 个 SQL 文件）。无独立的 `drizzle.config.ts`。证据：[`server-api/lib/authSchema.ts`](../server-api/lib/authSchema.ts)、[`migrations/`](../migrations/)

- **wrangler.toml 当前路径依赖**：`main = "dist/server.js"`，`[assets] directory = "dist/client"`，两者都相对根目录，迁移后需重新定位。证据：[`wrangler.toml`](../wrangler.toml)

- **docs 已有独立构建边界**：`docs:build` 用 `bun install --cwd docs && bun run --cwd docs docs:build`，VitePress 子项目实际上已经是半独立的。证据：[`package.json`](../package.json#L22)

---

## 背景

- **构建无缓存，改一行代码全量重跑**：当前 `build` 脚本是线性串联，Turbo 之前没有增量缓存，任何改动都触发完整的 tsc + 两次 vite build + docs build，CI 耗时较长。
- **依赖边界模糊**：前端 `@radix-ui`、后端 `resend`、工具脚本 `sharp` 同在一个 `package.json` 中，很难区分哪些是生产必须、哪些是开发工具，新成员上手时认知负担高。
- **DDL 核心逻辑无法复用**：`src/strategies/` 是纯 TypeScript、无 DOM 依赖的 DDL 引擎，但因为在 `src/` 下，无法被 CLI 工具、服务端预处理或其他消费方直接引用，未来扩展受限。
- **协作边界不清晰**：`api/`、`server-api/`、`src/`、`docs/` 四个主要代码区域在同一个包里，PR 改动范围难以快速判断，reviewer 需要全局了解才能定位风险点。
- **未来存在拆服务的可能性**：`apps/docs` 独立部署、admin 模块独立化、ddl-core 供 CLI 使用，这些需求在单 package 架构下成本很高。

---

## 目标

1. 将项目重组为 **pnpm workspace monorepo**，按职责拆分为 3 个 app 和 4 个内部 package。
2. 引入 **Turborepo** 作为任务编排层，实现构建、测试、类型检查的增量缓存与并行执行。
3. 将前后端共享类型提取到 `packages/shared-types`，消除跨目录 path alias 耦合。
4. 将 DDL 策略引擎提取到 `packages/ddl-core`，作为内部包（不发布 npm），为未来 CLI 工具或服务端预处理做好边界准备。
5. 将 Drizzle schema 和迁移文件集中到 `packages/db`，`apps/worker` 通过包引用使用，不再直接持有 schema 文件。
6. 迁移后**所有现有功能不变**，不引入新功能，不更改 API 合约。

---

## 非目标

- 本文不涉及将任何包发布到 npm registry。
- 不引入新的运行时依赖或技术栈。
- 不改变 Cloudflare Workers 的部署模型（仍是单 Worker + D1 + KV）。
- 不拆分 admin 为独立 app（`src/admin/` 留在 `apps/web` 内）。
- 不迁移包管理器（暂不从 bun 切换到纯 pnpm，开发体验保持 bun 优先；pnpm 仅用于 workspace 管理）。
- 不在本轮引入 Changesets 或版本管理策略。

---

## 评估维度

1. **技术可行性**：Cloudflare Workers 单 bundle 模型与 monorepo 是否兼容？
2. **构建收益**：Turbo 增量缓存实际能节省多少构建时间？
3. **代码复用收益**：`shared-types` 和 `ddl-core` 提取后的实际价值。
4. **迁移成本**：需要改动多少文件、改动类型是否高风险？
5. **日常开发体验**：monorepo 后的 HMR、测试、类型检查是否会更繁琐？

---

## 评估结果

### 1. 技术可行性

**结论：完全可行，无部署模型冲突。**

Cloudflare Workers 要求的产物是：
- `dist/server.js`（Worker 入口，单文件 bundle）
- `dist/client/`（静态资源，SPA）

这两个产物分别由 `apps/worker` 和 `apps/web` 的 Vite 构建产生，monorepo 只是代码的组织方式，不影响最终 bundle 策略。`wrangler.toml` 迁移到 `apps/worker/` 后，只需调整 `[assets] directory` 的相对路径指向 `apps/web/dist/client`，或在 Turbo 的 `build` pipeline 完成后将产物拷贝到标准位置，均可实现。

目前 `vite.config.server.ts` 中 `@/*` alias 指向 `./src`，这是隐式耦合。迁移后 `apps/worker` 的 Vite 配置不再需要这个 alias，改为从 `@ddlbuilder/shared-types`、`@ddlbuilder/db` 引入，反而更加清晰。

### 2. 构建收益

**结论：CI 构建收益中到高，本地开发收益低到中。**

当前构建流程：tsc → vite(server) → verify → vite(client) → docs → cp，全量串行。

引入 Turbo 后的并行图：
```
packages/tsconfig    → (并行)
packages/shared-types → packages/ddl-core
                        packages/db
                        → apps/web (并行)
                        → apps/worker (并行)
                        → apps/docs (独立)
```

只改动 `apps/web` 代码时，`apps/worker` 和 `packages/db` 的构建缓存命中，Turbo 跳过。只改动 `server-api/` 时，前端构建缓存命中。docs 完全独立，不参与 app 构建的缓存 invalidation。

对 CI 的提升：通常代码改动集中在单个 app，跳过其余 app 的构建可节省 40-60% 的 CI 时间（估算基于当前串联构建耗时）。

### 3. 代码复用收益

**结论：`shared-types` 价值高，`ddl-core` 价值中（当前无外部消费者，但边界建立后未来扩展零成本）。**

`src/types/api.ts` 和 `src/types/index.ts` 中的类型当前同时被前端和 `server-api/` 的路由文件引用。提取到 `packages/shared-types` 后，两侧都从同一个包引入，类型漂移风险消除，API 契约变更时需要修改 `shared-types`，reviewer 能清晰看到影响范围。

`packages/ddl-core` 当前阶段的价值是边界清晰，纯逻辑与 UI 层解耦。未来若需要：CLI 工具生成 DDL、服务端对 AI 生成的 DDL 做格式验证、或在 Node.js 环境预处理 SQL，可直接依赖此包。

### 4. 迁移成本

**结论：改动量中等，风险可控，分阶段执行可降低风险。**

高风险改动：
- `@/*` alias 替换：`server-api/` 中引用 `@/types` 的文件需统一替换为 `@ddlbuilder/shared-types` 导入。
- `wrangler.toml` 路径调整：`[assets] directory` 需要跨 app 引用，需验证 wrangler 对相对路径的处理。
- Drizzle Kit 配置迁移：drizzle 的 schema 路径和 migrations 输出路径需要在 `packages/db` 中重新配置。

低风险改动：
- TypeScript project references 重组（各包有独立 `tsconfig.json`）。
- `lint` 和 `test` 命令分散到各 app/package 的 `package.json`，根目录通过 Turbo 聚合。
- `scripts/` 目录留在根目录（用于 CI 和部署的 bun 脚本）。

### 5. 日常开发体验

**结论：短期适应成本低，长期体验持平或提升。**

- `pnpm dev`（根目录）通过 Turbo 并行启动 `apps/web` 和 `apps/worker`，与当前 `bun run dev` 行为一致。
- VSCode 通过 workspace 配置可以在同一窗口访问所有包的类型定义，TypeScript 类型跳转跨包正常工作（需配置 TypeScript project references）。
- `pnpm test` 在根目录执行所有包的测试，各包独立运行 Vitest，Turbo 缓存不变的包。

---

## 收益评估

### 1. 工程心智收益：中到高

monorepo 边界强制了"谁可以依赖谁"的规则。`packages/db` 不能反向依赖 `apps/worker`，`apps/web` 不能直接引用 `server-api/`。这些依赖规则目前靠约定维护，monorepo 后靠工具链强制。

### 2. 构建效率收益：中到高

Turbo remote cache（配合 Cloudflare R2 或 Vercel Remote Cache）可让 CI 完全跳过未改动 app 的构建，对频繁发布的前端改动收益尤为明显。

### 3. 代码复用收益：中

`packages/shared-types` 消除了类型漂移风险。`packages/ddl-core` 建立了复用边界，当前无立即收益，未来收益取决于是否有新消费者。

### 4. 团队协作收益：中

PR diff 更聚焦：改动 `apps/worker` 的 PR 不会触及 `apps/web` 的文件，reviewer 可以专注特定包的变更。

---

## 成本评估

### 1. 迁移人天成本：中

估算：
- Phase 0-1（初始化 + tsconfig）：0.5 天
- Phase 2（shared-types + ddl-core 提取）：1 天
- Phase 3（db 包 + drizzle 迁移）：1 天
- Phase 4-5（worker + web 拆分）：2 天
- Phase 6-7（docs + Turbo pipeline + CI）：1 天

合计约 5-6 人天，风险缓冲 1-2 天。

### 2. 工具链学习成本：低

团队已有 pnpm 使用经验。Turbo 配置较简单，核心只需要理解 `pipeline` 和 `dependsOn`。

### 3. 长期维护成本：低到中

新包上线时需要在 `pnpm-workspace.yaml` 注册，在 Turbo pipeline 中声明依赖关系，有轻微额外步骤。但边界清晰后的可维护性总体提升。

---

## 切换判定与建议

**建议执行，采用标准拆包方案。**

触发条件已满足：
- 项目规模已达 monorepo 受益阈值（多个职责明确的代码区域，跨区域引用已存在）
- 构建无缓存问题在 CI 上已有可感知的等待时间
- 团队已明确有代码复用需求（ddl-core、shared-types）和未来拆服务意向

建议采用**分阶段、可回滚**的方式执行，每个 Phase 合并后保证全功能可用，不做大爆炸式迁移。

---

## 目标态设计

### 包结构

```
ddlbuilder/
├── apps/
│   ├── web/                    # React SPA
│   │   ├── src/                # 原 src/（去掉 types/ 和 strategies/ 已提取部分）
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json        # @ddlbuilder/web
│   ├── worker/                 # Cloudflare Worker + Hono API
│   │   ├── api/                # 原 api/
│   │   ├── server-api/         # 原 server-api/
│   │   ├── vite.config.server.ts
│   │   ├── wrangler.toml
│   │   ├── tsconfig.json
│   │   └── package.json        # @ddlbuilder/worker
│   └── docs/                   # VitePress 文档
│       ├── ...                 # 原 docs/ 内容
│       └── package.json        # @ddlbuilder/docs
├── packages/
│   ├── tsconfig/               # 共享 tsconfig base
│   │   ├── base.json
│   │   ├── react-app.json
│   │   └── package.json        # @ddlbuilder/tsconfig
│   ├── shared-types/           # 前后端共享类型
│   │   ├── src/
│   │   │   ├── index.ts        # 原 src/types/index.ts（核心领域类型）
│   │   │   └── api.ts          # 原 src/types/api.ts（API 契约类型）
│   │   ├── tsconfig.json
│   │   └── package.json        # @ddlbuilder/shared-types
│   ├── ddl-core/               # DDL 策略引擎
│   │   ├── src/
│   │   │   ├── strategies/     # 原 src/strategies/（15 个文件）
│   │   │   ├── interfaces/     # 原 src/interfaces/DDLStrategy.ts
│   │   │   └── utils/          # 原 src/utils/（DDL 相关工具函数）
│   │   ├── tsconfig.json
│   │   └── package.json        # @ddlbuilder/ddl-core
│   └── db/                     # Drizzle schema + 迁移管理
│       ├── schema/
│       │   ├── auth.ts         # 原 server-api/lib/authSchema.ts
│       │   └── user-system.ts  # 原 server-api/lib/ 中的用户系统 schema
│       ├── migrations/         # 原根目录 migrations/（3 个 SQL 文件）
│       ├── seeds/              # 原根目录 seeds/
│       ├── drizzle.config.ts   # Drizzle Kit 配置
│       ├── tsconfig.json
│       └── package.json        # @ddlbuilder/db
├── scripts/                    # CI/部署 bun 脚本（保留在根目录）
├── turbo.json
├── pnpm-workspace.yaml
└── package.json                # root（仅含工具脚本和 workspace devDeps）
```

### 依赖关系图

```
@ddlbuilder/tsconfig
       │
       ├── @ddlbuilder/shared-types
       │          │
       │          ├── @ddlbuilder/ddl-core ──→ apps/web
       │          │
       │          └── @ddlbuilder/db ────────→ apps/worker
       │
       └── (直接被 apps/* 引用)

apps/web     → @ddlbuilder/shared-types, @ddlbuilder/ddl-core, @ddlbuilder/tsconfig
apps/worker  → @ddlbuilder/shared-types, @ddlbuilder/db, @ddlbuilder/tsconfig
apps/docs    → 无内部包依赖
```

### Turbo pipeline

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "typecheck": {
      "dependsOn": ["^typecheck"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "lint": {}
  }
}
```

### 关键配置示例

**pnpm-workspace.yaml**
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**packages/shared-types/package.json**
```json
{
  "name": "@ddlbuilder/shared-types",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./api": "./src/api.ts"
  }
}
```

**packages/ddl-core/package.json**
```json
{
  "name": "@ddlbuilder/ddl-core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@ddlbuilder/shared-types": "workspace:*"
  }
}
```

**apps/worker/wrangler.toml（关键路径调整）**
```toml
name = "ddlbuilder"
main = "dist/server.js"

[assets]
# 相对于 apps/worker，web 产物在 ../../apps/web/dist/client
# 建议在 turbo build 后使用 cp 脚本统一收集，或用根目录的部署脚本
directory = "dist/client"
```

> **注意**：wrangler 的 `[assets] directory` 必须在 `wrangler.toml` 所在目录的相对位置存在。建议在 Turbo `build` 完成后，由根目录的 `scripts/deploy.ts` 将 `apps/web/dist/client` 复制到 `apps/worker/dist/client`，然后从 `apps/worker/` 执行 `wrangler deploy`。

---

## 迁移计划

### Phase 0：初始化 workspace 骨架

**任务：**
- 根目录创建 `pnpm-workspace.yaml`，声明 `apps/*` 和 `packages/*`
- 创建 `turbo.json`，定义 `build`、`typecheck`、`test`、`lint` 任务
- 根目录 `package.json` 精简为只含 `turbo`、`typescript`、linting 工具
- 创建 `packages/tsconfig/`，提取 `tsconfig.app.json` 和 `tsconfig.node.json` 为 base

**验证：** `pnpm install` 成功，根目录 `turbo build` 可以执行（此时所有 app 尚未拆分，仍在根目录）。

---

### Phase 1：提取 `packages/shared-types`

**任务：**
- 新建 `packages/shared-types/src/`，将以下文件迁移：
  - `src/types/index.ts` → `packages/shared-types/src/index.ts`
  - `src/types/api.ts` → `packages/shared-types/src/api.ts`
  - `src/types/workspace.ts` → `packages/shared-types/src/workspace.ts`（若有前后端共用内容）
  - `src/types/aiGenerate.ts` → 评估是否属于前后端共享，若仅前端则留在 `apps/web`
- `apps/web`（暂时仍在 `src/`）和 `apps/worker`（暂时仍在 `server-api/`）通过 `@ddlbuilder/shared-types` 引入，替换原来的 `@/types` 引用
- 更新 `vite.config.ts` 和 `vite.config.server.ts` 的 alias，添加 `@ddlbuilder/shared-types` 的 resolve

**验证：** `pnpm build` 通过，`pnpm typecheck` 无类型错误。

---

### Phase 2：提取 `packages/ddl-core`

**任务：**
- 新建 `packages/ddl-core/src/`，迁移以下目录：
  - `src/strategies/` → `packages/ddl-core/src/strategies/`
  - `src/interfaces/DDLStrategy.ts` → `packages/ddl-core/src/interfaces/`
  - `src/utils/databaseTypeMapping.ts`、`src/utils/TypeMapper.ts`、`src/utils/primaryKeyNaming.ts` 等 DDL 相关工具 → `packages/ddl-core/src/utils/`
- 识别 `src/utils/` 中与 DDL 无关的工具函数（如 UI 工具），保留在 `apps/web/src/utils/`
- 更新 `apps/web` 中对 `@/strategies/*` 的引用，改为 `@ddlbuilder/ddl-core`

**验证：** DDL 生成功能正常，`pnpm test` 通过（策略单元测试需迁移至 `packages/ddl-core/src/__tests__/`）。

---

### Phase 3：提取 `packages/db`

**任务：**
- 新建 `packages/db/`，迁移以下内容：
  - `server-api/lib/authSchema.ts` → `packages/db/schema/auth.ts`
  - 其他 Drizzle schema 文件（在 `server-api/lib/` 中用 `sqliteTable` 定义的）→ `packages/db/schema/`
  - `migrations/` → `packages/db/migrations/`
  - `seeds/` → `packages/db/seeds/`
- 在 `packages/db/` 中创建 `drizzle.config.ts`
- 更新 `server-api/lib/betterAuth.ts` 和其他引用 schema 的文件，改为从 `@ddlbuilder/db` 引入
- 更新 `package.json` 中数据库相关脚本（`db:migrate:local` 等），改为在 `packages/db/` 目录下执行

**验证：** `pnpm db:migrate:local` 正常执行，本地 D1 数据库可访问，`pnpm dev:worker` 正常启动。

---

### Phase 4：拆分 `apps/worker`

**任务：**
- 创建 `apps/worker/`，迁移以下目录和文件：
  - `api/` → `apps/worker/api/`
  - `server-api/` → `apps/worker/server-api/`（此时 schema 已移走，只剩业务逻辑）
  - `vite.config.server.ts` → `apps/worker/vite.config.ts`
  - `wrangler.toml` → `apps/worker/wrangler.toml`（调整路径）
  - `wrangler.e2e.toml` → `apps/worker/wrangler.e2e.toml`
- 创建 `apps/worker/package.json`（`@ddlbuilder/worker`），声明对 `@ddlbuilder/shared-types`、`@ddlbuilder/db` 的依赖
- 更新 `apps/worker` 中的 import 路径（已不存在 `@/` alias）

**验证：** `pnpm --filter @ddlbuilder/worker build` 成功输出 `dist/server.js`，API 端点正常响应。

---

### Phase 5：拆分 `apps/web`

**任务：**
- 创建 `apps/web/`，迁移 `src/`（去掉已提取到 `ddl-core` 和 `shared-types` 的部分）
- `vite.config.ts` → `apps/web/vite.config.ts`（调整 proxy 目标地址）
- 创建 `apps/web/package.json`（`@ddlbuilder/web`），声明对 `@ddlbuilder/shared-types`、`@ddlbuilder/ddl-core` 的依赖
- 更新 Vitest 配置，迁移至 `apps/web/vitest.config.ts`
- 更新 Playwright 配置，迁移至根目录或 `apps/web/playwright.config.ts`（视 E2E 测试覆盖范围决定）

**验证：** `pnpm --filter @ddlbuilder/web build` 成功输出 `dist/client/`，前端功能完整，`pnpm test` 通过。

---

### Phase 6：拆分 `apps/docs`

**任务：**
- 将 `docs/` 内容移入 `apps/docs/`，保持现有 VitePress 配置不变
- 根目录 `package.json` 移除 `docs:*` 脚本，由 Turbo `build` 自动调用 `apps/docs` 的 build

**验证：** `pnpm --filter @ddlbuilder/docs build` 成功，文档站点可访问。

---

### Phase 7：完善 Turbo pipeline 与 CI

**任务：**
- 完善 `turbo.json`，确保依赖链正确（`apps/worker` 的 `build` 依赖 `packages/db` 的 `build`，等）
- 更新 CI 配置（`.github/workflows/` 或等效），替换 `bun run build` 为 `pnpm turbo build`
- 配置 Turbo 远程缓存（可选：Cloudflare R2 或 Vercel）
- 更新根目录 `scripts/deploy.ts`，适配新的产物路径（cp web 产物到 worker dist）
- 更新 `lint` 脚本，改为 `turbo lint`，各包声明自己的 lint 范围

**验证：** CI pipeline 全量通过，第二次 CI 运行（无代码变更）全部命中缓存，耗时 < 30 秒。

---

## 回滚策略

- 每个 Phase 对应一个独立 PR，合并前保证主干可构建、可部署。
- 若某个 Phase 合并后出现生产问题，回滚该 PR 即可恢复上一个稳定状态。
- 迁移期间保持旧的根目录 `build` 脚本可用（通过 Turbo 的 `--filter` 模拟），直到 Phase 7 完成前不删除。
- `packages/db/migrations/` 中的 SQL 文件内容不变，数据库层无回滚风险。

---

## 验收标准

- [ ] `pnpm install` 在根目录成功，所有 workspace 包依赖正确解析
- [ ] `pnpm turbo build` 完整构建通过，产物路径正确：`apps/web/dist/client/`、`apps/worker/dist/server.js`、`apps/docs/dist/`
- [ ] `pnpm turbo test` 所有单元测试通过，覆盖率不低于迁移前水平
- [ ] `pnpm turbo typecheck` 零 TypeScript 类型错误
- [ ] `pnpm turbo lint` 通过
- [ ] 本地开发：`pnpm dev` 启动全栈开发服务器，前端 HMR 正常，API 请求正常代理
- [ ] E2E 测试：`pnpm test:e2e` 通过，核心流程（DDL 生成、AI 功能、认证）无回归
- [ ] `wrangler deploy`（从 `apps/worker/` 执行）成功部署，生产环境功能验证通过
- [ ] 第二次 `pnpm turbo build`（无代码变更）显示全部 task 命中缓存
- [ ] `@/*` alias 在 `apps/worker` 中不再存在，所有跨包引用通过 `@ddlbuilder/*` 完成

---

## 待讨论事项

- **bun vs pnpm 并存**：当前 `scripts/` 中全部脚本使用 `bun run`，迁移后是否保持 bun 作为脚本执行器、pnpm 仅用于 workspace 依赖管理？建议保持 bun 作为执行器（`bun run turbo build`），pnpm 管理 workspace，两者不冲突。
- **E2E 测试归属**：Playwright E2E 测试（`e2e/` 目录）当前面向完整全栈，应归属于 `apps/worker` 还是根目录？建议放在根目录 `e2e/`，因为它是跨 app 的集成测试。
- **`src/types/aiGenerate.ts` 和 `src/types/locale.ts` 的归属**：`aiGenerate.ts` 定义的类型若仅被前端 AI 功能使用，则留在 `apps/web`；若 `server-api/` 的 AI 路由也依赖这些类型，则需移入 `shared-types`。需要代码审查确认后决定。待确认。

---

## 关键参考位置

- [`package.json`](../package.json)
- [`vite.config.ts`](../vite.config.ts)
- [`vite.config.server.ts`](../vite.config.server.ts)
- [`wrangler.toml`](../wrangler.toml)
- [`src/types/index.ts`](../src/types/index.ts)
- [`src/types/api.ts`](../src/types/api.ts)
- [`src/strategies/AbstractDDLStrategy.ts`](../src/strategies/AbstractDDLStrategy.ts)
- [`server-api/lib/authSchema.ts`](../server-api/lib/authSchema.ts)
- [`server-api/lib/context.ts`](../server-api/lib/context.ts)
- [`server-api/lib/betterAuth.ts`](../server-api/lib/betterAuth.ts)
- [`api/index.ts`](../api/index.ts)
- [`migrations/`](../migrations/)
- [`docs/`](../docs/)
