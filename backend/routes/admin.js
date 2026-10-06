/** Owner-only endpoints, unlocked with the ADMIN_KEY header. */
import { Router } from "express";
import { db, ORDER_STATUSES } from "../db.js";
import { requireAdmin } from "../auth.js";

const router = Router();

const selectItems = db.prepare(
  "SELECT product_id AS productId, name, unit_price AS unitPrice, quantity FROM order_items WHERE order_id = ?"
);

function toAdminOrder(row) {
  return {
    code: row.code,
    status: row.status,
    customer: { name: row.customer_name, email: row.customer_email, phone: row.phone },
    paymentMethod: row.payment_method,
    paymentRef: row.payment_ref,
    subtotal: row.subtotal,
    deliveryFee: row.delivery_fee,
    total: row.total,
    placedAt: row.placed_at,
    updatedAt: row.updated_at,
    address: {
      label: row.address_label,
      recipient: row.recipient,
      street: row.street,
      city: row.city,
      notes: row.notes,
    },
    items: selectItems.all(row.id),
  };
}

router.get("/orders", requireAdmin, (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "";
  if (status && !ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: "Unknown status filter" });
  }
  const rows = status
    ? db
        .prepare(
          `SELECT o.*, u.name AS customer_name, u.email AS customer_email
             FROM orders o JOIN users u ON u.id = o.user_id
            WHERE o.status = ? ORDER BY o.id DESC LIMIT 200`
        )
        .all(status)
    : db
        .prepare(
          `SELECT o.*, u.name AS customer_name, u.email AS customer_email
             FROM orders o JOIN users u ON u.id = o.user_id
            ORDER BY o.id DESC LIMIT 200`
        )
        .all();

  res.json({ orders: rows.map(toAdminOrder), statuses: ORDER_STATUSES });
});

router.patch("/orders/:code/status", requireAdmin, (req, res) => {
  const status = typeof req.body?.status === "string" ? req.body.status : "";
  if (!ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: "Unknown order status" });
  }
  const row = db.prepare("SELECT id FROM orders WHERE code = ?").get(req.params.code);
  if (!row) {
    return res.status(404).json({ error: "Order not found" });
  }
  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
    status,
    row.id
  );
  res.json({ code: req.params.code, status });
});

export default router;
