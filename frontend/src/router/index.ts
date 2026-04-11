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
      component: () => import('@/layouts/MainLayout.vue'),
      meta: { requiresAuth: true },
    },
  ],
});

router.beforeEach(async (to) => {
  const authStore = useAuthStore();

  // On page refresh, try to restore auth from refresh token cookie
  if (!authStore.isAuthenticated && to.meta.requiresAuth !== false) {
    const restored = await authStore.refreshAccessToken();
    if (!restored) {
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
