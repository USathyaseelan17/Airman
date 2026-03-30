import express from "express";
import { authMiddleware } from "./middleware/auth";

// Route imports (we'll create these next)
import peopleRouter from "./routes/people";
import evaluationsRouter from "./routes/evaluations";

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Global Middleware ────────────────────────────────────────────────────────
app.use(express.json());

// Health check — no auth required
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "skynet", timestamp: new Date().toISOString() });
});

// ─── Protected API Routes ─────────────────────────────────────────────────────
// authMiddleware runs on every /api/* request
app.use("/api", authMiddleware);
app.use("/api/people", peopleRouter);
app.use("/api/evaluations", evaluationsRouter);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal Server Error", message: err.message });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Skynet API running on port ${PORT}`);
});

export default app;