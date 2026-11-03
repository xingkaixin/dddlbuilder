# 图标体系方案（草案）

目标：去掉 `@hugeicons`，全部图标自绘。风格与 Lanmo 手绘主题一致，亮暗主题自动适配。语义按所在位置表达，有意义的地方带悬停动作和 A→B 过渡。

逐处用法和语义见 [icon-inventory.md](icon-inventory.md)。

## 1. 从 190 个语义槽位到约 105 张图

清单按"所在位置的含义"归并出 190 个槽位。槽位决定组件名和调用点；图是画出来的形状。两者不必一一对应：

- 同一动作、同一形状的槽位共用一张图。例如 `refresh`、`regenerate`、`retry` 共用一张；`rollback`、`restore`、`reset-conversation` 共用一张。
- 只是方向不同的共用一张图，用旋转表达。例如 chevron 的上下左右、disclosure、prev 和 next。
- 含义不同但当前共用一个图标的，要拆开：
  - `ai-generate`、`ai-patch` 和 `ai-index-advisor`
  - `field-template` 和 `table-blueprint`
  - `unique-index`、`normal-index` 和 `primary-key`
  - `delete` 和 `delete-permanently`
- 16 个数据库方言统一用一张"数据库"图（已确认）。不画厂商标志：有商标问题，16px 下也认不出，方言名旁边已经有文字。

| 层级 | 槽位 | 图（估） | 典型尺寸 |
|---|---|---|---|
| control 控件符号 | 25 | ~16 | 12–16px |
| status 状态 | 19 | ~10 | 14–20px |
| action 动作 | 54 | ~35 | 14–16px |
| feature 功能/对象 | 92 | ~45 | 16–32px |

## 2. 视觉语言

只从 Lanmo 现有的 token 和笔触推导。不引入 kubai-icons 的渐变、投影和内发光，它们和纸面平涂的风格冲突。

**墨线**
- 一律用 `currentColor`，继承按钮和菜单的文字色、`text-destructive`、disabled 态。
- 圆头圆角。线宽对应 `--stroke-main` 和 `--stroke-quiet`。
- 手绘感写进路径里，用静态手写坐标，和 `tile-scenes.ts` 的写法一样：
  - 线端略微出头；
  - 长边带一点弧度；
  - 闭合形状的接口不完全对齐。
- 不在运行时随机生成，保证每次渲染一致。

**水彩块（wash）**
- 在墨线下面垫一块平涂色，相对墨线错开约 1 个单位，像套色没对准的水彩。
- 颜色只取 Lanmo wash token：`--blue-wash`、`--success-wash`、`--warning-wash`、`--danger-wash`、`--vermilion-wash`。
- 这些 token 已有 `.dark` 值，所以暗色不需要另画。

**颜色按语义分配，不按图标分配**
- 功能和对象图标用蓝。
- 成功用绿，警告用黄，破坏性操作和错误用红。
- AI 类统一用一个颜色，便于识别。
- 一张图最多一个 wash 色。

**按尺寸取舍**

| 尺寸 | 墨线 | wash | 细节 |
|---|---|---|---|
| ≤14px | 单线 | 无 | 最多 1 条内部线 |
| 16px | 单线 | 只 status、feature 有 | 最多 2 条内部线 |
| ≥20px | 单线，可加一条淡的回笔（呼应 `.lm-s2`） | 有 | 可多一层内容 |

- 统一用 24 网格的 viewBox。线宽按尺寸换算成网格单位（屏幕像素 × 24 ÷ 尺寸），不用 `non-scaling-stroke`，因为它会打乱描线动画的 `pathLength`。
- AI 类颜色需要新增一对 token：`--ai` / `--ai-wash`，亮暗各一套。

## 3. 动效

**悬停动作**
- 只给"动作本身预示下一步"的图标加。例如：
  - 删除：桶盖掀起
  - 下载：箭头下落
  - 复制：前一张纸错开
  - 刷新：转半圈
  - 发送：纸飞机前冲
  - 文件夹：打开
  - 设置：齿轮转动
  - AI：星芒闪一下
- 控件符号和纯对象图标默认不动。
- 悬停由可交互的父元素触发（`button`、`a`、`[role=menuitem]` 的 `:hover` 和 `:focus-visible`），不由图标自己触发，因为点击区域是按钮。
- 用 CSS transform 和 opacity 实现，不依赖 JS。
- 时长 200–280ms，曲线沿用主题的 `cubic-bezier(0.22, 1, 0.36, 1)`。

**A→B 过渡**

清单里有 20 处状态切换图标，按做法分三类：

| 做法 | 适用 | 例子 |
|---|---|---|
| 变换 | 同一形状换方向 | disclosure 展开（右→下）、侧栏收起和展开、播放回放的上一帧和下一帧 |
| 路径形变 | 两张图共用同样的路径结构，逐点插值 | Play↔Pause、Folder↔FolderOpen、Sun↔Moon |
| 描线出现 | 后一个状态是"完成" | Copy→Check、Loader→Check、步骤序号→Check、校验 AlertCircle→CheckCircle（外圈保留，只换内部符号） |

- 动作→加载（LogIn、Share2、Send→Loader）：原图标淡出，转圈的弧线从图标里画出来，不硬切。
- 路径形变需要一个很小的 JS 插值器。Safari 不支持 CSS `d` 属性过渡。描线出现沿用 tile 的 `stroke-dashoffset` 做法。
- 所有动效都尊重 `prefers-reduced-motion`。

## 4. 工程落点

**几何和样式**
- 放在 `packages/design`：路径数据、CSS、形变插值器。
- 不依赖框架，docs 站也能用。现有 tile 的 `glyph` 后续可以改用这里的图。

**React 包装**
- 留在 `apps/web/src/components/icons.tsx`。
- 控件和状态图标沿用现有导出名，只换图形，不动调用点。功能图标在 P3 按槽位拆分和改名，同时修掉语义错配。
- 线宽、wash 和回笔取决于渲染尺寸。调用点用 Tailwind 的 `size-*` / `h-*` 设尺寸，包装组件从 `className` 读出尺寸；也可以显式传 `size`；都没有时按 16px 处理。

**收尾**
- 全部替换后删除 `@hugeicons/react` 和 `@hugeicons/core-free-icons`。
- 同时删除 11 个未使用的导出和无人调用的 `InputOTPSeparator`。

**检查页**
- 一个开发用的图标总览：每张图在 12/14/16/20/24/32px、亮暗两种主题下各渲染一次；悬停和 A→B 可以点按切换。
- 用它做视觉评审，不为它补测试。

**kubai-icons 的使用边界**
- 只借鉴方法：分层、keyline、两组关键帧插值、"动作必须是物体本身的动作"。
- 它的许可证禁止把 `PROMPT.md` 的文字放进项目，本方案和后续规范自行撰写。

## 5. 分期

| 阶段 | 内容 | 产出 |
|---|---|---|
| P0 样张 | 每层挑 2–3 张，加 2 个 A→B（Copy→Check、Folder↔FolderOpen），在检查页里亮暗、全尺寸对比 | 定下线宽、wash 错位量、手绘幅度 |
| P1 control + status | 约 26 张，用量最大，先统一基础笔触 | 一个 PR |
| P2 action | 约 35 张，加悬停动作 | 一个 PR |
| P3 feature | 约 45 张，拆分错配的槽位 | 一个 PR |
| P4 过渡与收尾 | 全部 A→B 过渡，删除 hugeicons，更新文档 | 一个 PR |

P1–P4 是连锁 PR，用 `gh stack`。

## 6. 待定

- 清单里发现、但不属于图标的问题，另开 issue：
  - `IndexPanel:383,424` 显示拖拽手柄，但这些行不能拖。
  - 导入预览的上移和下移用了左右箭头。
