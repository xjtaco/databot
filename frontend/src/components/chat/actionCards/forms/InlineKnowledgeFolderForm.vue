<template>
  <div class="inline-form-placeholder">
    <p>{{ payload.action }}</p>
    <el-button size="small" @click="emit('submit', 'succeeded', { resultSummary: 'Created' })"
      >Submit</el-button
    >
    <el-button size="small" @click="emit('cancel')">Cancel</el-button>
  </div>
</template>

<script setup lang="ts">
import type { UiActionCardPayload } from '@/types/actionCard';

defineProps<{ payload: UiActionCardPayload }>();
const emit = defineEmits<{
  submit: [status: 'succeeded' | 'failed', opts?: { resultSummary?: string; error?: string }];
  cancel: [];
}>();
</script>
