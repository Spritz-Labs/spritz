import assert from "node:assert/strict";
import { test } from "node:test";

import { getRegistrationStatusInfo } from "./settings.ts";

test("getRegistrationStatusInfo maps registered status", () => {
  const info = getRegistrationStatusInfo("registered", null);

  assert.equal(info.status, "registered");
  assert.equal(info.label, "Registered");
  assert.equal(info.tone, "success");
  assert.ok(info.description.length > 0);
});

test("getRegistrationStatusInfo maps pending status", () => {
  const info = getRegistrationStatusInfo("pending", null);

  assert.equal(info.status, "pending");
  assert.equal(info.label, "Pending");
  assert.equal(info.tone, "warning");
});

test("getRegistrationStatusInfo maps failed status with error", () => {
  const info = getRegistrationStatusInfo("failed", "Timeout");

  assert.equal(info.status, "failed");
  assert.equal(info.label, "Failed");
  assert.equal(info.tone, "error");
  assert.equal(info.description, "Timeout");
  assert.ok(info.retryHint);
});

test("getRegistrationStatusInfo maps failed status without error", () => {
  const info = getRegistrationStatusInfo("failed", null);

  assert.equal(info.status, "failed");
  assert.equal(info.label, "Failed");
  assert.equal(info.description, "Registration failed.");
  assert.ok(info.retryHint);
});

test("getRegistrationStatusInfo maps null status to unknown", () => {
  const info = getRegistrationStatusInfo(null, null);

  assert.equal(info.status, "unknown");
  assert.equal(info.label, "Not registered");
  assert.equal(info.tone, "neutral");
});
