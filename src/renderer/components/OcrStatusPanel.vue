<template>
  <div class="status-panel">
    <h4>OCR Status</h4>
    <div class="status-grid">
      <div class="item">
        <span class="label">Worker</span>
        <span :class="['value', status.workerReady ? 'ready' : 'pending']">
          {{ status.workerReady ? 'Ready' : 'Initializing' }}
        </span>
      </div>
      <div class="item">
        <span class="label">Languages</span>
        <span class="value">{{ status.currentLanguages || 'eng' }}</span>
      </div>
      <div class="item">
        <span class="label">Model</span>
        <span class="value">Best</span>
      </div>
      <div class="item">
        <span class="label">Correction</span>
        <span class="value" :class="correctionClass">{{ correctionText }}</span>
      </div>
      <div class="item">
        <span class="label">Last confidence</span>
        <span class="value">{{ confidenceText }}</span>
      </div>
      <div class="item">
        <span class="label">Last run</span>
        <span class="value">{{ lastRunText }}</span>
      </div>
      <div class="item">
        <span class="label">Chars captured</span>
        <span class="value">{{ status.lastTextLength ?? 0 }}</span>
      </div>
      <template v-if="status.lastDiagnostics">
        <div class="item">
          <span class="label">Similarity</span>
          <span class="value">{{ similarityText }}</span>
        </div>
        <div class="item">
          <span class="label">Edit distance</span>
          <span class="value">{{
            status.lastDiagnostics.editDistance ?? '—'
          }}</span>
        </div>
        <div class="item">
          <span class="label">Printable ratio</span>
          <span class="value">{{ printableText }}</span>
        </div>
        <div class="item">
          <span class="label">ASCII ratio</span>
          <span class="value">{{ asciiText }}</span>
        </div>
        <div class="item">
          <span class="label">Shannon diversity</span>
          <span class="value">{{ diversityText }}</span>
        </div>
      </template>
    </div>
    <p v-if="status.lastCorrectionError" class="diagnostic">
      {{ status.lastCorrectionError }}
    </p>
    <div v-if="status.lastSuggestions?.length" class="suggestions">
      <span class="label">Suggestions</span>
      <div class="chips">
        <span v-for="word in status.lastSuggestions" :key="word" class="chip">{{
          word
        }}</span>
      </div>
    </div>
    <div v-if="topCharacters.length" class="top-characters">
      <span class="label">Top characters</span>
      <div class="chips">
        <span
          v-for="([char, count], idx) in topCharacters"
          :key="idx"
          class="chip neutral"
        >
          {{ char }} · {{ count }}
        </span>
      </div>
    </div>
    <div v-if="topBigrams.length" class="top-characters">
      <span class="label">Top bigrams</span>
      <div class="chips">
        <span
          v-for="([gram, count], idx) in topBigrams"
          :key="gram + idx"
          class="chip neutral"
        >
          {{ gram }} · {{ count }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  status: {
    type: Object,
    default: () => ({
      workerReady: false,
      currentLanguages: 'eng',
      quality: 'best',
      lastConfidence: null,
      lastTextLength: 0,
      lastRunAt: null,
      correctionEnabled: false,
      correctionBusy: false,
      lastCorrectionError: null,
      lastCorrectionUsed: false,
      lastDiagnostics: null,
      lastSuggestions: [],
    }),
  },
});

const status = computed(() => props.status || {});

const confidenceText = computed(() => {
  if (typeof status.value.lastConfidence === 'number') {
    return `${status.value.lastConfidence}%`;
  }
  return '—';
});

const lastRunText = computed(() => {
  if (!status.value.lastRunAt) return '—';
  const date = new Date(status.value.lastRunAt);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
});

const correctionText = computed(() => {
  if (!status.value.correctionEnabled) return 'Disabled';
  if (status.value.correctionBusy) return 'Processing…';
  if (status.value.lastCorrectionError) return 'Error';
  if (status.value.lastCorrectionUsed) return 'Active';
  return 'Idle';
});

const correctionClass = computed(() => {
  if (!status.value.correctionEnabled) return 'muted';
  if (status.value.lastCorrectionError) return 'error';
  if (status.value.correctionBusy) return 'pending';
  return 'ready';
});

const similarityText = computed(() => {
  const value = status.value.lastDiagnostics?.similarity;
  if (typeof value === 'number') {
    return `${Math.round(value * 100)}%`;
  }
  return '—';
});

const printableText = computed(() => {
  const value = status.value.lastDiagnostics?.printableRatio;
  if (typeof value === 'number') {
    return `${Math.round(value * 100)}%`;
  }
  return '—';
});

const asciiText = computed(() => {
  const value = status.value.lastDiagnostics?.asciiRatio;
  if (typeof value === 'number') {
    return `${Math.round(value * 100)}%`;
  }
  return '—';
});

const diversityText = computed(() => {
  const value = status.value.lastDiagnostics?.diversity;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(3);
  }
  return '—';
});

const topCharacters = computed(() => {
  const map = status.value.lastDiagnostics?.topCharacters;
  if (!map) return [];
  return Object.entries(map);
});

const topBigrams = computed(() => {
  const map = status.value.lastDiagnostics?.topBigrams;
  if (!map) return [];
  return Object.entries(map);
});
</script>

<style scoped>
.status-panel {
  background: #ffffff;
  border-radius: 15px;
  padding: 0.9rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.status-panel h4 {
  margin: 0;
  font-size: 0.95rem;
  color: #333;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.6rem;
}

.item {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.label {
  font-size: 0.7rem;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.value {
  font-size: 0.85rem;
  color: #333;
  font-weight: 600;
}
.value.ready {
  color: #2e7d32;
}
.value.pending {
  color: #d17a00;
}
.value.error {
  color: #d32f2f;
}
.value.muted {
  color: #888;
}

.diagnostic {
  margin: 0;
  font-size: 0.75rem;
  color: #b71c1c;
}

.suggestions {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.chip {
  background: #eef3ff;
  border-radius: 999px;
  padding: 0.2rem 0.6rem;
  font-size: 0.75rem;
  color: #2f3a63;
}

.chip.neutral {
  background: #f0f0f0;
  color: #444;
}
</style>
