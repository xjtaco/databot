# User Management & Authentication Design

## Overview

Add user management and login authentication to DataBot. Only authenticated users can access the system. The system has a single admin user and multiple normal users with role-based access control.

## Requirements Summary

1. Admin user auto-initialized on startup (`admin` / password from `ADMIN_INITIAL_PASSWORD` env var, default `Admin@123`)
2. Admin can create users (username, name, gender, birthDate, email), lock/unlock users
3. New users receive a random password via email; must change password on first login
4. Password complexity rules configurable in global config
5. Admin accesses all features (global config + user management + business features); normal users access data management, chat, workflow, scheduled tasks
6. Resources (datasource, workflow, custom nodes, schedules) visible to all, with `createdBy` field (existing records assigned to admin on migration); chat history is per-user
7. Localhost-only endpoint to reset admin password when lost
8. Users can edit their own profile and change password

## Architecture Decisions

- **Authentication**: Self-built JWT (access token + refresh token), no Passport.js
- **Password hashing**: bcrypt
- **Frontend routing**: Introduce Vue Router (`/login`, `/change-password`, `/`)
- **Token storage**: Access token in memory (Pinia store), refresh token in httpOnly cookie
- **WebSocket auth**: Token sent as first message after connection (protocol-level handshake, not query param — avoids token leaking into logs/proxy caches)

---

## 1. Data Model

### New Models

Follow existing Prisma conventions: `@db.Uuid` on all ID/FK fields, `@map("snake_case")` on all camelCase columns, `@@map("table_name")` on all models.

```prisma
model User {
  id                 String    @id @default(uuid()) @db.Uuid
  username           String    @unique @db.VarChar(100)
  password           String    @db.VarChar(255)        // bcrypt hash
  name               String?   @db.VarChar(100)
  gender             String?   @db.VarChar(10)         // "male" | "female" | "other"
  birthDate          DateTime? @map("birth_date")
  email              String    @unique @db.VarChar(255)
  role               String    @default("user") @db.VarChar(20)  // "admin" | "user"
  locked             Boolean   @default(false)
  mustChangePassword Boolean   @default(true) @map("must_change_password")
  createdAt          DateTime  @default(now()) @map("created_at")
  updatedAt          DateTime  @updatedAt @map("updated_at")

  chatSessions        ChatSession[]
  refreshTokens       RefreshToken[]
  datasources         Datasource[]
  workflows           Workflow[]
  customNodeTemplates CustomNodeTemplate[]
  workflowSchedules   WorkflowSchedule[]

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

### Existing Model Changes

Add `createdBy` field to:

- `Datasource`: `createdBy String? @map("created_by") @db.Uuid`, `creator User? @relation(fields: [createdBy], references: [id])`
- `Workflow`: same pattern
- `CustomNodeTemplate`: same pattern
- `WorkflowSchedule`: same pattern

Add `userId` field to:

- `ChatSession`: `userId String? @map("user_id") @db.Uuid`, `user User? @relation(fields: [userId], references: [id])`

### Password Policy (GlobalConfig)

Stored in existing `GlobalConfig` table with key `password_policy`, value as JSON:

```json
{
  "minLength": 8,
  "requireUppercase": true,
  "requireLowercase": true,
  "requireNumbers": true,
  "requireSpecialChars": true
}
```

### Migration Strategy

- **Migration 1**: Create `User` and `RefreshToken` tables
- **Migration 2**: Add nullable `createdBy` to `Datasource`, `Workflow`, `CustomNodeTemplate`, `WorkflowSchedule`; add nullable `userId` to `ChatSession`
- **Post-migration seed**: After admin user is created on startup, update all records where `createdBy IS NULL` to admin's ID; update all `ChatSession` where `userId IS NULL` to admin's ID

### User Deletion Behavior

When deleting a user via `DELETE /api/users/:id`:
- `RefreshToken` records: cascade delete (via `onDelete: Cascade`)
- `ChatSession` records: delete all sessions owned by the user (application-level, before user delete)
- `Datasource`, `Workflow`, `CustomNodeTemplate`, `WorkflowSchedule`: set `createdBy` to admin's ID (reassign ownership, do not delete resources)

---

## 2. Authentication System

### JWT Strategy

- **Access Token**: 2h expiry, payload `{ userId, username, role }`, signed with `JWT_SECRET` env var
- **Refresh Token**: 7d expiry, stored in `RefreshToken` table, delivered via httpOnly cookie
- **Refresh Token Rotation**: On each refresh, the old refresh token is deleted and a new one is issued. This limits the window of a stolen refresh token.
- Token refresh: client sends cookie, server validates, deletes old token, issues new access token + new refresh token

### Express Request Type Augmentation

Create `backend/src/types/express.d.ts` with module augmentation:

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

This avoids `any` usage and provides type-safe access to `req.user` throughout the codebase.

### Backend Middleware

- `authMiddleware`: Extracts and verifies access token from `Authorization: Bearer <token>` header. Injects `req.user = { userId, username, role }`. Returns 401 if invalid/expired.
- `adminOnly`: Checks `req.user.role === 'admin'`. Returns 403 if not admin.
- `mustChangePasswordCheck`: If user's `mustChangePassword === true`, blocks all requests except `PUT /api/auth/change-password` and `POST /api/auth/logout` with a specific error code.

### Login Rate Limiting

To prevent brute-force attacks:
- Track failed login attempts per username in memory (Map with username → { count, lastAttempt })
- After 5 consecutive failed attempts, lock the account for 15 minutes (return error with remaining lockout time)
- Successful login resets the counter
- This is separate from admin-triggered lock/unlock (which is permanent until unlocked)
- Counter resets on application restart (acceptable for this scope; persistent tracking is a future enhancement)

### Route Protection

| Route | Auth Requirement |
|-------|-----------------|
| `POST /api/auth/login` | None (rate-limited) |
| `POST /api/auth/refresh` | Refresh token cookie only |
| `POST /api/auth/logout` | Authenticated |
| `PUT /api/auth/change-password` | Authenticated (exempt from mustChangePassword check) |
| `GET/PUT /api/auth/profile` | Authenticated |
| `POST /internal/reset-admin` | Separate localhost-bound server (see below) |
| `/api/global-config/password-policy` (GET) | Authenticated (per-route, not adminOnly) |
| `/api/global-config/**` (all other) | Authenticated + adminOnly |
| `/api/users/**` | Authenticated + adminOnly |
| All other `/api/**` | Authenticated |
| WebSocket `/ws/**` | Token via first message handshake |

**Password policy route implementation**: Register `GET /api/global-config/password-policy` with only `authMiddleware` before the `adminOnly`-guarded global-config routes in `globalConfigRoutes`. This avoids the blanket adminOnly from blocking this specific endpoint.

### Admin Initialization

1. On application startup, query `User` table for `role = 'admin'`
2. If not found: create admin user with `username = 'admin'`, `email` from `ADMIN_EMAIL` env var (default `admin@localhost`), password = bcrypt hash of `ADMIN_INITIAL_PASSWORD` env var (default `Admin@123`), `mustChangePassword = true`
3. If found: skip
4. Then update all records with `createdBy = NULL` to admin's ID; update all `ChatSession` with `userId = NULL` to admin's ID

### Admin Password Reset Endpoint

- `POST /internal/reset-admin` — served on a **separate HTTP server** listening only on `127.0.0.1:<INTERNAL_PORT>` (default: `3001`)
- This avoids the unreliable `req.ip` check behind Docker/nginx reverse proxies
- The internal server is a minimal Express instance with only this one route
- Resets admin password to `ADMIN_INITIAL_PASSWORD`, sets `mustChangePassword = true`
- Deletes all admin's refresh tokens (force re-login)
- Usage: `kubectl exec <pod> -- curl -X POST http://localhost:3001/internal/reset-admin`

---

## 3. Backend API

### Auth Routes (`/api/auth`)

```
POST   /api/auth/login
  Request:  { username, password }
  Response: { accessToken, user: { id, username, name, role, mustChangePassword } }
  Cookie:   Set-Cookie: refreshToken (httpOnly, secure in production,
            sameSite=strict, path=/api/auth)
  Checks:   rate limit → user exists → password correct → not locked
  Errors:   401 invalid credentials, 403 account locked,
            429 too many attempts (reuse existing RATE_LIMIT_EXCEEDED / E00006)

POST   /api/auth/refresh
  Request:  Cookie refreshToken
  Response: { accessToken }
  Cookie:   Set-Cookie: new refreshToken (rotation)
  Checks:   token exists in DB → not expired → user not locked
  Action:   Delete old refresh token, create new one
  Errors:   401 invalid/expired refresh token

POST   /api/auth/logout
  Action:   Delete refresh token from DB, clear cookie
  Response: { success: true }

PUT    /api/auth/change-password
  Request:  { oldPassword, newPassword }
  Action:   Verify old password, validate new password against policy,
            update hash, set mustChangePassword = false
  Response: { success: true }
  Errors:   400 old password incorrect, 400 policy violation

GET    /api/auth/profile
  Response: { id, username, name, gender, birthDate, email, role }

PUT    /api/auth/profile
  Request:  { name, gender, birthDate, email }
  Response: Updated user object
  Errors:   400 email already taken
```

### User Management Routes (`/api/users`, adminOnly)

```
GET    /api/users
  Query:    ?page=1&pageSize=20&search=keyword
  Response: { items: User[], total: number }

POST   /api/users
  Request:  { username, email, name?, gender?, birthDate? }
  Action:   Generate random password, bcrypt hash, save user with
            mustChangePassword = true, send welcome email via SMTP
            (if SMTP not configured, return password in response)
  Response: { user, passwordSent: boolean, tempPassword?: string }
  Errors:   400 username/email taken, 400 validation errors

GET    /api/users/:id
  Response: User detail (without password)

PUT    /api/users/:id
  Request:  { name?, gender?, birthDate?, email? }
  Response: Updated user
  Errors:   400 email taken, 403 cannot modify admin username/role

PUT    /api/users/:id/lock
  Action:   Set locked = true, delete all user's refresh tokens
  Response: { success: true }
  Errors:   403 cannot lock admin

PUT    /api/users/:id/unlock
  Action:   Set locked = false
  Response: { success: true }

DELETE /api/users/:id
  Action:   Reassign user's resources (createdBy) to admin,
            delete user's chat sessions,
            delete user (cascades refresh tokens)
  Response: { success: true }
  Errors:   403 cannot delete admin
```

### Password Policy Routes (GlobalConfig extension)

```
GET    /api/global-config/password-policy
  Auth:     Authenticated (any user, needed for frontend validation)
  Response: { minLength, requireUppercase, requireLowercase,
              requireNumbers, requireSpecialChars }
  Default:  { minLength: 8, requireUppercase: true, requireLowercase: true,
              requireNumbers: true, requireSpecialChars: true }

PUT    /api/global-config/password-policy
  Auth:     Authenticated + adminOnly
  Request:  { minLength, requireUppercase, requireLowercase,
              requireNumbers, requireSpecialChars }
  Response: Updated policy
```

### Email Service

- New module: `backend/src/email/emailService.ts`
- Reuses SMTP config from `globalConfig` and existing `nodemailer` dependency
- Method: `sendWelcomeEmail(to: string, username: string, password: string): Promise<boolean>`
- HTML email template with: username, initial password, login URL, reminder to change password on first login
- Returns `false` if SMTP not configured (caller handles fallback)

---

## 4. Frontend Architecture

### Vue Router Introduction

```
/login             → LoginPage.vue
/change-password   → ChangePasswordPage.vue
/                  → Main app (DesktopLayout / MobileLayout)
```

**Route guards:**

1. Not authenticated → redirect to `/login`
2. Authenticated but `mustChangePassword = true` → redirect to `/change-password`
3. Authenticated and no password change required → allow access

**Coexistence with existing navigation:** Vue Router handles only the top-level page routing (`/login`, `/change-password`, `/`). The existing state-based `activeNav` navigation inside the main app layouts (DesktopLayout/MobileLayout) remains unchanged. The `/` route renders the current App shell which contains the sidebar + content area switching via `activeNav`. Vue Router guards protect the app shell; the inner navigation continues to work as before.

### New Pinia Stores

**`useAuthStore`:**
- State: `accessToken`, `user` (id, username, name, role, mustChangePassword)
- Actions: `login()`, `logout()`, `refreshToken()`, `changePassword()`, `fetchProfile()`, `updateProfile()`
- Getters: `isAuthenticated`, `isAdmin`, `mustChangePassword`

**`useUserManagementStore`:**
- State: `users`, `total`, `loading`
- Actions: `fetchUsers()`, `createUser()`, `updateUser()`, `lockUser()`, `unlockUser()`, `deleteUser()`

### HTTP Interceptor Changes (`utils/http.ts`)

- Request interceptor: attach `Authorization: Bearer <accessToken>` header
- Response interceptor:
  - 401 → attempt token refresh via `/api/auth/refresh`; success → retry original request; failure → clear auth state, redirect to `/login`
  - `mustChangePassword` error code → redirect to `/change-password`
- Refresh token request uses `withCredentials: true` for cookie
- **Dev CORS note**: In development (Vite proxy), the Vite dev server proxies `/api` to the backend, so same-origin cookies work without CORS config. In production, nginx serves both frontend and API on the same origin.

### WebSocket Changes

- After WebSocket connection is established, client sends an auth message as the first frame: `{ type: "auth", token: "<accessToken>" }`
- Backend WebSocket handler waits for auth message within a timeout (5s); if not received or invalid, closes connection
- On successful auth, backend associates the connection with the user
- Frontend reconnects with fresh token after token refresh

### Navigation Changes

**Admin sees:**
- Chat, Data Management, Workflow, Scheduled Tasks, Global Config, **User Management**

**Normal user sees:**
- Chat, Data Management, Workflow, Scheduled Tasks

Sidebar bottom: user avatar/username dropdown → Profile, Change Password, Logout

The `activeNav` type extends to include `'users'` for the user management page (admin only). The sidebar conditionally renders navigation items based on `authStore.isAdmin`.

### New Pages & Components

| Component | Description |
|-----------|-------------|
| `LoginPage.vue` | Login form: username, password, submit button. Shows error for invalid credentials or locked account. |
| `ChangePasswordPage.vue` | Forced password change: new password, confirm password, password policy hints. Logout button available. |
| `UserManagementPage.vue` | User list table with search, create button. Columns: username, name, email, status (locked/active), created date, actions (edit/lock/unlock/delete). Create/edit via dialog. |
| `UserProfileDialog.vue` | Dialog for editing own profile: name, gender, birthDate, email. |
| `ChangePasswordDialog.vue` | Dialog for voluntary password change (within main app): old password, new password, confirm, policy hints. |
| `PasswordPolicyConfig.vue` | Component within global config settings page: min length slider, toggles for uppercase/lowercase/numbers/special chars. |

### i18n Extensions

Add keys under `auth`, `user`, `passwordPolicy` namespaces in both `zh-CN.ts` and `en-US.ts`:
- Login form labels, errors, placeholders
- User management table headers, actions, dialogs
- Password policy labels and validation messages
- Profile form labels
- Navigation items for new pages

---

## 5. Configuration Changes

### `.env` New Variables

```env
JWT_SECRET=your-jwt-secret-key-here
JWT_ACCESS_EXPIRES=2h
JWT_REFRESH_EXPIRES=7d
ADMIN_INITIAL_PASSWORD=Admin@123
ADMIN_EMAIL=admin@localhost
INTERNAL_PORT=3001
```

### `config.ts` Extensions

```typescript
jwt: {
  secret: process.env.JWT_SECRET || 'fallback-dev-secret',
  accessExpires: process.env.JWT_ACCESS_EXPIRES || '2h',
  refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
}
admin: {
  initialPassword: process.env.ADMIN_INITIAL_PASSWORD || 'Admin@123',
  email: process.env.ADMIN_EMAIL || 'admin@localhost',
}
internal: {
  port: parseInt(process.env.INTERNAL_PORT || '3001', 10),
}
```

### Nginx Configuration

- No changes needed — the internal server listens on a separate port (3001) not exposed by nginx
- Nginx continues to proxy only the main backend port (3000)

### Docker Compose Changes

- No port exposure for internal port 3001 (only accessible within the container via localhost)
- Add new env vars (`JWT_SECRET`, `ADMIN_INITIAL_PASSWORD`, `ADMIN_EMAIL`) to backend service

### New Dependencies

| Package | Location | Purpose |
|---------|----------|---------|
| `bcrypt` | backend | Password hashing |
| `@types/bcrypt` | backend (dev) | TypeScript types |
| `jsonwebtoken` | backend | JWT sign/verify |
| `@types/jsonwebtoken` | backend (dev) | TypeScript types |
| `cookie-parser` | backend | Parse httpOnly cookies |
| `@types/cookie-parser` | backend (dev) | TypeScript types |
| `vue-router` | frontend | Client-side routing |

Register `cookieParser()` middleware in `backend/src/index.ts` before route mounting (alongside existing `express.json()` and `express.urlencoded()`).

---

## 6. Backend Module Structure

```
backend/src/
├── auth/
│   ├── authMiddleware.ts      # JWT verification, req.user injection
│   ├── adminOnly.ts           # Admin role check middleware
│   ├── mustChangePassword.ts  # Force password change middleware
│   ├── authService.ts         # Login, refresh, logout, password change logic
│   ├── authRoutes.ts          # /api/auth/* route definitions
│   ├── loginRateLimiter.ts    # In-memory failed login tracking
│   └── adminInit.ts           # Startup admin user initialization + data migration
├── user/
│   ├── userService.ts         # CRUD, lock/unlock, password generation
│   └── userRoutes.ts          # /api/users/* route definitions
├── email/
│   └── emailService.ts        # SMTP email sending (welcome email)
├── internal/
│   └── internalServer.ts      # Separate Express server on localhost:3001
│                               # with POST /internal/reset-admin
├── types/
│   └── express.d.ts           # Express Request type augmentation for req.user
```

## 7. Error Codes

New error codes to add in `errors/errorCode.ts` (current LAST_USED_CODE: E00041, update to E00056).
Login rate limiting reuses existing `RATE_LIMIT_EXCEEDED` (E00006) for 429 responses.

| Code | Name | HTTP Status |
|------|------|-------------|
| E00042 | INVALID_CREDENTIALS | 401 |
| E00043 | ACCOUNT_LOCKED | 403 |
| E00044 | TOKEN_EXPIRED | 401 |
| E00045 | TOKEN_INVALID | 401 |
| E00046 | REFRESH_TOKEN_INVALID | 401 |
| E00047 | MUST_CHANGE_PASSWORD | 403 |
| E00048 | PASSWORD_POLICY_VIOLATION | 400 |
| E00049 | USERNAME_TAKEN | 400 |
| E00050 | EMAIL_TAKEN | 400 |
| E00051 | CANNOT_MODIFY_ADMIN | 403 |
| E00052 | CANNOT_DELETE_ADMIN | 403 |
| E00053 | CANNOT_LOCK_ADMIN | 403 |
| E00054 | UNAUTHORIZED | 401 |
| E00055 | FORBIDDEN | 403 |
| E00056 | SMTP_NOT_CONFIGURED | 400 |
