const fs = require('fs');
const path = require('path');

const IGNORE_PATTERNS = [
    /\.min\.js$/,
    /^ort.*\.js$/,
    /^tesseract.*\.js$/,
    /^wasm.*\.js$/
];

const TARGET_FILES = [
    'app.v38.js',
    'settings.js',
    'service-worker.js'
];

const TARGET_DIRS = ['js'];

function shouldIgnore(fileName) {
    return IGNORE_PATTERNS.some(pattern => pattern.test(fileName));
}

function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function(file) {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
        } else {
            if (file.endsWith('.js') && !shouldIgnore(file)) {
                arrayOfFiles.push(fullPath);
            }
        }
    });

    return arrayOfFiles;
}

let filesToAudit = [];
TARGET_FILES.forEach(f => {
    if (fs.existsSync(f)) filesToAudit.push(f);
});

TARGET_DIRS.forEach(dir => {
    if (fs.existsSync(dir)) {
        filesToAudit = getAllFiles(dir, filesToAudit);
    }
});

console.log(`[AUDIT:BRACES] Scanning ${filesToAudit.length} files...`);

let overallFail = false;

filesToAudit.forEach(filePath => {
    const content = fs.readFileSync(filePath, 'utf8');
    let balance = 0;
    let lineNum = 0;
    let failed = false;
    
    const lines = content.split('\n');
    for (let line of lines) {
        lineNum++;
        for (let char of line) {
            if (char === '{') balance++;
            if (char === '}') balance--;
            
            if (balance < 0) {
                console.error(`❌ FAIL: [${filePath}] Negative depth at line ${lineNum}`);
                failed = true;
                break;
            }
        }
        if (failed) break;
    }
    
    if (!failed && balance !== 0) {
        console.error(`❌ FAIL: [${filePath}] Unbalanced at EOF (balance: ${balance})`);
        failed = true;
    }
    
    if (failed) {
        overallFail = true;
    } else {
        console.log(`✅ PASS: [${filePath}]`);
    }
});

if (overallFail) {
    console.error("\n🔴 Audit Result: FAIL");
    process.exit(1);
} else {
    console.log("\n🟢 Audit Result: SUCCESS");
    process.exit(0);
}
