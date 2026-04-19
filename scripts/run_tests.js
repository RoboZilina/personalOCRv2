const { spawnSync } = require('child_process');
const path = require('path');

function runViaNode(modulePath, extraArgs = []) {
  return spawnSync(process.execPath, [modulePath, ...extraArgs], { stdio: 'inherit', shell: false });
}

const extraArgs = process.argv.slice(2);

let jestPath = null;
try {
  jestPath = require.resolve('jest/bin/jest');
} catch {
  jestPath = null;
}

if (jestPath) {
  const result = runViaNode(jestPath, extraArgs);
  if (result.error) {
    console.error('[TEST] Failed to run Jest:', result.error.message);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

console.warn('[TEST] Jest is not installed in this environment. Falling back to engine smoke tests.');
const progressScript = path.join(__dirname, 'test_engine_progress_updates.js');
const selectorScript = path.join(__dirname, 'test_engine_selector.js');

const progressResult = runViaNode(progressScript);
if (progressResult.error || progressResult.status !== 0) {
  if (progressResult.error) {
    console.error('[TEST] Failed to run fallback progress tests:', progressResult.error.message);
  }
  process.exit(progressResult.status ?? 1);
}

const fallback = runViaNode(selectorScript);
if (fallback.error) {
  console.error('[TEST] Failed to run fallback selector tests:', fallback.error.message);
  process.exit(1);
}
process.exit(fallback.status ?? 1);
