const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Security: COEP/COOP disabled by default for local dev; enable with ENABLE_COEP=1 for testing
// WARNING: Production should always use COEP/COOP headers for cross-origin isolation
const ENABLE_COEP = process.env.ENABLE_COEP === '1';
if (!ENABLE_COEP) {
    console.warn('[SERVER] COEP/COOP disabled. Cross-origin isolation not active. Use ENABLE_COEP=1 for production-like behavior.');
}

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-font-object',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm'
};

const server = http.createServer((req, res) => {
    // Security: Normalize and sanitize path to prevent directory traversal
    let requestedPath = req.url;
    if (requestedPath === '/') {
        requestedPath = '/index.html';
    }
    
    // Remove any query parameters for file lookup
    const cleanPath = requestedPath.split('?')[0];
    
    // Reject paths with null bytes (suspicious)
    if (cleanPath.includes('\0')) {
        res.writeHead(400);
        res.end('400 Bad Request');
        return;
    }
    
    // Normalize the path and ensure it's within project root
    const filePath = path.normalize(path.join(PROJECT_ROOT, cleanPath));
    
    // Security check: use path.relative to robustly detect traversal attempts
    // This works correctly on Windows (case-insensitive) and handles edge cases
    const relativePath = path.relative(PROJECT_ROOT, filePath);
    const isPathSafe = !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
    
    if (!isPathSafe) {
        res.writeHead(403);
        res.end('403 Forbidden');
        return;
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('404 Not Found');
            } else {
                res.writeHead(500);
                res.end('500 Error: ' + error.code);
            }
        } else {
            const headers = {
                'Content-Type': contentType
            };
            
            // Only add COEP/COOP headers if explicitly enabled
            if (ENABLE_COEP) {
                headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
                headers['Cross-Origin-Opener-Policy'] = 'same-origin';
            }
            
            res.writeHead(200, headers);
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});
