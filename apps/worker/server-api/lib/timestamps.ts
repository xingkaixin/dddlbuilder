// 业务表时间列统一存储 Unix 毫秒（与 auth 表一致）；对外 API 保持 ISO 字符串契约
export const toIsoTimestamp = (value: unknown): string => new Date(Number(value)).toISOString();
