/** Delivery addresses per customer. */
import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";
import { readAddress } from "../validate.js";

const router = Router();

const selectAddresses = db.prepare(
  `SELECT id, label, recipient, phone, street, city, notes, is_default AS isDefault
     FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id ASC`
);
const selectAddress = db.prepare("SELECT * FROM addresses WHERE id = ? AND user_id = ?");

function applyDefault(userId, addressId) {
  db.prepare("UPDATE addresses SET is_default = 0 WHERE user_id = ?").run(userId);
  db.prepare("UPDATE addresses SET is_default = 1 WHERE id = ? AND user_id = ?").run(
    addressId,
    userId
  );
}

router.get("/", requireAuth, (req, res) => {
  res.json({ addresses: selectAddresses.all(req.user.id) });
});

router.post("/", requireAuth, (req, res) => {
  const parsed = readAddress(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error });
  }
  const { label, recipient, phone, street, city, notes } = parsed.value;
  const existing = selectAddresses.all(req.user.id).length;

  const create = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO addresses (user_id, label, recipient, phone, street, city, notes, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.user.id,
        label,
        recipient,
        phone,
        street,
        city,
        notes,
        existing === 0 || req.body?.isDefault === true ? 1 : 0
      );
    if (existing === 0 || req.body?.isDefault === true) {
      applyDefault(req.user.id, lastInsertRowid);
    }
    return lastInsertRowid;
  });

  const id = create();
  res.status(201).json({ addresses: selectAddresses.all(req.user.id), id });
});

router.patch("/:id", requireAuth, (req, res) => {
  const existing = selectAddress.get(Number(req.params.id), req.user.id);
  if (!existing) {
    return res.status(404).json({ error: "Address not found" });
  }
  const parsed = readAddress({ ...existing, ...req.body, isDefault: undefined });
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error });
  }
  const { label, recipient, phone, street, city, notes } = parsed.value;
  db.prepare(
    `UPDATE addresses SET label = ?, recipient = ?, phone = ?, street = ?, city = ?, notes = ?
      WHERE id = ? AND user_id = ?`
  ).run(label, recipient, phone, street, city, notes, existing.id, req.user.id);

  if (req.body?.isDefault === true) {
    applyDefault(req.user.id, existing.id);
  }
  res.json({ addresses: selectAddresses.all(req.user.id) });
});

router.post("/:id/default", requireAuth, (req, res) => {
  const existing = selectAddress.get(Number(req.params.id), req.user.id);
  if (!existing) {
    return res.status(404).json({ error: "Address not found" });
  }
  applyDefault(req.user.id, existing.id);
  res.json({ addresses: selectAddresses.all(req.user.id) });
});

router.delete("/:id", requireAuth, (req, res) => {
  const existing = selectAddress.get(Number(req.params.id), req.user.id);
  if (!existing) {
    return res.status(404).json({ error: "Address not found" });
  }
  db.prepare("DELETE FROM addresses WHERE id = ? AND user_id = ?").run(existing.id, req.user.id);
  const remaining = selectAddresses.all(req.user.id);
  if (remaining.length > 0 && !remaining.some((address) => address.isDefault)) {
    applyDefault(req.user.id, remaining[0].id);
  }
  res.json({ addresses: selectAddresses.all(req.user.id) });
});

export default router;
