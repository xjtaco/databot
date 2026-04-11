<template>
  <el-dialog
    :model-value="visible"
    :title="t('user.profileTitle')"
    width="460px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:visible', $event)"
    @open="loadProfile"
  >
    <el-form v-if="profileLoaded" ref="formRef" :model="form" :rules="rules" label-width="100px">
      <el-form-item :label="t('user.username')">
        <el-input :model-value="form.username" disabled />
      </el-form-item>
      <el-form-item :label="t('user.email')" prop="email">
        <el-input v-model="form.email" :placeholder="t('user.email')" />
      </el-form-item>
      <el-form-item :label="t('user.name')">
        <el-input v-model="form.name" :placeholder="t('user.name')" />
      </el-form-item>
      <el-form-item :label="t('user.gender')">
        <el-select v-model="form.gender" :placeholder="t('user.gender')" clearable>
          <el-option :label="t('user.genderOptions.male')" value="male" />
          <el-option :label="t('user.genderOptions.female')" value="female" />
          <el-option :label="t('user.genderOptions.other')" value="other" />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('user.birthDate')">
        <el-date-picker
          v-model="form.birthDate"
          type="date"
          :placeholder="t('user.birthDate')"
          value-format="YYYY-MM-DD"
          style="width: 100%"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:visible', false)">
        {{ t('common.cancel') }}
      </el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">
        {{ t('common.save') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import * as authApi from '@/api/auth';
import { useAuthStore } from '@/stores';

defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
}>();

const { t } = useI18n();
const authStore = useAuthStore();

const formRef = ref<FormInstance>();
const saving = ref(false);
const profileLoaded = ref(false);
const form = reactive({
  username: '',
  email: '',
  name: '',
  gender: '',
  birthDate: '',
});

const rules: FormRules = {
  email: [
    { required: true, message: () => t('user.validation.emailRequired'), trigger: 'blur' },
    { type: 'email', message: () => t('user.validation.emailInvalid'), trigger: 'blur' },
  ],
};

async function loadProfile(): Promise<void> {
  try {
    const profile = await authApi.getProfile();
    form.username = profile.username;
    form.email = profile.email;
    form.name = profile.name || '';
    form.gender = profile.gender || '';
    form.birthDate = profile.birthDate ? profile.birthDate.split('T')[0] : '';
    profileLoaded.value = true;
  } catch {
    profileLoaded.value = true;
  }
}

async function handleSave(): Promise<void> {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  saving.value = true;
  try {
    await authApi.updateProfile({
      name: form.name || undefined,
      gender: form.gender || undefined,
      birthDate: form.birthDate || null,
      email: form.email,
    });

    // Update the auth store user name
    await authStore.fetchProfile();

    ElMessage.success(t('user.profileSaveSuccess'));
    emit('update:visible', false);
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  } finally {
    saving.value = false;
  }
}
</script>
