# Backend 测试文档

## 测试框架

本项目使用 **Vitest** 作为测试框架，提供原生的 TypeScript 支持和快速的测试执行。

## 运行测试

```bash
# 运行所有测试
pnpm run test

# 监听模式（开发时使用）
pnpm run test:watch

# 生成覆盖率报告
pnpm run test:coverage

# UI 模式
pnpm run test:ui
```

## 测试结构

```
backend/tests/
├── unit/                           # 单元测试
│   ├── infrastructure/            # 基础设施层测试
│   │   └── tools/                # 工具框架测试
│   │       ├── registry/          # ToolRegistry 测试
│   │       │   ├── registration.test.ts
│   │       │   ├── lookup.test.ts
│   │       │   ├── execution.test.ts
│   │       │   └── metadata.test.ts
│   │       ├── bashTool/          # BashTool 测试
│   │       │   ├── basic-execution.test.ts
│   │       │   ├── background-process.test.ts
│   │       │   ├── signal-handling.test.ts
│   │       │   ├── error-scenarios.test.ts
│   │       │   └── validation.test.ts
│   │       └── fixtures.ts        # 测试工具和 fixtures
│   └── setup.ts                  # 全局测试设置
```

## 测试覆盖

### ToolRegistry 测试（任务 4.1）✅
- ✅ 工具注册功能
- ✅ 工具查找功能
- ✅ 工具执行功能
- ✅ 元数据管理

### BashTool 测试（任务 4.2-4.5）⚠️
由于 child_process 模块的 mock 复杂性，部分 BashTool 测试需要进一步调整。

当前状态：
- ✅ validation.test.ts - 参数验证测试全部通过
- ⚠️ 其他 BashTool 测试需要 mock 调整

## Mock 策略

### Logger Mock
Logger 在 `tests/unit/setup.ts` 中被全局 mock，避免文件 I/O：

```typescript
vi.mock('../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
```

### Child Process Mock
child_process 模块需要特殊处理，因为它涉及异步操作和进程管理。

**当前实现**：使用内联 mock，在每个测试文件中定义 `MockChildProcess` 类并使用 `vi.mock('child_process', ...)` 进行 mock。

**原因**：Vitest 的 `vi.mock()` 会在所有导入之前被 hoisted，导致无法从外部文件导入 mock 工厂函数。

## 下一步

1. 完成所有 BashTool 测试的调试
2. 验证测试覆盖率达到目标（≥90% 行覆盖率）
3. 集成到 `pnpm run preflight`

## 覆盖率目标

- **行覆盖率**: ≥90%
- **分支覆盖率**: ≥85%
- **函数覆盖率**: ≥90%
- **语句覆盖率**: ≥90%

## 有用的命令

```bash
# 运行特定测试文件
pnpm run test -- tests/unit/infrastructure/tools/registry/registration.test.ts

# 运行匹配模式的测试
pnpm run test -- --grep "registration"

# 监听模式并只运行相关测试
pnpm run test:watch -- --related

# 更新覆盖率报告
pnpm run test:coverage
```

## 参考资料

- [Vitest 官方文档](https://vitest.dev/)
- [Vitest Mocking 指南](https://vitest.dev/guide/mocking.html)
- [项目测试规范](../../CLAUDE.md)
