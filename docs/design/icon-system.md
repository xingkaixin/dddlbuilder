# 图标体系

Web 的图标全部自绘，不依赖外部图标库。风格与 Lanmo 手绘主题一致，亮暗主题自动适配。语义按所在位置表达，有意义的地方带悬停动作和 A→B 过渡。

迁移前的逐处用法和语义见 [icon-inventory.md](icon-inventory.md)。

## 1. 槽位和图

清单按"所在位置的含义"归并出 190 个语义槽位，最终画了 109 张图：control 21、status 6、action 40、feature 42。槽位决定组件名和调用点；图是画出来的形状。

- 同一动作、同一形状的槽位共用一张图。例如 `refresh`、`regenerate`、`retry` 共用一张。
- 只是方向不同的共用一张图，用 `rotate` 表达。例如 chevron 的上下左右、上一帧和下一帧。
- 含义不同但原来共用一个图标的已拆开：
  - AI 建表、AI 修改（`AiEdit`）、AI 注释（`AiComment`）、AI 索引建议（`AiIndex`）
  - 字段模板（`FieldTemplateIcon`）和整表蓝本（`TableBlueprint`）
  - 主键（`Key`）、唯一索引（`UniqueIndex`）和普通索引（`Index`）
  - 删除（`Trash2`）和永久删除（`DeleteForever`）
  - 工作区（`Workspace`）、复制表（`Replica`）和分片（`Shard`）
- 16 个数据库方言统一用一张"数据库"图。不画厂商标志：有商标问题，16px 下也认不出，方言名旁边已经有文字。

## 2. 视觉语言

只从 Lanmo 现有的 token 和笔触推导。不用渐变、投影和内发光，它们和纸面平涂的风格冲突。

**墨线**
- 一律用 `currentColor`，继承按钮和菜单的文字色、`text-destructive`、disabled 态。
- 圆头圆角。
- 手绘感写进路径里：线端略微出头，长边带一点弧度，闭合形状的接口不完全对齐。`icon-draw.ts` 的基本形（`line`、`poly`、`rect`、`ring` 等）用固定的弯曲序列生成，每次渲染一致。

**水彩块（wash）**
- 在墨线下面垫一块平涂色，用 CSS `translate` 错开 0.9 个单位，像套色没对准的水彩。
- 颜色只取 wash token：`--blue-wash`、`--success-wash`、`--warning-wash`、`--danger-wash`、`--ai-wash`。这些 token 都有 `.dark` 值，暗色不需要另画。

**颜色按语义分配**
- 功能和对象图标用蓝。成功用绿，警告用黄，破坏性操作和错误用红，AI 类用紫（`--ai-wash`）。
- 一张图最多一个 wash 色，由图的 `tone` 决定。

**按尺寸取舍**

线宽按渲染尺寸换算成网格单位（屏幕像素 × 24 ÷ 尺寸），统一用 24 网格的 viewBox。

| 尺寸 | 线宽 | wash | 回笔 |
|---|---|---|---|
| ≤12px | 1.25px | 无 | 无 |
| 14px | 1.35px | 无 | 无 |
| 16px | 1.5px | status、feature 有 | 无 |
| 20px | 1.65px | 加上 action | 标了 `echo` 的部件有 |
| ≥24px | 1.8–2px | 同上 | 同上 |

控件符号（control）始终没有 wash 和回笔。回笔是一条半宽、45% 透明度、略微错位的重描线。

## 3. 动效

**悬停动作**
- 只给"动作本身预示下一步"的图标加。例如删除时桶盖掀起，下载时箭头下落，复制时前一张纸错开，刷新时转半圈，发送时纸飞机前冲，设置时齿轮转动，AI 类星芒闪一下。
- 图的部件可以标一个分组 `g`，渲染为 `lm-ic-g-<分组>` 类。`icons.css` 在可交互父元素（`button`、`a`、`[role=button|menuitem|option|tab]`）`:hover` 或 `:focus-visible` 时移动该分组。悬停由父元素触发，因为点击区域是按钮。
- 只用 CSS transform，时长 260ms，曲线 `cubic-bezier(0.22, 1, 0.36, 1)`。

**A→B 过渡**

| 做法 | 适用 | 实现 |
|---|---|---|
| 旋转 | 展开和收起 | 只渲染一个 chevron，加 `transition-transform` 和 `rotate-90` / `rotate-180` |
| 部件形变 | 文件夹开合 | `Folder` 的前片属于 `open` 分组；调用方传 `data-state="open"`，前片用 skew 和 scale 翻开 |
| 换图 | 复制→完成、动作→加载、播放↔暂停、校验结果、步骤序号→完成、同步状态 | 用 `IconSwap` 包住三元表达式；`state` 变化时新图标缩放淡入，首次渲染不动 |

- 不做路径逐点插值：Safari 不支持 CSS `d` 过渡，换成 JS 插值器的代价和收益不成比例。
- 所有动效都尊重 `prefers-reduced-motion`。

## 4. 工程落点

**几何和样式**：`packages/design`，不依赖框架。
- `src/icon-draw.ts`：手绘基本形。
- `src/icons.ts`：每张图的部件（`ink`、`wash`、`dot`）、`tier`、`tone`、`rotate`，以及按尺寸生成 SVG 元素的 `iconElements`。
- `src/icons.css`：墨线、wash、回笔、色调、悬停分组和状态过渡。

**React 包装**：`apps/web/src/components/icons.tsx`。
- 每个导出是一个 `createDrawnIcon(名字)`。原有导出名保留（如 `Trash2`、`Loader2`），新槽位用语义名（如 `UniqueIndex`、`AiComment`）。
- 尺寸从 `className` 的 `size-*` / `h-*` / `w-*` 读出，也可以显式传 `size`；都没有时按 16px 处理。
- `IconSwap` 负责换图过渡。

**加一张图**：在 `icons.ts` 的 `ICONS` 里加定义，在 `icons.tsx` 里加导出。先在 12–32px、亮暗两种主题下看一遍，再接到调用点。

**kubai-icons 的使用边界**
- 只借鉴方法：分层、"动作必须是物体本身的动作"。
- 它的许可证禁止把 `PROMPT.md` 的文字放进项目，本文和代码自行撰写。
