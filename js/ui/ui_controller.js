/**
 * js/ui/ui_controller.js
 * UI Controller - Capture button state and status management functions.
 * Gold v3.8 Compliance
 */

import { STATUS } from '../core/status.js?v=3.8.6';
import { getSetting } from '../../settings.js';

// ==========================================
// Progress Pill v2: Unified State Machine (Gold v3.8)
// ==========================================
let statusSettleTimer = null;
// Clean up timer on page unload to prevent memory leaks
window.addEventListener('beforeunload', () => {
    if (statusSettleTimer) clearTimeout(statusSettleTimer);
});

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
    // Only forward UI-originated status updates (no explicit sourceId).
    // Engine-originated updates already come through EngineManager.onStatusChange;
    // rebroadcasting them here causes status loops and can relabel source engines.
    if (sourceId == null && window.EngineManager && typeof window.EngineManager._notifyStatus === 'function') {
        window.EngineManager._notifyStatus(state, text, progress);
    }

    const ocrStatus = document.getElementById('ocr-status');
    const statusLabel = document.getElementById('status-text');
    if (!ocrStatus || !statusLabel) return;

    // 2. Active Engine Guard
    // Status pill must represent the active engine only.
    // Ignore all explicitly sourced non-active engine updates (including READY)
    // so background preload events never overwrite active-engine status.
    // Guard against uninitialized EngineManager or null getInfo() during early init.
    const engineManager = window.EngineManager;
    let activeId = null;
    if (typeof engineManager !== 'undefined') {
        if (typeof engineManager.getCurrentEngineId === 'function') {
            activeId = engineManager.getCurrentEngineId();
        }
        if (!activeId && typeof engineManager.getInfo === 'function') {
            const activeInfo = engineManager.getInfo();
            activeId = activeInfo?.id || null;
        }
    }

    if (typeof sourceId === 'string' && activeId && sourceId !== activeId) {
        if (window.VNOCR_DEBUG || getSetting('debug')) {
            console.debug(`[STATUS-DEBUG] Dropped non-active status from ${sourceId} (active: ${activeId}, state: ${state})`);
        }
        return;
    }

    // 3. Settle Logic: Prevent rapid-fire READY flickers
    if (state === STATUS.READY) {
        if (statusSettleTimer) {
            clearTimeout(statusSettleTimer); // Cancel pending timer
        }
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
            if (s === STATUS.PROCESSING) {
                // Immediate update for processing status to ensure visibility
                statusLabel.textContent = t;
            } else {
                statusLabel.classList.add('fading');
                setTimeout(() => {
                    statusLabel.textContent = t;
                    statusLabel.classList.remove('fading');
                }, 100); // Wait for fade-out, update, then fade-in via CSS
            }
        }
    }
}

export { updateCaptureButtonState, setOCRStatus };
