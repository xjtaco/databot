# DataBot

DataBot 是一个面向数据团队与业务团队的 AI 数据工作台，支持通过聊天方式分析数据、生成报告、连接多种异构数据库，并通过可视化工作流完成自动化处理与定时运行。它把 LLM 对话、数据库接入、知识上下文、工作流编排和任务调度整合到同一个 Web 应用中。

[English](README.md)

## 为什么使用 DataBot

DataBot 适合希望更快完成“提问 -> 分析 -> 输出 -> 自动化”闭环的分析师、数据团队和业务人员：

- 直接用自然语言和数据对话，把查询结果整理成分析结论或报告内容
- 接入多种关系型数据库与上传文件，在一个平台里完成跨源分析
- 通过 `Vibe Flow` 可视化搭建 SQL、Python、LLM、搜索等节点组成的工作流
- 对高频任务配置定时执行，用于日报、周报、监控巡检和周期性处理
- 结合数据字典和知识库，让模型理解业务语义，而不只是机械查询字段

## 功能特性

- **聊天生成分析与报告** — 通过聊天界面与 LLM 交互，使用自然语言查询、分析数据，并输出适合汇报的结论、摘要和报告内容
- **丰富的数据库连接能力** — 通过内置 JDBC Bridge 连接 PostgreSQL、MySQL、SQL Server、Oracle、ClickHouse、Trino、Hive、Spark、TiDB、达梦、人大金仓、SQLite 等多种数据源
- **文件上传分析** — 支持 CSV、Excel 文件上传，可与数据库数据一起分析，适合临时表、离线报表和外部数据补充场景
- **`Vibe Flow` 可视化工作流** — 通过拖拽节点编排 SQL、Python、LLM、Web 搜索等步骤，快速制作可复用的数据流程
- **定时任务管理** — 支持按天、按周、按月或自定义 Cron 表达式调度工作流，将重复性分析和报表任务自动化
- **数据字典** — 管理表和列的元数据描述，帮助 LLM 更准确地理解业务语义与物理字段映射
- **知识库** — 上传和管理参考文档、手册和领域资料，为对话和工作流提供业务上下文
- **沙箱执行** — 在隔离容器中安全执行 Python 代码，满足计算、清洗和加工需求
- **响应式界面** — 同时适配桌面端和移动端浏览器
- **国际化** — 支持中文和英文界面

## 典型使用场景

- **聊天问数并产出报告** — 分析师可直接提问指标变化、异常原因、明细拆解，并快速生成适合同步给业务方的分析结论
- **跨数据库与文件联合分析** — 将数据库中的业务数据与上传的 CSV、Excel 文件结合，完成更灵活的研究和校验
- **`Vibe Flow` 自动化处理** — 数据团队可把 SQL 查询、Python 处理、LLM 总结和外部搜索串联成可复用流程
- **定时任务与周期性运营** — 适合日报、周报、经营监控、异常巡检、邮件通知等需要周期性执行的工作
- **知识增强的数据助手** — 结合知识库和数据字典，让模型输出更贴近企业内部术语、指标口径和业务规则

## 技术架构

| 组件 | 技术栈 | 说明 |
|------|--------|------|
| **Frontend** | Vue 3 + TypeScript + Vite + Element Plus | 单页应用，Pinia 状态管理，vue-i18n 国际化 |
| **Backend** | Express.js v5 + Prisma v7 + PostgreSQL | REST API + WebSocket 实时通信 |
| **Bridge** | Java 22 + Vert.x 4.5 + HikariCP | JDBC 数据库桥接服务，代理外部数据库连接和查询 |
| **Sandbox** | Python | 隔离容器中执行用户代码 |
| **Nginx** | nginx:alpine | 反向代理，前端静态资源托管 |

## 前置条件

- Node.js >= 18
- pnpm
- Java 22 + Maven
- Docker & Docker Compose
- PostgreSQL 13+

## 5 分钟可以完成什么

1. 配置 LLM 模型与一个或多个数据库连接
2. 发起聊天，对指标、异常、趋势或主题进行自然语言分析
3. 上传 CSV 或 Excel 文件，补充外部数据进行联合分析
4. 将分析步骤沉淀为 `Vibe Flow` 工作流，复用 SQL、Python 和 LLM 处理逻辑
5. 为工作流添加定时任务，作为可管理的周期性执行流程

## 快速开始

### 1. 克隆仓库

```bash
git clone <repo-url>
cd databot
```

### 2. 后端配置

```bash
cd backend
cp .env.example .env
# 编辑 .env，配置 ENCRYPTION_KEY（openssl rand -hex 32 生成）
```

### 3. 安装依赖并初始化

```bash
# 后端
cd backend
pnpm install
pnpm prisma generate
pnpm prisma migrate dev

# 前端
cd ../frontend
pnpm install

# Bridge
cd ../bridge
mvn package -DskipTests
```

### 4. 开发模式启动

```bash
# 后端
cd backend && pnpm run dev

# 前端（另开终端）
cd frontend && pnpm run dev
```

### 5. Docker 部署

```bash
cd docker
docker compose up -d
```

服务默认运行在 `http://localhost:18080`。

### 6. 初始使用

系统初始化后会创建默认管理员账号：

- **用户名：** `admin`
- **密码：** `Admin@123`

首次登录后，请前往 **设置** 页面完成以下全局配置：

1. **LLM 模型** — 配置大语言模型连接参数（API Key、Base URL、模型名称等）
2. **网络搜索引擎** — 配置搜索引擎（支持阿里云 IQS、百度搜索、Google 搜索）
3. **SMTP 邮件服务**（可选） — 配置邮件发送服务，用于工作流邮件节点

> 至少需要配置 LLM 模型后才能正常使用对话和数据分析功能。

## 支持的数据源

### 关系型数据库（通过 JDBC 桥接）

| 数据库 | 默认端口 | 备注 |
|--------|---------|------|
| MySQL | 3306 | |
| PostgreSQL | 5432 | |
| MariaDB | 3306 | |
| SQL Server | 1433 | |
| Oracle | 1521 | 支持 SID 和 Service Name 两种连接方式 |
| IBM DB2 | 50000 | |
| SAP HANA | 30015 | |
| ClickHouse | 8123 | 列式 OLAP 数据库 |
| StarRocks | 9030 | MySQL 协议兼容的分析引擎 |
| Trino | 8080 | 分布式 SQL 查询引擎 |
| Presto | 8080 | 分布式 SQL 查询引擎 |
| Apache Spark | 10000 | 通过 HiveServer2 JDBC |
| Apache Hive 2 | 10000 | 通过 HiveServer2 JDBC |
| TiDB | 3306 | MySQL 兼容的分布式数据库 |
| KingBase（人大金仓） | 54321 | PostgreSQL 兼容 |
| Dameng（达梦） | 5236 | 国产数据库 |

### 嵌入式数据库

| 数据库 | 备注 |
|--------|------|
| SQLite | 基于文件或内存，使用 `better-sqlite3` |

### 文件上传

| 格式 | 扩展名 | 备注 |
|------|--------|------|
| CSV | `.csv` | 直接导入 |
| Excel | `.xls`、`.xlsx` | 支持多工作表，每个工作表转换为独立表 |

## 开发命令

```bash
# 前端静态检查 + 编译 + 测试
cd frontend && pnpm run preflight

# 后端静态检查 + 编译 + 测试
cd backend && pnpm run preflight

# Bridge 静态检查 + 编译
cd bridge && mvn spotless:check checkstyle:check compile

# Bridge 自动修复格式
cd bridge && mvn spotless:apply
```
