#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPack } from "../tools/lib/benchmark.mjs";

const siteRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(siteRoot, "..");
const outRoot = join(siteRoot, "public");
const findings = JSON.parse(readFileSync(join(siteRoot, "data", "findings.json"), "utf8"));
const meta = JSON.parse(readFileSync(join(siteRoot, "data", "meta.json"), "utf8"));
const visualPack = loadPack(join(repoRoot, "benchmarks", "packs", "visual-project-list"));
const visualDefects = visualPack.tasks[0].key.defects;
const buildVersion = Date.now().toString(36);

const PACK_TO_SEAT = {
  "security-review": "risk",
  "council-chair": "chair",
  "council-shape": "shape",
  "council-experience": "experience",
  "visual-project-list": "blindspot",
};

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

function seatRows(id) {
  return id === "blindspot" ? findings.visual.row : findings[id].rows ?? [];
}

function seatData(id) {
  const seat = meta.seats.find((entry) => entry.id === id);
  const rows = seatRows(id);
  return {
    seat,
    rows,
    chosenRow: rows.find((row) => row.model === seat.chosen) ?? null,
    pack: Object.entries(PACK_TO_SEAT).find(([, seatId]) => seatId === id)?.[0] ?? null,
  };
}

const allModels = Object.keys(meta.modelInfo);
const testedEdges = meta.seats.reduce(
  (sum, seat) => sum + seatRows(seat.id).filter((row) => row.tier !== "failed").length,
  0,
);

function spendRows() {
  const byPack = new Map();
  for (const run of findings.runs) {
    byPack.set(run.pack, (byPack.get(run.pack) ?? 0) + (Number(run.spent) || 0));
  }
  const rows = Object.entries(byPack).map(([pack, value]) => ({
    label: PACK_TO_SEAT[pack] ? meta.seats.find((s) => s.id === PACK_TO_SEAT[pack]).name : pack,
    value,
  }));
  rows.push({ label: "Probes", value: findings.costs.probeSpend });
  return rows.sort((a, b) => b.value - a.value);
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

function kpis() {
  const measured = meta.seats.filter((seat) => seat.tier === "measured").length;
  return `<div class="kpis">
    <div class="kpi"><b>${meta.seats.length}</b><span>seats</span></div>
    <div class="kpi"><b>${measured}</b><span>measured</span></div>
    <div class="kpi"><b>${meta.seats.length - measured}</b><span>pilot</span></div>
    <div class="kpi"><b>${testedEdges}</b><span>tested edges</span></div>
    <div class="kpi"><b>${usd(findings.costs.totalRecorded)}</b><span>recorded spend</span></div>
    <div class="kpi"><b>${meta.tests}</b><span>tests passing</span></div>
  </div>`;
}

function seatCards() {
  return `<div class="seat-grid">${meta.seats
    .map((seat) => {
      const { chosenRow } = seatData(seat.id);
      return `<a class="seat-card" href="seats/${seat.id}.html">
        <div class="seat-head"><h3>${esc(seat.name)}</h3>${badge(seat.tier)}</div>
        <div class="chosen">${esc(modelName(seat.chosen))}</div>
        <div class="metrics">
          <span><b>${pct(chosenRow?.catch)}</b> catch</span>
          <span><b>${pct(chosenRow?.precision)}</b> precision</span>
          <span><b>${chosenRow?.scored ?? "n/a"}</b> scored</span>
        </div>
        <p>${esc(seat.reason)}</p>
      </a>`;
    })
    .join("")}</div>`;
}

function matrix() {
  const heads = allModels
    .map((model) => `<th>${esc(modelName(model))}<span>${esc(modelLineage(model))}</span></th>`)
    .join("");
  const rows = meta.seats
    .map((seat) => {
      const rows = seatRows(seat.id);
      const cells = allModels
        .map((model) => {
          const row = rows.find((entry) => entry.model === model);
          if (!row) return `<td class="untested">—</td>`;
          const chosen = seat.chosen === model;
          return `<td class="cell ${esc(row.tier)}${chosen ? " chosen" : ""}">
            <div class="score">${pct(row.catch)} <span>/ ${pct(row.precision)}</span></div>
            <div class="meta">${row.scored}/${row.scored + row.failed} · ${row.fp} FP · ${esc(row.maxTokens ?? "")}</div>
            ${chosen ? `<div class="chosen-label">chosen</div>` : ""}
          </td>`;
        })
        .join("");
      return `<tr><th class="seat-label">${esc(seat.name)}<span>${esc(modelName(seat.chosen))}</span></th>${cells}</tr>`;
    })
    .join("");
  return `<div class="card scroll"><table class="matrix"><thead><tr><th>Seat</th>${heads}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function costBars() {
  const rows = spendRows();
  const max = Math.max(...rows.map((row) => row.value), 0.000001);
  return `<div class="card">${rows
    .map(
      (row) => `<div class="cost-row">
        <div>${esc(row.label)}</div>
        <div class="track"><div class="bar" style="width:${Math.max(2, (row.value / max) * 100)}%"></div></div>
        <div class="amount">${usd(row.value)}</div>
      </div>`,
    )
    .join("")}
    <div class="total"><span>Recorded total</span><span>${usd(findings.costs.totalRecorded)}</span></div>
    <p class="fine">Cap ${usd(meta.capUsd)}. Visual-review image calls are not costed by the tool; the recorded total comes from benchmark run records and probe entries.</p>
  </div>`;
}

function runTable(runs = findings.runs) {
  return `<div class="card scroll"><table>
    <thead><tr><th>Run</th><th>Pack</th><th class="num">Max tokens</th><th class="num">Records</th><th class="num">Failed</th><th class="num">Spend</th></tr></thead>
    <tbody>${runs
      .map(
        (run) => `<tr>
          <td>${esc(run.dir)}</td>
          <td>${esc(run.pack)}</td>
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
      <h2>Current seats</h2>
      ${seatCards()}
      <h2>Evidence matrix</h2>
      <p class="lede">Catch / precision on the latest measured or pilot group. A dash means untested.</p>
      ${matrix()}
      <h2>Spend and runs</h2>
      <div class="grid2">
        ${costBars()}
        <div class="card">
          <h3>Run ledger</h3>
          <p class="fine">Every benchmark directory with a run record. Failed runs are retained.</p>
          ${runTable()}
        </div>
      </div>`,
  });
}

function candidateTable(id) {
  const rows = seatRows(id);
  return `<div class="card scroll"><table>
    <thead><tr><th>Model</th><th>Tier</th><th class="num">Scored</th><th class="num">Catch</th><th class="num">Precision</th><th class="num">FP</th><th class="num">Cost / task</th><th class="num">Unique</th></tr></thead>
    <tbody>${rows
      .map(
        (row) => `<tr class="${row.model === meta.seats.find((s) => s.id === id).chosen ? "chosen-row" : ""}">
          <td>${esc(modelName(row.model))}<span class="sub">${esc(modelLineage(row.model))}</span></td>
          <td>${badge(row.tier)}</td>
          <td class="num">${row.scored}/${row.scored + row.failed}</td>
          <td class="num">${pct(row.catch)}</td>
          <td class="num">${pct(row.precision)}</td>
          <td class="num">${row.fp}</td>
          <td class="num">${usd(row.costPerTask)}</td>
          <td class="num">${row.unique ?? "—"}</td>
        </tr>`,
      )
      .join("")}</tbody>
  </table></div>`;
}

function riskTasks() {
  const rows = findings.risk.tasks;
  return `<div class="card scroll"><table>
    <thead><tr><th>Task</th><th class="num">Key</th><th class="num">GLM 5.3</th><th class="num">Qwen 3.8 Flash</th><th>Qwen missed</th></tr></thead>
    <tbody>${rows
      .map(
        (row) => `<tr>
          <td>${esc(row.task)}</td>
          <td class="num">${row.key}</td>
          <td class="num">${row.glmCaught}/${row.key}${row.glmFp ? ` · ${row.glmFp} FP` : ""}</td>
          <td class="num">${row.qwenCaught}/${row.key}${row.qwenFp ? ` · ${row.qwenFp} FP` : ""}</td>
          <td>${row.qwenMissed.length ? row.qwenMissed.map(esc).join("<br>") : "—"}</td>
        </tr>`,
      )
      .join("")}</tbody>
  </table></div>`;
}

function councilTasks(id) {
  const data = findings[id];
  const models = data.models ?? [];
  const head = models
    .map((model) => `<th class="num">${esc(modelName(model))}</th>`)
    .join("");
  const rows = data.tasks
    .map((task) => {
      const cells = models
        .map((model) => {
          const cell = task.models[model];
          return `<td class="num">${cell.ok ? `${cell.caught}/${task.total}` : "failed"}</td>`;
        })
        .join("");
      const details = models
        .map((model) => {
          const cell = task.models[model];
          if (!cell.ok) return `<b>${esc(modelName(model))}:</b> failed`;
          if (!cell.missed.length) return "";
          return `<b>${esc(modelName(model))}:</b> ${cell.missed.map(esc).join("; ")}`;
        })
        .filter(Boolean)
        .join("<br>");
      return `<tr><td>${esc(task.task)}</td><td class="num">${task.total}</td>${cells}<td>${details || "—"}</td></tr>`;
    })
    .join("");
  return `<div class="card scroll"><table>
    <thead><tr><th>Task</th><th class="num">Total</th>${head}<th>Missed criteria</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function visualTasks() {
  const caught = new Set(findings.visual.caught);
  const rows = visualDefects
    .map((defect) => {
      const isCaught = caught.has(defect.id);
      return `<tr class="${isCaught ? "" : "miss-row"}">
        <td>${esc(defect.id)}</td>
        <td>${esc(defect.shot)}</td>
        <td>${esc(defect.region)}</td>
        <td>${esc(defect.severity)}</td>
        <td>${isCaught ? '<span class="ok">caught</span>' : '<span class="bad">missed</span>'}</td>
      </tr>`;
    })
    .join("");
  return `<div class="card scroll"><table>
    <thead><tr><th>Defect</th><th>Shot</th><th>Region</th><th>Severity</th><th>Result</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function seatPage(id) {
  const { seat, rows, chosenRow, pack } = seatData(id);
  const runs = findings.runs.filter((run) => run.pack === pack);
  const taskBlock =
    id === "risk"
      ? riskTasks()
      : id === "blindspot"
        ? visualTasks()
        : councilTasks(id);
  const extra =
    id === "blindspot"
      ? `<p class="lede">${findings.visual.weighted} weighted catch · ${findings.visual.fp} false positives · ${findings.visual.keyCount} keyed defects across ${findings.visual.shotCount} shots. This is a one-task pilot.</p>`
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
      <h2>Candidates</h2>
      ${candidateTable(id)}
      <h2>Per-task result</h2>
      <p class="fine">${id === "risk" ? "Covers the measured 16k group; the 4k pilots are in the candidate table." : id === "blindspot" ? "Every keyed visual defect, including the misses." : "Covers the measured group; pilot candidates are in the candidate table."}</p>
      ${taskBlock}
      <h2>Runs</h2>
      ${runTable(runs)}`,
  });
}

function runsPage() {
  return layout({
    title: "Runs",
    active: "runs",
    body: `<h1>Runs</h1>
      <p class="lede">All benchmark directories with a run record. A failed record is kept, not hidden.</p>
      ${runTable()}
      <p class="fine">Recorded total ${usd(findings.costs.totalRecorded)}; probes ${usd(findings.costs.probeSpend)}; benchmark runs ${usd(findings.costs.runSpend)}.</p>`,
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
          <h3>Price basis</h3><p>The run record carries the declared price. Risk GLM used min80; Qwen used list; council and visual used min80. Qwen is about 13× cheaper like-for-like.</p></div>
      </div>
      <div class="card"><h3>Evidence tiers</h3>
        <p><b>Measured</b>: at least ten distinct tasks and zero failed tasks. <b>Pilot</b>: fewer tasks, or any failed task. <b>Incomplete</b>: no scored task. One sample gives medium confidence; <span class="mono">--samples 2</span> is refused by the current runner.</p>
        <p><b>Max-token groups:</b> a record only ranks with another record that shares pack hash, protocol, <span class="mono">max_tokens</span> and retries.</p>
      </div>
      <div class="card"><h3>Commits</h3><ul>${meta.commits.map((commit) => `<li>${esc(commit)}</li>`).join("")}</ul></div>`,
  });
}

function writePage(path, html) {
  const file = join(outRoot, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
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
.seat-head{display:flex;justify-content:space-between;align-items:center;gap:8px}.seat-head h3{margin:0;font-size:15px}.chosen{font-weight:700;margin:10px 0 6px}.metrics{display:flex;gap:12px;flex-wrap:wrap;color:var(--muted);font-size:12px}.metrics b{color:var(--ink)}.seat-card p{color:var(--muted);font-size:12px;margin:10px 0 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin:12px 0}.scroll{overflow-x:auto}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px 9px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);background:var(--panel)}
th span{display:block;text-transform:none;letter-spacing:0;font-weight:400;margin-top:2px}.num{text-align:right;font-variant-numeric:tabular-nums}.seat-label{width:150px;font-size:13px}.seat-label span{display:block;color:var(--muted);font-size:11px;margin-top:2px}
.cell{min-width:150px}.cell.measured{background:var(--panel-2)}.cell.pilot{background:var(--amber-bg)}.cell.failed{background:var(--red-bg)}.cell.chosen{box-shadow:inset 0 0 0 2px var(--green)}.untested{color:var(--muted);text-align:center}
.score{font-size:17px;font-weight:750;letter-spacing:-.02em}.score span{font-size:11px;color:var(--muted);font-weight:500}.meta{font-size:11px;color:var(--muted)}.chosen-label{font-size:10px;font-weight:750;text-transform:uppercase;color:var(--green);margin-top:4px}
.badge{display:inline-block;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:750;text-transform:uppercase;letter-spacing:.04em}.badge.measured{color:var(--green);background:var(--green-bg)}.badge.pilot{color:var(--amber);background:var(--amber-bg)}.badge.failed,.badge.incomplete{color:var(--red);background:var(--red-bg)}
.chosen-row{background:var(--green-bg)}.sub{display:block;color:var(--muted);font-size:11px}.ok{color:var(--green);font-weight:700}.bad{color:var(--red);font-weight:700}.miss-row{background:var(--red-bg)}
.cost-row{display:grid;grid-template-columns:150px 1fr 100px;gap:10px;align-items:center;margin:7px 0}.track{height:13px;background:var(--track);border-radius:999px;overflow:hidden}.bar{height:100%;background:linear-gradient(90deg,#2563eb,#7aa2ff);border-radius:999px}.amount{text-align:right;font-variant-numeric:tabular-nums;font-size:12px}
.total{display:flex;justify-content:space-between;border-top:2px solid var(--line);margin-top:10px;padding-top:8px;font-weight:750}.fine{color:var(--muted);font-size:12px}.callout{background:var(--green-bg);border-left:4px solid var(--green);padding:12px 14px;border-radius:8px;margin:14px 0}
ul{margin:0;padding-left:18px}li{margin:5px 0}.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}
footer{max-width:1280px;margin:0 auto;padding:20px 28px 40px;color:var(--muted);font-size:12px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
@media(max-width:1100px){.kpis{grid-template-columns:repeat(3,1fr)}.seat-grid{grid-template-columns:repeat(2,1fr)}.grid2{grid-template-columns:1fr}}
@media(max-width:620px){main{padding:18px}.kpis{grid-template-columns:repeat(2,1fr)}.seat-grid{grid-template-columns:1fr}}`;

writePage("index.html", homePage());
for (const seat of meta.seats) writePage(`seats/${seat.id}.html`, seatPage(seat.id));
writePage("runs.html", runsPage());
writePage("method.html", methodPage());
writePage(
  "data.json",
  `${JSON.stringify({ meta, findings }, null, 2)}\n`,
);
writePage("site.css", css);

console.log(`wrote ${outRoot}`);
console.log(`  pages: index, ${meta.seats.length} seats, runs, method`);
console.log(`  spend: ${usd(findings.costs.totalRecorded)}`);