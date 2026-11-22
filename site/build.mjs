#!/usr/bin/env node
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPack } from "../tools/lib/benchmark.mjs";

const siteRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(siteRoot, "..");
const outRoot = join(siteRoot, "public");
const findings = JSON.parse(readFileSync(join(siteRoot, "data", "findings.json"), "utf8"));
const meta = JSON.parse(readFileSync(join(siteRoot, "data", "meta.json"), "utf8"));
const explanations = JSON.parse(readFileSync(join(siteRoot, "data", "explanations.json"), "utf8"));
const securityPack = loadPack(join(repoRoot, "benchmarks", "packs", "security-review"));
const chairPack = loadPack(join(repoRoot, "benchmarks", "packs", "council-chair"));
const shapePack = loadPack(join(repoRoot, "benchmarks", "packs", "council-shape"));
const experiencePack = loadPack(join(repoRoot, "benchmarks", "packs", "council-experience"));
const visualPack = loadPack(join(repoRoot, "benchmarks", "packs", "visual-project-list"));
const packById = {
  "security-review": securityPack,
  "council-chair": chairPack,
  "council-shape": shapePack,
  "council-experience": experiencePack,
  "visual-project-list": visualPack,
};
const buildVersion = Date.now().toString(36);

const PACK_TO_SEAT = {
  "security-review": "risk",
  "council-chair": "chair",
  "council-shape": "shape",
  "council-experience": "experience",
  "visual-project-list": "blindspot",
};
const SEAT_TO_PACK = Object.fromEntries(
  Object.entries(PACK_TO_SEAT).map(([pack, seat]) => [seat, pack]),
);

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const modelName = (id) => meta.modelInfo[id]?.name ?? id;
const modelLineage = (id) => meta.modelInfo[id]?.lineage ?? "";
const pct = (value) => (value === null || value === undefined ? "n/a" : `${value}%`);
const usd = (value) =>
  value === null || value === undefined ? "n/a" : `$${Number(value).toFixed(6)}`;
const badge = (tier) => `<span class="badge ${esc(tier)}">${esc(tier)}</span>`;

const seatById = (id) => meta.seats.find((seat) => seat.id === id);
const seatFindings = (id) => (id === "blindspot" ? findings.visual : findings[id]);
const seatRows = (id) => seatFindings(id).rows ?? (findings[id].rows ?? []);
const seatChosen = (id) => seatFindings(id).chosen ?? seatRows(id).find((row) => row.model === seatById(id).chosen) ?? null;
const seatRunner = (id) => seatFindings(id).runnerUp ?? null;
const plannedTasks = (id) =>
  id === "blindspot" ? findings.visual.tasks.length : packById[SEAT_TO_PACK[id]]?.tasks.length ?? 10;

const ci = (row) => {
  if (!row) return "n/a";
  if (!row.catchCi) return row.scored <= 1 ? "single task" : "not enough tasks";
  if (row.catchCi[0] === row.catchCi[1]) return `all ${row.scored} tasks`;
  return `${row.catchCi[0]}–${row.catchCi[1]}%`;
};

function completenessLabel(row, planned) {
  if (!row || row.scored === 0) return "no valid answers";
  if (row.completeness === "partial") return `partial · ${row.scored}/${planned} tasks`;
  if (row.completeness === "short") return `short · ${row.scored}/${planned} tasks`;
  return `complete · ${row.scored}/${planned} tasks`;
}

function statusLabel(row, chosen) {
  if (!row) return "untested";
  if (row.scored === 0) return "no valid answers";
  if (row.completeness === "partial") return "partial; not comparable";
  if (chosen && row.maxTokens !== chosen.maxTokens) return "different budget; not comparable";
  if (row.completeness === "short") return "short pack; not measured";
  return "comparable";
}

function taskInfo(packId, taskId) {
  return explanations.tasks[packId]?.[taskId] ?? { title: taskId, question: "" };
}

function optionLegend(packId, taskId) {
  const options = taskInfo(packId, taskId).options;
  if (!Array.isArray(options) || options.length === 0) return "";
  return `<div class="option-legend"><b>Options in this task</b>${options
    .map((option) => `<span><b>${esc(option.id)}</b> ${esc(option.label)}</span>`)
    .join("")}</div>`;
}

const VERBS = {
  lists: "List",
  captures: "Record",
  names: "Name",
  describes: "Describe",
  reuses: "Reuse",
  defers: "Defer",
  keeps: "Keep",
  uses: "Use",
  avoids: "Avoid",
  gives: "Give",
  states: "State",
  recommends: "Recommend",
  rejects: "Reject",
};

const CHECK_LABELS = {
  "lists all three options A, B and C": "List all three options (A, B, C)",
  "captures the experience dissent about a visible stale read": "Record the experience dissent: stale data must be visible",
  "names C as rejected because it adds SQLite or a new store": "Reject C (SQLite) because it adds a new store",
  "names B as rejected because it is a file or second store": "Reject B (JSON file) because it adds a second store",
  "names B as rejected for being an on-disk store or leak": "Reject B (on-disk index) because it adds a store and can leak content",
  "names B as rejected for a second source of truth": "Reject B (transport ownership) as a second source of truth",
  "names C as rejected for duplication": "Reject C (both keep a copy) as duplication",
  "names B as rejected for a duplicate command list": "Reject B (new command list) as a duplicate",
  "names C as rejected for not giving a keyboard path": "Reject C (current menus) because it gives no keyboard path",
  "rejects the second transport (A) on the one-path constraint": "Reject A (second transport) on the one-path constraint",
  "rejects the public endpoint (A) on exposure": "Reject A (public endpoint) on exposure",
  "names A as rejected because it moves the title": "Reject A (topbar picker) because it moves the title",
  "names C as rejected because it hides the list": "Reject C (palette command) because it hides the list",
  "names B as rejected because it cannot be rolled back": "Reject B (big-bang rewrite) because it cannot be rolled back",
  "describes A as an in-memory map": "Describe A as an in-memory map",
  "describes A as dual-write or dual-read": "Describe A as dual-write / dual-read",
  "lists all three options": "List all three options (A, B, C)",
  "lists the three options A, B and C": "List the three options (A, B, C)",
  "captures the risk dissent about the held run": "Record the risk dissent: the held run is voided with a sentence",
  "captures the experience dissent about focus": "Record the experience dissent: focus lands on the first row",
  "captures the risk dissent about persistence": "Record the risk dissent: the cache should survive a restart",
  "captures the experience dissent about a visible stale read": "Record the experience dissent: stale data must be visible",
  "captures the risk dissent about rollback": "Record the risk dissent: a one-step rollback is required",
  "captures the experience dissent about a blank transcript": "Record the experience dissent: no blank transcript during migration",
  "captures the risk dissent about destructive confirmations": "Record the risk dissent: destructive commands keep their confirmation",
  "captures the experience point about reusing visible labels": "Record the experience point: reuse the visible labels",
  "names the create or attach action as the first-run path": "Name create or attach as the first-run path",
  "names the first row appearing without a layout jump": "Describe the first row appearing without a layout jump",
  "names wait, switch or retry as the first-run path": "Name what the user can do while loading: wait, switch or retry",
  "names the risk position that the state must stay visible": "Record the risk position: the warning stays visible",
  "names the store and read seams": "Name the store and read seams",
  "names the store and render seams": "Name the store and render seams",
  "names the route and renderer seams": "Name the route and renderer seams",
  "names the port and render seams": "Name the port and render seams",
  "names the composer and page-state seams": "Name the composer and page-state seams",
  "names the render and data seams": "Name the render and data seams",
  "names the data and render seams": "Name the data and render seams",
  "names the admin and data seams": "Name the admin and data seams",
  "names the render and config seams": "Name the render and config seams",
  "describes a reversible removal": "Describe a reversible removal",
  "describes a restore or revert path": "Describe a restore or revert path",
  "describes a rollback path": "Describe a rollback path",
  "keeps one data path": "Keep one data path",
  "keeps one process and one path": "Keep one process and one path",
  "keeps one folder-scoped path": "Keep one folder-scoped path",
  "keeps the draft page-local": "Keep the draft page-local",
  "keys the draft to the thread": "Key the draft to the thread",
};

function humanCheck(description) {
  const raw = String(description ?? "")
    .replace(/^[A-Z]\d+:\s*/, "")
    .replace(/\.$/, "")
    .trim();
  if (CHECK_LABELS[raw]) return CHECK_LABELS[raw];
  let text = raw;
  if (/^names\s+[A-Z]\s+as\s+rejected\b/.test(text)) {
    text = text.replace(/^names\s+([A-Z])\s+as\s+rejected\s*/i, "Reject $1 ");
  }
  const first = text.match(/^([a-z]+)\b/);
  if (first) {
    const verb = VERBS[first[1]];
    if (verb) text = `${verb}${text.slice(first[0].length)}`;
    else text = `${text[0].toUpperCase()}${text.slice(1)}`;
  } else {
    text = `${text[0].toUpperCase()}${text.slice(1)}`;
  }
  return text;
}

function criteriaFor(packId, taskId) {
  const task = packById[packId]?.tasks.find((entry) => entry.id === taskId);
  return task?.key.criteria ?? [];
}

function defectsFor(packId, taskId) {
  const task = packById[packId]?.tasks.find((entry) => entry.id === taskId);
  return task?.key.defects ?? [];
}

function describeId(packId, taskId, id) {
  const task = packById[packId]?.tasks.find((entry) => entry.id === taskId);
  const criterion = task?.key.criteria?.find((entry) => entry.id === id);
  if (criterion) return humanCheck(criterion.description);
  const defect = task?.key.defects?.find((entry) => entry.id === id);
  return defect ? `${defect.severity}: ${defect.summary}` : id;
}

function severityTag(severity) {
  return `<span class="sev ${esc(severity)}">${esc(severity)}</span>`;
}

function uniqueList(id) {
  const data = seatFindings(id);
  const planned = plannedTasks(id);
  const rows = (data.rows ?? []).filter((row) => row.model !== data.chosen?.model && row.uniqueIds?.length);
  if (rows.length === 0) return "";
  return `<div class="unique-block"><h3>What the challengers added</h3>${rows
    .map(
      (row) => `<details><summary>${esc(modelName(row.model))} uniquely caught ${row.uniqueIds.length} check${row.uniqueIds.length === 1 ? "" : "s"} · ${esc(completenessLabel(row, planned))}</summary>
        <ul class="checks">${row.uniqueIds
          .map(
            (entry) =>
              `<li><b>${esc(taskInfo(SEAT_TO_PACK[id], entry.task).title)}</b> — ${esc(describeId(SEAT_TO_PACK[id], entry.task, entry.id))}</li>`,
          )
          .join("")}</ul></details>`,
    )
    .join("")}</div>`;
}

function diffBlock(id, task) {
  const data = seatFindings(id);
  const entry = (data.diff ?? []).find((row) => row.task === task.task);
  if (!entry || !data.chosen || !data.runnerUp) return "";
  if (data.chosen.maxTokens !== data.runnerUp.maxTokens) return "";
  const packId = SEAT_TO_PACK[id];
  const label = (ids) =>
    ids.length
      ? `<ul class="checks">${ids
          .map((entryId) => `<li>${esc(describeId(packId, task.task, entryId))}</li>`)
          .join("")}</ul>`
      : "";
  return `<div class="diff">
    <div class="diff-head"><b>Chosen vs runner-up</b><span>${esc(modelName(data.chosen.model))} / ${esc(modelName(data.runnerUp.model))}</span></div>
    <div class="diff-counts">
      <span class="both">Both ${entry.both.length}</span>
      <span class="only-first">Only ${esc(modelName(data.chosen.model))} ${entry.onlyFirst.length}</span>
      <span class="only-second">Only ${esc(modelName(data.runnerUp.model))} ${entry.onlySecond.length}</span>
      <span class="neither">Neither ${entry.neither.length}</span>
    </div>
    ${
      entry.onlyFirst.length
        ? `<div class="diff-list"><b>Only ${esc(modelName(data.chosen.model))}</b>${label(entry.onlyFirst)}</div>`
        : ""
    }
    ${
      entry.onlySecond.length
        ? `<div class="diff-list"><b>Only ${esc(modelName(data.runnerUp.model))}</b>${label(entry.onlySecond)}</div>`
        : ""
    }
    ${
      entry.neither.length
        ? `<details><summary>What neither model caught</summary>${label(entry.neither)}</details>`
        : ""
    }
  </div>`;
}

function decisionCard(id) {
  const seat = seatById(id);
  const data = seatFindings(id);
  const chosen = seatChosen(id);
  const runner = seatRunner(id);
  const decision = meta.decisions?.[id] ?? {};
  const planned = plannedTasks(id);
  if (!chosen) {
    return `<div class="card decision"><h3>No valid evidence yet</h3><p>${esc(seat.reason)}</p></div>`;
  }
  const runnerLine = runner
    ? `<b>${esc(modelName(runner.model))}</b> · ${pct(runner.catch)} catch (${ci(runner)}) · ${pct(runner.precision)} precision · ${completenessLabel(runner, planned)}${runner.maxTokens !== chosen.maxTokens ? ` · ${runner.maxTokens} tokens vs ${chosen.maxTokens}` : ""}`
    : id === "blindspot"
      ? `<b>No second model returned a valid visual review.</b> DeepSeek and Qwen were probed and returned empty responses.`
      : `<b>No complete challenger on the same budget.</b> The only other runs are partial or on a different token budget.`;
  return `<div class="card decision">
    <div class="decision-head">
      <h3>Why ${esc(seat.name.toLowerCase())} is bound to ${esc(modelName(chosen.model))}</h3>
      <span>${badge(chosen.tier)} <span class="sub">${esc(completenessLabel(chosen, planned))}</span></span>
    </div>
    <div class="decision-grid">
      <div>
        <span class="label">Chosen</span>
        <b>${esc(modelName(chosen.model))}</b>
        <span class="ci">${pct(chosen.catch)} catch <span>${ci(chosen)}</span> · ${pct(chosen.precision)} precision</span>
        <p>${completenessLabel(chosen, planned)} · ${chosen.samples ?? 1} sample${(chosen.samples ?? 1) === 1 ? "" : "s"}${chosen.retries ? ` · ${chosen.retries} retry per task` : ""} · ${chosen.maxTokens ?? "?"} max tokens.</p>
      </div>
      <div>
        <span class="label">Runner-up</span>
        ${runnerLine}
        ${runner ? `<p>${runner.scored}/${planned} tasks; ${runner.fp} false claim${runner.fp === 1 ? "" : "s"}.</p>` : ""}
      </div>
    </div>
    <div class="decision-note">
      <p><b>Tiebreaker.</b> ${esc(decision.tiebreaker ?? "No tiebreaker recorded.")}</p>
      <p><b>What would change it.</b> ${esc(decision.whatWouldFlip ?? "No trigger recorded.")}</p>
      ${decision.stability ? `<p><b>Stability check.</b> ${esc(decision.stability)}</p>` : ""}
    </div>
    <p class="fine">Cost ${usd(chosen.costPerTask)}/task · one four-seat council round ${usd(findings.costs.councilOneRound)} · review by ${esc(decision.reviewBy ?? meta.nextReview)}.</p>
  </div>`;
}

function kpis() {
  const measured = meta.seats.filter((seat) => seat.tier === "measured").length;
  const validPairs = meta.seats.reduce(
    (sum, seat) => sum + seatRows(seat.id).filter((row) => row.scored > 0).length,
    0,
  );
  const tasks = Object.values(packById).reduce((sum, pack) => sum + (pack.tasks?.length ?? 0), 0);
  return `<div class="kpis">
    <div class="kpi"><b>${meta.seats.length}</b><span>seats</span></div>
    <div class="kpi"><b>${measured}</b><span>measured seats</span></div>
    <div class="kpi"><b>${meta.seats.length - measured}</b><span>pilot seats</span></div>
    <div class="kpi"><b>${validPairs}</b><span>model-seat pairs with data</span></div>
    <div class="kpi"><b>${tasks}</b><span>tasks across 5 packs</span></div>
    <div class="kpi"><b>${usd(findings.costs.totalRecorded)}</b><span>recorded spend</span></div>
  </div>`;
}

function seatCards() {
  return `<div class="seat-grid">${meta.seats
    .map((seat) => {
      const chosen = seatChosen(seat.id);
      const planned = plannedTasks(seat.id);
      return `<a class="seat-card" href="seats/${seat.id}.html">
        <div class="seat-head"><h3>${esc(seat.name)}</h3>${badge(seat.tier)}</div>
        <div class="chosen">${esc(modelName(seat.chosen))}</div>
        <div class="metrics">
          <span><b>${pct(chosen?.catch)}</b> catch</span>
          <span><b>${pct(chosen?.precision)}</b> precision</span>
          <span><b>${chosen?.scored ?? 0}/${planned}</b> tasks</span>
        </div>
        <p>${esc(seat.reason)}</p>
        <span class="card-link">Why this seat →</span>
      </a>`;
    })
    .join("")}</div>`;
}

function matrix() {
  const heads = Object.keys(meta.modelInfo)
    .map((model) => `<th>${esc(modelName(model))}<span>${esc(modelLineage(model))}</span></th>`)
    .join("");
  const rows = meta.seats
    .map((seat) => {
      const rows = seatRows(seat.id);
      const chosen = seatChosen(seat.id);
      const planned = plannedTasks(seat.id);
      const cells = Object.keys(meta.modelInfo)
        .map((model) => {
          const row = rows.find((entry) => entry.model === model);
          if (!row) return `<td class="untested">untested</td>`;
          const chosenCell = chosen?.model === model;
          const status = statusLabel(row, chosen);
          const score =
            row.scored === 0
              ? `<span class="no-score">no valid answers</span>`
              : `<div class="score">${pct(row.catch)} <span>/ ${pct(row.precision)}</span></div>`;
          return `<td class="cell ${esc(row.tier)}${chosenCell ? " chosen" : ""}">
            ${score}
            <div class="meta">${completenessLabel(row, planned)} · ${row.samples ?? 1} sample${(row.samples ?? 1) === 1 ? "" : "s"}${row.retries ? ` · ${row.retries} retry` : ""} · ${row.maxTokens ?? "?"} tokens</div>
            ${status !== "comparable" ? `<div class="status-warn">${esc(status)}</div>` : ""}
            ${chosenCell ? `<div class="chosen-label">chosen</div>` : ""}
          </td>`;
        })
        .join("");
      return `<tr><th class="seat-label">${esc(seat.name)}<span>${esc(seat.slot)}</span></th>${cells}</tr>`;
    })
    .join("");
  return `<div class="card scroll">
    <table class="matrix"><thead><tr><th>Seat</th>${heads}</tr></thead><tbody>${rows}</tbody></table>
    <p class="fine">A cell is comparable only when it shares the seat's pack, max-token budget and completion count with the chosen row. A partial run's catch is shown with its task count; it is not ranked against a complete run. Council seats score criteria, risk scores findings and blindspot scores defects, so precision is not the same unit across rows.</p>
  </div>`;
}

function decisionSummary() {
  return `<div class="card scroll"><table>
    <thead><tr><th>Seat</th><th>Chosen</th><th>Runner-up</th><th>Tiebreaker</th><th class="num">Review by</th></tr></thead>
    <tbody>${meta.seats
      .map((seat) => {
        const chosen = seatChosen(seat.id);
        const runner = seatRunner(seat.id);
        const decision = meta.decisions?.[seat.id] ?? {};
        return `<tr>
          <td><a href="seats/${seat.id}.html">${esc(seat.name)}</a></td>
          <td>${esc(modelName(seat.chosen))}<span class="sub">${pct(chosen?.catch)} catch · ${pct(chosen?.precision)} precision</span></td>
          <td>${runner ? `${esc(modelName(runner.model))}<span class="sub">${pct(runner.catch)} catch · ${pct(runner.precision)} precision</span>` : "no complete challenger"}</td>
          <td class="tiebreaker">${esc(decision.tiebreaker ?? "")}</td>
          <td class="num">${esc(decision.reviewBy ?? meta.nextReview)}</td>
        </tr>`;
      })
      .join("")}</tbody>
  </table></div>`;
}

function spendSplit() {
  const rows = [
    { label: "Evidence runs", value: findings.costs.evidenceSpend, note: "the runs this report ranks" },
    { label: "Tuning, failed and challenger runs", value: findings.costs.tuningSpend, note: "token-budget discovery, failed pilots and premium challengers" },
    { label: "Probes", value: findings.costs.probeSpend, note: "one-off provider checks" },
  ];
  const max = Math.max(...rows.map((row) => row.value), 0.000001);
  return `<div class="card">
    ${rows
      .map(
        (row) => `<div class="cost-row">
          <div>${esc(row.label)}<span class="sub">${esc(row.note)}</span></div>
          <div class="track"><div class="bar" style="width:${Math.max(2, (row.value / max) * 100)}%"></div></div>
          <div class="amount">${usd(row.value)}</div>
        </div>`,
      )
      .join("")}
    <div class="total"><span>Recorded total</span><span>${usd(findings.costs.totalRecorded)}</span></div>
    <p class="fine">Cap ${usd(meta.capUsd)}. ${usd(meta.capUsd - findings.costs.totalRecorded)} remains. A single council round at the chosen bindings is about ${usd(findings.costs.councilOneRound)}. Visual-review image calls are not costed by the tool; the total comes from run records and probe entries.</p>
  </div>`;
}

function runTable(runs = findings.runs) {
  return `<div class="card scroll"><table>
    <thead><tr><th>Run</th><th>Purpose</th><th>Models</th><th class="num">Samples</th><th class="num">Retries</th><th class="num">Max tokens</th><th class="num">Records</th><th class="num">Failed</th><th class="num">Spend</th></tr></thead>
    <tbody>${runs
      .map(
        (run) => `<tr class="${run.selected ? "selected-run" : ""}">
          <td>${esc(run.dir)}${run.selected ? '<span class="sub">ranked in this report</span>' : ""}</td>
          <td>${esc(run.purpose)}</td>
          <td class="models">${esc((run.models ?? []).map(modelName).join(", ") || "—")}</td>
          <td class="num">${run.samples ?? 1}</td>
          <td class="num">${run.retries ?? 0}</td>
          <td class="num">${run.maxTokens ?? "—"}</td>
          <td class="num">${run.records}</td>
          <td class="num ${run.failed > 0 ? "bad" : ""}">${run.failed}</td>
          <td class="num">${usd(run.spent)}</td>
        </tr>`,
      )
      .join("")}</tbody>
  </table></div>`;
}

function homePage() {
  return layout({
    title: "Overview",
    active: "home",
    body: `<h1>Council seat benchmarks</h1>
      <p class="lede">${esc(meta.project)} · base ${esc(meta.baseVersion)} · ${esc(findings.generatedAt)} · no model rebound</p>
      ${kpis()}
      <div class="card explainer">
        <h3>How to read this report</h3>
        <p><b>Catch</b> is the weighted share of required checks a model met. <b>Precision</b> is caught checks over caught plus false claims. <b>Complete</b> means every task produced a valid answer at the stated token budget; <b>partial</b> means some answers failed and the percentage is on the completed subset only.</p>
        <p>The band beside catch is a rough 95% bootstrap interval over the tasks, not a guarantee. If two bands overlap, the catch difference is inside the noise and you should decide on precision, completeness or cost. A model is <b>measured</b> only with ten distinct tasks and no failed answer; <b>pilot</b> is anything less.</p>
      </div>
      <div class="card"><h3>What this pass added</h3><ul>${(meta.expansionNotes ?? []).map((note) => `<li>${esc(note)}</li>`).join("")}</ul></div>
      <h2>Current seats</h2>
      ${seatCards()}
      <h2>Seat decisions</h2>
      ${decisionSummary()}
      <h2>Evidence matrix</h2>
      ${matrix()}
      <h2>Spend and runs</h2>
      <div class="grid2">
        ${spendSplit()}
        <div class="card">
          <h3>Run ledger</h3>
          <p class="fine">Every benchmark directory with a run record. The evidence spend is the final measured runs; most of the rest was finding the right token budget.</p>
          ${runTable()}
        </div>
      </div>`,
  });
}

function candidateTable(id) {
  const rows = seatRows(id);
  const chosen = seatChosen(id);
  const planned = plannedTasks(id);
  return `<div class="card scroll"><table>
    <thead><tr><th>Model</th><th>Status</th><th class="num">Tasks</th><th class="num">Catch</th><th class="num">Precision</th><th class="num">False claims</th><th class="num">Cost / task</th><th class="num">Samples</th><th class="num">Retries</th><th class="num">Max tokens</th></tr></thead>
    <tbody>${rows
      .map(
        (row) => `<tr class="${row.model === chosen?.model ? "chosen-row" : ""}">
          <td>${esc(modelName(row.model))}<span class="sub">${esc(modelLineage(row.model))}</span></td>
          <td>${badge(row.tier)}<span class="sub">${esc(completenessLabel(row, planned))}</span></td>
          <td class="num">${row.scored}/${planned}</td>
          <td class="num">${row.scored === 0 ? '<span class="no-score">no valid answers</span>' : `${pct(row.catch)}<span class="sub">${ci(row)}</span>`}</td>
          <td class="num">${pct(row.precision)}</td>
          <td class="num">${row.fp ?? 0}</td>
          <td class="num">${usd(row.costPerTask)}</td>
          <td class="num">${row.samples ?? 1}</td>
          <td class="num">${row.retries ?? 0}</td>
          <td class="num">${row.maxTokens ?? "—"}</td>
        </tr>`,
      )
      .join("")}</tbody>
  </table></div>`;
}

function riskTasks() {
  const data = findings.risk;
  const glm = "surplus/glm-5.3";
  const qwen = "surplus/qwen3.8-flash";
  return `<div class="task-list">${data.tasks
    .map((task) => {
      const info = taskInfo("security-review", task.task);
      const defects = defectsFor("security-review", task.task);
      const g = task.models[glm];
      const q = task.models[qwen];
      const chip = (name, cell) =>
        cell?.ok
          ? `<span class="chip">${esc(name)} <b>${cell.caughtCount}/${cell.total}</b> key defects${cell.fp ? ` · ${cell.fp} false claim${cell.fp === 1 ? "" : "s"}` : ""}</span>`
          : `<span class="chip failed">${esc(name)} no valid answer</span>`;
      return `<article class="task-card">
        <div class="task-head">
          <div>
            <h3>${esc(info.title)}</h3>
            <p class="question">${esc(info.question)}</p>
            ${info.what ? `<p class="what">${esc(info.what)}</p>` : ""}
          </div>
          <span class="task-id">Task ${esc(task.task.split("-")[0])}</span>
        </div>
        <div class="score-chips">${chip("GLM 5.3", g)}${chip("Qwen 3.8 Flash", q)}</div>
        ${
          q?.missed?.length
            ? `<div class="miss"><b>Qwen missed</b><ul>${q.missed
                .map((defectId) => {
                  const defect = defects.find((entry) => entry.id === defectId);
                  return `<li>${defect ? `${severityTag(defect.severity)} ${esc(defect.summary)}` : esc(defectId)}</li>`;
                })
                .join("")}</ul></div>`
            : `<div class="miss ok"><b>Qwen caught every key defect in this slice.</b></div>`
        }
        ${diffBlock("risk", task)}
        <details><summary>Key defects in this slice (${defects.length})</summary>
          <ul class="checks">${defects
            .map((defect) => `<li>${severityTag(defect.severity)} ${esc(defect.summary)}</li>`)
            .join("")}</ul>
        </details>
      </article>`;
    })
    .join("")}</div>`;
}

function councilTasks(id) {
  const packId = SEAT_TO_PACK[id];
  const data = seatFindings(id);
  const models = data.models ?? [];
  return `<div class="task-list">${data.tasks
    .map((task) => {
      const info = taskInfo(packId, task.task);
      const criteria = criteriaFor(packId, task.task);
      const chips = models
        .map((model) => {
          const cell = task.models[model];
          if (!cell || !cell.ok) {
            return `<span class="chip failed">${esc(modelName(model))} no valid answer</span>`;
          }
          return `<span class="chip">${esc(modelName(model))} <b>${cell.caughtCount}/${task.total} checks · ${cell.weightedPct}%</b>${cell.fp ? ` · ${cell.fp} false claim${cell.fp === 1 ? "" : "s"}` : ""}${cell.samples > 1 ? ` · ${cell.samples} samples` : ""}</span>`;
        })
        .join("");
      const misses = models
        .map((model) => {
          const cell = task.models[model];
          if (!cell || !cell.ok) {
            return `<div class="miss"><b>${esc(modelName(model))}</b> could not be scored: the answer was not valid JSON.</div>`;
          }
          if (!cell.missed.length) {
            return `<div class="miss ok"><b>${esc(modelName(model))}</b> missed no checks.</div>`;
          }
          return `<div class="miss"><b>${esc(modelName(model))}</b> missed:<ul>${cell.missed
            .map((id) => `<li>${esc(describeId(packId, task.task, id))}</li>`)
            .join("")}</ul></div>`;
        })
        .join("");
      return `<article class="task-card">
        <div class="task-head">
          <div>
            <h3>${esc(info.title)}</h3>
            <p class="question">${esc(info.question)}</p>
          </div>
          <span class="task-id">Task ${esc(task.task.split("-")[0])}</span>
        </div>
        ${optionLegend(packId, task.task)}
        <div class="score-chips">${chips}</div>
        ${diffBlock(id, task)}
        ${misses}
        <details><summary>All ${task.total} checks in this task</summary>
          <ul class="checks">${criteria
            .map(
              (criterion) =>
                `<li>${esc(humanCheck(criterion.description))} <span class="weight">weight ${criterion.weight}</span></li>`,
            )
            .join("")}</ul>
        </details>
      </article>`;
    })
    .join("")}</div>`;
}

function visualTasks() {
  const data = findings.visual;
  const chosen = data.chosen;
  return `<div class="task-list">${data.tasks
    .map((task) => {
      const info = taskInfo("visual-project-list", task.task);
      const defects = defectsFor("visual-project-list", task.task);
      const packTask = visualPack.tasks.find((entry) => entry.id === task.task);
      const shots = packTask?.shots ?? [];
      const cell = chosen ? task.models[chosen.model] : null;
      const caught = new Set(cell?.caught ?? []);
      const groups = new Map();
      for (const defect of defects) {
        const key = defect.id.split("-")[0];
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(defect);
      }
      const titles = info.defects ?? {};
      const rows = [...groups.entries()]
        .map(([key, group]) => {
          const caughtCount = group.filter((defect) => caught.has(defect.id)).length;
          const all = caughtCount === group.length;
          return `<div class="defect-row">
            <div>
              <div class="defect-title">${esc(titles[key] ?? group[0].summary)}</div>
              <div class="defect-meta">${esc(group[0].severity)} severity · ${caughtCount}/${group.length} shots</div>
            </div>
            <div class="result ${all ? "caught" : "missed"}">${all ? "caught" : "missed"}</div>
          </div>`;
        })
        .join("");
      return `<article class="task-card">
        <div class="task-head">
          <div>
            <h3>${esc(info.title)}</h3>
            <p class="question">${esc(info.question)}</p>
          </div>
          <span class="task-id">Task ${esc(task.task.split("-")[0])}</span>
        </div>
        <div class="shot-grid">${shots
          .map(
            (shot) =>
              `<figure><img src="../visual/${esc(task.task)}/${esc(shot.id)}.png" alt="${esc(shot.id)} screenshot"><figcaption>${esc(shot.id)}</figcaption></figure>`,
          )
          .join("")}</div>
        <div class="score-chips">
          <span class="chip">${esc(modelName(chosen.model))} <b>${cell?.caughtCount ?? 0}/${task.total} defects · ${cell?.weightedPct ?? 0}%</b></span>
        </div>
        <div class="defect-list">${rows}</div>
        <details><summary>Per-shot detail (${defects.length} keyed defects)</summary>
          <ul class="checks">${defects
            .map(
              (defect) =>
                `<li>${caught.has(defect.id) ? '<span class="ok">caught</span>' : '<span class="bad">missed</span>'} ${esc(titles[defect.id.split("-")[0]] ?? defect.summary)} — ${esc(defect.shot)}</li>`,
            )
            .join("")}</ul>
        </details>
      </article>`;
    })
    .join("")}</div>`;
}

function coverageSection(id) {
  const coverage = meta.coverage?.[id];
  if (!coverage) return "";
  return `<h2>Coverage and limits</h2>
    <div class="grid2">
      <div class="card"><h3>What this covers</h3><ul>${coverage.covers.map((line) => `<li>${esc(line)}</li>`).join("")}</ul></div>
      <div class="card"><h3>What it does not prove</h3><ul>${coverage.limits.map((line) => `<li>${esc(line)}</li>`).join("")}</ul></div>
    </div>`;
}

function reproduceSection(id) {
  const packId = SEAT_TO_PACK[id];
  const pack = packById[packId];
  const chosen = seatChosen(id);
  const rows = seatRows(id);
  const maxTokens = chosen?.maxTokens ?? 16000;
  const samples = chosen?.samples ?? 1;
  const models = rows
    .filter((row) => row.scored > 0 || row.tier !== "incomplete")
    .map((row) => row.model)
    .join(",");
  const command = `node tools/benchmark.mjs run --project ../personal-website --pack benchmarks/packs/${packId} --models ${models} --budget-usd 0.05 --max-tokens ${maxTokens} --samples ${samples}`;
  return `<h2>Reproduce</h2>
    <div class="card reproduce">
      <p><b>Pack</b> ${esc(pack?.pack?.id)}@${esc(pack?.pack?.version)} · <span class="mono">${esc(String(pack?.packHash ?? "").slice(0, 19))}…</span> · <b>Slot</b> ${esc(pack?.pack?.slot)}</p>
      <p><b>Last run</b> ${esc(chosen?.lastDate ?? "n/a")} · <b>Max tokens</b> ${maxTokens} · <b>Samples</b> ${samples}</p>
      <pre>${esc(command)}</pre>
      <p class="fine">The price band and the slot binding are resolved by the project; a real run still needs a budget and a price for every model. Pack hashes and token groups are recorded with every answer, so a changed pack never ranks against an old one.</p>
    </div>`;
}

function seatPage(id) {
  const seat = seatById(id);
  const pack = SEAT_TO_PACK[id];
  const runs = findings.runs.filter((run) => run.pack === pack);
  const taskBlock =
    id === "risk"
      ? riskTasks()
      : id === "blindspot"
        ? visualTasks()
        : councilTasks(id);
  const extra =
    id === "blindspot"
      ? `<p class="lede">${findings.visual.keyCount} keyed defects across ${findings.visual.shotCount} shots · ${usd(findings.visual.row?.[0]?.costPerTask)} per task · ${findings.visual.row?.[0]?.catch}% catch / ${findings.visual.row?.[0]?.precision}% precision with ${findings.visual.fp} false claims.</p>`
      : "";
  return layout({
    title: seat.name,
    active: "seat",
    depth: 1,
    body: `<p class="crumb"><a href="../index.html">Overview</a> / ${esc(seat.name)}</p>
      <h1>${esc(seat.name)}</h1>
      <p class="lede">${esc(seat.slot)} · chosen <b>${esc(modelName(seat.chosen))}</b> · ${badge(seat.tier)}</p>
      <div class="callout">${esc(seat.reason)}</div>
      ${extra}
      ${decisionCard(id)}
      <div class="card explainer">
        <h3>How to read this page</h3>
        <p>${esc(explanations.packNotes[pack] ?? "")}</p>
        <p><b>Catch</b> is the weighted share of required checks met; the weight beside a check is how much it counts. <b>Precision</b> is caught checks over caught plus false claims. <b>Unique</b> is a check this model caught that the reference missed. A failed JSON answer is incomplete, not a miss.</p>
      </div>
      <h2>Candidates</h2>
      ${candidateTable(id)}
      ${uniqueList(id)}
      <h2>Task results</h2>
      <p class="fine">${id === "risk" ? "The measured pair is GLM 5.3 vs Qwen at 16k; the 4k rows are partial pilots." : id === "blindspot" ? "Every keyed visual defect, including the misses." : "Each card shows the weighted task score, the chosen-vs-runner-up diff and every missed check."}</p>
      ${taskBlock}
      ${coverageSection(id)}
      ${reproduceSection(id)}
      <h2>Runs</h2>
      ${runTable(runs)}`,
  });
}

function runsPage() {
  return layout({
    title: "Runs",
    active: "runs",
    body: `<h1>Runs</h1>
      <p class="lede">Every benchmark directory with a run record. The evidence runs are highlighted; failed and tuning runs are kept, not hidden.</p>
      ${runTable()}
      <div class="grid2">
        ${spendSplit()}
        <div class="card"><h3>What the ledger says</h3>
          <p>The final measured evidence cost ${usd(findings.costs.evidenceSpend)}. The tuning runs cost ${usd(findings.costs.tuningSpend)}; most of that was finding the output budget and retrying invalid JSON.</p>
          <p>Recorded total ${usd(findings.costs.totalRecorded)}; probes ${usd(findings.costs.probeSpend)}; benchmark runs ${usd(findings.costs.runSpend)}. ${usd(meta.capUsd - findings.costs.totalRecorded)} remains under the ${usd(meta.capUsd)} cap.</p>
        </div>
      </div>`,
  });
}

function methodPage() {
  return layout({
    title: "Method",
    active: "method",
    body: `<h1>Method</h1>
      <p class="lede">Evidence rules, price basis and the limits of this report.</p>
      <div class="grid2">
        <div class="card"><h3>Protocol findings</h3><ul>${meta.protocolNotes.map((note) => `<li>${esc(note)}</li>`).join("")}</ul></div>
        <div class="card"><h3>Publishing policy</h3><p>${esc(meta.publishPolicy)}</p>
          <h3>Price basis</h3><ul>${meta.priceBasis.map((line) => `<li>${esc(line)}</li>`).join("")}</ul></div>
      </div>
      <div class="card"><h3>Evidence tiers</h3>
        <p><b>Measured</b>: at least ten distinct tasks and zero failed tasks. <b>Complete</b>: every task produced a valid answer at the stated budget. <b>Partial</b>: some answers failed; the percentage is on the completed subset only and is not ranked against a complete run. <b>No valid answers</b>: every answer failed.</p>
        <p><b>Confidence</b>: one sample is medium; two or more samples are high. The band shown beside catch is a rough 95% bootstrap interval over the tasks, not a guarantee. Overlapping bands mean the catch gap is inside the noise. A retry is recorded and charged; a completed retry run is measured, but it is a different group from a no-retry run.</p>
        <p><b>Max-token groups</b>: a record only ranks with another record that shares the pack hash, protocol, max_tokens, retries and temperature. Different budgets are labelled in the matrix.</p>
        <p><b>Staleness</b>: evidence is stale after 180 days. The next review for this report is ${esc(meta.nextReview)}.</p>
      </div>
      <div class="card"><h3>What this report does not prove</h3>
        <ul>
          <li>It does not prove that a model is generally better; it proves how these models did on these packs.</li>
          <li>It does not score taste or beauty. The blindspot pack measures visible defects; the experience seat is a thesis, not an artifact.</li>
          <li>It does not cover a full application, scale, multi-user behaviour or accessibility beyond the visual keys.</li>
          <li>It does not rebind a seat. A recommendation is evidence for the user's decision, not a change to the project.</li>
        </ul>
      </div>
      <div class="card"><h3>Commits</h3><ul>${meta.commits.map((commit) => `<li>${esc(commit)}</li>`).join("")}</ul></div>`,
  });
}

function briefPage() {
  const brief = explanations.optionsBrief;
  if (!brief) return layout({ title: "Options", active: "brief", body: "<h1>Options brief</h1>" });
  return layout({
    title: "Options",
    active: "brief",
    body: `<h1>${esc(brief.title)}</h1>
      <p class="lede">${esc(brief.intro)}</p>
      <div class="card"><h3>What the brief must contain</h3><ul>${brief.rules.map((rule) => `<li>${esc(rule)}</li>`).join("")}</ul></div>
      <h2>Worked example: ${esc(brief.example.title)}</h2>
      <p>${esc(brief.example.intro)}</p>
      <div class="card scroll"><table>
        <thead><tr><th>Option</th><th>Useful for M1</th><th>Design fit</th><th>Modern / maintained</th><th>Cost</th><th>Reversible</th></tr></thead>
        <tbody>${brief.example.rows
          .map(
            (row) =>
              `<tr><td><b>${esc(row.option)}</b></td><td>${esc(row.useful)}</td><td>${esc(row.design)}</td><td>${esc(row.modern)}</td><td>${esc(row.cost)}</td><td>${esc(row.reversible)}</td></tr>`,
          )
          .join("")}</tbody>
      </table></div>
      <div class="card decision"><h3>Recommendation</h3><p>${esc(brief.example.recommendation)}</p>
        <p><b>What would change it.</b> ${esc(brief.example.whatWouldFlip)}</p></div>
      <h2>What this does not do</h2>
      <p>${esc(brief.limits)}</p>`,
  });
}

function writePage(path, html) {
  const file = join(outRoot, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

function copyShots() {
  for (const task of visualPack.tasks) {
    for (const shot of task.shots ?? []) {
      const source = join(visualPack.packDir, shot.file);
      const target = join(outRoot, "visual", task.id, `${shot.id}.png`);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
    }
  }
}

function layout({ title, active, body, depth = 0 }) {
  const prefix = depth === 0 ? "" : "../";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Council benchmarks</title>
<script>
try { document.documentElement.dataset.theme = localStorage.getItem("council-theme") || "dark"; }
catch { document.documentElement.dataset.theme = "dark"; }
</script>
<link rel="stylesheet" href="${prefix}site.css?v=${buildVersion}">
</head>
<body>
<header class="topbar">
  <a class="brand" href="${prefix}index.html">Council benchmarks</a>
  <nav>
    <a href="${prefix}index.html">Overview</a>
    <a href="${prefix}${active === "brief" ? "brief.html" : "brief.html"}">Options</a>
    <a href="${prefix}runs.html">Runs</a>
    <a href="${prefix}method.html">Method</a>
    <a href="${prefix}data.json">Data</a>
    <button id="theme-toggle" class="theme-toggle" type="button" aria-label="Toggle theme">☀ Light</button>
  </nav>
</header>
<main>
${body}
</main>
<footer>
  <span>${esc(meta.project)} · base ${esc(meta.baseVersion)} · ${esc(findings.generatedAt)}</span>
  <span>No model binding is implied by this report.</span>
</footer>
<script>
(() => {
  const root = document.documentElement;
  const button = document.getElementById("theme-toggle");
  const apply = (theme) => {
    root.dataset.theme = theme;
    button.textContent = theme === "dark" ? "☀ Light" : "☾ Dark";
    button.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
  };
  apply(root.dataset.theme || "dark");
  button.addEventListener("click", () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("council-theme", next); } catch { /* file:// preview */ }
    apply(next);
  });
})();
</script>
</body>
</html>`;
}

const css = `:root{color-scheme:dark;--ink:#e7edf6;--muted:#98a6b8;--line:#2a3442;--bg:#0e131a;--card:#151c25;--panel:#1a222d;--panel-2:#1f2a37;--hover:#243247;--track:#202a36;--green:#6ee7a0;--green-bg:#12331f;--blue:#7aa2ff;--blue-bg:#152749;--amber:#f5b45a;--amber-bg:#3a2a13;--red:#ff8a8a;--red-bg:#3a1a1a}
:root[data-theme="light"]{color-scheme:light;--ink:#172033;--muted:#5f6b80;--line:#dde3ec;--bg:#f6f8fb;--card:#fff;--panel:#fafbfd;--panel-2:#f7faff;--hover:#eef4ff;--track:#eef1f5;--green:#15803d;--green-bg:#e8f6ed;--blue:#2563eb;--blue-bg:#eaf0ff;--amber:#b45309;--amber-bg:#fff4e5;--red:#b91c1c;--red-bg:#fdecec}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
a{color:var(--blue);text-decoration:none}a:hover{text-decoration:underline}
.topbar{display:flex;justify-content:space-between;gap:18px;align-items:center;flex-wrap:wrap;padding:14px 28px;background:var(--card);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
.brand{font-weight:750;color:var(--ink)}nav{display:flex;gap:16px;font-size:13px;align-items:center;flex-wrap:wrap}
.theme-toggle{appearance:none;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:999px;padding:4px 10px;font:inherit;font-size:12px;cursor:pointer}
.theme-toggle:hover{border-color:var(--blue)}
main{max-width:1280px;margin:0 auto;padding:28px}h1{font-size:30px;letter-spacing:-.03em;margin:0 0 4px}h2{font-size:19px;margin:30px 0 10px}h3{margin:0 0 8px;font-size:14px}
.lede{color:var(--muted);margin:0 0 18px}.crumb{color:var(--muted);font-size:12px;margin:0 0 8px}
.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin:18px 0 24px}.kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}.kpi b{display:block;font-size:20px;letter-spacing:-.02em}.kpi span{color:var(--muted);font-size:12px}
.seat-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}.seat-card{display:block;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;color:inherit}.seat-card:hover{border-color:var(--blue);text-decoration:none}
.seat-head{display:flex;justify-content:space-between;align-items:center;gap:8px}.seat-head h3{margin:0;font-size:15px}.chosen{font-weight:700;margin:10px 0 6px}.metrics{display:flex;gap:12px;flex-wrap:wrap;color:var(--muted);font-size:12px}.metrics b{color:var(--ink)}.seat-card p{color:var(--muted);font-size:12px;margin:10px 0 0}.card-link{display:inline-block;margin-top:10px;font-size:12px;color:var(--blue)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin:12px 0}.scroll{overflow-x:auto}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px 9px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);background:var(--panel)}
th span{display:block;text-transform:none;letter-spacing:0;font-weight:400;margin-top:2px}.num{text-align:right;font-variant-numeric:tabular-nums}.seat-label{width:150px;font-size:13px}.seat-label span{display:block;color:var(--muted);font-size:11px;margin-top:2px}
.cell{min-width:170px}.cell.measured{background:var(--panel-2)}.cell.pilot{background:var(--amber-bg)}.cell.failed,.cell.incomplete{background:var(--red-bg)}.cell.chosen{box-shadow:inset 0 0 0 2px var(--green)}.untested{color:var(--muted);text-align:center}
.score{font-size:18px;font-weight:750;letter-spacing:-.02em}.score span{font-size:11px;color:var(--muted);font-weight:500}.meta{font-size:11px;color:var(--muted)}.chosen-label{font-size:10px;font-weight:750;text-transform:uppercase;color:var(--green);margin-top:4px}.status-warn{font-size:11px;color:var(--amber);margin-top:4px}.no-score{font-size:12px;color:var(--muted)}
.badge{display:inline-block;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:750;text-transform:uppercase;letter-spacing:.04em}.badge.measured{color:var(--green);background:var(--green-bg)}.badge.pilot{color:var(--amber);background:var(--amber-bg)}.badge.failed,.badge.incomplete,.badge.partial,.badge.none{color:var(--red);background:var(--red-bg)}.badge.complete{color:var(--green);background:var(--green-bg)}.badge.short{color:var(--amber);background:var(--amber-bg)}
.chosen-row{background:var(--green-bg)}.sub{display:block;color:var(--muted);font-size:11px}.ok{color:var(--green);font-weight:700}.bad{color:var(--red);font-weight:700}.selected-run{background:var(--green-bg)}
.cost-row{display:grid;grid-template-columns:220px 1fr 100px;gap:10px;align-items:center;margin:7px 0}.track{height:13px;background:var(--track);border-radius:999px;overflow:hidden}.bar{height:100%;background:linear-gradient(90deg,#2563eb,#7aa2ff);border-radius:999px}.amount{text-align:right;font-variant-numeric:tabular-nums;font-size:12px}
.total{display:flex;justify-content:space-between;border-top:2px solid var(--line);margin-top:10px;padding-top:8px;font-weight:750}.fine{color:var(--muted);font-size:12px}.callout{background:var(--green-bg);border-left:4px solid var(--green);padding:12px 14px;border-radius:8px;margin:14px 0}
.explainer{background:var(--panel);border-left:4px solid var(--blue)}.explainer p{margin:6px 0;font-size:12px;color:var(--muted)}
.decision{border-left:4px solid var(--green)}.decision-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px}.decision-head h3{margin:0}.decision-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.decision-grid .label{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}.decision-grid .ci{display:block;font-size:12px;color:var(--muted)}.decision-grid .ci span{color:var(--ink)}.decision-grid p{margin:6px 0 0;font-size:12px}.decision-note{border-top:1px solid var(--line);margin-top:12px;padding-top:10px}.decision-note p{margin:6px 0;font-size:13px}.tiebreaker{max-width:460px;font-size:12px;color:var(--muted)}
.task-list{display:grid;gap:12px}.task-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}.task-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.task-head h3{margin:0;font-size:15px}.question{color:var(--ink);margin:4px 0 0;font-size:13px}.what{color:var(--muted);margin:4px 0 0;font-size:12px}.task-id{color:var(--muted);font:11px ui-monospace,SFMono-Regular,Consolas,monospace;white-space:nowrap}
.option-legend{display:flex;gap:14px;flex-wrap:wrap;margin:10px 0 6px;padding:8px 10px;background:var(--panel);border-radius:8px;font-size:12px}.option-legend b{color:var(--muted);font-weight:650}.option-legend span b{color:var(--ink)}
.score-chips{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.chip{display:inline-flex;gap:6px;align-items:center;padding:4px 8px;border:1px solid var(--line);border-radius:999px;font-size:12px;background:var(--panel)}.chip b{font-variant-numeric:tabular-nums}.chip.failed{border-color:var(--red);color:var(--red);background:var(--red-bg)}
.miss{margin:8px 0 2px;font-size:12px}.miss b{font-size:12px}.miss ul{margin:4px 0 0 16px}.miss li{margin:2px 0}.miss.ok{color:var(--muted)}.checks{margin:6px 0 0 16px;font-size:12px;color:var(--muted)}.checks li{margin:3px 0}.weight{color:var(--muted);font-size:10px;border:1px solid var(--line);border-radius:999px;padding:1px 5px;margin-left:4px}
.diff{margin:10px 0;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--panel)}.diff-head{display:flex;justify-content:space-between;gap:10px;font-size:12px;margin-bottom:6px}.diff-head span{color:var(--muted)}.diff-counts{display:flex;gap:8px;flex-wrap:wrap;font-size:11px}.diff-counts span{padding:2px 7px;border-radius:999px;border:1px solid var(--line)}.diff-counts .both{color:var(--green);background:var(--green-bg)}.diff-counts .only-first{color:var(--blue);background:var(--blue-bg)}.diff-counts .only-second{color:var(--amber);background:var(--amber-bg)}.diff-counts .neither{color:var(--muted)}.diff-list{margin-top:8px;font-size:12px}.diff-list ul{margin:4px 0 0 16px}
.unique-block{margin:14px 0}.unique-block details{margin:6px 0}
.sev{font-size:10px;font-weight:750;text-transform:uppercase;padding:1px 5px;border-radius:4px;margin-right:5px}.sev.blocker{color:var(--red);background:var(--red-bg)}.sev.major{color:var(--amber);background:var(--amber-bg)}.sev.minor{color:var(--blue);background:var(--blue-bg)}
.defect-list{margin-top:8px}.defect-row{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)}.defect-title{font-weight:650}.defect-meta{color:var(--muted);font-size:11px;margin-top:2px}.result{font-weight:750;font-size:12px}.result.caught{color:var(--green)}.result.missed{color:var(--red)}details summary{cursor:pointer;color:var(--blue);font-size:12px;margin-top:8px}
.shot-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0}.shot-grid figure{margin:0;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--panel)}.shot-grid img{display:block;width:100%;height:auto}.shot-grid figcaption{font-size:10px;color:var(--muted);padding:4px 6px}
.reproduce pre{white-space:pre-wrap;word-break:break-word;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px;font-size:11px;color:var(--ink)}
ul{margin:0;padding-left:18px}li{margin:5px 0}.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}
footer{max-width:1280px;margin:0 auto;padding:20px 28px 40px;color:var(--muted);font-size:12px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
@media(max-width:1100px){.kpis{grid-template-columns:repeat(3,1fr)}.seat-grid{grid-template-columns:repeat(2,1fr)}.grid2,.decision-grid{grid-template-columns:1fr}.shot-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:620px){main{padding:18px}.kpis{grid-template-columns:repeat(2,1fr)}.seat-grid{grid-template-columns:1fr}.shot-grid{grid-template-columns:1fr 1fr}}`;

writePage("index.html", homePage());
for (const seat of meta.seats) writePage(`seats/${seat.id}.html`, seatPage(seat.id));
writePage("runs.html", runsPage());
writePage("method.html", methodPage());
writePage("brief.html", briefPage());
writePage("data.json", `${JSON.stringify({ meta, findings }, null, 2)}\n`);
writePage("site.css", css);
copyShots();

console.log(`wrote ${outRoot}`);
console.log(`  pages: index, ${meta.seats.length} seats, runs, method, options`);
console.log(`  spend: ${usd(findings.costs.totalRecorded)}`);