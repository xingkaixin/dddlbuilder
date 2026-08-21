import { MySqlStrategy } from './MySqlStrategy';

/**
 * 南大通用数据库（GBase）DDL 策略
 *
 * 南大通用是国产数据库，兼容 MySQL 协议，具有以下特性：
 * - 支持 AUTO_INCREMENT 自增列语法
 * - 支持分区表配置
 * - 使用 COMMENT 添加表和列注释
 * - 兼容 MySQL 大部分语法
 *
 * 参考资料：
 * - https://www.gbasestore.com/
 */
export class GBaseStrategy extends MySqlStrategy {
  getDatabaseType(): 'gbase' {
    return 'gbase';
  }
}
