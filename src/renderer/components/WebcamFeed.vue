<template>
  <div class="camera-feed">
    <video ref="webcamRef" autoplay playsinline muted></video>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { recognize } from '../ocr/ocrService';

const props = defineProps({
  isOcrActive: { type: Boolean, default: false },
  ocrIntervalMs: { type: Number, default: 4000 },
  deviceId: { type: String, default: '' },
  frameRate: { type: Number, default: 30 },
  languages: { type: Array, default: () => ['eng'] },
  pageSegMode: { type: String, default: '3' },
  dpi: { type: Number, default: 150 },
});

const emit = defineEmits(['ocr-text', 'ocr-status']);

const webcamRef = ref(null);
let mediaStream = null;
let captureCanvas = null;
let captureCtx = null;
let ocrTimer = null;
let busy = false;

const getConstraints = () => ({
  video: {
    deviceId: props.deviceId ? { exact: props.deviceId } : undefined,
    frameRate: props.frameRate || undefined,
  },
});

function sendStatus(payload) {
  emit('ocr-status', payload);
}

async function startStream() {
  try {
    stopStream();
    mediaStream = await navigator.mediaDevices.getUserMedia(getConstraints());
    if (webcamRef.value) {
      webcamRef.value.srcObject = mediaStream;
    }
    sendStatus({ workerReady: true });
  } catch (error) {
    console.error('Error accessing webcam:', error);
    sendStatus({ workerReady: false });
  }
}

function stopStream() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  if (webcamRef.value) {
    webcamRef.value.srcObject = null;
  }
}

function clearOcrTimer() {
  if (ocrTimer) {
    clearInterval(ocrTimer);
    ocrTimer = null;
  }
}

function scheduleOcr() {
  clearOcrTimer();
  if (!props.isOcrActive) {
    return;
  }
  runOcrPass();
  ocrTimer = setInterval(runOcrPass, Math.max(500, props.ocrIntervalMs));
}

async function runOcrPass() {
  if (busy || !props.isOcrActive) return;
  const video = webcamRef.value;
  if (!video || video.readyState < 2) return;

  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return;

  if (!captureCanvas) {
    captureCanvas = document.createElement('canvas');
    captureCtx = captureCanvas.getContext('2d', { willReadFrequently: true });
  }

  captureCanvas.width = width;
  captureCanvas.height = height;
  captureCtx.drawImage(video, 0, 0, width, height);

  busy = true;
  try {
    const results = await recognize(captureCanvas, buildRecognizeOptions());
    const cleaned = (results.text || '').trim();

    sendStatus({
      lastConfidence:
        typeof results.confidence === 'number'
          ? Math.round(results.confidence)
          : null,
      lastTextLength: cleaned.length,
      lastRunAt: new Date().toISOString(),
      currentLanguages: props.languages.join('+'),
      quality: 'best',
    });

    if (!cleaned) return;

    emit('ocr-text', {
      text: cleaned,
      confidence: results.confidence ?? null,
      lowConfidence: false,
    });
  } catch (error) {
    console.warn('OCR pass failed:', error);
  } finally {
    busy = false;
  }
}

function buildRecognizeOptions() {
  return {
    lang: props.languages.join('+'),
    quality: 'best',
    pageSegMode: props.pageSegMode,
    dpi: props.dpi,
  };
}

// Watchers, which watch for the specified props and react to changes
watch(
  () => props.isOcrActive,
  () => {
    scheduleOcr();
  }
);

watch(
  () => props.ocrIntervalMs,
  () => {
    scheduleOcr();
  }
);

watch(
  () => props.deviceId,
  () => {
    startStream();
  }
);

watch(
  () => props.frameRate,
  () => {
    startStream();
  }
);

watch(
  () => props.languages.join('+'),
  value => {
    sendStatus({ currentLanguages: value });
  }
);

onMounted(() => {
  startStream();
  scheduleOcr();
});

onUnmounted(() => {
  clearOcrTimer();
  stopStream();
});
</script>

<style scoped>
.camera-feed {
  flex: 1 1 50%;
  background-color: #ffffff;
  border: none;
  padding: 1em;
  box-sizing: border-box;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-radius: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
}

video {
  width: 100%;
  height: auto;
  border-radius: 12px;
  background: #000;
}
</style>
