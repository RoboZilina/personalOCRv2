import '/js/onnx/ort.min.js?v=3.8.6';
import { PaddleOCR } from './paddle_engine.js?v=3.8.6';

self.onmessage = async (e) => {
    const { command, id } = e.data;

    if (command === 'load') {
        try {
            const engine = new PaddleOCR('/models/paddle/manifest.json', '/js/onnx/');
            await engine.load();
            await engine.warmUp();
            self.postMessage({ type: 'ready', payload: { loaded: true, warmedUp: true } });
        } catch (error) {
            self.postMessage({ type: 'error', error: error.message });
        }
    }
};
