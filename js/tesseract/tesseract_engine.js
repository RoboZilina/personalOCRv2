export class TesseractEngine {
    constructor(options = {}) {
        this.id = 'tesseract';
        this.label = 'Tesseract';
        this.isLoaded = false;
        this.worker = null;
        this.reportStatus = options.reportStatus || (() => {});
    }

    /**
     * Hybrid Integrity Check (Hardening v2.1.10).
     * Pings local workers and remote data to ensure Cloudflare-compatible deployment.
     */
    async checkAssets() {
        const localAssets = [
            './js/tesseract/worker.min.js',
            './js/tesseract/tesseract-core.wasm.js'
        ];
        const remoteAssets = [
            'https://github.com/RoboZilina/personalOCR/releases/latest/download/jpn.traineddata'
        ];
        
        try {
            const [localResults, remoteResults] = await Promise.all([
                Promise.all(localAssets.map(url => fetch(url, { method: 'HEAD' }))),
                Promise.all(remoteAssets.map(url => fetch(url, { method: 'HEAD' })))
            ]);
            
            const allFound = [...localResults, ...remoteResults].every(res => res.ok);
            
            const diagAssets = document.getElementById('diag-assets');
            if (diagAssets) {
                diagAssets.textContent = allFound ? '✅ FOUND' : '❌ MISSING';
                diagAssets.className = allFound ? 'diag-status-ok' : 'diag-status-fail';
            }
            return allFound;
        } catch (err) {
            console.warn("Tesseract: Hybrid asset check failed:", err);
            return false;
        }
    }

    /**
     * Initializes the Tesseract worker via Hybrid Loader.
     */
    async load() {
        if (this.isLoaded && this.worker) return;

        this.checkAssets();

        try {
            // Hybrid Paths: High-res GitHub data + Stable UNPKG logic
            const langPath = 'https://github.com/RoboZilina/personalOCR/releases/latest/download/';
            const useGzip = false;
            const actualLang = 'jpn';

            this.worker = await Tesseract.createWorker(actualLang, 1, {
                langPath: 'https://pub-77a4ba72da6d4b9e892b6511ae694813.r2.dev/personalocr-assets/tesseract/',
                workerPath: './js/tesseract/tesseract-core.worker.js',
                corePath: 'https://pub-77a4ba72da6d4b9e892b6511ae694813.r2.dev/personalocr-assets/tesseract/',
                gzip: useGzip,
                logger: m => {
                    if (m.status === 'loading language traineddata') {
                        const pct = Math.round(m.progress * 100);
                        this.reportStatus('loading', `🟡 Loading Data ${pct}%`);
                    }
                }
            });

            // Tesseract-specific parameters for VN text blocks
            await this.worker.setParameters({
                tessedit_pageseg_mode: '6'
            });

            this.isLoaded = true;
        } catch (err) {
            console.error("TesseractEngine: Load Error:", err);
            this.isLoaded = false;
            throw err;
        }
    }

    /**
     * Terminates the worker and clears references.
     */
    async dispose() {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
        }
        this.isLoaded = false;
    }

    /**
     * Performs OCR on the provided canvas.
     * @param {HTMLCanvasElement} canvas 
     * @returns {Promise<{text: string}>}
     */
    async recognize(canvas) {
        if (!this.isLoaded || !this.worker) {
            return { text: '' };
        }

        try {
            const { data: { text } } = await this.worker.recognize(canvas);
            return { text: text || '' };
        } catch (err) {
            console.error("TesseractEngine: Recognition Error:", err);
            return { text: '' };
        }
    }
}
