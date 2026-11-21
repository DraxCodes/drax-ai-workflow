import express from "express";
import { db } from "./db.js";
import { logger } from "./logger.js";

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  logger.info("request", {
    id: req.headers["x-request-id"],
    authorization: req.headers.authorization,
  });
  next();
});

app.get("/api/users/:id", async (req, res) => {
  const user = await db.users.findById(req.params.id);
  if (!user) return res.sendStatus(404);
  logger.info("user loaded", user);
  res.json(user);
});

app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message, stack: err.stack });
});

app.listen(3000);