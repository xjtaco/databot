import { createApp } from 'vue';
import { pinia } from '@/stores';
import { i18n } from '@/locales';
import { useTheme } from '@/composables/useTheme';
import router from '@/router';
import App from './App.vue';

// Import Element Plus styles for programmatic components (ElMessage, ElNotification, etc.)
// These are not auto-imported by unplugin-vue-components since they're called programmatically
import 'element-plus/es/components/message/style/css';
import 'element-plus/es/components/message-box/style/css';

// Import global styles
import '@/styles/index.scss';

// Initialize theme before mounting to prevent flash of wrong theme
const { init } = useTheme();
init();

const app = createApp(App);

app.use(pinia);
app.use(i18n);
app.use(router);

app.mount('#app');
