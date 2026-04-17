---
name: gen-docs
description: Update user documentation.
---

现在我们正在为当前项目 DDLBuilder - 筑表师 编写和维护用户文档，文档内容在 docs 目录下，apps/docs/AGENTS.md 中有对文档的说明。

我们现在对代码库有了一些修改，请你参考最近的 git commit、staged changes、changelog.md 等的内容，根据 AGENTS.md 中的信息，必要时找到实际的代码全文，确保理解了所有变更对产品用户体验的真实改变，然后逐页、逐段地检查和更新文档内容。

你应该首先确保中文文档符合最新代码的行为。最后，使用 translate-docs skill 进行双语同步。

除了完成 apps/docs/下的内容，你还需要根据变更情况决定是否要更新 apps/web/public/llms.txt 的内容
