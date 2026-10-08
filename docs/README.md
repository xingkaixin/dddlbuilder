# DDLBuilder 项目文档

本目录记录项目目标、架构边界和长期有效的设计原则，用于约束后续迭代方向。

其他文档：

- 功能使用说明：`apps/docs`（VitePress 用户文档）
- 开发命令与部署步骤：根目录 `README.md`
- 编码与验证约定：`AGENTS.md`

## 目录

| 文档 | 内容 |
| --- | --- |
| [product.md](product.md) | 产品定位、目标用户、核心工作流、非目标 |
| [architecture.md](architecture.md) | 运行时组成、包职责与依赖方向、数据归属、跨模块原则 |
| [modules/schema-engine.md](modules/schema-engine.md) | 表结构建模、DDL/ORM 生成、diff 与数据库工具 |
| [modules/workspace-sync.md](modules/workspace-sync.md) | 工作区存储、Y.Doc 同步、匿名数据迁入账号 |
| [modules/account-and-ai.md](modules/account-and-ai.md) | 认证与会话、额度账本、AI 请求治理、管理后台 |
| [adr/](adr/) | 架构决策记录 |
| [../CONTEXT.md](../CONTEXT.md) | 领域术语 |
| [../apps/worker/OBSERVABILITY.md](../apps/worker/OBSERVABILITY.md) | AI 链路的 tracing 与日志查询 |

## 维护规则

- 只写长期成立的目标、边界、不变量和取舍理由。常量、行号、函数签名以代码为准，不在文档中复制。
- 改动违反或修改了文档中的原则时，在同一个 PR 中更新对应文档。
- 存在多个可选方案、以后可能被重新质疑的决定，写成 ADR：`adr/NNNN-<slug>.md`，用一段话说明决定和理由。决定被取代时新增 ADR，并在旧 ADR 中注明。
- 执行计划、审查报告、批次记录等一次性文档不放进本目录。它们写在 PR 或 issue 中，完成后由 git 历史保留；仍然成立的结论合并进模块文档或 ADR。
- 新增领域术语或术语含义变化时，更新 `CONTEXT.md`。
