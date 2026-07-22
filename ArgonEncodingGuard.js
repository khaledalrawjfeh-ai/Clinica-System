/**
 * ARGON MEDICAL OS — Encoding Guard
 * 
 * ⚠️ STRICT PERMANENT PROTECTION (PHASE 3) ⚠️
 * Prevents corrupted Arabic Encoding (Mojibake) from being committed or deployed.
 * Run this script as a pre-commit hook or CI check.
 */

const fs = require('fs');
const path = require('path');

const MOJIBAKE_PATTERNS = [
    'ط§', 'ط¹', 'ظ…', 'ظٹ', 'Ø', 'Ù', 'Ã', 'Â'
];

function scanDirectory(dir) {
    let hasViolation = false;
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (!fullPath.includes('node_modules') && !fullPath.includes('.git')) {
                if (scanDirectory(fullPath)) hasViolation = true;
            }
        } else {
            if (/\.(js|html|json|csv|md)$/.test(file)) {
                if (checkFile(fullPath)) hasViolation = true;
            }
        }
    }
    return hasViolation;
}

function checkFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            for (const pattern of MOJIBAKE_PATTERNS) {
                if (lines[i].includes(pattern)) {
                    console.error(`\n❌ [Arabic Encoding Violation]`);
                    console.error(`File: ${filePath}`);
                    console.error(`Line: ${i + 1}`);
                    console.error(`Pattern Detected: ${pattern}`);
                    console.error(`Text: ${lines[i].trim().substring(0, 80)}...`);
                    return true;
                }
            }
        }
    } catch (e) {
        console.error(`Could not read file ${filePath}: ${e.message}`);
    }
    return false;
}

console.log('🛡️ Argon Encoding Guard: Scanning workspace for Mojibake...');
const startDir = process.argv[2] || __dirname;

if (scanDirectory(startDir)) {
    console.error('\n🛑 ACTION REQUIRED: Mojibake detected. Commit/Deploy halted.');
    process.exit(1);
} else {
    console.log('✅ All files are clean. Arabic UTF-8 Encoding is verified.');
    process.exit(0);
}
