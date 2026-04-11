<template>
  <el-tooltip v-if="tokenUsage" :content="tooltipContent" placement="bottom" :show-after="300">
    <div class="usage-badge">
      <el-icon class="usage-badge__icon"><Coin /></el-icon>
      <span class="usage-badge__text">{{
        t('chat.tokenUsage.tokens', { n: formattedTotal })
      }}</span>
    </div>
  </el-tooltip>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Coin } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';
import { useChatStore } from '@/stores';

const { t } = useI18n();
const chatStore = useChatStore();

const tokenUsage = computed(() => chatStore.tokenUsage);

const formattedTotal = computed(() => {
  if (!tokenUsage.value) return '';
  const total = tokenUsage.value.totalTokens;
  if (total >= 1000) {
    return `${(total / 1000).toFixed(1)}k`;
  }
  return String(total);
});

const tooltipContent = computed(() => {
  if (!tokenUsage.value) return '';
  return `${t('chat.tokenUsage.prompt')}: ${tokenUsage.value.promptTokens}\n${t('chat.tokenUsage.completion')}: ${tokenUsage.value.completionTokens}\n${t('chat.tokenUsage.total')}: ${tokenUsage.value.totalTokens}`;
});
</script>

<style scoped lang="scss">
.usage-badge {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 4px 10px;
  font-size: 11px;
  color: var(--accent);
  cursor: default;
  background-color: var(--accent-tint10);
  border-radius: 100px;

  &__icon {
    font-size: 14px;
    color: var(--accent);
  }

  &__text {
    font-weight: 500;
  }
}
</style>
