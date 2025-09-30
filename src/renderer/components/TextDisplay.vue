<template>
  <div class="text-display">
    <header class="header">
      <h3>Lecture Notes</h3>
      <div class="header-actions">
        <button class="btn" @click="copyAll" title="Copy all recognised text">
          Copy All
        </button>
        <button
          class="btn"
          @click="exportText"
          title="Download recognised text as .txt"
        >
          Download
        </button>
        <button
          class="btn danger"
          @click="clearText"
          title="Clear the current notes"
        >
          Clear
        </button>
      </div>
    </header>

    <div class="scrollable" ref="scrollableRef">
      <article
        v-for="(entry, index) in textLines"
        :key="index"
        class="entry"
        :class="{ warning: entry.lowConfidence }"
      >
        <header class="entry-header">
          <div class="entry-info">
            <span class="entry-index">Slide {{ index + 1 }}</span>
            <span v-if="entry.timestamp" class="entry-time">{{
              formatTimestamp(entry.timestamp)
            }}</span>
          </div>
          <div class="entry-badges">
            <span v-if="entry.corrected" class="badge success">Corrected</span>
            <span v-if="typeof entry.confidence === 'number'" class="badge info"
              >{{ Math.round(entry.confidence) }}% confidence</span
            >
            <span v-if="entry.lowConfidence" class="badge warn"
              >Low confidence</span
            >
          </div>
          <button class="link" type="button" @click="copyEntry(entry.text)">
            Copy
          </button>
        </header>

        <pre class="entry-text">{{ entry.text }}</pre>

        <section
          v-if="entry.original && entry.original !== entry.text"
          class="entry-section subtle"
        >
          <details>
            <summary>Original OCR text</summary>
            <pre>{{ entry.original }}</pre>
          </details>
        </section>

        <section v-if="entry.suggestions?.length" class="entry-section">
          <h5>Suggested vocabulary</h5>
          <div class="chip-row">
            <span v-for="word in entry.suggestions" :key="word" class="chip">{{
              word
            }}</span>
          </div>
        </section>

        <section v-if="entry.diagnostics" class="entry-section subtle">
          <details>
            <summary>Diagnostics</summary>
            <ul>
              <li v-if="typeof entry.diagnostics.similarity === 'number'">
                Similarity:
                {{ (entry.diagnostics.similarity * 100).toFixed(1) }}%
              </li>
              <li v-if="typeof entry.diagnostics.editDistance === 'number'">
                Edit distance: {{ entry.diagnostics.editDistance }}
              </li>
              <li
                v-if="
                  typeof entry.diagnostics.diversity === 'number' &&
                  Number.isFinite(entry.diagnostics.diversity)
                "
              >
                Shannon diversity: {{ entry.diagnostics.diversity.toFixed(3) }}
              </li>
              <li v-if="entry.diagnostics.topCharacters">
                Top characters
                <div class="chip-row">
                  <span
                    v-for="(count, char) in entry.diagnostics.topCharacters"
                    :key="`${char}-${count}`"
                    class="chip neutral"
                  >
                    {{ char }} · {{ count }}
                  </span>
                </div>
              </li>
              <li v-if="entry.diagnostics.topBigrams">
                Top bigrams
                <div class="chip-row">
                  <span
                    v-for="(count, gram) in entry.diagnostics.topBigrams"
                    :key="`${gram}-${count}`"
                    class="chip neutral"
                  >
                    {{ gram }} · {{ count }}
                  </span>
                </div>
              </li>
            </ul>
          </details>
        </section>
      </article>

      <p v-if="textLines.length === 0" class="placeholder">
        OCR output will appear here once the lecture capture begins.
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, defineExpose } from 'vue';

const scrollableRef = ref(null);
const capturedText = ref([]);

const textLines = computed(() => capturedText.value);

// Appends a new entry to the lecture log and keeps the scroll anchored to the most recent slide
// We will rework this in further versions of LLS ._.
const addText = payload => {
  if (!payload) return;
  const entry =
    typeof payload === 'string'
      ? {
          text: payload,
          confidence: null,
          lowConfidence: false,
          corrected: false,
        }
      : {
          text: payload.text ?? '',
          confidence: payload.confidence ?? null,
          lowConfidence: !!payload.lowConfidence,
          corrected: !!payload.corrected,
          diagnostics: payload.diagnostics ?? null,
          suggestions: Array.isArray(payload.suggestions)
            ? payload.suggestions
            : [],
          timestamp: payload.timestamp ?? Date.now(),
          original: payload.original ?? null,
        };
  if (!entry.text) return;
  capturedText.value.push(entry);
  if (scrollableRef.value) {
    scrollableRef.value.scrollTop = scrollableRef.value.scrollHeight;
  }
};

const clearText = () => {
  capturedText.value = [];
};

// Uses the browser clipboard API for quick copying of the text
const copyEntry = async text => {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    console.warn('Copy failed:', error);
  }
};

// Copies all recognised text entries, separated by double newlines
const copyAll = async () => {
  const text = capturedText.value.map(entry => entry.text).join('\n\n');
  await copyEntry(text);
};

// Exports all recognised text as a .txt file
const exportText = () => {
  const text = capturedText.value.map(entry => entry.text).join('\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'lecture-text.txt';
  link.click();
  URL.revokeObjectURL(url);
};

// Formats a timestamp (ms since epoch) into a human-readable time string
const formatTimestamp = value => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

defineExpose({ addText });
</script>

<style scoped>
.text-display {
  flex: 1;
  background-color: #ffffff;
  border: none;
  padding: 1.25rem;
  box-sizing: border-box;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.12);
  border-radius: 18px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.header-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

h3 {
  margin: 0;
  color: #1f2937;
  font-size: 1.25rem;
  font-weight: 600;
}

.scrollable {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem;
  background-color: #f8faff;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.placeholder {
  margin: 0;
  text-align: center;
  color: #8a94a6;
  font-style: italic;
}

.entry {
  background: #ffffff;
  border-radius: 14px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  box-shadow: 0 3px 10px rgba(15, 23, 42, 0.08);
}

.entry.warning {
  border-left: 4px solid #f59e0b;
  background: #fff7eb;
}

.entry-header {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  justify-content: space-between;
}

.entry-info {
  display: flex;
  gap: 0.6rem;
  align-items: baseline;
}

.entry-index {
  font-weight: 600;
  color: #1e3a8a;
}

.entry-time {
  font-size: 0.78rem;
  color: #6b7280;
}

.entry-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.entry-text {
  margin: 0;
  font-family: 'Source Code Pro', 'Courier New', monospace;
  font-size: 0.97rem;
  line-height: 1.6;
  color: #212838;
  white-space: pre-wrap;
}

.entry-section {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.entry-section.subtle {
  background: rgba(37, 99, 235, 0.06);
  border-radius: 10px;
  padding: 0.65rem 0.85rem;
}

.entry-section h5 {
  margin: 0;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #374151;
}

.entry-section ul {
  margin: 0;
  padding-left: 1rem;
  font-size: 0.82rem;
  color: #364152;
}

details summary {
  cursor: pointer;
}

.badge {
  font-size: 0.65rem;
  border-radius: 999px;
  padding: 0.2rem 0.6rem;
  letter-spacing: 0.05em;
  display: inline-flex;
  align-items: center;
}

.badge.success {
  background: #dcf5ec;
  color: #0f766e;
}

.badge.info {
  background: #e1efff;
  color: #1d4ed8;
}

.badge.warn {
  background: #fef3c7;
  color: #92400e;
}

.chip-row {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.chip {
  background: #eaf0ff;
  border-radius: 999px;
  padding: 0.25rem 0.7rem;
  font-size: 0.75rem;
  color: #1d3b8a;
}

.chip.neutral {
  background: #f1f5f9;
  color: #334155;
}

.btn {
  padding: 0.55rem 1.1rem;
  border-radius: 8px;
  border: 1px solid transparent;
  background: #1f6feb;
  color: #fff;
  font-size: 0.85rem;
  cursor: pointer;
  transition:
    background 0.2s ease,
    transform 0.2s ease;
}

.btn:hover {
  background: #1756c4;
  transform: translateY(-1px);
}

.btn.danger {
  background: #fee2e2;
  color: #b91c1c;
  border-color: #fecaca;
}

.btn.danger:hover {
  background: #fecaca;
}

.link {
  background: none;
  border: none;
  color: #1f6feb;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.2rem 0.4rem;
}

.link:hover {
  text-decoration: underline;
}

.scrollable::-webkit-scrollbar {
  width: 8px;
}

.scrollable::-webkit-scrollbar-track {
  background: #e3e8f2;
  border-radius: 8px;
}

.scrollable::-webkit-scrollbar-thumb {
  background: #94a3b8;
  border-radius: 8px;
}

.scrollable::-webkit-scrollbar-thumb:hover {
  background: #64748b;
}
</style>
