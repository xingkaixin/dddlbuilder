## 开发
- 使用`pnpm add`,添加依赖，不要直接修改`packages.json`
- Cloudflare Worker 中的异步副作用（如 Telegram 通知、审计上报、异步写入）如果需要在请求返回后继续执行，必须挂到 `waitUntil`；不要只写 `void someAsyncTask()`，否则本地正常、线上可能因 Worker 提前结束而丢失。

## 测试
- lint 使用`pnpm lint`
- test 使用`pnpm test`
- test coverage 使用`pnpm test:coverage`

## E2E测试
- 如果设计到影响界面UI交互逻辑调整等，需要执行`pnpm run test:e2e`验证
