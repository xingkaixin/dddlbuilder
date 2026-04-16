import { MySqlStrategy } from './MySqlStrategy';

/**
 * TiDB DDL 策略
 *
 * TiDB 是兼容 MySQL 协议的分布式数据库
 * DDL 语法高度兼容 MySQL 5.7 和 MySQL 8.0
 *
 * 注意：
 * - TiDB 不支持 SPATIAL 类型（本工具不涉及）
 * - TiDB 有一些特有的关键字（已通过继承 MySQL 的关键字处理）
 * - 其他 DDL 语法与 MySQL 完全兼容
 *
 * 如果将来需要针对 TiDB 的特殊特性进行定制，
 * 可以重写相应的方法。
 */
export class TiDbStrategy extends MySqlStrategy {
  getDatabaseType(): 'tidb' {
    return 'tidb';
  }

  // 目前 TiDB 与 MySQL 的 DDL 语法完全兼容，
  // 因此直接继承父类的实现即可。
  // 如果将来有差异，可以在这里重写相应的方法。
}
