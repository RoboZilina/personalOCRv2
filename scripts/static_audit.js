/**
 * static_audit.js
 * 
 * Verifies that the repository is clean of any Cloudflare Worker or server-side artifacts.
 * This is a "Gold Gate" guardrail to prevent accidental regressions toward non-static hosting.
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

const UNWANTED_FILES = [
    'wrangler.toml',
    'functions',
    'workers',
    '.wrangler'
];

const UNWANTED_SCRIPTS = [
    'wrangler deploy',
    'wrangler dev',
    'wrangler publish'
];

let errors = 0;

console.log('--- Starting Static Audit (Gold Baseline) ---');

// 1. Check for unwanted files/folders
UNWANTED_FILES.forEach(item => {
    const fullPath = path.join(projectRoot, item);
    if (fs.existsSync(fullPath)) {
        console.error(`❌ ERROR: Unwanted artifact found: ${item}`);
        errors++;
    } else {
        console.log(`✅ OK: ${item} not found.`);
    }
});

// 2. Check package.json for unwanted scripts
    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const scripts = pkg.scripts || {};
        const devDeps = pkg.devDependencies || {};
        
        // 2a. Check scripts
        UNWANTED_SCRIPTS.forEach(badScript => {
            Object.values(scripts).forEach(s => {
                if (s.includes(badScript)) {
                    console.error(`❌ ERROR: Package script contains worker-specific command: "${s}"`);
                    errors++;
                }
            });
        });

        // 2b. Check devDependencies
        if (devDeps['wrangler'] || devDeps['@cloudflare/workers-types']) {
            console.error('❌ ERROR: Worker-specific dependencies found in package.json devDependencies.');
            errors++;
        }
    }

    // 2c. Check GitHub Workflows for Worker actions
    const workflowDir = path.join(projectRoot, '.github', 'workflows');
    if (fs.existsSync(workflowDir)) {
        const workflows = fs.readdirSync(workflowDir);
        workflows.forEach(file => {
            const content = fs.readFileSync(path.join(workflowDir, file), 'utf8');
            if (content.includes('cloudflare/workers-action')) {
                console.error(`❌ ERROR: GitHub workflow "${file}" contains a Cloudflare Worker deployment action.`);
                errors++;
            }
        });
    }

    // 3. Check app.v38.js for common Worker patterns (like export default { fetch })
const appJsPath = path.join(projectRoot, 'app.v38.js');
if (fs.existsSync(appJsPath)) {
    const content = fs.readFileSync(appJsPath, 'utf8');
    if (content.includes('export default {') && content.includes('fetch')) {
        console.error('❌ ERROR: app.v38.js contains a Cloudflare Worker export pattern.');
        errors++;
    }
}

console.log('---------------------------------------------');
if (errors > 0) {
    console.error(`Status: FAILED (${errors} isolation violations)`);
    process.exit(1);
} else {
    console.log('Status: PASSED (Repository is pure static)');
    process.exit(0);
}
