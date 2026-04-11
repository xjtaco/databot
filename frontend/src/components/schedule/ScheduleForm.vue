<template>
  <el-form label-position="top" class="schedule-form">
    <!-- Task Name -->
    <el-form-item :label="t('schedule.taskName')" required>
      <el-input v-model="form.name" :placeholder="t('schedule.taskNamePlaceholder')" />
    </el-form-item>

    <!-- Description -->
    <el-form-item :label="t('schedule.descriptionLabel')">
      <el-input
        v-model="form.description"
        type="textarea"
        :rows="2"
        :placeholder="t('schedule.descriptionPlaceholder')"
      />
    </el-form-item>

    <!-- Workflow -->
    <el-form-item :label="t('schedule.workflow')" required>
      <el-select
        v-model="form.workflowId"
        :placeholder="t('schedule.workflowPlaceholder')"
        class="schedule-form__full-width"
        @change="handleWorkflowChange"
      >
        <el-option
          v-for="wf in workflowStore.workflows"
          :key="wf.id"
          :label="wf.name"
          :value="wf.id"
        />
      </el-select>
    </el-form-item>

    <!-- Schedule Type -->
    <el-form-item :label="t('schedule.scheduleType')">
      <div class="schedule-form__type-tabs">
        <button
          v-for="stype in scheduleTypes"
          :key="stype"
          type="button"
          class="schedule-form__type-tab"
          :class="{ 'schedule-form__type-tab--active': form.scheduleType === stype }"
          @click="form.scheduleType = stype"
        >
          {{ t(`schedule.${stype}`) }}
        </button>
      </div>
    </el-form-item>

    <!-- Time + Timezone (for daily/weekly/monthly) -->
    <template v-if="form.scheduleType !== 'cron'">
      <div class="schedule-form__row">
        <el-form-item :label="t('schedule.time')" class="schedule-form__row-item">
          <el-time-picker
            v-model="friendlyTime"
            format="HH:mm"
            value-format="HH:mm"
            class="schedule-form__full-width"
          />
        </el-form-item>
        <el-form-item :label="t('schedule.timezone')" class="schedule-form__row-item">
          <el-select v-model="form.timezone" class="schedule-form__full-width">
            <el-option v-for="tz in timezones" :key="tz" :label="tz" :value="tz" />
          </el-select>
        </el-form-item>
      </div>
    </template>

    <!-- Weekday Selector (weekly) -->
    <el-form-item v-if="form.scheduleType === 'weekly'">
      <div class="schedule-form__weekdays">
        <button
          v-for="day in weekdayOptions"
          :key="day.value"
          type="button"
          class="schedule-form__weekday-btn"
          :class="{ 'schedule-form__weekday-btn--active': selectedWeekdays.includes(day.value) }"
          @click="toggleWeekday(day.value)"
        >
          {{ day.label }}
        </button>
      </div>
    </el-form-item>

    <!-- Day of Month Selector (monthly) -->
    <el-form-item v-if="form.scheduleType === 'monthly'">
      <el-select v-model="selectedMonthDay" class="schedule-form__full-width">
        <el-option v-for="d in 31" :key="d" :label="String(d)" :value="d" />
      </el-select>
    </el-form-item>

    <!-- Cron Expression (cron) -->
    <template v-if="form.scheduleType === 'cron'">
      <el-form-item :label="t('schedule.cron')">
        <el-input v-model="form.cronExpr" :placeholder="t('schedule.cronPlaceholder')" />
      </el-form-item>
      <CronPreview :cron-expr="form.cronExpr" :timezone="form.timezone" />
    </template>

    <!-- Parameter Overrides -->
    <el-form-item v-if="workflowParams.length > 0" :label="t('schedule.params')">
      <p class="schedule-form__params-hint">{{ t('schedule.paramsHint') }}</p>
      <div v-for="param in workflowParams" :key="param" class="schedule-form__param-row">
        <span class="schedule-form__param-key">{{ param }}</span>
        <el-input
          v-model="form.params[param]"
          size="small"
          :placeholder="param"
          class="schedule-form__param-value"
        />
      </div>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorkflowStore } from '@/stores/workflowStore';
import { getWorkflow } from '@/api/workflow';
import type { ScheduleType, ScheduleDetail, CreateScheduleInput } from '@/types/schedule';
import type { WorkflowNodeInfo } from '@/types/workflow';
import CronPreview from './CronPreview.vue';

const props = defineProps<{
  editing?: ScheduleDetail | null;
}>();

const { t } = useI18n();
const workflowStore = useWorkflowStore();

const scheduleTypes: ScheduleType[] = ['daily', 'weekly', 'monthly', 'cron'];

const timezones = [
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Pacific/Auckland',
  'Australia/Sydney',
  'UTC',
];

const weekdayOptions = computed(() => [
  { value: 1, label: t('schedule.weekdays.mon') },
  { value: 2, label: t('schedule.weekdays.tue') },
  { value: 3, label: t('schedule.weekdays.wed') },
  { value: 4, label: t('schedule.weekdays.thu') },
  { value: 5, label: t('schedule.weekdays.fri') },
  { value: 6, label: t('schedule.weekdays.sat') },
  { value: 0, label: t('schedule.weekdays.sun') },
]);

// ── Form State ──────────────────────────────────────────
const form = reactive({
  name: '',
  description: '',
  workflowId: '',
  scheduleType: 'daily' as ScheduleType,
  cronExpr: '',
  timezone: 'Asia/Shanghai',
  params: {} as Record<string, string>,
});

const friendlyTime = ref('08:00');
const selectedWeekdays = ref<number[]>([1]);
const selectedMonthDay = ref(1);
const workflowParams = ref<string[]>([]);

// ── Computed cron from friendly fields ──────────────────
function buildCronExpr(): string {
  if (form.scheduleType === 'cron') return form.cronExpr;

  const parts = friendlyTime.value.split(':');
  const hour = parts[0] ?? '8';
  const minute = parts[1] ?? '0';

  if (form.scheduleType === 'daily') {
    return `${minute} ${hour} * * *`;
  }
  if (form.scheduleType === 'weekly') {
    const days = selectedWeekdays.value.length > 0 ? selectedWeekdays.value.join(',') : '1';
    return `${minute} ${hour} * * ${days}`;
  }
  if (form.scheduleType === 'monthly') {
    return `${minute} ${hour} ${selectedMonthDay.value} * *`;
  }
  return `${minute} ${hour} * * *`;
}

// ── Workflow Change → Extract Params ────────────────────
async function handleWorkflowChange(workflowId: string): Promise<void> {
  workflowParams.value = [];
  form.params = {};
  if (!workflowId) return;
  try {
    const detail = await getWorkflow(workflowId);
    workflowParams.value = extractParams(detail.nodes);
    for (const p of workflowParams.value) {
      form.params[p] = '';
    }
  } catch {
    // Silently ignore — user can still fill in manually
  }
}

function extractParams(nodes: WorkflowNodeInfo[]): string[] {
  const paramSet = new Set<string>();
  const regex = /\{\{params\.(\w+)\}\}/g;
  for (const node of nodes) {
    const cfg = node.config;
    if (cfg.nodeType === 'python') {
      scanText(cfg.script, regex, paramSet);
      for (const val of Object.values(cfg.params)) {
        if (typeof val === 'string') {
          scanText(val, regex, paramSet);
        } else {
          scanText(String(val.value), regex, paramSet);
        }
      }
    } else if (cfg.nodeType === 'llm') {
      scanText(cfg.prompt, regex, paramSet);
      for (const val of Object.values(cfg.params)) {
        if (typeof val === 'string') {
          scanText(val, regex, paramSet);
        } else {
          scanText(String(val.value), regex, paramSet);
        }
      }
    } else if (cfg.nodeType === 'sql') {
      scanText(cfg.sql, regex, paramSet);
    } else if (cfg.nodeType === 'email') {
      scanText(cfg.subject, regex, paramSet);
      if (cfg.body) scanText(cfg.body, regex, paramSet);
    }
  }
  return Array.from(paramSet);
}

function scanText(text: string, regex: RegExp, paramSet: Set<string>): void {
  // Reset regex lastIndex for each call
  regex.lastIndex = 0;
  let match = regex.exec(text);
  while (match !== null) {
    paramSet.add(match[1]);
    match = regex.exec(text);
  }
}

// ── Weekday Toggle ──────────────────────────────────────
function toggleWeekday(day: number): void {
  const idx = selectedWeekdays.value.indexOf(day);
  if (idx >= 0) {
    if (selectedWeekdays.value.length > 1) {
      selectedWeekdays.value.splice(idx, 1);
    }
  } else {
    selectedWeekdays.value.push(day);
  }
}

// ── Parse cron back to friendly fields (for editing) ────
function parseCronToFriendly(cronExpr: string, scheduleType: ScheduleType): void {
  const parts = cronExpr.split(/\s+/);
  if (parts.length < 5) return;
  const minute = parts[0];
  const hour = parts[1];
  friendlyTime.value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  if (scheduleType === 'weekly' && parts[4] !== '*') {
    selectedWeekdays.value = parts[4].split(',').map(Number);
  }
  if (scheduleType === 'monthly' && parts[2] !== '*') {
    selectedMonthDay.value = Number(parts[2]);
  }
}

// ── Watch editing prop to populate form ─────────────────
watch(
  () => props.editing,
  async (schedule) => {
    if (schedule) {
      form.name = schedule.name;
      form.description = schedule.description;
      form.workflowId = schedule.workflowId;
      form.scheduleType = schedule.scheduleType;
      form.cronExpr = schedule.cronExpr;
      form.timezone = schedule.timezone;
      form.params = { ...schedule.params };
      parseCronToFriendly(schedule.cronExpr, schedule.scheduleType);

      // Load workflow params
      if (schedule.workflowId) {
        try {
          const detail = await getWorkflow(schedule.workflowId);
          workflowParams.value = extractParams(detail.nodes);
          // Preserve existing param values, fill missing ones
          for (const p of workflowParams.value) {
            if (!(p in form.params)) {
              form.params[p] = '';
            }
          }
        } catch {
          // Silently ignore
        }
      }
    } else {
      // Reset form
      form.name = '';
      form.description = '';
      form.workflowId = '';
      form.scheduleType = 'daily';
      form.cronExpr = '';
      form.timezone = 'Asia/Shanghai';
      form.params = {};
      friendlyTime.value = '08:00';
      selectedWeekdays.value = [1];
      selectedMonthDay.value = 1;
      workflowParams.value = [];
    }
  },
  { immediate: true }
);

// ── Expose method to get submit input ───────────────────
function getSubmitInput(): CreateScheduleInput | null {
  if (!form.name.trim() || !form.workflowId) return null;

  const cronExpr = buildCronExpr();
  if (!cronExpr) return null;

  // Filter out empty param values
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(form.params)) {
    if (value.trim()) {
      params[key] = value;
    }
  }

  return {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    workflowId: form.workflowId,
    scheduleType: form.scheduleType,
    cronExpr,
    timezone: form.timezone,
    params: Object.keys(params).length > 0 ? params : undefined,
    enabled: true,
  };
}

defineExpose({ getSubmitInput });
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.schedule-form {
  &__full-width {
    width: 100%;
  }

  &__type-tabs {
    display: flex;
    gap: $spacing-xs;
    width: 100%;
  }

  &__type-tab {
    flex: 1;
    padding: $spacing-sm $spacing-md;
    font-size: $font-size-sm;
    color: $text-secondary-color;
    cursor: pointer;
    background: transparent;
    border: 1px solid $border-dark;
    border-radius: $radius-md;
    transition: all $transition-fast;

    &:hover {
      background: $bg-elevated;
      border-color: $border-elevated;
    }

    &--active {
      color: $accent;
      background: $accent-tint10;
      border-color: $accent;
    }
  }

  &__row {
    display: flex;
    gap: $spacing-md;
  }

  &__row-item {
    flex: 1;
  }

  &__weekdays {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-xs;
  }

  &__weekday-btn {
    padding: $spacing-xs $spacing-sm;
    font-size: $font-size-sm;
    color: $text-secondary-color;
    cursor: pointer;
    background: transparent;
    border: 1px solid $border-dark;
    border-radius: $radius-md;
    transition: all $transition-fast;

    &:hover {
      border-color: $border-elevated;
    }

    &--active {
      color: $accent;
      background: $accent-tint10;
      border-color: $accent;
    }
  }

  &__params-hint {
    margin: 0 0 $spacing-sm;
    font-size: $font-size-xs;
    color: $text-muted;
  }

  &__param-row {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    margin-bottom: $spacing-xs;
  }

  &__param-key {
    min-width: 100px;
    font-family: $font-family-mono;
    font-size: $font-size-sm;
    color: $text-secondary-color;
  }

  &__param-value {
    flex: 1;
  }
}
</style>
