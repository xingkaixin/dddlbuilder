import { MySqlStrategy } from './MySqlStrategy';

/**
 * OceanBase MySQL 模式 DDL 策略
 *
 * OceanBase 在 MySQL 模式下高度兼容 MySQL 5.7/8.0 语法
 * 支持 AUTO_INCREMENT、COMMENT、ON UPDATE CURRENT_TIMESTAMP 等
 *
 * 参考: https://en.oceanbase.com/docs/common-oceanbase-database-10000000000829643
 */
export class OceanBaseMySqlStrategy extends MySqlStrategy {
  getDatabaseType(): 'oceanbase' {
    return 'oceanbase';
  }

  // 完全继承 MySqlStrategy，无需重写任何方法
}
