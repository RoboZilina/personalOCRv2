# personalOCR — Gold Baseline (v3.8.0-Certified)

A high-performance, browser-only Japanese OCR suite for Japanese Media. This branch is the definitive **Gold v3.8 Certified Build**, optimized for Cloudflare Pages with full hardware acceleration, real-time progress tracking, and hardened inference locks.

## v3.8: The "Definitive Certification" Milestone
This version represents the final production-hardened standard. It incorporates high-fidelity progress tracking, surgical lock hardening across all neural engines, and an airtight static-gate audit to ensure 100% stability.

## Key Features & Hardening
- **Native WebGPU Acceleration** — GPU-accelerated inference for PaddleOCR and MangaOCR, enabled via native `_headers` configuration.
- **Deterministic Engine Switching** — Hardened lifecycle management that guarantees the engine and UI remain perfectly synchronized even during rapid toggling.
- **100% Settings Persistence** — Every UI control, including Tesseract upscaling and PaddleOCR warning states, is now fully persistent across sessions.
- **High-Speed Clipping (Auto-Copy)** — A premium extraction utility that automatically copies manually selected text from transcription fields to the clipboard with visual feedback.
- **Reality-Sync Recovery** — Advanced DOM hydration logic that eliminates "temporal vacuum" race conditions during initial page load.
- **Zero-Allocation Memory Architecture** — Every inference loop uses pre-allocated, hardware-aligned memory pools, preventing Garbage Collection spikes.
- **Service Worker Efficiency** — Optimized caching strategy specifically designed for Cloudflare, excluding massive binary models to prevent storage bloat.

## Hosting & Deployment Hardening
This repository is strictly **Agnostic & Static**. It does not use Cloudflare Workers, Node.js servers, or any server-side logic. 

### 🛑 The "Wrangler Ghost" Fix (Cloudflare Pages)
If Cloudflare Pages attempts to build your project as a **Worker** (causing build failures), it is usually due to stale project settings in the Cloudflare Dashboard. Follow these steps to purge the "Ghost" configuration:

1.  **Dashboard Side:**
    *   Navigate to **Workers & Pages** -> [Your Project] -> **Settings** -> **Build & deployments**.
    *   **Build Command:** Clear this completely (should be blank).
    *   **Root Directory:** Set to `/`.
    *   **Framework Preset:** Set to `None`.
    *   **Environment Variables:** Delete `NODE_VERSION` or any `WRANGLER` related tokens.
2.  **Repository Side:**
    *   Ensure no `wrangler.toml` exists in the root.
    *   Run `npm run audit:static` to verify the environment is pure.

### 🚀 Universal Isolation (COOP/COEP)
WebGPU and WASM Multi-threading require a "Cross-Origin Isolated" environment. 
- **Native Support:** On Cloudflare and Netlify, the root `_headers` file handles this automatically.
- **Universal Fallback:** The `service-worker.js` automatically injects these headers into all locally served assets. This allows the app to run with full hardware acceleration even on "dumb" hosts like **GitHub Pages**.

## Maintainer's Audit (Gold Gate)
To prevent accidental regression toward server-side logic, use the provided audit suite:

```bash
# Verify no Worker remnants (wrangler.toml, functions/, etc.)
npm run audit:static

# Verify code integrity
npm run audit
```

## Tips
- Use **Scaling 3× or 4×** for low-resolution media or small font sizes.
- Use the **Auto-Capture** feature for hands-free extracted text flow during gameplay.
- **Clipping:** Highlighting text in the transcription area will automatically copy it to your clipboard if enabled.
