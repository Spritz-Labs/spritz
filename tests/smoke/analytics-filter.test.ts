import { describe, it, expect } from "vitest";

const USER_TYPE_FILTERS = [
    {
        id: "wallet",
        label: "Wallet (EOA)",
        walletTypes: ["wallet", "metamask", "walletconnect", "coinbase", "evm"],
    },
    { id: "passkey", label: "Passkey", walletTypes: ["passkey"] },
    { id: "email", label: "Email", walletTypes: ["email"] },
    { id: "solana", label: "Solana", walletTypes: ["solana", "phantom"] },
    { id: "world_id", label: "World ID", walletTypes: ["world_id", "world"] },
    { id: "alien_id", label: "Alien ID", walletTypes: ["alien_id", "alien"] },
];

function buildExcludeParam(excludedIds: string[]): string {
    return excludedIds
        .flatMap((id) => USER_TYPE_FILTERS.find((f) => f.id === id)?.walletTypes ?? [])
        .join(",");
}

describe("Analytics user type filter logic", () => {
    it("returns empty string when no types excluded", () => {
        expect(buildExcludeParam([])).toBe("");
    });

    it("returns correct wallet_types for single exclusion", () => {
        expect(buildExcludeParam(["alien_id"])).toBe("alien_id,alien");
    });

    it("returns correct wallet_types for multiple exclusions", () => {
        const result = buildExcludeParam(["solana", "alien_id"]);
        expect(result).toBe("solana,phantom,alien_id,alien");
    });

    it("handles wallet exclusion with multiple sub-types", () => {
        const result = buildExcludeParam(["wallet"]);
        expect(result).toBe("wallet,metamask,walletconnect,coinbase,evm");
    });

    it("handles all types excluded", () => {
        const result = buildExcludeParam(USER_TYPE_FILTERS.map((f) => f.id));
        expect(result).toContain("wallet");
        expect(result).toContain("passkey");
        expect(result).toContain("solana");
        expect(result).toContain("alien_id");
        expect(result).toContain("world_id");
    });

    it("ignores unknown filter ids gracefully", () => {
        expect(buildExcludeParam(["nonexistent"])).toBe("");
    });

    it("builds valid URL params", () => {
        const param = buildExcludeParam(["alien_id", "world_id"]);
        const url = new URL(`http://localhost/api/admin/analytics?period=7d&exclude=${param}`);
        expect(url.searchParams.get("exclude")).toBe("alien_id,alien,world_id,world");
    });
});
