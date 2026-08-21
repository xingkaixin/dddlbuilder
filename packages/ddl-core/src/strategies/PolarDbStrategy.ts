import { MySqlStrategy } from './MySqlStrategy';

/**
 * 阿里云 PolarDB 数据库 DDL 策略
 *
 * PolarDB 是阿里云自研的云原生数据库，兼容 MySQL 8.0，具有以下特性：
 * - 支持 AUTO_INCREMENT 自增列语法
 * - 支持分区表配置
 * - 使用 COMMENT 添加表和列注释
 * - 兼容 MySQL 8.0 语法，支持部分特有语法
 *
 * 参考资料：
 * - https://www.aliyun.com/product/polardb
 */
export class PolarDbStrategy extends MySqlStrategy {
  getDatabaseType(): 'polardb' {
    return 'polardb';
  }
}
