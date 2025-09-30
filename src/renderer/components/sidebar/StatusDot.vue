<template>
  <SidebarElement
    class="status-container"
    :element-class="'status'"
    :compact="true"
    :highlightable="false"
    :clickable="false"
    cursor="default"
    aria-label="Online status indicator"
  >
    <div class="dot" :class="{ online: isOnline }" aria-hidden="true"></div>
    <div class="mode-chip" :class="{ online: isOnline, offline: !isOnline }">
      {{ isOnline ? 'Online' : 'Offline' }}
    </div>
  </SidebarElement>
</template>

<script setup>
import { ref } from 'vue';
import SidebarElement from './SidebarElement.vue';

// Local reactive state
const isOnline = ref(true);

const emit = defineEmits(['change']);

function toggleStatus() {
  isOnline.value = !isOnline.value;
  emit('change', isOnline.value);
}
</script>

<style scoped>
.status-container {
  gap: 0.4rem;
}

.dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background-color: #ff5252; /* offline red */
  box-shadow:
    0 0 0 2px #fff,
    0 0 4px rgba(0, 0, 0, 0.15);
  transition: background-color 0.2s ease;
}

/* Online state color */
.dot.online {
  background-color: #34c759;
}

/* Chip styling */
.mode-chip {
  background-color: #ffe2e2;
  color: #b40000;
  padding: 0.25em 0.55em;
  border-radius: 12px;
  font-size: 0.62rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  line-height: 1;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
  min-width: 52px;
  text-align: center;
}
.mode-chip.online {
  background-color: #d6f8da;
  color: #1d6f2b;
}
</style>
