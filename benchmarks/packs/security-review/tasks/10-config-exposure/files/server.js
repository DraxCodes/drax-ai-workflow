import express from "express";
import cors from "cors";

const app = express();
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/debug/env", (req, res) => {
  res.json(process.env);
});

app.get("/debug/config", (req, res) => {
  res.json({
    region: process.env.AWS_REGION,
    bucket: process.env.S3_BUCKET,
    databaseUrl: process.env.DATABASE_URL,
  });
});

app.listen(3000);