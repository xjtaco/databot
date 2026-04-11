# SQL 节点格式化按钮

## 问题

SQL 节点编辑器中没有 SQL 格式化功能，用户写的 SQL 可读性差。

## 方案

在 SQL CodeMirror 编辑器上方加一个「格式化」按钮，使用 `sql-formatter` 库进行纯前端格式化。

## 改动

### 1. 安装依赖

```bash
cd frontend && pnpm add sql-formatter
```

### 2. `frontend/src/components/workflow/config/WfConfigSqlQuery.vue`

在 CodeMirror 编辑器上方添加工具栏，包含一个格式化按钮。参照 `WfConfigMarkdown.vue` 的工具栏模式。

**工具栏 UI**：
- `AlignLeft` 图标（lucide-vue-next）+ 「格式化」文字
- `el-button size="small"`
- 点击调用 `sql-formatter` 的 `format()` 方法

**格式化逻辑**：
- 根据当前选择的数据源类型自动匹配 `sql-formatter` 的 `language` 参数（postgresql / mysql / sqlite）
- 格式化结果写回 `sqlCode`，触发 `handleSqlChange`，并自动保存节点配置

### 3. i18n

在 `zh-CN.ts` 和 `en-US.ts` 中添加：
- `workflow.config.formatSql`: 格式化 / Format

## 影响范围

- 新增 1 个前端依赖（`sql-formatter`）
- 修改 1 个组件文件 + 2 个 i18n 文件
- 无后端变更
- 无数据库变更
