import { fetchWithProgress, canvasToFloat32Tensor } from './paddle_core.js';
import { isWebGPUSupported } from '../onnx/onnx_support.js';

export class PaddleOCR {
    constructor(manifestUrl, wasmBasePath, updateStatus) {
        this.id = 'paddle';
        this.label = 'PaddleOCR';
        this.manifestUrl = manifestUrl;
        this.wasmBasePath = wasmBasePath;

        // Support both legacy positional callback and modern options object
        const options = (typeof updateStatus === 'object') ? updateStatus : { reportStatus: updateStatus };
        this.reportStatus = options.reportStatus || (() => {});

        this.manifest = null;
        this.detSession = null;
        this.recSession = null;
        this.dict = [];
        this.normalize = { mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5] };
        this.isLoaded = false;
        this.busy = false; // Hardening v3.4: Concurrency Lock
        this.initPromise = this.load();

        // Hardening Patch v2.5: Pre-allocated buffer for zero-churn recognition
        this.recognitionBuffer = null;
        this.recognitionBufferSize = 48 * 320 * 3;
    }

    /** Interface-compliant initialization */
    async load() {
        return await this.loadModels();
    }

    /**
     * Hybrid Integrity Check (Hardening v2.1.10).
     * Pings local config/dict and remote models for Cloudflare compatibility.
     */
    async checkAssets() {
        const modelBase = "./models/paddle/";
        
        // Load manifest locally first to get remote URLs
        try {
            const res = await fetch(modelBase + 'manifest.json', { method: 'HEAD' });
            const manifestExists = res.ok;

            // Define critical assets based on Cloudflare 25MB splitting
            const assets = [
                { url: modelBase + 'manifest.json', type: 'local' },
                { url: modelBase + 'japan_dict.txt', type: 'local' },
                { url: 'https://pub-77a4ba72da6d4b9e892b6511ae694813.r2.dev/models/paddle/det.onnx', type: 'remote' },
                { url: 'https://pub-77a4ba72da6d4b9e892b6511ae694813.r2.dev/models/paddle/rec.onnx', type: 'remote' }
            ];
            
            const results = await Promise.all(assets.map(a => fetch(a.url, { method: 'HEAD' })));
            const allFound = results.every(res => res.ok);
            
            const diagAssets = document.getElementById('diag-assets');
            if (diagAssets) {
                diagAssets.textContent = allFound ? '✅ FOUND' : '❌ MISSING';
                diagAssets.className = allFound ? 'diag-status-ok' : 'diag-status-fail';
            }
            return allFound;
        } catch (err) {
            console.warn("PaddleOCR: Hybrid check failed:", err);
            return false;
        }
    }

    async loadModels() {
        // Non-blocking integrity ping
        this.checkAssets();

        try {
            this.reportStatus('loading', '🟡 PaddleOCR: loading manifest…');
            const res = await fetch(this.manifestUrl);
            this.manifest = await res.json();

            // Standardize model base path
            const modelBase = "./models/paddle/";

            if (this.manifest.normalize) {
                this.normalize = this.manifest.normalize;
            }

            // Configure ONNX Runtime WASM Fallback
            const isIsolated = self.crossOriginIsolated;
            const threads = isIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
            ort.env.wasm.numThreads = threads; 
            ort.env.wasm.simd = true;
            console.log(`[ENGINE] WASM Configuration — isolated: ${isIsolated}, numThreads: ${threads}`);

            // Enable WebGPU backend for PaddleOCR when available (fallback to WASM).
            const useWebGPU = await isWebGPUSupported();
            const executionProviders = useWebGPU ? ['webgpu', 'wasm'] : ['wasm'];

            // Load detection model (Hybrid: Remote Priority)
            this.reportStatus('loading', '🟡 PaddleOCR: loading detection model…');
            const detPath = this.manifest.det.remote_url || (modelBase + this.manifest.det.path);
            let detBuffer = await fetchWithProgress(
                detPath,
                (p) => this.reportStatus('loading', `🟡 PaddleOCR: Loading ${(p * 50).toFixed(0)}%`)
            );
            this.detSession = await ort.InferenceSession.create(detBuffer, { executionProviders });
            console.log(`[ENGINE] PaddleOCR Detection Session — Active Backend: ${this.detSession.executionProvider || 'unknown'}`);
            detBuffer = null; // Memory Guard: Release buffer immediately after session creation
            await new Promise(resolve => setTimeout(resolve, 50)); // Memory Guard: Yield to allow GC breathing room

            // Load recognition model
            this.reportStatus('loading', '🟡 PaddleOCR: loading recognition model…');
            const recPath = this.manifest.rec.remote_url || (modelBase + this.manifest.rec.path);
            let recBuffer = await fetchWithProgress(
                recPath,
                (p) => this.reportStatus('loading', `🟡 PaddleOCR: Loading ${(50 + p * 50).toFixed(0)}%`)
            );
            this.recSession = await ort.InferenceSession.create(recBuffer, { executionProviders });
            console.log(`[ENGINE] PaddleOCR Recognition Session — Active Backend: ${this.recSession.executionProvider || 'unknown'}`);
            recBuffer = null; // Memory Guard: Release buffer

            // Load dictionary
            this.reportStatus('loading', '🟡 PaddleOCR: loading dictionary…');
            const dictRes = await fetch(modelBase + this.manifest.dict.path);
            const dictText = await dictRes.text();
            this.dict = dictText.split(/\r?\n/);
            if (this.dict.length > 0 && this.dict[this.dict.length - 1] === "") {
                this.dict.pop();
            }

            // Warm-up WebGPU Shaders (if active)
            await this.warmUp();

            this.isLoaded = true;
            this.reportStatus('ready', '🟢 PaddleOCR: ready.');
        } catch (err) {
            console.error("PaddleOCR: Load Error:", err);
            this.reportStatus('error', '🔴 PaddleOCR: Load Failed.');
            throw err;
        }
    }

    /**
     * WebGPU Shader Pre-warming (Zero-Inference Pass)
     * Forces the browser to compile shaders during load rather than during first run.
     */
    async warmUp() {
        if (!this.detSession || !this.recSession) return;
        
        try {
            // Micro-yield to ensure UI responsiveness
            await new Promise(r => setTimeout(r, 0));

            // Warm up Detection Model (960x960)
            const detShape = [1, 3, 960, 960];
            const detDummy = new ort.Tensor('float32', new Float32Array(1 * 3 * 960 * 960), detShape);
            const detFeeds = {};
            detFeeds[this.detSession.inputNames[0]] = detDummy;
            await this.detSession.run(detFeeds);

            // Warm up Recognition Model (48x320)
            const recShape = [1, 3, 48, 320];
            const recDummy = new ort.Tensor('float32', new Float32Array(1 * 3 * 48 * 320), recShape);
            const recFeeds = {};
            recFeeds[this.recSession.inputNames[0]] = recDummy;
            await this.recSession.run(recFeeds);

            console.log('[ENGINE] PaddleOCR warm-up complete');
        } catch (err) {
            console.warn('[ENGINE] PaddleOCR warm-up skipped (fallback or error)', err);
        }
    }

    async detect(canvas) {
        if (!this.detSession) return { boxes: [] };

        try {

            const inputSize = this.manifest.det.input_size || [960, 960];
            const [h, w] = inputSize;

            const tensorData = canvasToFloat32Tensor(canvas, inputSize, this.normalize);
            if (!tensorData) return { boxes: [] };
            
            const inputTensor = new ort.Tensor('float32', tensorData, [1, 3, h, w]);

            const feeds = {};
            feeds[this.detSession.inputNames[0]] = inputTensor;

            const output = await this.detSession.run(feeds);
            const outputName = this.detSession.outputNames[0];
            const map = output[outputName].data;
            const dims = output[outputName].dims;

            const mapH = dims[2];
            const mapW = dims[3];

            const boxes = this._extractBoxesFromMap(map, mapH, mapW, canvas.width, canvas.height);

            
            // Memory Cleanup
            feeds[this.detSession.inputNames[0]] = null;
            
            return { boxes };
        } catch (err) {
            console.error("PaddleOCR: Detection Error:", err);
            return { boxes: [] };
        }
    }

    _extractBoxesFromMap(map, mapH, mapW, origW, origH) {
        try {
            const threshold = 0.6;
            const visited = new Uint8Array(mapH * mapW);
            const boxes = [];

            const idx = (y, x) => y * mapW + x;

            for (let y = 0; y < mapH; y++) {
                for (let x = 0; x < mapW; x++) {
                    const v = map[idx(y, x)];
                    if (v < threshold || visited[idx(y, x)]) continue;

                    let minX = x, maxX = x, minY = y, maxY = y;
                    const stack = [[x, y]];
                    visited[idx(y, x)] = 1;

                    while (stack.length) {
                        const [cx, cy] = stack.pop();

                        minX = Math.min(minX, cx);
                        maxX = Math.max(maxX, cx);
                        minY = Math.min(minY, cy);
                        maxY = Math.max(maxY, cy);

                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                const nx = cx + dx;
                                const ny = cy + dy;
                                if (nx < 0 || ny < 0 || nx >= mapW || ny >= mapH) continue;

                                const nIdx = idx(ny, nx);
                                if (visited[nIdx]) continue;
                                if (map[nIdx] < threshold) continue;

                                visited[nIdx] = 1;
                                stack.push([nx, ny]);
                            }
                        }
                    }

                    const scaleX = origW / mapW;
                    const scaleY = origH / mapH;

                    // 1. Apply padding in detection-space BEFORE scaling
                    const padLeft   = 20; 
                    const padRight  = 12;
                    const padTop    = 12;
                    const padBottom = 12;

                    let pMinX = Math.max(0, minX - padLeft);
                    let pMinY = Math.max(0, minY - padTop);
                    let pMaxX = Math.min(mapW, maxX + padRight + 1);
                    let pMaxY = Math.min(mapH, maxY + padBottom + 1);

                    // 2. THEN scale to original image coordinates
                    const x1 = pMinX * scaleX;
                    const y1 = pMinY * scaleY;
                    const x2 = pMaxX * scaleX;
                    const y2 = pMaxY * scaleY;

                    // Noise-box filtering (Patch v2.1.8)
                    const w = x2 - x1;
                    const h = y2 - y1;
                    const MIN_AREA = 40 * 40; 
                    if (w * h < MIN_AREA) {
                        continue; 
                    }

                    boxes.push([x1, y1, x2, y2]);
                }
            }
            return boxes;
        } catch (err) {
            console.error("PaddleOCR: Box Extraction Error:", err);
            return [];
        }
    }

    async recognize(cropCanvas) {
        if (!this.recSession) return { text: '' };
        if (this.busy) {
            console.warn("[ENGINE] PaddleOCR: Inference skipped — session is busy.");
            return { text: '' };
        }
        this.busy = true;

        try {
            const inputSize = this.manifest.rec.input_size || [48, 320];
            const [h, w] = inputSize;

            if (!this.recognitionBuffer) {
                this.recognitionBuffer = new Float32Array(this.recognitionBufferSize);
                console.log('[ENGINE] PaddleOCR buffer pool active');
            }

            const tensorData = canvasToFloat32Tensor(cropCanvas, inputSize, this.normalize, this.recognitionBuffer);
            if (!tensorData) return { text: '' };
            
            const inputTensor = new ort.Tensor('float32', tensorData, [1, 3, h, w]);

            const feeds = {};
            feeds[this.recSession.inputNames[0]] = inputTensor;

            const output = await this.recSession.run(feeds);
            const outputName = this.recSession.outputNames[0];
            const out = output[outputName];

            let logits = out.data;
            let dims = out.dims;

            if (dims.length === 4) {
                dims = [dims[0], dims[2], dims[3]];
            } else if (dims.length === 2) {
                dims = [1, dims[0], dims[1]];
            }

            const text = this._ctcGreedyDecode(logits, dims);

            
            // Memory Cleanup
            feeds[this.recSession.inputNames[0]] = null;
            logits = null;
            
            return text;
        } finally {
            this.busy = false;
        }
    }

    _ctcGreedyDecode(logits, dims) {
        try {
            const [batch, timeSteps, numClasses] = dims;
            const texts = [];

            for (let b = 0; b < batch; b++) {
                let prev = -1;
                const chars = [];
                for (let t = 0; t < timeSteps; t++) {
                    let maxIdx = 0;
                    let maxVal = -Infinity;
                    for (let c = 0; c < numClasses; c++) {
                        const idx = b * timeSteps * numClasses + t * numClasses + c;
                        const v = logits[idx];
                        if (v > maxVal) {
                            maxVal = v;
                            maxIdx = c;
                        }
                    }
                    if (maxIdx !== 0 && maxIdx !== prev) {
                        const dictIdx = maxIdx - 1;
                        if (dictIdx >= 0 && dictIdx < this.dict.length) {
                            chars.push(this.dict[dictIdx]);
                        }
                    }
                    prev = maxIdx;
                }
                texts.push(chars.join(''));
            }
            return { text: texts[0] || '' };
        } catch (err) {
            console.error("PaddleOCR: CTC Decoding Error:", err);
            return { text: '' };
        }
    }

    async dispose() {
        // Explicit Session Disposal (if supported)
        try {
            if (this.detSession) {
                if (typeof this.detSession.release === 'function') await this.detSession.release();
                else if (this.detSession.handler && typeof this.detSession.handler.dispose === 'function') this.detSession.handler.dispose();
            }
            if (this.recSession) {
                if (typeof this.recSession.release === 'function') await this.recSession.release();
                else if (this.recSession.handler && typeof this.recSession.handler.dispose === 'function') this.recSession.handler.dispose();
            }
        } catch (e) {
            console.warn("PaddleOCR: Error during session release", e);
        }
        
        this.detSession = null;
        this.recSession = null;
        this.dict = [];
        this.isLoaded = false;
    }
}
