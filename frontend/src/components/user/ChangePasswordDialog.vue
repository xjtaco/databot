<template>
  <el-dialog
    :model-value="visible"
    :title="t('auth.changePasswordTitle')"
    width="460px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:visible', $event)"
    @open="loadPolicy"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
      <el-form-item :label="t('auth.oldPassword')" prop="oldPassword">
        <el-input
          v-model="form.oldPassword"
          type="password"
          show-password
          :placeholder="t('auth.oldPasswordPlaceholder')"
        />
      </el-form-item>
      <el-form-item :label="t('auth.newPassword')" prop="newPassword">
        <el-popover :visible="newPasswordFocused && policyLoaded" placement="top" :width="280">
          <div class="change-password-dialog__policy">
            <span class="change-password-dialog__policy-tag">
              {{ t('auth.passwordPolicy.minLength', { n: policy.minLength }) }}
            </span>
            <span v-if="policy.requireUppercase" class="change-password-dialog__policy-tag">
              {{ t('auth.passwordPolicy.requireUppercase') }}
            </span>
            <span v-if="policy.requireLowercase" class="change-password-dialog__policy-tag">
              {{ t('auth.passwordPolicy.requireLowercase') }}
            </span>
            <span v-if="policy.requireNumbers" class="change-password-dialog__policy-tag">
              {{ t('auth.passwordPolicy.requireNumbers') }}
            </span>
            <span v-if="policy.requireSpecialChars" class="change-password-dialog__policy-tag">
              {{ t('auth.passwordPolicy.requireSpecialChars') }}
            </span>
          </div>
          <template #reference>
            <el-input
              v-model="form.newPassword"
              type="password"
              show-password
              :placeholder="t('auth.newPasswordPlaceholder')"
              @focus="newPasswordFocused = true"
              @blur="newPasswordFocused = false"
            />
          </template>
        </el-popover>
      </el-form-item>
      <el-form-item :label="t('auth.confirmPassword')" prop="confirmPassword">
        <el-input
          v-model="form.confirmPassword"
          type="password"
          show-password
          :placeholder="t('auth.confirmPasswordPlaceholder')"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:visible', false)">
        {{ t('common.cancel') }}
      </el-button>
      <el-button type="primary" :loading="saving" @click="handleSubmit">
        {{ t('common.confirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import * as authApi from '@/api/auth';
import type { PasswordPolicy } from '@/types/auth';

defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
}>();

const { t } = useI18n();

const formRef = ref<FormInstance>();
const saving = ref(false);
const policyLoaded = ref(false);
const newPasswordFocused = ref(false);
const policy = ref<PasswordPolicy>({
  minLength: 8,
  requireUppercase: false,
  requireLowercase: false,
  requireNumbers: false,
  requireSpecialChars: false,
});

const form = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
});

const rules: FormRules = {
  oldPassword: [
    { required: true, message: () => t('auth.validation.oldPasswordRequired'), trigger: 'blur' },
  ],
  newPassword: [
    { required: true, message: () => t('auth.validation.newPasswordRequired'), trigger: 'blur' },
  ],
  confirmPassword: [
    {
      required: true,
      message: () => t('auth.validation.confirmPasswordRequired'),
      trigger: 'blur',
    },
    {
      validator: (_rule: unknown, value: string, callback: (err?: Error) => void) => {
        if (value !== form.newPassword) {
          callback(new Error(t('auth.passwordMismatch')));
        } else {
          callback();
        }
      },
      trigger: 'blur',
    },
  ],
};

async function loadPolicy(): Promise<void> {
  form.oldPassword = '';
  form.newPassword = '';
  form.confirmPassword = '';
  try {
    policy.value = await authApi.getPasswordPolicy();
    policyLoaded.value = true;
  } catch {
    policyLoaded.value = true;
  }
}

async function handleSubmit(): Promise<void> {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  saving.value = true;
  try {
    await authApi.changePassword({
      oldPassword: form.oldPassword,
      newPassword: form.newPassword,
    });

    ElMessage.success(t('auth.changePasswordSuccess'));
    emit('update:visible', false);
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : t('auth.changePasswordFailed'));
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.change-password-dialog {
  &__policy {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-xs;
  }

  &__policy-tag {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    font-size: $font-size-xs;
    color: $text-muted;
    white-space: nowrap;
    background-color: $bg-elevated;
    border: 1px solid $border-dark;
    border-radius: $radius-full;
  }
}
</style>
