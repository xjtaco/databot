# DataBot

一个具备网页聊天界面的数据研究代理，可通过集成大语言模型（LLM）来探索数据库并生成报告。

[English](README_EN.md)

## 功能特性

- **智能对话** — 通过聊天界面与 LLM 交互，自然语言查询和分析数据
- **多数据源** — 支持 PostgreSQL、MySQL 等关系型数据库，以及 CSV/Excel 文件上传
- **数据字典** — 管理表和列的元数据描述，帮助 LLM 准确理解业务语义
- **知识库** — 上传和管理参考文档，为 LLM 提供领域知识上下文
- **工作流引擎** — 可视化拖拽编排 SQL、Python 等节点，支持 Cron 定时调度
- **沙箱执行** — 在隔离的容器中安全执行 Python 代码
- **响应式界面** — 同时适配桌面端和移动端浏览器
- **国际化** — 支持中文和英文界面

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
