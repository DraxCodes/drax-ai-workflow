import express from "express";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const app = express();
const UPLOAD_DIR = "/srv/uploads";
const PUBLIC = new Map([
  ["logo", "logo.png"],
  ["terms", "terms.txt"],
]);

app.get("/files/:name", async (req, res) => {
  const file = join(UPLOAD_DIR, req.params.name);
  const body = await readFile(file);
  res.type("application/octet-stream").send(body);
});

app.get("/public/:name", async (req, res) => {
  const mapped = PUBLIC.get(req.params.name);
  if (!mapped) return res.sendStatus(404);
  const body = await readFile(join(UPLOAD_DIR, mapped));
  res.send(body);
});

app.listen(3000);