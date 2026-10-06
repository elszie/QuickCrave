/**
 * QuickCrave API + storefront host.
 *
 * Run the shop:      pnpm install && node server.js
 * Then open:         http://localhost:3000
 *
 * The same server also serves ../index.html, so the whole shop is one process.
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";

import authRoutes from "./routes/auth.js";
import productRoutes from "./routes/products.js";
import orderRoutes from "./routes/orders.js";
import favoriteRoutes from "./routes/favorites.js";
import addressRoutes from "./routes/addresses.js";
import adminRoutes from "./routes/admin.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shopDir = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 3000);
const ORIGINS = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(cors({ origin: ORIGINS.includes("*") ? true : ORIGINS }));
app.use(express.json({ limit: "128kb" }));

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in a few minutes." },
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "quickcrave", time: new Date().toISOString() });
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/favorites", favoriteRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/admin", adminRoutes);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Unknown endpoint" });
});

// Serve the storefront only. The backend sources and the database stay private.
app.use((req, res, next) => {
  if (req.path.startsWith("/backend")) {
    return res.status(404).json({ error: "Not found" });
  }
  return next();
});
app.use(express.static(shopDir, { index: "index.html", extensions: ["html"] }));
app.get("*", (_req, res) => {
  res.sendFile(path.join(shopDir, "index.html"));
});

// Keep the four arguments: Express only treats this as an error handler then.
app.use((error, _req, res, _next) => {
  console.error("[quickcrave]", error);
  res.status(500).json({ error: "Unexpected server error" });
});

app.listen(PORT, () => {
  console.log(`QuickCrave is running on http://localhost:${PORT}`);
  if (ORIGINS.includes("*")) {
    console.log("[quickcrave] CORS_ORIGIN=* — set it to your storefront domain in production.");
  }
});
