<!-- Reusable clickable block in the sidebar. -->
<template>
  <!-- button gives keyboard + accessibility semantics -->
  <button
    class="sidebar-element"
    :class="[
      { active: active, compact, 'no-hover': !highlightable },
      elementClass,
    ]"
    type="button"
    :aria-label="label"
    @click="handleClick"
    :style="{ cursor: cursor, pointerEvents: clickable ? 'auto' : 'none' }"
  >
    <!-- Icon -->
    <div v-if="icon" class="icon" aria-hidden="true">{{ icon }}</div>
    <!-- Hides label in compact mode -->
    <div v-if="label && !compact" class="label">{{ label }}</div>
    <!-- Slots lets special cases inject custom extra content -->
    <slot />
  </button>
</template>

<script setup lang="ts">

const props = defineProps({
  elementClass: { type: String, default: '' },
  compact: { type: Boolean, default: false },
  icon: { type: String, default: '' },
  label: { type: String, default: '' },
  active: { type: Boolean, default: false },
  // When false, suppresses hover/press background highlighting
  highlightable: { type: Boolean, default: true },
  // When false, disables clicks and pointer events
  clickable: { type: Boolean, default: true },
  // Overrides cursor style (e.g., 'default', 'none', 'pointer')
  cursor: { type: String, default: 'pointer' },
});

// Emits a simple click event so parent can set active item.
const emit = defineEmits<{ (e: 'click'): void }>();
function handleClick() {
  if (!props.clickable) return;
  emit('click');
}
</script>

<style scoped>
.sidebar-element {
  all: unset;
  box-sizing: border-box;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.6rem 0.4rem;
  border-radius: 6px;
  user-select: none;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
  position: relative;
}
/* Interaction states */
.sidebar-element:hover {
  background: rgba(0, 0, 0, 0.06);
}
.sidebar-element:active {
  background: rgba(0, 0, 0, 0.12);
}

.sidebar-element.no-hover:hover,
.sidebar-element.no-hover:active {
  background: transparent;
}

.sidebar-element.active {
  background: #eef4ff;
  box-shadow: 0 0 0 1px #d0e2ff inset;
}
.icon {
  font-size: 1.2rem;
  line-height: 1;
}
.label {
  font-size: 0.58rem;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  text-align: center;
  color: #555;
}
.sidebar-element.active .label {
  color: #1d4ed8;
}

.compact .label {
  display: none;
}
</style>
