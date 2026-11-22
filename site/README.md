# Council benchmark site

A static, self-hosted report for the council-seat benchmark evidence. It reads
the run records from a project, writes plain HTML/JSON, and serves it through
nginx behind your existing reverse proxy.

## Files

```
site/
  collect.mjs        project run dirs -> data/findings.json
  build.mjs          data + meta -> public/ HTML and data.json
  serve.mjs          local preview server (no Docker)
  data/meta.json     curated: seats, choices, model names, notes, commits
  data/findings.json generated: runs, candidate rows, per-task summaries
  public/            generated site; not committed
  nginx.conf         static server config, listens on 80
  docker-compose.yml nginx on 127.0.0.1:${SITE_PORT:-8080}
  Dockerfile         optional self-contained image
  update.sh          collect + build + compose up
  update.ps1         Windows equivalent
```

## Build and preview

```sh
node site/collect.mjs --project ../personal-website
node site/build.mjs
node site/serve.mjs
```

Open `http://localhost:4174/`.

`collect.mjs` reads:

- `<project>/.scratch/benchmarks/*/run.json` and `records.json`
- `<project>/.scratch/runs/runs.jsonl` for probe spend

The sources for the current report are the measured 16k runs, the 4k pilot runs,
the ten-task council runs, and the visual-pack final run. If a source is missing,
the collector prints it and leaves that section empty rather than inventing data.

The `sources` map at the top of `collect.mjs` is the curation point. When a new
run supersedes one of these, point that entry at the new run directory (or add it
as a pilot source) and run `collect` again. The run ledger discovers all run
directories automatically; only the per-task detail sources are curated.

## Docker

```sh
docker compose -f site/docker-compose.yml up -d
```

The container binds to **127.0.0.1:8080** by default, so it is reachable by a
reverse proxy on the same host and not directly from the internet. Set
`SITE_PORT` to change it. Put TLS and the public hostname on the proxy; nginx
serves plain HTTP on port 80.

The compose file bind-mounts `site/public` read-only. After a rebuild, nginx
serves the new files immediately; no restart is needed.

## Keep it up to date

On the host:

```sh
./site/update.sh
```

or on Windows:

```powershell
.\site\update.ps1
```

Both run `collect` and `build`, then `docker compose up -d`. `PROJECT_DIR` (or
`-Project`) selects the project checkout. The server needs Node 22 to collect
and build; if it does not have Node, run the two commands on the machine that
ran the benchmarks and copy `site/public/` to the server.

A simple cron entry:

```cron
*/30 * * * * cd /srv/drax-ai-workflow && ./site/update.sh >> /var/log/council-benchmarks.log 2>&1
```

If the benchmark runs arrive through git rather than a live project checkout,
run `collect` and `build` in CI on each tag or release and publish
`site/public/` to the host.

## Publishing policy

The site publishes summaries only:

- model ids and lineage, pack/protocol/version/hash, dates
- catch, precision, false positives, scored/failed counts, cost, max tokens
- per-task defect and criterion summaries

It does not publish API keys, raw provider responses, project `.scratch` paths,
or full active-pack keys. If you later want full keys, add them deliberately and
consider the gaming risk while a pack is active.

## Data contract

`data/meta.json` is curated: seat names, the chosen model, the reason, model
display names/prices, protocol notes and commits. Edit this when a decision
changes.

`data/findings.json` is generated. It contains:

- `runs`: every benchmark directory with a run record
- `costs`: run spend, probe spend, total
- `risk`, `chair`, `shape`, `experience`: candidate rows and per-task rows
- `visual`: candidate row, caught/missed defects, weighted catch

`build.mjs` renders `public/index.html`, `public/seats/<id>.html`,
`public/runs.html`, `public/method.html`, `public/data.json` and `public/site.css`.
Add a page by adding a render function and a `writePage` call.

## Notes

- `public/` is generated and gitignored. Commit `data/meta.json` and
  `data/findings.json` so a server can rebuild without the project checkout.
- The report is evidence, not a binding. The base still names no model in a slot.
- Measured rows need ten distinct tasks and zero failed tasks; one sample is
  medium confidence. The visual pack is a one-task pilot.
- The risk GLM row used min80 prices and the Qwen row used list; the method page
  states the basis.