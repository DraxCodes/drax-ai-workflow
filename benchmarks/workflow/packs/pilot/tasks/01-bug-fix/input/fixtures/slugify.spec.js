import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify } from "../src/slugify.js";

test("collapses separators", () => {
  assert.equal(slugify("Hello, World!"), "hello-world");
});

test("trims both ends", () => {
  assert.equal(slugify("  Hello, World!  "), "hello-world");
});

test("keeps digits", () => {
  assert.equal(slugify("Version 2 is live"), "version-2-is-live");
});