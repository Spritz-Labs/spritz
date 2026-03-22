import { execSync } from "child_process";
import { readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const testsDir = resolve(__dirname, "tests");

const files = readdirSync(testsDir)
    .filter((f) => f.endsWith(".ts"))
    .sort();

console.log(`\n====== Spritz E2E Test Suite ======`);
console.log(`Running ${files.length} test files...\n`);

let totalPassed = 0;
let totalFailed = 0;

for (const file of files) {
    const label = file.replace(".ts", "");
    console.log(`\n>>>>>> ${label} <<<<<<`);
    const start = Date.now();
    try {
        execSync(`npx tsx tests/${file}`, {
            cwd: __dirname,
            stdio: "inherit",
            timeout: 60_000,
        });
        totalPassed++;
    } catch {
        totalFailed++;
        console.error(`  *** ${label} had failures ***`);
    }
    console.log(`  (${Date.now() - start}ms)`);
}

console.log(`\n====== FINAL RESULTS ======`);
console.log(`  ${files.length} suites | ${totalPassed} passed | ${totalFailed} failed`);
console.log(`===========================\n`);

process.exit(totalFailed > 0 ? 1 : 0);
