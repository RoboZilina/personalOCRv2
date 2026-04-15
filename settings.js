/**
 * settings.js
 * Modular settings system for VN OCR.
 */

const STORAGE_KEY = "vnocr_settings";

const defaultSettings = {
    ocrEngine: "tesseract",       // "tesseract", "paddle", etc.
    ocrMode: "default_mini",      // "default_mini", "adaptive", "paddle", etc.
    autoCapture: true,
    autoCopy: true,
    showHeavyWarning: true,
    showMangaWarning: true,
    theme: "auto",                // "auto", "dark", "light"
    historyVisible: true,
    previewVisible: false,
    debug: false,                 // Developer flag: enables hidden diagnostics in console/thumbnail
    paddleLineCount: 3,
    textAreaSize: "standard",      // "small", "standard", "large"
    textSize: "standard",          // "small", "standard", "large"
    upscaleFactor: 2.0
};

let currentSettings = { ...defaultSettings };

// Listen for system theme changes and re-apply if in "auto" mode
if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
        if (currentSettings.theme === 'auto') {
            applySettingsToUI();
        }
    });
}

/**
 * Loads settings from localStorage with fallback to defaults.
 */
export function loadSettings() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            // Merge defaults with parsed to handle missing keys in old versions
            currentSettings = { ...defaultSettings, ...parsed };
        } else {
            currentSettings = { ...defaultSettings };
        }
    } catch (e) {
        console.error("Failed to load settings:", e);
        currentSettings = { ...defaultSettings };
    }
    return currentSettings;
}

/**
 * Persists settings to localStorage.
 */
export function saveSettings(settings) {
    try {
        currentSettings = { ...settings };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
    } catch (e) {
        console.error("Failed to save settings:", e);
    }
}

/**
 * Returns a setting value by key.
 */
export function getSetting(key) {
    if (!(key in defaultSettings)) {
        console.warn(`Attempted to get unknown setting: ${key}`);
    }
    return currentSettings[key];
}

/**
 * Updates a setting value, saves, and returns the new state.
 */
export function setSetting(key, value) {
    if (!(key in defaultSettings)) {
        console.warn(`Attempted to set unknown setting: ${key}`);
    }
    currentSettings[key] = value;
    saveSettings(currentSettings);
    return currentSettings;
}

/**
 * Normalizes a boolean setting value, handling defaults and string-coercion from localStorage.
 */
function normalizeBoolean(val, defaultValue) {
    if (val === undefined || val === null) return defaultValue;
    if (val === "") return defaultValue;
    return String(val) !== 'false' && !!val;
}

/**
 * Updates UI elements to reflect current settings.
 */
export function applySettingsToUI() {
    // 1. OCR Mode / Image Process Selector
    const modeSelector = document.querySelector("#mode-selector");
    if (modeSelector) {
        // Safe Fallback: Prevent empty strings (from corrupted state) from clearing the dropdown
        modeSelector.value = currentSettings.ocrMode || 'default_mini';
    }

    // 2. Auto-Capture Toggle
    const autoToggle = document.querySelector("#auto-capture-toggle");
    if (autoToggle) {
        autoToggle.checked = normalizeBoolean(currentSettings.autoCapture, defaultSettings.autoCapture);
        // Trigger the visual update in UI if there's a label
        const event = new Event('change');
        autoToggle.dispatchEvent(event);
    }

    // 3. Theme Toggle
    let effectiveTheme = currentSettings.theme;
    if (effectiveTheme === 'auto') {
        effectiveTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }

    if (effectiveTheme === 'light') {
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
    }

    // 4. History Visibility
    const root = document.querySelector(".dashboard-root");
    if (root) {
        const isVisible = normalizeBoolean(currentSettings.historyVisible, defaultSettings.historyVisible);
        root.classList.toggle('history-hidden', !isVisible);
    }

    // 4.5 Capture Preview Visibility
    const previewVisible = normalizeBoolean(currentSettings.previewVisible, defaultSettings.previewVisible);
    document.body.classList.toggle('preview-hidden', !previewVisible);

    // Note: showHeavyWarning is used for logic, specifically the startup banner
    const warningCheckbox = document.querySelector("#banner-nocall-checkbox");
    if (warningCheckbox) {
        warningCheckbox.checked = !normalizeBoolean(currentSettings.showHeavyWarning, defaultSettings.showHeavyWarning);
    }

    // 5. Size modifiers via body classes
    const currentTextAreaSize = currentSettings.textAreaSize || 'standard';
    document.body.classList.remove('text-area-small', 'text-area-standard', 'text-area-large');
    document.body.classList.add(`text-area-${currentTextAreaSize}`);

    const currentTextSize = currentSettings.textSize || 'standard';
    document.body.classList.remove('text-size-small', 'text-size-standard', 'text-size-large');
    document.body.classList.add(`text-size-${currentTextSize}`);

    // 6. Upscale Slider
    const upscaleSlider = document.querySelector("#upscale-slider");
    const upscaleVal = document.querySelector("#upscale-val");
    if (upscaleSlider) upscaleSlider.value = currentSettings.upscaleFactor;
    if (upscaleVal) upscaleVal.textContent = parseFloat(currentSettings.upscaleFactor).toFixed(1);

    // Update active highlight on menu buttons
    document.querySelectorAll('.menu-subitem-btn[data-setting]').forEach(btn => {
        const settingKey = btn.dataset.setting;
        const val = btn.dataset.value;
        const currentRaw = currentSettings[settingKey];
        const defaultValue = defaultSettings[settingKey];
        
        // Use normalization for boolean settings, direct string match for others
        const effectiveVal = (typeof defaultValue === 'boolean') 
            ? normalizeBoolean(currentRaw, defaultValue)
            : (currentRaw !== undefined ? currentRaw : defaultValue);

        btn.classList.toggle('active', String(effectiveVal) === val);
    });
}

/**
 * Reads UI state and updates settings.
 */
export function applyUIToSettings() {
    const modeSelector = document.querySelector("#mode-selector");
    if (modeSelector) currentSettings.ocrMode = modeSelector.value;

    const autoToggle = document.querySelector("#auto-capture-toggle");
    if (autoToggle) currentSettings.autoCapture = autoToggle.checked;

    const warningCheckbox = document.querySelector("#heavy-warning-checkbox");
    if (warningCheckbox) currentSettings.showHeavyWarning = !warningCheckbox.checked;

    // Theme and history visibility are usually toggled via buttons, 
    // so they are handled directly via setSetting in their click handlers,
    // but we save the whole state here just in case.
    saveSettings(currentSettings);
}

/**
 * Resets all settings to defaults, preserving current OCR Engine/Mode.
 */
export function resetSettings() {
    const savedEngine = currentSettings.ocrEngine;
    const savedMode = currentSettings.ocrMode;

    currentSettings = { 
        ...defaultSettings, 
        ocrEngine: savedEngine,
        ocrMode: savedMode
    };

    saveSettings(currentSettings);
    applySettingsToUI();
}
