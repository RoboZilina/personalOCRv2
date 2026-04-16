/**
 * PersonalOCR Universal Fetch Utility
 * Centralized logic for progress-tracked fetching of large neural assets.
 */

/**
 * fetchWithProgress
 * @param {string} url - The resource to fetch.
 * @param {function} onProgress - Callback receiving (0.0 to 1.0) progress.
 * @returns {Promise<ArrayBuffer>}
 */
export async function fetchWithProgress(url, onProgress) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);

    const contentLength = response.headers.get('Content-Length');
    if (!contentLength) {
        const buffer = await response.arrayBuffer();
        if (onProgress) onProgress(1);
        return buffer;
    }

    const total = parseInt(contentLength, 10);
    let loaded = 0;
    if (!response.body) return response.arrayBuffer();
    const reader = response.body.getReader();
    const chunks = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        if (onProgress) onProgress(loaded / total);
    }

    const blob = new Blob(chunks);
    const buffer = await blob.arrayBuffer();
    if (onProgress) onProgress(1);
    return buffer;
}
