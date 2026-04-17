window.VNOCR_BUILD = "production";
window.VNOCR_DEBUG = false; // Set to true to enable high-fidelity lifecycle tracing
const logTrace = (msg) => { if (window.VNOCR_DEBUG) console.log(`[TRACE] ${msg}`); };

/**
 * Diagnostics: Memory Usage Trace (Gold v3.8)
 * Leverages performance.memory (Chromium) to audit heap pressure during ML inference.
 * Rate-limited to prevent console flooding during high-frequency operations.
 */
let lastMemoryLog = 0;
const MEMORY_LOG_THROTTLE_MS = 1000; // Max 1 log per second

const logMemoryUsage = (context = "") => {
    if (!window.VNOCR_DEBUG) return;
    const now = Date.now();
    if (now - lastMemoryLog < MEMORY_LOG_THROTTLE_MS) return;
    lastMemoryLog = now;
    
    const stats = getMemoryStats();
    if (stats) {
        console.debug(`[MEMORY] ${context} Used: ${stats.used}MB | Total: ${stats.total}MB | Limit: ${stats.limit}MB`);
    }
};

const getMemoryStats = () => {
    try {
        if (typeof performance !== 'undefined' && performance.memory && 
            typeof performance.memory.usedJSHeapSize === 'number' &&
            typeof performance.memory.totalJSHeapSize === 'number' &&
            typeof performance.memory.jsHeapSizeLimit === 'number') {
            const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = performance.memory;
            // Guard against zero or negative values
            if (usedJSHeapSize >= 0 && totalJSHeapSize > 0 && jsHeapSizeLimit > 0) {
                return {
                    used: parseFloat((usedJSHeapSize / (1024 * 1024)).toFixed(1)),
                    total: parseFloat((totalJSHeapSize / (1024 * 1024)).toFixed(1)),
                    limit: parseFloat((jsHeapSizeLimit / (1024 * 1024)).toFixed(1))
                };
            }
        }
    } catch (e) {
        // Silently fail in environments without performance.memory
    }
    return null;
};

const perfStats = {
    inference: 0,
    preprocess: 0,
    lastUpdate: Date.now(),
    showAdvanced: false
};
/*
  PERSONAL OCR HARDENING PHASE:
  DO NOT MODIFY the following functions during patches:
    - captureFrame
    - switchEngine
    - drawSelectionRect
    - sliceImageIntoLines
    - loadPaddleOCR
    - loadTesseract
  These functions are frozen to prevent regressions.
*/

/**
 * PERSONAL OCR ARCHITECTURE OVERVIEW:
 * -----------------------------------------
 * This application operates a dual-engine OCR pipeline:
 * 1. Tesseract Engine: Standard LSTM-based OCR. Accessible via 'Image Processing Modes' 
 *    (Adaptive, Multi-Pass, etc.) which preprocess the crop before inference.
 * 2. PaddleOCR Engine: High-precision neural recognizer. Uses an internal sequential 
 *    slicing pipeline for multi-line support. Enforces raw input (preprocessors disabled).
 * 
 * STATE MANAGEMENT:
 * State is mirrored in the `state` object (Auditability Phase) and checked via the 
 * maintain compatibility with the legacy baseline.
 */

import {
    loadSettings,
    getSetting,
    setSetting,
    applySettingsToUI,
    applyUIToSettings,
    resetSettings
} from './settings.js';

import { STATUS } from './js/core/status.js?v=3.8.4';

import {
    runPaddleOCR
} from './js/paddle/paddle_core.js?v=3.8.4';

import { TesseractEngine } from './js/tesseract/tesseract_engine.js?v=3.8.4';
import { PaddleOCR } from './js/paddle/paddle_engine.js?v=3.8.4';
import { MangaOCREngine } from './js/manga/manga_engine.js?v=3.8.4';
import { isWebGPUSupported as vnIsWebGPUSupported } from './js/onnx/onnx_support.js?v=3.8.4';

const splashHints = [
    "PaddleOCR: Highest accuracy, but longest warm-up time.",
    "MangaOCR uses large models and requires more memory.",
    "MangaOCR is optimized for manga bubbles, not VN UI text.",
    "Tesseract is fastest and works best on clean VN text boxes.",
    "Increase VN text box opacity for better OCR accuracy.",
    "High-contrast text improves recognition across all engines.",
    "Enable text outline or shadow in your VN if available.",
    "Lightweight Mode skips heavy engine preloading for faster startup.",
    "Use Lightweight Mode if Tesseract reads your VN reliably.",
    "Increase Tesseract Upscale Factor for sharper input.",
    "Disable Auto-Capture if your VN has frequent transitions.",
    "Enable Auto-Copy to send OCR results directly to clipboard.",
    "Use the History Panel to compare previous OCR outputs.",
    "WebGPU acceleration works only in supported browsers.",
    "Multithreading improves performance on modern CPUs.",
    "For issues, use the Contact form. Lite version available."
];

let splashHintInterval = null;

function startSplashHintRotation() {
    const hintEl = document.getElementById("splash-hint");
    if (!hintEl) return;
    
    // Clear any existing interval to prevent duplicates
    if (splashHintInterval) {
        clearInterval(splashHintInterval);
    }

    let idx = 0;
    hintEl.textContent = splashHints[idx];

    splashHintInterval = setInterval(() => {
        idx = (idx + 1) % splashHints.length;
        hintEl.textContent = splashHints[idx];
    }, 3500); // 3.5 seconds
}

/** Unified Readiness API (Hardening Phase) */

/**
 * STATUS is now imported from js/core/status.js
 * All engines use the same canonical status constants.



// ==========================================

// DOM Elements
// DOM Elements (Identified as Gold v3.1.1 Lifecycle Nodes)
let selectWindowBtn, vnVideo, selectionOverlay, historyContent, ttsVoiceSelect, speakLatestBtn, latestText, ocrStatus, refreshOcrBtn, clearHistoryBtn, engineSelector, modeSelector, autoToggle, autoCaptureBtn, upscaleSlider, upscaleVal, perfIcon, perfInfo, menuPurge, menuBtn, sideMenu, menuBackdrop, menuInstall, menuGuide, menuContact, menuReset;

// === Throttling & Readiness State (Patch v3.1 Gold) ===
let captureLocked = false;
let engineReady = false;
let isProcessing = false; // Unified state tracking for OCR cycles

// 0. Emergency Safety Boundary: Register immediately at module load (Refined v3.8)
startSplashHintRotation();

setTimeout(() => {
    const splash = document.getElementById('startup-splash');
    // Pure JS Truth Flag: Only trigger if the splash hasn't been dismissed by the main logic
    if (splash && !splash.dataset.dismissed) {
        console.warn("[INIT-FAILSAFE] 30s Safety timeout triggered. Standard initialization exceeded expected window.");
        if (typeof dismissSplashScreen === 'function') dismissSplashScreen();
        else {
            splash.style.transition = 'opacity 0.5s ease';
            splash.style.opacity = '0';
            setTimeout(() => splash.remove(), 500);
        }
    }
}, 30000);

function updateCaptureButtonState() {
    if (!refreshOcrBtn) return;
    // Heartbed Sync: Factor in engine readiness, button lock, AND active processing
    const shouldBeDisabled = !engineReady || captureLocked || isProcessing;
    refreshOcrBtn.disabled = shouldBeDisabled;
    refreshOcrBtn.classList.toggle('disabled', shouldBeDisabled);
}

// Hook into EngineManager Lifecycle
// Bridge Phase: EngineManager observers relocated to globalInitialize footer for Gold v3.1 stability

// Navigation Phase: Observers moved to globalInitialize for deterministic hydration

// ==========================================
// NEW: Modular Engine Registry (Roadmap Phase)
// ==========================================

const engines = {
    tesseract: {
        factory: (deps) => new TesseractEngine({ reportStatus: deps.reportStatus }),
        supportsModes: true,
        defaultMode: 'default_mini',
        preprocess: async (canvas, mode) => applyTesseractPreprocessing(canvas, mode),
        postprocess: (results) => results.join(' ').trim(),
        handleError: (error) => { console.error(error); return "[Tesseract Error]"; },
        isMultiLine: false,
        readyStatus: 'Ready'
    },
    paddle: {
        factory: (deps) => new PaddleOCR(
            './models/paddle/manifest.json',
            './js/onnx/',
            { reportStatus: deps.reportStatus }
        ),
        supportsModes: false,
        defaultMode: null,
        preprocess: async (canvas, mode, lineCount) => applyPaddlePreprocessing(canvas, lineCount),
        postprocess: (results) => {
            const cleaned = results.filter((text) => {
                const density = scoreJapaneseDensity(text || '');
                // Remove ONLY extreme garbage: strongly negative density
                if (density < -0.5) {
                    return false;
                }
                return true;
            });
            return cleaned.join('\n').trim();
        },
        handleError: (error) => { console.error(error); return "[PaddleOCR Error]"; },
        isMultiLine: true,
        readyStatus: 'Ready'
    },
    manga: {
        factory: (deps) => new MangaOCREngine(
            './models/manga/manifest.json',
            { reportStatus: deps.reportStatus }
        ),
        supportsModes: false,
        defaultMode: null,
        preprocess: async (canvas) => {
            let cropCanvas = canvas;
            cropCanvas = lr_addPadding(cropCanvas, 8);   // subtle padding
            cropCanvas = sharpenCanvas(cropCanvas);      // existing fixed-strength sharpening
            return [cropCanvas];
        },
        postprocess: (results) => results.join('').trim(),
        handleError: (error) => { console.error(error); return "[MangaOCR Error]"; },
        isMultiLine: false,
        readyStatus: 'Ready'
    }
};

// ============================
// EngineManager (Singleton)
// Central source of truth for engine lifecycle and identity.
// ============================

const EngineManager = (() => {

    // Internal State Machine (Gold v3.8 Compliance)
    const engineMetadata = new Map(); // id -> { instance, state, loadPromise }
    let currentEngineId = 'tesseract'; // Default starting point
    let currentEngine = null;
    let switchingLock = false;
    let currentCapabilities = {};
    let currentInfo = { id: 'tesseract', capabilities: {} };

    // Fixed Labels for Status Formatting
    const ENGINE_LABELS = {
        'tesseract': 'Tesseract',
        'paddle': 'PaddleOCR',
        'manga': 'MangaOCR'
    };

    // Status listeners (UI will subscribe later)
    const statusListeners = new Set();
    const listeners = { ready: [], loading: [], error: [] };
    let isReady = false;

    // Subscribe to status updates
    function onStatusChange(listener) {
        statusListeners.add(listener);
        return () => statusListeners.delete(listener);
    }

    // Subscribe to specific events
    function onReady(fn) { listeners.ready.push(fn); return () => { listeners.ready = listeners.ready.filter(f => f !== fn); }; }
    function onLoading(fn) { listeners.loading.push(fn); return () => { listeners.loading = listeners.loading.filter(f => f !== fn); }; }
    function onError(fn) { listeners.error.push(fn); return () => { listeners.error = listeners.error.filter(f => f !== fn); }; }

    function emit(type, payload) {
        if (listeners[type]) {
            listeners[type].forEach(fn => fn(payload));
        }
    }

    /**
     * Unified Status Broadcaster
     * Formats outgoing text as "[Engine] — [Status]"
     */
    function notifyStatus(state, text, progress = null, targetId = null) {
        const id = targetId || currentEngineId;
        const label = ENGINE_LABELS[id] || id;
        
        // Format logic: Only prepend engine name if it's not already there
        const statusText = text.includes('—') ? text : `${label} — ${text}`;

        if (state === STATUS.READY) emit('ready', statusText);
        if (state === STATUS.LOADING || state === STATUS.DOWNLOADING || state === STATUS.WARMING) emit('loading', statusText);
        if (state === STATUS.ERROR) emit('error', statusText);

        for (const fn of statusListeners) {
            try { fn({ state, text: statusText, progress, engineId: id }); } catch { }
        }
    }

    /**
     * State-Aware Engine Loader
     * Implements promise deduplication and background readiness.
     */
    async function getOrLoadEngine(id, isSilent = false) {
        let meta = engineMetadata.get(id);
        
        if (!meta) {
            meta = { instance: null, state: 'not_loaded', loadPromise: null };
            engineMetadata.set(id, meta);
        }

        // 1. Cache/Deduplication Hit
        if (meta.state === 'ready') return meta.instance;
        if (meta.state === 'loading') return meta.loadPromise;

        // 2. Start Loading Lifecycle
        meta.state = 'loading';
        meta.loadPromise = (async () => {
            try {
                const registryEntry = engines[id];
                if (!registryEntry) throw new Error(`Unknown engine: ${id}`);

                const reporter = (state, text, progress) => {
                    // Update internal state tracking
                    if (state === STATUS.READY) meta.state = 'ready';
                    
                    // Broadcast to UI if active or forced, or if state is ERROR, or if debug flag is set
                    if (!isSilent || id === currentEngineId || state === STATUS.ERROR || window.VNOCR_DEBUG) {
                        notifyStatus(state, text, progress, id);
                    }
                };

                const instance = registryEntry.factory({ reportStatus: reporter });
                
                if (instance && typeof instance.load === 'function') {
                    await instance.load();
                }

                await _warmUpEngine(instance, id);

                meta.instance = instance;
                meta.state = 'ready';
                meta.loadPromise = null; // Clear promise once resolved
                return instance;
            } catch (err) {
                meta.state = 'error';
                meta.loadPromise = null;
                throw err;
            }
        })();

        return meta.loadPromise;
    }

    async function _warmUpEngine(engine, id) {
        if (engine._warmedUp) return;
        try {
            if (engine && typeof engine.warmUp === 'function') {
                if (window.VNOCR_DEBUG) console.debug(`[ENGINE] Warming up ${id.toUpperCase()}...`);
                await engine.warmUp();
            }
            engine._warmedUp = true;
        } catch (err) {
            console.warn(`[ENGINE] Warm-up failed for ${id}:`, err);
        }
    }

    /**
     * High-level switch with persistence and locking.
     */
    async function switchEngine(registryEntry) {
        const id = registryEntry.id;

        if (switchingLock) {
            if (window.VNOCR_DEBUG) console.warn("[TRACE] Ignored overlapping engine switch");
            return;
        }
        switchingLock = true;

        try {
            // Identity First (Enables correct status pill target)
            currentEngineId = id;
            
            const meta = engineMetadata.get(id);
            if (!meta || meta.state !== 'ready') {
                notifyStatus('loading', 'Loading…', null, id);
            }

            const instance = await getOrLoadEngine(id);
            currentEngine = instance;

            // Update Metadata for Pipeline compatibility
            currentCapabilities = {
                supportsModes: registryEntry.supportsModes || false,
                supportsMultiPass: registryEntry.supportsMultiPass || false,
                isMultiLine: registryEntry.isMultiLine || false
            };
            currentInfo = { id, capabilities: currentCapabilities };

            isReady = true;
            notifyStatus('ready', 'Ready', null, id);
            return currentEngine;
        } catch (err) {
            isReady = false;
            notifyStatus('error', '🔴 Load Failed', null, id);
            throw err;
        } finally {
            switchingLock = false;
        }
    }

    /**
     * Silent initialization of core engines (Paddle/Tesseract).
     */
    async function preloadCoreEngines() {
        if (window.VNOCR_DEBUG) console.debug("[ENGINE] Preloading core engines (Paddle/Tesseract)...");
        try {
            // Parallel load for efficiency
            await Promise.all([
                getOrLoadEngine('paddle', true),
                getOrLoadEngine('tesseract', true)
            ]);
            if (window.VNOCR_DEBUG) console.debug("[ENGINE] Core preloading complete.");
        } catch (err) {
            console.warn("[ENGINE] Foreground preload partially failed:", err);
        }
    }

    async function disposeAllEngines() {
        if (window.VNOCR_DEBUG) console.debug("[ENGINE] Purging engine cache...");
        for (const [id, meta] of engineMetadata.entries()) {
            const engine = meta?.instance;
            if (engine && typeof engine.dispose === 'function') {
                try {
                    await engine.dispose();
                    if (window.VNOCR_DEBUG) console.debug(`[TRACE] Engine Disposed: ${id}`);
                } catch (err) {
                    console.error(`Engine dispose error (${id}):`, err);
                }
            }
            engineMetadata.set(id, { instance: null, state: 'not_loaded', loadPromise: null });
        }
        currentEngine = null;
        currentEngineId = null;
        currentInfo = { id: null, capabilities: {} };
        isReady = false;
        notifyStatus('idle', 'All engines cleared');
    }

    // Unified OCR entry point
    async function runOCR(canvas, options = {}) {
        // Gold v3.8: Support instance pinning for multi-slice stability
        let engine = currentEngine;
        let engineId = currentEngineId || 'tesseract';
        
        // If options is an engine instance (internal pin), use it directly
        if (options && typeof options.recognize === 'function') {
            engine = options;
        }
        
        // If options contains explicit engineId, use that for loading
        if (options && typeof options.engineId === 'string') {
            engineId = options.engineId;
        }

        // Auto-recovery: if no engine loaded, try to load the target engine
        if (!engine || typeof engine.recognize !== 'function') {
            if (window.VNOCR_DEBUG) console.debug(`[ENGINE] runOCR: Engine not ready, attempting auto-load for ${engineId}`);
            try {
                // Check if switching is in progress to avoid race conditions
                if (switchingLock) {
                    throw new Error('Engine switch in progress - please retry');
                }
                engine = await getOrLoadEngine(engineId);
                // Update current engine if we're loading the current one
                if (engineId === currentEngineId) {
                    currentEngine = engine;
                }
            } catch (loadErr) {
                console.error(`[ENGINE] Auto-load failed for ${engineId}:`, loadErr);
                notifyStatus(STATUS.ERROR, `Load failed: ${loadErr.message}`, null, engineId);
                throw new Error(`Engine load failed: ${loadErr.message}`);
            }
        }

        if (!engine || typeof engine.recognize !== 'function') {
            notifyStatus(STATUS.ERROR, 'No engine available', null, engineId);
            throw new Error('No engine available');
        }

        try {
            notifyStatus(STATUS.PROCESSING, '🟡 Processing...', null, engineId);
            const result = await engine.recognize(canvas, (typeof options === 'object' ? options : {}));
            return result;
        } catch (err) {
            notifyStatus(STATUS.ERROR, 'OCR failed', null, engineId);
            throw err;
        }
    }



    // Unified preprocessing entry point
    async function preprocess(canvas, mode, lineCount) {
        const id = currentEngineId;
        const entry = engines[id];
        if (entry && typeof entry.preprocess === 'function') {
            return await entry.preprocess(canvas, mode, lineCount);
        }
        return [canvas];
    }

    // Unified post-processing entry point
    function postprocess(results) {
        const id = currentEngineId;
        const entry = engines[id];
        if (entry && typeof entry.postprocess === 'function') {
            return entry.postprocess(results);
        }
        return results.join(' ').trim();
    }

    function getReadyStatus() {
        const id = currentEngineId || 'tesseract';
        const entry = engines[id];
        return entry?.readyStatus || '🟢 OCR Ready';
    }

    function handleError(error) {
        const id = currentEngineId;
        const entry = engines[id];
        if (entry && typeof entry.handleError === 'function') {
            return entry.handleError(error);
        }
        console.error("Unhandleable error:", error);
        return "[OCR Error]";
    }

    // Initialize Defaults
    engineMetadata.set('tesseract', { instance: null, state: 'idle', loadPromise: null });

    return {
        onReady, onLoading, onError, onStatusChange,
        switchEngine, preloadCoreEngines, disposeAllEngines,
        getOrLoadEngine,
        runOCR, preprocess, postprocess, notifyStatus, _notifyStatus: notifyStatus,
        isReady: () => isReady,
        getEngineMetadata: (id) => engineMetadata.get(id), // New state inspection
        getInfo: () => currentInfo || { id: null, capabilities: {} },
        getEngineInstance: () => currentEngine,
        getReadyStatus,
        emitError: (err) => emit('error', err),
        handleError: (err) => {
            console.error("[ENGINE-ERROR]", err);
            return "🔴 OCR ERROR";
        },
        STATUS // Export registry
    };

})();

// Temporary global bridge
window.EngineManager = EngineManager;


// Modular engine state handled by EngineManager events.

/**
 * Modular engine switcher to replace legacy logic eventually.
 * @param {string} id - The engine ID from the registry.
 */
async function switchEngineModular(id) {
    const normalizedId = id.replace(/_.+$/, "");
    console.log('[TRACE] switchEngineModular requested engine =', normalizedId);
    if (getSetting('debug')) console.debug("[ENGINE-DEBUG] switchEngineModular() requested:", id, "normalized:", normalizedId);

    try {
        logTrace(`Switching engine to: ${id}`);
        
        // 1) UI State Sync
        const mangaNote = document.getElementById('manga-note');
        if (mangaNote) {
            mangaNote.classList.toggle('visible', normalizedId === 'manga');
            mangaNote.classList.remove('expanded'); // Always start collapsed (Minimalist Pass)
        }

        const capturePreviewMenu = document.getElementById('menu-capture-preview');
        if (capturePreviewMenu) capturePreviewMenu.style.display = normalizedId === 'manga' ? 'none' : 'block';

        const mainNode = document.querySelector('.app-main');
        if (mainNode) {
            if (normalizedId === 'manga') mainNode.classList.add('manga-layout');
            else mainNode.classList.remove('manga-layout');
        }

        // 2) Lock UI Selectors
        if (engineSelector) engineSelector.disabled = true;
        if (modeSelector) modeSelector.disabled = true;

        // 3) Trigger Lifecycle (EngineManager handles caching and warm-up)
        const registryEntry = engines[normalizedId];
        if (!registryEntry) {
            throw new Error(`No engine factory for: ${normalizedId}`);
        }

        await EngineManager.switchEngine({
            ...registryEntry,
            id: normalizedId
        });

        // 4) Restore UI Selectors
        if (engineSelector) {
            let selectorValue = id;
            if (id === "paddle") {
                const count = getSetting('paddleLineCount') || 3;
                selectorValue = `paddle_${count}`;
            }
            engineSelector.value = selectorValue;
            engineSelector.disabled = false;
        }
        if (modeSelector) {
            const engineInfo = EngineManager.getInfo() || {};
            const caps = engineInfo.capabilities || {};
            modeSelector.disabled = !caps.supportsModes;
        }

    } catch (err) {
        console.error('[ENGINE-ERROR] Switch failed:', err);
        setOCRStatus('error', '🔴 Factory Missing');
        if (engineSelector) engineSelector.disabled = false;
        if (modeSelector) modeSelector.disabled = false;
    }
}


// Phase 5: PWA Install Management (Fixed duplication)
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

document.getElementById('install-btn')?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
});




// State
let voices = [];
let currentUtterance = null;
let videoStream = null;


// Redundant declaration removed to resolve SyntaxError in Gold v3.1.1
let captureGeneration = 0;
let selectionRect = null;
let multiPassOverlayCollapsed = false;


// Smart Scout: 32x32 Comparison Logic
const scoutCanvas = document.createElement('canvas');
scoutCanvas.width = 32; scoutCanvas.height = 32;
const scoutCtx = scoutCanvas.getContext('2d', { willReadFrequently: true });
let lastScoutData = null;
let autoCaptureTimer = null;
let stabilityTimer = null;

// ==========================================
// 0. Initialization & UI Sync
// ==========================================

function loadVoices() {
    voices = window.speechSynthesis.getVoices();
    const jaVoices = voices.filter(v => v.lang.startsWith('ja'));
    if (ttsVoiceSelect) {
        ttsVoiceSelect.innerHTML = '<option value="">🔇 TTS Off</option>';
        jaVoices.forEach((voice) => {
            const option = document.createElement('option');
            option.value = voice.name;
            option.textContent = voice.name;
            if (voice.name.includes('Haruka') || voice.name.includes('Google 日本語')) option.selected = true;
            ttsVoiceSelect.appendChild(option);
        });
    }
}
window.speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();

// Gold v3.1: Moved upscaleSlider.oninput to initSettings for unified state management

// Step 2: Wire EngineManager (passive listener)
// Gold v3.1.1: Relocated EngineManager.onStatusChange to globalInitialize footer to ensure deterministic hydration.

// Progress Pill v2: Unified State Machine (Gold v3.8)
let statusSettleTimer = null;
let statusTransitionLock = false;

/**
 * High-fidelity status management for the Progress Pill v2.
 * @param {string} state - The status category (ready, processing, loading, etc.)
 * @param {string} text - The display string.
 * @param {number|null} progress - 0.0 to 1.0 or null.
 * @param {string|null} sourceId - The engine ID that sent this update.
 */
function setOCRStatus(state, text, progress = null, sourceId = null) {
    // 1. Internal EngineManager Sync
    if (window.EngineManager && typeof EngineManager._notifyStatus === 'function') {
        EngineManager._notifyStatus(state, text, progress);
    }

    const ocrStatus = document.getElementById('ocr-status');
    const statusLabel = document.getElementById('status-text');
    if (!ocrStatus || !statusLabel) return;

    // 2. Silent Preload Guard
    // If update is from an engine that isn't the current target, discard unless it's an error.
    // Only filter if sourceId is explicitly provided (defined) and different from activeId.
    const activeId = EngineManager.getInfo().id;
    if (typeof sourceId === 'string' && sourceId !== activeId && state !== STATUS.ERROR) {
        if (getSetting('debug')) console.debug(`[STATUS-DEBUG] Filtering silent preload status from ${sourceId}`);
        return;
    }

    // 3. Settle Logic: Prevent rapid-fire READY flickers
    if (state === STATUS.READY) {
        if (statusSettleTimer) return; // Wait for the existing timer
        statusSettleTimer = setTimeout(() => {
            applyStatusStage(STATUS.READY, text || EngineManager.getReadyStatus(), null);
            statusSettleTimer = null;
        }, 120); // 120ms "Settle" window for absolute stability
        return;
    }

    // If a non-ready status (processing/error) comes in, cancel any pending readiness
    if (statusSettleTimer) {
        clearTimeout(statusSettleTimer);
        statusSettleTimer = null;
    }

    applyStatusStage(state, text, progress);

    function applyStatusStage(s, t, p) {
        // Progress Normalization
        if (p === null || s === STATUS.READY || s === STATUS.ERROR) {
            ocrStatus.style.removeProperty('--progress');
        } else {
            const pct = Math.round(p * 100);
            ocrStatus.style.setProperty('--progress', `${pct}%`);
            if (t && !t.includes('%') && !t.includes('/')) t = `${t} (${pct}%)`;
        }

        // Text Transition (Fading)
        if (statusLabel.textContent !== t) {
            statusLabel.classList.add('fading');
            setTimeout(() => {
                statusLabel.textContent = t;
                statusLabel.classList.remove('fading');
            }, 100); // Wait for fade-out, update, then fade-in via CSS
        }

        // Class State Mapping
        ocrStatus.className = `status-pill ${s}`;
    }
}

async function initOCR() {
    // Since #model-selector now handles engines, we default Tesseract to 'jpn_best'
}

function sliceImageIntoLines(canvas, lineCount) {
    const slices = [];
    const { width, height } = canvas;
    const sliceHeight = height / lineCount;

    for (let i = 0; i < lineCount; i++) {
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = width;
        sliceCanvas.height = sliceHeight;

        const ctx = sliceCanvas.getContext('2d');
        ctx.drawImage(
            canvas,
            0, i * sliceHeight, width, sliceHeight,
            0, 0, width, sliceHeight
        );

        slices.push(sliceCanvas);
    }

    return slices;
}

function drawSlicingGuides(ctx, x, y, width, height, lineCount) {
    if (lineCount <= 1) return;

    const sliceHeight = height / lineCount;

    ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)';
    ctx.lineWidth = 1.5;

    for (let i = 1; i < lineCount; i++) {
        const lineY = y + i * sliceHeight;
        ctx.beginPath();
        ctx.moveTo(x, lineY);
        ctx.lineTo(x + width, lineY);
        ctx.stroke();
    }
}


function updatePaddlePanelVisibility() {
    const eSelector = document.getElementById('model-selector');
    if (!eSelector) return;
    // Note: Panel is now part of the dropdown itself, nothing to toggle display on
}

function applyTesseractPreprocessing(cropCanvas, mode) {
    if (mode === 'multi') {
        return [
            applyPreprocessing(cropCanvas, 'default_mini'),
            applyPreprocessing(cropCanvas, 'default_full'),
            applyPreprocessing(cropCanvas, 'adaptive'),
            applyPreprocessing(cropCanvas, 'grayscale'),
            applyPreprocessing(cropCanvas, 'binarize'),
        ];
    }

    if (mode === 'last_resort') {
        let nuclear = applyPreprocessing(cropCanvas, 'default_full');
        nuclear = sharpenCanvas(nuclear);
        return [nuclear];
    }

    return [applyPreprocessing(cropCanvas, mode)];
}

function applyPaddlePreprocessing(cropCanvas, lineCount) {
    const count = lineCount || 1;
    let slices = [cropCanvas];
    if (count > 1) {
        slices = sliceImageIntoLines(cropCanvas, count);
    }
    return slices.map(s => {
        const t1 = trimEmptyVertical(s);
        // If we created a NEW slice (count > 1), dispose of original slice canvas 's'
        if (count > 1) { s.width = 0; s.height = 0; }

        const t2 = padLeft(t1, 4);
        t1.width = 0; t1.height = 0; // Dispose intermediate

        const t3 = boostContrast(t2, 1.08);
        t2.width = 0; t2.height = 0; // Dispose intermediate

        return t3;
    });
}

/**
 * Unified preprocessing entry point. Delegates to the active engine's preprocess function.
 * @param {string} engineId - Active engine ID (used for trace logging only)
 * @param {HTMLCanvasElement} rawCanvas - The original crop
 * @param {string} mode - Preprocessing mode (adaptive, multi, etc.)
 * @param {number} lineCount - Number of lines (for Paddle)
 * @returns {HTMLCanvasElement[]} Array of one or more preprocessed canvases.
 */
async function preprocessForEngine(engineId, rawCanvas, mode, lineCount) {
    console.log('[TRACE] preprocessForEngine called with engineId =', engineId);
    const pinnedEngine = EngineManager.getEngineInstance();
    
    // Try instance preprocess first
    if (pinnedEngine && typeof pinnedEngine.preprocess === 'function') {
        try {
            return await pinnedEngine.preprocess(rawCanvas, mode, lineCount);
        } catch (err) {
            if (window.VNOCR_DEBUG) console.warn("[ENGINE] Instance preprocess failed, trying registry fallback:", err);
        }
    }
    
    // Fallback 1: Try registry entry preprocess
    const entry = engines[engineId];
    if (entry && typeof entry.preprocess === 'function') {
        try {
            return await entry.preprocess(rawCanvas, mode, lineCount);
        } catch (err) {
            if (window.VNOCR_DEBUG) console.warn("[ENGINE] Registry preprocess failed, using raw canvas fallback:", err);
        }
    }
    
    // Final Fallback: Clone raw canvas to prevent pipeline from destroying original
    if (window.VNOCR_DEBUG) console.debug("[ENGINE] No preprocess available, returning cloned canvas");
    const cloned = document.createElement('canvas');
    cloned.width = rawCanvas.width;
    cloned.height = rawCanvas.height;
    cloned.getContext('2d').drawImage(rawCanvas, 0, 0);
    return [cloned];
}


if (modeSelector) {
    modeSelector.addEventListener('change', () => {
        applyUIToSettings();
        // if (getSetting('debug')) console.debug('[Mode Select] Mode updated:', modeSelector.value);
        removeMultiPassOverlay();
        setOCRStatus('ready', '');
    });
}



// ==========================================
// 1. Audio & TTS
// ==========================================

function speak(text) {
    if (!ttsVoiceSelect || !ttsVoiceSelect.value || !text) return;
    if (currentUtterance) window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const selectedVoice = voices.find(v => v.name === ttsVoiceSelect.value);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.lang = 'ja-JP';
    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
}

if (speakLatestBtn) speakLatestBtn.onclick = () => { if (latestText) speak(latestText.textContent); };

if (historyContent) {
    historyContent.addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const item = btn.closest('.history-item');
        const textSpan = item ? item.querySelector('span') : null;
        if (!textSpan) return;
        const action = btn.getAttribute('data-action');
        if (action === 'speak') speak(textSpan.textContent);
        if (action === 'copy') {
            navigator.clipboard.writeText(textSpan.textContent).catch(() => { });
            btn.innerHTML = '✅';
            setTimeout(() => btn.innerHTML = '📋', 1000);
        }
    });
    historyContent.addEventListener('mouseup', () => {
        if (!getSetting('autoCopy')) return;
        const sel = window.getSelection().toString().trim();
        if (!sel) return;
        navigator.clipboard.writeText(sel).then(() => {
            historyContent.style.outline = '2px solid var(--accent)';
            setTimeout(() => { historyContent.style.outline = ''; }, 300);
        }).catch(() => { });
    });
}

if (latestText) {
    latestText.addEventListener('mouseup', async () => {
        if (!getSetting('autoCopy')) return;
        const sel = window.getSelection().toString().trim();
        if (!sel) return;
        try {
            await navigator.clipboard.writeText(sel);
            latestText.classList.add('copied-flash');
            setTimeout(() => latestText.classList.remove('copied-flash'), 200);
        } catch (err) {
            console.warn("[UX] Auto-Copy failed (clipboard restricted):", err);
        }
    });
}

// End of file

// ==========================================
// 2. Window Capture
// ==========================================

async function startCapture() {
    try {
        videoStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "never" }, audio: false });
        vnVideo.srcObject = videoStream;
        videoStream.getVideoTracks()[0].onended = stopCapture;
        selectWindowBtn.classList.add('stop');
        selectWindowBtn.textContent = 'Stop Capture';
        const placeholder = document.getElementById('placeholder');
        if (placeholder) placeholder.style.display = 'none';
        const hint = document.getElementById('selection-hint');
        if (hint) hint.classList.add('visible');

        // Restore Auto-Capture Loop (Gold v3.8 Stability Pass)
        if (autoCaptureTimer) clearInterval(autoCaptureTimer);
        autoCaptureTimer = setInterval(checkAutoCapture, 500);
    } catch (err) {
        if (videoStream) { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }
    }
}

function stopCapture() {
    if (videoStream) videoStream.getTracks().forEach(t => t.stop());
    videoStream = null; vnVideo.srcObject = null;
    if (autoCaptureTimer) { clearInterval(autoCaptureTimer); autoCaptureTimer = null; }
    if (stabilityTimer) { clearTimeout(stabilityTimer); stabilityTimer = null; }
    const placeholder = document.getElementById('placeholder');
    if (placeholder) placeholder.style.display = 'flex';
    const hint = document.getElementById('selection-hint');
    if (hint) hint.classList.remove('visible');
    selectWindowBtn.classList.remove('stop');
    selectWindowBtn.textContent = 'Select Window Source';
}

// Event binding moved to initEventListeners()

function setupSelectionOverlay() {
    if (!selectionOverlay) return;
    const ctx = selectionOverlay.getContext('2d');
    let isSelecting = false, startX = 0, startY = 0, currentX = 0, currentY = 0;
    const resizeCanvas = () => {
        selectionOverlay.width = selectionOverlay.clientWidth;
        selectionOverlay.height = selectionOverlay.clientHeight;
        if (selectionRect) window.drawSelectionRect();
    };
    new ResizeObserver(resizeCanvas).observe(selectionOverlay);

    const getMousePos = (e) => {
        const rect = selectionOverlay.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    selectionOverlay.onmousedown = e => {
        if (e.button !== 0) return;
        isSelecting = true; const pos = getMousePos(e);
        startX = currentX = pos.x; startY = currentY = pos.y;
        selectionRect = null; drawSelectionRect();
        const hint = document.getElementById('selection-hint');
        if (hint) hint.classList.remove('visible');
    };

    const applyMangaConstraint = () => {
        const engineSelect = document.getElementById('model-selector');
        if (engineSelect && engineSelect.value === 'manga') {
            const w = Math.abs(currentX - startX);
            const h = Math.abs(currentY - startY);
            if (h === 0) return; // avoid div by zero on first pixel

            if (w > h * 1.2) {
                const allowedW = h * 1.2;
                currentX = currentX > startX ? startX + allowedW : startX - allowedW;
            } else if (h > w * 1.2) {
                const allowedH = w * 1.2;
                currentY = currentY > startY ? startY + allowedH : startY - allowedH;
            }
        }
    };

    window.addEventListener('mousemove', e => {
        if (isSelecting) {
            const pos = getMousePos(e);
            currentX = pos.x;
            currentY = pos.y;
            applyMangaConstraint();
            drawSelectionRect();
        }
    });

    window.addEventListener('mouseup', e => {
        if (!isSelecting) return;
        isSelecting = false; const pos = getMousePos(e);
        currentX = pos.x; currentY = pos.y;
        applyMangaConstraint();

        const w = selectionOverlay.width, h = selectionOverlay.height;
        const selX = Math.min(startX, currentX);
        const selY = Math.min(startY, currentY);
        const selW = Math.abs(currentX - startX);
        const selH = Math.abs(currentY - startY);

        // Hardware Hardening Point 2: 8x8px Crop Clamp
        const isValidCrop = selW >= 8 && selH >= 8;

        const finalRect = {
            x: selX / w,
            y: selY / h,
            width: selW / w,
            height: selH / h
        };
        const hint = document.getElementById('selection-hint');
        if (isValidCrop) {
            selectionRect = finalRect;

            // Throttled First Capture (Patch v2.5)
            if (!captureLocked && engineReady) {
                captureLocked = true;
                updateCaptureButtonState();

                captureFrame(selectionRect).finally(() => {
                    setTimeout(() => {
                        captureLocked = false;
                        updateCaptureButtonState();
                    }, 300);
                });
            }

            if (hint) hint.classList.remove('visible');
        } else {
            selectionRect = null;
            if (hint) hint.classList.add('visible');
            setOCRStatus('ready', '⚪ Selection too small (min 8x8px)');
        }
        drawSelectionRect();
    });
    window.drawSelectionRect = function () {
        const canvasW = selectionOverlay.width, canvasH = selectionOverlay.height;
        ctx.clearRect(0, 0, canvasW, canvasH);
        if (!isSelecting && !selectionRect) return;
        const x = isSelecting ? Math.min(startX, currentX) : selectionRect.x * canvasW;
        const y = isSelecting ? Math.min(startY, currentY) : selectionRect.y * canvasH;
        const w = isSelecting ? Math.abs(currentX - startX) : selectionRect.width * canvasW;
        const h = isSelecting ? Math.abs(currentY - startY) : selectionRect.height * canvasH;
        if (isSelecting) { ctx.fillStyle = 'rgba(16, 185, 129, 0.15)'; ctx.fillRect(x, y, w, h); }
        ctx.strokeStyle = '#10b981'; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = '#10b981'; const s = 10;
        ctx.fillRect(x, y, s, 3); ctx.fillRect(x, y, 3, s);
        ctx.fillRect(x + w - s, y, s, 3); ctx.fillRect(x + w - 3, y, 3, s);
        // draw slicing guides for PaddleOCR
        const rawValue = engineSelector.value;
        if (rawValue.startsWith('paddle')) {
            const lineCount = getSetting('paddleLineCount') || 1;
            drawSlicingGuides(ctx, x, y, w, h, lineCount);
        }
    }
}

// ==========================================
// 4. Auto-Capture
// ==========================================

function checkAutoCapture() {
    if (!autoToggle || !autoToggle.checked || !videoStream || !selectionRect) return;

    // 1. Maintain scout data even during processing to prevent "stale" comparison after long loads.
    // IMPORTANT: Auto-capture must keep lastScoutData fresh even while isProcessing is true,
    // otherwise it will "wake up blind" after long operations (like PaddleOCR load)
    // and fire phantom double OCR triggers.
    const sel = denormalizeSelection(selectionRect, vnVideo, selectionOverlay);
    scoutCtx.drawImage(vnVideo, sel.x, sel.y, sel.w, sel.h, 0, 0, 32, 32);
    const pix = scoutCtx.getImageData(0, 0, 32, 32).data;
    const currentData = new Uint32Array(pix.buffer);

    // 2. Only run comparison and stability triggers if we aren't already busy AND engine is ready
    // Hardening v3.8: Added EngineManager.isReady() guard to prevent captures during switching/loading.
    if (!isProcessing && EngineManager.isReady() && lastScoutData) {
        let diffPixels = 0;
        for (let i = 0; i < currentData.length; i++) { if (currentData[i] !== lastScoutData[i]) diffPixels++; }
        
        if (diffPixels > 10) {
            clearTimeout(stabilityTimer);
            if (autoToggle.parentElement) autoToggle.parentElement.classList.add('active');
            
            stabilityTimer = setTimeout(() => {
                if (autoToggle?.parentElement) autoToggle.parentElement.classList.remove('active');
                
                // Re-verify conditions after 800ms delay
                if (getSetting('autoCapture') && !isProcessing && EngineManager.isReady()) {
                    captureFrame(selectionRect);
                }
            }, 800);
        }
    }
    lastScoutData = new Uint32Array(currentData);
}

// ==========================================
// 5. OCR Processing Core
// ==========================================

/** 
 * BT.601 luma from RGB components.
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {number} Weighted grayscale value.
 */
const lumaBT601 = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/** 
 * Denormalize a normalized selection rect to video pixel coordinates.
 * @param {Object} rect - Normalized {x, y, width, height} (0-1).
 * @param {HTMLVideoElement} videoEl - Source video reference.
 * @param {HTMLCanvasElement} overlayEl - Reference for actual CSS display dimensions.
 * @returns {Object} Pixel coordinates {x, y, w, h}.
 */
function denormalizeSelection(rect, videoEl, overlayEl) {
    const vWidth = videoEl.videoWidth, vHeight = videoEl.videoHeight;
    const cWidth = overlayEl.width, cHeight = overlayEl.height;
    const vAspect = vWidth / vHeight, cAspect = cWidth / cHeight;
    let actualWidth, actualHeight, offsetX = 0, offsetY = 0;
    if (vAspect > cAspect) { actualWidth = cWidth; actualHeight = cWidth / vAspect; offsetY = (cHeight - actualHeight) / 2; }
    else { actualHeight = cHeight; actualWidth = cHeight * vAspect; offsetX = (cWidth - actualWidth) / 2; }
    const rectX = rect.x * cWidth, rectY = rect.y * cHeight;
    const rectW = rect.width * cWidth, rectH = rect.height * cHeight;
    const x = ((rectX - offsetX) / actualWidth) * vWidth;
    const y = ((rectY - offsetY) / actualHeight) * vHeight;
    const w = (rectW / actualWidth) * vWidth;
    const h = (rectH / actualHeight) * vHeight;
    // if (getSetting('debug')) console.debug('[VN-OCR] selection:', { x, y, w, h, vWidth, vHeight });
    return { x, y, w, h };
}

/** 
 * Update the debug thumbnail from a preprocessed canvas.
 * @param {HTMLCanvasElement} canvas - The preprocessed image to display.
 * @sideeffect Updates the 'debug-crop-img' src via DataURL.
 */
function updateDebugThumb(canvas) {
    const debugThumb = document.getElementById('debug-crop-img');
    if (!debugThumb || !canvas) return;
    if (canvas.height < 120) {
        debugThumb.src = canvas.toDataURL();
    } else {
        debugThumb.src = scaleCanvasToThumb(canvas, 700, 300).toDataURL();
    }
    debugThumb.style.display = 'block';
}

/**
 * Helper: scale canvas down to fit bounding box (never upscales).
 * @param {HTMLCanvasElement} c - Source canvas.
 * @param {number} maxW - Bounding width.
 * @param {number} maxH - Bounding height.
 * @returns {HTMLCanvasElement} A new scaled canvas.
 */
function scaleCanvasToThumb(c, maxW, maxH) {
    const r = document.createElement('canvas');
    const ratio = Math.min(maxW / c.width, maxH / c.height, 1);
    r.width = c.width * ratio;
    r.height = c.height * ratio;
    r.getContext('2d').drawImage(c, 0, 0, r.width, r.height);
    return r;
}

// === UNIVERSAL MICRO-FILTER HELPERS ===

/**
 * Trims empty (fully transparent) rows from the top and bottom of a canvas.
 * @param {HTMLCanvasElement} canvas - Binary or alpha-containing canvas.
 * @returns {HTMLCanvasElement} A new trimmed canvas (or original if no trim possible).
 */
function trimEmptyVertical(canvas) {
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    const img = ctx.getImageData(0, 0, width, height);
    const data = img.data;

    let top = 0;
    let bottom = height - 1;

    for (; top < height; top++) {
        let empty = true;
        for (let x = 0; x < width; x++) {
            if (data[(top * width + x) * 4 + 3] !== 0) { empty = false; break; }
        }
        if (!empty) break;
    }

    for (; bottom > top; bottom--) {
        let empty = true;
        for (let x = 0; x < width; x++) {
            if (data[(bottom * width + x) * 4 + 3] !== 0) { empty = false; break; }
        }
        if (!empty) break;
    }

    const newH = bottom - top + 1;
    if (newH <= 0) return canvas;

    const out = document.createElement("canvas");
    out.width = width;
    out.height = newH;
    out.getContext("2d").drawImage(canvas, 0, top, width, newH, 0, 0, width, newH);
    return out;
}

/**
 * Adds a horizontal padding of empty pixels to the left side of a canvas.
 * used to improve recognition start-char accuracy.
 * @param {HTMLCanvasElement} canvas - Source image.
 * @param {number} [px=4] - Amount of padding in pixels.
 * @returns {HTMLCanvasElement} A new padded canvas.
 */
function padLeft(canvas, px = 4) {
    const out = document.createElement("canvas");
    out.width = canvas.width + px;
    out.height = canvas.height;
    const ctx = out.getContext("2d");
    ctx.drawImage(canvas, px, 0);
    return out;
}

/**
 * Linearly increases the contrast of a canvas by scaling RGB values.
 * @param {HTMLCanvasElement} canvas - Source image.
 * @param {number} [factor=1.08] - Contrast multiplier.
 * @returns {HTMLCanvasElement} A new high-contrast canvas.
 */
function boostContrast(canvas, factor = 1.08) {
    const ctx = canvas.getContext("2d");
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;

    for (let i = 0; i < d.length; i += 4) {
        d[i] = Math.min(255, d[i] * factor);
        d[i + 1] = Math.min(255, d[i + 1] * factor);
        d[i + 2] = Math.min(255, d[i + 2] * factor);
    }

    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    out.getContext("2d").putImageData(img, 0, 0);
    return out;
}

async function captureFrame(rect = null) {
    // Hardening v3.4: Null-selection guard (Fixes denormalizeSelection TypeError)
    if (!rect && !window.selectionRect) return;

    // Hardening v3.8: Combined readiness and processing lock
    if (isProcessing || !EngineManager.isReady()) return;
    
    const myGen = ++captureGeneration;
    let lockReleased = false;
    
    // Helper to release lock safely
    const releaseLock = () => {
        if (!lockReleased) {
            isProcessing = false;
            lockReleased = true;
        }
    };
    
    isProcessing = true;
    
    // Engine Pinning: Lock current instance and ID to ensure consistency throughout the slice cycle
    const pinnedEngine = EngineManager.getEngineInstance();
    const pinnedInfo = EngineManager.getInfo() || { id: null, capabilities: {} };
    const pinnedCaps = pinnedInfo.capabilities || {};
    const pinnedId = pinnedInfo.id || null;
    
    logTrace(`Capture started. Gen: ${myGen} | Engine: ${pinnedId}`);

    const vWidth = vnVideo.videoWidth, vHeight = vnVideo.videoHeight;
    const sel = denormalizeSelection(rect, vnVideo, selectionOverlay);
    const cx_ = Math.max(0, Math.floor(sel.x)), cy_ = Math.max(0, Math.floor(sel.y));
    const cw_ = Math.max(1, Math.min(vWidth - cx_, Math.floor(sel.w))), ch_ = Math.max(1, Math.min(vHeight - cy_, Math.floor(sel.h)));

    const rawCropCanvas = document.createElement('canvas');
    rawCropCanvas.width = cw_; rawCropCanvas.height = ch_;
    rawCropCanvas.getContext('2d').drawImage(vnVideo, cx_, cy_, cw_, ch_, 0, 0, cw_, ch_);

    EngineManager._notifyStatus(STATUS.PROCESSING, '🟡 Processing...', null, pinnedId);
    await new Promise(r => setTimeout(r, 0)); // yield to browser for repaint
    
    const mode = modeSelector.value;
    
    try {
        // Tesseract Multi-Pass Branch
        if (pinnedId === 'tesseract' && mode === 'multi') {
            const preStart = performance.now();
            const canvases = applyTesseractPreprocessing(rawCropCanvas, mode);
            perfStats.preprocess = performance.now() - preStart;
            const results = [];

            // 1. First Pass: Early exit if result is highly confident and clean
            const infStart = performance.now();
            const first = await EngineManager.runOCR(canvases[0], pinnedEngine);
            
            // Generation Check (Critical for preventing UI ghosting)
            if (captureGeneration !== myGen) {
                canvases.forEach(c => { c.width = 0; c.height = 0; });
                return;
            }

            const firstDensity = scoreJapaneseDensity(first.text);
            if (first.confidence > 85 && firstDensity > 5) {
                addOCRResultToUI(first.text);
                updateDebugThumb(canvases[0]);
                perfStats.inference = performance.now() - infStart;
                canvases.forEach(c => { c.width = 0; c.height = 0; });
                if (window.updatePerformanceStatus) window.updatePerformanceStatus();
                return;
            }

            // 2. Otherwise: Continue with the remaining 4 passes for Analyst voting
            results.push({ text: first.text, confidence: first.confidence });
            for (let i = 1; i < canvases.length; i++) {
                setOCRStatus('processing', `Analyst: Pass ${i + 1}/5...`);
                // Pinning: Pass pinnedEngine to runOCR
                const r = await EngineManager.runOCR(canvases[i], pinnedEngine);
                if (captureGeneration !== myGen) {
                    canvases.forEach(c => { c.width = 0; c.height = 0; });
                    return;
                }
                results.push({ text: r.text, confidence: r.confidence });
            }

            const finalText = pickBestMultiPassResult(results);
            addOCRResultToUI(finalText);
            const bestIndex = findBestMultiPassIndex(results);
            updateDebugThumb(canvases[bestIndex]);
            showMultiPassOverlay(results, finalText);
            perfStats.inference = performance.now() - infStart;
            setOCRStatus('ready', '🟢 Analyst Complete');
            canvases.forEach(c => { c.width = 0; c.height = 0; });
            if (window.updatePerformanceStatus) window.updatePerformanceStatus();
            return;
        }

        // Generic Pipeline Branch (Paddle / Manga / Tesseract Single)
        const lineCount = getSetting('paddleLineCount') || 1;
        const preStart = performance.now();
        const canvases = await preprocessForEngine(pinnedId, rawCropCanvas, mode, lineCount);
        perfStats.preprocess = performance.now() - preStart;
        
        if (captureGeneration !== myGen) {
            canvases.forEach(c => { c.width = 0; c.height = 0; });
            return;
        }

        const ocrLines = [];
        let totalConfidence = 0;
        let confidenceCount = 0;
        const inferenceResults = [];
        const infStart = performance.now();

        for (let i = 0; i < canvases.length; i++) {
            const clean = canvases[i];
            if (!clean.width || !clean.height) {
                inferenceResults.push(null);
                continue;
            }

            // Debug Thumbnail
            if (i === 0) {
                if (pinnedCaps.isMultiLine) updateDebugThumb(rawCropCanvas);
                else updateDebugThumb(canvases[0]);
            }

            try {
                setOCRStatus(STATUS.PROCESSING, `Processing (${i + 1}/${canvases.length})`, (i + 1) / canvases.length);
                // Pinning: Pass pinnedEngine instance to runOCR
                const result = await EngineManager.runOCR(clean, pinnedEngine);
                if (captureGeneration !== myGen) return;
                inferenceResults.push(result);
            } catch (error) {
                console.error(`[GEN ${myGen}] [INFERENCE-ERROR] Execution failed for slice:`, i, error);
                EngineManager.emitError(error);
                inferenceResults.push({ text: EngineManager.handleError(error), confidence: null });
            }
        }
        perfStats.inference = performance.now() - infStart;

        if (captureGeneration !== myGen) return;

        inferenceResults.forEach(result => {
            if (!result) return;
            const { text, confidence } = result;
            if (confidence !== null) {
                totalConfidence += confidence;
                confidenceCount++;
            }
            if (text && text.trim()) ocrLines.push(text.trim());
        });

        if (captureGeneration !== myGen) return;

        // Post-processing
        const finalText = EngineManager.postprocess(ocrLines);
        const avgConfidence = confidenceCount > 0 ? (totalConfidence / confidenceCount) : null;

        if (finalText) {
            addOCRResultToUI(finalText, avgConfidence);
            setOCRStatus('ready', '🟢 OCR Complete');
        } else {
            setOCRStatus('ready', '⚪ No text detected');
        }
        logTrace(`Capture Cycle Complete. Gen: ${myGen}`);

        canvases.forEach(c => {
            if (c && c !== rawCropCanvas) {
                c.width = 0; c.height = 0;
            }
        });
    } catch (err) {
        console.error("Frame-level OCR Error:", err);
        EngineManager.emitError(err);
    }
    finally {
        if (rawCropCanvas) {
            rawCropCanvas.width = 0; rawCropCanvas.height = 0;
        }

        // Small cooldown to prevent rapid-fire re-triggering
        setTimeout(() => {
            // Always release the lock for this generation
            releaseLock();
            
            // Only update UI if this generation is still current
            if (captureGeneration === myGen) {
                if (EngineManager.isReady()) {
                    setOCRStatus('ready', EngineManager.getReadyStatus());
                }
                updateCaptureButtonState();
            }
        }, 100);
    }
}

/** Integral-image local mean adaptive threshold. Returns thresholded ImageData. */
function adaptiveThreshold(canvas, ctx, res, { windowDivisor, thresholdFactor, preInvert, preDenoise }) {
    if (preInvert) canvas = invertCanvas(canvas);
    canvas = sharpenCanvas(canvas);
    if (preDenoise) canvas = medianFilter(canvas);

    const octx = res.getContext('2d');
    octx.drawImage(canvas, 0, 0);
    const id2 = octx.getImageData(0, 0, res.width, res.height);
    const d2 = id2.data;
    const w = res.width, h = res.height;
    const integral = new Float64Array(w * h);
    const lumaArr = new Float64Array(w * h);

    for (let y = 0; y < h; y++) {
        let rowSum = 0;
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const v = lumaBT601(d2[i], d2[i + 1], d2[i + 2]);
            lumaArr[y * w + x] = v;
            rowSum += v;
            integral[y * w + x] = (y === 0 ? 0 : integral[(y - 1) * w + x]) + rowSum;
        }
    }

    const s = Math.floor(w / windowDivisor);
    const s2 = Math.floor(s / 2);

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const x1 = Math.max(0, x - s2), x2 = Math.min(w - 1, x + s2);
            const y1 = Math.max(0, y - s2), y2 = Math.min(h - 1, y + s2);
            const count = (x2 - x1 + 1) * (y2 - y1 + 1);

            let sum = integral[y2 * w + x2];
            if (x1 > 0) sum -= integral[y2 * w + x1 - 1];
            if (y1 > 0) sum -= integral[(y1 - 1) * w + x2];
            if (x1 > 0 && y1 > 0) sum += integral[(y1 - 1) * w + x1 - 1];

            const i = (y * w + x) * 4;
            d2[i] = d2[i + 1] = d2[i + 2] =
                (lumaArr[y * w + x] * count < sum * thresholdFactor) ? 0 : 255;
        }
    }

    ctx.putImageData(id2, 0, 0);
    return id2;
}

function applyPreprocessing(canvas, mode) {
    if (!canvas || canvas.width === 0 || canvas.height === 0) return canvas;
    if (mode === 'raw') return lr_addPadding(canvas, 10);
    const scale = Math.max(1, Math.min(4, parseFloat(upscaleSlider?.value ?? '2')));
    canvas = lr_upscale(canvas, scale);

    const res = document.createElement('canvas'); res.width = canvas.width; res.height = canvas.height;
    const ctx = res.getContext('2d'); ctx.drawImage(canvas, 0, 0);
    const id = ctx.getImageData(0, 0, res.width, res.height); const d = id.data;
    let workingId = null;
    if (mode === 'raw') {
        return lr_addPadding(canvas, 10);
    } else if (mode === 'binarize') {
        canvas = invertCanvas(canvas);
        canvas = sharpenCanvas(canvas);

        ctx.drawImage(canvas, 0, 0);
        const id2 = ctx.getImageData(0, 0, res.width, res.height);
        const d2 = id2.data;

        for (let i = 0; i < d2.length; i += 4) {
            const v = lumaBT601(d2[i], d2[i + 1], d2[i + 2]);
            const contrasted = 128 + (v - 128) * 1.35;
            const out = contrasted < 128 ? 0 : 255;
            d2[i] = d2[i + 1] = d2[i + 2] = out;
        }

        ctx.putImageData(id2, 0, 0);
        canvas = medianFilter(res);
        workingId = id2;
    } else if (mode === 'adaptive') {
        workingId = adaptiveThreshold(canvas, ctx, res, { windowDivisor: 8, thresholdFactor: 0.85, preInvert: true, preDenoise: false });
        canvas = medianFilter(res);
    } else if (mode === 'grayscale') {
        canvas = sharpenCanvas(canvas);

        ctx.drawImage(canvas, 0, 0);
        const id2 = ctx.getImageData(0, 0, res.width, res.height);
        const d2 = id2.data;

        for (let i = 0; i < d2.length; i += 4) {
            const v = lumaBT601(d2[i], d2[i + 1], d2[i + 2]);
            const contrasted = 128 + (v - 128) * 1.15;
            const out = contrasted < 0 ? 0 : (contrasted > 255 ? 255 : contrasted);
            d2[i] = d2[i + 1] = d2[i + 2] = out;
        }

        ctx.putImageData(id2, 0, 0);
        canvas = medianFilter(res);
        workingId = id2;
    } else if (mode === 'default_mini') {
        workingId = adaptiveThreshold(canvas, ctx, res, { windowDivisor: 10, thresholdFactor: 0.90, preInvert: false, preDenoise: true });
    } else if (mode === 'default_full') {
        workingId = adaptiveThreshold(canvas, ctx, res, { windowDivisor: 8, thresholdFactor: 0.80, preInvert: true, preDenoise: true });
    }

    // === UNIFIED CLEANUP STEP ===
    if (workingId) {
        const w = res.width, h = res.height;
        const d2 = workingId.data;
        let brightRegions = 0, darkRegions = 0;
        const marginW = Math.floor(w * 0.05), marginH = Math.floor(h * 0.05);
        const sampleW = Math.floor((w - 2 * marginW) / 3), sampleH = Math.floor((h - 2 * marginH) / 3);

        // 1. Stroke-Aware Local Polarity Detection (3x3 Grid)
        for (let gy = 0; gy < 3; gy++) {
            for (let gx = 0; gx < 3; gx++) {
                let brightEdges = 0, darkEdges = 0, minL = 255, maxL = 0;
                const rX = marginW + gx * sampleW, rY = marginH + gy * sampleH;
                for (let y = rY; y < rY + sampleH && y < h - 1; y++) {
                    for (let x = rX; x < rX + sampleW && x < w - 1; x++) {
                        const i = (y * w + x) * 4;
                        const l = (d2[i] + d2[i + 1] + d2[i + 2]) / 3;
                        if (l < minL) minL = l; if (l > maxL) maxL = l;
                        const rL = (d2[i + 4] + d2[i + 5] + d2[i + 6]) / 3;
                        const bL = (d2[i + w * 4] + d2[i + w * 4 + 1] + d2[i + w * 4 + 2]) / 3;
                        if (l > rL + 20) brightEdges++; else if (l < rL - 20) darkEdges++;
                        if (l > bL + 20) brightEdges++; else if (l < bL - 20) darkEdges++;
                    }
                }
                if (maxL - minL > 25) {
                    if (brightEdges > darkEdges) brightRegions++;
                    else if (darkEdges > brightEdges) darkRegions++;
                }
            }
        }
        const textIsBright = brightRegions > darkRegions;

        // 2. Main Processing Pass (Polarity, Threshold, Flattening)
        for (let i = 0; i < d2.length; i += 4) {
            let l = (d2[i] + d2[i + 1] + d2[i + 2]) / 3;
            if (textIsBright) l = 255 - l;
            if (l < 55) l = 0;
            else if (l > 200) l = 255;
            else l = (l < 128) ? 0 : 255;
            d2[i] = d2[i + 1] = d2[i + 2] = l;
        }

        // 3. Spatial Cleanup (Halo Removal)
        const ref = new Uint8Array(d2);
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const i = (y * w + x) * 4;
                const center = ref[i];
                let sameCount = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        if (ref[((y + ky) * w + (x + kx)) * 4] === center) sameCount++;
                    }
                }
                if (sameCount < 3) {
                    const flipped = 255 - center;
                    d2[i] = d2[i + 1] = d2[i + 2] = flipped;
                }
            }
        }
        id.data.set(d2);
    }
    ctx.putImageData(id, 0, 0);
    return lr_addPadding(res, 10);
}

// Enhancements
function lr_upscale(canvas, f) {
    const res = document.createElement('canvas'); res.width = canvas.width * f; res.height = canvas.height * f;
    const ctx = res.getContext('2d');
    ctx.imageSmoothingEnabled = false; // PATCH 2 (Fix lr_upscale)
    ctx.drawImage(canvas, 0, 0, res.width, res.height); return res;
}

function lr_addPadding(canvas, pad) {
    const res = document.createElement('canvas');
    res.width = canvas.width + pad * 2;
    res.height = canvas.height + pad * 2;
    const ctx = res.getContext('2d');
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, res.width, res.height);
    ctx.drawImage(canvas, pad, pad);
    return res;
}

/** Returns new canvas. Applies 3x3 median filter per channel. */
function medianFilter(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const id = ctx.getImageData(0, 0, w, h);
    const d = id.data;
    const output = ctx.createImageData(w, h);
    const od = output.data;
    // Copy source pixels to output first (preserves 1px border)
    od.set(d);
    // Median-of-9 via partial sorting network (avoids Array.sort per pixel)
    const v = new Uint8Array(9);
    function swap(a, b) { if (v[a] > v[b]) { const t = v[a]; v[a] = v[b]; v[b] = t; } }
    function median9() {
        swap(0, 1); swap(3, 4); swap(6, 7);
        swap(1, 2); swap(4, 5); swap(7, 8);
        swap(0, 1); swap(3, 4); swap(6, 7);
        swap(0, 3); swap(3, 6); swap(1, 4);
        swap(4, 7); swap(2, 5); swap(5, 8);
        swap(1, 3); swap(5, 7); swap(2, 6);
        swap(4, 6); swap(2, 4); swap(2, 3);
        swap(5, 6); swap(4, 5);
        return v[4];
    }
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            for (let c = 0; c < 3; c++) {
                let k = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        v[k++] = d[((y + ky) * w + (x + kx)) * 4 + c];
                    }
                }
                od[(y * w + x) * 4 + c] = median9();
            }
            od[(y * w + x) * 4 + 3] = 255;
        }
    }
    const resCanvas = document.createElement('canvas');
    resCanvas.width = w; resCanvas.height = h;
    resCanvas.getContext('2d').putImageData(output, 0, 0);
    return resCanvas;
}

/** Returns a new inverted canvas. */
function invertCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
        d[i] = 255 - d[i];
        d[i + 1] = 255 - d[i + 1];
        d[i + 2] = 255 - d[i + 2];
    }
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    out.getContext('2d').putImageData(id, 0, 0);
    return out;
}

function sharpenCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const id = ctx.getImageData(0, 0, w, h);
    const d = id.data;
    const output = ctx.createImageData(w, h);
    const od = output.data;
    // Copy source pixels to output first (preserves 1px border)
    od.set(d);
    const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            for (let c = 0; c < 3; c++) {
                let sum = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        sum += d[((y + ky) * w + (x + kx)) * 4 + c] * kernel[(ky + 1) * 3 + (kx + 1)];
                    }
                }
                od[(y * w + x) * 4 + c] = Math.min(255, Math.max(0, sum));
            }
            od[(y * w + x) * 4 + 3] = 255;
        }
    }
    const resCanvas = document.createElement('canvas');
    resCanvas.width = w; resCanvas.height = h;
    resCanvas.getContext('2d').putImageData(output, 0, 0);
    return resCanvas;
}

function scoreJapaneseDensity(text) {
    const jp = (text.match(/[\u3040-\u30FF\u4E00-\u9FFF]/g) || []).length;
    const ascii = (text.match(/[A-Za-z0-9]/g) || []).length;
    const noise = (text.match(/[\u0000-\u001F]/g) || []).length;
    return jp - ascii * 0.5 - noise;
}

function pickBestMultiPassResult(results) {
    // 1. Majority vote
    const counts = {};
    for (const r of results) {
        counts[r.text] = (counts[r.text] || 0) + 1;
    }
    const majority = Object.entries(counts).find(([t, c]) => c >= 3);
    if (majority) return majority[0]; // Return the text (index 0), not the count (index 1)

    // 2. Highest confidence
    const bestByConf = results.reduce((a, b) =>
        a.confidence > b.confidence ? a : b
    );

    // 3. Density fallback
    const bestByDensity = results.reduce((a, b) =>
        scoreJapaneseDensity(a.text) > scoreJapaneseDensity(b.text) ? a : b
    );

    // 4. Weighted score fallback
    let bestWeighted = results[0];
    for (const r of results) {
        if (weightedScore(r) > weightedScore(bestWeighted)) {
            bestWeighted = r;
        }
    }
    return bestWeighted.text;
}

function weightedScore(result) {
    const density = Math.max(0, scoreJapaneseDensity(result.text));
    return result.confidence * 0.7 + density * 0.3;
}

function showMultiPassOverlay(results, finalText) {
    // Remove existing overlay if present
    const old = document.getElementById('multipass-overlay');
    if (old) old.remove();

    const div = document.createElement('div');
    div.id = 'multipass-overlay';
    div.style.position = 'fixed';
    div.style.bottom = '10px';
    div.style.right = '10px';
    div.style.maxWidth = '350px';
    div.style.maxHeight = '50vh';
    div.style.overflowY = 'auto';
    div.style.background = 'rgba(0,0,0,0.75)';
    div.style.color = 'white';
    div.style.padding = '10px';
    div.style.borderRadius = '6px';
    div.style.fontSize = '12px';
    div.style.zIndex = '99999';
    div.style.lineHeight = '1.4em';
    div.style.whiteSpace = 'pre-wrap';
    div.style.pointerEvents = 'none';

    const header = document.createElement('div');
    header.style.cursor = 'pointer';
    header.style.fontWeight = 'bold';
    header.style.marginBottom = '6px';
    header.style.pointerEvents = 'auto';
    header.textContent = 'Multi‑Pass Analyst (click to collapse)';

    const body = document.createElement('div');
    body.id = 'multipass-overlay-body';
    body.style.pointerEvents = 'auto';

    const active = getSetting('ocrEngine') || 'tesseract';
    const label = active === 'paddle' ? 'PaddleOCR' : (active === 'manga' ? 'MangaOCR' : 'Tesseract');

    let html = `<div style="font-size:10px; opacity:0.8; margin-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.2); padding-bottom:4px;">Analyzing: ${label}</div>`;

    results.forEach((r, i) => {
        html += `<strong>Pass ${i + 1}</strong><br>`;
        html += `Confidence: ${r.confidence}<br>`;
        html += `Density: ${scoreJapaneseDensity(r.text)}<br>`;
        html += `Weighted: ${weightedScore(r)}<br>`;
        html += `Text: ${r.text}<br><br>`;
    });

    html += `<strong>Final:</strong> ${finalText}`;

    body.innerHTML = html;

    div.appendChild(header);
    div.appendChild(body);

    let collapsed = multiPassOverlayCollapsed;

    if (collapsed) {
        header.textContent = 'Multi‑Pass Analyst (click to expand)';
        body.style.display = 'none';
        div.style.maxHeight = '30px';
    } else {
        header.textContent = 'Multi‑Pass Analyst (click to collapse)';
        body.style.display = 'block';
        div.style.maxHeight = '50vh';
    }

    header.addEventListener('click', () => {
        collapsed = !collapsed;
        multiPassOverlayCollapsed = collapsed;

        if (collapsed) {
            header.textContent = 'Multi‑Pass Analyst (click to expand)';
            body.style.display = 'none';
            div.style.maxHeight = '30px';
        } else {
            header.textContent = 'Multi‑Pass Analyst (click to collapse)';
            body.style.display = 'block';
            div.style.maxHeight = '50vh';
        }
    });

    document.body.appendChild(div);
}

function removeMultiPassOverlay() {
    const old = document.getElementById('multipass-overlay');
    if (old) old.remove();
}

function findBestMultiPassIndex(results) {
    let best = 0;
    let bestScore = -Infinity;
    results.forEach((r, i) => {
        const score = weightedScore(r);
        if (score > bestScore) {
            bestScore = score;
            best = i;
        }
    });
    return best;
}

// Pipelines




function addOCRResultToUI(text, confidence = null) {
    const confStr = (confidence !== null) ? ` [${Math.round(confidence)}%]` : '';
    const clean = text.replace(/\s+/g, '').trim(); if (!clean) return;
    if (latestText) latestText.textContent = clean + confStr;

    const item = document.createElement('p');
    item.className = 'history-item';
    item.setAttribute('lang', 'ja');

    const span = document.createElement('span');
    span.textContent = clean + confStr;
    item.appendChild(span);

    const btnRow = document.createElement('div');
    btnRow.className = 'item-btns';

    const speakBtn = document.createElement('button');
    speakBtn.setAttribute('data-action', 'speak');
    speakBtn.textContent = '🔊';
    speakBtn.ariaLabel = "Speak line";

    const copyBtn = document.createElement('button');
    copyBtn.setAttribute('data-action', 'copy');
    copyBtn.textContent = '📋';
    copyBtn.ariaLabel = "Copy line";

    btnRow.append(speakBtn, copyBtn);
    item.appendChild(btnRow);

    if (historyContent) {
        historyContent.prepend(item);
        while (historyContent.children.length > 100) historyContent.removeChild(historyContent.lastChild);

        const items = Array.from(historyContent.querySelectorAll('span')).map(s => s.textContent);
        localStorage.setItem('vn-ocr-public-history-v2', JSON.stringify(items));
    }
}

function openUserGuide() {
    const helpModal = document.getElementById('help-modal');
    if (helpModal) {
        helpModal.classList.add('active');
    }
}

function initHelpModal() {
    const helpBtn = document.getElementById('help-btn'),
        helpModal = document.getElementById('help-modal'),
        helpClose = document.getElementById('help-close');

    if (!helpBtn || !helpModal) return;

    helpBtn.onclick = (e) => {
        e.stopPropagation();
        openUserGuide();
    };

    if (helpClose) helpClose.onclick = () => helpModal.classList.remove('active');
    window.addEventListener('click', (e) => { if (e.target === helpModal) helpModal.classList.remove('active'); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') helpModal.classList.remove('active'); });
}

// ==========================================
// 6. Settings & PaddleOCR Implementation
// ==========================================

// 6. Settings Implementation
// (Legacy engine loading functions removed in favor of modular switcher)

// 6.1 Initialization
function initSettings() {
    loadSettings();
    applySettingsToUI(); // Initial sync for Theme/Visuals

    // Gold v3.1 Hardened Persistence: Real-time wiring for sliders and checkboxes
    if (upscaleSlider) {
        upscaleSlider.oninput = () => {
            const val = parseFloat(upscaleSlider.value);
            setSetting('upscaleFactor', val);
            if (upscaleVal) upscaleVal.textContent = val.toFixed(1);
        };
    }

    const heavyWarningCheckbox = document.getElementById('banner-nocall-checkbox');
    if (heavyWarningCheckbox) {
        heavyWarningCheckbox.onchange = () => {
            setSetting('showHeavyWarning', !heavyWarningCheckbox.checked);
        };
    }

    const engine = getSetting('ocrEngine') || 'tesseract';
    const paddleLines = getSetting('paddleLineCount') || 3;
    const showWarning = getSetting('showHeavyWarning');

    // Startup Banner Logic
    if (engine === 'paddle' && showWarning) {
        document.getElementById('startup-banner')?.classList.add('active');
    }

    // Sync Engine Selector UI
    // The Fix: Explicitly handle corrupted/empty strings by falling back to 'tesseract'
    let uiEngine = engine;
    if (!uiEngine) {
        if (getSetting('debug')) console.debug("[INIT] ocrEngine setting is empty. Defaulting UI to tesseract.");
        uiEngine = 'tesseract';
    }

    if (uiEngine === 'tesseract') {
        engineSelector.value = 'tesseract';
    } else if (uiEngine === 'manga') {
        engineSelector.value = 'manga';
    } else {
        // Assume paddle variant or fallback
        engineSelector.value = uiEngine.startsWith('paddle_') ? uiEngine : `paddle_${paddleLines}`;
    }

    // Update guides if present (handled via drawSelectionRect indirectly)
    if (selectionRect) drawSelectionRect();
}

function initEventListeners_Part1() {
    engineSelector.addEventListener('change', async () => {
        removeMultiPassOverlay();
        setOCRStatus('ready', '');
        const rawValue = engineSelector.value;

        let baseMode = rawValue;
        let lineCount = null;

        // 1. Detect Paddle variants and parse line count
        if (rawValue.startsWith('paddle_')) {
            baseMode = 'paddle';
            const parts = rawValue.split('_');
            const parsed = parseInt(parts[1], 10);
            if (!Number.isNaN(parsed)) {
                lineCount = parsed;
            }
        }

        // 2. Persist line count immediately for Paddle variants
        if (baseMode === 'paddle' && lineCount !== null) {
            setSetting('paddleLineCount', lineCount);
        }

        // 3. Intercept PaddleOCR if warnings are enabled
        if (baseMode === 'paddle' && getSetting('showHeavyWarning')) {
            const currentEngine = getSetting('ocrEngine');
            const currentLines = getSetting('paddleLineCount');
            engineSelector.value = (currentEngine === 'tesseract')
                ? 'tesseract'
                : (currentEngine === 'paddle' ? `paddle_${currentLines}` : currentEngine);

            document.getElementById('paddle-modal')?.classList.add('active');
            if (selectionRect) window.drawSelectionRect();
            return;
        }

        // 3.5 Intercept MangaOCR if warnings are enabled
        if (baseMode === 'manga' && getSetting('showMangaWarning') !== false) {
            const currentEngine = getSetting('ocrEngine');
            const currentLines = getSetting('paddleLineCount');
            engineSelector.value = (currentEngine === 'tesseract')
                ? 'tesseract'
                : (currentEngine === 'paddle' ? `paddle_${currentLines}` : currentEngine);

            document.getElementById('manga-modal').classList.add('active');
            if (selectionRect) window.drawSelectionRect();
            return;
        }

        // 4. Persist engine mode
        setSetting('ocrEngine', baseMode);

        // 5. Switch engine using base mode only
        await switchEngineModular(rawValue);

        if (selectionRect) window.drawSelectionRect();
    });
}


function initEventListeners_Part2() {
    // 6.3 Modal Event Listeners
    document.getElementById('paddle-continue')?.addEventListener('click', async () => {
        const checkbox = document.getElementById('heavy-warning-checkbox');
        if (checkbox?.checked) {
            setSetting('showHeavyWarning', false);
        }

        const count = getSetting('paddleLineCount') || 3;
        engineSelector.value = `paddle_${count}`;

        // THE FIX: Persist the engine setting immediately so it isn't lost on the next UI sync
        setSetting('ocrEngine', 'paddle');

        // Dismiss modal immediately for better UX feedback
        document.getElementById('paddle-modal').classList.remove('active');
        if (selectionRect) window.drawSelectionRect();

        await switchEngineModular(`paddle_${count}`);
    });

    document.getElementById('paddle-cancel')?.addEventListener('click', () => {
        // Rely on currentEngine logic to fallback
        const currentEngine = getSetting('ocrEngine');
        const currentLines = getSetting('paddleLineCount');
        engineSelector.value = (currentEngine === 'tesseract') ? 'tesseract' : (currentEngine === 'paddle' ? `paddle_${currentLines}` : currentEngine);

        document.getElementById('paddle-modal').classList.remove('active');
        if (selectionRect) window.drawSelectionRect();
    });

    // 6.3.5 Manga Modal Event Listeners
    document.getElementById('manga-continue')?.addEventListener('click', async () => {
        const checkbox = document.getElementById('manga-warning-checkbox');
        if (checkbox?.checked) {
            setSetting('showMangaWarning', false);
        }

        engineSelector.value = 'manga';
        setSetting('ocrEngine', 'manga');

        // Dismiss modal immediately for better UX feedback
        document.getElementById('manga-modal').classList.remove('active');
        if (selectionRect) window.drawSelectionRect();

        await switchEngineModular('manga');
    });

    document.getElementById('manga-cancel')?.addEventListener('click', () => {
        const currentEngine = getSetting('ocrEngine');
        const currentLines = getSetting('paddleLineCount');
        engineSelector.value = (currentEngine === 'tesseract') ? 'tesseract' : (currentEngine === 'paddle' ? `paddle_${currentLines}` : currentEngine);

        document.getElementById('manga-modal').classList.remove('active');
        if (selectionRect) window.drawSelectionRect();
    });

    // 6.4 Banner Event Listeners
    document.getElementById('banner-switch-default')?.addEventListener('click', async () => {
        // 1. Set the Tesseract sub-mode in settings
        setSetting('ocrMode', 'default_mini');

        // 2. Synchronize the UI selectors immediately
        if (engineSelector) engineSelector.value = 'tesseract';
        if (modeSelector) {
            modeSelector.disabled = false;
            modeSelector.value = 'default_mini';
        }

        // 3. Trigger the actual engine switch to unload Paddle and load Tesseract
        // Close banner immediately for better UX feedback
        document.getElementById('startup-banner')?.classList.remove('active');
        if (selectionRect) window.drawSelectionRect();

        await switchEngineModular('tesseract');
    });

    document.getElementById('banner-nocall-checkbox')?.addEventListener('change', (e) => {
        setSetting('showHeavyWarning', !e.target.checked);
    });

    document.getElementById('banner-close')?.addEventListener('click', () => {
        document.getElementById('startup-banner')?.classList.remove('active');
    });

    // 6.5 Universal Collapsible Warning Handler
    document.addEventListener('click', (e) => {
        const collapsible = e.target.closest('.warning-collapsible');
        if (collapsible) {
            collapsible.classList.toggle('expanded');
        }
    });
}

// 6.5 Global Initialization
/**
 * Dismisses the startup splash screen with a smooth fade-out.
 */
function dismissSplashScreen() {
    const splash = document.getElementById('startup-splash');
    if (!splash || splash.dataset.dismissed) return;

    // Clear splash hint interval to prevent orphaned timers
    if (splashHintInterval) {
        clearInterval(splashHintInterval);
        splashHintInterval = null;
    }

    // Set persistence flag immediately to prevent double-dismiss or fail-safe triggers
    splash.dataset.dismissed = "1";

    // Smooth transition
    splash.classList.add('fade-out');

    // Unlock interaction
    document.body.classList.remove('loading-locked');

    // Cleanup from DOM after transition
    setTimeout(() => {
        splash.remove();
    }, 500);
}

/**
 * Observational Performance Dashboard (Gold v3.8 Restoration)
 * Updates UI markers for Hardware Acceleration/Isolation without triggering reloads.
 */
async function updatePerformanceStatus() {
    if (!perfIcon || !perfInfo) return;
    
    try {
        const isIsolated = window.crossOriginIsolated;
        const hasWebGPU = await vnIsWebGPUSupported();
        
        let icon = '⚪';
        let label = 'Standard Mode (Single-Threaded)';
        let details = `Isolation: ${isIsolated ? 'Active' : 'Disabled'} | WebGPU: ${hasWebGPU ? 'Supported' : 'Not Detected'}`;

        if (isIsolated) {
            icon = '🟡';
            label = 'Isolated Mode (High-Performance Threads)';
            if (hasWebGPU) {
                icon = '🟢';
                label = 'Neural Acceleration Active (WebGPU)';
            }
        }

        perfIcon.textContent = icon;
        perfIcon.title = label;
        perfInfo.textContent = details;

        if (window.VNOCR_DEBUG) {
            console.debug(`[PERF-SYNC] Icon: ${icon} | ${label}`);
        }
    } catch (err) {
        console.warn("[PERF-SYNC-ERROR] Failed to update diagnostics:", err);
    }
}

async function globalInitialize() {
    if (window.VNOCR_DEBUG) console.log("[INIT] Gold v3.8 Compliance Startup...");

    // 1. DOM Materialization (Race-safe Registration)
    selectWindowBtn = document.getElementById('select-window-btn');
    vnVideo = document.getElementById('vn-video');
    selectionOverlay = document.getElementById('selection-overlay');
    historyContent = document.getElementById('history-content');
    ttsVoiceSelect = document.getElementById('tts-voice-select');
    speakLatestBtn = document.getElementById('speak-latest-btn');
    latestText = document.getElementById('latest-text');
    ocrStatus = document.getElementById('ocr-status');
    refreshOcrBtn = document.getElementById('refresh-ocr-btn');
    clearHistoryBtn = document.getElementById('clear-history-btn');
    engineSelector = document.getElementById('model-selector');
    modeSelector = document.getElementById('mode-selector');
    autoToggle = document.getElementById('auto-capture-toggle');
    autoCaptureBtn = document.getElementById('auto-capture-btn');
    upscaleSlider = document.getElementById('upscale-slider');
    upscaleVal = document.getElementById('upscale-val');
    perfIcon = document.getElementById('perf-icon');
    perfInfo = document.getElementById('perf-info');

    // Sidebar Node Materialization
    menuBtn = document.getElementById('menu-btn');
    sideMenu = document.getElementById('side-menu');
    menuBackdrop = document.getElementById('menu-backdrop');
    menuInstall = document.getElementById('menu-install');
    menuGuide = document.getElementById('menu-guide');
    menuContact = document.getElementById('menu-contact');
    menuPurge = document.getElementById('menu-purge');
    menuReset = document.getElementById('menu-reset');

    // 3. UI Integrity Setup
    initHelpModal();
    initSettings();
    
    // Start splash hint rotation after DOM is ready
    startSplashHintRotation();
    
    if (typeof updatePerformanceStatus === 'function') {
        updatePerformanceStatus();
    }

    // 4. Silicon Seal Registry Initialization
    // We strictly prioritize Tesseract to ensure the UI is functional within <500ms.
    const savedEngine = getSetting('ocrEngine') || 'tesseract';

    try {
        // Step 1: Force immediate Tesseract readiness (anchors the interactive UI)
        await switchEngineModular('tesseract');
        
        // Step 2: Cosmetic splash dismissal (Branding pass complete)
        setTimeout(() => dismissSplashScreen(), 1000);

        // Step 3: Silent background recovery of saved preference
        // MangaOCR is explicitly excluded from background preloading per security/perf policy.
        if (savedEngine === 'paddle') {
            // We load silently to avoid hijacking the UI before readiness.
            // The switch only happens ONCE the background promise fulfills.
            EngineManager.getOrLoadEngine(savedEngine, true).then(() => {
                if (window.VNOCR_DEBUG) console.log(`[BOOT] Silent upgrade to ${savedEngine} successful.`);
                switchEngineModular(savedEngine); 
            }).catch(err => {
                console.warn(`[BOOT] Silent upgrade to ${savedEngine} failed:`, err);
            });
        }

        // Step 4: Silent background preloads (Always warm up Paddle for zero-wait switching)
        if (!getSetting('skipPreloading') && savedEngine !== 'paddle') {
            EngineManager.getOrLoadEngine('paddle', true);
        }

        applySettingsToUI();

        // Step 5: History Loading (Restore context)
        if (historyContent) {
            const savedV2 = localStorage.getItem('vn-ocr-public-history-v2');
            if (savedV2) {
                let lines;
                try {
                    lines = JSON.parse(savedV2);
                } catch (e) {
                    console.warn("[INIT] Failed to parse history from localStorage:", e);
                    lines = [];
                }
                lines.reverse().forEach(line => {
                    const clean = line.replace(/\s+/g, '').trim();
                    if (!clean) return;
                    const item = document.createElement('p');
                    item.className = 'history-item';
                    item.setAttribute('lang', 'ja');
                    const span = document.createElement('span');
                    span.textContent = clean;
                    item.appendChild(span);
                    const btnRow = document.createElement('div');
                    btnRow.className = 'item-btns';
                    const speakBtn = document.createElement('button');
                    speakBtn.setAttribute('data-action', 'speak');
                    speakBtn.textContent = '🔊';
                    const copyBtn = document.createElement('button');
                    copyBtn.setAttribute('data-action', 'copy');
                    copyBtn.textContent = '📋';
                    btnRow.append(speakBtn, copyBtn);
                    item.appendChild(btnRow);
                    historyContent.prepend(item);
                });
                if (historyContent.children.length > 0) {
                    latestText.textContent = historyContent.querySelector('span')?.textContent || 'Waiting for capture...';
                }
            }
        }

    } catch (err) {
        console.error("[INIT] Neural Engine Stabilization Failed:", err);
        dismissSplashScreen(); // Never lock the UI
    } finally {
        // Logic moved to Step 2 for speed
    }

    // 5. Post-Stabilization Observers
    EngineManager.onReady(() => {
        engineReady = true;
        updateCaptureButtonState();
    });
    EngineManager.onLoading(() => {
        engineReady = false;
        updateCaptureButtonState();
    });
    EngineManager.onStatusChange(({ state, text, progress, engineId }) => {
        setOCRStatus(state, text, progress, engineId);
    });

    engineReady = EngineManager.isReady();
    updateCaptureButtonState();

    // 6. Final Sync & Listeners
    initEventListeners();
    initEventListeners_Part1();
    initEventListeners_Part2();

    // Service Worker Registry
    if ('serviceWorker' in navigator) {
        const disableViaParam = new URLSearchParams(location.search).has('no-sw');
        const disableViaStorage = localStorage.getItem('vn-ocr-disable-sw') === 'true';
        if (disableViaParam || disableViaStorage) {
            navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
        } else {
            navigator.serviceWorker.register('service-worker.js').then(reg => {
                if (!window.crossOriginIsolated && reg.active) {
                    console.log("[SW] Standard mode active. Hardware acceleration will enable on next natural visit via _headers.");
                }
            }).catch(e => console.warn('SW registration failed:', e));
        }
    }
}

/** 6.6 UI Interaction Registry (Hydration Safety) */
function initEventListeners() {
    // 1. Screen Capture Controls
    if (selectWindowBtn) {
        selectWindowBtn.onclick = () => videoStream ? stopCapture() : startCapture();
    }

    // 2. Selection Overlay
    setupSelectionOverlay();

    // 3. Main Toolbar
    if (refreshOcrBtn) {
        refreshOcrBtn.onclick = async () => {
            if (captureLocked || isProcessing) return;
            captureLocked = true;
            updateCaptureButtonState();
            try { await captureFrame(); } finally {
                setTimeout(() => { captureLocked = false; updateCaptureButtonState(); }, 300);
            }
        };
    }

    if (clearHistoryBtn) {
        clearHistoryBtn.onclick = () => {
            if (confirm("Clear all transcription history?")) {
                if (historyContent) historyContent.innerHTML = '';
                setSetting('history', []);
            }
        };
    }

    if (autoCaptureBtn) {
        autoCaptureBtn.onclick = () => autoToggle?.click();
    }

    if (speakLatestBtn) {
        speakLatestBtn.onclick = () => {
            const text = latestText?.textContent;
            if (text && text !== 'Waiting for capture...') {
                speak(text);
            }
        };
    }

    // 4. Secondary Controls (Null-guarded Sync)
    if (autoToggle) {
        autoToggle.onchange = (e) => {
            setSetting('autoCapture', e.target.checked);
            applySettingsToUI();
        };
    }

    if (upscaleSlider) {
        upscaleSlider.oninput = (e) => {
            if (upscaleVal) upscaleVal.textContent = parseFloat(e.target.value).toFixed(1);
        };
        upscaleSlider.onchange = (e) => {
            setSetting('upscaleFactor', parseFloat(e.target.value));
        };
    }

    // 5. Sidebar Menu (Hamburger Logic)
    const openMenu = () => {
        sideMenu?.classList.add('open');
        menuBackdrop?.classList.add('open');
    };
    const closeMenu = () => {
        sideMenu?.classList.remove('open');
        menuBackdrop?.classList.remove('open');
    };

    if (menuBtn) menuBtn.onclick = openMenu;
    if (menuBackdrop) menuBackdrop.onclick = (e) => { e.stopPropagation(); closeMenu(); };

    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

    if (menuInstall) menuInstall.onclick = () => {
        document.getElementById('install-btn')?.click();
        closeMenu();
    };

    if (menuGuide) menuGuide.onclick = () => {
        openUserGuide();
        closeMenu();
    };

    if (menuContact) menuContact.onclick = () => {
        window.open('https://github.com/RoboZilina/personalOCR/issues/new', '_blank', 'noopener,noreferrer');
        closeMenu();
    };

    if (menuPurge) menuPurge.onclick = async () => {
        if (confirm("Unload all OCR engines from memory? This is recommended for mobile devices or if performance slows down.")) {
            await EngineManager.disposeAllEngines();
            closeMenu();
        }
    };

    if (menuReset) menuReset.onclick = () => {
        if (confirm("Reset all UI settings to defaults?")) {
            resetSettings();
            closeMenu();
        }
    };

    // 6. Sub-Menu Quick Settings
    const subItemBtns = document.querySelectorAll('.menu-subitem-btn');
    subItemBtns?.forEach(btn => {
        btn.onclick = (e) => {
            const setting = btn.dataset.setting;
            let val = btn.dataset.value;
            if (setting && val) {
                if (val === "true") val = true;
                if (val === "false") val = false;
                setSetting(setting, val);
                if (setting === 'autoCapture') {
                    const at = document.getElementById('auto-capture-toggle');
                    if (at && at.checked !== val) at.click();
                }
                applySettingsToUI();
                closeMenu();
            }
        };
    });
}

/** Public API Namespace (Auditability Phase) */
window.VNOCR = {
    version: '3.8.0-GOLD-CERTIFIED',
    isReady: EngineManager.isReady,
    drawSelectionRect: window.drawSelectionRect,
    captureFrame: window.captureFrame,
    switchEngine: window.switchEngine
};

// Gold v3.1 Hardening: Absolute Hydration Safety
document.addEventListener('DOMContentLoaded', globalInitialize);






