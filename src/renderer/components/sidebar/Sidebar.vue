<template>
  <aside class="sidebar" role="navigation" aria-label="Primary navigation">
    <!-- TOP: app / session state (online status, later: recording timer) -->
    <div class="section top">
      <StatusDot />
    </div>

    <!-- MIDDLE: primary functional areas (driven by config list) -->
    <div class="section middle" aria-label="Main navigation">
      <SidebarElement
        v-for="item in middleItems"
        :key="item.key"
        :icon="item.icon"
        :label="item.label"
        :active="activeKey === item.key"
        @click="setActive(item.key)"
      />
    </div>

    <!-- BOTTOM: meta / utility actions (settings, about, etc.) -->
    <div class="section bottom" aria-label="Utility navigation">
      <SidebarElement
        v-for="item in bottomItems"
        :key="item.key"
        :icon="item.icon"
        :label="item.label"
        :active="activeKey === item.key"
        @click="setActive(item.key)"
      />
    </div>
  </aside>
</template>

<script setup lang="ts">

import { ref } from 'vue';
import StatusDot from './StatusDot.vue';
import SidebarElement from './SidebarElement.vue';
import { middleItems, bottomItems } from './navItems';

const activeKey = ref<string>('library');
function setActive(key: string) {
  activeKey.value = key;
}

defineExpose({ setActive, activeKey });
</script>

<style scoped>
/* LAYOUT ROOT -------------------------------------------------------------- */
.sidebar {
  display: flex;
  flex-direction: column;
  width: 80px; /* Narrow vertical bar */
  background: #fff;
  border-radius: 0 15px 15px 0; /* Rounded only on the right side */
  padding: 0.75rem 0.4rem 0.75rem;
  box-sizing: border-box;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  height: 100vh; /* Full viewport height */
  overflow: hidden; /* Prevent any scrollbars */
  -webkit-font-smoothing: antialiased;
}

/* SECTION WRAPPERS -------------------------------------------------------- */
.section {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
.top {
  flex: 0 0 auto;
  padding-bottom: 0.35rem;
}
.middle {
  flex: 0 0 auto;
  justify-content: flex-start;
  margin-top: auto;
  margin-bottom: auto;
}
.bottom {
  flex: 0 0 auto;
  padding-top: 0.35rem;
}

.sidebar * {
  max-width: 100%;
}
.sidebar .icon {
  overflow: hidden;
  width: 100%;
  display: flex;
  justify-content: center;
}
</style>
