/** Register, sign in, and read the signed-in customer. */
import { Router } from "express";
import { db } from "../db.js";
import { hashPassword, verifyPassword, signToken, requireAuth } from "../auth.js";
import { readText, readEmail, readPassword } from "../validate.js";

const router = Router();

const findByEmail = db.prepare("SELECT * FROM users WHERE email = ?");
const findById = db.prepare("SELECT * FROM users WHERE id = ?");
const insertUser = db.prepare(
  "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)"
);

const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email });

router.post("/register", async (req, res, next) => {
  try {
    const body = req.body || {};
    const name = readText(body.name, "Your name", { max: 80 });
    if (!name.ok) return res.status(400).json({ error: name.error });

    const email = readEmail(body.email);
    if (!email.ok) return res.status(400).json({ error: email.error });

    const password = readPassword(body.password);
    if (!password.ok) return res.status(400).json({ error: password.error });

    if (findByEmail.get(email.value)) {
      return res.status(409).json({ error: "That email is already registered. Try signing in." });
    }

    const passwordHash = await hashPassword(password.value);
    const { lastInsertRowid } = insertUser.run(name.value, email.value, passwordHash);
    const user = findById.get(lastInsertRowid);

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const body = req.body || {};
    const email = readEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    if (!email.ok || !password) {
      return res.status(401).json({ error: "Email or password is incorrect" });
    }

    const user = findByEmail.get(email.value);
    const matches = user ? await verifyPassword(password, user.password_hash) : false;
    if (!user || !matches) {
      return res.status(401).json({ error: "Email or password is incorrect" });
    }

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, (req, res) => {
  const user = findById.get(req.user.id);
  if (!user) {
    return res.status(401).json({ error: "This account no longer exists" });
  }
  res.json({ user: publicUser(user) });
});

export default router;
