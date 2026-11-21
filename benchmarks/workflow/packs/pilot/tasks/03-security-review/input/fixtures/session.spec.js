import { test } from "node:test";
import assert from "node:assert/strict";
import { canDeleteUser } from "../session.js";

test("an admin can delete another user", () => {
  assert.equal(canDeleteUser({ user: { id: "a", role: "admin" } }, "b"), true);
});

test("a user can delete themselves", () => {
  assert.equal(canDeleteUser({ user: { id: "a", role: "member" } }, "a"), true);
});