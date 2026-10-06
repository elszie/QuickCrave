/**
 * Passwords and sessions.
 * Passwords are bcrypt hashes; sessions are signed JSON Web Tokens.
 */
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  JWT_SECRET = crypto.randomBytes(32).toString("hex");
  console.warn(
    "[quickcrave] JWT_SECRET is not set — using a temporary secret. " +
      "Existing logins will be invalidated when the server restarts."
  );
}

const TOKEN_TTL = process.env.TOKEN_TTL || "30d";

export function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

/** Reads `Authorization: Bearer <token>` and attaches req.user. */
export function requireAuth(req, res, next) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    return res.status(401).json({ error: "Please sign in to continue" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email, name: payload.name };
    return next();
  } catch {
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
}

/** Owner-only routes, unlocked with the ADMIN_KEY header. */
export function requireAdmin(req, res, next) {
  const key = process.env.ADMIN_KEY;
  if (!key) {
    return res.status(503).json({ error: "ADMIN_KEY is not configured on the server" });
  }
  if (req.get("x-admin-key") !== key) {
    return res.status(401).json({ error: "Invalid admin key" });
  }
  return next();
}
