// Tessearct Settins
import { createWorker, OEM } from 'tesseract.js';

let worker = null;
let initializing = null;

const currentState = {
  lang: null,
  pageSegMode: null,
  dpi: null,
};

const noop = () => {};

// Creates a new Tesseract worker with the specified language and logger
async function createNewWorker(lang, logger) {
  const workerOptions = {
    logger: logger || noop,
    cacheMethod: 'refresh',
  };

  const instance = await createWorker(lang, OEM.LSTM_ONLY, workerOptions);
  currentState.lang = lang;
  return instance;
}


// Destroys a Tesseract worker if it exists
async function destroyWorker() {
  if (worker) {
    await worker.terminate();
  }
  worker = null;
  initializing = null;
  currentState.lang = null;
}


// Ensures that a Tesseract worker is available with the desired configuration
export async function ensureWorker(options = {}) {
  const langString = options.lang || currentState.lang || 'eng';
  const logger = options.logger || noop;

  const shouldRecreate = !worker || currentState.lang !== langString;

  if (shouldRecreate) {
    if (initializing) {
      await initializing;
    }
    await destroyWorker();
    initializing = (async () => {
      try {
        worker = await createNewWorker(langString, logger);
        return worker;
      } catch (error) {
        console.error('[ocrService] Failed to initialise worker', error);
        await destroyWorker();
        throw error;
      } finally {
        initializing = null;
      }
    })();
  }

  if (initializing) {
    await initializing;
  }

  await applyParameters(options);
  return worker;
}


// Applies page segmentation mode and DPI parameters to the current worker if they differ from the current state
async function applyParameters(options) {
  if (!worker) return;

  const params = {};
  const desiredPsm = options.pageSegMode ?? currentState.pageSegMode;
  if (desiredPsm && desiredPsm !== currentState.pageSegMode) {
    params.tessedit_pageseg_mode = String(desiredPsm);
    currentState.pageSegMode = desiredPsm;
  }

  const desiredDpi = options.dpi ?? currentState.dpi;
  if (desiredDpi && desiredDpi !== currentState.dpi) {
    params.user_defined_dpi = String(desiredDpi);
    currentState.dpi = desiredDpi;
  }

  const keys = Object.keys(params);
  if (keys.length > 0) {
    await worker.setParameters(params);
  }
}

// Recognizes text from the provided image data using Tesseract OCR with specified options
export async function recognize(imageData, options = {}) {
  const { lang, pageSegMode, dpi, logger } = options;

  try {
    const worker = await ensureWorker({ lang, pageSegMode, dpi, logger });
    const outputConfig = {
      text: true,
      hocr: false,
      tsv: false,
    };

    const { data } = await worker.recognize(imageData, {}, outputConfig);
    return data;
  } catch (error) {
    console.error('[ocrService] Recognition failed', error);
    throw error;
  }
}

export async function terminate() {
  await destroyWorker();
  currentState.pageSegMode = null;
  currentState.dpi = null;
}
