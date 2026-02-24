---
created: "2026-02-22"
updated: "2026-02-24"
status: "completed"
---

# KLIP-23: 集成 VitePress 帮助文档系统

## 1. 需求分析

**背景**：
当前 DDLBuilder 项目作为一个功能丰富的工具，缺乏一个系统化的帮助手册和使用指南。为了提升用户体验、降低上手门槛，并提供诸如常见问题解答、进阶操作指南、发布日志等信息，我们需要在应用中增加独立的文档服务模块。

**目标**：
1. 提供用户可访问的帮助手册路径（如 `your-domain/docs/`）。
2. 文档能按照指定结构分类（如：基础指南、高级技巧、常见问题、发布说明这 4 个主分类）。
3. 支持各个大类下定义多个子章节，并支持自由控制这些分类和章节的展示顺序。
4. 保证文档编写和维护的低成本（直接编写 Markdown 即可）。
5. 架构上实现“主产品”与“文档页面”解耦，避免文档的依赖膨胀到主产品的构建链路中。
6. 充分利用现有构建和托管体系（Vite + Vercel + 系统已有 Bun 包管理器）。

## 2. 风险点与防范措施

| 风险点 | 详细描述 | 防范措施 / 解决方案 |
|---|---|---|
| **路由冲突/404 问题** | VitePress 默认会将其产物的根路径挂载为 `/`，与主工程的 SPA 应用路由冲突；或 Vercel 的兜底重写规则导致 `/docs` 被代理回主应用页。 | 1. 在 VitePress 配置中强指定 `base: '/docs/'`。<br>2. 经分析目前 `vercel.json` 只有 `/api` 和 `/share` 重写，不会吃掉 `/docs/...`，风险可控。 |
| **产物割裂致部署繁琐** | 独立编译 `docs` 会导致构建产物分离，在 Vercel 这个依靠单体产物的平台上较难实现双应用共存。 | 将 VitePress 的 `outDir` 定位到主应用打包输出的 `dist/docs` 中，Vercel 部署前串联执行两个构建流程，统一输出一个完整的 `dist` 被 Vercel 静态托管服务器直接读取。 |
| **依赖污染** | VitePress 及 Vue 相关依赖混入主库 `package.json` 会导致项目工程臃肿，增加后续分离和排查问题的难度。 | 在 `docs` 目录下创建一个完全独立的 `package.json`。在构建时，通过 `cd docs && bun install` 实现依赖获取与隔离。 |

## 3. 架构方案调整

在现有的技术生态下，无需引入额外的微前端或域名转发配置。我们采用的模式为：**物理隔离开发 + 编译期产物合并 + 统一入口分发**。

- **构建与开发工具**：
  主应用：`Vite` + `React`
  文档中心：`VitePress` (`Vite` + `Vue`) + `Markdown`
- **目录设计**：文档代码作为一个整体子目录 `docs/` 存放在项目根目录下。
- **本地开发**：通过独立的 `bun run docs:dev` 启动，互不干扰；若需要在本地模拟线上 `/docs/` 同域体验，可在主应用的 `vite.config.ts` 中配置反向代理（proxy）到 VitePress 开发端口（可选增强）。
- **CI/CD 构建编排 (Vercel)**：
  调整根目录的 `package.json` 中的 `build` 脚本，将主应用打包和文档打包串联起来。
  执行流程：主应用打包 (`dist`) -> 切换到 docs 目录 -> 安装文档依赖 -> 打包文档 (`dist/docs`) -> Vercel 接管发布 `dist`。

## 4. 细节内容排期与实施

1. **环境与脚手架搭建**
   - 新建 `docs` 文件夹，执行 `bun init -y` 并安装 `vitepress` 与 `vue` 依赖。
   - 配置 `docs/package.json` 的独立 script 指令。
2. **VitePress 核心配置 (`config.ts`)**
   - 设定 `base: '/docs/'`
   - 设定 `outDir: '../dist/docs'`
   - 设定整体页面的 `title`, `description`, `socialLinks` 等主题元数据。
3. **导航 (Nav) 和 侧边栏 (Sidebar) 构建**
   - 充分利用 VitePress `themeConfig` 的配置项，以数据驱动的形式在 `config.ts` 中固化菜单节点。
   - 通过配置 `nav` 数组约定顶部的 "4大菜单" 及其顺序。
   - 通过配置 `sidebar` 对象，为每个菜单路径约定下属的 Markdown 文件渲染顺序和目录层级（章节排序全靠这里的数组控制，不依赖文件系统默认的字典序）。
4. **统一构建提效**
   - 在根级的 `package.json` 中重写 `"build"`: `"tsc -b ... && vite build && cd docs && bun install && bun run docss:build"`
5. **冒烟测试与验证**
   - 测试 Hono 接口 (`/api/*`) 是否异常。
   - 测试 React Router 主应用路径拦截是否正常。
   - 测试 `/docs/` 后缀静态资源和页面路由是否正常返回且没有 404。

## 5. `docs` 目录的结构层级规划

```text
/
├── package.json           # 根目录：需修改 build 指令
├── vercel.json            # 维持原样，无需修改
├── dist/                  # 打包后的 Vercel 发布产物
│   ├── index.html         # 主应用 HTML
│   ├── assets/            # 主应用 JS/CSS
│   └── docs/               # 合并后的 VitePress 文档产物 (执行 build 后产生)
│
└── docs/                   # [新增] 纯文档工程目录
    ├── package.json       # [新增] 独立依赖
    ├── .vitepress/
    │   └── config.ts      # [新增] VitePress 配置文件 (控制 base/outDir/菜单/侧边栏排序)
    │
    ├── index.md           # [新增] 文档首页 /docs/
    │
    ├── basic/             # 基础指南
    │   ├── index.md       # 介绍 / 头文件
    │   ├── getting-started.md
    │   └── core-concepts.md
    │
    ├── advanced/          # 高级技巧
    │   ├── index.md
    │   ├── custom-templates.md
    │   └── performance.md
    │
    ├── faq/               # 常见问题
    │   ├── index.md
    │   └── common-errors.md
    │
    └── changelog/     # 更新说明
        ├── changelog.md

```

通过如上清晰的分层与架构把控，我们能在完全零干扰原系统心智模型的前提下，引入高性能的静态文档解决方案。
