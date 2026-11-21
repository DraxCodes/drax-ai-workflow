import express from "express";
import { db } from "./db.js";
import { requireUser } from "./auth.js";

const app = express();
app.use(express.json());
app.use(requireUser);

app.get("/api/invoices/:id", (req, res) => {
  const invoice = db.invoices.find((row) => row.id === req.params.id);
  if (!invoice) return res.sendStatus(404);
  res.json(invoice);
});

app.delete("/api/invoices/:id", (req, res) => {
  const index = db.invoices.findIndex((row) => row.id === req.params.id);
  if (index === -1) return res.sendStatus(404);
  db.invoices.splice(index, 1);
  res.sendStatus(204);
});

app.get("/api/me", (req, res) => {
  res.json({ id: req.user.id, email: req.user.email });
});

app.listen(3000);