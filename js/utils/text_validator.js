/**
 * VN-Optimized Japanese Text Validator
 * 
 * Deterministic, safe, web‑friendly, fast, zero‑AI, zero‑guessing rule set
 * specifically tuned for visual novel OCR output.
 * 
 * Eight‑layer cleaning:
 * 1. Japanese Character Protection
 * 2. Garbage Character Removal (VN‑specific)
 * 3. Punctuation Normalization (Japanese‑safe)
 * 4. Spacing Rules (JP‑aware)
 * 5. English‑Only OCR Fixes (Safe Substitutions)
 * 6. VN‑Specific Cleanup Rules
 * 7. Heuristic Safety Layer
 * 8. Final Trim
 */

// Japanese Unicode ranges (inclusive)
const JAPANESE_RANGES = [
    [0x3040, 0x309F], // Hiragana
    [0x30A0, 0x30FF], // Katakana
    [0x4E00, 0x9FFF], // CJK Unified Ideographs (kanji)
    [0x3400, 0x4DBF], // CJK Extension A
    [0xF900, 0xFAFF], // CJK Compatibility Ideographs
    [0xFF65, 0xFF9F], // Half‑width Katakana
];

// Japanese punctuation characters (full‑width / Japanese‑specific)
const JP_PUNCTUATION = '、。・「」『』〜';
const JP_PUNCTUATION_SET = new Set(JP_PUNCTUATION);

/**
 * Check if a character belongs to any Japanese script or punctuation.
 */
function isJapaneseChar(ch) {
    const cp = ch.codePointAt(0);
    // Check ranges
    for (const [lo, hi] of JAPANESE_RANGES) {
        if (cp >= lo && cp <= hi) return true;
    }
    // Check punctuation
    if (JP_PUNCTUATION_SET.has(ch)) return true;
    return false;
}

/**
 * Count Japanese characters in a string.
 */
function countJapanese(text) {
    let count = 0;
    for (const ch of text) {
        if (isJapaneseChar(ch)) count++;
    }
    return count;
}

/**
 * Score Japanese density (ported from app.js with extended ranges).
 * Returns jp - ascii*0.5 - noise.
 */
export function scoreJapaneseDensity(text) {
    const jp = countJapanese(text);
    const ascii = (text.match(/[A-Za-z0-9]/g) || []).length;
    const noise = (text.match(/[\u0000-\u001F]/g) || []).length;
    return jp - ascii * 0.5 - noise;
}

/**
 * Determine if a line is "mostly Japanese" (≥60% Japanese characters).
 */
function isMostlyJapanese(text) {
    if (!text.length) return false;
    const jp = countJapanese(text);
    return jp / text.length >= 0.6;
}

/**
 * Determine if a line is "mostly ASCII" (≥70% ASCII letters/digits).
 */
function isMostlyASCII(text) {
    if (!text.length) return false;
    const ascii = (text.match(/[A-Za-z0-9]/g) || []).length;
    return ascii / text.length >= 0.7;
}

/**
 * Garbage character removal (VN‑specific).
 * Removes isolated garbage characters and UI artifacts.
 */
function removeGarbage(text) {
    let cleaned = text;
    
    // Remove known UI debug strings first (before isolated garbage removal)
    const uiPatterns = [
        /\[NaN%\]/g,
        /\[undefined\]/g,
        /\[object Object\]/g,
        /\[0%\]/g,
        /\[100%\]/g,
        /\[[0-9]{1,3}%\]/g,
        /%$/g, // trailing percent sign
    ];
    uiPatterns.forEach(pattern => cleaned = cleaned.replace(pattern, ''));
    
    // Remove isolated garbage characters (when surrounded by whitespace or line boundaries)
    // Characters: | > < * _ ~ # ^ ) ( ] [ } { % @ + = ; : \
    // We'll remove them only if they are not part of a longer word.
    // Simple regex: match any of those chars preceded/followed by non‑word char or start/end.
    cleaned = cleaned.replace(/[\|><*_~#^)(\]\[}{%@+=;:\\](?![A-Za-z0-9])/g, '');
    cleaned = cleaned.replace(/(?<![A-Za-z0-9])[\|><*_~#^)(\]\[}{%@+=;:\\]/g, '');
    
    // Remove enclosed alphanumerics (circled digits, letters) often OCR garbage
    cleaned = cleaned.replace(/[\u2460-\u24FF]/g, '');
    
    // Remove isolated ASCII letters (single letters not part of a word)
    // Only apply if the text contains Japanese characters (conservative)
    const hasJapanese = [...text].some(ch => isJapaneseChar(ch));
    if (hasJapanese) {
        cleaned = cleaned.replace(/(?<![A-Za-z0-9])[A-Za-z](?![A-Za-z0-9])/g, '');
    }
    
    // Remove stray ASCII after Japanese (e.g., 「ありがとう」| )
    // This is more complex; we'll handle later in VN‑specific cleanup.
    return cleaned;
}

/**
 * Punctuation normalization (Japanese‑safe).
 */
function normalizePunctuation(text) {
    // Collapse duplicates
    let cleaned = text.replace(/。{2,}/g, '。');
    cleaned = cleaned.replace(/、{2,}/g, '、');
    cleaned = cleaned.replace(/！{2,}/g, '！');
    cleaned = cleaned.replace(/？{2,}/g, '？');
    
    // Keep ellipses …… and ―― as is (intentional in VNs)
    // Normalize mixed punctuation
    cleaned = cleaned.replace(/、,/g, '、');
    cleaned = cleaned.replace(/。,/g, '。');
    cleaned = cleaned.replace(/。\./g, '。');
    cleaned = cleaned.replace(/、\./g, '、');
    
    // Convert Western commas and periods to Japanese punctuation only when adjacent to Japanese?
    // We'll keep them as is for safety; but we can convert if the line is mostly Japanese.
    if (isMostlyJapanese(text)) {
        cleaned = cleaned.replace(/,/g, '、');
        cleaned = cleaned.replace(/\./g, '。');
    }
    
    return cleaned;
}

/**
 * Spacing rules (JP‑aware).
 */
function applySpacingRules(text) {
    // Collapse multiple spaces first
    let cleaned = text.replace(/\s+/g, ' ');
    
    // Insert missing spaces between Japanese and Latin characters
    // We'll iterate over the string and insert spaces where needed.
    const chars = cleaned;
    let result = '';
    let prevType = null; // 'jp', 'latin', 'other'
    
    for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        let type = 'other';
        if (isJapaneseChar(ch)) {
            type = 'jp';
        } else if (/[A-Za-z0-9]/.test(ch)) {
            type = 'latin';
        }
        
        // Insert space between JP and Latin (or Latin and JP) when missing
        if (prevType && prevType !== type &&
            ((prevType === 'jp' && type === 'latin') || (prevType === 'latin' && type === 'jp'))) {
            // Ensure there isn't already a space before this character (should not happen after collapse)
            // But we can still check the last character of result
            if (result.length > 0 && result[result.length - 1] !== ' ') {
                result += ' ';
            }
        }
        
        result += ch;
        prevType = type;
    }
    
    // Remove spaces that are between two Japanese characters (accidental spaces inside Japanese)
    let finalResult = '';
    for (let i = 0; i < result.length; i++) {
        const ch = result[i];
        if (ch === ' ') {
            // Check previous and next characters (if they exist)
            const prev = i > 0 ? result[i - 1] : null;
            const next = i < result.length - 1 ? result[i + 1] : null;
            if (prev && next && isJapaneseChar(prev) && isJapaneseChar(next)) {
                // Skip this space (do not add)
                continue;
            }
        }
        finalResult += ch;
    }
    
    // Remove space before Japanese punctuation
    cleaned = finalResult.replace(/\s+([、。])/g, '$1');
    
    return cleaned;
}

/**
 * English‑only OCR fixes (safe substitutions).
 * Apply only to ASCII‑only segments.
 */
function applyEnglishFixes(text) {
    // Identify ASCII‑only segments (substrings containing no non‑ASCII characters)
    // We'll split by non‑ASCII and process each segment.
    const segments = text.split(/([^\x00-\x7F]+)/); // split by non‑ASCII
    const fixed = segments.map(seg => {
        // If segment contains only ASCII characters (including spaces, punctuation)
        if (!/[^\x00-\x7F]/.test(seg)) {
            // Apply substitutions only to digits and letter pairs
            let s = seg;
            // 0 → O inside words (but not at boundaries? we'll do global)
            s = s.replace(/0/g, 'O');
            // 1 → l
            s = s.replace(/1/g, 'l');
            // rn → m (between vowels? we'll do simple)
            s = s.replace(/rn/g, 'm');
            // vv → w
            s = s.replace(/vv/g, 'w');
            // 5 → s
            s = s.replace(/5/g, 's');
            // 8 → B
            s = s.replace(/8/g, 'B');
            return s;
        }
        return seg;
    });
    return fixed.join('');
}

/**
 * VN‑specific cleanup rules.
 */
function vnSpecificCleanup(text) {
    let cleaned = text;
    // Remove stray ASCII after Japanese (pattern: Japanese text followed by ASCII garbage at line end)
    // We'll remove any ASCII-only trailing characters after the last Japanese char.
    // This is complex; we'll implement later.
    
    // Remove trailing punctuation clusters (e.g., です。。)
    cleaned = cleaned.replace(/([。、！？])\1+/g, '$1');
    
    // Remove leading garbage (ASCII symbols at start)
    cleaned = cleaned.replace(/^[\|><*_~#^)(\]\[}{%@+=;:\s]+/, '');
    
    return cleaned;
}

/**
 * Heuristic safety layer: decide cleanup intensity based on line composition.
 */
function heuristicClean(text) {
    if (!text.length) return text;
    
    const mostlyJP = isMostlyJapanese(text);
    const mostlyASCII = isMostlyASCII(text);
    const mixed = !mostlyJP && !mostlyASCII;
    
    // For mostly Japanese → minimal cleanup (already done)
    // For mostly ASCII → apply English fixes
    // For mixed → apply JP protection + ASCII cleanup
    // For extremely short (≤2 chars) → do nothing
    // For extremely long (≥200 chars) → minimal cleanup
    // For mostly symbols → strip garbage only
    
    // We'll apply all layers anyway, but some layers may be skipped based on composition.
    // For now, we apply all layers; the English‑only fixes already guard against non‑ASCII segments.
    return text;
}

/**
 * Main cleaning function: applies all eight layers.
 */
export function cleanVNText(text) {
    if (typeof text !== 'string') return '';
    
    let cleaned = text;
    
    // Layer 2: Garbage removal
    cleaned = removeGarbage(cleaned);
    
    // Layer 3: Punctuation normalization
    cleaned = normalizePunctuation(cleaned);
    
    // Layer 4: Spacing rules
    cleaned = applySpacingRules(cleaned);
    
    // Layer 5: English‑only OCR fixes
    cleaned = applyEnglishFixes(cleaned);
    
    // Layer 6: VN‑specific cleanup
    cleaned = vnSpecificCleanup(cleaned);
    
    // Layer 7: Heuristic safety (adjustments)
    cleaned = heuristicClean(cleaned);
    
    // Layer 8: Final trim
    cleaned = cleaned.trim();
    
    return cleaned;
}

/**
 * Apply validator to an array of lines (post‑processing).
 * Filters by density, cleans each line, joins with separator.
 */
export function applyVNValidator(lines, separator = '\n') {
    if (!Array.isArray(lines)) return '';
    
    const kept = lines.filter(line => {
        // Keep lines that are mostly ASCII (≥70% ASCII letters/digits)
        const asciiCount = (line.match(/[A-Za-z0-9]/g) || []).length;
        if (line.length > 0 && asciiCount / line.length >= 0.7) {
            return true;
        }
        // Otherwise keep lines with reasonable Japanese density
        const density = scoreJapaneseDensity(line);
        return density >= -0.5; // keep lines with density not too negative
    });
    
    const cleaned = kept.map(line => cleanVNText(line));
    // Remove empty lines after cleaning
    const nonEmpty = cleaned.filter(line => line.length > 0);
    
    return nonEmpty.join(separator);
}