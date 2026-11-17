import { test } from "node:test";
import assert from "node:assert/strict";
import { hashFile, normalizeText, sha256 } from "../tools/lib/hash.mjs";

test("normalizeText folds CRLF and strips a BOM", () => {
  assert.equal(normalizeText("\uFEFFa\r\nb\r\n"), "a\nb\n");
});

test("sha256 is stable across line endings", () => {
  assert.equal(sha256("a\r\nb\r\n"), sha256("a\nb\n"));
});

test("sha256 distinguishes content", () => {
  assert.notEqual(sha256("a"), sha256("b"));
});