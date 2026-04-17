---
name: gen-changelog
description: Generate changelog entries for code changes.
---

根据当前分支相对于 main 分支的修改，生成更新日志条目。

## 步骤

1. **分析变更**：查看 `git log main..HEAD --oneline` 和 `git diff main..HEAD --stat`，理解所有变更。
2. **更新中文文档 CHANGELOG**：在 apps/docs/zh/changelog 目录 `changelog.md` 的 `## 未发布` 下添加条目；
3. **更新英文文档 CHANGELOG**：在 apps/docs/en/changelog 目录 `changelog.md` 的 `## Unreleased` 下添加对应的英文翻译条目，遵循现有格式和用词规范
4. **更新项目 CHANGELOG**：在根目录 `CHANGELOG.md` 的 `## Unreleased` 下同步添加本次英文 changelog的内容


## 注意事项

- 应遵循 `docs/AGENTS.md` 中的写作规范。
- 条目风格遵循现有 CHANGELOG 的格式。
- 只写对用户有意义的变更，不写纯内部重构。
- 要写让用户看得懂的内容。
