<template>
  <Teleport to="body">
    <Transition name="bottom-sheet">
      <div v-if="chatSessionStore.isDrawerOpen" class="chat-list-sheet">
        <div class="chat-list-sheet__overlay" @click="chatSessionStore.closeDrawer()"></div>
        <div class="chat-list-sheet__panel">
          <div class="chat-list-sheet__handle">
            <div class="chat-list-sheet__handle-bar"></div>
          </div>
          <div class="chat-list-sheet__header">
            <MessageSquare :size="20" class="chat-list-sheet__icon" />
            <span class="chat-list-sheet__title">{{ t('chat.chatList.title') }}</span>
          </div>
          <div class="chat-list-sheet__body">
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
                  :class="{
                    'chat-list-item--active': session.id === chatSessionStore.activeSessionId,
                  }"
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
            <div v-else class="chat-list-sheet__empty">
              {{ t('chat.chatList.noChats') }}
            </div>
          </div>
          <div class="chat-list-sheet__footer">
            <el-button type="primary" class="chat-list-sheet__new-btn" @click="$emit('new-chat')">
              <Plus :size="16" />
              {{ t('chat.chatList.newChat') }}
            </el-button>
          </div>
        </div>
      </div>
    </Transition>

    <ConfirmDialog
      v-model:visible="showDeleteConfirm"
      :title="t('common.warning')"
      :message="t('chat.chatList.deleteConfirm')"
      type="danger"
      :loading="isDeleting"
      @confirm="confirmDelete"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MessageSquare, Plus, Trash2 } from 'lucide-vue-next';
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
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/chat-list';

.chat-list-sheet {
  position: fixed;
  inset: 0;
  z-index: $z-index-modal;
}

.chat-list-sheet__overlay {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 50%);
}

.chat-list-sheet__panel {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  max-height: 70vh;
  background: $bg-sidebar;
  border-radius: 24px 24px 0 0;
}

.chat-list-sheet__handle {
  display: flex;
  justify-content: center;
  padding: 12px 0;
}

.chat-list-sheet__handle-bar {
  width: 40px;
  height: 4px;
  background: $border-elevated;
  border-radius: 2px;
}

.chat-list-sheet__header {
  display: flex;
  gap: $spacing-sm;
  align-items: center;
  padding: $spacing-sm 20px $spacing-md 20px;
}

.chat-list-sheet__icon {
  color: $accent;
}

.chat-list-sheet__title {
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
  color: $text-primary-color;
}

.chat-list-sheet__body {
  flex: 1;
  padding: 0 $spacing-md $spacing-md;
  overflow-y: auto;
}

.chat-list-item__delete {
  position: absolute;
  top: $spacing-sm;
  right: $spacing-sm;
  padding: 10px;
  color: $text-muted;
  cursor: pointer;
  background: none;
  border: none;
  border-radius: $radius-sm;
  transition:
    color $transition-fast,
    background-color $transition-fast;

  &:active {
    color: $error;
    background: $bg-elevated;
  }
}

.chat-list-sheet__empty {
  padding: 40px 20px;
  font-size: 13px;
  color: $text-muted;
  text-align: center;
}

.chat-list-sheet__footer {
  padding: 12px 20px 24px;
  padding-bottom: max(24px, env(safe-area-inset-bottom, 0px));
}

.chat-list-sheet__new-btn {
  width: 100%;
}

// Transition: slide up
.bottom-sheet-enter-active,
.bottom-sheet-leave-active {
  transition: opacity $transition-normal;

  .chat-list-sheet__panel {
    transition: transform $transition-normal;
  }
}

.bottom-sheet-enter-from,
.bottom-sheet-leave-to {
  opacity: 0;

  .chat-list-sheet__panel {
    transform: translateY(100%);
  }
}
</style>
