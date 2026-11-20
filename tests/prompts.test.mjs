import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers.mjs";

const normalize = (text) => text.replace(/\r\n/g, "\n");

function embeddedPrompt(readme, id) {
  const pattern = new RegExp(
    `<!-- prompt:${id}:begin -->\\s*\`\`\`text\\n([\\s\\S]*?)\`\`\`\\s*<!-- prompt:${id}:end -->`,
  );
  const match = pattern.exec(readme);
  return match ? match[1] : null;
}

test("the README prompts match their canonical files", () => {
  const readme = normalize(readFileSync(join(repoRoot, "README.md"), "utf8"));
  const prompts = [
    ["new-project", "new-project.md"],
    ["update-project", "update-project.md"],
  ];
  for (const [id, file] of prompts) {
    const canonical = normalize(
      readFileSync(join(repoRoot, "templates", "prompts", file), "utf8"),
    );
    const embedded = embeddedPrompt(readme, id);
    assert.ok(embedded, `README carries a ${id} prompt block`);
    assert.equal(
      embedded.trim(),
      canonical.trim(),
      `${id} drifted from templates/prompts/${file}`,
    );
  }
});

test("the update prompt keeps its safety and requirement steps", () => {
  const prompt = normalize(
    readFileSync(join(repoRoot, "templates", "prompts", "update-project.md"), "utf8"),
  );
  assert.match(prompt, /node <base>\/tools\/base\.mjs update \. --from <base> --check/);
  assert.match(prompt, /node \.opencode\/tools\/base\.mjs update \. --from <base>/);
  assert.match(prompt, /--force/);
  assert.match(prompt, /requirements \./);
  assert.match(prompt, /assign later/);
  assert.match(prompt, /restart the session/);
  assert.match(prompt, /Do not commit anything I have not seen/);
});