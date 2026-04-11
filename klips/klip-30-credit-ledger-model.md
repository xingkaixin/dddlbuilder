---
Author: "Codex"
Updated: 2026-04-11
Status: Draft
Origin: "XING-104"
---

# KLIP-30 用户 AI 点数账户、赠送额度与账本

## 背景

`XING-118` 需要从“谁”扣减 AI 调用额度，但当前系统没有：

- 用户级余额
- 可审计账本
- 失败补偿机制

如果直接在 `users` 表减一个字段，后续会失去审计能力，也无法安全处理幂等、失败回滚和未来付费充值。

## 目标

- 建立 `credit account + ledger` 模型
- 注册用户自动发放赠送额度
- 提供余额查询与最近用量接口
- 支持 `grant / consume / refund`
- 支持未来新增 paid grant，而不推翻模型

## 非目标

- 本期不接支付
- 本期不做优惠券、套餐、订阅周期

## 设计方案

### 数据模型

```text
credit_accounts
  user_id           primary key
  balance
  version
  updated_at

credit_ledger
  id
  user_id
  kind              -- grant / consume / refund
  source            -- signup_bonus / ai_generate / ai_review / ai_explain / manual_adjustment
  amount
  balance_after
  idempotency_key
  related_usage_id
  metadata_json
  created_at
```

### 余额规则

- `credit_ledger` 是真实来源
- `credit_accounts.balance` 是冗余缓存，用于快速读取
- 每次记账必须同时更新 `balance` 与 `balance_after`

### 注册赠送额度

- 首次创建 app user 时自动创建 `credit_accounts`
- 发放一笔 `grant(source=signup_bonus)`
- 额度值来自配置项 `SIGNUP_BONUS_CREDITS`

### 扣减口径

V1 采用“两阶段记账”：

1. 请求开始前按估算 token 做预扣 `consume`
2. 请求结束后按实际 token 结算
   - 实际少于预扣：补 `refund`
   - 实际等于预扣：无额外动作
   - 实际高于预扣：再补一笔 `consume`

### 并发一致性

- 使用 `credit_accounts.version` 做乐观并发控制
- 任一记账操作都必须带 `idempotency_key`
- 同一个 `idempotency_key` 重试时直接返回已有 ledger 结果

## 接口设计

### 读接口

- `GET /api/credits/balance`
- `GET /api/credits/ledger?limit=20`

### 写接口

- 不暴露通用 public 写接口
- 所有 `grant / consume / refund` 仅通过服务端内部 service 调用

## 失败模式

- 预扣失败：AI 请求直接拒绝
- 上游 AI 失败：生成 `refund`
- 记账成功但 usage event 写失败：记录错误并允许后台修复
- 同一请求重试：靠 `idempotency_key` 去重

## 测试矩阵

- 新用户注册后自动有余额
- grant 正常增加余额
- consume 正常减少余额
- refund 正常返还余额
- 同一 idempotency key 不重复记账
- 并发 consume 不会把余额扣成负值
- AI 上游失败时能自动退款

## 验收标准

- [ ] 任一额度变化都有 ledger 记录
- [ ] 注册赠送额度可配置
- [ ] 余额查询与最近 ledger 查询可用
- [ ] 幂等与并发约束明确
- [ ] 未来新增 paid grant 不需要重做模型

## 关键参考位置

- `server-api/openaiControl.ts`
- `server-api/routes/generateTable.ts`
- `server-api/routes/review.ts`
- `server-api/routes/explain.ts`

## 待确认

- 余额单位是“token points”还是抽象 credits
- `estimated_tokens -> credits` 的换算是否按 1:1，还是按不同路由设置倍率
