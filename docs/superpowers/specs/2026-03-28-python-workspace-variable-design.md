# Python 节点 WORKSPACE 变量注入

## 问题

Workflow 的 Python 代码节点中，LLM 生成的代码经常会把文件输出路径硬编码为具体的 workFolder 绝对路径（如 `/app/databot/workfolder/wf_fd03528a2971/chart.png`）。这导致：

- 工作流重新执行时，新 run 会生成新的 workFolder，但脚本中的路径仍指向旧目录
- 代码不可复用、不可移植

## 方案

在 Python 脚本包装器中注入一个预定义变量 `WORKSPACE`，指向当前 run 的工作目录。同时在 copilot prompt 中引导 LLM 使用该变量。

## 改动

### 1. `backend/src/workflow/nodeExecutors/pythonNodeExecutor.ts`

在 `buildWrappedScript` 中，将 `WORKSPACE` 作为首个派生变量定义，并用它替换 `_params_path` 中的重复表达式。

改动后完整包装结构（`{paramsFileName}` 为动态生成的 `{safeName}_params.json`）：

```python
import json, sys, os

# Workspace directory for file output (ALL_CAPS = public API for user scripts)
WORKSPACE = os.path.dirname(os.path.abspath(__file__))

_params_path = os.path.join(WORKSPACE, "{paramsFileName}")
with open(_params_path, 'r', encoding='utf-8') as _f:
    params = json.load(_f)

result = {}

# === User Script Start ===
{userScript}
# === User Script End ===

print('__WORKFLOW_RESULT_START__')
print(json.dumps(result))
print('__WORKFLOW_RESULT_END__')
```

**原理**：脚本文件写入 workFolder 目录，`os.path.dirname(os.path.abspath(__file__))` 自然等于容器内的 workFolder 路径，无需额外参数传递。

**命名说明**：使用 `WORKSPACE`（全大写）表明这是供用户脚本使用的公开常量，区别于 `_params_path`、`_f` 等下划线前缀的内部变量。

### 2. `backend/src/copilot/copilotPrompt.ts`

在 `NODE_TYPE_DESCRIPTIONS` 的 Python 节点「使用建议」末尾追加：

> 脚本中预定义了 `WORKSPACE` 变量，指向当前运行的工作目录；生成文件时必须使用 `os.path.join(WORKSPACE, 'filename')` 构建路径，禁止硬编码绝对路径

注：copilot prompt 当前为纯中文，与现有风格保持一致。

## 影响范围

- 仅涉及 2 个文件的小改动
- 向后兼容：现有 Python 脚本不受影响（`WORKSPACE` 是新增变量）
- 用户脚本可以重新赋值 `WORKSPACE`（例如 `WORKSPACE = "/other/path"`），这是允许的——用户意图优先
- 无数据库变更
- 无前端变更
