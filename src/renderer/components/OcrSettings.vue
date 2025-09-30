<template>
  <div class="ocr-settings">
    <header class="panel-header">
      <h3>OCR Settings</h3>
    </header>

    <section class="section">
      <h4>Language</h4>
      <div class="lang-grid">
        <label
          v-for="option in languageOptions"
          :key="option.value"
          class="lang-option"
        >
          <input
            type="checkbox"
            :value="option.value"
            :checked="localLanguages.has(option.value)"
            @change="toggleLanguage(option.value, $event.target.checked)"
          />
          <span>{{ option.label }}</span>
        </label>
      </div>
    </section>

    <section class="section">
      <h4>Correction</h4>
      <div class="toggle">
        <input
          type="checkbox"
          :checked="props.jockaigneEnabled"
          @change="emit('update:jockaigne-enabled', $event.target.checked)"
        />
        <span>Enable Jockaigne error correction</span>
      </div>
      <small class="hint"
        >Uses the Jockaigne Java library to refine OCR output locally.</small
      >
    </section>

    <section class="section">
      <h4>Engine</h4>
      <div class="engine-grid">
        <label>
          Page segmentation
          <select
            :value="pageSegMode"
            @change="emit('update:pageSegMode', $event.target.value)"
          >
            <option
              v-for="option in psmOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </label>
        <label>
          DPI hint
          <input
            type="number"
            min="70"
            max="600"
            step="10"
            :value="dpi"
            @input="
              emit('update:dpi', clampNumber($event.target.value, 70, 600, 70))
            "
          />
        </label>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, reactive, watch } from 'vue';

// Props define external configuration
const props = defineProps({
  languages: { type: Array, default: () => ['eng'] },
  pageSegMode: { type: String, default: '3' },
  dpi: { type: Number, default: 150 },
  jockaigneEnabled: { type: Boolean, default: false },
});

const emit = defineEmits([
  'update:languages',
  'update:pageSegMode',
  'update:dpi',
  'update:jockaigne-enabled',
]);

const languageOptions = [
  { label: 'English', value: 'eng' },
  { label: 'German', value: 'deu' },
];

const psmOptions = [
  { value: '3', label: 'Auto (default)' },
  { value: '4', label: 'Single Column' },
  { value: '6', label: 'Single Block' },
  { value: '7', label: 'Single Line' },
  { value: '11', label: 'Sparse Text' },
];

const localLanguages = reactive(new Set(props.languages));

watch(
  () => props.languages,
  next => {
    localLanguages.clear();
    next.forEach(lang => localLanguages.add(lang));
  }
);

function toggleLanguage(lang, checked) {
  if (checked) {
    localLanguages.add(lang);
  } else {
    localLanguages.delete(lang);
  }
  if (localLanguages.size === 0) {
    localLanguages.add('eng');
  }
  emit('update:languages', Array.from(localLanguages));
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (Number.isNaN(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}
</script>

<style scoped>
.ocr-settings {
  flex: 1;
  background: #ffffff;
  padding: 1rem;
  border-radius: 15px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-height: 100%;
  overflow-y: auto;
}

.panel-header {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.panel-header h3 {
  margin: 0;
  color: #333;
}

.section {
  border: 1px solid #e4e4e4;
  border-radius: 12px;
  padding: 0.8rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.section h4 {
  margin: 0;
  font-size: 0.9rem;
  color: #333;
}
.section-help {
  margin: 0;
  font-size: 0.75rem;
  color: #666;
}

.lang-grid {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.lang-option {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
}
.lang-option input {
  accent-color: #007bff;
}

.hint {
  font-size: 0.7rem;
  color: #888;
}

.engine-grid {
  display: grid;
  gap: 0.6rem;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  align-items: center;
}
.engine-grid select,
.engine-grid input[type='number'] {
  margin-top: 0.3rem;
  padding: 0.45rem;
  border-radius: 6px;
  border: 1px solid #d0d5dd;
  font-size: 0.8rem;
}
</style>
