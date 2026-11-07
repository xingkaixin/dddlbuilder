---
name: translate-docs
description: Translate and sync multilingual documentation.
---

现在我们正在为当前项目 DDLBuilder - 筑表师 编写和维护用户文档，文档内容在 `apps/docs` 目录下，apps/docs/AGENTS.md 中有写作规范。


## 翻译方向
**以中文为准，翻译到英文和日文**

- 中文 `apps/docs/zh/` → 英文 `apps/docs/en/`、日文 `apps/docs/ja/`
- 两种译文都从中文翻译，不以英文为中间稿

## 注意事项

- 必要时可以参考代码文件以确保翻译的准确性
- 要保证不同语言的表达风格、结构标记等保持一致
- 但需要遵守各语言不同的用词和排版偏好：英文用 sentence case；日文沿用现有日文页面的术语译法和全角标点
- 界面文案的译法以 `apps/web/src/i18n/locales/` 中对应语言为准
