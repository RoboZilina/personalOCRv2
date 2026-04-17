import { isWebGPUSupported } from '../onnx/onnx_support.js?v=3.8.4';
import { fetchWithProgress } from '../utils/fetch_utils.js?v=3.8.4';
import { STATUS } from '../core/status.js?v=3.8.4';

/**
 * MangaOCR Engine v3.8.4
 */

export class MangaOCREngine {
    static STATUS = STATUS;
    constructor(manifestUrl, options = {}) {
        this.id = 'manga';
        this.label = 'MangaOCR';
        this.manifestUrl = manifestUrl;
        this.isLoaded = false;
        
        this.encoderSession = null;
        this.decoderSession = null;
        this.vocab = null;
        this.busy = false; // Hardening v3.4: Concurrency Lock
        
        // Support both legacy positional callback and modern options object
        const finalOptions = (typeof options === 'object') ? options : { reportStatus: options };
        this.reportStatus = finalOptions.reportStatus || (() => {});

        // Preprocessing constants — normalization stats loaded from preprocessor_config.json at runtime
        this.RESIZE_DIM = 224;
        this.MAX_LENGTH = 300; // matches official manga-ocr generate(max_length=300)
        this.imageMean = null;
        this.imageStd = null;
        // Token IDs loaded from config.json at runtime (model-specific)
        this.BOS_TOKEN_ID = null;
        this.EOS_TOKEN_ID = null;

        // Hardening Patch v2.5: Decoder Buffer Reuse
        this.decoderTokenBuffer = null;
        this.decoderLogitsBuffer = null;
        this.decoderMaxLength = 256; 
    }

    /**
     * Hybrid Integrity Check (Hardening v2.1.10).
     * Pings local config and remote models for Cloudflare compatibility.
     */
    async checkAssets() {
        const modelBase = "./models/manga/";
        const assets = [
            { url: modelBase + 'vocab.json', type: 'local' },
            { url: modelBase + 'config.json', type: 'local' },
            { url: modelBase + 'preprocessor_config.json', type: 'local' },
            { url: 'https://pub-77a4ba72da6d4b9e892b6511ae694813.r2.dev/models/manga/encoder_model.onnx', type: 'remote' },
            { url: 'https://pub-77a4ba72da6d4b9e892b6511ae694813.r2.dev/models/manga/decoder_model.onnx', type: 'remote' }
        ];
        
        try {
            const results = await Promise.all(assets.map(a => fetch(a.url, { method: 'HEAD' })));
            const allFound = results.every(res => res.ok);
            
            const diagAssets = document.getElementById('diag-assets');
            if (diagAssets) {
                diagAssets.textContent = allFound ? '✅ FOUND' : '❌ MISSING';
                diagAssets.className = allFound ? 'diag-status-ok' : 'diag-status-fail';
            }
            return allFound;
        } catch (err) {
            console.warn("MangaOCR: Hybrid check failed:", err);
            return false;
        }
    }

    /**
     * Initializes the dual ONNX sessions via Hybrid Loader.
     */
    async load() {
        if (this.isLoaded && this.encoderSession && this.decoderSession) return;

        // Non-blocking integrity ping
        this.checkAssets();
        
        try {
            this.reportStatus(STATUS.DOWNLOADING, '🟡 MangaOCR: downloading manifest…', 0.1);
            const manifestRes = await fetch(this.manifestUrl);
            if (!manifestRes.ok) throw new Error(`MangaOCR: Manifest load failed (${manifestRes.status})`);
            const manifest = await manifestRes.json();
            
            const modelBase = "./models/manga/";

            // Enable WebGPU backend for MangaOCR when available (fallback to WASM).
            const useWebGPU = await isWebGPUSupported();
            const executionProviders = useWebGPU ? ['webgpu', 'wasm'] : ['wasm'];

            // Sequential Loading (Hybrid: Remote Priority for Models)
            this.reportStatus(STATUS.DOWNLOADING, '🟡 MangaOCR: loading configuration…', 0.15);
            const [vocabRes, configRes, preprocRes] = await Promise.all([
                fetch(modelBase + manifest.vocab.path),
                fetch(modelBase + manifest.config.path),
                fetch(modelBase + manifest.preprocessor.path)
            ]);

            if (!vocabRes.ok) throw new Error("MangaOCR: Vocabulary fetch failed");
            if (!configRes.ok) throw new Error("MangaOCR: Configuration fetch failed");
            if (!preprocRes.ok) throw new Error("MangaOCR: Preprocessor fetch failed");

            this.vocab = await vocabRes.json();
            const config = await configRes.json();
            this.BOS_TOKEN_ID = config.decoder_start_token_id ?? 2;
            this.EOS_TOKEN_ID = config.eos_token_id ?? 3;
            
            // Read normalization stats from preprocessor config
            const preproc = await preprocRes.json();
            this.imageMean = preproc.image_mean ?? [0.5, 0.5, 0.5];
            this.imageStd  = preproc.image_std  ?? [0.5, 0.5, 0.5];
            
            // Load Encoder (Remote)
            this.reportStatus(STATUS.DOWNLOADING, '🟡 MangaOCR: downloading encoder…', 0.2);
            const encoderPath = manifest.encoder.remote_url || (modelBase + manifest.encoder.path);
            let encoderBuffer = await fetchWithProgress(
                encoderPath,
                (p) => this.reportStatus(STATUS.DOWNLOADING, '🟡 MangaOCR: downloading encoder…', 0.2 + (p * 0.35))
            );
            this.encoderSession = await ort.InferenceSession.create(encoderBuffer, { executionProviders });
            encoderBuffer = null;

            // Load Decoder (Remote)
            this.reportStatus(STATUS.DOWNLOADING, '🟡 MangaOCR: downloading decoder…', 0.6);
            const decoderPath = manifest.decoder.remote_url || (modelBase + manifest.decoder.path);
            let decoderBuffer = await fetchWithProgress(
                decoderPath,
                (p) => this.reportStatus(STATUS.DOWNLOADING, '🟡 MangaOCR: downloading decoder…', 0.6 + (p * 0.35))
            );
            this.decoderSession = await ort.InferenceSession.create(decoderBuffer, { executionProviders });
            decoderBuffer = null;

            // Initialize optimization buffers (Patch v2.1.8)
            if (window.VNOCR_DEBUG) console.debug(`[ENGINE] MangaOCR → INITIALIZING BUFFERS`);
            if (!this.decoderTokenBuffer) {
                this.decoderTokenBuffer = new BigInt64Array(this.decoderMaxLength);
            }
            if (!this.decoderLogitsBuffer) {
                const vocabSize = Object.keys(this.vocab).length;
                this.decoderLogitsBuffer = new Float32Array(vocabSize);
            }

            this.isLoaded = true;
            if (window.VNOCR_DEBUG) console.debug(`[ENGINE] MangaOCR → ${STATUS.READY}`);
            this.reportStatus(STATUS.READY, '🟢 MangaOCR: ready.');
        } catch (err) {
            console.error("[MANGA-ERROR] Engine Load Failed:", err);
            this.isLoaded = false;
            try {
                this.reportStatus(STATUS.ERROR, `🔴 MangaOCR: ${err.message || 'Load Failed'}`);
            } catch (enumErr) {
                console.warn("MangaOCR: Status report failed (enum/context error):", enumErr);
            }
            throw err;
        }
    }



    /**
     * Internal greedy argmax on the final dimension of the logits tensor.
     */
    _greedyChoice(logits) {
        const [batch, seqLen, vocabSize] = logits.dims;
        const data = logits.data;
        const lastStepOffset = (seqLen - 1) * vocabSize;

        let maxIdx = 0;
        let maxVal = -Infinity;
        for (let j = 0; j < vocabSize; j++) {
            const val = data[lastStepOffset + j];
            if (val > maxVal) {
                maxVal = val;
                maxIdx = j;
            }
        }
        return maxIdx;
    }

    /**
     * Isolated Preprocessing: Canvas -> 224x224 -> Greyscale -> Normalized Float32 Tensor.
     * Mirrors official manga-ocr: img.convert('L').convert('RGB') then ViTImageProcessor.
     * Direct stretch (no letterbox) — matches training-time preprocessing exactly.
     */
    _preprocessToTensor(sourceCanvas) {
        const d = this.RESIZE_DIM;
        const canvas = document.createElement('canvas');
        canvas.width = d; canvas.height = d;
        const ctx = canvas.getContext('2d');

        // Direct stretch to 224x224 - matches official ViTImageProcessor behavior
        ctx.drawImage(sourceCanvas, 0, 0, d, d);

        const pixels = ctx.getImageData(0, 0, d, d).data;
        const floatData = new Float32Array(d * d * 3);
        const mean = this.imageMean;
        const std  = this.imageStd;

        for (let i = 0, j = 0; i < pixels.length; i += 4, j++) {
            // BT.601 greyscale - STRICTLY matches PIL img.convert('L')
            let grey = (0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
            
            // NO INVERSION: the author's code applies no inversion or thresholding.
            const norm = (grey / 255 - mean[0]) / std[0]; // all channels identical after greyscale
            floatData[j]             = norm;
            floatData[j + d * d]     = norm;
            floatData[j + d * d * 2] = norm;
        }

        return new ort.Tensor('float32', floatData, [1, 3, d, d]);
    }


    /**
     * Executes the VED OCR model on the given canvas image logic.
     * @param {HTMLCanvasElement} sourceCanvas
     * @returns {Promise<string>} The decoded Japanese text
     */
    /**
     * WebGPU Shader Pre-warming (Zero-Inference Pass)
     * Forces the browser to compile shaders during load rather than during first run.
     */
    async warmUp() {
        if (!this.encoderSession || !this.decoderSession) return;

        try {
            // Micro-yield to ensure UI responsiveness
            await new Promise(r => setTimeout(r, 0));

            // Warm up Encoder (224x224)
            const encShape = [1, 3, 224, 224];
            const encDummy = new ort.Tensor('float32', new Float32Array(1 * 3 * 224 * 224), encShape);
            const encoderResults = await this.encoderSession.run({ pixel_values: encDummy });
            const encoderHiddenStates = encoderResults.last_hidden_state;

            // Warm up Decoder (one step)
            // input_ids: [1, 1], encoder_hidden_states: [1, 197, 768] (standard ViT output)
            const inputIdsTensor = new ort.Tensor('int64', new BigInt64Array([BigInt(this.BOS_TOKEN_ID)]), [1, 1]);
            const decoderFeeds = {
                input_ids: inputIdsTensor,
                encoder_hidden_states: encoderHiddenStates
            };
            await this.decoderSession.run(decoderFeeds);

            console.log('[ENGINE] MangaOCR warm-up complete');
        } catch (err) {
            console.warn('[ENGINE] MangaOCR warm-up skipped (fallback or error)', err);
        }
    }

    async recognize(sourceCanvas) {
        if (!this.encoderSession || !this.decoderSession) {
            throw new Error("MangaOCREngine: ONNX sessions not initialized. Call load() first.");
        }
        if (this.busy) {
            console.warn("[ENGINE] MangaOCR: Inference skipped — session is busy.");
            return { text: '' };
        }

        const start = performance.now();
        try {
            this.busy = true;
            const pixelValues = this._preprocessToTensor(sourceCanvas);

            const encoderFeeds = { pixel_values: pixelValues };
            const encoderResults = await this.encoderSession.run(encoderFeeds);
            const encoderHiddenStates = encoderResults.last_hidden_state;

            let generatedTokens = [this.BOS_TOKEN_ID];

            for (let step = 0; step < this.MAX_LENGTH; step++) {
                const pos = generatedTokens.length;
                this.decoderTokenBuffer[pos - 1] = BigInt(generatedTokens[pos - 1]);
                
                const decoderFeeds = {
                    input_ids: new ort.Tensor('int64', this.decoderTokenBuffer.subarray(0, pos), [1, pos]),
                    encoder_hidden_states: encoderHiddenStates
                };

                const decoderResults = await this.decoderSession.run(decoderFeeds);
                const nextTokenId = this._greedyChoice(decoderResults.logits);

                if (nextTokenId === this.EOS_TOKEN_ID) break;
                generatedTokens.push(nextTokenId);
            }

            const text = this._decode(generatedTokens);

            if (window.VNOCR_DEBUG) {
                const elapsed = (performance.now() - start).toFixed(1);
                console.debug(`[ENGINE] MangaOCR inference took ${elapsed}ms`);
            }

            return { text, confidence: 0.95 };
        } catch (err) {
            console.error("[ENGINE] MangaOCR Inference Error:", err);
            return { text: '' };
        } finally {
            if (window.VNOCR_DEBUG && !this.busy) console.warn(`[${new Date().toISOString()}] [ENGINE] MangaOCR: Double-release of busy flag detected!`);
            const wasBusy = this.busy;
            this.busy = false;
            if (window.VNOCR_DEBUG) console.debug(`[${new Date().toISOString()}] [ENGINE] MangaOCR busy flag released (was: ${wasBusy})`);
        }
    }

    /**
     * Converts token IDs back to a string using the vocabulary.
     * @param {Array<number>} tokens - Array of token IDs
     * @returns {string} The decoded Japanese text
     */
    _decode(tokens) {
        if (!this.vocab) return "";
        
        const chars = tokens.map(t => this.vocab[t] || '');
        let text = chars.join('').replace(/ /g, '').replace(/<[^>]+>/g, '');

        // Stripping system tokens
        text = text.replace(/\[CLS\]/g, '').replace(/\[SEP\]/g, '').replace(/\[PAD\]/g, '').replace(/\[UNK\]/g, '');
        text = text.replace(/\u2026/g, '...'); 
        text = text.replace(/[・.]{2,}/g, m => '.'.repeat(m.length));
        text = text.replace(/\s+/g, ''); // strip whitespace
        
        return text;
    }

    /**
     * Releases both ONNX sessions.
     */
    async dispose() {
        try {
            if (this.encoderSession) {
                if (typeof this.encoderSession.release === 'function') await this.encoderSession.release();
                else if (this.encoderSession.handler) this.encoderSession.handler.dispose();
            }
            if (this.decoderSession) {
                if (typeof this.decoderSession.release === 'function') await this.decoderSession.release();
                else if (this.decoderSession.handler) this.decoderSession.handler.dispose();
            }
        } catch (e) {
            console.warn("[MANGA-DEBUG] Error during disposal", e);
        }
        this.encoderSession = null;
        this.decoderSession = null;
        this.isLoaded = false;
    }
}
