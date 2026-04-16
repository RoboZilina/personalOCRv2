const fs = require('fs');
const path = require('path');

const indexHtml = fs.readFileSync('index.html', 'utf8');
const appJs = fs.readFileSync('app.v38.js', 'utf8');
const settingsJs = fs.readFileSync('settings.js', 'utf8');

// Extraction regex for IDs
// Matches: getElementById('...') or querySelector('#...')
const idRegex = /getElementById\(['"]([^'"]+)['"]\)|querySelector\(['"]#([^'"]+)['"]\)/g;

// Extraction regex for Complex/Warn selectors
const complexRegex = /querySelector\(['"]([^'"]+)['"]\)/g;

const ids = new Set();
const complex = new Set();

[appJs, settingsJs].forEach(content => {
    let match;
    // Reset regex indices
    idRegex.lastIndex = 0;
    while ((match = idRegex.exec(content)) !== null) {
        ids.add(match[1] || match[2]);
    }
    
    complexRegex.lastIndex = 0;
    while ((match = complexRegex.exec(content)) !== null) {
        const val = match[1];
        if (!val.startsWith('#')) {
            complex.add(val);
        }
    }
});

console.log(`[AUDIT:DOM] Found ${ids.size} unique IDs and ${complex.size} complex selectors to verify.`);

let overallFail = false;
let failCount = 0;
let warnCount = 0;

console.log("\n--- ID Integrity Checks (STRICT) ---");
ids.forEach(id => {
    // Audit decision: multipass-overlay is documented as dynamic in app.js
    if (id === 'multipass-overlay') {
        console.log(`🟡 WARN: #${id} (Dynamic Element)`);
        warnCount++;
        return;
    }

    const exists = indexHtml.includes(`id="${id}"`) || indexHtml.includes(`id='${id}'`);
    if (exists) {
        console.log(`✅ OK: #${id}`);
    } else {
        console.error(`❌ MISSING: #${id}`);
        failCount++;
        overallFail = true;
    }
});

console.log("\n--- Complex Selector Checks (WARN ONLY) ---");
complex.forEach(selector => {
    // Static check for presence of selector components
    const searchTerm = selector.replace(/[\[\]\.>#]/g, ' ').trim().split(' ')[0];
    const found = indexHtml.includes(searchTerm);

    if (found) {
        console.log(`✅ OK: ${selector}`);
    } else {
        console.warn(`🟡 WARN: ${selector} (Static match failed)`);
        warnCount++;
    }
});

console.log(`\nStats: ${failCount} Fails, ${warnCount} Warnings`);

if (overallFail) {
    console.error("\n🔴 Audit Result: FAIL (Missing IDs)");
    process.exit(1);
} else {
    console.log("\n🟢 Audit Result: SUCCESS");
    process.exit(0);
}
