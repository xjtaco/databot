import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { AuthUser, UserProfile } from '@/types/auth';
import * as authApi from '@/api/auth';

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null);
  const user = ref<AuthUser | null>(null);

  const isAuthenticated = computed(() => !!accessToken.value && !!user.value);
  const isAdmin = computed(() => user.value?.role === 'admin');
  const mustChangePassword = computed(() => user.value?.mustChangePassword ?? false);

  async function login(username: string, password: string): Promise<void> {
    const result = await authApi.login({ username, password });
    accessToken.value = result.accessToken;
    user.value = result.user;
  }

  async function refreshAccessToken(): Promise<boolean> {
    try {
      const result = await authApi.refresh();
      accessToken.value = result.accessToken;

      // When restoring from refresh (page reload), user data is missing — fetch profile
      if (!user.value) {
        await fetchProfile();
      }

      return true;
    } catch {
      clearAuth();
      return false;
    }
  }

  async function fetchProfile(): Promise<void> {
    const profile: UserProfile = await authApi.getProfile();
    user.value = {
      id: profile.id,
      username: profile.username,
      name: profile.name,
      role: profile.role,
      mustChangePassword: profile.mustChangePassword,
    };
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout();
    } catch {
      // Ignore errors — we clear local state regardless
    }
    clearAuth();
  }

  function clearAuth(): void {
    accessToken.value = null;
    user.value = null;
  }

  function setMustChangePassword(value: boolean): void {
    if (user.value) {
      user.value = { ...user.value, mustChangePassword: value };
    }
  }

  return {
    accessToken,
    user,
    isAuthenticated,
    isAdmin,
    mustChangePassword,
    login,
    refreshAccessToken,
    fetchProfile,
    logout,
    clearAuth,
    setMustChangePassword,
  };
});
