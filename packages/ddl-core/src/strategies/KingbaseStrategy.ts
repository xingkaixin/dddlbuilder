import { PostgresStrategy } from './PostgresStrategy';

/**
 * 人大金仓数据库（Kingbase）DDL 策略
 *
 * 人大金仓是国产数据库，兼容 PostgreSQL 协议，具有以下特性：
 * - 使用 IDENTIFIER(种子, 增量) 或 SERIAL 自增列语法
 * - 支持分片配置（Citus 兼容）
 * - 使用 COMMENT ON 语法添加注释
 * - 标识符使用双引号转义保留关键字
 *
 * 参考资料：
 * - https://www.kingbase.com.cn/
 */
export class KingbaseStrategy extends PostgresStrategy {
  getDatabaseType(): 'kingbase' {
    return 'kingbase';
  }
}
