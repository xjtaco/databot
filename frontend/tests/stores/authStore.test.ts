import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '@/stores/authStore';

// Mock the auth API
vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  getProfile: vi.fn(),
}));

describe('authStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('should start with empty state', () => {
    const store = useAuthStore();

    expect(store.accessToken).toBeNull();
    expect(store.user).toBeNull();
    expect(store.isAuthenticated).toBe(false);
    expect(store.isAdmin).toBe(false);
    expect(store.mustChangePassword).toBe(false);
  });

  it('should set state after successful login', async () => {
    const { login: mockLogin } = await import('@/api/auth');
    const loginFn = vi.mocked(mockLogin);
    loginFn.mockResolvedValue({
      accessToken: 'test-token',
      user: {
        id: '1',
        username: 'admin',
        name: 'Admin',
        role: 'admin',
        mustChangePassword: false,
      },
    });

    const store = useAuthStore();
    await store.login('admin', 'password');

    expect(store.accessToken).toBe('test-token');
    expect(store.user?.username).toBe('admin');
    expect(store.isAuthenticated).toBe(true);
    expect(store.isAdmin).toBe(true);
    expect(store.mustChangePassword).toBe(false);
  });

  it('should detect mustChangePassword', async () => {
    const { login: mockLogin } = await import('@/api/auth');
    const loginFn = vi.mocked(mockLogin);
    loginFn.mockResolvedValue({
      accessToken: 'test-token',
      user: {
        id: '2',
        username: 'newuser',
        name: null,
        role: 'member',
        mustChangePassword: true,
      },
    });

    const store = useAuthStore();
    await store.login('newuser', 'password');

    expect(store.mustChangePassword).toBe(true);
    expect(store.isAdmin).toBe(false);
  });

  it('should clear state on logout', async () => {
    const { login: mockLogin, logout: mockLogout } = await import('@/api/auth');
    const loginFn = vi.mocked(mockLogin);
    const logoutFn = vi.mocked(mockLogout);

    loginFn.mockResolvedValue({
      accessToken: 'test-token',
      user: {
        id: '1',
        username: 'admin',
        name: 'Admin',
        role: 'admin',
        mustChangePassword: false,
      },
    });
    logoutFn.mockResolvedValue(undefined);

    const store = useAuthStore();
    await store.login('admin', 'password');
    expect(store.isAuthenticated).toBe(true);

    await store.logout();
    expect(store.accessToken).toBeNull();
    expect(store.user).toBeNull();
    expect(store.isAuthenticated).toBe(false);
  });

  it('should clear auth on clearAuth', async () => {
    const { login: mockLogin } = await import('@/api/auth');
    const loginFn = vi.mocked(mockLogin);
    loginFn.mockResolvedValue({
      accessToken: 'test-token',
      user: {
        id: '1',
        username: 'admin',
        name: 'Admin',
        role: 'admin',
        mustChangePassword: false,
      },
    });

    const store = useAuthStore();
    await store.login('admin', 'password');
    expect(store.isAuthenticated).toBe(true);

    store.clearAuth();
    expect(store.accessToken).toBeNull();
    expect(store.user).toBeNull();
    expect(store.isAuthenticated).toBe(false);
  });

  it('should return false on refresh failure', async () => {
    const { refresh: mockRefresh } = await import('@/api/auth');
    const refreshFn = vi.mocked(mockRefresh);
    refreshFn.mockRejectedValue(new Error('Invalid refresh token'));

    const store = useAuthStore();
    const result = await store.refreshAccessToken();

    expect(result).toBe(false);
    expect(store.isAuthenticated).toBe(false);
  });

  it('should update mustChangePassword via setter', async () => {
    const { login: mockLogin } = await import('@/api/auth');
    const loginFn = vi.mocked(mockLogin);
    loginFn.mockResolvedValue({
      accessToken: 'test-token',
      user: {
        id: '2',
        username: 'user',
        name: null,
        role: 'member',
        mustChangePassword: true,
      },
    });

    const store = useAuthStore();
    await store.login('user', 'password');
    expect(store.mustChangePassword).toBe(true);

    store.setMustChangePassword(false);
    expect(store.mustChangePassword).toBe(false);
  });
});
