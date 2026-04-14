# DataBot

DataBot is an AI-native data workspace for teams that need to chat with data, generate reports, connect to heterogeneous databases, and automate repeatable analysis with visual workflows. It combines an LLM chat interface, rich database connectivity, knowledge context, and scheduled workflow execution in one web application.

[中文](README_ZH.md)

## Why DataBot

DataBot is designed for analysts, data teams, and business users who want to move from asking questions to producing usable output quickly:

- Chat with your data in natural language and turn answers into structured analysis or report-style output
- Connect to a wide range of relational databases and uploaded files without switching between multiple tools
- Build data tasks visually with `Vibe Flow`, combining SQL, Python, LLM, and search steps into reusable workflows
- Run workflows on demand or on a schedule for recurring reporting, monitoring, and operational tasks
- Add domain knowledge through data dictionaries and knowledge bases so the model can reason with better business context

## Features

- **Chat to Insights and Reports** — Ask questions in natural language, explore data conversationally, and generate report-ready summaries or analysis output from the chat interface
- **Rich Database Connectivity** — Connect to PostgreSQL, MySQL, SQL Server, Oracle, ClickHouse, Trino, Hive, Spark, TiDB, Dameng, KingBase, SQLite, and more through the built-in JDBC bridge
- **File-Based Analysis** — Upload CSV and Excel files, inspect their structure, and analyze them alongside database-backed datasets
- **`Vibe Flow` Workflow Builder** — Build workflows visually with drag-and-drop nodes for SQL, Python, LLM, web search, branching, and other execution steps
- **Scheduling and Task Management** — Configure recurring jobs with daily, weekly, monthly, or raw Cron schedules and manage workflow execution as repeatable tasks
- **Data Dictionary** — Maintain metadata for tables and columns so the LLM can map business terms to physical schema more accurately
- **Knowledge Base** — Upload manuals, SOPs, and domain documents to provide business context during chat and workflow execution
- **Sandbox Execution** — Run Python steps in isolated containers for safer automation and data processing
- **Responsive UI** — Use the system on desktop or mobile browsers
- **Internationalization** — Chinese and English interface support

## Typical Use Cases

- **Analyst Copilot** — Ask cross-table questions, inspect data, and produce draft reports or summaries for stakeholders without manually stitching together SQL and notes
- **Data Team Automation** — Build reusable `Vibe Flow` pipelines for ETL-like tasks, enrichment, quality checks, web lookup, and LLM-assisted post-processing
- **Scheduled Reporting** — Run recurring workflows for morning briefings, weekly KPI summaries, exception monitoring, or departmental report generation
- **Business Knowledge + Data Reasoning** — Combine structured data, uploaded files, and reference documents so the model can answer questions with both numbers and context

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

## What You Can Do in 5 Minutes

1. Connect an LLM provider and one or more databases
2. Start a chat session and ask for a metric breakdown, anomaly explanation, or draft report
3. Upload a CSV or Excel file if part of the analysis lives outside your database
4. Save the logic as a `Vibe Flow` workflow with SQL, Python, and LLM nodes
5. Add a schedule so the workflow runs automatically as a managed recurring task

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
