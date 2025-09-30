<template>
  <!-- Main container -->
  <div class="app">
    <!-- Sidebar -->
    <Sidebar />

    <!-- Main content area  -->
    <div class="main-content">
      <div class="columns">
        <div class="column">
          <div class="sub-columns">
            <WebcamFeed
              :is-ocr-active="isOCR"
              :ocr-interval-ms="ocrIntervalMs"
              :device-id="selectedDeviceId"
              :frame-rate="selectedFrameRate"
              :languages="ocrLanguages"
              :page-seg-mode="pageSegMode"
              :dpi="dpiOverride"
              @ocr-text="handleTextCapture"
              @ocr-status="handleOcrStatusUpdate"
            />
            <div class="settings-stack">
              <div class="settings-switch">
                <button
                  type="button"
                  :class="{ active: activeSettingsPanel === 'camera' }"
                  @click="activeSettingsPanel = 'camera'"
                >
                  Camera
                </button>
                <button
                  type="button"
                  :class="{ active: activeSettingsPanel === 'ocr' }"
                  @click="activeSettingsPanel = 'ocr'"
                >
                  OCR
                </button>
              </div>
              <div class="settings-panels">
                <CameraSettings
                  v-show="activeSettingsPanel === 'camera'"
                  v-model="isOCR"
                  v-model:ocr-interval="ocrIntervalMs"
                  @update:device-id="handleDeviceId"
                  @update:frame-rate="handleFrameRate"
                />
                <OcrSettings
                  v-show="activeSettingsPanel === 'ocr'"
                  v-model:languages="ocrLanguages"
                  v-model:page-seg-mode="pageSegMode"
                  v-model:dpi="dpiOverride"
                  v-model:jockaigne-enabled="isCorrectionEnabled"
                  @update:languages="handleLanguagesUpdate"
                />
              </div>
              <div class="separator horizontal"></div>
              <OcrStatusPanel :status="ocrStatus" />
            </div>
          </div>
        </div>
        <div class="separator vertical"></div>
        <div class="column">
          <TextDisplay ref="textDisplayRef" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch } from 'vue';
import WebcamFeed from './components/WebcamFeed.vue';
import CameraSettings from './components/CameraSettings.vue';
import OcrSettings from './components/OcrSettings.vue';
import OcrStatusPanel from './components/OcrStatusPanel.vue';
import TextDisplay from './components/TextDisplay.vue';
import Sidebar from './components/sidebar/Sidebar.vue';

const isOCR = ref(false);
const ocrIntervalMs = ref(4000);
const selectedDeviceId = ref('');
const selectedFrameRate = ref(30);
const ocrLanguages = ref(['eng']);
const pageSegMode = ref('3'); // default auto
const dpiOverride = ref(70);
const isCorrectionEnabled = ref(false);
const activeSettingsPanel = ref('camera');
const ocrStatus = reactive({
  workerReady: false,
  currentLanguages: 'eng',
  lastConfidence: null,
  lastTextLength: 0,
  lastRunAt: null,
  correctionEnabled: false,
  correctionBusy: false,
  lastCorrectionError: null,
  lastCorrectionUsed: false,
  lastDiagnostics: null,
  lastSuggestions: [],
});

// Component references
const textDisplayRef = ref(null);

const handleTextCapture = async payload => {
  if (!payload) return;
  const entry = typeof payload === 'string'
      ? { text: payload, confidence: null, lowConfidence: false }
      : { ...payload };
  entry.corrected = !!entry.corrected;
  entry.lowConfidence = !!entry.lowConfidence;
  entry.timestamp = entry.timestamp || Date.now();
  entry.original = entry.original ?? null;

  if (
    isCorrectionEnabled.value &&
    typeof window !== 'undefined' &&
    window.api?.runCorrection &&
    entry.text
  ) {
    try {
      ocrStatus.correctionBusy = true;
      ocrStatus.lastCorrectionError = null;
      const result = await window.api.runCorrection({
        text: entry.text,
        meta: {
          languages: Array.isArray(ocrLanguages.value)
            ? [...ocrLanguages.value]
            : ['eng'],
          confidence: entry.confidence ?? null,
          pageSegMode: pageSegMode.value,
        },
      });

      if (result?.corrected && result.text) {
        entry.text = result.text;
        entry.corrected = true;
        ocrStatus.lastCorrectionUsed = true;
      } else {
        ocrStatus.lastCorrectionUsed = false;
      }

      if (result?.error) {
        ocrStatus.lastCorrectionError = result.error;
      }

      if (typeof result?.original === 'string' && !entry.original) {
        entry.original = result.original;
      }

      ocrStatus.lastDiagnostics = result?.diagnostics ?? null;
      ocrStatus.lastSuggestions = Array.isArray(result?.suggestions)
        ? result.suggestions
        : [];
      entry.diagnostics = result?.diagnostics ?? null;
      entry.suggestions = Array.isArray(result?.suggestions)
        ? result.suggestions
        : [];
    } catch (err) {
      console.error('Correction failed:', err);
      ocrStatus.lastCorrectionError = err?.message || String(err);
      ocrStatus.lastCorrectionUsed = false;
      ocrStatus.lastDiagnostics = null;
      ocrStatus.lastSuggestions = [];
    } finally {
      ocrStatus.correctionBusy = false;
    }
  } else {
    ocrStatus.lastCorrectionUsed = false;
    ocrStatus.correctionBusy = false;
    ocrStatus.lastDiagnostics = null;
    ocrStatus.lastSuggestions = [];
    entry.diagnostics = null;
    entry.suggestions = [];
  }

  if (textDisplayRef.value) {
    textDisplayRef.value.addText(entry);
  }
};

const handleDeviceId = id => {
  selectedDeviceId.value = id;
};
const handleFrameRate = rate => {
  selectedFrameRate.value = rate;
};

const handleLanguagesUpdate = langs => {
  ocrLanguages.value =
    Array.isArray(langs) && langs.length ? [...langs] : ['eng'];
};

watch(ocrLanguages, langs => {
  ocrStatus.currentLanguages = langs.join('+');
});

watch(isCorrectionEnabled, enabled => {
  ocrStatus.correctionEnabled = enabled;
  if (typeof window !== 'undefined' && window.api?.setCorrectionEnabled) {
    window.api.setCorrectionEnabled(enabled);
  }
  if (!enabled) {
    ocrStatus.correctionBusy = false;
    ocrStatus.lastCorrectionError = null;
    ocrStatus.lastCorrectionUsed = false;
    ocrStatus.lastDiagnostics = null;
    ocrStatus.lastSuggestions = [];
  }
});

const handleOcrStatusUpdate = (payload = {}) => {
  if (typeof payload.workerReady === 'boolean') {
    ocrStatus.workerReady = payload.workerReady;
  }
  if (payload.currentLanguages) {
    ocrStatus.currentLanguages = payload.currentLanguages;
  }
  if (
    typeof payload.lastConfidence === 'number' ||
    payload.lastConfidence === null
  ) {
    ocrStatus.lastConfidence = payload.lastConfidence;
  }
  if (typeof payload.lastTextLength === 'number') {
    ocrStatus.lastTextLength = payload.lastTextLength;
  }
  if (payload.lastRunAt) {
    ocrStatus.lastRunAt = payload.lastRunAt;
  }
};

defineExpose({
  handleTextCapture,
  isOCR,
  ocrIntervalMs,
  ocrLanguages,
  pageSegMode,
  dpiOverride,
  isCorrectionEnabled,
  ocrStatus,
});
</script>

<style>
body {
  margin: 0;
  font-family: 'Roboto', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: #f5f5f5;
}

.app {
  display: flex;
  height: 100vh;
  background-color: #f5f5f5;
  width: 100vw;
}

.main-content {
  flex: 1;
  padding: 1em;
  box-sizing: border-box;
}

.columns {
  display: flex;
  flex: 1;
  column-gap: 1em;
  height: 100%;
}

.column {
  flex: 1;
}

.sub-columns {
  display: flex;
  flex-direction: column;
  row-gap: 1em;
  height: 100%;
  overflow-y: auto;
  padding-right: 0.3em;
}

.settings-stack {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.settings-switch {
  display: inline-flex;
  gap: 0.5rem;
  background: #f0f2f5;
  padding: 0.3rem;
  border-radius: 999px;
  align-self: flex-start;
}

.settings-switch button {
  border: none;
  background: transparent;
  padding: 0.35rem 0.85rem;
  font-size: 0.8rem;
  border-radius: 999px;
  color: #555;
  cursor: pointer;
  transition:
    background-color 0.2s,
    color 0.2s;
}

.settings-switch button.active {
  background: #007bff;
  color: #fff;
}

.settings-panels {
  position: relative;
}

.settings-panels > * {
  transition: opacity 0.2s ease;
}

.settings-panels > *[style*='display: none'] {
  opacity: 0;
}

.separator {
  background-color: #dcdcdc;
  align-self: stretch;
}

.separator.horizontal {
  height: 0.05em;
  margin-left: 3.5em;
  margin-right: 3.5em;
}

.separator.vertical {
  width: 0.05em;
}
</style>
