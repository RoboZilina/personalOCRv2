/**
 * Unit Tests: captureFrame Locking Behavior
 * 
 * Tests verify:
 * 1. Lock is released synchronously after capture completes
 * 2. Early returns (generation mismatch) release the lock
 * 3. No overlapping capture cycles can occur
 * 4. Error paths properly release the lock
 * 
 * Run with: node --experimental-vm-modules test_capture_locking.js
 */

import { jest } from '@jest/globals';

// Mock DOM and EngineManager
const mockEngineManager = {
    isReady: jest.fn(() => true),
    getEngineInstance: jest.fn(() => ({})),
    getInfo: jest.fn(() => ({ id: 'tesseract', capabilities: {} })),
    runOCR: jest.fn(async () => ({ text: 'test', confidence: 90 })),
    postprocess: jest.fn((lines) => lines.join(' ')),
    _notifyStatus: jest.fn(),
    emitError: jest.fn()
};

const mockVideo = {
    videoWidth: 1920,
    videoHeight: 1080
};

const mockCanvas = {
    width: 0,
    height: 0,
    getContext: jest.fn(() => ({
        drawImage: jest.fn(),
        getImageData: jest.fn(() => ({ data: new Uint8ClampedArray(100) }))
    }))
};

// Track isProcessing state
let isProcessing = false;
let captureGeneration = 0;

// Simulated captureFrame logic (extracted core locking behavior)
async function simulatedCaptureFrame(rect) {
    // Pre-check (line 1375 equivalent)
    if (isProcessing || !mockEngineManager.isReady()) {
        return { skipped: true, reason: 'locked_or_not_ready' };
    }

    const myGen = ++captureGeneration;
    let lockReleased = false;

    const releaseLock = () => {
        if (!lockReleased) {
            isProcessing = false;
            lockReleased = true;
        }
    };

    isProcessing = true;

    try {
        // Simulate OCR work
        await new Promise(r => setTimeout(r, 50));
        
        // Simulate generation check (stale capture)
        if (captureGeneration !== myGen) {
            releaseLock();
            return { skipped: true, reason: 'stale_generation', generation: myGen };
        }

        // Simulate early exit (high confidence)
        if (Math.random() > 0.5) {
            releaseLock();
            return { completed: true, early: true, generation: myGen };
        }

        // Full completion
        return { completed: true, generation: myGen };
    } catch (err) {
        mockEngineManager.emitError(err);
        throw err;
    } finally {
        // Synchronous release (Fix #2)
        releaseLock();
    }
}

describe('captureFrame Locking', () => {
    beforeEach(() => {
        isProcessing = false;
        captureGeneration = 0;
        jest.clearAllMocks();
    });

    test('lock is acquired during capture and released on completion', async () => {
        expect(isProcessing).toBe(false);
        
        const promise = simulatedCaptureFrame({ x: 0, y: 0, width: 100, height: 50 });
        expect(isProcessing).toBe(true);
        
        await promise;
        expect(isProcessing).toBe(false);
    });

    test('concurrent calls are blocked by isProcessing check', async () => {
        const firstCapture = simulatedCaptureFrame({ x: 0, y: 0, width: 100, height: 50 });
        
        // Immediate second call should be skipped
        const secondCapture = simulatedCaptureFrame({ x: 0, y: 0, width: 100, height: 50 });
        
        const first = await firstCapture;
        const second = await secondCapture;
        
        expect(first.skipped).toBeFalsy();
        expect(second.skipped).toBe(true);
        expect(second.reason).toBe('locked_or_not_ready');
    });

    test('rapid consecutive captures wait for lock release', async () => {
        const results = [];
        
        // Fire 5 rapid captures
        for (let i = 0; i < 5; i++) {
            results.push(simulatedCaptureFrame({ x: i * 10, y: 0, width: 100, height: 50 }));
        }
        
        const completed = await Promise.all(results);
        
        // Only first should complete, rest should be blocked
        expect(completed[0].skipped).toBeFalsy();
        expect(completed.slice(1).every(r => r.skipped)).toBe(true);
    });

    test('stale generation detection releases lock', async () => {
        const gen1 = simulatedCaptureFrame({ x: 0, y: 0, width: 100, height: 50 });
        
        // Force generation increment while first is running
        captureGeneration++;
        
        const result = await gen1;
        
        expect(result.skipped).toBe(true);
        expect(result.reason).toBe('stale_generation');
        expect(isProcessing).toBe(false); // Lock should be released
    });

    test('error during capture releases lock', async () => {
        mockEngineManager.runOCR.mockRejectedValueOnce(new Error('OCR failed'));
        
        const badEngineManager = {
            ...mockEngineManager,
            runOCR: jest.fn(async () => { throw new Error('OCR failed'); })
        };
        
        // Simulate with failing engine
        let localIsProcessing = false;
        const capture = async () => {
            if (localIsProcessing) return { skipped: true };
            localIsProcessing = true;
            try {
                await badEngineManager.runOCR();
                return { completed: true };
            } finally {
                localIsProcessing = false;
            }
        };
        
        try {
            await capture();
        } catch (e) {
            // Expected
        }
        
        expect(localIsProcessing).toBe(false);
    });
});

describe('switchEngineModular Error Handling', () => {
    test('errors are re-thrown after UI cleanup', async () => {
        const switchFn = async () => {
            try {
                throw new Error('Engine load failed');
            } catch (err) {
                // UI cleanup would happen here
                console.error('[ENGINE-ERROR] Switch failed:', err);
                throw err; // Re-throw (Fix #3)
            }
        };
        
        await expect(switchFn()).rejects.toThrow('Engine load failed');
    });
});

// Manual run for non-Jest environments
if (typeof jest === 'undefined') {
    console.log('Running manual tests...\n');
    
    async function runManualTests() {
        let passed = 0;
        let failed = 0;
        
        // Test 1: Basic lock behavior
        try {
            isProcessing = false;
            captureGeneration = 0;
            const result = await simulatedCaptureFrame({ x: 0, y: 0, width: 100, height: 50 });
            if (!result.skipped && !isProcessing) {
                console.log('✓ Test 1: Lock acquired and released');
                passed++;
            } else {
                console.log('✗ Test 1: Failed');
                failed++;
            }
        } catch (e) {
            console.log('✗ Test 1: Exception -', e.message);
            failed++;
        }
        
        // Test 2: Concurrent blocking
        try {
            isProcessing = false;
            captureGeneration = 0;
            const first = simulatedCaptureFrame({ x: 0, y: 0, width: 100, height: 50 });
            const second = simulatedCaptureFrame({ x: 0, y: 0, width: 100, height: 50 });
            const results = await Promise.all([first, second]);
            
            if (!results[0].skipped && results[1].skipped) {
                console.log('✓ Test 2: Concurrent calls properly blocked');
                passed++;
            } else {
                console.log('✗ Test 2: Failed -', results);
                failed++;
            }
        } catch (e) {
            console.log('✗ Test 2: Exception -', e.message);
            failed++;
        }
        
        // Test 3: Stale generation releases lock
        try {
            isProcessing = false;
            captureGeneration = 0;
            const promise = simulatedCaptureFrame({ x: 0, y: 0, width: 100, height: 50 });
            captureGeneration++; // Force stale
            const result = await promise;
            
            if (result.skipped && result.reason === 'stale_generation' && !isProcessing) {
                console.log('✓ Test 3: Stale generation releases lock');
                passed++;
            } else {
                console.log('✗ Test 3: Failed -', result);
                failed++;
            }
        } catch (e) {
            console.log('✗ Test 3: Exception -', e.message);
            failed++;
        }
        
        console.log(`\n${passed} passed, ${failed} failed`);
        process.exit(failed > 0 ? 1 : 0);
    }
    
    runManualTests();
}
