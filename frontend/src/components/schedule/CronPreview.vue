<template>
  <div v-if="nextRunText" class="cron-preview">
    <span class="cron-preview__label">{{ t('schedule.cronNextRun') }}</span>
    <span class="cron-preview__time">{{ nextRunText }}</span>
  </div>
  <div v-else-if="cronExpr && !isValid" class="cron-preview cron-preview--error">
    <span>{{ t('schedule.cronInvalid') }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { CronExpressionParser } from 'cron-parser';

const props = defineProps<{
  cronExpr: string;
  timezone?: string;
}>();

const { t } = useI18n();

const parseResult = computed(() => {
  if (!props.cronExpr) return null;
  try {
    const interval = CronExpressionParser.parse(props.cronExpr, {
      tz: props.timezone || 'Asia/Shanghai',
    });
    return { next: interval.next().toDate(), valid: true };
  } catch {
    return { next: null, valid: false };
  }
});

const isValid = computed(() => parseResult.value?.valid ?? false);

const nextRunText = computed(() => {
  const result = parseResult.value;
  if (!result?.next) return '';
  return result.next.toLocaleString();
});
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.cron-preview {
  display: flex;
  gap: $spacing-xs;
  align-items: center;
  font-size: $font-size-xs;
  color: $text-muted;

  &__time {
    color: $accent;
  }

  &--error {
    color: $error;
  }
}
</style>
