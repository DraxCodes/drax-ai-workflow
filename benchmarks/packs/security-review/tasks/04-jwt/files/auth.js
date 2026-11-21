import express from "express";
import jwt from "jsonwebtoken";
import { timingSafeEqual } from "node:crypto";

const app = express();
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const API_KEY = process.env.API_KEY;

function verifyApiKey(given) {
  if (!given || !API_KEY) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(API_KEY);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authenticate(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  const payload = jwt.decode(token);
  if (!payload) return res.sendStatus(401);
  req.user = payload;
  next();
}

app.get("/admin", authenticate, (req, res) => {
  if (req.user.role !== "admin") return res.sendStatus(403);
  res.json({ ok: true });
});

app.post("/keys", (req, res) => {
  if (!verifyApiKey(req.headers["x-api-key"])) return res.sendStatus(401);
  res.json({ ok: true });
});

app.listen(3000);