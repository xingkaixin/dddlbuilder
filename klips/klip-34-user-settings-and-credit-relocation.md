---
Author: "Kevin"
Updated: 2026-04-12
Status: Draft
Origin: "KLIP-32"
---

# KLIP-34 用户设置页面与 Credit 展示迁移

## 背景

KLIP-32 实现了最小用户中心（Header 余额 badge + 账号下拉菜单）。当前实现存在以下问题：

1. Header 右侧独立 credit badge（`Header.tsx:403-412`）占用了顶部栏空间，信息密度过高
2. 用户下拉菜单（`Header.tsx:422-444`）堆叠了 email、credit 余额、user ID 等只读信息，菜单臃肿且无操作入口
3. 用户缺少自助管理能力：无法修改密码、用户名，无法查看 credit 消费明细

后端 credit 系统（KLIP-30）已提供完整的 ledger 查询接口 `GET /api/credits/ledger`，但前端未消费该数据。

## 目标

- 将 credit 信息从 Header 迁移到独立的用户设置页面
- 简化 Header 用户下拉菜单，只保留"设置"和"退出登录"
- 新建用户设置 Dialog，提供密码修改、用户名修改、credit 消费记录、充值入口

## 非目标

- 不接支付渠道（充值入口仅占位）
- 不做用户头像上传
- 不做账户注销/删除
- 不做订阅/套餐管理
- 不做 credit 购买流程

## 设计概览

### Header 改造

当前 Header 右侧（`Header.tsx:403-460`）结构：

```
[Import] [Share] [Locale] [Theme] [Docs] [Credit Badge] [User Dropdown]
                                                  ^^^^^^^^^^^^   ^^^^^^^^^^^^^^
                                                  删除            简化
```

改造后：

```
[Import] [Share] [Locale] [Theme] [Docs] [User Dropdown]
                                          ^^^^^^^^^^^^^^
                                          只剩两个选项
```

**已登录用户下拉菜单**（当前 `Header.tsx:422-444`）：

- 删除：email 显示行、credit 显示行、userId 显示行
- 新增：`Settings` 菜单项（打开设置 Dialog）
- 保留：`Sign Out`

改造后菜单结构：

```
[User Name / Avatar Icon]
─────────────────────────
⚙ 设置
🚪 退出登录
```

### 用户设置 Dialog

新增 `UserSettingsDialog` 组件，遵循项目现有的 Dialog 导航模式（如 `AIGenerateDialog`、`WorkspaceMigrationDialog`）。

Dialog 内使用 Tabs 组织内容：

#### Tab 1: 账户设置

| 功能 | 说明 |
|---|---|
| 用户名修改 | 输入新用户名，调用 Better Auth `updateUser` API |
| 密码修改 | 输入当前密码 + 新密码，调用 Better Auth `changePassword` API |

用户名修改成功后需同步更新 `AuthSessionProvider` 中的 `name` 字段和 Header 显示。

#### Tab 2: 点数中心

**余额展示区域**：

- 顶部显示当前 credit 余额（复用 `authSession.creditBalance`）
- 余额旁放置"充值"按钮，点击后弹出 AlertDialog 提示"充值渠道暂未开放，敬请期待"

**消费记录列表**：

- 调用 `GET /api/credits/ledger?limit=50` 获取数据
- 列表字段：

| 列 | 说明 | 数据来源 |
|---|---|---|
| 时间 | `created_at` | `credit_ledger` |
| 类型 | `kind` 映射为中文：授予/消费/退款 | `credit_ledger.kind` |
| 来源 | `source` 映射：注册赠送/AI 建表/AI 审核/AI 解释/手动调整 | `credit_ledger.source` |
| 数量 | `+amount`（grant/refund）或 `-amount`（consume） | `credit_ledger.amount` |
| 余额 | 交易后余额 | `credit_ledger.balance_after` |

### 后端新增

#### 用户名修改 API

Better Auth 的 `client.updateUser` 可直接修改 `name` 字段。无需新增服务端路由，前端直接调用 Better Auth client 方法。

#### 密码修改 API

Better Auth 的 `client.changePassword` 可直接修改密码。同理无需新增路由。

#### 用户名修改后 session 同步

修改用户名后调用 `authSession.refreshSession()` 刷新状态。`refreshSession` 会重新调用 `GET /api/me`，该接口返回最新的 `name` 字段（`server-api/routes/auth.ts` 中 `/me` 端点直接读取 `user.name`）。

## 组件设计

```
UserSettingsDialog          -- 主 Dialog 容器
  ├── Tabs
  │   ├── AccountSettingsTab
  │   │   ├── UsernameForm     -- 用户名修改表单
  │   │   └── PasswordForm     -- 密码修改表单
  │   └── CreditCenterTab
  │       ├── CreditSummary    -- 余额展示 + 充值按钮
  │       ├── RechargeNoticeDialog  -- 充值未开放提示 AlertDialog
  │       └── CreditLedgerTable    -- 消费记录列表
```

## i18n

需在 `src/i18n/locales/zh-CN/common.ts` 和 `en-US/common.ts` 中新增以下 key：

```typescript
// 新增 key（建议挂在 settings 命名空间下）
settings: {
  title: '设置' / 'Settings',
  accountTab: '账户设置' / 'Account',
  creditTab: '点数中心' / 'Credits',

  username: '用户名' / 'Username',
  usernamePlaceholder: '请输入新用户名' / 'Enter new username',
  usernameSuccess: '用户名修改成功' / 'Username updated',
  usernameFailed: '用户名修改失败' / 'Failed to update username',

  currentPassword: '当前密码' / 'Current password',
  newPassword: '新密码' / 'New password',
  confirmPassword: '确认密码' / 'Confirm password',
  passwordSuccess: '密码修改成功' / 'Password updated',
  passwordFailed: '密码修改失败' / 'Failed to update password',
  passwordMismatch: '两次输入的密码不一致' / 'Passwords do not match',

  recharge: '充值' / 'Recharge',
  rechargeNotAvailable: '充值渠道暂未开放，敬请期待' / 'Recharge is not available yet. Please stay tuned.',

  creditHistory: '消费记录' / 'Usage History',
  time: '时间' / 'Time',
  type: '类型' / 'Type',
  source: '来源' / 'Source',
  amount: '数量' / 'Amount',
  balance: '余额' / 'Balance',
  noHistory: '暂无消费记录' / 'No usage history',

  // kind 映射
  grant: '授予' / 'Grant',
  consume: '消费' / 'Consume',
  refund: '退款' / 'Refund',

  // source 映射
  signupBonus: '注册赠送' / 'Signup Bonus',
  aiGenerate: 'AI 建表' / 'AI Generate',
  aiReview: 'AI 审核' / 'AI Review',
  aiExplain: 'AI 解释' / 'AI Explain',
  manualAdjustment: '手动调整' / 'Manual Adjustment',

  loading: '加载中...' / 'Loading...',
  loadFailed: '加载失败' / 'Failed to load',
}

// Header 下拉菜单新增
header: {
  auth: {
    settings: '设置' / 'Settings',   // 新增
    // credits, creditsShort 等移除或保留（credit badge 已移除，下拉也移除）
  }
}
```

## 关键参考位置

| 文件 | 作用 |
|---|---|
| `src/components/App/Header.tsx:403-460` | 当前 credit badge + 用户下拉菜单，需要改造 |
| `src/auth/AuthSessionProvider.tsx` | 用户 session 状态管理，需确认 `refreshSession` 能更新 name |
| `src/auth/betterAuthClient.ts` | Better Auth client 初始化，`updateUser`/`changePassword` 从此调用 |
| `src/i18n/locales/zh-CN/common.ts` | 中文翻译 |
| `src/i18n/locales/en-US/common.ts` | 英文翻译 |
| `server-api/routes/credits.ts` | Credit balance + ledger API（已有，无需修改） |
| `server-api/lib/credits.ts` | Credit 业务逻辑（已有，无需修改） |
| `src/components/ui/` | shadcn/ui 基础组件（Dialog, Tabs, Table, AlertDialog 等） |

## 实施阶段

### Phase 1: Header 简化

- 删除 Header credit badge（`Header.tsx:403-412`）
- 简化用户下拉菜单：移除 email/credit/userId 行，新增"设置"菜单项
- 更新 i18n：移除不再需要的 `creditsShort`/`credits` key（下拉中的），新增 `settings` key
- 保留 `AuthSessionProvider` 中的 credit 加载逻辑（设置页仍需要）

### Phase 2: 用户设置 Dialog - 账户设置 Tab

- 新建 `UserSettingsDialog` 组件（Tabs 容器）
- 实现 `UsernameForm`：调用 `client.updateUser({ name })`，成功后 `refreshSession()`
- 实现 `PasswordForm`：调用 `client.changePassword({ currentPassword, newPassword })`
- 在 Header 下拉菜单中接入 Dialog 打开逻辑

### Phase 3: 用户设置 Dialog - 点数中心 Tab

- 实现 `CreditSummary`：展示余额 + 充值按钮
- 实现 `RechargeNoticeDialog`：AlertDialog 展示未开放提示
- 实现 `CreditLedgerTable`：调用 `GET /api/credits/ledger`，渲染消费记录列表

## 验收标准

- [ ] Header 不再显示 credit badge
- [ ] 已登录用户下拉菜单只显示"设置"和"退出登录"，不显示 email/credit/userId
- [ ] 点击"设置"打开用户设置 Dialog
- [ ] 用户名可修改，修改成功后 Header 显示新用户名
- [ ] 密码可修改，需验证当前密码
- [ ] 设置页点数中心显示当前余额
- [ ] 点击"充值"弹出"充值渠道暂未开放"提示
- [ ] 消费记录列表正确展示 ledger 数据，kind/source 映射正确
- [ ] 中英文翻译完整
