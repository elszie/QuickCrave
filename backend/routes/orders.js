/**
 * Orders.
 * Prices and totals are always recomputed from the products table, so a
 * tampered client can never change what an order costs.
 */
import { Router } from "express";
import { db, DELIVERY_FEE, PAYMENT_METHODS, nextOrderCode } from "../db.js";
import { requireAuth } from "../auth.js";
import { readAddress, readPayment, readQuantity } from "../validate.js";

const router = Router();

const selectOrder = db.prepare("SELECT * FROM orders WHERE id = ?");
const selectOrderByCode = db.prepare("SELECT * FROM orders WHERE code = ? AND user_id = ?");
const selectItems = db.prepare(
  "SELECT product_id AS productId, name, unit_price AS unitPrice, quantity FROM order_items WHERE order_id = ?"
);

function toOrder(row, { withItems = true } = {}) {
  return {
    code: row.code,
    status: row.status,
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
      phone: row.phone,
      street: row.street,
      city: row.city,
      notes: row.notes,
    },
    items: withItems ? selectItems.all(row.id) : [],
  };
}

router.get("/", requireAuth, (req, res) => {
  const rows = db
    .prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC")
    .all(req.user.id);
  res.json({ orders: rows.map((row) => toOrder(row)) });
});

router.post("/", requireAuth, (req, res, next) => {
  try {
    const body = req.body || {};

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({ error: "Your cart is empty" });
    }
    if (body.items.length > 60) {
      return res.status(400).json({ error: "Too many different items in one order" });
    }

    const catalogue = new Map(
      db.prepare("SELECT id, name, price FROM products").all().map((row) => [row.id, row])
    );

    const lines = [];
    for (const rawItem of body.items) {
      const productId = typeof rawItem?.productId === "string" ? rawItem.productId : "";
      const product = catalogue.get(productId);
      if (!product) {
        return res.status(400).json({ error: `Unknown item in cart: ${productId || "(missing)"}` });
      }
      const quantity = readQuantity(rawItem?.quantity);
      if (!quantity.ok) {
        return res.status(400).json({ error: quantity.error });
      }
      lines.push({
        productId,
        name: product.name,
        unitPrice: product.price,
        quantity: quantity.value,
      });
    }

    const payment = readPayment(body, PAYMENT_METHODS);
    if (!payment.ok) {
      return res.status(400).json({ error: payment.error });
    }

    const address = readAddress(body.address);
    if (!address.ok) {
      return res.status(400).json({ error: address.error });
    }

    const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    const total = subtotal + DELIVERY_FEE;
    const code = nextOrderCode();
    const details = address.value;

    const insertOrder = db.transaction(() => {
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO orders
             (code, user_id, status, payment_method, payment_ref, subtotal, delivery_fee, total,
              address_label, recipient, phone, street, city, notes)
           VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          code,
          req.user.id,
          payment.value.method,
          payment.value.reference,
          subtotal,
          DELIVERY_FEE,
          total,
          details.label,
          details.recipient,
          details.phone,
          details.street,
          details.city,
          details.notes
        );

      const insertItem = db.prepare(
        `INSERT INTO order_items (order_id, product_id, name, unit_price, quantity)
         VALUES (?, ?, ?, ?, ?)`
      );
      for (const line of lines) {
        insertItem.run(lastInsertRowid, line.productId, line.name, line.unitPrice, line.quantity);
      }
      return lastInsertRowid;
    });

    const orderId = insertOrder();
    res.status(201).json({ order: toOrder(selectOrder.get(orderId)) });
  } catch (error) {
    next(error);
  }
});

router.get("/:code", requireAuth, (req, res) => {
  const row = selectOrderByCode.get(req.params.code, req.user.id);
  if (!row) {
    return res.status(404).json({ error: "Order not found" });
  }
  res.json({ order: toOrder(row) });
});

/** Lets a customer attach or correct an e-wallet reference number. */
router.post("/:code/payment", requireAuth, (req, res) => {
  const row = selectOrderByCode.get(req.params.code, req.user.id);
  if (!row) {
    return res.status(404).json({ error: "Order not found" });
  }
  if (row.status === "cancelled" || row.status === "delivered") {
    return res.status(409).json({ error: "This order can no longer be changed" });
  }
  const payment = readPayment(
    { paymentMethod: req.body?.paymentMethod || row.payment_method, paymentRef: req.body?.paymentRef },
    PAYMENT_METHODS
  );
  if (!payment.ok) {
    return res.status(400).json({ error: payment.error });
  }

  db.prepare(
    "UPDATE orders SET payment_method = ?, payment_ref = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(payment.value.method, payment.value.reference, row.id);

  res.json({ order: toOrder(selectOrder.get(row.id)) });
});

router.post("/:code/cancel", requireAuth, (req, res) => {
  const row = selectOrderByCode.get(req.params.code, req.user.id);
  if (!row) {
    return res.status(404).json({ error: "Order not found" });
  }
  if (!["pending", "confirmed"].includes(row.status)) {
    return res.status(409).json({
      error: "This order is already being prepared. Please contact the store to cancel.",
    });
  }
  db.prepare(
    "UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?"
  ).run(row.id);

  res.json({ order: toOrder(selectOrder.get(row.id)) });
});

export default router;
