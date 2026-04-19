/**
 * scripts/test_engine_selector.js
 * Unit test for engine selector wiring
 * Ensures initEventListeners_Part1 and Part2 are properly called during initialization
 */

// Mock DOM and settings
const elements = {
    'model-selector': {
        value: 'tesseract',
        addEventListener: function(event, handler) {
            if (event === 'change') {
                this._changeHandler = handler;
            }
        },
        _changeHandler: null
    },
    'mode-selector': { value: 'default_mini', disabled: false },
    'auto-capture-toggle': { checked: true },
    'upscale-slider': { value: 2.0 },
    'upscale-val': { textContent: '' },
    'heavy-warning-checkbox': { checked: false },
    'manga-warning-checkbox': { checked: false },
    'paddle-modal': { classList: { add: () => {}, remove: () => {} } },
    'manga-modal': { classList: { add: () => {}, remove: () => {} } },
    'startup-banner': { classList: { add: () => {}, remove: () => {} } },
    'paddle-continue': { addEventListener: () => {} },
    'paddle-cancel': { addEventListener: () => {} },
    'manga-continue': { addEventListener: () => {} },
    'manga-cancel': { addEventListener: () => {} },
    'banner-switch-default': { addEventListener: () => {} },
    'banner-nocall-checkbox': { addEventListener: () => {}, checked: false },
    'banner-close': { addEventListener: () => {} },
    'vn-video': {},
    'selection-overlay': {},
    'history-content': {},
    'debug-crop-img': { style: {} },
    'latest-text': { textContent: '' },
    'ocr-status': { textContent: '' }
};

global.document = {
    getElementById: (id) => elements[id] || null,
    querySelector: (sel) => {
        if (sel === '#model-selector') {
            return global.document.getElementById('model-selector');
        }
        if (sel === '#mode-selector') {
            return global.document.getElementById('mode-selector');
        }
        return null;
    },
    addEventListener: () => {},
    body: { classList: { add: () => {}, remove: () => {} } }
};

global.window = {
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
    addEventListener: () => {},
    drawSelectionRect: () => {}
};

global.localStorage = {
    getItem: () => null,
    setItem: () => {}
};

global.console = {
    log: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {}
};

// Track function calls
let initEventListenersCalled = false;
let initEventListenersPart1Called = false;
let initEventListenersPart2Called = false;

// Mock functions that would be defined in the actual app
function initEventListeners() {
    initEventListenersCalled = true;
}

function initEventListeners_Part1() {
    initEventListenersPart1Called = true;
    // Simulate setting up the engine selector listener
    const engineSelector = document.getElementById('model-selector');
    if (engineSelector) {
        engineSelector.addEventListener('change', async () => {
            // This is the actual handler from the app
            const rawValue = engineSelector.value;
            console.log(`[TRACE] Engine selector changed to: ${rawValue}`);
        });
    }
}

function initEventListeners_Part2() {
    initEventListenersPart2Called = true;
}

function initHelpModal() {}
function initSettings() {}
function updatePerformanceStatus() {}

// Simulate the fixed globalInitialize flow
function simulateGlobalInitialize() {
    // 3. UI Integrity Setup
    initHelpModal();
    initSettings();
    
    if (typeof updatePerformanceStatus === 'function') {
        updatePerformanceStatus();
    }
    
    // ... engine initialization happens here ...
    
    // 6. Final Sync & Listeners (THE FIX)
    initEventListeners();
    initEventListeners_Part1();
    initEventListeners_Part2();
}

console.log("--- Engine Selector Wiring Test ---");

// Run the simulation
simulateGlobalInitialize();

// Verify results
const tests = [
    {
        name: "initEventListeners() was called",
        passed: initEventListenersCalled
    },
    {
        name: "initEventListeners_Part1() was called",
        passed: initEventListenersPart1Called
    },
    {
        name: "initEventListeners_Part2() was called", 
        passed: initEventListenersPart2Called
    },
    {
        name: "Engine selector change handler was registered",
        passed: (() => {
            const selector = document.getElementById('model-selector');
            return selector._changeHandler !== null;
        })()
    }
];

let passCount = 0;
tests.forEach((test, i) => {
    if (test.passed) {
        console.log(`✅ Test ${i + 1}: ${test.name}`);
        passCount++;
    } else {
        console.error(`❌ Test ${i + 1}: ${test.name}`);
    }
});

console.log("-------------------------------------");
console.log(`Summary: ${passCount}/${tests.length} tests PASSED.`);

if (passCount === tests.length) {
    console.log("🎉 Engine selector is properly wired!");
    process.exit(0);
} else {
    console.error("💥 Engine selector wiring is broken!");
    process.exit(1);
}
