---
Author: "Codex"
Updated: 2026-04-11
Status: Draft
Origin: "XING-104"
---

# KLIP-32 前端用户中心与 AI 功能门禁额度展示

## 背景

当前前端主工作区默认围绕匿名本地编辑展开：

- 主入口在 `src/components/App/index.tsx`
- AI 入口分布在 Header、Output、Dialog 等位置
- 用户当前是否能用 AI，没有显式的登录态或额度态表达

本期如果只补后端，不补前端状态表达，用户只会看到“请求失败”，无法理解是未登录、额度不足，还是服务异常。

## 目标

- 在前端表达登录态、额度态、AI 可用性
- 为匿名用户提供明确的注册解锁路径
- 为已登录用户提供最小用户中心入口
- 为迁移流程提供清晰的状态提示和重试入口

## 非目标

- 不做完整账户设置页
- 不做复杂营销页或支付页

## 设计概览

### Header 入口

在 Header 或等价位置增加用户入口：

- `未登录`：显示“登录 / 注册”
- `已登录`：显示邮箱简写或用户按钮
- 同时展示当前余额摘要

### AI 按钮状态机

所有 AI 相关按钮统一遵循以下状态：

| 状态 | 按钮行为 | 文案 |
|---|---|---|
| 匿名 | 可见，可点击，点击后弹登录引导 | 注册后解锁 AI |
| 已登录且余额充足 | 正常调用 | 原功能文案 |
| 已登录但余额不足 | 可见，点击后提示余额不足 | 额度不足 |
| 服务异常 | 可见，调用失败后展示服务异常 | 服务暂时不可用 |

涉及位置至少包括：

- `AIGenerateDialog`
- DDL Review 按钮
- Explain 入口

### 用户中心最小内容

V1 用户中心只提供：

- 当前邮箱
- 当前余额
- 最近一次赠送额度提示
- 登出按钮

### 迁移提示

用户首次登录且检测到本地匿名工作区时：

- 顶部或模态展示“检测到本地工作区，是否迁移到当前账号”
- 展示迁移中、迁移成功、迁移冲突、迁移失败四种状态
- 失败后提供重试入口

## 组件建议

- `UserMenu`
- `CreditBadge`
- `AiGateBanner`
- `WorkspaceMigrationDialog`

这些组件应作为独立用户域 UI，不要继续塞进现有 DDL 业务组件内部。

## 前端数据来源

- 登录态：新建 `useAuthSession()`
- 余额：`GET /api/credits/balance`
- 用户信息：`GET /api/me`
- 迁移状态：`POST /api/workspace/migrations` 返回结果

## 失败路径

- 登录态恢复失败：退回匿名视图
- 余额接口失败：隐藏具体数值，显示“余额加载失败”
- AI 调用返回 `AUTH_REQUIRED`：打开登录引导
- AI 调用返回 `CREDIT_EXHAUSTED`：展示额度不足提示
- 迁移失败：保留本地数据，不清空，允许重试

## 测试矩阵

- 未登录时 Header 显示登录入口
- 已登录时 Header 显示用户入口和余额
- 匿名用户点击 AI 按钮得到注册引导
- 余额不足时按钮提示明确
- 服务异常与余额不足能区分
- 首次登录且存在本地工作区时出现迁移提示
- 迁移失败后可重试

## 验收标准

- [ ] 用户能明确知道自己是否登录
- [ ] 用户能看到当前余额或明确的余额加载异常
- [ ] 匿名用户看到的是“可注册解锁”，不是模糊报错
- [ ] 余额不足与服务异常提示可区分
- [ ] 迁移状态对用户可见且可重试

## 关键参考位置

- `src/components/App/index.tsx`
- `src/components/App/AIGenerateDialog.tsx`
- `src/components/App/DDLOutput.tsx`
- `src/hooks/useAIGenerateTable.ts`
- `src/services/aiGenerateTableService.ts`
- `src/services/reviewService.ts`
