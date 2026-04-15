/**
 * scripts/test_settings.js
 * Unit test for boolean normalization logic.
 */

function normalizeBoolean(val, defaultValue) {
    if (val === undefined || val === null) return defaultValue;
    if (val === "") return defaultValue;
    return String(val) !== 'false' && !!val;
}

const tests = [
    { input: undefined, default: true, expected: true },
    { input: undefined, default: false, expected: false },
    { input: true, default: false, expected: true },
    { input: false, default: true, expected: false },
    { input: "true", default: false, expected: true },
    { input: "false", default: true, expected: false },
    { input: 1, default: false, expected: true },
    { input: 0, default: true, expected: false },
    { input: "", default: true, expected: true },
    { input: null, default: true, expected: true }
];

console.log("--- Starting Boolean Normalization Tests ---");
let passCount = 0;
tests.forEach((t, i) => {
    const result = normalizeBoolean(t.input, t.default);
    const passed = result === t.expected;
    if (passed) {
        console.log(`✅ Test ${i + 1}: Input (${t.input}), Default (${t.default}) => Expected (${t.expected})`);
        passCount++;
    } else {
        console.error(`❌ Test ${i + 1}: Input (${t.input}), Default (${t.default}) => FAILED. Got (${result}), Expected (${t.expected})`);
    }
});

console.log("---------------------------------------------");
console.log(`Summary: ${passCount}/${tests.length} tests PASSED.`);

if (passCount === tests.length) {
    process.exit(0);
} else {
    process.exit(1);
}
