# User Management & Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user management, JWT authentication, and role-based access control to DataBot so that only authenticated users can access the system.

**Architecture:** Self-built JWT auth (access token in memory + refresh token in httpOnly cookie) on Express.js v5 + Prisma v7 backend. Vue Router for frontend page routing (`/login`, `/change-password`, `/`) with existing state-based `activeNav` navigation preserved inside the main app shell. bcrypt for password hashing, in-memory login rate limiter, separate localhost-only internal server for admin password reset.

**Tech Stack:** Express.js v5, Prisma v7, bcrypt, jsonwebtoken, cookie-parser, Vue 3, Vue Router 4, Pinia, Element Plus, Vitest

**Spec:** `docs/superpowers/specs/2026-04-03-user-auth-design.md`

---

## File Structure

### Backend — New Files

```
backend/src/
├── auth/
│   ├── authService.ts            # JWT sign/verify, password hash/compare, login/refresh/logout logic
│   ├── authRoutes.ts             # /api/auth/* route definitions
│   ├── authController.ts         # Route handlers for auth endpoints
│   ├── authRepository.ts         # User/RefreshToken DB queries for auth
│   ├── authMiddleware.ts         # JWT verification middleware, injects req.user
│   ├── adminOnly.ts              # Admin role check middleware
│   ├── mustChangePassword.ts     # Force password change middleware
│   ├── loginRateLimiter.ts       # In-memory failed login tracking
│   └── adminInit.ts              # Startup: create admin if not exists, backfill createdBy
├── user/
│   ├── userService.ts            # User CRUD, lock/unlock, random password generation
│   ├── userRoutes.ts             # /api/users/* route definitions
│   ├── userController.ts         # Route handlers for user management
│   └── userRepository.ts         # User DB queries for management
├── email/
│   └── emailService.ts           # sendWelcomeEmail using existing SMTP config
├── internal/
│   └── internalServer.ts         # Separate Express on localhost:3001, POST /internal/reset-admin
└── types/
    └── express.d.ts              # Express Request augmentation for req.user

backend/tests/
├── auth/
│   ├── authService.test.ts
│   ├── authController.test.ts
│   ├── authMiddleware.test.ts
│   ├── loginRateLimiter.test.ts
│   └── adminInit.test.ts
├── user/
│   ├── userService.test.ts
│   └── userController.test.ts
└── email/
    └── emailService.test.ts
```

### Backend — Modified Files

```
backend/prisma/schema.prisma          # Add User, RefreshToken models; add createdBy/userId to existing models
backend/src/base/config.ts            # Add jwt, admin, internal config sections
backend/src/errors/errorCode.ts       # Add E00042-E00056
backend/src/errors/types.ts           # Add auth/user error classes
backend/src/globalConfig/globalConfig.types.ts  # Add 'password_policy' to ConfigCategory
backend/src/index.ts                  # Add cookie-parser, auth middleware, internal server startup
backend/src/routes/api.ts             # Mount authRoutes, userRoutes; apply auth middleware
backend/src/agent/websockets.ts       # Add token auth handshake on WS connection
backend/src/globalConfig/globalConfig.routes.ts    # Add password-policy routes
backend/src/globalConfig/globalConfig.service.ts   # Add password policy CRUD
backend/src/globalConfig/globalConfig.controller.ts # Add password policy handlers
backend/.env.example                  # Add JWT_SECRET, ADMIN_INITIAL_PASSWORD, etc.
```

### Frontend — New Files

```
frontend/src/
├── router/
│   └── index.ts                  # Vue Router setup with guards
├── stores/
│   ├── authStore.ts              # Auth state, login/logout/refresh actions
│   └── userManagementStore.ts    # Admin user list CRUD
├── api/
│   ├── auth.ts                   # Auth API calls
│   └── user.ts                   # User management API calls
├── components/
│   ├── auth/
│   │   └── LoginPage.vue         # Login form page
│   ├── user/
│   │   ├── UserManagementPage.vue    # Admin user list + CRUD dialogs
│   │   ├── UserProfileDialog.vue     # Self-service profile edit
│   │   └── ChangePasswordDialog.vue  # Voluntary password change
│   └── settings/
│       └── PasswordPolicyConfig.vue  # Password policy config card
├── pages/
│   └── ChangePasswordPage.vue    # Forced password change page
```

### Frontend — New Test Files

```
frontend/tests/
├── stores/
│   ├── authStore.test.ts
│   └── userManagementStore.test.ts
├── components/
│   └── auth/
│       └── LoginPage.test.ts
```

### Frontend — Modified Files

```
frontend/src/main.ts                              # Register Vue Router
frontend/src/App.vue                              # Use <router-view>
frontend/src/layouts/DesktopLayout.vue            # Add user menu, role-based nav, users page
frontend/src/layouts/MobileLayout.vue             # Same changes for mobile
frontend/src/components/sidebar/IconBar.vue       # Add Users nav item, user menu
frontend/src/utils/http.ts                        # Add auth header interceptor, 401 refresh logic
frontend/src/composables/useWebSocket.ts          # Add auth handshake message
frontend/src/stores/index.ts                      # Export new stores
frontend/src/types/sidebar.ts                     # Extend NavType with 'users'
frontend/src/locales/zh-CN.ts                     # Add auth/user/passwordPolicy i18n keys
frontend/src/locales/en-US.ts                     # Same
frontend/src/styles/index.scss                    # Login page styles (if needed)
frontend/src/components/settings/SettingsPage.vue # Add PasswordPolicyConfig card
frontend/package.json                             # Add vue-router dependency
```

---

## Task 1: Database Schema & Migrations

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add User and RefreshToken models to schema.prisma**

Add after the existing `GlobalConfig` model (around line 96):

```prisma
model User {
  id                 String    @id @default(uuid()) @db.Uuid
  username           String    @unique @db.VarChar(100)
  password           String    @db.VarChar(255)
  name               String?   @db.VarChar(100)
  gender             String?   @db.VarChar(10)
  birthDate          DateTime? @map("birth_date")
  email              String    @unique @db.VarChar(255)
  role               String    @default("user") @db.VarChar(20)
  locked             Boolean   @default(false)
  mustChangePassword Boolean   @default(true) @map("must_change_password")
  createdAt          DateTime  @default(now()) @map("created_at")
  updatedAt          DateTime  @updatedAt @map("updated_at")

  chatSessions        ChatSession[]
  refreshTokens       RefreshToken[]
  createdDatasources  Datasource[]      @relation("DatasourceCreator")
  createdWorkflows    Workflow[]         @relation("WorkflowCreator")
  createdTemplates    CustomNodeTemplate[] @relation("TemplateCreator")
  createdSchedules    WorkflowSchedule[] @relation("ScheduleCreator")

  @@map("users")
}

model RefreshToken {
  id        String   @id @default(uuid()) @db.Uuid
  token     String   @unique @db.VarChar(500)
  userId    String   @map("user_id") @db.Uuid
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([userId])
  @@map("refresh_tokens")
}
```

- [ ] **Step 2: Add createdBy to existing models**

Add to `Datasource` model (after `updatedAt` field):
```prisma
  createdBy  String? @map("created_by") @db.Uuid
  creator    User?   @relation("DatasourceCreator", fields: [createdBy], references: [id])
```

Add to `Workflow` model (after `updatedAt` field):
```prisma
  createdBy  String? @map("created_by") @db.Uuid
  creator    User?   @relation("WorkflowCreator", fields: [createdBy], references: [id])
```

Add to `CustomNodeTemplate` model (after `updatedAt` field):
```prisma
  createdBy  String? @map("created_by") @db.Uuid
  creator    User?   @relation("TemplateCreator", fields: [createdBy], references: [id])
```

Add to `WorkflowSchedule` model (after `updatedAt` field):
```prisma
  createdBy  String? @map("created_by") @db.Uuid
  creator    User?   @relation("ScheduleCreator", fields: [createdBy], references: [id])
```

Add to `ChatSession` model (after `updatedAt` field):
```prisma
  userId  String? @map("user_id") @db.Uuid
  user    User?   @relation(fields: [userId], references: [id])
```

- [ ] **Step 3: Run migration**

```bash
cd backend && pnpm prisma migrate dev --name add-user-auth
```

- [ ] **Step 4: Generate Prisma client**

```bash
cd backend && pnpm prisma generate
```

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/
git commit -m "feat(auth): add User, RefreshToken models and createdBy fields"
```

---

## Task 2: Backend Config, Error Codes & Types

**Files:**
- Modify: `backend/src/base/config.ts`
- Modify: `backend/src/errors/errorCode.ts`
- Modify: `backend/src/errors/types.ts`
- Modify: `backend/.env.example`
- Create: `backend/src/types/express.d.ts`

- [ ] **Step 1: Add auth config to config.ts**

Add new env vars after the existing `bridge` section (around line 57 in `backend/src/base/config.ts`):

```typescript
  jwt: {
    secret: process.env.JWT_SECRET || 'fallback-dev-secret-change-in-production',
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '2h',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  },
  admin: {
    initialPassword: process.env.ADMIN_INITIAL_PASSWORD || 'Admin@123',
    email: process.env.ADMIN_EMAIL || 'admin@localhost',
  },
  internal: {
    port: parseInt(process.env.INTERNAL_PORT || '3001', 10),
  },
```

Add JWT_SECRET validation in `validateConfig()`:
```typescript
  if (config.jwt.secret === 'fallback-dev-secret-change-in-production' && config.env === 'production') {
    console.warn('WARNING: JWT_SECRET is using fallback value in production. Set JWT_SECRET env var.');
  }
```

- [ ] **Step 2: Update .env.example**

Add to `backend/.env.example`:
```env
# Authentication
JWT_SECRET=your-jwt-secret-key-here
JWT_ACCESS_EXPIRES=2h
JWT_REFRESH_EXPIRES=7d
ADMIN_INITIAL_PASSWORD=Admin@123
ADMIN_EMAIL=admin@localhost
INTERNAL_PORT=3001
```

- [ ] **Step 3: Add error codes to errorCode.ts**

Add after the last entry (`DATASOURCE_DUPLICATE: 'E00041'`) in `backend/src/errors/errorCode.ts`:

```typescript
  INVALID_CREDENTIALS: 'E00042',
  ACCOUNT_LOCKED: 'E00043',
  TOKEN_EXPIRED: 'E00044',
  TOKEN_INVALID: 'E00045',
  REFRESH_TOKEN_INVALID: 'E00046',
  MUST_CHANGE_PASSWORD: 'E00047',
  PASSWORD_POLICY_VIOLATION: 'E00048',
  USERNAME_TAKEN: 'E00049',
  EMAIL_TAKEN: 'E00050',
  CANNOT_MODIFY_ADMIN: 'E00051',
  CANNOT_DELETE_ADMIN: 'E00052',
  CANNOT_LOCK_ADMIN: 'E00053',
  UNAUTHORIZED: 'E00054',
  FORBIDDEN: 'E00055',
  SMTP_NOT_CONFIGURED: 'E00056',
  // LAST_USED_CODE: E00056
```

Update the `LAST_USED_CODE` comment.

- [ ] **Step 4: Add auth error types to types.ts**

Add to `backend/src/errors/types.ts`:

```typescript
export class UnauthorizedError extends ApiError {
  constructor(message: string, code: string = ErrorCode.UNAUTHORIZED, details?: unknown, cause?: Error) {
    super(message, code, HttpStatusCode.UNAUTHORIZED, details, cause);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message: string, code: string = ErrorCode.FORBIDDEN, details?: unknown, cause?: Error) {
    super(message, code, HttpStatusCode.FORBIDDEN, details, cause);
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

export class ConflictError extends ApiError {
  constructor(message: string, code: string, details?: unknown, cause?: Error) {
    super(message, code, HttpStatusCode.BAD_REQUEST, details, cause);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class PasswordPolicyError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.PASSWORD_POLICY_VIOLATION, HttpStatusCode.BAD_REQUEST, details, cause);
    Object.setPrototypeOf(this, PasswordPolicyError.prototype);
  }
}
```

- [ ] **Step 5: Add 'password_policy' to ConfigCategory type**

In `backend/src/globalConfig/globalConfig.types.ts`, update the `ConfigCategory` type:

```typescript
export type ConfigCategory = 'llm' | 'web_search' | 'smtp' | 'password_policy';
```

- [ ] **Step 6: Create Express type augmentation**

Create `backend/src/types/express.d.ts`:

```typescript
declare namespace Express {
  interface Request {
    user?: {
      userId: string
      username: string
      role: string
    }
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/base/config.ts backend/src/errors/ backend/src/types/express.d.ts backend/src/globalConfig/globalConfig.types.ts backend/.env.example
git commit -m "feat(auth): add auth config, error codes, types, and Express type augmentation"
```

---

## Task 3: Auth Service — JWT & Password

**Files:**
- Create: `backend/src/auth/authService.ts`
- Create: `backend/src/auth/authRepository.ts`
- Create: `backend/tests/auth/authService.test.ts`

**Dependencies to install first:**
```bash
cd backend && pnpm add bcrypt jsonwebtoken cookie-parser && pnpm add -D @types/bcrypt @types/jsonwebtoken @types/cookie-parser
```

- [ ] **Step 1: Write tests for authService**

Create `backend/tests/auth/authService.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockFindUserByUsername = vi.fn();
const mockFindUserById = vi.fn();
const mockCreateRefreshToken = vi.fn();
const mockFindRefreshToken = vi.fn();
const mockDeleteRefreshToken = vi.fn();
const mockDeleteUserRefreshTokens = vi.fn();
const mockUpdateUserPassword = vi.fn();
const mockUpdateUser = vi.fn();

vi.mock('../../src/auth/authRepository', () => ({
  findUserByUsername: (...args: unknown[]) => mockFindUserByUsername(...args),
  findUserById: (...args: unknown[]) => mockFindUserById(...args),
  createRefreshToken: (...args: unknown[]) => mockCreateRefreshToken(...args),
  findRefreshToken: (...args: unknown[]) => mockFindRefreshToken(...args),
  deleteRefreshToken: (...args: unknown[]) => mockDeleteRefreshToken(...args),
  deleteUserRefreshTokens: (...args: unknown[]) => mockDeleteUserRefreshTokens(...args),
  updateUserPassword: (...args: unknown[]) => mockUpdateUserPassword(...args),
  updateUser: (...args: unknown[]) => mockUpdateUser(...args),
}));

vi.mock('../../src/base/config', () => ({
  config: {
    jwt: { secret: 'test-secret-key-minimum-32-chars!!', accessExpires: '2h', refreshExpires: '7d' },
  },
}));

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hashPassword / comparePassword', () => {
    it('should hash and verify a password', async () => {
      const { hashPassword, comparePassword } = await import('../../src/auth/authService');
      const hash = await hashPassword('MyPassword123!');
      expect(hash).not.toBe('MyPassword123!');
      expect(await comparePassword('MyPassword123!', hash)).toBe(true);
      expect(await comparePassword('wrong', hash)).toBe(false);
    });
  });

  describe('generateAccessToken / verifyAccessToken', () => {
    it('should generate and verify a valid access token', async () => {
      const { generateAccessToken, verifyAccessToken } = await import('../../src/auth/authService');
      const token = generateAccessToken({ userId: 'u1', username: 'admin', role: 'admin' });
      expect(typeof token).toBe('string');
      const payload = verifyAccessToken(token);
      expect(payload.userId).toBe('u1');
      expect(payload.username).toBe('admin');
      expect(payload.role).toBe('admin');
    });

    it('should reject an invalid token', async () => {
      const { verifyAccessToken } = await import('../../src/auth/authService');
      expect(() => verifyAccessToken('invalid-token')).toThrow();
    });
  });

  describe('validatePasswordPolicy', () => {
    it('should reject password shorter than minLength', async () => {
      const { validatePasswordPolicy } = await import('../../src/auth/authService');
      const policy = { minLength: 8, requireUppercase: false, requireLowercase: false, requireNumbers: false, requireSpecialChars: false };
      expect(() => validatePasswordPolicy('short', policy)).toThrow();
    });

    it('should reject missing uppercase when required', async () => {
      const { validatePasswordPolicy } = await import('../../src/auth/authService');
      const policy = { minLength: 1, requireUppercase: true, requireLowercase: false, requireNumbers: false, requireSpecialChars: false };
      expect(() => validatePasswordPolicy('nouppercase', policy)).toThrow();
    });

    it('should accept a valid password', async () => {
      const { validatePasswordPolicy } = await import('../../src/auth/authService');
      const policy = { minLength: 8, requireUppercase: true, requireLowercase: true, requireNumbers: true, requireSpecialChars: true };
      expect(() => validatePasswordPolicy('MyPass123!', policy)).not.toThrow();
    });
  });

  describe('generateRandomPassword', () => {
    it('should generate a password meeting default policy', async () => {
      const { generateRandomPassword } = await import('../../src/auth/authService');
      const pwd = generateRandomPassword();
      expect(pwd.length).toBeGreaterThanOrEqual(12);
      expect(/[A-Z]/.test(pwd)).toBe(true);
      expect(/[a-z]/.test(pwd)).toBe(true);
      expect(/[0-9]/.test(pwd)).toBe(true);
      expect(/[!@#$%^&*]/.test(pwd)).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pnpm vitest run tests/auth/authService.test.ts
```
Expected: FAIL (modules not found)

- [ ] **Step 3: Create authRepository.ts**

Create `backend/src/auth/authRepository.ts`:

```typescript
import { getPrismaClient } from '../infrastructure/database';
import type { User, RefreshToken } from '@prisma/client';

export async function findUserByUsername(username: string): Promise<User | null> {
  const prisma = getPrismaClient();
  return prisma.user.findUnique({ where: { username } });
}

export async function findUserById(id: string): Promise<User | null> {
  const prisma = getPrismaClient();
  return prisma.user.findUnique({ where: { id } });
}

export async function createRefreshToken(userId: string, token: string, expiresAt: Date): Promise<RefreshToken> {
  const prisma = getPrismaClient();
  return prisma.refreshToken.create({ data: { userId, token, expiresAt } });
}

export async function findRefreshToken(token: string): Promise<(RefreshToken & { user: User }) | null> {
  const prisma = getPrismaClient();
  return prisma.refreshToken.findUnique({
    where: { token },
    include: { user: true },
  });
}

export async function deleteRefreshToken(token: string): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.refreshToken.deleteMany({ where: { token } });
}

export async function deleteUserRefreshTokens(userId: string): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.refreshToken.deleteMany({ where: { userId } });
}

export async function updateUserPassword(userId: string, passwordHash: string, mustChangePassword: boolean): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.user.update({
    where: { id: userId },
    data: { password: passwordHash, mustChangePassword },
  });
}

export async function updateUser(userId: string, data: { name?: string; gender?: string; birthDate?: Date | null; email?: string }): Promise<User> {
  const prisma = getPrismaClient();
  return prisma.user.update({ where: { id: userId }, data });
}
```

- [ ] **Step 4: Create authService.ts**

Create `backend/src/auth/authService.ts`:

```typescript
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../base/config';
import { UnauthorizedError, ForbiddenError, ValidationError, PasswordPolicyError } from '../errors/types';
import { ErrorCode } from '../errors/errorCode';
import logger from '../utils/logger';
import * as authRepo from './authRepository';

const SALT_ROUNDS = 12;

export interface TokenPayload {
  userId: string;
  username: string;
  role: string;
}

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.accessExpires });
}

export function verifyAccessToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, config.jwt.secret) as TokenPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Access token expired', ErrorCode.TOKEN_EXPIRED);
    }
    throw new UnauthorizedError('Invalid access token', ErrorCode.TOKEN_INVALID);
  }
}

export function generateRefreshTokenString(): string {
  return crypto.randomBytes(40).toString('hex');
}

export function parseRefreshExpires(): number {
  const match = config.jwt.refreshExpires.match(/^(\d+)([dhms])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7 days
  const num = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = { d: 86400000, h: 3600000, m: 60000, s: 1000 };
  return num * (multipliers[unit] || 86400000);
}

export async function login(username: string, password: string): Promise<{
  accessToken: string;
  refreshToken: string;
  user: { id: string; username: string; name: string | null; role: string; mustChangePassword: boolean };
}> {
  const user = await authRepo.findUserByUsername(username);
  if (!user) {
    throw new UnauthorizedError('Invalid credentials', ErrorCode.INVALID_CREDENTIALS);
  }
  if (user.locked) {
    throw new ForbiddenError('Account is locked', ErrorCode.ACCOUNT_LOCKED);
  }
  const valid = await comparePassword(password, user.password);
  if (!valid) {
    throw new UnauthorizedError('Invalid credentials', ErrorCode.INVALID_CREDENTIALS);
  }

  const accessToken = generateAccessToken({ userId: user.id, username: user.username, role: user.role });
  const refreshTokenStr = generateRefreshTokenString();
  const expiresAt = new Date(Date.now() + parseRefreshExpires());
  await authRepo.createRefreshToken(user.id, refreshTokenStr, expiresAt);

  logger.info('User logged in', { userId: user.id, username: user.username });

  return {
    accessToken,
    refreshToken: refreshTokenStr,
    user: { id: user.id, username: user.username, name: user.name, role: user.role, mustChangePassword: user.mustChangePassword },
  };
}

export async function refresh(oldToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const record = await authRepo.findRefreshToken(oldToken);
  if (!record || record.expiresAt < new Date()) {
    throw new UnauthorizedError('Invalid or expired refresh token', ErrorCode.REFRESH_TOKEN_INVALID);
  }
  if (record.user.locked) {
    await authRepo.deleteRefreshToken(oldToken);
    throw new ForbiddenError('Account is locked', ErrorCode.ACCOUNT_LOCKED);
  }

  // Rotate: delete old, create new
  await authRepo.deleteRefreshToken(oldToken);
  const newTokenStr = generateRefreshTokenString();
  const expiresAt = new Date(Date.now() + parseRefreshExpires());
  await authRepo.createRefreshToken(record.userId, newTokenStr, expiresAt);

  const accessToken = generateAccessToken({
    userId: record.user.id,
    username: record.user.username,
    role: record.user.role,
  });

  return { accessToken, refreshToken: newTokenStr };
}

export async function logout(refreshToken: string): Promise<void> {
  await authRepo.deleteRefreshToken(refreshToken);
}

export async function changePassword(userId: string, oldPassword: string, newPassword: string, policy: PasswordPolicy): Promise<void> {
  const user = await authRepo.findUserById(userId);
  if (!user) {
    throw new UnauthorizedError('User not found', ErrorCode.INVALID_CREDENTIALS);
  }
  const valid = await comparePassword(oldPassword, user.password);
  if (!valid) {
    throw new ValidationError('Old password is incorrect');
  }
  validatePasswordPolicy(newPassword, policy);
  const hash = await hashPassword(newPassword);
  await authRepo.updateUserPassword(userId, hash, false);
  logger.info('User changed password', { userId });
}

export function validatePasswordPolicy(password: string, policy: PasswordPolicy): void {
  const errors: string[] = [];
  if (password.length < policy.minLength) {
    errors.push(`Password must be at least ${policy.minLength} characters`);
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (policy.requireNumbers && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (policy.requireSpecialChars && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  if (errors.length > 0) {
    throw new PasswordPolicyError(errors.join('; '));
  }
}

export function generateRandomPassword(length: number = 16): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '!@#$%^&*';
  const all = upper + lower + digits + special;

  // Ensure at least one of each required type
  let password = '';
  password += upper[crypto.randomInt(upper.length)];
  password += lower[crypto.randomInt(lower.length)];
  password += digits[crypto.randomInt(digits.length)];
  password += special[crypto.randomInt(special.length)];

  for (let i = password.length; i < length; i++) {
    password += all[crypto.randomInt(all.length)];
  }

  // Shuffle
  return password.split('').sort(() => crypto.randomInt(3) - 1).join('');
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && pnpm vitest run tests/auth/authService.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/auth/authService.ts backend/src/auth/authRepository.ts backend/tests/auth/authService.test.ts backend/package.json backend/pnpm-lock.yaml
git commit -m "feat(auth): add auth service with JWT, bcrypt, and password policy"
```

---

## Task 4: Auth Middleware

**Files:**
- Create: `backend/src/auth/authMiddleware.ts`
- Create: `backend/src/auth/adminOnly.ts`
- Create: `backend/src/auth/mustChangePassword.ts`
- Create: `backend/tests/auth/authMiddleware.test.ts`

- [ ] **Step 1: Write tests for auth middleware**

Create `backend/tests/auth/authMiddleware.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockVerifyAccessToken = vi.fn();
vi.mock('../../src/auth/authService', () => ({
  verifyAccessToken: (...args: unknown[]) => mockVerifyAccessToken(...args),
}));

function createMockReqRes(headers: Record<string, string> = {}) {
  const req = { headers, user: undefined } as unknown as Request;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

describe('authMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should set req.user and call next for valid token', async () => {
    const { authMiddleware } = await import('../../src/auth/authMiddleware');
    const payload = { userId: 'u1', username: 'admin', role: 'admin' };
    mockVerifyAccessToken.mockReturnValue(payload);

    const { req, res, next } = createMockReqRes({ authorization: 'Bearer valid-token' });
    await authMiddleware(req, res, next);

    expect(req.user).toEqual(payload);
    expect(next).toHaveBeenCalled();
  });

  it('should throw for missing Authorization header', async () => {
    const { authMiddleware } = await import('../../src/auth/authMiddleware');
    const { req, res, next } = createMockReqRes();

    await expect(authMiddleware(req, res, next)).rejects.toThrow();
  });
});

describe('adminOnly', () => {
  it('should call next for admin user', async () => {
    const { adminOnly } = await import('../../src/auth/adminOnly');
    const req = { user: { userId: 'u1', username: 'admin', role: 'admin' } } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    adminOnly(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should throw for non-admin user', async () => {
    const { adminOnly } = await import('../../src/auth/adminOnly');
    const req = { user: { userId: 'u2', username: 'user1', role: 'user' } } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    expect(() => adminOnly(req, res, next)).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pnpm vitest run tests/auth/authMiddleware.test.ts
```

- [ ] **Step 3: Create authMiddleware.ts**

Create `backend/src/auth/authMiddleware.ts`:

```typescript
import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from './authService';
import { UnauthorizedError } from '../errors/types';
import { ErrorCode } from '../errors/errorCode';

export async function authMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid Authorization header', ErrorCode.UNAUTHORIZED);
  }

  const token = authHeader.slice(7);
  const payload = verifyAccessToken(token);
  req.user = payload;
  next();
}
```

- [ ] **Step 4: Create adminOnly.ts**

Create `backend/src/auth/adminOnly.ts`:

```typescript
import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../errors/types';
import { ErrorCode } from '../errors/errorCode';

export function adminOnly(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    throw new ForbiddenError('Admin access required', ErrorCode.FORBIDDEN);
  }
  next();
}
```

- [ ] **Step 5: Create mustChangePassword.ts**

Create `backend/src/auth/mustChangePassword.ts`:

```typescript
import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../errors/types';
import { ErrorCode } from '../errors/errorCode';
import { findUserById } from './authRepository';

const EXEMPT_PATHS = ['/api/auth/change-password', '/api/auth/logout'];

export async function mustChangePasswordCheck(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    next();
    return;
  }

  if (EXEMPT_PATHS.includes(req.path)) {
    next();
    return;
  }

  const user = await findUserById(req.user.userId);
  if (user?.mustChangePassword) {
    throw new ForbiddenError('Password change required', ErrorCode.MUST_CHANGE_PASSWORD);
  }

  next();
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd backend && pnpm vitest run tests/auth/authMiddleware.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/auth/authMiddleware.ts backend/src/auth/adminOnly.ts backend/src/auth/mustChangePassword.ts backend/tests/auth/authMiddleware.test.ts
git commit -m "feat(auth): add auth, adminOnly, and mustChangePassword middleware"
```

---

## Task 5: Login Rate Limiter

**Files:**
- Create: `backend/src/auth/loginRateLimiter.ts`
- Create: `backend/tests/auth/loginRateLimiter.test.ts`

- [ ] **Step 1: Write tests**

Create `backend/tests/auth/loginRateLimiter.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('loginRateLimiter', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { resetAllLimits } = await import('../../src/auth/loginRateLimiter');
    resetAllLimits();
  });

  it('should allow login on first attempt', async () => {
    const { checkRateLimit } = await import('../../src/auth/loginRateLimiter');
    expect(() => checkRateLimit('testuser')).not.toThrow();
  });

  it('should allow up to 5 failed attempts', async () => {
    const { checkRateLimit, recordFailedAttempt } = await import('../../src/auth/loginRateLimiter');
    for (let i = 0; i < 5; i++) {
      recordFailedAttempt('testuser');
    }
    expect(() => checkRateLimit('testuser')).toThrow();
  });

  it('should reset after successful login', async () => {
    const { checkRateLimit, recordFailedAttempt, recordSuccessfulLogin } = await import('../../src/auth/loginRateLimiter');
    for (let i = 0; i < 4; i++) {
      recordFailedAttempt('testuser');
    }
    recordSuccessfulLogin('testuser');
    expect(() => checkRateLimit('testuser')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pnpm vitest run tests/auth/loginRateLimiter.test.ts
```

- [ ] **Step 3: Implement loginRateLimiter.ts**

Create `backend/src/auth/loginRateLimiter.ts`:

```typescript
import { ApiError } from '../errors/types';
import { ErrorCode } from '../errors/errorCode';
import { HttpStatusCode } from '../base/types';
import logger from '../utils/logger';

interface AttemptRecord {
  count: number;
  lockedUntil: number | null;
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const attempts = new Map<string, AttemptRecord>();

export function checkRateLimit(username: string): void {
  const record = attempts.get(username);
  if (!record) return;

  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const remainingMs = record.lockedUntil - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    throw new ApiError(
      `Too many failed attempts. Try again in ${remainingMin} minutes.`,
      ErrorCode.RATE_LIMIT_EXCEEDED,
      HttpStatusCode.TOO_MANY_REQUESTS
    );
  }

  // Lockout expired, reset
  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    attempts.delete(username);
  }
}

export function recordFailedAttempt(username: string): void {
  const record = attempts.get(username) || { count: 0, lockedUntil: null };
  record.count += 1;
  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    logger.warn('Login rate limit triggered', { username, lockoutMinutes: 15 });
  }
  attempts.set(username, record);
}

export function recordSuccessfulLogin(username: string): void {
  attempts.delete(username);
}

export function resetAllLimits(): void {
  attempts.clear();
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && pnpm vitest run tests/auth/loginRateLimiter.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth/loginRateLimiter.ts backend/tests/auth/loginRateLimiter.test.ts
git commit -m "feat(auth): add in-memory login rate limiter"
```

---

## Task 6: Auth Routes & Controller

**Files:**
- Create: `backend/src/auth/authController.ts`
- Create: `backend/src/auth/authRoutes.ts`

- [ ] **Step 1: Create authController.ts**

Create `backend/src/auth/authController.ts`:

```typescript
import type { Request, Response } from 'express';
import { HttpStatusCode } from '../base/types';
import { ValidationError } from '../errors/types';
import * as authService from './authService';
import * as authRepo from './authRepository';
import { checkRateLimit, recordFailedAttempt, recordSuccessfulLogin } from './loginRateLimiter';
import { getPasswordPolicy } from './passwordPolicyHelper';
import { UnauthorizedError } from '../errors/types';
import { ErrorCode } from '../errors/errorCode';
import logger from '../utils/logger';

function getRefreshTokenCookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/api/auth',
    maxAge: maxAgeMs,
  };
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    throw new ValidationError('Username and password are required');
  }

  checkRateLimit(username);

  try {
    const result = await authService.login(username, password);
    recordSuccessfulLogin(username);

    const maxAge = authService.parseRefreshExpires();
    res.cookie('refreshToken', result.refreshToken, getRefreshTokenCookieOptions(maxAge));
    res.json({ accessToken: result.accessToken, user: result.user });
  } catch (err) {
    if (err instanceof UnauthorizedError && err.code === ErrorCode.INVALID_CREDENTIALS) {
      recordFailedAttempt(username);
    }
    throw err;
  }
}

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  const oldToken = req.cookies?.refreshToken as string | undefined;
  if (!oldToken) {
    throw new UnauthorizedError('Refresh token not found', ErrorCode.REFRESH_TOKEN_INVALID);
  }

  const result = await authService.refresh(oldToken);
  const maxAge = authService.parseRefreshExpires();
  res.cookie('refreshToken', result.refreshToken, getRefreshTokenCookieOptions(maxAge));
  res.json({ accessToken: result.accessToken });
}

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.refreshToken as string | undefined;
  if (token) {
    await authService.logout(token);
  }
  res.clearCookie('refreshToken', { path: '/api/auth' });
  res.json({ success: true });
}

export async function changePasswordHandler(req: Request, res: Response): Promise<void> {
  const { oldPassword, newPassword } = req.body as { oldPassword?: string; newPassword?: string };
  if (!oldPassword || !newPassword) {
    throw new ValidationError('Old password and new password are required');
  }
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated', ErrorCode.UNAUTHORIZED);
  }

  const policy = await getPasswordPolicy();
  await authService.changePassword(req.user.userId, oldPassword, newPassword, policy);
  res.json({ success: true });
}

export async function getProfileHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated', ErrorCode.UNAUTHORIZED);
  }
  const user = await authRepo.findUserById(req.user.userId);
  if (!user) {
    throw new UnauthorizedError('User not found', ErrorCode.UNAUTHORIZED);
  }
  res.json({
    id: user.id,
    username: user.username,
    name: user.name,
    gender: user.gender,
    birthDate: user.birthDate,
    email: user.email,
    role: user.role,
  });
}

export async function updateProfileHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated', ErrorCode.UNAUTHORIZED);
  }
  const { name, gender, birthDate, email } = req.body as {
    name?: string;
    gender?: string;
    birthDate?: string;
    email?: string;
  };

  const updateData: { name?: string; gender?: string; birthDate?: Date | null; email?: string } = {};
  if (name !== undefined) updateData.name = name;
  if (gender !== undefined) updateData.gender = gender;
  if (birthDate !== undefined) updateData.birthDate = birthDate ? new Date(birthDate) : null;
  if (email !== undefined) updateData.email = email;

  const updated = await authRepo.updateUser(req.user.userId, updateData);
  res.json({
    id: updated.id,
    username: updated.username,
    name: updated.name,
    gender: updated.gender,
    birthDate: updated.birthDate,
    email: updated.email,
    role: updated.role,
  });
}
```

- [ ] **Step 2: Create password policy helper**

Create `backend/src/auth/passwordPolicyHelper.ts`:

```typescript
import { getConfigsByCategory } from '../globalConfig/globalConfig.repository';
import { DEFAULT_PASSWORD_POLICY, type PasswordPolicy } from './authService';

export async function getPasswordPolicy(): Promise<PasswordPolicy> {
  const rows = await getConfigsByCategory('password_policy');
  if (rows.length === 0) return DEFAULT_PASSWORD_POLICY;

  const configMap = new Map(rows.map((r) => [r.configKey, r.configValue]));
  return {
    minLength: parseInt(configMap.get('minLength') || String(DEFAULT_PASSWORD_POLICY.minLength), 10),
    requireUppercase: configMap.get('requireUppercase') === 'true',
    requireLowercase: configMap.get('requireLowercase') === 'true',
    requireNumbers: configMap.get('requireNumbers') === 'true',
    requireSpecialChars: configMap.get('requireSpecialChars') === 'true',
  };
}
```

- [ ] **Step 3: Create authRoutes.ts**

Create `backend/src/auth/authRoutes.ts`:

```typescript
import { Router } from 'express';
import { authMiddleware } from './authMiddleware';
import {
  loginHandler,
  refreshHandler,
  logoutHandler,
  changePasswordHandler,
  getProfileHandler,
  updateProfileHandler,
} from './authController';

const router = Router();

// Public routes
router.post('/login', loginHandler);
router.post('/refresh', refreshHandler);

// Authenticated routes
router.post('/logout', authMiddleware, logoutHandler);
router.put('/change-password', authMiddleware, changePasswordHandler);
router.get('/profile', authMiddleware, getProfileHandler);
router.put('/profile', authMiddleware, updateProfileHandler);

export default router;
```

- [ ] **Step 4: Create authController tests**

Create `backend/tests/auth/authController.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockLogin = vi.fn();
const mockRefresh = vi.fn();
const mockLogout = vi.fn();
vi.mock('../../src/auth/authService', () => ({
  login: (...args: unknown[]) => mockLogin(...args),
  refresh: (...args: unknown[]) => mockRefresh(...args),
  logout: (...args: unknown[]) => mockLogout(...args),
  parseRefreshExpires: () => 7 * 24 * 60 * 60 * 1000,
}));

vi.mock('../../src/auth/loginRateLimiter', () => ({
  checkRateLimit: vi.fn(),
  recordFailedAttempt: vi.fn(),
  recordSuccessfulLogin: vi.fn(),
}));

vi.mock('../../src/auth/passwordPolicyHelper', () => ({
  getPasswordPolicy: vi.fn().mockResolvedValue({ minLength: 8, requireUppercase: true, requireLowercase: true, requireNumbers: true, requireSpecialChars: true }),
}));

describe('authController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loginHandler should return accessToken and set cookie on success', async () => {
    mockLogin.mockResolvedValue({
      accessToken: 'token-123',
      refreshToken: 'refresh-456',
      user: { id: 'u1', username: 'admin', name: null, role: 'admin', mustChangePassword: false },
    });

    const { loginHandler } = await import('../../src/auth/authController');
    const req = { body: { username: 'admin', password: 'pass' } } as never;
    const cookie = vi.fn();
    const json = vi.fn();
    const res = { cookie, json } as never;

    await loginHandler(req, res);
    expect(cookie).toHaveBeenCalledWith('refreshToken', 'refresh-456', expect.any(Object));
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'token-123' }));
  });
});
```

- [ ] **Step 5: Run tests**

```bash
cd backend && pnpm vitest run tests/auth/authController.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/auth/authController.ts backend/src/auth/authRoutes.ts backend/src/auth/passwordPolicyHelper.ts backend/tests/auth/authController.test.ts
git commit -m "feat(auth): add auth controller, routes, and password policy helper"
```

---

## Task 7: Admin Initialization & Internal Reset Server

**Files:**
- Create: `backend/src/auth/adminInit.ts`
- Create: `backend/src/internal/internalServer.ts`
- Create: `backend/tests/auth/adminInit.test.ts`

- [ ] **Step 1: Write tests for adminInit**

Create `backend/tests/auth/adminInit.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockFindFirst = vi.fn();
const mockCreate = vi.fn();
const mockUpdateMany = vi.fn();

vi.mock('../../src/infrastructure/database', () => ({
  getPrismaClient: () => ({
    user: { findFirst: mockFindFirst, create: mockCreate },
    datasource: { updateMany: mockUpdateMany },
    workflow: { updateMany: mockUpdateMany },
    customNodeTemplate: { updateMany: mockUpdateMany },
    workflowSchedule: { updateMany: mockUpdateMany },
    chatSession: { updateMany: mockUpdateMany },
  }),
}));

vi.mock('../../src/auth/authService', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed-password'),
}));

vi.mock('../../src/base/config', () => ({
  config: {
    admin: { initialPassword: 'Admin@123', email: 'admin@localhost' },
  },
}));

describe('adminInit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create admin user when none exists', async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 'admin-id', username: 'admin' });

    const { initializeAdmin } = await import('../../src/auth/adminInit');
    await initializeAdmin();

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        username: 'admin',
        role: 'admin',
        mustChangePassword: true,
      }),
    });
  });

  it('should skip creation when admin already exists', async () => {
    mockFindFirst.mockResolvedValue({ id: 'existing-admin', username: 'admin' });

    const { initializeAdmin } = await import('../../src/auth/adminInit');
    await initializeAdmin();

    expect(mockCreate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pnpm vitest run tests/auth/adminInit.test.ts
```

- [ ] **Step 3: Create adminInit.ts**

Create `backend/src/auth/adminInit.ts`:

```typescript
import { getPrismaClient } from '../infrastructure/database';
import { hashPassword } from './authService';
import { config } from '../base/config';
import logger from '../utils/logger';

export async function initializeAdmin(): Promise<void> {
  const prisma = getPrismaClient();

  const existing = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (existing) {
    logger.info('Admin user already exists, skipping initialization');
    await backfillCreatedBy(existing.id);
    return;
  }

  const passwordHash = await hashPassword(config.admin.initialPassword);
  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      password: passwordHash,
      email: config.admin.email,
      role: 'admin',
      mustChangePassword: true,
    },
  });

  logger.info('Admin user created', { userId: admin.id });
  await backfillCreatedBy(admin.id);
}

async function backfillCreatedBy(adminId: string): Promise<void> {
  const prisma = getPrismaClient();

  const results = await Promise.all([
    prisma.datasource.updateMany({ where: { createdBy: null }, data: { createdBy: adminId } }),
    prisma.workflow.updateMany({ where: { createdBy: null }, data: { createdBy: adminId } }),
    prisma.customNodeTemplate.updateMany({ where: { createdBy: null }, data: { createdBy: adminId } }),
    prisma.workflowSchedule.updateMany({ where: { createdBy: null }, data: { createdBy: adminId } }),
    prisma.chatSession.updateMany({ where: { userId: null }, data: { userId: adminId } }),
  ]);

  const total = results.reduce((sum, r) => sum + r.count, 0);
  if (total > 0) {
    logger.info('Backfilled createdBy/userId for existing records', { total });
  }
}
```

- [ ] **Step 4: Create internalServer.ts**

Create `backend/src/internal/internalServer.ts`:

```typescript
import express from 'express';
import { getPrismaClient } from '../infrastructure/database';
import { hashPassword } from '../auth/authService';
import { config } from '../base/config';
import logger from '../utils/logger';

export function startInternalServer(): void {
  const app = express();
  app.use(express.json());

  app.post('/internal/reset-admin', async (_req, res) => {
    try {
      const prisma = getPrismaClient();
      const admin = await prisma.user.findFirst({ where: { role: 'admin' } });
      if (!admin) {
        res.status(404).json({ error: 'Admin user not found' });
        return;
      }

      const passwordHash = await hashPassword(config.admin.initialPassword);
      await prisma.user.update({
        where: { id: admin.id },
        data: { password: passwordHash, mustChangePassword: true },
      });
      await prisma.refreshToken.deleteMany({ where: { userId: admin.id } });

      logger.info('Admin password reset via internal endpoint', { userId: admin.id });
      res.json({ success: true, message: 'Admin password has been reset' });
    } catch (err) {
      logger.error('Failed to reset admin password', { error: err });
      res.status(500).json({ error: 'Internal error' });
    }
  });

  app.listen(config.internal.port, '127.0.0.1', () => {
    logger.info(`Internal server listening on 127.0.0.1:${config.internal.port}`);
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && pnpm vitest run tests/auth/adminInit.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/auth/adminInit.ts backend/src/internal/internalServer.ts backend/tests/auth/adminInit.test.ts
git commit -m "feat(auth): add admin initialization and internal reset server"
```

---

## Task 8: User Management Service & Routes

**Files:**
- Create: `backend/src/user/userService.ts`
- Create: `backend/src/user/userRepository.ts`
- Create: `backend/src/user/userController.ts`
- Create: `backend/src/user/userRoutes.ts`
- Create: `backend/tests/user/userService.test.ts`

- [ ] **Step 1: Write tests for userService**

Create `backend/tests/user/userService.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockCreateUser = vi.fn();
const mockFindUserByUsername = vi.fn();
const mockFindUserByEmail = vi.fn();
const mockFindUserById = vi.fn();
const mockListUsers = vi.fn();
const mockUpdateUser = vi.fn();
const mockDeleteUser = vi.fn();
const mockCountUsers = vi.fn();

vi.mock('../../src/user/userRepository', () => ({
  createUser: (...args: unknown[]) => mockCreateUser(...args),
  findUserByUsername: (...args: unknown[]) => mockFindUserByUsername(...args),
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
  findUserById: (...args: unknown[]) => mockFindUserById(...args),
  listUsers: (...args: unknown[]) => mockListUsers(...args),
  updateUser: (...args: unknown[]) => mockUpdateUser(...args),
  deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
  countUsers: (...args: unknown[]) => mockCountUsers(...args),
}));

vi.mock('../../src/auth/authService', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed'),
  generateRandomPassword: vi.fn().mockReturnValue('RandomPass1!'),
}));

vi.mock('../../src/email/emailService', () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue(true),
}));

describe('userService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a user with random password', async () => {
    mockFindUserByUsername.mockResolvedValue(null);
    mockFindUserByEmail.mockResolvedValue(null);
    mockCreateUser.mockResolvedValue({ id: 'u1', username: 'newuser', email: 'test@test.com' });

    const { createUserWithRandomPassword } = await import('../../src/user/userService');
    const result = await createUserWithRandomPassword({
      username: 'newuser',
      email: 'test@test.com',
    });

    expect(result.user.username).toBe('newuser');
    expect(mockCreateUser).toHaveBeenCalled();
  });

  it('should reject duplicate username', async () => {
    mockFindUserByUsername.mockResolvedValue({ id: 'existing' });

    const { createUserWithRandomPassword } = await import('../../src/user/userService');
    await expect(
      createUserWithRandomPassword({ username: 'existing', email: 'test@test.com' })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pnpm vitest run tests/user/userService.test.ts
```

- [ ] **Step 3: Create userRepository.ts**

Create `backend/src/user/userRepository.ts`:

```typescript
import { getPrismaClient } from '../infrastructure/database';
import type { User } from '@prisma/client';

export async function createUser(data: {
  username: string;
  password: string;
  email: string;
  name?: string;
  gender?: string;
  birthDate?: Date;
}): Promise<User> {
  const prisma = getPrismaClient();
  return prisma.user.create({ data: { ...data, mustChangePassword: true } });
}

export async function findUserByUsername(username: string): Promise<User | null> {
  const prisma = getPrismaClient();
  return prisma.user.findUnique({ where: { username } });
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const prisma = getPrismaClient();
  return prisma.user.findUnique({ where: { email } });
}

export async function findUserById(id: string): Promise<User | null> {
  const prisma = getPrismaClient();
  return prisma.user.findUnique({ where: { id } });
}

export async function listUsers(page: number, pageSize: number, search?: string): Promise<User[]> {
  const prisma = getPrismaClient();
  const where = search
    ? {
        OR: [
          { username: { contains: search, mode: 'insensitive' as const } },
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};
  return prisma.user.findMany({
    where,
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: { createdAt: 'desc' },
    omit: { password: true },
  });
}

export async function countUsers(search?: string): Promise<number> {
  const prisma = getPrismaClient();
  const where = search
    ? {
        OR: [
          { username: { contains: search, mode: 'insensitive' as const } },
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};
  return prisma.user.count({ where });
}

export async function updateUser(id: string, data: {
  name?: string;
  gender?: string;
  birthDate?: Date | null;
  email?: string;
  locked?: boolean;
}): Promise<User> {
  const prisma = getPrismaClient();
  return prisma.user.update({ where: { id }, data });
}

export async function deleteUser(id: string): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.user.delete({ where: { id } });
}

export async function reassignUserResources(userId: string, newOwnerId: string): Promise<void> {
  const prisma = getPrismaClient();
  await Promise.all([
    prisma.datasource.updateMany({ where: { createdBy: userId }, data: { createdBy: newOwnerId } }),
    prisma.workflow.updateMany({ where: { createdBy: userId }, data: { createdBy: newOwnerId } }),
    prisma.customNodeTemplate.updateMany({ where: { createdBy: userId }, data: { createdBy: newOwnerId } }),
    prisma.workflowSchedule.updateMany({ where: { createdBy: userId }, data: { createdBy: newOwnerId } }),
  ]);
}

export async function deleteUserChatSessions(userId: string): Promise<void> {
  const prisma = getPrismaClient();
  // ChatMessage cascades from ChatSession deletion
  await prisma.chatSession.deleteMany({ where: { userId } });
}
```

- [ ] **Step 4: Create userService.ts**

Create `backend/src/user/userService.ts`:

```typescript
import { ConflictError, ForbiddenError, ValidationError } from '../errors/types';
import { ErrorCode } from '../errors/errorCode';
import { hashPassword, generateRandomPassword } from '../auth/authService';
import { deleteUserRefreshTokens } from '../auth/authRepository';
import { sendWelcomeEmail } from '../email/emailService';
import * as userRepo from './userRepository';
import logger from '../utils/logger';

export async function createUserWithRandomPassword(data: {
  username: string;
  email: string;
  name?: string;
  gender?: string;
  birthDate?: string;
}): Promise<{ user: { id: string; username: string; email: string }; passwordSent: boolean; tempPassword?: string }> {
  if (!data.username || !data.email) {
    throw new ValidationError('Username and email are required');
  }

  const existingUsername = await userRepo.findUserByUsername(data.username);
  if (existingUsername) {
    throw new ConflictError('Username already taken', ErrorCode.USERNAME_TAKEN);
  }

  const existingEmail = await userRepo.findUserByEmail(data.email);
  if (existingEmail) {
    throw new ConflictError('Email already taken', ErrorCode.EMAIL_TAKEN);
  }

  const randomPassword = generateRandomPassword();
  const passwordHash = await hashPassword(randomPassword);

  const user = await userRepo.createUser({
    username: data.username,
    email: data.email,
    password: passwordHash,
    name: data.name,
    gender: data.gender,
    birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
  });

  const emailSent = await sendWelcomeEmail(data.email, data.username, randomPassword);

  logger.info('User created', { userId: user.id, username: user.username, emailSent });

  return {
    user: { id: user.id, username: user.username, email: user.email },
    passwordSent: emailSent,
    tempPassword: emailSent ? undefined : randomPassword,
  };
}

export async function lockUser(userId: string): Promise<void> {
  const user = await userRepo.findUserById(userId);
  if (!user) throw new ValidationError('User not found');
  if (user.role === 'admin') throw new ForbiddenError('Cannot lock admin user', ErrorCode.CANNOT_LOCK_ADMIN);

  await userRepo.updateUser(userId, { locked: true });
  await deleteUserRefreshTokens(userId);
  logger.info('User locked', { userId });
}

export async function unlockUser(userId: string): Promise<void> {
  await userRepo.updateUser(userId, { locked: false });
  logger.info('User unlocked', { userId });
}

export async function deleteUserById(userId: string, adminId: string): Promise<void> {
  const user = await userRepo.findUserById(userId);
  if (!user) throw new ValidationError('User not found');
  if (user.role === 'admin') throw new ForbiddenError('Cannot delete admin user', ErrorCode.CANNOT_DELETE_ADMIN);

  await userRepo.reassignUserResources(userId, adminId);
  await userRepo.deleteUserChatSessions(userId);
  await userRepo.deleteUser(userId);
  logger.info('User deleted', { userId, reassignedTo: adminId });
}
```

- [ ] **Step 5: Create userController.ts**

Create `backend/src/user/userController.ts`:

```typescript
import type { Request, Response } from 'express';
import { HttpStatusCode } from '../base/types';
import { ValidationError, ForbiddenError } from '../errors/types';
import { ErrorCode } from '../errors/errorCode';
import * as userRepo from './userRepository';
import * as userService from './userService';
import { getStringParam } from '../utils/routeParams';

export async function listUsersHandler(req: Request, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;
  const search = req.query.search as string | undefined;

  const [items, total] = await Promise.all([
    userRepo.listUsers(page, pageSize, search),
    userRepo.countUsers(search),
  ]);

  res.json({ items, total });
}

export async function createUserHandler(req: Request, res: Response): Promise<void> {
  const { username, email, name, gender, birthDate } = req.body as {
    username?: string;
    email?: string;
    name?: string;
    gender?: string;
    birthDate?: string;
  };
  if (!username || !email) {
    throw new ValidationError('Username and email are required');
  }

  const result = await userService.createUserWithRandomPassword({ username, email, name, gender, birthDate });
  res.status(HttpStatusCode.CREATED).json(result);
}

export async function getUserHandler(req: Request, res: Response): Promise<void> {
  const id = getStringParam(req, 'id');
  const user = await userRepo.findUserById(id);
  if (!user) throw new ValidationError('User not found');

  const { password: _, ...userWithoutPassword } = user;
  res.json(userWithoutPassword);
}

export async function updateUserHandler(req: Request, res: Response): Promise<void> {
  const id = getStringParam(req, 'id');
  const user = await userRepo.findUserById(id);
  if (!user) throw new ValidationError('User not found');

  if (user.role === 'admin') {
    const { name, gender, birthDate, email } = req.body as Record<string, unknown>;
    // Admin: only allow updating profile fields, not username/role
    if (req.body.username || req.body.role) {
      throw new ForbiddenError('Cannot modify admin username or role', ErrorCode.CANNOT_MODIFY_ADMIN);
    }
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (gender !== undefined) data.gender = gender;
    if (birthDate !== undefined) data.birthDate = birthDate ? new Date(birthDate as string) : null;
    if (email !== undefined) data.email = email;
    const updated = await userRepo.updateUser(id, data as { name?: string; gender?: string; birthDate?: Date | null; email?: string });
    const { password: _, ...result } = updated;
    res.json(result);
    return;
  }

  const { name, gender, birthDate, email } = req.body as {
    name?: string;
    gender?: string;
    birthDate?: string;
    email?: string;
  };
  const updateData: { name?: string; gender?: string; birthDate?: Date | null; email?: string } = {};
  if (name !== undefined) updateData.name = name;
  if (gender !== undefined) updateData.gender = gender;
  if (birthDate !== undefined) updateData.birthDate = birthDate ? new Date(birthDate) : null;
  if (email !== undefined) updateData.email = email;

  const updated = await userRepo.updateUser(id, updateData);
  const { password: _, ...result } = updated;
  res.json(result);
}

export async function lockUserHandler(req: Request, res: Response): Promise<void> {
  const id = getStringParam(req, 'id');
  await userService.lockUser(id);
  res.json({ success: true });
}

export async function unlockUserHandler(req: Request, res: Response): Promise<void> {
  const id = getStringParam(req, 'id');
  await userService.unlockUser(id);
  res.json({ success: true });
}

export async function deleteUserHandler(req: Request, res: Response): Promise<void> {
  const id = getStringParam(req, 'id');
  if (!req.user) throw new ValidationError('Not authenticated');

  // Find admin user to reassign resources
  const { getPrismaClient } = await import('../infrastructure/database/prisma');
  const prisma = getPrismaClient();
  const admin = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (!admin) throw new ValidationError('Admin user not found');

  await userService.deleteUserById(id, admin.id);
  res.json({ success: true });
}
```

- [ ] **Step 6: Create userRoutes.ts**

Create `backend/src/user/userRoutes.ts`:

```typescript
import { Router } from 'express';
import {
  listUsersHandler,
  createUserHandler,
  getUserHandler,
  updateUserHandler,
  lockUserHandler,
  unlockUserHandler,
  deleteUserHandler,
} from './userController';

const router = Router();

router.get('/', listUsersHandler);
router.post('/', createUserHandler);
router.get('/:id', getUserHandler);
router.put('/:id', updateUserHandler);
router.put('/:id/lock', lockUserHandler);
router.put('/:id/unlock', unlockUserHandler);
router.delete('/:id', deleteUserHandler);

export default router;
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd backend && pnpm vitest run tests/user/userService.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/user/ backend/tests/user/
git commit -m "feat(auth): add user management service, controller, and routes"
```

---

## Task 9: Email Service

**Files:**
- Create: `backend/src/email/emailService.ts`
- Create: `backend/tests/email/emailService.test.ts`

- [ ] **Step 1: Write tests**

Create `backend/tests/email/emailService.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockGetSmtpConfig = vi.fn();
vi.mock('../../src/globalConfig/globalConfig.service', () => ({
  getSmtpConfig: (...args: unknown[]) => mockGetSmtpConfig(...args),
}));

const mockSendMail = vi.fn();
vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({ sendMail: mockSendMail }),
  },
}));

describe('emailService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return false when SMTP is not configured', async () => {
    mockGetSmtpConfig.mockResolvedValue({ host: '', user: '', pass: '' });
    const { sendWelcomeEmail } = await import('../../src/email/emailService');
    const result = await sendWelcomeEmail('test@test.com', 'testuser', 'Password1!');
    expect(result).toBe(false);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('should send email when SMTP is configured', async () => {
    mockGetSmtpConfig.mockResolvedValue({
      host: 'smtp.test.com',
      port: 465,
      secure: true,
      user: 'sender@test.com',
      pass: 'password',
      fromName: 'DataBot',
    });
    mockSendMail.mockResolvedValue({ messageId: 'msg-1' });

    const { sendWelcomeEmail } = await import('../../src/email/emailService');
    const result = await sendWelcomeEmail('test@test.com', 'testuser', 'Password1!');
    expect(result).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'test@test.com',
    }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pnpm vitest run tests/email/emailService.test.ts
```

- [ ] **Step 3: Create emailService.ts**

Create `backend/src/email/emailService.ts`:

```typescript
import nodemailer from 'nodemailer';
import { getSmtpConfig } from '../globalConfig/globalConfig.service';
import logger from '../utils/logger';

export async function sendWelcomeEmail(to: string, username: string, password: string): Promise<boolean> {
  try {
    const smtp = await getSmtpConfig();
    if (!smtp.host || !smtp.user) {
      logger.warn('SMTP not configured, cannot send welcome email');
      return false;
    }

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port || 465,
      secure: smtp.secure !== false,
      auth: { user: smtp.user, pass: smtp.pass },
    });

    const fromName = smtp.fromName || 'DataBot';
    const html = buildWelcomeEmailHtml(username, password);

    await transporter.sendMail({
      from: `"${fromName}" <${smtp.user}>`,
      to,
      subject: 'Your DataBot Account Has Been Created',
      html,
    });

    logger.info('Welcome email sent', { to, username });
    return true;
  } catch (err) {
    logger.error('Failed to send welcome email', { to, error: err });
    return false;
  }
}

function buildWelcomeEmailHtml(username: string, password: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">Welcome to DataBot</h2>
      <p>Your account has been created. Here are your login credentials:</p>
      <table style="border-collapse: collapse; margin: 20px 0;">
        <tr>
          <td style="padding: 8px 16px; font-weight: bold; background: #f5f5f5;">Username</td>
          <td style="padding: 8px 16px;">${username}</td>
        </tr>
        <tr>
          <td style="padding: 8px 16px; font-weight: bold; background: #f5f5f5;">Password</td>
          <td style="padding: 8px 16px; font-family: monospace;">${password}</td>
        </tr>
      </table>
      <p style="color: #e74c3c;"><strong>Important:</strong> You will be required to change your password on first login.</p>
      <p>If you have any questions, please contact your administrator.</p>
    </div>
  `;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && pnpm vitest run tests/email/emailService.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/email/ backend/tests/email/
git commit -m "feat(auth): add email service for welcome emails"
```

---

## Task 10: Password Policy GlobalConfig Extension

**Files:**
- Modify: `backend/src/globalConfig/globalConfig.service.ts`
- Modify: `backend/src/globalConfig/globalConfig.controller.ts`
- Modify: `backend/src/globalConfig/globalConfig.routes.ts`

- [ ] **Step 1: Add password policy to globalConfig.service.ts**

Add functions to `backend/src/globalConfig/globalConfig.service.ts`:

```typescript
import { DEFAULT_PASSWORD_POLICY, type PasswordPolicy } from '../auth/authService';

export async function getPasswordPolicyConfig(): Promise<PasswordPolicy> {
  const rows = await getConfigsByCategory('password_policy');
  if (rows.length === 0) return { ...DEFAULT_PASSWORD_POLICY };

  const configMap = new Map(rows.map((r) => [r.configKey, r.configValue]));
  return {
    minLength: parseInt(configMap.get('minLength') || String(DEFAULT_PASSWORD_POLICY.minLength), 10),
    requireUppercase: configMap.get('requireUppercase') !== 'false',
    requireLowercase: configMap.get('requireLowercase') !== 'false',
    requireNumbers: configMap.get('requireNumbers') !== 'false',
    requireSpecialChars: configMap.get('requireSpecialChars') !== 'false',
  };
}

export async function savePasswordPolicyConfig(policy: PasswordPolicy): Promise<void> {
  await upsertConfigs('password_policy', [
    { key: 'minLength', value: String(policy.minLength) },
    { key: 'requireUppercase', value: String(policy.requireUppercase) },
    { key: 'requireLowercase', value: String(policy.requireLowercase) },
    { key: 'requireNumbers', value: String(policy.requireNumbers) },
    { key: 'requireSpecialChars', value: String(policy.requireSpecialChars) },
  ]);
}
```

- [ ] **Step 2: Add handlers to globalConfig.controller.ts**

Add to `backend/src/globalConfig/globalConfig.controller.ts`:

```typescript
export async function getPasswordPolicyHandler(_req: Request, res: Response): Promise<void> {
  const policy = await getPasswordPolicyConfig();
  res.json(policy);
}

export async function savePasswordPolicyHandler(req: Request, res: Response): Promise<void> {
  const { minLength, requireUppercase, requireLowercase, requireNumbers, requireSpecialChars } = req.body;
  if (typeof minLength !== 'number' || minLength < 1) {
    throw new ValidationError('minLength must be a positive number');
  }
  await savePasswordPolicyConfig({
    minLength,
    requireUppercase: Boolean(requireUppercase),
    requireLowercase: Boolean(requireLowercase),
    requireNumbers: Boolean(requireNumbers),
    requireSpecialChars: Boolean(requireSpecialChars),
  });
  const updated = await getPasswordPolicyConfig();
  res.json(updated);
}
```

- [ ] **Step 3: Add routes to globalConfig.routes.ts**

Add to `backend/src/globalConfig/globalConfig.routes.ts` — the password-policy GET route must be registered separately with only `authMiddleware` (not `adminOnly`). The PUT route requires `adminOnly`.

```typescript
// In globalConfig.routes.ts - password policy routes
router.get('/password-policy', getPasswordPolicyHandler);  // Auth-only (no adminOnly), registered before adminOnly-guarded routes
router.put('/password-policy', savePasswordPolicyHandler);  // Will use adminOnly from route mounting
```

Note: The password-policy GET route needs special handling in `api.ts` to avoid the blanket adminOnly. See Task 12 for the route mounting details.

- [ ] **Step 4: Commit**

```bash
git add backend/src/globalConfig/
git commit -m "feat(auth): add password policy to global config"
```

---

## Task 11: Integrate Auth into Express App & Existing Routes

**Files:**
- Modify: `backend/src/index.ts`
- Modify: `backend/src/routes/api.ts`

- [ ] **Step 1: Update index.ts**

In `backend/src/index.ts`, add:

1. Import `cookieParser` and register it after `express.json()`:
```typescript
import cookieParser from 'cookie-parser';
// ... after express.json() and express.urlencoded():
app.use(cookieParser());
```

2. Import and call `initializeAdmin()` after `initDatabase()`:
```typescript
import { initializeAdmin } from './auth/adminInit';
// ... after await initDatabase():
await initializeAdmin();
```

3. Import and call `startInternalServer()` after the main server starts:
```typescript
import { startInternalServer } from './internal/internalServer';
// ... after server.listen():
startInternalServer();
```

- [ ] **Step 2: Update api.ts to mount auth routes and apply middleware**

In `backend/src/routes/api.ts`:

```typescript
import authRoutes from '../auth/authRoutes';
import userRoutes from '../user/userRoutes';
import { authMiddleware } from '../auth/authMiddleware';
import { adminOnly } from '../auth/adminOnly';
import { mustChangePasswordCheck } from '../auth/mustChangePassword';

// Public routes (no auth)
router.use('/auth', authRoutes);

// All routes below require authentication
router.use(authMiddleware);
router.use(mustChangePasswordCheck);

// Admin-only routes
router.use('/users', adminOnly, userRoutes);

// Password policy GET is already handled in globalConfig routes (auth-only, not adminOnly)
// But other global-config routes need adminOnly — apply adminOnly at the route level inside globalConfigRoutes
router.use('/global-config', globalConfigRoutes);

// Existing routes (now auth-protected)
router.use(datafileRoutes);
router.use('/sqlite', sqliteRoutes);
// ... rest of existing routes
```

The `globalConfigRoutes` file needs to apply `adminOnly` per-route (on all routes EXCEPT `GET /password-policy`).

- [ ] **Step 3: Update globalConfig.routes.ts for per-route adminOnly**

Modify `backend/src/globalConfig/globalConfig.routes.ts` to apply `adminOnly` on all routes except `GET /password-policy`:

```typescript
import { adminOnly } from '../auth/adminOnly';

// Password policy - GET is open to all authenticated users
router.get('/password-policy', getPasswordPolicyHandler);
router.put('/password-policy', adminOnly, savePasswordPolicyHandler);

// All other global config routes require admin
router.get('/llm', adminOnly, getLLMConfigHandler);
router.put('/llm', adminOnly, saveLLMConfigHandler);
// ... apply adminOnly to all other existing routes
```

- [ ] **Step 4: Add createdBy to resource creation endpoints**

For each resource creation endpoint, inject `req.user!.userId` as `createdBy`:

- `backend/src/datasource/datasource.service.ts` — add `createdBy` param to create function
- `backend/src/workflow/workflow.service.ts` — add `createdBy` param
- `backend/src/workflow/customNodeTemplate.service.ts` — add `createdBy` param
- `backend/src/workflow/schedule.service.ts` — add `createdBy` param
- `backend/src/chatSession/chatSession.service.ts` — add `userId` param to createSession

Each controller passes `req.user!.userId` when calling the service.

- [ ] **Step 5: Add userId filter to chat sessions**

In `backend/src/chatSession/chatSession.service.ts`, modify `listSessions` to accept `userId` parameter:
```typescript
export async function listSessions(userId: string): Promise<ChatSessionInfo[]> {
  // Filter by userId
}
```

Update the controller to pass `req.user!.userId`.

- [ ] **Step 6: Run preflight to verify compilation**

```bash
cd backend && pnpm run preflight
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/
git commit -m "feat(auth): integrate auth middleware into Express app and existing routes"
```

---

## Task 12: WebSocket Authentication

**Files:**
- Modify: `backend/src/agent/websockets.ts`

- [ ] **Step 1: Add auth handshake to WebSocket connections**

In `backend/src/agent/websockets.ts`, modify the WebSocket connection handler to:

1. Wait for an auth message as the first frame within 5 seconds
2. Verify the token
3. Associate the connection with the user
4. Reject if auth fails

```typescript
import { verifyAccessToken } from '../auth/authService';

// In the ws handler:
wsApp.ws(`${config.websocket.path}/agent`, (ws: WebSocket, req: IncomingMessage) => {
  let authenticated = false;
  let userId: string | undefined;

  const authTimeout = setTimeout(() => {
    if (!authenticated) {
      ws.close(1008, 'Authentication timeout');
    }
  }, 5000);

  ws.on('message', (data: Buffer) => {
    const message = JSON.parse(data.toString());

    if (!authenticated) {
      if (message.type === 'auth' && message.token) {
        try {
          const payload = verifyAccessToken(message.token);
          authenticated = true;
          userId = payload.userId;
          clearTimeout(authTimeout);
          ws.send(JSON.stringify({ type: 'auth_success' }));
          // Continue with normal setup...
        } catch {
          ws.close(1008, 'Invalid token');
        }
      } else {
        ws.close(1008, 'First message must be auth');
      }
      return;
    }

    // Normal message handling (existing logic)
    // ...
  });
});
```

Apply the same pattern to `/ws/copilot`, `/ws/copilot-debug`, and `/ws/workflow` endpoints.

- [ ] **Step 2: Commit**

```bash
git add backend/src/agent/websockets.ts
git commit -m "feat(auth): add WebSocket auth handshake"
```

---

## Task 13: Install Vue Router & Create Frontend Auth Store

**Files:**
- Create: `frontend/src/router/index.ts`
- Create: `frontend/src/stores/authStore.ts`
- Create: `frontend/src/api/auth.ts`
- Modify: `frontend/src/main.ts`
- Modify: `frontend/src/stores/index.ts`
- Modify: `frontend/package.json`

- [ ] **Step 1: Install vue-router**

```bash
cd frontend && pnpm add vue-router@4
```

- [ ] **Step 2: Create auth API module**

Create `frontend/src/api/auth.ts`:

```typescript
import { http } from '@/utils/http';

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    username: string;
    name: string | null;
    role: string;
    mustChangePassword: boolean;
  };
}

export interface UserProfile {
  id: string;
  username: string;
  name: string | null;
  gender: string | null;
  birthDate: string | null;
  email: string;
  role: string;
}

export function login(username: string, password: string): Promise<LoginResponse> {
  return http.post<LoginResponse>('/auth/login', { username, password });
}

export function refreshToken(): Promise<{ accessToken: string }> {
  return http.post<{ accessToken: string }>('/auth/refresh', {});
}

export function logout(): Promise<void> {
  return http.post<void>('/auth/logout', {});
}

export function changePassword(oldPassword: string, newPassword: string): Promise<{ success: boolean }> {
  return http.put<{ success: boolean }>('/auth/change-password', { oldPassword, newPassword });
}

export function getProfile(): Promise<UserProfile> {
  return http.get<UserProfile>('/auth/profile');
}

export function updateProfile(data: {
  name?: string;
  gender?: string;
  birthDate?: string | null;
  email?: string;
}): Promise<UserProfile> {
  return http.put<UserProfile>('/auth/profile', data);
}

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
}

export function getPasswordPolicy(): Promise<PasswordPolicy> {
  return http.get<PasswordPolicy>('/global-config/password-policy');
}
```

- [ ] **Step 3: Create auth store**

Create `frontend/src/stores/authStore.ts`:

```typescript
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import * as authApi from '@/api/auth';

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null);
  const user = ref<authApi.LoginResponse['user'] | null>(null);

  const isAuthenticated = computed(() => !!accessToken.value);
  const isAdmin = computed(() => user.value?.role === 'admin');
  const mustChangePassword = computed(() => user.value?.mustChangePassword === true);

  async function login(username: string, password: string) {
    const response = await authApi.login(username, password);
    accessToken.value = response.accessToken;
    user.value = response.user;
  }

  async function refreshAccessToken() {
    try {
      const response = await authApi.refreshToken();
      accessToken.value = response.accessToken;
      // Restore user profile if we don't have it (e.g., after page refresh)
      if (!user.value) {
        const profile = await authApi.getProfile();
        user.value = {
          id: profile.id,
          username: profile.username,
          name: profile.name,
          role: profile.role,
          mustChangePassword: false, // If they got past login, this should be false
        };
      }
      return true;
    } catch {
      clearAuth();
      return false;
    }
  }

  async function doLogout() {
    try {
      await authApi.logout();
    } finally {
      clearAuth();
    }
  }

  function clearAuth() {
    accessToken.value = null;
    user.value = null;
  }

  async function fetchProfile() {
    const profile = await authApi.getProfile();
    if (user.value) {
      user.value = { ...user.value, name: profile.name };
    }
    return profile;
  }

  return {
    accessToken,
    user,
    isAuthenticated,
    isAdmin,
    mustChangePassword,
    login,
    refreshAccessToken,
    logout: doLogout,
    clearAuth,
    fetchProfile,
  };
});
```

- [ ] **Step 4: Create router with guards**

Create `frontend/src/router/index.ts`:

```typescript
import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/components/auth/LoginPage.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/change-password',
      name: 'changePassword',
      component: () => import('@/pages/ChangePasswordPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/',
      name: 'main',
      component: () => import('@/App.vue'),
      meta: { requiresAuth: true },
    },
  ],
});

router.beforeEach(async (to) => {
  const authStore = useAuthStore();

  // On page refresh, try to restore auth state from refresh token cookie
  if (!authStore.isAuthenticated && to.meta.requiresAuth !== false) {
    const restored = await authStore.refreshAccessToken();
    if (restored) {
      // Auth restored from refresh token, continue to requested page
    } else {
      return { name: 'login' };
    }
  }

  if (to.meta.requiresAuth !== false && !authStore.isAuthenticated) {
    return { name: 'login' };
  }

  if (authStore.isAuthenticated && authStore.mustChangePassword && to.name !== 'changePassword') {
    return { name: 'changePassword' };
  }

  if (to.name === 'login' && authStore.isAuthenticated) {
    return { name: 'main' };
  }
});

export default router;
```

Note: The actual App.vue will need to be refactored so the root component is a `<router-view>`, and the current App.vue content moves to a MainLayout component. This restructuring is detailed in Task 16.

- [ ] **Step 5: Update stores/index.ts**

Add exports:
```typescript
export { useAuthStore } from './authStore';
```

- [ ] **Step 6: Create authStore test**

Create `frontend/tests/stores/authStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../../src/stores/authStore';

vi.mock('../../src/api/auth', () => ({
  login: vi.fn(),
  refreshToken: vi.fn(),
  logout: vi.fn(),
  getProfile: vi.fn(),
}));

describe('authStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('should start with unauthenticated state', () => {
    const store = useAuthStore();
    expect(store.isAuthenticated).toBe(false);
    expect(store.isAdmin).toBe(false);
    expect(store.user).toBeNull();
  });

  it('should set auth state on login', async () => {
    const { login } = await import('../../src/api/auth');
    (login as ReturnType<typeof vi.fn>).mockResolvedValue({
      accessToken: 'token-123',
      user: { id: 'u1', username: 'admin', name: 'Admin', role: 'admin', mustChangePassword: false },
    });

    const store = useAuthStore();
    await store.login('admin', 'password');
    expect(store.isAuthenticated).toBe(true);
    expect(store.isAdmin).toBe(true);
  });

  it('should clear auth state on logout', async () => {
    const store = useAuthStore();
    store.accessToken = 'token';
    store.user = { id: 'u1', username: 'admin', name: 'Admin', role: 'admin', mustChangePassword: false };

    await store.logout();
    expect(store.isAuthenticated).toBe(false);
    expect(store.user).toBeNull();
  });
});
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/router/ frontend/src/stores/authStore.ts frontend/src/api/auth.ts frontend/src/stores/index.ts frontend/tests/stores/authStore.test.ts frontend/package.json frontend/pnpm-lock.yaml
git commit -m "feat(auth): add Vue Router, auth store, and auth API"
```

---

## Task 14: HTTP Interceptor & WebSocket Auth Changes

**Files:**
- Modify: `frontend/src/utils/http.ts`
- Modify: `frontend/src/composables/useWebSocket.ts`

- [ ] **Step 1: Add auth interceptors to http.ts**

Modify `frontend/src/utils/http.ts`:

Add request interceptor to attach auth header:
```typescript
import { useAuthStore } from '@/stores/authStore';
import router from '@/router';

axiosInstance.interceptors.request.use((config) => {
  const authStore = useAuthStore();
  if (authStore.accessToken) {
    config.headers.Authorization = `Bearer ${authStore.accessToken}`;
  }
  // Enable cookies for refresh token
  config.withCredentials = true;
  return config;
});
```

Update response interceptor to handle 401 with token refresh:
```typescript
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const authStore = useAuthStore();
    const originalRequest = error.config;

    // If 401 and not already retrying, attempt token refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshed = await authStore.refreshAccessToken();
      if (refreshed) {
        originalRequest.headers.Authorization = `Bearer ${authStore.accessToken}`;
        return axiosInstance(originalRequest);
      }
      router.push('/login');
      return Promise.reject(error);
    }

    // Handle mustChangePassword
    if (error.response?.data?.error?.code === 'E00047') {
      router.push('/change-password');
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);
```

- [ ] **Step 2: Add auth handshake to WebSocket**

Modify `frontend/src/composables/useWebSocket.ts` to accept a token and send auth message after connection:

```typescript
// In connect(), after ws.onopen:
ws.onopen = () => {
  // Send auth message as first frame
  if (options.token) {
    ws.send(JSON.stringify({ type: 'auth', token: options.token }));
  }
  // ... rest of existing onopen logic
};
```

Update `UseWebSocketOptions` to include `token?: string`.

Update `ChatContainer.vue` to pass `authStore.accessToken` as the token.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/utils/http.ts frontend/src/composables/useWebSocket.ts
git commit -m "feat(auth): add HTTP auth interceptor and WebSocket auth handshake"
```

---

## Task 15: Login Page

**Files:**
- Create: `frontend/src/components/auth/LoginPage.vue`

- [ ] **Step 1: Create LoginPage.vue**

Create `frontend/src/components/auth/LoginPage.vue`:

A centered login form with username/password fields using Element Plus `el-form`, `el-input`, `el-button`. Shows error messages for invalid credentials or locked account. Responsive for desktop and mobile. All text uses i18n keys.

Key structure:
```vue
<template>
  <div class="login-page">
    <div class="login-card">
      <h1>{{ t('auth.loginTitle') }}</h1>
      <el-form :model="form" :rules="rules" ref="formRef" @submit.prevent="handleLogin">
        <el-form-item prop="username">
          <el-input v-model="form.username" :placeholder="t('auth.username')" prefix-icon="User" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="form.password" type="password" :placeholder="t('auth.password')" prefix-icon="Lock" show-password />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" native-type="submit" :loading="loading" class="login-button">
            {{ t('auth.login') }}
          </el-button>
        </el-form-item>
      </el-form>
      <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/auth/LoginPage.vue
git commit -m "feat(auth): add login page"
```

---

## Task 16: App Restructuring for Router & Change Password Page

**Files:**
- Modify: `frontend/src/App.vue`
- Modify: `frontend/src/main.ts`
- Create: `frontend/src/pages/ChangePasswordPage.vue`

- [ ] **Step 1: Restructure App.vue**

The current `App.vue` contains the desktop/mobile layout switching. This needs to become a route-rendered component. Restructure:

1. Create a new root `App.vue` that is just `<router-view />`
2. Move the current App.vue content (desktop/mobile switching, global config init) to become the component rendered at `/` route

In `frontend/src/main.ts`, register the router:
```typescript
import router from './router';
app.use(router);
```

Update the `/` route in `router/index.ts` to render the main layout component (the refactored original App.vue content).

- [ ] **Step 2: Create ChangePasswordPage.vue**

Create `frontend/src/pages/ChangePasswordPage.vue`:

A centered page similar to login, with:
- New password field
- Confirm password field
- Password policy hints (fetched from API)
- Logout button
- On success: update `authStore.user.mustChangePassword = false` and redirect to `/`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.vue frontend/src/main.ts frontend/src/pages/ChangePasswordPage.vue
git commit -m "feat(auth): restructure App for Vue Router and add change password page"
```

---

## Task 17: Navigation Changes & User Management Page

**Files:**
- Modify: `frontend/src/types/sidebar.ts`
- Modify: `frontend/src/components/sidebar/IconBar.vue`
- Modify: `frontend/src/layouts/DesktopLayout.vue`
- Modify: `frontend/src/layouts/MobileLayout.vue`
- Create: `frontend/src/components/user/UserManagementPage.vue`
- Create: `frontend/src/stores/userManagementStore.ts`
- Create: `frontend/src/api/user.ts`

- [ ] **Step 1: Extend NavType**

In `frontend/src/types/sidebar.ts`:
```typescript
export type NavType = 'data' | 'chat' | 'workflow' | 'schedule' | 'settings' | 'users';
```

- [ ] **Step 2: Update IconBar.vue**

Add "Users" navigation item (visible only to admin) with `Users` icon from lucide-vue-next. Add user menu at sidebar bottom: avatar/username display, dropdown with Profile, Change Password, Logout.

```typescript
import { useAuthStore } from '@/stores';
const authStore = useAuthStore();

// Conditionally include 'users' nav item when authStore.isAdmin
```

- [ ] **Step 3: Update DesktopLayout.vue and MobileLayout.vue**

Add `UserManagementPage` as an async component. Render it when `activeNav === 'users'`.

Add user menu section at sidebar bottom.

- [ ] **Step 4: Create user API module**

Create `frontend/src/api/user.ts`:

```typescript
import { http } from '@/utils/http';

export interface UserInfo {
  id: string;
  username: string;
  name: string | null;
  gender: string | null;
  birthDate: string | null;
  email: string;
  role: string;
  locked: boolean;
  createdAt: string;
}

export interface CreateUserRequest {
  username: string;
  email: string;
  name?: string;
  gender?: string;
  birthDate?: string;
}

export interface CreateUserResponse {
  user: UserInfo;
  passwordSent: boolean;
  tempPassword?: string;
}

export function listUsers(page: number, pageSize: number, search?: string): Promise<{ items: UserInfo[]; total: number }> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search) params.set('search', search);
  return http.get(`/users?${params.toString()}`);
}

export function createUser(data: CreateUserRequest): Promise<CreateUserResponse> {
  return http.post('/users', data);
}

export function updateUser(id: string, data: Partial<CreateUserRequest>): Promise<UserInfo> {
  return http.put(`/users/${id}`, data);
}

export function lockUser(id: string): Promise<{ success: boolean }> {
  return http.put(`/users/${id}/lock`, {});
}

export function unlockUser(id: string): Promise<{ success: boolean }> {
  return http.put(`/users/${id}/unlock`, {});
}

export function deleteUser(id: string): Promise<{ success: boolean }> {
  return http.delete(`/users/${id}`);
}
```

- [ ] **Step 5: Create userManagementStore.ts**

Create `frontend/src/stores/userManagementStore.ts` following the existing store patterns with `useAsyncAction()`.

- [ ] **Step 6: Create UserManagementPage.vue**

Create `frontend/src/components/user/UserManagementPage.vue`:

An Element Plus table with search, pagination, and action buttons. Dialogs for create/edit user. Lock/unlock/delete actions with confirmation.

- [ ] **Step 7: Update stores/index.ts**

Add exports for new stores.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/types/ frontend/src/components/sidebar/ frontend/src/layouts/ frontend/src/components/user/ frontend/src/stores/ frontend/src/api/user.ts
git commit -m "feat(auth): add navigation changes and user management page"
```

---

## Task 18: Profile & Password Dialogs + Password Policy Config

**Files:**
- Create: `frontend/src/components/user/UserProfileDialog.vue`
- Create: `frontend/src/components/user/ChangePasswordDialog.vue`
- Create: `frontend/src/components/settings/PasswordPolicyConfig.vue`
- Modify: `frontend/src/components/settings/SettingsPage.vue`

- [ ] **Step 1: Create UserProfileDialog.vue**

Element Plus dialog for editing own profile (name, gender, birthDate, email). Uses `authApi.updateProfile()`.

- [ ] **Step 2: Create ChangePasswordDialog.vue**

Element Plus dialog for voluntary password change (old password, new password, confirm). Fetches and displays password policy rules as hints. Uses `authApi.changePassword()`.

- [ ] **Step 3: Create PasswordPolicyConfig.vue**

Element Plus form card for admin to configure password policy: min length number input, toggle switches for uppercase/lowercase/numbers/special chars. Uses `globalConfigApi` to fetch/save.

- [ ] **Step 4: Add PasswordPolicyConfig to SettingsPage.vue**

Render `PasswordPolicyConfig` card alongside existing LLM, WebSearch, SMTP config cards.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/user/ frontend/src/components/settings/
git commit -m "feat(auth): add profile dialog, password dialog, and password policy config"
```

---

## Task 19: i18n Extensions

**Files:**
- Modify: `frontend/src/locales/zh-CN.ts`
- Modify: `frontend/src/locales/en-US.ts`

- [ ] **Step 1: Add i18n keys for auth**

Add to both locale files:

```typescript
auth: {
  loginTitle: '登录 DataBot' / 'Login to DataBot',
  username: '用户名' / 'Username',
  password: '密码' / 'Password',
  login: '登录' / 'Login',
  logout: '退出登录' / 'Logout',
  profile: '个人资料' / 'Profile',
  changePassword: '修改密码' / 'Change Password',
  oldPassword: '当前密码' / 'Current Password',
  newPassword: '新密码' / 'New Password',
  confirmPassword: '确认密码' / 'Confirm Password',
  passwordMismatch: '两次密码不一致' / 'Passwords do not match',
  invalidCredentials: '用户名或密码错误' / 'Invalid username or password',
  accountLocked: '账户已被锁定' / 'Account is locked',
  mustChangePassword: '首次登录请修改密码' / 'Please change your password',
  passwordChanged: '密码修改成功' / 'Password changed successfully',
  tooManyAttempts: '登录失败次数过多，请稍后再试' / 'Too many attempts, try again later',
},
user: {
  management: '用户管理' / 'User Management',
  create: '创建用户' / 'Create User',
  edit: '编辑用户' / 'Edit User',
  name: '姓名' / 'Name',
  gender: '性别' / 'Gender',
  male: '男' / 'Male',
  female: '女' / 'Female',
  other: '其他' / 'Other',
  birthDate: '出生日期' / 'Birth Date',
  email: '邮箱' / 'Email',
  status: '状态' / 'Status',
  active: '正常' / 'Active',
  locked: '已锁定' / 'Locked',
  lock: '锁定' / 'Lock',
  unlock: '解锁' / 'Unlock',
  delete: '删除' / 'Delete',
  confirmLock: '确定锁定该用户？' / 'Confirm lock this user?',
  confirmDelete: '确定删除该用户？' / 'Confirm delete this user?',
  emailSent: '初始密码已发送到用户邮箱' / 'Initial password sent to user email',
  emailNotSent: 'SMTP未配置，初始密码：{password}' / 'SMTP not configured, initial password: {password}',
},
passwordPolicy: {
  title: '密码策略' / 'Password Policy',
  minLength: '最小长度' / 'Minimum Length',
  requireUppercase: '要求大写字母' / 'Require Uppercase',
  requireLowercase: '要求小写字母' / 'Require Lowercase',
  requireNumbers: '要求数字' / 'Require Numbers',
  requireSpecialChars: '要求特殊字符' / 'Require Special Characters',
},
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/locales/
git commit -m "feat(auth): add i18n keys for auth, user management, and password policy"
```

---

## Task 20: Docker & Environment Updates

**Files:**
- Modify: `docker/docker-compose.yaml`
- Modify: `backend/.env.example`

- [ ] **Step 1: Update docker-compose.yaml**

Add environment variables to the backend service:

```yaml
environment:
  JWT_SECRET: ${JWT_SECRET:-your-jwt-secret-key-change-in-production}
  ADMIN_INITIAL_PASSWORD: ${ADMIN_INITIAL_PASSWORD:-Admin@123}
  ADMIN_EMAIL: ${ADMIN_EMAIL:-admin@localhost}
  INTERNAL_PORT: 3001
```

Do NOT expose port 3001 to the host (it's localhost-only inside the container).

- [ ] **Step 2: Commit**

```bash
git add docker/docker-compose.yaml backend/.env.example
git commit -m "feat(auth): update Docker compose and env for auth config"
```

---

## Task 21: Preflight Checks & Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run backend preflight**

```bash
cd backend && pnpm run preflight
```

Fix any TypeScript, ESLint, or Prettier errors.

- [ ] **Step 2: Run backend tests**

```bash
cd backend && pnpm vitest run
```

Fix any failing tests.

- [ ] **Step 3: Run frontend preflight**

```bash
cd frontend && pnpm run preflight
```

Fix any TypeScript, ESLint, or Prettier errors.

- [ ] **Step 4: Run frontend tests**

```bash
cd frontend && pnpm vitest run
```

Fix any failing tests.

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(auth): resolve preflight and test issues"
```
