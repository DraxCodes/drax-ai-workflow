import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { copilotFiles } from "../tools/lib/copilot.mjs";
import { parseDocument } from "../tools/lib/frontmatter.mjs";
import { fixtureBase, repoRoot, tempDir } from "./helpers.mjs";

function run(script, args, options = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    ...options,
  });
}

function homeEnv(home) {
  return { ...process.env, USERPROFILE: home, HOME: home };
}

test("the generated bridge is valid Agent Skills and custom agents", () => {
  const files = copilotFiles(repoRoot);
  const byDest = new Map(files.map(({ dest, content }) => [dest, content]));

  for (const id of ["start-project", "council", "hillclimb", "grill-me", "handoff"]) {
    assert.ok(byDest.has(`.github/skills/${id}/SKILL.md`), `command skill ${id}`);
  }

  for (const [dest, content] of byDest) {
    if (!dest.startsWith(".github/skills/") || !dest.endsWith("/SKILL.md")) continue;
    const id = dest.split("/")[2];
    const { data } = parseDocument(content);
    assert.equal(data.name, id, dest);
    assert.ok(data.description, `${dest} has a description`);
    assert.doesNotMatch(content, /\$ARGUMENTS/, dest);
    // The generated Copilot preamble must not leak a literal placeholder.
    const preamble = content
      .split("\n")
      .filter((line) => line.startsWith("> "))
      .join("\n");
    assert.doesNotMatch(preamble, /<id>/, dest);
  }

  for (const id of ["plan-architect", "quality-gatekeeper", "security-auditor"]) {
    const dest = `.github/agents/${id}.agent.md`;
    assert.ok(byDest.has(dest), dest);
    const { data } = parseDocument(byDest.get(dest));
    assert.equal(data.name, id);
    assert.match(data.tools, /read/);
    assert.equal(data["user-invocable"], "true");
  }

  // The two gate lenses must be able to run the project's checks.
  assert.match(
    parseDocument(byDest.get(".github/agents/quality-gatekeeper.agent.md")).data.tools,
    /execute/,
  );
  assert.match(
    parseDocument(byDest.get(".github/agents/security-auditor.agent.md")).data.tools,
    /web/,
  );

  const start = byDest.get(".github/skills/start-project/SKILL.md");
  assert.doesNotMatch(start, /agent:\s*task-orchestrator/);
  assert.match(start, /the text the user typed after `\/start-project`/);

  // A command and a skill share an id: the command is the entry point, and the
  // skill's references are still copied for relative links.
  assert.ok(byDest.has(".github/skills/hillclimb/references/hillclimb-rubric.md"));

  // ...and the canonical skill body rides along so nothing is silently lost.
  const council = byDest.get(".github/skills/council/SKILL.md");
  assert.match(council, /## Reference: the `council` skill/);
  assert.match(council, /experience thesis/i);
});

test("new installs the Copilot bridge and doctor validates it", () => {
  const base = fixtureBase();
  const project = tempDir("wb-copilot-");
  const home = tempDir("wb-home-");
  const tool = join(base, "tools", "base.mjs");

  const result = run(
    tool,
    ["new", project, "--from", base, "--project", "demo", "--preset", "web"],
    { env: homeEnv(home) },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);

  assert.ok(existsSync(join(project, ".github", "skills", "council", "SKILL.md")));
  assert.ok(existsSync(join(project, ".github", "agents", "plan-architect.agent.md")));
  assert.match(result.stdout, /check: clean/);
  assert.match(result.stdout, /doctor: no errors/);

  const doctor = run(tool, ["doctor", project, "--home", home], { env: homeEnv(home) });
  assert.equal(doctor.status, 0, doctor.stdout + doctor.stderr);
  assert.match(doctor.stdout, /copilot: 1 skills/);
  assert.match(doctor.stdout, /copilot: 3 agents/);
});

test("new --no-copilot leaves no .github tree", () => {
  const base = fixtureBase();
  const project = tempDir("wb-copilot-off-");
  const home = tempDir("wb-home-");
  const tool = join(base, "tools", "base.mjs");

  const result = run(
    tool,
    ["new", project, "--from", base, "--preset", "bare", "--no-copilot"],
    { env: homeEnv(home) },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(existsSync(join(project, ".github")), false);

  const doctor = run(tool, ["doctor", project, "--home", home], { env: homeEnv(home) });
  assert.match(doctor.stdout, /copilot: bridge not installed/);
});

test("update --no-copilot removes the generated tree and keeps project files", () => {
  const base = fixtureBase();
  const project = tempDir("wb-copilot-update-");
  const home = tempDir("wb-home-");
  const tool = join(base, "tools", "base.mjs");

  const init = run(tool, ["new", project, "--from", base, "--preset", "web"], {
    env: homeEnv(home),
  });
  assert.equal(init.status, 0, init.stdout + init.stderr);
  assert.ok(existsSync(join(project, ".github", "skills", "council", "SKILL.md")));

  // A project-owned file in `.github/` must survive the bridge removal.
  mkdirSync(join(project, ".github", "workflows"), { recursive: true });
  writeFileSync(join(project, ".github", "workflows", "ci.yml"), "on: push\n");

  const update = run(tool, ["update", project, "--from", base, "--no-copilot"], {
    env: homeEnv(home),
  });
  assert.equal(update.status, 0, update.stdout + update.stderr);
  assert.equal(existsSync(join(project, ".github", "skills")), false);
  assert.equal(existsSync(join(project, ".github", "agents")), false);
  assert.ok(existsSync(join(project, ".github", "workflows", "ci.yml")));

  // With no project-owned `.github/` content, the whole tree goes away.
  const bare = tempDir("wb-copilot-update-bare-");
  const initBare = run(tool, ["new", bare, "--from", base, "--preset", "bare"], {
    env: homeEnv(home),
  });
  assert.equal(initBare.status, 0, initBare.stdout + initBare.stderr);
  const updateBare = run(tool, ["update", bare, "--from", base, "--no-copilot"], {
    env: homeEnv(home),
  });
  assert.equal(updateBare.status, 0, updateBare.stdout + updateBare.stderr);
  assert.equal(existsSync(join(bare, ".github")), false);
});

test("a project-owned .github skill warns without failing the bridge", () => {
  const base = fixtureBase();
  const project = tempDir("wb-copilot-own-");
  const home = tempDir("wb-home-");
  const tool = join(base, "tools", "base.mjs");

  const init = run(tool, ["new", project, "--from", base, "--preset", "web"], {
    env: homeEnv(home),
  });
  assert.equal(init.status, 0, init.stdout + init.stderr);

  const mine = join(project, ".github", "skills", "mine");
  mkdirSync(mine, { recursive: true });
  writeFileSync(
    join(mine, "SKILL.md"),
    "---\nname: mine\ndescription: A project-owned skill.\n---\n\nBody.\n",
  );

  const doctor = run(tool, ["doctor", project, "--home", home], { env: homeEnv(home) });
  assert.equal(doctor.status, 0, doctor.stdout + doctor.stderr);
  assert.match(doctor.stdout, /not owned by the workflow base/);
});

test("doctor rejects a skill whose name does not match its directory", () => {
  const base = fixtureBase();
  const project = tempDir("wb-copilot-bad-");
  const home = tempDir("wb-home-");
  const tool = join(base, "tools", "base.mjs");

  const init = run(tool, ["new", project, "--from", base, "--preset", "web"], {
    env: homeEnv(home),
  });
  assert.equal(init.status, 0, init.stdout + init.stderr);

  const file = join(project, ".github", "skills", "council", "SKILL.md");
  const text = readFileSync(file, "utf8").replace("name: council", "name: Council");
  writeFileSync(file, text);

  const doctor = run(tool, ["doctor", project, "--home", home], { env: homeEnv(home) });
  assert.equal(doctor.status, 1, doctor.stdout + doctor.stderr);
  assert.match(doctor.stdout, /name must be "council"/);
});