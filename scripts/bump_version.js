const fs = require('fs');
const path = require('path');

const nextVersion = process.argv[2];

if (!nextVersion || !/^\d+\.\d+\.\d+$/.test(nextVersion)) {
  console.error('Usage: node scripts/bump_version.js <x.y.z>');
  process.exit(1);
}

const rootDir = path.resolve(__dirname, '..');
const targetFiles = [
  'app.js',
  'index.html',
  'service-worker.js',
  'js/core/engine_manager.js',
  'js/manga/manga_engine.js',
  'js/manga/manga_preload_worker.js',
  'js/paddle/paddle_core.js',
  'js/paddle/paddle_engine.js',
  'js/paddle/paddle_preload_worker.js',
  'js/ui/ui_controller.js'
];

function updateContent(content) {
  let updated = content;

  updated = updated.replace(/\?v=\d+\.\d+\.\d+/g, `?v=${nextVersion}`);
  updated = updated.replace(
    /window\.VNOCR_BUILD\s*=\s*["'][^"']+["'];/,
    `window.VNOCR_BUILD = "${nextVersion}";`
  );
  updated = updated.replace(
    /(const\s+CACHE_NAME\s*=\s*'personalocr-v)\d+\.\d+\.\d+(-gold-patch\d+';)/,
    `$1${nextVersion}$2`
  );

  return updated;
}

let changedCount = 0;

for (const relPath of targetFiles) {
  const fullPath = path.join(rootDir, relPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`[bump_version] Missing file: ${relPath}`);
    process.exit(1);
  }

  const before = fs.readFileSync(fullPath, 'utf8');
  const after = updateContent(before);

  if (before !== after) {
    fs.writeFileSync(fullPath, after, 'utf8');
    changedCount += 1;
    console.log(`[bump_version] Updated ${relPath}`);
  }
}

if (changedCount === 0) {
  console.log(`[bump_version] No updates needed (already at ${nextVersion}).`);
} else {
  console.log(`[bump_version] Done. Updated ${changedCount} file(s) to ${nextVersion}.`);
}
