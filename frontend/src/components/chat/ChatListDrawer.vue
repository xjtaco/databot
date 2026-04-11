<template>
  <el-drawer
    v-model="chatSessionStore.isDrawerOpen"
    direction="rtl"
    size="360px"
    :show-close="false"
    :with-header="false"
    class="chat-list-drawer"
  >
    <div class="chat-list-drawer__header">
      <span class="chat-list-drawer__title">{{ t('chat.chatList.title') }}</span>
      <div class="chat-list-drawer__actions">
        <IconButton :title="t('chat.chatList.search')" @click="showSearch = !showSearch">
          <Search :size="16" />
        </IconButton>
        <IconButton :title="t('common.close')" @click="chatSessionStore.closeDrawer()">
          <X :size="16" />
        </IconButton>
      </div>
    </div>

    <div v-if="showSearch" class="chat-list-drawer__search">
      <el-input
        v-model="searchInput"
        :placeholder="t('chat.chatList.search')"
        clearable
        size="small"
        @input="chatSessionStore.setSearchQuery(searchInput)"
      />
    </div>

    <div class="chat-list-drawer__body">
      <template v-if="chatSessionStore.groupedSessions.length > 0">
        <div
          v-for="group in chatSessionStore.groupedSessions"
          :key="group.labelKey"
          class="chat-list-group"
        >
          <div class="chat-list-group__label">{{ t(group.labelKey) }}</div>
          <div
            v-for="session in group.sessions"
            :key="session.id"
            class="chat-list-item"
            :class="{ 'chat-list-item--active': session.id === chatSessionStore.activeSessionId }"
            @click="handleSelect(session.id)"
          >
            <div class="chat-list-item__header">
              <span class="chat-list-item__title">{{
                session.title || t('chat.chatList.untitled')
              }}</span>
              <span class="chat-list-item__time">{{
                formatSessionTime(session.lastMessageAt || session.updatedAt)
              }}</span>
            </div>
            <div v-if="session.lastMessagePreview" class="chat-list-item__preview">
              {{ session.lastMessagePreview }}
            </div>
            <button class="chat-list-item__delete" @click.stop="handleDelete(session.id)">
              <Trash2 :size="14" />
            </button>
          </div>
        </div>
      </template>
      <div v-else class="chat-list-drawer__empty">
        {{
          chatSessionStore.searchQuery ? t('chat.chatList.noResults') : t('chat.chatList.noChats')
        }}
      </div>
    </div>

    <div class="chat-list-drawer__footer">
      <el-button type="primary" class="chat-list-drawer__new-btn" @click="$emit('new-chat')">
        <Plus :size="16" />
        {{ t('chat.chatList.newChat') }}
      </el-button>
    </div>
  </el-drawer>

  <ConfirmDialog
    v-model:visible="showDeleteConfirm"
    :title="t('common.warning')"
    :message="t('chat.chatList.deleteConfirm')"
    type="danger"
    :loading="isDeleting"
    @confirm="confirmDelete"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Search, X, Plus, Trash2 } from 'lucide-vue-next';
import IconButton from '@/components/common/IconButton.vue';
import { ConfirmDialog } from '@/components/common';
import { formatSessionTime } from '@/utils/time';
import { useChatListActions } from '@/composables/useChatListActions';

const emit = defineEmits<{
  'select-session': [id: string];
  'new-chat': [];
}>();

const { t } = useI18n();
const {
  chatSessionStore,
  showDeleteConfirm,
  isDeleting,
  handleSelect,
  handleDelete,
  confirmDelete,
} = useChatListActions(emit);

const showSearch = ref(false);
const searchInput = ref('');
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/chat-list';

.chat-list-drawer__header {
  display: flex;
  gap: $spacing-sm;
  align-items: center;
  padding: $spacing-md 20px;
  border-bottom: 1px solid $border-dark;
}

.chat-list-drawer__title {
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
  color: $text-primary-color;
}

.chat-list-drawer__actions {
  display: flex;
  gap: $spacing-sm;
  margin-left: auto;
}

.chat-list-drawer__search {
  padding: $spacing-sm $spacing-md;
}

.chat-list-drawer__body {
  flex: 1;
  padding: 12px;
  overflow-y: auto;
}

.chat-list-item__delete {
  position: absolute;
  top: $spacing-sm;
  right: $spacing-sm;
  padding: $spacing-xs;
  color: $text-muted;
  cursor: pointer;
  background: none;
  border: none;
  border-radius: $radius-sm;
  opacity: 0;
  transition:
    opacity $transition-fast,
    color $transition-fast,
    background-color $transition-fast;

  &:hover {
    color: $error;
    background: $bg-elevated;
  }
}

.chat-list-item:hover .chat-list-item__delete {
  opacity: 1;
}

.chat-list-drawer__empty {
  padding: 40px 20px;
  font-size: 13px;
  color: $text-muted;
  text-align: center;
}

.chat-list-drawer__footer {
  padding: $spacing-md;
  border-top: 1px solid $border-dark;
}

.chat-list-drawer__new-btn {
  width: 100%;
}
</style>
