/** Saved menu items per customer. */
import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();

const productExists = db.prepare("SELECT 1 FROM products WHERE id = ?");
const selectFavorites = db.prepare(
  "SELECT product_id AS productId FROM favorites WHERE user_id = ? ORDER BY created_at DESC"
);
const insertFavorite = db.prepare(
  "INSERT INTO favorites (user_id, product_id) VALUES (?, ?) ON CONFLICT DO NOTHING"
);
const deleteFavorite = db.prepare("DELETE FROM favorites WHERE user_id = ? AND product_id = ?");

const listIds = (userId) => selectFavorites.all(userId).map((row) => row.productId);

router.get("/", requireAuth, (req, res) => {
  res.json({ favorites: listIds(req.user.id) });
});

router.post("/", requireAuth, (req, res) => {
  const productId = typeof req.body?.productId === "string" ? req.body.productId : "";
  if (!productExists.get(productId)) {
    return res.status(400).json({ error: "Unknown menu item" });
  }
  insertFavorite.run(req.user.id, productId);
  res.status(201).json({ favorites: listIds(req.user.id) });
});

router.delete("/:productId", requireAuth, (req, res) => {
  deleteFavorite.run(req.user.id, req.params.productId);
  res.json({ favorites: listIds(req.user.id) });
});

export default router;
