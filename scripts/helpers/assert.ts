let passed = 0;
let failed = 0;
let currentSuite = "";

export function suite(name: string) {
    currentSuite = name;
    console.log(`\n--- ${name} ---`);
}

export function assert(condition: boolean, label: string) {
    if (condition) {
        passed++;
        console.log(`  PASS  ${label}`);
    } else {
        failed++;
        console.error(`  FAIL  ${label}`);
    }
}

export function assertEqual<T>(actual: T, expected: T, label: string) {
    assert(actual === expected, `${label} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
}

export function assertIncludes(haystack: string, needle: string, label: string) {
    assert(haystack.includes(needle), `${label} (expected to include "${needle}")`);
}

export function assertStatus(actual: number, expected: number, label: string) {
    assertEqual(actual, expected, `${label} [HTTP ${actual}]`);
}

export function summary(): { passed: number; failed: number } {
    console.log(`\n========================================`);
    console.log(`  ${passed + failed} tests | ${passed} passed | ${failed} failed`);
    console.log(`========================================\n`);
    return { passed, failed };
}

export function resetCounters() {
    passed = 0;
    failed = 0;
}
