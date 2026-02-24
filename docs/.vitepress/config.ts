import { defineConfig } from "vitepress";

const zhSidebar = [
  {
    text: "基础指南",
    items: [
      { text: "快速开始", link: "/zh/basic/getting-started" },
      { text: "核心概念", link: "/zh/basic/core-concepts" },
      { text: "表与字段配置", link: "/zh/basic/table-and-fields" },
      { text: "索引、授权与杂项", link: "/zh/basic/index-auth-misc" },
      { text: "DDL 输出与分享", link: "/zh/basic/ddl-and-share" },
      { text: "已保存表与草稿箱", link: "/zh/basic/saved-tables" },
    ],
  },
  {
    text: "高级技巧",
    items: [
      { text: "导入与解析 SQL", link: "/zh/advanced/import-and-parse" },
      { text: "AI 辅助建表流程", link: "/zh/advanced/ai-workflow" },
      { text: "评审与解释 SQL", link: "/zh/advanced/review-and-explain" },
      { text: "分区与分片配置", link: "/zh/advanced/partition-and-sharding" },
      { text: "变更对比与回滚", link: "/zh/advanced/diff-and-rollback" },
    ],
  },
  {
    text: "常见问题",
    items: [
      { text: "报错与失败处理", link: "/zh/faq/common-errors" },
      { text: "功能入口与可见性", link: "/zh/faq/feature-visibility" },
      { text: "分享与协作", link: "/zh/faq/sharing-and-collaboration" },
    ],
  },
  {
    text: "更新说明",
    items: [{ text: "更新日志", link: "/zh/changelog/changelog" }],
  },
];

export default defineConfig({
  title: "筑表师文档",
  description: "筑表师使用文档与常见问题",
  base: "/docs/",
  outDir: "../dist/docs",
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: "基础指南", link: "/zh/basic/getting-started" },
      { text: "高级技巧", link: "/zh/advanced/" },
      { text: "常见问题", link: "/zh/faq/common-errors" },
      { text: "更新说明", link: "/zh/changelog/changelog" },
      {
        text: "语言",
        items: [
          { text: "中文", link: "/zh/" },
          { text: "English", link: "/en/" },
        ],
      },
    ],
    sidebar: {
      "/zh/": zhSidebar,
      "/en/": [
        { text: "English", items: [{ text: "Overview", link: "/en/" }] },
      ],
    },
    search: {
      provider: "local",
    },
    outline: {
      level: [2, 3],
      label: "目录",
    },
    docFooter: {
      prev: "上一页",
      next: "下一页",
    },
  },
});
