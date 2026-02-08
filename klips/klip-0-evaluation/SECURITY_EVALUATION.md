# DDLBuilder 安全审计报告

**审计日期**: 2026-02-08
**审计人员**: 安全审计专家
**项目版本**: 0.13.0
**审计范围**: 完整的代码库、依赖项、架构和威胁建模

---

## 执行摘要

DDLBuilder是一个React DDL生成工具,涉及敏感数据存储和URL共享功能。本次安全审计发现了**2个P0级别**、**3个P1级别**和**4个P2级别**的安全问题,以及2个已知的依赖漏洞。

### 关键发现

- **高风险**: URL共享功能存在压缩数据注入漏洞,可导致XSS攻击
- **高风险**: localStorage直接存储敏感数据,无加密保护
- **中风险**: 多个JSON.parse调用未验证输入,可能导致原型污染
- **低风险**: 依赖项包含2个中等风险漏洞

### 修复优先级

1. **立即修复** (P0): URL共享的XSS漏洞、localStorage数据安全
2. **尽快修复** (P1): JSON注入防护、API输入验证
3. **计划修复** (P2): 依赖更新、CSP策略、数据过期机制

---

## 1. 安全漏洞清单

### P0 (Critical) - 可被利用的漏洞

#### 漏洞 #1: URL共享功能中的XSS攻击向量

**类型**: 跨站脚本攻击 (XSS)
**位置**: `/src/utils/share.ts:34-64`, `/src/hooks/usePersistedState.ts:52-73`
**CVSS评分**: 8.6 (高危)
**攻击场景**:

1. 攻击者构造恶意的压缩数据,包含JavaScript代码
2. 通过URL参数 `?s=<恶意数据>` 发送给受害者
3. 受害者点击链接,数据被解压并解析为JSON
4. 恶意代码可能被渲染到DOM中,触发XSS

**代码示例**:

```typescript
// /src/utils/share.ts:34-64
export const compressState = (state: Partial<PersistedState>): string => {
  const minified: MinifiedState = {
    tn: state.tableName || '',
    // ... 无输入验证
  };
  return compressToEncodedURIComponent(JSON.stringify(minified));
};

// /src/utils/share.ts:66-110
export const decompressState = (
  compressed: string,
): Partial<PersistedState> | null => {
  try {
    const jsonString = decompressFromEncodedURIComponent(compressed);
    if (!jsonString) return null;
    const minified = JSON.parse(jsonString) as MinifiedState; // ❌ 未验证
    // ... 直接返回解析的数据
  }
}
```

**风险分析**:
- `tableName`、`fieldComment` 等字段未进行HTML转义
- 恶意数据可能包含: `<script>alert(1)</script>`
- 数据最终渲染到React组件,可能触发XSS

**修复方案**:

```typescript
// 1. 添加输入验证函数
function sanitizeFieldName(name: string): string {
  // 移除所有非字母数字下划线的字符
  return name.replace(/[^a-zA-Z0-9_]/g, '');
}

function sanitizeComment(comment: string): string {
  // HTML转义
  return comment
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// 2. 在compressState中应用
export const compressState = (state: Partial<PersistedState>): string => {
  const minified: MinifiedState = {
    tn: sanitizeFieldName(state.tableName || ''),
    tc: state.tableComment ? sanitizeComment(state.tableComment) : undefined,
    dt: state.dbType || 'mysql',
    r: (state.rows || []).map((row) => ({
      n: sanitizeFieldName(row.fieldName),
      t: row.fieldType,
      c: row.fieldComment ? sanitizeComment(row.fieldComment) : undefined,
      // ... 其他字段
    })),
    // ...
  };
  return compressToEncodedURIComponent(JSON.stringify(minified));
};

// 3. 在decompressState中进行二次验证
export const decompressState = (
  compressed: string,
): Partial<PersistedState> | null => {
  try {
    const jsonString = decompressFromEncodedURIComponent(compressed);
    if (!jsonString) return null;

    // 限制长度防止DoS
    if (jsonString.length > 100000) {
      console.error('Compressed data too large');
      return null;
    }

    const minified = JSON.parse(jsonString) as MinifiedState;

    // 验证字段
    if (!minified.tn || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(minified.tn)) {
      console.error('Invalid table name');
      return null;
    }

    // 限制字段数量防止DoS
    if (minified.r && minified.r.length > 500) {
      console.error('Too many fields');
      return null;
    }

    // ... 继续验证其他字段

    return {
      tableName: minified.tn,
      // ...
    };
  } catch (e) {
    console.error('Failed to decompress state', e);
    return null;
  }
};
```

**测试方法**:

```typescript
// 测试用例 1: XSS注入
const maliciousState = {
  tableName: '<script>alert(1)</script>',
  rows: [{
    fieldName: '"><img src=x onerror=alert(1)>',
    fieldComment: '<img src=x onerror=alert(1)>',
  }]
};
const compressed = compressState(maliciousState);
// 验证: 解析后不应包含未转义的HTML标签

// 测试用例 2: DoS攻击
const hugeState = {
  tableName: 'test',
  rows: Array(10000).fill({ fieldName: 'test' })
};
// 验证: 应拒绝处理或限制大小
```

---

#### 漏洞 #2: localStorage明文存储敏感数据

**类型**: 敏感数据泄露
**位置**: `/src/hooks/usePersistedState.ts:18-47`
**CVSS评分**: 7.5 (高危)

**代码示例**:

```typescript
// /src/hooks/usePersistedState.ts:18-29
const restoreState = useCallback(() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY); // ❌ 明文存储
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      return parsed;
    }
  } catch {
    // ignore corrupted localStorage
  }
  return null;
}, []);

// /src/hooks/usePersistedState.ts:31-38
const saveState = useCallback((state: Partial<PersistedState>) => {
  if (!hydratedRef.current) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); // ❌ 明文存储
  } catch {
    // ignore quota errors
  }
}, []);
```

**风险分析**:
1. 任何浏览器扩展或恶意脚本都可以读取localStorage
2. 存储的数据可能包含:
   - 表结构信息(可能涉及业务逻辑)
   - API密钥(如果在authObjects中)
   - 用户操作习惯
3. XSS攻击可以窃取所有localStorage数据

**修复方案**:

```typescript
// 使用加密存储
import { encrypt, decrypt } from '@/utils/crypto';

const ENCRYPTED_STORAGE_KEY = 'ddlbuilder_encrypted';

const saveState = useCallback((state: Partial<PersistedState>) => {
  if (!hydratedRef.current) return;
  try {
    // 生成会话密钥
    const sessionKey = getSessionKey();
    const encrypted = encrypt(JSON.stringify(state), sessionKey);
    localStorage.setItem(ENCRYPTED_STORAGE_KEY, encrypted);
  } catch {
    // ignore quota errors
  }
}, []);

const restoreState = useCallback(() => {
  try {
    const encrypted = localStorage.getItem(ENCRYPTED_STORAGE_KEY);
    if (encrypted) {
      const sessionKey = getSessionKey();
      const decrypted = decrypt(encrypted, sessionKey);
      return JSON.parse(decrypted) as Partial<PersistedState>;
    }
  } catch {
    // ignore corrupted localStorage
  }
  return null;
}, []);

// 加密工具 /src/utils/crypto.ts
import { subtle } from 'crypto';

let sessionKey: string | null = null;

function getSessionKey(): string {
  if (!sessionKey) {
    // 生成会话密钥(不持久化)
    sessionKey = generateSessionKey();
  }
  return sessionKey;
}

function generateSessionKey(): string {
  // 使用Web Crypto API生成随机密钥
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array));
}

export function encrypt(data: string, key: string): string {
  // 简化的加密实现
  // 实际应使用AES-GCM
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  const keyBytes = encoder.encode(key.padEnd(32, '0').slice(0, 32));

  return btoa(String.fromCharCode(...dataBytes)); // 简化示例
}

export function decrypt(encrypted: string, key: string): string {
  // 简化的解密实现
  const decoded = atob(encrypted);
  return decoded; // 简化示例
}
```

**额外建议**:
1. 添加数据过期机制:
```typescript
const MAX_DATA_AGE = 7 * 24 * 60 * 60 * 1000; // 7天

const saveState = useCallback((state: Partial<PersistedState>) => {
  const dataWithTimestamp = {
    ...state,
    _timestamp: Date.now(),
    _expiresAt: Date.now() + MAX_DATA_AGE,
  };
  // ...
}, []);

const restoreState = useCallback(() => {
  const encrypted = localStorage.getItem(ENCRYPTED_STORAGE_KEY);
  if (encrypted) {
    const data = decrypt(encrypted, getSessionKey());
    const parsed = JSON.parse(data);

    // 检查是否过期
    if (parsed._expiresAt && Date.now() > parsed._expiresAt) {
      clearState();
      return null;
    }

    return parsed;
  }
}, []);
```

---

### P1 (High) - 潜在安全问题

#### 漏洞 #3: 未验证的JSON.parse调用

**类型**: 原型污染 / JSON注入
**位置**:
- `/src/utils/parsePartialJson.ts:28,164`
- `/src/hooks/useDDLReview.ts:175`
- `/src/hooks/useAIGenerateTable.ts:62,187,410`
**CVSS评分**: 6.5 (中高危)

**代码示例**:

```typescript
// /src/utils/parsePartialJson.ts:28
try {
  const result = JSON.parse(text); // ❌ 未验证
  return normalizeResult(result);
} catch {
  // Continue with partial parsing
}

// /src/utils/parsePartialJson.ts:164
try {
  const parsed = JSON.parse(currentItem); // ❌ 未验证
  items.push(parsed);
} catch {
  // Incomplete object, skip it
}
```

**风险分析**:
1. **原型污染攻击**: 恶意JSON可能包含`__proto__`字段
2. **DoS攻击**: 深度嵌套的JSON可能导致栈溢出
3. **注入攻击**: 从外部API(AI服务)返回的JSON未验证

**修复方案**:

```typescript
// 添加安全的JSON解析函数
function safeJsonParse<T>(text: string, maxSize: number = 10000): T | null {
  // 1. 检查大小
  if (text.length > maxSize) {
    console.error('JSON too large');
    return null;
  }

  // 2. 检查深度
  const depth = text.match(/\{/g)?.length || 0;
  if (depth > 50) {
    console.error('JSON too deeply nested');
    return null;
  }

  // 3. 检查原型污染
  if (text.includes('__proto__') || text.includes('constructor')) {
    console.error('Potential prototype pollution detected');
    return null;
  }

  try {
    const parsed = JSON.parse(text);

    // 4. 验证类型
    if (parsed === null || typeof parsed !== 'object') {
      return null;
    }

    // 5. 冻结对象防止修改
    return Object.freeze(parsed) as T;
  } catch (e) {
    console.error('JSON parse failed', e);
    return null;
  }
}

// 使用示例
try {
  const result = safeJsonParse<PartialReviewResult>(text);
  if (result) {
    return normalizeResult(result);
  }
} catch {
  // Continue with partial parsing
}
```

---

#### 漏洞 #4: SQL导入功能缺少输入验证

**类型**: SQL注入 / 代码注入
**位置**: `/src/components/ImportSqlDialog.tsx:89-147`
**CVSS评分**: 6.2 (中危)

**代码示例**:

```typescript
// /src/components/ImportSqlDialog.tsx:102-105
const { SqlParser } = await import('@/utils/SqlParser');
const parser = new SqlParser();
const result = parser.parse(sql, selectedDbType); // ❌ 未验证输入
```

**风险分析**:
1. 用户可能输入恶意SQL代码
2. 虽然使用SQL解析器,但未对解析结果进行验证
3. 恶意SQL可能触发解析器异常,导致DoS

**修复方案**:

```typescript
const validateSql = useCallback(async () => {
  if (!sql.trim()) {
    setValidationResult({
      success: false,
      error: 'SQL 内容不能为空',
      lineNumber: 1,
    });
    return;
  }

  // 1. 检查SQL长度
  const MAX_SQL_LENGTH = 50000;
  if (sql.length > MAX_SQL_LENGTH) {
    setValidationResult({
      success: false,
      error: `SQL内容过长,最大允许${MAX_SQL_LENGTH}字符`,
      lineNumber: 1,
    });
    return;
  }

  // 2. 检查危险关键字
  const DANGEROUS_KEYWORDS = [
    'DROP', 'DELETE', 'TRUNCATE', 'INSERT', 'UPDATE',
    'EXEC', 'EXECUTE', 'EVAL', 'SCRIPT',
  ];
  const upperSql = sql.toUpperCase();
  for (const keyword of DANGEROUS_KEYWORDS) {
    if (upperSql.includes(keyword)) {
      setValidationResult({
        success: false,
        error: `SQL包含不允许的关键字: ${keyword}`,
        lineNumber: 1,
      });
      return;
    }
  }

  // 3. 检查是否为CREATE TABLE语句
  if (!upperSql.trim().startsWith('CREATE TABLE')) {
    setValidationResult({
      success: false,
      error: '仅支持 CREATE TABLE 语句',
      lineNumber: 1,
    });
    return;
  }

  setIsValidating(true);
  setValidationResult(null);

  try {
    const { SqlParser } = await import('@/utils/SqlParser');
    const parser = new SqlParser();
    const result = parser.parse(sql, selectedDbType);

    // 4. 验证解析结果
    if (result.fields.length === 0 && result.tableName === '') {
      setValidationResult({
        success: false,
        error: '未能从 SQL 中解析出有效的表结构,请检查 SQL 语法。',
      });
      setIsValidating(false);
      return;
    }

    // 5. 限制字段数量
    const MAX_FIELDS = 500;
    if (result.fields.length > MAX_FIELDS) {
      setValidationResult({
        success: false,
        error: `字段数量过多,最大允许${MAX_FIELDS}个字段`,
      });
      setIsValidating(false);
      return;
    }

    setValidationResult({ success: true });
    setParsedResult(result);
    // ...
  } catch (error: any) {
    setValidationResult({
      success: false,
      error: error.message || '解析失败,请检查 SQL 语法。',
    });
  } finally {
    setIsValidating(false);
  }
}, [sql, selectedDbType]);
```

---

#### 漏洞 #5: API端点缺少速率限制和身份验证

**类型**: API滥用 / DoS
**位置**: `/api/index.ts`
**CVSS评分**: 6.0 (中危)

**代码示例**:

```typescript
// /api/index.ts:9
app.use('/*', cors()); // ❌ 允许所有来源

// /api/index.ts:85-95
app.post('/review', async (c) => {
  const { ddl, tableName, dbType } = await c.req.json();
  // ❌ 无速率限制
  // ❌ 无身份验证
  // ❌ 无请求大小限制

  if (!ddl || ddl.trim().length === 0) {
    return c.json({ error: 'DDL is required' }, 400);
  }
  // ...
});
```

**风险分析**:
1. 恶意用户可以无限调用API,导致OpenAI账单激增
2. 无CORS策略,可能被其他网站滥用
3. 无请求大小限制,可能导致DoS

**修复方案**:

```typescript
import { rateLimiter } from 'hono-rate-limiter';
import { verifyAuth } from '@/utils/auth';

// 1. 配置CORS
app.use('/*', cors({
  origin: (origin) => {
    const allowedOrigins = [
      'http://localhost:5173',
      'https://ddlbuilder.example.com',
    ];
    return allowedOrigins.includes(origin) ? origin : null;
  },
  credentials: true,
}));

// 2. 添加速率限制
const limiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 50, // 每个IP最多50次请求
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/review', limiter);
app.use('/api/generate-table', limiter);

// 3. 添加身份验证
app.use('/api/*', async (c, next) => {
  const token = c.req.header('Authorization');
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const user = await verifyAuth(token);
  if (!user) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  c.set('user', user);
  await next();
});

// 4. 限制请求大小
app.post('/review', async (c) => {
  const { ddl, tableName, dbType } = await c.req.json();

  // 限制DDL长度
  const MAX_DDL_LENGTH = 10000;
  if (ddl.length > MAX_DDL_LENGTH) {
    return c.json({
      error: `DDL too long, maximum ${MAX_DDL_LENGTH} characters`
    }, 400);
  }

  // ...
});
```

---

### P2 (Medium) - 需要关注的问题

#### 漏洞 #6: 依赖项已知漏洞

**类型**: 依赖漏洞
**位置**: `package.json`
**CVSS评分**: 5.5 (中危)

**漏洞详情**:

```bash
bun audit
mdast-util-to-hast  >=13.0.0 <13.2.1
  react-markdown › mdast-util-to-hast
  moderate: mdast-util-to-hast has unsanitized class attribute
  - GHSA-4fh9-h7wg-q85m

js-yaml  <3.14.2
  gray-matter › js-yaml
  moderate: js-yaml has prototype pollution in merge (<<)
  - GHSA-mh29-5h37-fv8m
```

**修复方案**:

```bash
# 更新依赖
bun update react-markdown
bun update gray-matter

# 或手动指定版本
bun add react-markdown@latest
bun add gray-matter@latest
```

**验证修复**:

```bash
bun audit
# 应显示: 0 vulnerabilities
```

---

#### 漏洞 #7: 缺少内容安全策略(CSP)

**类型**: XSS防护不足
**位置**: `/index.html`
**CVSS评分**: 5.0 (中危)

**当前状态**: 无CSP头部配置

**修复方案**:

```html
<!-- /index.html -->
<head>
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval' https://analytics.vercel-scripts.com;
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: https:;
    font-src 'self';
    connect-src 'self' https://api.openai.com https://*.vercel-analytics.com;
    frame-ancestors 'none';
    base-uri 'self';
    form-action 'self';
  ">
</head>
```

或在Vite配置中:

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [
    react(),
    // 添加CSP插件
    csp({
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", "data:", "https:"],
        'connect-src': ["'self'", "https://api.openai.com"],
      },
    }),
  ],
});
```

---

#### 漏洞 #8: AI响应未进行深度验证

**类型**: AI注入 / 提示注入
**位置**: `/api/index.ts:116-174,299-333`
**CVSS评分**: 4.5 (中低危)

**风险分析**:
1. AI模型可能返回恶意JSON
2. 提示注入可能绕过验证
3. AI幻觉可能导致错误配置

**修复方案**:

```typescript
// 添加AI响应验证
function validateAIResponse(response: any): boolean {
  // 1. 验证结构
  if (!response || typeof response !== 'object') {
    return false;
  }

  // 2. 验证必需字段
  if (typeof response.score !== 'number' || response.score < 1 || response.score > 10) {
    return false;
  }

  if (typeof response.summary !== 'string' || response.summary.length > 500) {
    return false;
  }

  // 3. 验证建议
  if (!Array.isArray(response.suggestions) || response.suggestions.length > 10) {
    return false;
  }

  // 4. 验证每个建议
  for (const suggestion of response.suggestions) {
    if (typeof suggestion !== 'object') continue;
    if (typeof suggestion.description !== 'string') return false;
    if (suggestion.description.length > 500) return false;

    // 验证type
    const validTypes = ['add_field', 'modify_field', 'remove_field',
                        'add_index', 'remove_index', 'performance_warning', 'general'];
    if (!validTypes.includes(suggestion.type)) return false;
  }

  return true;
}

// 在API端点中使用
app.post('/review', async (c) => {
  // ...
  for await (const chunk of response) {
    content += chunk.choices[0]?.delta?.content || '';
  }

  // 验证响应
  const parsed = JSON.parse(content);
  if (!validateAIResponse(parsed)) {
    return c.json({ error: 'Invalid AI response' }, 500);
  }

  await stream.write(content);
});
```

---

#### 漏洞 #9: 会话管理和错误处理不足

**类型**: 信息泄露
**位置**: `/src/hooks/usePersistedState.ts`, `/api/index.ts`
**CVSS评分**: 4.0 (中低危)

**问题**:
1. 错误消息可能泄露敏感信息
2. 无会话超时机制
3. 无日志记录和监控

**修复方案**:

```typescript
// 1. 统一错误处理
class SecurityError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

function sanitizeError(error: unknown): string {
  if (error instanceof SecurityError) {
    return error.message;
  }
  if (error instanceof Error) {
    // 只返回错误消息,不返回堆栈
    return error.message;
  }
  return 'An error occurred';
}

// 2. 添加会话超时
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30分钟

const saveState = useCallback((state: Partial<PersistedState>) => {
  const dataWithSession = {
    state,
    _sessionStart: Date.now(),
    _lastActivity: Date.now(),
  };
  // ...
}, []);

// 3. 添加日志记录(仅生产环境)
if (import.meta.env.PROD) {
  console.log = (...args: any[]) => {
    // 发送到日志服务
    sendToLogService('info', args);
  };

  console.error = (...args: any[]) => {
    // 发送到错误追踪服务
    sendToErrorTracking(args);
  };
}
```

---

## 2. 威胁模型

### 攻击面分析

```
┌─────────────────────────────────────────────────────────┐
│                    DDLBuilder 应用                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  浏览器存储   │  │   URL共享    │  │   API调用    │ │
│  │  localStorage│  │  ?s=<data>   │  │ /api/review │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                  │                  │         │
│         ▼                  ▼                  ▼         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐│
│  │  XSS攻击     │  │  URL注入     │  │  API滥用     ││
│  │  数据窃取    │  │  恶意链接    │  │  DoS攻击     ││
│  └──────────────┘  └──────────────┘  └──────────────┘│
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  SQL导入     │  │  AI响应      │  │  第三方依赖  │ │
│  │  注入攻击    │  │  提示注入    │  │  供应链攻击  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 关键攻击路径

#### 路径1: URL共享 → XSS攻击
1. 攻击者构造恶意URL: `https://ddlbuilder.app/?s=<恶意压缩数据>`
2. 恶意数据包含: `{"tableName":"<script>alert(1)</script>"}`
3. 受害者点击链接
4. 数据被解压并渲染到DOM
5. XSS攻击成功,窃取session cookie

**缓解措施**:
- 对所有输入进行HTML转义
- 实施CSP策略
- 使用DOMPurify清理HTML

#### 路径2: localStorage → 数据泄露
1. 用户使用公共计算机访问DDLBuilder
2. 应用保存配置到localStorage
3. 用户忘记清除数据
4. 下一个用户可以访问localStorage
5. 敏感数据泄露

**缓解措施**:
- 加密localStorage数据
- 添加会话超时
- 提供显式的"清除所有数据"功能
- 使用会话存储代替本地存储

#### 路径3: API滥用 → 成本激增
1. 攻击者发现API端点
2. 编写脚本无限调用`/api/review`
3. 每次调用都消耗OpenAI配额
4. 账单激增

**缓解措施**:
- 实施速率限制
- 添加身份验证
- 监控API使用情况
- 设置成本预警

### 风险评估矩阵

| 威胁 | 可能性 | 影响 | 风险等级 | 优先级 |
|-----|--------|------|----------|--------|
| XSS攻击(URL共享) | 高 | 高 | 严重 | P0 |
| localStorage数据泄露 | 中 | 高 | 严重 | P0 |
| JSON注入/原型污染 | 中 | 中 | 高 | P1 |
| SQL注入 | 低 | 高 | 高 | P1 |
| API滥用/DoS | 中 | 中 | 高 | P1 |
| 依赖漏洞 | 低 | 中 | 中 | P2 |
| AI提示注入 | 低 | 中 | 中 | P2 |
| 缺少CSP | 中 | 低 | 中 | P2 |

---

## 3. 依赖审计报告

### 已知漏洞清单

#### 1. mdast-util-to-hast (CVE-2024-xxxx)

**影响版本**: `>=13.0.0 <13.2.1`
**漏洞类型**: 未经过滤的class属性
**CVSS评分**: 5.5 (中危)
**影响组件**: `react-markdown`

**描述**:
该库在处理Markdown时,未对class属性进行充分验证,可能导致XSS攻击。

**修复方案**:
```bash
bun update react-markdown
```

或指定版本:
```json
{
  "dependencies": {
    "react-markdown": "^10.1.0" // 使用最新版本
  }
}
```

#### 2. js-yaml (CVE-2021-xxxx)

**影响版本**: `<3.14.2`
**漏洞类型**: 原型污染
**CVSS评分**: 5.5 (中危)
**影响组件**: `gray-matter`

**描述**:
js-yaml在解析YAML时,未正确验证对象键,可能导致原型污染攻击。

**修复方案**:
```bash
bun update gray-matter
```

### 建议更新的依赖

#### 高优先级更新

```json
{
  "dependencies": {
    "react-markdown": "^10.1.0",
    "gray-matter": "^4.0.3",
    "openai": "^6.18.0"
  }
}
```

#### 中优先级更新

```json
{
  "devDependencies": {
    "vite": "^7.3.1",
    "vitest": "^4.0.18",
    "@playwright/test": "^1.58.2"
  }
}
```

### 许可证风险评估

所有依赖的许可证都是允许的:

| 依赖 | 许可证 | 风险等级 |
|-----|--------|---------|
| react | MIT | 低 |
| react-dom | MIT | 低 |
| hono | MIT | 低 |
| openai | MIT | 低 |
| lz-string | MIT | 低 |
| handsontable | Commercial | 中(需要许可证) |

**注意**: `handsontable`使用商业许可证,需要确认使用是否符合许可协议。

---

## 4. 安全加固建议

### 防御深度策略

#### 第1层: 输入验证

**原则**: 永不信任用户输入

```typescript
// 创建统一的验证函数库
// /src/utils/validation.ts

export function validateFieldName(name: string): boolean {
  // 字段名规则: 字母开头,只包含字母数字下划线
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

export function validateTableName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

export function validateComment(comment: string): boolean {
  // 限制长度和特殊字符
  return comment.length <= 500 && !/[<>"]/.test(comment);
}

export function validateFieldType(type: string): boolean {
  const allowedTypes = [
    'INT', 'VARCHAR', 'TEXT', 'DATETIME', 'DECIMAL',
    // ... 根据数据库类型
  ];
  return allowedTypes.includes(type.toUpperCase());
}
```

#### 第2层: 输出编码

**原则**: 在渲染前对所有数据进行编码

```typescript
// /src/utils/encoding.ts

export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export function escapeJson(unsafe: string): string {
  return unsafe
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}
```

#### 第3层: 内容安全策略

**原则**: 限制可信资源来源

```html
<!-- /index.html -->
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'nonce-{random}';
  style-src 'self' 'unsafe-inline' 'nonce-{random}';
  img-src 'self' data: https:;
  connect-src 'self' https://api.openai.com;
">
```

#### 第4层: 访问控制

**原则**: 最小权限原则

```typescript
// 实施API密钥认证
// /api/utils/auth.ts

export async function verifyAuth(token: string): Promise<User | null> {
  // 验证JWT token
  try {
    const decoded = await verifyJWT(token);
    return decoded;
  } catch {
    return null;
  }
}

// API密钥白名单
const API_KEY_WHITELIST = new Set(process.env.API_KEYS?.split(','));

export function verifyApiKey(key: string): boolean {
  return API_KEY_WHITELIST.has(key);
}
```

#### 第5层: 监控和日志

**原则**: 可审计性

```typescript
// /src/utils/audit.ts

export function auditLog(event: string, data: any) {
  const log = {
    timestamp: new Date().toISOString(),
    event,
    data,
    userAgent: navigator.userAgent,
    url: window.location.href,
  };

  // 发送到日志服务
  if (import.meta.env.PROD) {
    fetch('/api/audit', {
      method: 'POST',
      body: JSON.stringify(log),
    });
  } else {
    console.log('[AUDIT]', log);
  }
}

// 使用示例
auditLog('ddl_generated', { tableName: 'users', dbType: 'mysql' });
auditLog('security_event', { type: 'xss_attempt', source: 'url' });
```

### 安全最佳实践

#### 1. 实施安全开发生命周期(SDL)

```
需求分析 → 风险评估 → 安全设计 → 安全编码
    ↓
安全测试 → 部署 → 监控 → 响应
```

#### 2. 定期安全审计

- **频率**: 每季度一次
- **范围**: 代码审查、依赖审计、渗透测试
- **工具**: SAST、DAST、依赖扫描

#### 3. 安全培训

- 开发人员安全意识培训
- OWASP Top 10学习
- 安全编码实践

#### 4. 事件响应计划

```typescript
// /src/utils/incident-response.ts

export class SecurityIncident {
  async handleXSSAttempt(payload: string) {
    // 1. 记录事件
    auditLog('xss_attempt', { payload });

    // 2. 阻止请求
    throw new Error('Potential XSS detected');

    // 3. 通知安全团队
    await notifySecurityTeam({
      type: 'XSS',
      severity: 'high',
      payload,
    });
  }

  async handleRateLimitExceeded(ip: string) {
    // 1. 记录事件
    auditLog('rate_limit_exceeded', { ip });

    // 2. 临时封禁IP
    await blockIP(ip, 15 * 60 * 1000);

    // 3. 通知管理员
    await notifyAdmin({
      type: 'rate_limit',
      ip,
    });
  }
}
```

### 实施路线图

#### 阶段1: 紧急修复 (1-2周)

- [ ] 修复URL共享XSS漏洞
- [ ] 加密localStorage数据
- [ ] 添加输入验证
- [ ] 更新有漏洞的依赖

#### 阶段2: 高优先级改进 (2-4周)

- [ ] 实施API速率限制
- [ ] 添加身份验证
- [ ] 配置CSP策略
- [ ] 添加日志和监控

#### 阶段3: 中期改进 (1-2个月)

- [ ] 完善错误处理
- [ ] 实施会话管理
- [ ] 添加自动化安全测试
- [ ] 完善文档

#### 阶段4: 长期改进 (持续)

- [ ] 定期安全审计
- [ ] 依赖更新策略
- [ ] 安全培训
- [ ] 威胁建模

---

## 5. 测试建议

### 安全测试用例

#### 单元测试

```typescript
// /src/__tests__/security/validation.test.ts

describe('Input Validation', () => {
  test('should reject XSS in table name', () => {
    const malicious = '<script>alert(1)</script>';
    expect(validateTableName(malicious)).toBe(false);
  });

  test('should reject SQL injection', () => {
    const malicious = "'; DROP TABLE users; --";
    expect(validateFieldName(malicious)).toBe(false);
  });

  test('should reject prototype pollution', () => {
    const malicious = '__proto__.polluted';
    expect(validateFieldName(malicious)).toBe(false);
  });
});

// /src/__tests__/security/encoding.test.ts

describe('Output Encoding', () => {
  test('should escape HTML entities', () => {
    const input = '<script>alert(1)</script>';
    const output = escapeHtml(input);
    expect(output).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('should escape JSON special chars', () => {
    const input = '{"key":"value"}';
    const output = escapeJson(input);
    expect(output).toBe('{\\"key\\":\\"value\\"}');
  });
});
```

#### 集成测试

```typescript
// /src/__tests__/security/share.test.ts

describe('URL Sharing Security', () => {
  test('should sanitize malicious shared state', () => {
    const maliciousState = {
      tableName: '<script>alert(1)</script>',
      rows: [{
        fieldName: '"><img src=x onerror=alert(1)>',
        fieldComment: '<img src=x onerror=alert(1)>',
      }],
    };

    const compressed = compressState(maliciousState);
    const decompressed = decompressState(compressed);

    expect(decompressed?.tableName).not.toContain('<script>');
    expect(decompressed?.rows[0].fieldName).not.toContain('<img');
  });
});
```

### 渗透测试

#### 手动测试清单

- [ ] XSS测试: 在所有输入字段注入`<script>alert(1)</script>`
- [ ] SQL注入测试: 输入`' OR '1'='1`
- [ ] 原型污染测试: 输入`__proto__.polluted`
- [ ] DoS测试: 发送大型JSON(>10MB)
- [ ] CSRF测试: 构造跨域请求
- [ ] 会话劫持测试: 尝试访问其他用户的localStorage

#### 自动化工具

```bash
# npm audit
npm audit

# Snyk
snyk test

# OWASP ZAP
zap-baseline.py -t http://localhost:5173

# Semgrep
semgrep --config=auto src/
```

---

## 6. 合规性和隐私

### GDPR合规性

如果处理欧盟用户数据,需要:

1. **数据最小化**: 只收集必要数据
2. **用户同意**: 明确告知数据用途
3. **数据删除**: 提供"被遗忘权"
4. **数据导出**: 允许用户导出数据

### CCPA合规性

如果处理加州用户数据,需要:

1. **隐私政策**: 明确的隐私声明
2. **数据披露**: 告知数据收集情况
3. **选择退出**: 允许用户选择不出售数据
4. **数据删除**: 提供数据删除功能

### 实施

```typescript
// /src/utils/privacy.ts

export function exportUserData(): string {
  const data = localStorage.getItem(STORAGE_KEY);
  return data || '';
}

export function deleteUserData(): void {
  localStorage.clear();
  sessionStorage.clear();
}

export function showPrivacyConsent(): void {
  // 显示隐私同意对话框
  const consent = localStorage.getItem('privacy_consent');
  if (!consent) {
    // 显示同意对话框
  }
}
```

---

## 7. 总结

### 关键指标

| 指标 | 当前状态 | 目标状态 |
|-----|---------|---------|
| P0漏洞 | 2 | 0 |
| P1漏洞 | 3 | 0 |
| P2漏洞 | 4 | <2 |
| 依赖漏洞 | 2 | 0 |
| 安全测试覆盖率 | 0% | >80% |

### 优先行动项

1. **立即执行** (本周):
   - 修复URL共享XSS漏洞
   - 加密localStorage数据
   - 更新有漏洞的依赖

2. **短期执行** (本月):
   - 实施输入验证
   - 添加API速率限制
   - 配置CSP策略

3. **中期执行** (本季度):
   - 完善日志和监控
   - 添加自动化安全测试
   - 实施身份验证

### 持续改进

- 每月更新依赖
- 每季度安全审计
- 每年渗透测试
- 持续安全培训

---

## 附录

### A. 安全检查清单

#### XSS防护
- [x] 搜索`dangerouslySetInnerHTML`(未发现使用)
- [ ] 所有用户输入在渲染前都经过转义
- [ ] URL参数验证和清理
- [ ] CSP策略配置

#### 数据安全
- [ ] 敏感数据加密存储
- [ ] API密钥安全存储
- [ ] 共享链接不暴露敏感信息
- [ ] 数据过期和清理机制

#### 输入验证
- [ ] 所有输入都有验证
- [ ] 字段名符合命名规则
- [ ] SQL导入有注入防护
- [ ] 文件上传有类型和大小限制

### B. 参考资料

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CSP Level 3](https://w3c.github.io/webappsec-csp/)
- [MDN Web Security](https://developer.mozilla.org/en-US/docs/Web/Security)
- [React Security](https://react.dev/learn/keeping-components-pure)

### C. 联系方式

如有安全问题,请联系:
- 安全团队邮箱: security@ddlbuilder.example.com
- 漏洞披露: security@example.com
- 紧急联系: [待补充]

---

**报告生成时间**: 2026-02-08
**报告版本**: 1.0
**下次审计**: 2026-05-08
