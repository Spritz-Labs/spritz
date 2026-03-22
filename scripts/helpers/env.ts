import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(): Record<string, string> {
    const envPath = resolve(__dirname, "..", ".env");
    const raw = readFileSync(envPath, "utf-8");
    const vars: Record<string, string> = {};
    for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx === -1) continue;
        vars[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
    return vars;
}

const raw = loadEnv();

export const env = {
    BASE_URL: raw.BASE_URL || "https://app.spritz.chat",
    SESSION_SECRET: raw.SESSION_SECRET || "",
    TEST_WALLET_PRIVATE_KEY: raw.TEST_WALLET_PRIVATE_KEY || "",
    TEST_WALLET_ADDRESS: raw.TEST_WALLET_ADDRESS || "",
    TEST_EMAIL_ADDRESS: raw.TEST_EMAIL_ADDRESS || "",
    TEST_PASSKEY_ADDRESS: raw.TEST_PASSKEY_ADDRESS || "",
    TEST_API_KEY: raw.TEST_API_KEY || "",
    SUPABASE_URL: raw.SUPABASE_URL || "",
    SUPABASE_ANON_KEY: raw.SUPABASE_ANON_KEY || "",
};
