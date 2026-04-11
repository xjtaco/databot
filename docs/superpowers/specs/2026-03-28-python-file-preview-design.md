# Python 节点文件预览

## 问题

Python 节点执行后，`result` 中的文件路径（图表、报告等）和 `csvPath` 只以 JSON 文本显示，没有预览入口。用户无法直观查看生成的文件内容。

## 方案

1. 后端自动检测 `result` 中的文件路径并标注类型
2. 前端 Python 预览区同时显示 JSON 结果 + 文件预览按钮
3. 点击按钮弹出 Dialog 预览文件（文本用 `<pre>`，图片用 `<img>`）
4. 新增原始文件流 API 支持图片预览

## 改动

### 1. 后端：`executionEngine.ts` — 增强 `annotateOutputTypes`

对 Python 节点，扫描 `result` 字典值，如果字符串以 `config.work_folder` 开头，标注为 `TypedOutputValue` 并提升为顶层输出字段（key 加 `file:` 前缀避免冲突）。

新增 `inferFileType` 函数，根据扩展名推断类型：
- `.csv` → `csvFile`
- `.md` → `markdownFile`
- `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg` → `imageFile`
- `.json` → `jsonFile`
- 其他 → `filePath`

### 2. 后端：`workflow.controller.ts` + `workflow.routes.ts` — 新增 `file-raw` endpoint

`GET /workflows/file-raw?path=...`

复用 `filePreviewHandler` 的安全检查逻辑（路径必须在 work_folder 内），但直接以原始 content-type 流式返回文件。用 `mime-types` 或手动映射推断 content-type，默认 `application/octet-stream`。

### 3. 前端：`WfNodePreview.vue` — Python 预览区增强

修改模板结构：Python 预览不再与 `typedFileOutputs` 互斥。同时显示：
- JSON result（现有 `<pre>` 块）
- 检测到的文件列表，每个文件显示文件名 + 预览按钮

点击预览按钮弹出 `el-dialog`：
- 文本文件：调 `file-preview` API 获取内容，`<pre>` 显示
- 图片文件：`<img :src="'/api/workflows/file-raw?path=...'">` 直接展示

### 4. i18n

在 `zh-CN.ts` 和 `en-US.ts` 中添加：
- `workflow.preview.filePreview`: 文件预览 / File Preview
- `workflow.preview.previewFile`: 预览 / Preview

## 影响范围

- 后端：改 2 个文件（executionEngine.ts, workflow.controller.ts + routes）
- 前端：改 1 个组件 + 2 个 i18n 文件
- 无数据库变更
- 无新依赖（content-type 映射用简单 switch 即可）
