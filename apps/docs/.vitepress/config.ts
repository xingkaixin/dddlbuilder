import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineConfig } from 'vitepress';

const siteUrl = 'https://ddl.xingkaixin.me';
const docsBase = '/docs/';

const cleanDocsPath = (url: string) =>
  url.replace(/(^|\/)index(?:\.html)?$/, '$1').replace(/\.html$/, '');

const withDocsBase = (url: string) =>
  `${docsBase}${cleanDocsPath(url)}`.replace(/\/+/g, '/');

const canonicalDocsPath = (url: string) =>
  cleanDocsPath(url).replace(/^\/?(?:en|zh)\//, '').replace(/^\/?$/, '');

const pageToDocsPath = (page: string) =>
  cleanDocsPath(page.replace(/\.md$/, ''));

const docsPathToPage = (path: string) =>
  path.endsWith('/') ? `${path}index.md` : `${path}.md`;

const docsPageExists = (pages: string[], path: string) =>
  pages.includes(docsPathToPage(path));

const alternateLinksFor = (path: string, pages: string[]) => {
  const key = canonicalDocsPath(path);
  const zhPath = key ? `zh/${key}` : 'zh/';
  const enPath = key ? `en/${key}` : 'en/';

  if (!docsPageExists(pages, zhPath) || !docsPageExists(pages, enPath)) {
    return [];
  }

  return [
    [
      'link',
      {
        rel: 'alternate',
        hreflang: 'zh-CN',
        href: `${siteUrl}${withDocsBase(zhPath)}`,
      },
    ],
    [
      'link',
      {
        rel: 'alternate',
        hreflang: 'en-US',
        href: `${siteUrl}${withDocsBase(enPath)}`,
      },
    ],
    [
      'link',
      {
        rel: 'alternate',
        hreflang: 'x-default',
        href: `${siteUrl}${withDocsBase(zhPath)}`,
      },
    ],
  ] as const;
};

const canonicalHeadForPage = (page: string, pages: string[]) => {
  if (page === '404.md') {
    return [];
  }

  const path = pageToDocsPath(page);

  if (!path) {
    return [
      ['meta', { name: 'robots', content: 'noindex,follow' }],
      [
        'link',
        { rel: 'canonical', href: `${siteUrl}${withDocsBase('zh/')}` },
      ],
    ] as const;
  }

  return [
    ['link', { rel: 'canonical', href: `${siteUrl}${withDocsBase(path)}` }],
    ...alternateLinksFor(path, pages),
  ] as const;
};

const formatSitemapLastmod = (xml: string) =>
  xml.replace(
    /<lastmod>(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.\d{3}Z<\/lastmod>/g,
    '<lastmod>$1+00:00</lastmod>'
  );

const readGeneratedSitemap = async (path: string) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  return readFile(path, 'utf8');
};

const zhSidebar = [
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
      { text: 'AI 辅助建表流程', link: '/zh/advanced/ai-workflow' },
      { text: '评审与解释 SQL', link: '/zh/advanced/review-and-explain' },
      { text: '分区与分片配置', link: '/zh/advanced/partition-and-sharding' },
      { text: '变更对比与回滚', link: '/zh/advanced/diff-and-rollback' },
      { text: '外键配置与 ER 图', link: '/zh/advanced/foreign-key-and-er' },
      { text: 'ORM 模型生成', link: '/zh/advanced/orm-generation' },
      { text: '视图与 Routine 配置', link: '/zh/advanced/view-and-routine' },
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

const enSidebar = [
  {
    text: 'Basic Guide',
    items: [
      { text: 'Quick Start', link: '/en/basic/getting-started' },
      { text: 'Core Concepts', link: '/en/basic/core-concepts' },
      {
        text: 'Table and Field Configuration',
        link: '/en/basic/table-and-fields',
      },
      {
        text: 'Indexes, Privileges, and Misc',
        link: '/en/basic/index-auth-misc',
      },
      { text: 'DDL Output and Sharing', link: '/en/basic/ddl-and-share' },
      { text: 'Saved Tables and Draft box', link: '/en/basic/saved-tables' },
    ],
  },
  {
    text: 'Advanced Guide',
    items: [
      { text: 'Import and Parse SQL', link: '/en/advanced/import-and-parse' },
      {
        text: 'AI-Assisted Table Design Workflow',
        link: '/en/advanced/ai-workflow',
      },
      {
        text: 'Review and Explain SQL',
        link: '/en/advanced/review-and-explain',
      },
      {
        text: 'Partitioning and Sharding Configuration',
        link: '/en/advanced/partition-and-sharding',
      },
      {
        text: 'Change Diff and Rollback',
        link: '/en/advanced/diff-and-rollback',
      },
      {
        text: 'Foreign Key Configuration and ER Diagram',
        link: '/en/advanced/foreign-key-and-er',
      },
      {
        text: 'ORM Model Generation',
        link: '/en/advanced/orm-generation',
      },
      {
        text: 'View and Routine Configuration',
        link: '/en/advanced/view-and-routine',
      },
      {
        text: 'Schema Lint',
        link: '/en/advanced/schema-lint',
      },
      {
        text: 'Mock Data and Logical Enums',
        link: '/en/advanced/mock-data-and-enum',
      },
      {
        text: 'Table Blueprint Templates',
        link: '/en/advanced/blueprint-templates',
      },
    ],
  },
  {
    text: 'FAQ',
    items: [
      { text: 'Errors and Failure Handling', link: '/en/faq/common-errors' },
      {
        text: 'Feature Entry and Visibility',
        link: '/en/faq/feature-visibility',
      },
      {
        text: 'Sharing and Collaboration',
        link: '/en/faq/sharing-and-collaboration',
      },
    ],
  },
  {
    text: 'Changelog',
    items: [{ text: 'Release Notes', link: '/en/changelog/changelog' }],
  },
];

const zhNav = [
  { text: '基础指南', link: '/zh/basic/getting-started' },
  { text: '高级技巧', link: '/zh/advanced/' },
  { text: '常见问题', link: '/zh/faq/common-errors' },
  { text: '更新说明', link: '/zh/changelog/changelog' },
];

const enNav = [
  { text: 'Basic Guide', link: '/en/basic/getting-started' },
  { text: 'Advanced Guide', link: '/en/advanced/' },
  { text: 'FAQ', link: '/en/faq/common-errors' },
  { text: 'Changelog', link: '/en/changelog/changelog' },
];

export default defineConfig({
  title: '筑表师文档',
  description: '筑表师使用文档与常见问题',
  base: '/docs/',
  cleanUrls: true,
  outDir: '.vitepress/dist',
  srcExclude: ['AGENTS.md'],
  sitemap: {
    hostname: siteUrl,
    xmlns: {
      news: false,
      video: false,
      image: false,
      xhtml: true,
    },
    transformItems(items) {
      const indexableItems = items.filter(
        (item) => cleanDocsPath(item.url) !== ''
      );
      const byPath = new Map<string, { en?: string; zh?: string }>();

      for (const item of indexableItems) {
        const key = canonicalDocsPath(item.url);
        const group = byPath.get(key) ?? {};

        if (item.url.startsWith('en/')) {
          group.en = withDocsBase(item.url);
        }

        if (item.url.startsWith('zh/')) {
          group.zh = withDocsBase(item.url);
        }

        byPath.set(key, group);
      }

      return indexableItems.map((item) => {
        const key = canonicalDocsPath(item.url);
        const group = byPath.get(key);
        const links =
          group?.en && group.zh
            ? [
                { lang: 'zh-CN', url: group.zh },
                { lang: 'en-US', url: group.en },
                { lang: 'x-default', url: group.zh },
              ]
            : undefined;

        return {
          ...item,
          url: withDocsBase(item.url),
          links,
        };
      });
    },
  },
  transformHead({ page, siteConfig }) {
    return canonicalHeadForPage(page, siteConfig.pages);
  },
  async buildEnd(siteConfig) {
    const sitemapPath = join(siteConfig.outDir, 'sitemap.xml');
    const sitemap = await readGeneratedSitemap(sitemapPath);

    await writeFile(sitemapPath, formatSitemapLastmod(sitemap));
  },
  head: [
    ['meta', { name: 'theme-color', content: '#E07A5F' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.cn' }],
    [
      'link',
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.cn',
        crossorigin: '',
      },
    ],
    [
      'link',
      {
        rel: 'preconnect',
        href: 'https://cdn-font.hyperos.mi.com',
        crossorigin: '',
      },
    ],
    [
      'link',
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.cn/css2?family=Roboto+Mono:wght@400;500;600;700&display=swap',
      },
    ],
    [
      'link',
      {
        rel: 'stylesheet',
        href: 'https://cdn-font.hyperos.mi.com/font/css?family=MiSans_VF:VF:Chinese_Simplify,Latin&display=swap',
      },
    ],
  ],
  lastUpdated: true,
  locales: {
    root: {
      label: '中文',
      lang: 'zh-CN',
      link: '/zh/',
    },
    en: {
      label: 'English',
      lang: 'en-US',
      link: '/en/',
      title: 'DDLBuilder Docs',
      description: 'DDLBuilder usage docs and FAQs',
      themeConfig: {
        nav: enNav,
        sidebar: {
          '/zh/': zhSidebar,
          '/en/': enSidebar,
        },
        outline: {
          level: [2, 3],
          label: 'On this page',
        },
        docFooter: {
          prev: 'Previous page',
          next: 'Next page',
        },
      },
    },
  },
  themeConfig: {
    nav: zhNav,
    sidebar: {
      '/zh/': zhSidebar,
      '/en/': enSidebar,
    },
    search: {
      provider: 'local',
    },
    outline: {
      level: [2, 3],
      label: '目录',
    },
    docFooter: {
      prev: '上一页',
      next: '下一页',
    },
  },
});
