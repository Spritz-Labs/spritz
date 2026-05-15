import { describe, it, expect, beforeEach } from "vitest";
import {
  authStorage,
  AUTH_CREDENTIALS_KEY,
  AUTH_TTL,
  type AuthCredentials,
} from "@/lib/authStorage";

const VALID_CREDS: AuthCredentials = {
  address: "0x1234567890abcdef1234567890abcdef12345678",
  signature: "0xdeadbeef",
  message: "Sign in to Spritz",
  timestamp: Date.now(),
  chain: "evm",
};

beforeEach(() => {
  localStorage.clear();
});

describe("AuthStorage", () => {
  it("saves and loads credentials via localStorage", async () => {
    await authStorage.save(AUTH_CREDENTIALS_KEY, VALID_CREDS);
    const loaded = await authStorage.load(AUTH_CREDENTIALS_KEY);
    expect(loaded).toMatchObject({
      address: VALID_CREDS.address,
      signature: VALID_CREDS.signature,
    });
  });

  it("returns null for missing key", async () => {
    const loaded = await authStorage.load("nonexistent_key");
    expect(loaded).toBeNull();
  });

  it("removes credentials", async () => {
    await authStorage.save(AUTH_CREDENTIALS_KEY, VALID_CREDS);
    await authStorage.remove(AUTH_CREDENTIALS_KEY);
    const loaded = await authStorage.load(AUTH_CREDENTIALS_KEY);
    expect(loaded).toBeNull();
  });

  it("detects expired credentials", () => {
    const expired: AuthCredentials = {
      ...VALID_CREDS,
      timestamp: Date.now() - AUTH_TTL - 1000,
    };
    expect(authStorage.isExpired(expired, AUTH_TTL)).toBe(true);
  });

  it("detects non-expired credentials", () => {
    expect(authStorage.isExpired(VALID_CREDS, AUTH_TTL)).toBe(false);
  });

  it("rejects invalid credential shapes", async () => {
    localStorage.setItem(AUTH_CREDENTIALS_KEY, JSON.stringify({ bad: true }));
    const loaded = await authStorage.load(AUTH_CREDENTIALS_KEY);
    expect(loaded).toBeNull();
  });

  it("refreshes timestamp on existing credentials", async () => {
    const oldCreds: AuthCredentials = {
      ...VALID_CREDS,
      timestamp: Date.now() - 60_000,
    };
    await authStorage.save(AUTH_CREDENTIALS_KEY, oldCreds);
    await authStorage.refreshTimestamp(AUTH_CREDENTIALS_KEY);
    const loaded = await authStorage.load(AUTH_CREDENTIALS_KEY);
    expect(loaded!.timestamp).toBeGreaterThan(oldCreds.timestamp);
  });
});
