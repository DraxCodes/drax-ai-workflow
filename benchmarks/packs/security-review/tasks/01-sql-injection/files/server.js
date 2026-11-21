import express from "express";
import Database from "better-sqlite3";

const app = express();
const db = new Database("app.db");

app.get("/items", (req, res) => {
  const rows = db.prepare("SELECT id, name FROM items WHERE name = ?").all(req.query.name);
  res.json(rows);
});

app.get("/search", (req, res) => {
  const term = req.query.q ?? "";
  const sql = `SELECT id, name, price FROM items WHERE name LIKE '%${term}%'`;
  const rows = db.prepare(sql).all();
  res.json(rows);
});

app.post("/users", (req, res) => {
  const { name, email } = req.body;
  db.prepare(`INSERT INTO users (name, email) VALUES ('${name}', '${email}')`).run();
  res.status(201).json({ ok: true });
});

app.listen(3000);