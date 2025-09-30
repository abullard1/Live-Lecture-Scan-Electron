<template>
  <div class="camera-settings">
    <h3>Camera Settings</h3>
    <div class="settings-controls">
      <!-- Device selection -->
      <div class="setting-item">
        <label for="Device">Device:</label>
        <select id="device" v-model="selectedDevice" @change="changeDevice">
          <option
            v-for="device in devices"
            :key="device.deviceId"
            :value="device.deviceId"
          >
            {{ device.label || 'Camera ' + device.deviceId }}
          </option>
        </select>
      </div>
      <!-- Frame rate selection -->
      <div class="setting-item">
        <label for="frameRate">Frame Rate:</label>
        <select
          id="frameRate"
          v-model="selectedFrameRate"
          @change="updateFrameRate"
        >
          <option value="15">15 FPS</option>
          <option value="30">30 FPS</option>
          <option value="60">60 FPS</option>
        </select>
      </div>
      <!-- OCR CONTROLS SECTION ---------------------------------------------------->
      <fieldset class="ocr-section">
        <legend>OCR</legend>
        <!-- Toggle button: Turns OCR processing on/off (camera always runs) -->
        <button @click="toggleOCR" :class="{ ocrEnabled: modelValue }">
          {{ modelValue ? 'Disable OCR' : 'Enable OCR' }}
        </button>

        <!-- Interval control: How frequently we attempt OCR (in seconds) -->
        <div class="interval-row">
          <label for="ocrInterval">Interval (seconds)</label>
          <input
            id="ocrInterval"
            type="number"
            min="1"
            max="30"
            step="1"
            :value="intervalSeconds"
            @input="onIntervalInput($event)"
          />
          <small class="hint">Every {{ intervalSeconds }}s</small>
        </div>

        <div class="interval-presets">
          <button type="button" @click="setPreset(2000)">2s</button>
          <button type="button" @click="setPreset(4000)">4s</button>
          <button type="button" @click="setPreset(6000)">6s</button>
          <button type="button" @click="setPreset(10000)">10s</button>
        </div>

        <div class="ocr-status" :class="{ on: modelValue }">
          Status: <strong>{{ modelValue ? 'Running' : 'Stopped' }}</strong>
        </div>
      </fieldset>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';

// PROPS & EMITS
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  ocrInterval: { type: Number, default: 4000 }, // milliseconds
});
const emit = defineEmits([
  'update:modelValue',
  'update:ocr-interval',
  'update:device-id',
  'update:frame-rate',
]);

// LOCAL UI STATE (device + frame rate)
const devices = ref([]);
const selectedDevice = ref('');
const selectedFrameRate = ref('30');

// Enumerates all video input devices on mount
onMounted(async () => {
  // Gets all media devices (prompts for permission if needed)
  const allDevices = await navigator.mediaDevices.enumerateDevices();

  // Filters to only video input devices (cameras)
  devices.value = allDevices.filter(d => d.kind === 'videoinput');

  // Auto-selects the first device if available
  if (devices.value.length > 0) {
    selectedDevice.value = devices.value[0].deviceId;
    emit('update:device-id', selectedDevice.value);
  }
});

const changeDevice = () => {
  emit('update:device-id', selectedDevice.value);
};
const updateFrameRate = () => {
  emit('update:frame-rate', Number(selectedFrameRate.value));
};

// Computes interval in seconds for display/input
const intervalSeconds = computed(() => Math.round(props.ocrInterval / 1000));

// METHODS
const toggleOCR = () => {
  emit('update:modelValue', !props.modelValue);
};

// Handles user typing interval in seconds, clamps to 1–30s
function onIntervalInput(e) {
  // Parses the input as integer seconds
  const sec = parseInt(e.target.value, 10);

  // Checks if it's a valid number
  if (isNaN(sec)) return;

  // Clamps to 1–30 seconds
  const clamped = Math.min(30, Math.max(1, sec));
  emit('update:ocr-interval', clamped * 1000);
}

// Sets interval to a preset value (in milliseconds)
function setPreset(ms) {
  emit('update:ocr-interval', ms);
}
</script>

<style scoped>
.camera-settings {
  flex: 1 1 50%;
  background-color: #ffffff;
  border: none;
  padding: 1em;
  box-sizing: border-box;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-radius: 15px;
}

h3 {
  margin-top: 0;
  color: #333;
}

.settings-controls {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

label {
  font-weight: 500;
  color: #555;
}

select,
button,
input[type='number'] {
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.9rem;
}

button {
  background-color: #007bff;
  color: white;
  cursor: pointer;
  transition: background-color 0.2s;
}

button:hover {
  background-color: #0056b3;
}

button.ocrEnabled {
  background-color: #28a745;
}

button.ocrEnabled:hover {
  background-color: #218838;
}

.ocr-section {
  border: 1px solid #d9d9d9;
  border-radius: 10px;
  padding: 0.9rem 0.9rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: #fafafa;
}

.ocr-section legend {
  padding: 0 0.5rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: #444;
}

.interval-row {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.interval-row input {
  max-width: 90px;
}

.interval-presets {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.interval-presets button {
  background: #e9eef5;
  color: #333;
  border: 1px solid #cfd8e3;
  padding: 0.3rem 0.6rem;
  font-size: 0.7rem;
}

.interval-presets button:hover {
  background: #d9e4f1;
}

.ocr-status {
  font-size: 0.75rem;
  color: #666;
}

.ocr-status.on {
  color: #1e7a31;
}

.hint {
  font-size: 0.65rem;
  color: #777;
}
</style>
