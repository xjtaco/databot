<template>
  <div class="database-connection-button">
    <IconButton :title="t('sidebar.newConnectionTooltip')" @click="showDialog = true">
      <Plug :size="18" />
    </IconButton>

    <DatabaseConnectionDialog v-model="showDialog" @success="handleSuccess" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Plug } from 'lucide-vue-next';
import IconButton from '@/components/common/IconButton.vue';
import DatabaseConnectionDialog from './DatabaseConnectionDialog.vue';

const { t } = useI18n();
const showDialog = ref(false);

function handleSuccess(): void {
  // Dialog handles refreshing the datasources list
}
</script>

<style scoped lang="scss">
.database-connection-button {
  display: contents;
}
</style>
