/**
 * js/ui/ui_controller.js
 * UI Controller - Capture button state and status management functions.
 * Gold v3.8 Compliance
 */

import { STATUS } from '../core/status.js?v=3.8.4';
import { getSetting } from '../../settings.js';

// ==========================================
// Progress Pill v2: Unified State Machine (Gold v3.8)
// ==========================================
let statusSettleTimer = null;
let statusTransitionLock = false;

/**
 * Updates the capture button state based on engine readiness and processing status.
 * Depends on window.engineReady, window.captureLocked, window.isProcessing, window.refreshOcrBtn
 */
function updateCaptureButtonState() {
    if (!window.refreshOcrBtn) return;
    // Heartbed Sync: Factor in engine readiness, button lock, AND active processing
    const shouldBeDisabled = !window.engineReady || window.captureLocked || window.isProcessing;
    window.refreshOcrBtn.disabled = shouldBeDisabled;
    window.refreshOcrBtn.classList.toggle('disabled', shouldBeDisabled);
}

/**
 * High-fidelity status management for the Progress Pill v2.
 * @param {string} state - The status category (ready, processing, loading, etc.)
 * @param {string} text - The display string.
 * @param {number|null} progress - 0.0 to 1.0 or null.
 * @param {string|null} sourceId - The engine ID that sent this update.
 */
function setOCRStatus(state, text, progress = null, sourceId = null) {
    // 1. Internal EngineManager Sync
    if (window.EngineManager && typeof window.EngineManager._notifyStatus === 'function') {
        window.EngineManager._notifyStatus(state, text, progress);
    }

    const ocrStatus = document.getElementById('ocr-status');
    const statusLabel = document.getElementById('status-text');
    if (!ocrStatus || !statusLabel) return;

    // 2. Silent Preload Guard
    // If update is from an engine that isn't the current target, discard unless it's an error or READY.
    // Allow READY from background engines so UI can reflect successful preloads.
    // Only filter if sourceId is explicitly provided (defined) and different from activeId.
    // Guard against uninitialized EngineManager or null getInfo() during early init.
    const activeInfo = (typeof window.EngineManager !== 'undefined' && window.EngineManager.getInfo) ? window.EngineManager.getInfo() : {};
    const activeId = activeInfo?.id || null;
    
    // Filter only LOADING/PROCESSING/DOWNLOADING from non-active engines
    // Allow ERROR (always show errors) and READY (show successful preloads)
    const isNoisyProgressState = [STATUS.LOADING, STATUS.DOWNLOADING, STATUS.WARMING, STATUS.PROCESSING].includes(state);
    if (typeof sourceId === 'string' && sourceId !== activeId && isNoisyProgressState) {
        if (getSetting('debug')) console.debug(`[STATUS-DEBUG] Filtering silent preload progress from ${sourceId} (active: ${activeId}, state: ${state})`);
        return;
    }

    // 3. Settle Logic: Prevent rapid-fire READY flickers
    if (state === STATUS.READY) {
        if (statusSettleTimer) return; // Wait for the existing timer
        statusSettleTimer = setTimeout(() => {
            applyStatusStage(STATUS.READY, text || window.EngineManager.getReadyStatus(), null);
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
        const cssClass = String(s).toLowerCase();
        ocrStatus.className = `status-pill ${cssClass}`;

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
    }
}

export { updateCaptureButtonState, setOCRStatus };
