import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fixtureBase, tempDir } from "./helpers.mjs";

function run(script, args, options = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    ...options,
  });
}

function homeEnv(home) {
  return { ...process.env, USERPROFILE: home, HOME: home };
}

const PROFILE = {
  opencode: {
    model: "test/seat-model",
    provider: {
      test: {
        npm: "@ai-sdk/openai-compatible",
        options: { baseURL: "https://example.test/v1", apiKey: "{env:TEST_KEY}" },
      },
    },
  },
  agentsMd: "### Seats\n\nChair is test/seat-model.",
};

function writeProfile(file, value = PROFILE) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

test("new --config uses the default bootstrap profile", () => {
  const base = fixtureBase();
  const project = tempDir("wb-profile-");
  const home = tempDir("wb-home-");
  const tool = join(base, "tools", "base.mjs");
  writeProfile(join(home, ".config", "drax", "bootstrap.json"));

  const result = run(
    tool,
    ["new", project, "--from", base, "--project", "demo", "--preset", "web", "--config"],
    { env: homeEnv(home) },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const config = JSON.parse(readFileSync(join(project, "opencode.json"), "utf8"));
  assert.equal(config.$schema, "https://opencode.ai/config.json");
  assert.equal(config.model, "test/seat-model");
  assert.equal(config.provider.test.options.apiKey, "{env:TEST_KEY}");
  assert.equal(JSON.stringify(config).includes("<provider/model>"), false);

  const agents = readFileSync(join(project, "AGENTS.md"), "utf8");
  assert.match(agents, /### Seats/);
  assert.match(agents, /Chair is test\/seat-model\./);
  assert.match(result.stdout, /written from the bootstrap profile/);
  assert.match(result.stdout, /appended the profile's AGENTS\.md section/);
  assert.match(result.stdout, /doctor: no errors/);
});

test("new --config --no-profile writes placeholders", () => {
  const base = fixtureBase();
  const project = tempDir("wb-profile-off-");
  const home = tempDir("wb-home-");
  const tool = join(base, "tools", "base.mjs");
  writeProfile(join(home, ".config", "drax", "bootstrap.json"));

  const result = run(
    tool,
    [
      "new",
      project,
      "--from",
      base,
      "--preset",
      "bare",
      "--config",
      "--no-profile",
    ],
    { env: homeEnv(home) },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const config = JSON.parse(readFileSync(join(project, "opencode.json"), "utf8"));
  assert.equal(config.model, "<provider/model>");
  const agents = readFileSync(join(project, "AGENTS.md"), "utf8");
  assert.equal(agents.includes("### Seats"), false);
  assert.match(result.stdout, /fill the <provider\/model> placeholders/);
});

test("new --config --profile uses an explicit file", () => {
  const base = fixtureBase();
  const project = tempDir("wb-profile-explicit-");
  const home = tempDir("wb-home-");
  const tool = join(base, "tools", "base.mjs");
  const file = join(tempDir("wb-profile-file-"), "profile.json");
  writeProfile(file, { opencode: { model: "other/model" } });

  const result = run(
    tool,
    ["new", project, "--from", base, "--preset", "bare", "--config", "--profile", file],
    { env: homeEnv(home) },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const config = JSON.parse(readFileSync(join(project, "opencode.json"), "utf8"));
  assert.equal(config.model, "other/model");
});

test("new rejects a literal API key in the profile", () => {
  const base = fixtureBase();
  const project = tempDir("wb-profile-secret-");
  const home = tempDir("wb-home-");
  const tool = join(base, "tools", "base.mjs");
  writeProfile(join(home, ".config", "drax", "bootstrap.json"), {
    opencode: { provider: { test: { options: { apiKey: "sk-live-not-a-reference" } } } },
  });

  const result = run(
    tool,
    ["new", project, "--from", base, "--preset", "bare", "--config"],
    { env: homeEnv(home) },
  );
  assert.equal(result.status, 2);
  assert.match(result.stdout, /literal secret/);
  assert.equal(existsSync(join(project, ".opencode")), false);
});

test("new rejects a made-up reference shape", () => {
  const base = fixtureBase();
  const project = tempDir("wb-profile-fakeref-");
  const home = tempDir("wb-home-");
  const tool = join(base, "tools", "base.mjs");
  writeProfile(join(home, ".config", "drax", "bootstrap.json"), {
    opencode: {
      provider: {
        test: { options: { apiKey: "{literal:myOpaqueBearerToken9f8e7d6c5b4a3b2c1d0e}" } },
      },
    },
  });

  const result = run(
    tool,
    ["new", project, "--from", base, "--preset", "bare", "--config"],
    { env: homeEnv(home) },
  );
  assert.equal(result.status, 2);
  assert.match(result.stdout, /literal secret/);
  assert.equal(existsSync(join(project, "opencode.json")), false);
});

test("new rejects a literal secret under a token-shaped key", () => {
  const base = fixtureBase();
  const project = tempDir("wb-profile-token-");
  const home = tempDir("wb-home-");
  const tool = join(base, "tools", "base.mjs");
  writeProfile(join(home, ".config", "drax", "bootstrap.json"), {
    opencode: {
      provider: {
        test: { options: { token: "myOpaqueBearerToken9f8e7d6c5b4a3b2c1d0e" } },
      },
    },
  });

  const result = run(
    tool,
    ["new", project, "--from", base, "--preset", "bare", "--config"],
    { env: homeEnv(home) },
  );
  assert.equal(result.status, 2);
  assert.match(result.stdout, /literal secret/);
  assert.equal(existsSync(join(project, "opencode.json")), false);
});

test("new rejects a placeholder-shaped credential", () => {
  const base = fixtureBase();
  const project = tempDir("wb-profile-angle-");
  const home = tempDir("wb-home-");
  const tool = join(base, "tools", "base.mjs");
  writeProfile(join(home, ".config", "drax", "bootstrap.json"), {
    opencode: {
      provider: {
        test: { options: { apiKey: "<myOpaqueBearerToken9f8e7d6c5b4a3b2c1d0e>" } },
      },
    },
  });

  const result = run(
    tool,
    ["new", project, "--from", base, "--preset", "bare", "--config"],
    { env: homeEnv(home) },
  );
  assert.equal(result.status, 2);
  assert.match(result.stdout, /literal secret/);
  assert.equal(existsSync(join(project, "opencode.json")), false);
});

test("new rejects literal secrets under key and Bearer names", () => {
  const base = fixtureBase();
  const tool = join(base, "tools", "base.mjs");
  const cases = [
    { key: "key", value: "myOpaqueBearerToken9f8e7d6c5b4a3b2c1d0e" },
    { key: "Bearer", value: "myOpaqueBearerToken9f8e7d6c5b4a3b2c1d0e" },
  ];

  for (const { key, value } of cases) {
    const project = tempDir("wb-profile-alias-");
    const home = tempDir("wb-home-");
    writeProfile(join(home, ".config", "drax", "bootstrap.json"), {
      opencode: { provider: { test: { options: { [key]: value } } } },
    });

    const result = run(
      tool,
      ["new", project, "--from", base, "--preset", "bare", "--config"],
      { env: homeEnv(home) },
    );
    assert.equal(result.status, 2, `${key}: ${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /literal secret/);
    assert.equal(existsSync(join(project, "opencode.json")), false);
  }
});

test("new accepts env and file references", () => {
  const base = fixtureBase();
  const project = tempDir("wb-profile-refs-");
  const home = tempDir("wb-home-");
  const tool = join(base, "tools", "base.mjs");
  writeProfile(join(home, ".config", "drax", "bootstrap.json"), {
    opencode: {
      provider: {
        test: {
          options: { apiKey: "{env:TEST_KEY}", token: "{file:./token.txt}" },
        },
      },
    },
  });

  const result = run(
    tool,
    ["new", project, "--from", base, "--preset", "bare", "--config"],
    { env: homeEnv(home) },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const config = JSON.parse(readFileSync(join(project, "opencode.json"), "utf8"));
  assert.equal(config.provider.test.options.apiKey, "{env:TEST_KEY}");
  assert.equal(config.provider.test.options.token, "{file:./token.txt}");
});

test("new rejects a missing explicit profile", () => {
  const base = fixtureBase();
  const project = tempDir("wb-profile-missing-");
  const tool = join(base, "tools", "base.mjs");

  const result = run(
    tool,
    [
      "new",
      project,
      "--from",
      base,
      "--preset",
      "bare",
      "--config",
      "--profile",
      join(tempDir("wb-nowhere-"), "missing.json"),
    ],
    { env: homeEnv(tempDir("wb-home-")) },
  );
  assert.equal(result.status, 2);
  assert.match(result.stdout, /does not exist/);
});

test("new rejects --profile without --config", () => {
  const base = fixtureBase();
  const project = tempDir("wb-profile-noconfig-");
  const tool = join(base, "tools", "base.mjs");

  const result = run(
    tool,
    ["new", project, "--from", base, "--preset", "bare", "--no-profile"],
    { env: homeEnv(tempDir("wb-home-")) },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /only apply with --config/);
});