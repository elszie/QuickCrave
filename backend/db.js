/**
 * SQLite setup for QuickCrave.
 * Creates the schema on boot and seeds the menu idempotently, so running
 * `node server.js` on a fresh clone always produces a working shop.
 */
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = process.env.DB_FILE
  ? path.resolve(__dirname, process.env.DB_FILE)
  : path.join(__dirname, "quickcrave.db");

export const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/** Flat delivery fee in pesos, matching the storefront design. */
export const DELIVERY_FEE = 39;

/** Allowed order states, in the order the customer sees them. */
export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

export const PAYMENT_METHODS = ["cod", "gcash", "maya"];

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL,
    price       INTEGER NOT NULL,
    tag         TEXT,
    description TEXT NOT NULL,
    image       TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS addresses (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label      TEXT NOT NULL,
    recipient  TEXT NOT NULL,
    phone      TEXT NOT NULL,
    street     TEXT NOT NULL,
    city       TEXT NOT NULL,
    notes      TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    code           TEXT NOT NULL UNIQUE,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status         TEXT NOT NULL DEFAULT 'pending',
    payment_method TEXT NOT NULL,
    payment_ref    TEXT,
    subtotal       INTEGER NOT NULL,
    delivery_fee   INTEGER NOT NULL,
    total          INTEGER NOT NULL,
    address_label  TEXT,
    recipient      TEXT NOT NULL,
    phone          TEXT NOT NULL,
    street         TEXT NOT NULL,
    city           TEXT NOT NULL,
    notes          TEXT,
    placed_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    name       TEXT NOT NULL,
    unit_price INTEGER NOT NULL,
    quantity   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS favorites (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, product_id)
  );

  CREATE INDEX IF NOT EXISTS idx_orders_user   ON orders(user_id, id DESC);
  CREATE INDEX IF NOT EXISTS idx_items_order   ON order_items(order_id);
  CREATE INDEX IF NOT EXISTS idx_address_user  ON addresses(user_id, id);
`);

/**
 * The menu. Keep these ids in sync with the PRODUCTS list in ../index.html —
 * the storefront and the API must agree on ids, prices and categories.
 */
const SEED_PRODUCTS = [
  ["bbq", "Hotsilog", "Rice meals", 70, "Popular", "Garlic rice, egg, and savory BBQ pork.", "photo-1512058564366-18510be2db19"],
  ["bacsilog", "Bacsilog", "Rice meals", 95, null, "Crispy bacon, garlic rice, and sunny egg.", "photo-1601050690597-df0568f70950"],
  ["chickenrice", "Chicken Rice Bowl", "Rice meals", 120, null, "Tender chicken, fresh greens, and rice.", "photo-1547592180-85f173990554"],
  ["bangsilog", "Bangsilog", "Rice meals", 90, null, "Golden milkfish with crispy garlic rice.", "photo-1515003197210-e0cd71810b5f"],
  ["mango", "Mango", "Juices/Drinks", 60, null, "Fresh, sweet mango juice, 16 oz.", "photo-1553530666-ba11a7da3888"],
  ["orange", "Orange", "Juices/Drinks", 60, null, "Bright citrus juice, freshly squeezed.", "photo-1600271886742-f049cd451bba"],
  ["pineapple", "Pineapple", "Juices/Drinks", 90, null, "Tropical pineapple refresher, 16 oz.", "photo-1546549032-9571cd6b27df"],
  ["grape", "Grape", "Juices/Drinks", 90, null, "Cool, sweet grape juice, 16 oz.", "photo-1543362906-acfc16c67564"],
  ["beefburger", "Beef Burger", "Burgers", 60, "Bestseller", "Classic beef patty with fresh lettuce.", "photo-1568901346375-23c9450c58cd"],
  ["cheeseburger", "Cheese Burger", "Burgers", 60, null, "Beef patty, melted cheese, and pickles.", "photo-1550547660-d9450f859349"],
  ["doublecheese", "Double Cheese Burger", "Burgers", 110, "Popular", "Juicy beef patty with lettuce, tomato, and cheese.", "photo-1586190848861-99aa4a171e90"],
  ["chickenburger", "Chicken Burger", "Burgers", 50, null, "Crispy chicken, cheese, and fresh slaw.", "photo-1606755962773-d324e0a13086"],
  ["barbecuefries", "Barbecue Fries", "Fries", 60, null, "Golden crispy fries with smoky seasoning.", "photo-1573080496219-bb080dd4f877"],
  ["cheesefries", "Cheese Fries", "Fries", 60, null, "Crispy fries covered in creamy cheese.", "photo-1630384060421-cb20d0e0649d"],
  ["chilicheese", "Chili Cheese", "Fries", 100, null, "Loaded fries with chili and melted cheese.", "photo-1576107232684-1279f390859f"],
  ["sourcream", "Sourcream Fries", "Fries", 80, null, "Crispy fries with a cool sour cream dip.", "photo-1585109649139-366815a0d713"],
];

const upsertProduct = db.prepare(`
  INSERT INTO products (id, name, category, price, tag, description, image, sort_order)
  VALUES (@id, @name, @category, @price, @tag, @description, @image, @sort_order)
  ON CONFLICT(id) DO UPDATE SET
    name = @name, category = @category, price = @price, tag = @tag,
    description = @description, image = @image, sort_order = @sort_order
`);

const seedProducts = db.transaction((rows) => {
  rows.forEach((row, index) => {
    const [id, name, category, price, tag, description, photo] = row;
    upsertProduct.run({
      id,
      name,
      category,
      price,
      tag: tag ?? null,
      description,
      image: `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=700&q=82&bg=fff1d5`,
      sort_order: index,
    });
  });
});

seedProducts(SEED_PRODUCTS);

/** Every menu item, in display order. */
export function listProducts() {
  return db
    .prepare("SELECT id, name, category, price, tag, description, image FROM products ORDER BY sort_order")
    .all();
}

/** Product price lookup used to price orders server-side. */
export function priceMap() {
  const map = new Map();
  for (const row of db.prepare("SELECT id, name, price FROM products").all()) {
    map.set(row.id, row);
  }
  return map;
}

/** Human friendly order number, e.g. QC-20261006-0007. */
export function nextOrderCode() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const { n } = db
    .prepare("SELECT COUNT(*) AS n FROM orders WHERE code LIKE ?")
    .get(`QC-${day}-%`);
  return `QC-${day}-${String(n + 1).padStart(4, "0")}`;
}
