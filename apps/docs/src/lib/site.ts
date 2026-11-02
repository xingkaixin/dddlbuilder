export const SITE_URL = 'https://ddl.xingkaixin.me';
export const DOCS_BASE = '/docs';

export const LOCALE_KEYS = ['zh', 'en', 'ja'] as const;

export type LocaleKey = (typeof LOCALE_KEYS)[number];

export interface SidebarLink {
  text: string;
  link: string;
}

export interface SidebarGroup {
  text: string;
  items: SidebarLink[];
}

interface Locale {
  lang: string;
  label: string;
  title: string;
  description: string;
  nav: SidebarLink[];
  sidebar: SidebarGroup[];
  outlineLabel: string;
  previous: string;
  next: string;
  search: string;
  searchPlaceholder: string;
  searchEmpty: string;
  searchFailed: string;
  copyCode: string;
  copied: string;
  themeToggle: string;
  notFoundTitle: string;
  notFoundBody: string;
  notFoundLink: string;
}

const zhSidebar: SidebarGroup[] = [
  {
    text: '基础指南',
    items: [
      { text: '快速开始', link: '/zh/basic/getting-started' },
      { text: '核心概念', link: '/zh/basic/core-concepts' },
      { text: '表与字段配置', link: '/zh/basic/table-and-fields' },
      { text: '索引、授权与杂项', link: '/zh/basic/index-auth-misc' },
      { text: 'DDL 输出与分享', link: '/zh/basic/ddl-and-share' },
      { text: '已保存表与草稿箱', link: '/zh/basic/saved-tables' },
    ],
  },
  {
    text: '高级技巧',
    items: [
      { text: '导入与解析 SQL', link: '/zh/advanced/import-and-parse' },
      { text: '业务数据导入', link: '/zh/advanced/business-data-import' },
      { text: '数据库交付工具', link: '/zh/advanced/database-tools' },
      { text: '查询设计与业务建模', link: '/zh/advanced/modeling-workflows' },
      { text: 'WebMCP Agent 协作', link: '/zh/advanced/webmcp' },
      { text: 'AI 辅助建表流程', link: '/zh/advanced/ai-workflow' },
      { text: '评审与解释 SQL', link: '/zh/advanced/review-and-explain' },
      { text: '分区与分片配置', link: '/zh/advanced/partition-and-sharding' },
      { text: '变更对比与回滚', link: '/zh/advanced/diff-and-rollback' },
      { text: '外键配置与 ER 图', link: '/zh/advanced/foreign-key-and-er' },
      { text: 'ORM 模型生成', link: '/zh/advanced/orm-generation' },
      { text: '视图与 Routine 配置', link: '/zh/advanced/view-and-routine' },
      { text: '字段标准库与业务词典', link: '/zh/advanced/field-standards' },
      { text: 'Schema 规范检查', link: '/zh/advanced/schema-lint' },
      { text: 'Mock 数据与逻辑枚举', link: '/zh/advanced/mock-data-and-enum' },
      { text: '表蓝图模板', link: '/zh/advanced/blueprint-templates' },
    ],
  },
  {
    text: '常见问题',
    items: [
      { text: '报错与失败处理', link: '/zh/faq/common-errors' },
      { text: '功能入口与可见性', link: '/zh/faq/feature-visibility' },
      { text: '分享与协作', link: '/zh/faq/sharing-and-collaboration' },
    ],
  },
  {
    text: '更新说明',
    items: [{ text: '更新日志', link: '/zh/changelog/changelog' }],
  },
];

const enSidebar: SidebarGroup[] = [
  {
    text: 'Basic guide',
    items: [
      { text: 'Quick start', link: '/en/basic/getting-started' },
      { text: 'Core concepts', link: '/en/basic/core-concepts' },
      {
        text: 'Table and field configuration',
        link: '/en/basic/table-and-fields',
      },
      {
        text: 'Indexes, privileges, and misc',
        link: '/en/basic/index-auth-misc',
      },
      { text: 'DDL output and sharing', link: '/en/basic/ddl-and-share' },
      { text: 'Saved tables and drafts', link: '/en/basic/saved-tables' },
    ],
  },
  {
    text: 'Advanced guide',
    items: [
      { text: 'Import and parse SQL', link: '/en/advanced/import-and-parse' },
      { text: 'Business data import', link: '/en/advanced/business-data-import' },
      { text: 'Database tools', link: '/en/advanced/database-tools' },
      { text: 'Query design and modeling', link: '/en/advanced/modeling-workflows' },
      { text: 'WebMCP agent workflow', link: '/en/advanced/webmcp' },
      {
        text: 'AI-assisted table design workflow',
        link: '/en/advanced/ai-workflow',
      },
      {
        text: 'Review and explain SQL',
        link: '/en/advanced/review-and-explain',
      },
      {
        text: 'Partitioning and sharding configuration',
        link: '/en/advanced/partition-and-sharding',
      },
      {
        text: 'Change diff and rollback',
        link: '/en/advanced/diff-and-rollback',
      },
      {
        text: 'Foreign key configuration and ER diagram',
        link: '/en/advanced/foreign-key-and-er',
      },
      {
        text: 'ORM model generation',
        link: '/en/advanced/orm-generation',
      },
      {
        text: 'View and routine configuration',
        link: '/en/advanced/view-and-routine',
      },
      {
        text: 'Schema Lint',
        link: '/en/advanced/schema-lint',
      },
      { text: 'Field standards', link: '/en/advanced/field-standards' },
      {
        text: 'Mock data and logical enums',
        link: '/en/advanced/mock-data-and-enum',
      },
      {
        text: 'Table blueprint templates',
        link: '/en/advanced/blueprint-templates',
      },
    ],
  },
  {
    text: 'FAQ',
    items: [
      { text: 'Errors and failure handling', link: '/en/faq/common-errors' },
      {
        text: 'Feature entry and visibility',
        link: '/en/faq/feature-visibility',
      },
      {
        text: 'Sharing and collaboration',
        link: '/en/faq/sharing-and-collaboration',
      },
    ],
  },
  {
    text: 'Changelog',
    items: [{ text: 'Release notes', link: '/en/changelog/changelog' }],
  },
];

const jaSidebar: SidebarGroup[] = [
  {
    text: '基本ガイド',
    items: [
      { text: 'クイックスタート', link: '/ja/basic/getting-started' },
      { text: 'コアコンセプト', link: '/ja/basic/core-concepts' },
      { text: 'テーブルとフィールドの設定', link: '/ja/basic/table-and-fields' },
      { text: 'インデックス、権限、その他', link: '/ja/basic/index-auth-misc' },
      { text: 'DDL 出力と共有', link: '/ja/basic/ddl-and-share' },
      { text: '保存済みテーブルと下書き', link: '/ja/basic/saved-tables' },
    ],
  },
  {
    text: '上級ガイド',
    items: [
      { text: 'SQL のインポートと解析', link: '/ja/advanced/import-and-parse' },
      { text: '業務データのインポート', link: '/ja/advanced/business-data-import' },
      { text: 'データベースツール', link: '/ja/advanced/database-tools' },
      { text: 'クエリ設計と業務モデリング', link: '/ja/advanced/modeling-workflows' },
      { text: 'WebMCP Agent 連携', link: '/ja/advanced/webmcp' },
      { text: 'AI 支援テーブル設計', link: '/ja/advanced/ai-workflow' },
      { text: 'SQL のレビューと説明', link: '/ja/advanced/review-and-explain' },
      {
        text: 'パーティションとシャーディング',
        link: '/ja/advanced/partition-and-sharding',
      },
      { text: '差分とロールバック', link: '/ja/advanced/diff-and-rollback' },
      { text: '外部キーと ER 図', link: '/ja/advanced/foreign-key-and-er' },
      { text: 'ORM モデル生成', link: '/ja/advanced/orm-generation' },
      { text: 'ビューと Routine の設定', link: '/ja/advanced/view-and-routine' },
      { text: 'フィールド標準ライブラリと業務辞書', link: '/ja/advanced/field-standards' },
      { text: 'Schema 規約チェック', link: '/ja/advanced/schema-lint' },
      { text: 'Mock データと論理列挙', link: '/ja/advanced/mock-data-and-enum' },
      { text: 'テーブルブループリント', link: '/ja/advanced/blueprint-templates' },
    ],
  },
  {
    text: 'よくある質問',
    items: [
      { text: 'エラーと失敗への対処', link: '/ja/faq/common-errors' },
      { text: '機能の場所と表示条件', link: '/ja/faq/feature-visibility' },
      { text: '共有と共同作業', link: '/ja/faq/sharing-and-collaboration' },
    ],
  },
  {
    text: '更新情報',
    items: [{ text: '変更履歴', link: '/ja/changelog/changelog' }],
  },
];

const zhNav: SidebarLink[] = [
  { text: '打开 DDLBuilder', link: `${SITE_URL}/` },
  { text: '基础指南', link: '/zh/basic/getting-started' },
  { text: '高级技巧', link: '/zh/advanced/' },
  { text: '常见问题', link: '/zh/faq/common-errors' },
  { text: '更新说明', link: '/zh/changelog/changelog' },
];

const enNav: SidebarLink[] = [
  { text: 'Open DDLBuilder', link: `${SITE_URL}/` },
  { text: 'Basic Guide', link: '/en/basic/getting-started' },
  { text: 'Advanced Guide', link: '/en/advanced/' },
  { text: 'FAQ', link: '/en/faq/common-errors' },
  { text: 'Changelog', link: '/en/changelog/changelog' },
];

const jaNav: SidebarLink[] = [
  { text: 'DDLBuilder を開く', link: `${SITE_URL}/` },
  { text: '基本ガイド', link: '/ja/basic/getting-started' },
  { text: '上級ガイド', link: '/ja/advanced/' },
  { text: 'よくある質問', link: '/ja/faq/common-errors' },
  { text: '更新情報', link: '/ja/changelog/changelog' },
];

export const LOCALES: Record<LocaleKey, Locale> = {
  zh: {
    lang: 'zh-CN',
    label: '中文',
    title: '筑表师文档',
    description: '筑表师使用文档与常见问题',
    nav: zhNav,
    sidebar: zhSidebar,
    outlineLabel: '目录',
    previous: '上一页',
    next: '下一页',
    search: '搜索',
    searchPlaceholder: '搜索文档',
    searchEmpty: '没有找到结果',
    searchFailed: '搜索索引加载失败',
    copyCode: '复制代码',
    copied: '已复制',
    themeToggle: '切换主题',
    notFoundTitle: '页面不存在',
    notFoundBody: '这个地址没有对应的文档。',
    notFoundLink: '返回文档首页',
  },
  en: {
    lang: 'en-US',
    label: 'English',
    title: 'DDLBuilder Docs',
    description: 'DDLBuilder usage docs and FAQs',
    nav: enNav,
    sidebar: enSidebar,
    outlineLabel: 'On this page',
    previous: 'Previous page',
    next: 'Next page',
    search: 'Search',
    searchPlaceholder: 'Search docs',
    searchEmpty: 'No results',
    searchFailed: 'Could not load the search index',
    copyCode: 'Copy code',
    copied: 'Copied',
    themeToggle: 'Switch theme',
    notFoundTitle: 'Page not found',
    notFoundBody: 'There is no page at this address.',
    notFoundLink: 'Back to the docs home',
  },
  ja: {
    lang: 'ja-JP',
    label: '日本語',
    title: 'DDLBuilder ドキュメント',
    description: 'DDLBuilder の使い方とよくある質問',
    nav: jaNav,
    sidebar: jaSidebar,
    outlineLabel: 'このページの内容',
    previous: '前のページ',
    next: '次のページ',
    search: '検索',
    searchPlaceholder: 'ドキュメントを検索',
    searchEmpty: '結果が見つかりません',
    searchFailed: '検索インデックスを読み込めませんでした',
    copyCode: 'コードをコピー',
    copied: 'コピーしました',
    themeToggle: 'テーマを切り替え',
    notFoundTitle: 'ページが見つかりません',
    notFoundBody: 'このアドレスにドキュメントはありません。',
    notFoundLink: 'ドキュメントのホームへ戻る',
  },
};

export function localeOf(id: string): LocaleKey {
  const key = id.split('/')[0];
  const locale = LOCALE_KEYS.find((candidate) => candidate === key);

  if (!locale) throw new Error(`Unknown locale in ${id}`);

  return locale;
}

export function routeOf(id: string): string {
  return `/${id}`.replace(/(^|\/)index$/, '$1');
}

export function docsHref(route: string): string {
  return /^https?:/.test(route) ? route : `${DOCS_BASE}${route}`;
}

export function adjacentPages(route: string, locale: LocaleKey) {
  const links = LOCALES[locale].sidebar.flatMap((group) => group.items);
  const index = links.findIndex((link) => link.link === route);

  return { previous: links[index - 1], next: index < 0 ? undefined : links[index + 1] };
}
