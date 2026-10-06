/** Public menu endpoints. */
import { Router } from "express";
import { listProducts } from "../db.js";

const router = Router();

router.get("/products", (_req, res) => {
  res.json({ products: listProducts() });
});

router.get("/categories", (_req, res) => {
  const categories = [...new Set(listProducts().map((product) => product.category))];
  res.json({ categories: ["All", ...categories] });
});

export default router;
