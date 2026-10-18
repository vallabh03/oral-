import assert from "node:assert/strict";
import { test } from "node:test";
import { isBootstrapAdmin, isBootstrapEmail } from "../lib/admin-emails";

test("additional administrators work without a primary administrator", () => {
  const emails = "first@example.com, second@example.com";
  assert.equal(isBootstrapAdmin("first@example.com", undefined, emails), true);
  assert.equal(isBootstrapAdmin("SECOND@example.com", undefined, emails), true);
  assert.equal(isBootstrapAdmin("other@example.com", undefined, emails), false);
  assert.equal(isBootstrapAdmin("first@example.com.attacker.com", undefined, emails), false);
});
test("missing configuration fails closed and primary configuration still works", () => {
  assert.equal(isBootstrapAdmin("first@example.com"), false);
  assert.equal(isBootstrapAdmin("", undefined, " , "), false);
  assert.equal(isBootstrapAdmin("first@example.com", " first@example.com "), true);
});

test("Doctor Admin bootstrap lists match only complete email addresses", () => {
  assert.equal(isBootstrapEmail("doctor@example.com", "doctor@example.com"), true);
  assert.equal(isBootstrapEmail("doctor@example.com.attacker", "doctor@example.com"), false);
});
