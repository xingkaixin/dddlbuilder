import { MySqlStrategy } from './MySqlStrategy';

/**
 * MariaDB DDL 策略
 *
 * MariaDB 是 MySQL 的开源分支，DDL 语法高度兼容 MySQL。
 * 该策略继承 MySqlStrategy，复用其实现逻辑。
 *
 * 如果将来需要针对 MariaDB 的特殊特性进行定制，
 * 可以重写相应的方法。
 */
export class MariaDbStrategy extends MySqlStrategy {
  getDatabaseType(): 'mariadb' {
    return 'mariadb';
  }

  // 目前 MariaDB 与 MySQL 的 DDL 语法完全兼容，
  // 因此直接继承父类的实现即可。
  // 如果将来有差异，可以在这里重写相应的方法。
}
