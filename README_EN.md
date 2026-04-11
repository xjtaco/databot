# DataBot

A data research agent with a web chat interface that integrates LLMs to explore databases and generate reports.

[中文](README.md)

## Features

- **Intelligent Chat** — Interact with LLMs via a chat interface to query and analyze data using natural language
- **Multiple Data Sources** — Support for PostgreSQL, MySQL and other relational databases, plus CSV/Excel file uploads
- **Data Dictionary** — Manage metadata descriptions for tables and columns, helping the LLM accurately understand business semantics
- **Knowledge Base** — Upload and manage reference documents to provide domain knowledge context for the LLM
- **Workflow Engine** — Visual drag-and-drop orchestration of SQL, Python and other nodes with Cron scheduling support
- **Sandbox Execution** — Safely execute Python code in isolated containers
- **Responsive UI** — Adapts to both desktop and mobile browsers
- **Internationalization** — Chinese and English interface support

## Architecture

| Component | Tech Stack | Description |
|-----------|-----------|-------------|
| **Frontend** | Vue 3 + TypeScript + Vite + Element Plus | SPA with Pinia state management and vue-i18n |
| **Backend** | Express.js v5 + Prisma v7 + PostgreSQL | REST API + WebSocket real-time communication |
| **Bridge** | Java 22 + Vert.x 4.5 + HikariCP | JDBC database bridge service proxying external DB connections and queries |
| **Sandbox** | Python | Executes user code in isolated containers |
| **Nginx** | nginx:alpine | Reverse proxy and static asset hosting |

## Prerequisites

- Node.js >= 18
- pnpm
- Java 22 + Maven
- Docker & Docker Compose
- PostgreSQL 13+

## Getting Started

### 1. Clone the Repository

```bash
git clone <repo-url>
cd databot
```

### 2. Backend Configuration

```bash
cd backend
cp .env.example .env
# Edit .env, set ENCRYPTION_KEY (generate with: openssl rand -hex 32)
```

### 3. Install Dependencies and Initialize

```bash
# Backend
cd backend
pnpm install
pnpm prisma generate
pnpm prisma migrate dev

# Frontend
cd ../frontend
pnpm install

# Bridge
cd ../bridge
mvn package -DskipTests
```

### 4. Development Mode

```bash
# Backend
cd backend && pnpm run dev

# Frontend (in another terminal)
cd frontend && pnpm run dev
```

### 5. Docker Deployment

```bash
cd docker
docker compose up -d
```

The application will be available at `http://localhost:18080`.

### 6. Initial Setup

A default admin account is created on first launch:

- **Username:** `admin`
- **Password:** `Admin@123`

After logging in, go to **Settings** to complete the following global configuration:

1. **LLM Model** — Configure LLM connection parameters (API Key, Base URL, model name, etc.)
2. **Web Search Engine** — Configure a search provider (Alibaba Cloud IQS, Baidu Search, or Google Search)
3. **SMTP Email Service** (optional) — Configure email sending for workflow email nodes

> At minimum, the LLM model must be configured before chat and data analysis features can be used.

## Supported Data Sources

### Relational Databases (via JDBC Bridge)

| Database | Default Port | Notes |
|----------|-------------|-------|
| MySQL | 3306 | |
| PostgreSQL | 5432 | |
| MariaDB | 3306 | |
| SQL Server | 1433 | |
| Oracle | 1521 | SID and Service Name supported |
| IBM DB2 | 50000 | |
| SAP HANA | 30015 | |
| ClickHouse | 8123 | Column-oriented OLAP database |
| StarRocks | 9030 | MySQL-compatible analytics engine |
| Trino | 8080 | Distributed SQL query engine |
| Presto | 8080 | Distributed SQL query engine |
| Apache Spark | 10000 | Via HiveServer2 JDBC |
| Apache Hive 2 | 10000 | Via HiveServer2 JDBC |
| TiDB | 3306 | MySQL-compatible distributed database |
| KingBase | 54321 | PostgreSQL-compatible (KingbaseES) |
| Dameng | 5236 | DM Database |

### Embedded Database

| Database | Notes |
|----------|-------|
| SQLite | File-based or in-memory, via `better-sqlite3` |

### File Uploads

| Format | Extensions | Notes |
|--------|-----------|-------|
| CSV | `.csv` | Direct import |
| Excel | `.xls`, `.xlsx` | Multi-sheet support, each sheet converted to a separate table |

## Development Commands

```bash
# Frontend lint + build + test
cd frontend && pnpm run preflight

# Backend lint + build + test
cd backend && pnpm run preflight

# Bridge lint + build
cd bridge && mvn spotless:check checkstyle:check compile

# Bridge auto-fix formatting
cd bridge && mvn spotless:apply
```
