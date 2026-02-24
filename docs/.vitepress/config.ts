import { defineConfig } from 'vitepress';

const zhSidebar = [
  {
    text: '基础指南',
    items: [
      { text: '快速开始', link: '/zh/basic/getting-started' },
      { text: '核心概念', link: '/zh/basic/core-concepts' },
    ],
  },
  {
    text: '高级技巧',
    items: [
      { text: '导入与解析 SQL', link: '/zh/advanced/import-and-parse' },
      { text: 'AI 辅助建表流程', link: '/zh/advanced/ai-workflow' },
    ],
  },
  {
    text: 'FAQ',
    items: [{ text: '常见报错', link: '/zh/faq/common-errors' }],
  },
  {
    text: '更新说明',
    items: [{ text: '更新日志', link: '/zh/changelog/' }],
  },
];

export default defineConfig({
  title: 'DDLBuilder 文档',
  description: 'DDLBuilder 使用文档与常见问题',
  base: '/docs/',
  outDir: '../dist/docs',
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: '基础指南', link: '/zh/basic/getting-started' },
      { text: '高级技巧', link: '/zh/advanced/' },
      { text: 'FAQ', link: '/zh/faq/common-errors' },
      { text: '更新说明', link: '/zh/changelog/changelog' },
      {
        text: '语言',
        items: [
          { text: '中文', link: '/zh/' },
          { text: 'English', link: '/en/' },
        ],
      },
    ],
    sidebar: {
      '/zh/': zhSidebar,
      '/en/': [
        { text: 'English', items: [{ text: 'Overview', link: '/en/' }] },
      ],
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
