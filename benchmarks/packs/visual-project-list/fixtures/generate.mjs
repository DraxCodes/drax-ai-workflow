#!/usr/bin/env node
/**
 * Regenerate the screenshots for the visual project-list pack.
 *
 * The images and keys are committed; this script is the reproducible source.
 * It uses a local Chrome/Edge headless binary. Set CHROME_PATH if neither
 * default exists. Run from the repository root:
 *
 *   node benchmarks/packs/visual-project-list/fixtures/generate.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packDir = resolve(here, "..");
const fixture = join(here, "index.html");
const chrome =
  process.env.CHROME_PATH ??
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find((candidate) => existsSync(candidate));

if (!chrome) {
  console.error("generate: set CHROME_PATH to a Chrome or Edge binary");
  process.exit(1);
}

const SHOTS = [
  { id: "375-light", width: 375, theme: "light" },
  { id: "900-light", width: 900, theme: "light" },
  { id: "375-dark", width: 375, theme: "dark" },
  { id: "900-dark", width: 900, theme: "dark" },
];

const tasks = [
  {
    id: "02-empty-state",
    screen: "empty",
    title: "Empty project list",
    brief: `# Visual brief — empty project list

The project list is empty. The empty state has a heading, body copy and a
Create project button, centred in the panel. Labels and copy meet 4.5:1
contrast. The button label is fully visible at 375 and 900. The heading is
visually stronger than the body copy.

Judge only what is visible: spacing, alignment, hierarchy, contrast, truncation,
overlap, wrapping and clipping. Report findings; do not score or speculate about
code.`,
    defects: [
      {
        prefix: "E1",
        region: "empty state copy",
        severity: "major",
        summary: "the empty-state copy is below 4.5:1 contrast",
      },
      {
        prefix: "E2",
        region: "create project button",
        severity: "major",
        summary: "the Create project button label is clipped at 375",
        shots: ["375-light", "375-dark"],
      },
      {
        prefix: "E3",
        region: "empty state card",
        severity: "minor",
        summary: "the empty-state card is off-centre at 375",
        shots: ["375-light", "375-dark"],
      },
      {
        prefix: "E4",
        region: "empty state heading",
        severity: "minor",
        summary: "the empty-state heading is the same size as the body text",
      },
    ],
  },
  {
    id: "03-loading-state",
    screen: "loading",
    title: "Project list loading",
    brief: `# Visual brief — loading project list

The project list is loading. A spinner and a Loading projects label sit above
three skeleton rows. The label meets 4.5:1 contrast. The spinner does not
overlap the label. The skeleton rows have consistent widths and heights.

Judge only what is visible: spacing, alignment, hierarchy, contrast, truncation,
overlap, wrapping and clipping. Report findings; do not score or speculate about
code.`,
    defects: [
      {
        prefix: "L1",
        region: "loading spinner",
        severity: "major",
        summary: "the spinner overlaps the loading text",
      },
      {
        prefix: "L2",
        region: "second skeleton row",
        severity: "minor",
        summary: "the second skeleton copy bar is much shorter than the others",
      },
      {
        prefix: "L3",
        region: "loading text",
        severity: "major",
        summary: "the loading text is below 4.5:1 contrast",
      },
    ],
  },
  {
    id: "04-error-state",
    screen: "error",
    title: "Project page error",
    brief: `# Visual brief — project page error

The project page failed. The error state has a message, a raw error code, a
Retry button and a Back to projects button. The message meets 4.5:1 contrast.
The raw error code is not shown to the user. The two actions align on one
baseline.

Judge only what is visible: spacing, alignment, hierarchy, contrast, truncation,
overlap, wrapping and clipping. Report findings; do not score or speculate about
code.`,
    defects: [
      {
        prefix: "X1",
        region: "error code",
        severity: "major",
        summary: "the raw SQLITE_BUSY error code is exposed",
      },
      {
        prefix: "X2",
        region: "error message",
        severity: "major",
        summary: "the error message is below 4.5:1 contrast",
      },
      {
        prefix: "X3",
        region: "error buttons",
        severity: "minor",
        summary: "the Retry and Back to projects buttons do not share a baseline",
      },
    ],
  },
  {
    id: "05-settings-form",
    screen: "settings",
    title: "Settings form",
    brief: `# Visual brief — settings form

The form has a Site title field, an Accent colour control with a swatch, a
helper line and a Save changes button. Each label sits directly above its
input. The accent control and swatch fit at 375 and 900. The disabled Save
button remains readable. The helper text meets 4.5:1 contrast.

Judge only what is visible: spacing, alignment, hierarchy, contrast, truncation,
overlap, wrapping and clipping. Report findings; do not score or speculate about
code.`,
    defects: [
      {
        prefix: "S1",
        region: "site title field",
        severity: "minor",
        summary: "the Site title label is separated from its input",
      },
      {
        prefix: "S2",
        region: "accent color control",
        severity: "major",
        summary: "the accent swatch overflows the control at 375",
        shots: ["375-light", "375-dark"],
      },
      {
        prefix: "S3",
        region: "save button",
        severity: "major",
        summary: "the disabled Save changes button is below 4.5:1 contrast",
      },
      {
        prefix: "S4",
        region: "helper text",
        severity: "minor",
        summary: "the accent helper text is below 4.5:1 contrast",
      },
    ],
  },
  {
    id: "06-test-results-table",
    screen: "table",
    title: "Test results table",
    brief: `# Visual brief — test results table

The table has Test, Status, Duration and When columns. Duration is numeric and
right-aligned. Status has a text label, not colour alone. The header and body
columns align. A long test name is not clipped at 375.

Judge only what is visible: spacing, alignment, hierarchy, contrast, truncation,
overlap, wrapping and clipping. Report findings; do not score or speculate about
code.`,
    defects: [
      {
        prefix: "T1",
        region: "duration column",
        severity: "minor",
        summary: "the Duration numbers are left-aligned instead of right-aligned",
      },
      {
        prefix: "T2",
        region: "row 1 test name",
        severity: "major",
        summary: "the first test name is clipped without an ellipsis at 375",
        shots: ["375-light", "375-dark"],
      },
      {
        prefix: "T3",
        region: "status column",
        severity: "blocker",
        summary: "status is shown by colour alone, with no text or icon",
      },
      {
        prefix: "T4",
        region: "when column",
        severity: "minor",
        summary: "the When values wrap onto two lines at 375",
        shots: ["375-light", "375-dark"],
      },
    ],
  },
  {
    id: "07-mobile-nav",
    screen: "nav",
    title: "Mobile navigation",
    brief: `# Visual brief — mobile navigation

The page header has a Menu button. The menu lists Overview, Projects, Runs and
Settings. The current page is marked. Menu items are at least 44px high. The
menu panel is visually separate from the page. The Menu button does not overlap
the title at 375.

Judge only what is visible: spacing, alignment, hierarchy, contrast, truncation,
overlap, wrapping and clipping. Report findings; do not score or speculate about
code.`,
    defects: [
      {
        prefix: "N1",
        region: "mobile header",
        severity: "major",
        summary: "the Menu button overlaps the page title at 375",
        shots: ["375-light", "375-dark"],
      },
      {
        prefix: "N2",
        region: "menu items",
        severity: "major",
        summary: "the menu items are only 24px high",
      },
      {
        prefix: "N3",
        region: "active menu item",
        severity: "major",
        summary: "the current page is not visually indicated in the menu",
      },
      {
        prefix: "N4",
        region: "menu panel",
        severity: "minor",
        summary: "the menu panel has no border or shadow and blends into the page",
      },
    ],
  },
  {
    id: "08-form-validation",
    screen: "validation",
    title: "Sign-in validation",
    brief: `# Visual brief — sign-in validation

The form has Email and Password fields, a Sign in button and an error summary.
Error text sits under the field. The error summary sits above the form and
links to the fields. The submit button is disabled while the form is invalid.
Error text meets 4.5:1 contrast. The invalid field is not marked by colour alone.

Judge only what is visible: spacing, alignment, hierarchy, contrast, truncation,
overlap, wrapping and clipping. Report findings; do not score or speculate about
code.`,
    defects: [
      {
        prefix: "V1",
        region: "email error",
        severity: "major",
        summary: "the email error text is below 4.5:1 contrast",
      },
      {
        prefix: "V2",
        region: "email input",
        severity: "blocker",
        summary: "the email input shows the error by border colour alone",
      },
      {
        prefix: "V3",
        region: "error summary",
        severity: "major",
        summary: "the error summary is placed after the submit button",
      },
      {
        prefix: "V4",
        region: "sign in button",
        severity: "minor",
        summary: "the Sign in button stays enabled while the form has an error",
      },
    ],
  },
  {
    id: "09-long-content",
    screen: "long",
    title: "Long project content",
    brief: `# Visual brief — long project content

The project detail has a description, a Restore check section and a code block.
The description keeps a readable line length at 900. The code block does not
clip at 375. The section heading is clearly larger than body text.

Judge only what is visible: spacing, alignment, hierarchy, contrast, truncation,
overlap, wrapping and clipping. Report findings; do not score or speculate about
code.`,
    defects: [
      {
        prefix: "C1",
        region: "project description",
        severity: "minor",
        summary: "the description line length is too long at 900",
        shots: ["900-light", "900-dark"],
      },
      {
        prefix: "C2",
        region: "code block",
        severity: "major",
        summary: "the code block is clipped at 375",
        shots: ["375-light", "375-dark"],
      },
      {
        prefix: "C3",
        region: "section heading",
        severity: "minor",
        summary: "the section heading is smaller than the body text",
      },
    ],
  },
  {
    id: "10-dark-dashboard",
    screen: "dark",
    title: "Dark dashboard contrast",
    brief: `# Visual brief — dark dashboard

A dark dashboard with four cards, a primary button and a status badge. Labels
and badges meet 4.5:1 contrast. Card borders remain visible. The primary button
is readable and distinguishable from the card background. Review the dark theme
at 375 and 900.

Judge only what is visible: spacing, alignment, hierarchy, contrast, truncation,
overlap, wrapping and clipping. Report findings; do not score or speculate about
code.`,
    shots: ["375-dark", "900-dark"],
    defects: [
      {
        prefix: "K1",
        region: "card label",
        severity: "major",
        summary: "the card label is below 4.5:1 contrast in dark",
      },
      {
        prefix: "K2",
        region: "primary button",
        severity: "major",
        summary: "the primary button has low contrast in dark",
      },
      {
        prefix: "K3",
        region: "status badge",
        severity: "major",
        summary: "the status badge is below 4.5:1 contrast in dark",
      },
      {
        prefix: "K4",
        region: "card border",
        severity: "minor",
        summary: "the card border is invisible in dark",
      },
    ],
  },
];

function shotList(task) {
  const ids = task.shots ?? SHOTS.map((shot) => shot.id);
  return SHOTS.filter((shot) => ids.includes(shot.id));
}

for (const task of tasks) {
  const taskDir = join(packDir, "tasks", task.id);
  const shotsDir = join(taskDir, "shots");
  if (existsSync(taskDir)) rmSync(taskDir, { recursive: true, force: true });
  mkdirSync(shotsDir, { recursive: true });
  writeFileSync(join(taskDir, "brief.md"), `${task.brief}\n`);

  const shots = shotList(task);
  for (const shot of shots) {
    const url = `file:///${fixture.replace(/\\/g, "/")}?screen=${task.screen}&width=${shot.width}&theme=${shot.theme}`;
    execFileSync(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        `--screenshot=${join(shotsDir, `${shot.id}.png`)}`,
        `--window-size=${shot.width},560`,
        url,
      ],
      { stdio: "ignore" },
    );
  }

  const defects = [];
  for (const defect of task.defects) {
    const ids = defect.shots ?? shots.map((shot) => shot.id);
    for (const shotId of ids) {
      defects.push({
        id: `${defect.prefix}-${shotId}`,
        shot: shotId,
        region: defect.region,
        kind: "defect",
        severity: defect.severity,
        summary: defect.summary,
      });
    }
  }
  writeFileSync(
    join(taskDir, "key.json"),
    `${JSON.stringify({ defects }, null, 2)}\n`,
  );

  task.entries = {
    id: task.id,
    brief: `tasks/${task.id}/brief.md`,
    shots: shots.map((shot) => ({
      id: shot.id,
      file: `tasks/${task.id}/shots/${shot.id}.png`,
      screen: task.screen,
      state: "default",
      width: shot.width,
      theme: shot.theme,
    })),
    keyFile: `tasks/${task.id}/key.json`,
  };
  console.log(`wrote ${task.id}: ${shots.length} shots, ${defects.length} defects`);
}

const packFile = join(packDir, "pack.json");
const pack = JSON.parse(readFileSync(packFile, "utf8"));
const byId = new Map((pack.tasks ?? []).map((entry) => [entry.id, entry]));
for (const task of tasks) byId.set(task.id, task.entries);
pack.tasks = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
pack.version = 2;
pack.minTasks = 10;
writeFileSync(packFile, `${JSON.stringify(pack, null, 2)}\n`);
console.log(`updated ${packFile} (version 2, ${pack.tasks.length} tasks)`);