import { describe, it, expect } from "vitest";
import {
  isEvmAddress,
  isSolanaAddress,
  normalizeAddress,
  friendRequestAddressCandidates,
} from "@/utils/address";

describe("isEvmAddress", () => {
  it("recognizes 0x-prefixed strings", () => {
    expect(isEvmAddress("0xAbC123")).toBe(true);
  });

  it("rejects non-0x strings", () => {
    expect(isEvmAddress("abc123")).toBe(false);
  });

  it("handles empty/null", () => {
    expect(isEvmAddress("")).toBe(false);
  });
});

describe("isSolanaAddress", () => {
  it("recognizes valid base58 addresses", () => {
    expect(isSolanaAddress("11111111111111111111111111111111")).toBe(true);
  });

  it("rejects 0x-prefixed", () => {
    expect(isSolanaAddress("0xabc")).toBe(false);
  });

  it("rejects short strings", () => {
    expect(isSolanaAddress("short")).toBe(false);
  });
});

describe("normalizeAddress", () => {
  it("lowercases EVM addresses", () => {
    expect(normalizeAddress("0xAbCdEf1234567890AbCdEf1234567890AbCdEf12")).toBe(
      "0xabcdef1234567890abcdef1234567890abcdef12",
    );
  });

  it("preserves empty strings", () => {
    expect(normalizeAddress("")).toBe("");
  });

  it("strips zero-width characters", () => {
    expect(normalizeAddress("0xABC\u200B")).toBe("0xabc");
  });
});

describe("friendRequestAddressCandidates", () => {
  it("returns empty array for null/undefined", () => {
    expect(friendRequestAddressCandidates(null)).toEqual([]);
    expect(friendRequestAddressCandidates(undefined)).toEqual([]);
  });

  it("includes both raw and normalized EVM forms", () => {
    const candidates = friendRequestAddressCandidates("0xABC");
    expect(candidates).toContain("0xABC");
    expect(candidates).toContain("0xabc");
  });

  it("deduplicates identical entries", () => {
    const candidates = friendRequestAddressCandidates("0xabc");
    const unique = [...new Set(candidates)];
    expect(candidates.length).toBe(unique.length);
  });
});
