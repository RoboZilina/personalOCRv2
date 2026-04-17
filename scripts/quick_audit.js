#!/usr/bin/env node
/**
 * Quick Security & Correctness Audit for personalOCR
 * Run: node scripts/quick_audit.js
 */
const fs = require('fs');
const path = require('path');

const TARGET_DIR = path.dirname(__dirname);
const RESULTS = {
  initEventListeners: { count: 0, lines: [] },
  isProcessingWrites: { count: 0, lines: [] },
  domInserts: { innerHTML: [], insertAdjacentHTML: [], outerHTML: [] }
};

function auditFile(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8');
  const lines = txt.split(/\r?\n/);
  const relPath = path.relative(TARGET_DIR, filePath);

  lines.forEach((ln, idx) => {
    const lineNum = idx + 1;
    
    // 1. initEventListeners definitions
    if (/function\s+initEventListeners\b/.test(ln)) {
      RESULTS.initEventListeners.count++;
      RESULTS.initEventListeners.lines.push(`${relPath}:${lineNum}`);
    }
    
    // 2. isProcessing writes (assignments)
    if (/\bisProcessing\s*=/.test(ln)) {
      RESULTS.isProcessingWrites.count++;
      RESULTS.isProcessingWrites.lines.push(`${relPath}:${lineNum}: ${ln.trim()}`);
    }
    
    // 3. DOM insertions
    if (/\.innerHTML\b/.test(ln)) {
      RESULTS.domInserts.innerHTML.push(`${relPath}:${lineNum}: ${ln.trim()}`);
    }
    if (/\.insertAdjacentHTML\b/.test(ln)) {
      RESULTS.domInserts.insertAdjacentHTML.push(`${relPath}:${lineNum}: ${ln.trim()}`);
    }
    if (/\.outerHTML\b/.test(ln)) {
      RESULTS.domInserts.outerHTML.push(`${relPath}:${lineNum}: ${ln.trim()}`);
    }
  });
}

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const p = path.join(dir, f);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      if (f === 'node_modules' || f === '.git') continue;
      walk(p);
    } else if (p.endsWith('.js') || p.endsWith('.html')) {
      auditFile(p);
    }
  }
}

console.log('🔍 Running Quick Audit...\n');
walk(TARGET_DIR);

// Report
console.log('━'.repeat(60));
console.log('1️⃣  initEventListeners Definitions');
console.log('━'.repeat(60));
console.log(`   Count: ${RESULTS.initEventListeners.count} (expected: 1)`);
if (RESULTS.initEventListeners.count !== 1) {
  console.log('   ⚠️  WARNING: Should have exactly 1 definition!');
}
RESULTS.initEventListeners.lines.forEach(l => console.log(`   📍 ${l}`));

console.log('\n' + '━'.repeat(60));
console.log('2️⃣  isProcessing Assignments');
console.log('━'.repeat(60));
console.log(`   Count: ${RESULTS.isProcessingWrites.count}`);
console.log('   (Should be: module declaration + releaseLock closure)');
RESULTS.isProcessingWrites.lines.forEach(l => console.log(`   📍 ${l}`));

console.log('\n' + '━'.repeat(60));
console.log('3️⃣  DOM Insertion Points');
console.log('━'.repeat(60));

console.log(`   .innerHTML: ${RESULTS.domInserts.innerHTML.length} occurrence(s)`);
RESULTS.domInserts.innerHTML.forEach(l => {
  const isSafe = l.includes("''") || l.includes('""') || l.includes('`');
  const marker = isSafe ? '✅' : '⚠️ REVIEW';
  console.log(`      ${marker} ${l}`);
});

console.log(`   .insertAdjacentHTML: ${RESULTS.domInserts.insertAdjacentHTML.length} occurrence(s)`);
RESULTS.domInserts.insertAdjacentHTML.forEach(l => console.log(`      ⚠️ ${l}`));

console.log(`   .outerHTML: ${RESULTS.domInserts.outerHTML.length} occurrence(s)`);
RESULTS.domInserts.outerHTML.forEach(l => console.log(`      ⚠️ ${l}`));

console.log('\n' + '━'.repeat(60));
console.log('✅ Audit Complete');
console.log('━'.repeat(60));
console.log('Next steps:');
console.log('  • If innerHTML shows "⚠️ REVIEW", inspect manually');
console.log('  • Run: npm test');
console.log('  • Run: node scripts/test_capture_locking.js');
console.log('  • Manual test: rapid capture + engine switching');
