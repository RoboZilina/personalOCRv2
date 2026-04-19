import '/js/onnx/ort.min.js?v=3.8.5';
import { MangaOCREngine } from './manga_engine.js?v=3.8.5';

self.onmessage = async (e) => {
    const { command, id } = e.data;

    if (command === 'load') {
        try {
            const engine = new MangaOCREngine('/models/manga/manifest.json');
            await engine.load();
            await engine.warmUp();
            self.postMessage({ type: 'ready', payload: { loaded: true, warmedUp: true } });
        } catch (error) {
            self.postMessage({ type: 'error', error: error.message });
        }
    }
};
