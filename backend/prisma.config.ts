/// <reference types="node" />
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// 从现有的 POSTGRES_* 环境变量构建 DATABASE_URL
const host = process.env['POSTGRES_HOST'] || 'localhost';
const port = process.env['POSTGRES_PORT'] || '5432';
const database = process.env['POSTGRES_DB'] || 'databot';
const user = process.env['POSTGRES_USER'] || 'databot';
const password = process.env['POSTGRES_PASSWORD'] || 'databot';

const databaseUrl = `postgresql://${user}:${password}@${host}:${port}/${database}?schema=public`;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});
