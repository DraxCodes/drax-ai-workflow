import express from "express";

const app = express();

app.get("/proxy", async (req, res) => {
  const url = req.query.url;
  const upstream = await fetch(url);
  const body = await upstream.text();
  res.type(upstream.headers.get("content-type") || "text/plain").send(body);
});

const CDN = "https://cdn.example.com/avatars/";

app.get("/avatar/:id", async (req, res) => {
  if (!/^[a-z0-9-]+$/.test(req.params.id)) return res.sendStatus(400);
  const upstream = await fetch(`${CDN}${req.params.id}.png`);
  res.type("image/png").send(Buffer.from(await upstream.arrayBuffer()));
});

app.listen(3000);