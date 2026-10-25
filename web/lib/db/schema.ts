import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Database tables. Money is stored as whole cents (integer) so sums are exact; the app converts to euros.
 * After changing this file run `npm run db:generate` to create a migration in ./drizzle.
 */

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  createdAt: createdAt(),
});

/** One row per real shop chain, e.g. "LIDL". */
export const stores = pgTable(
  "stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (t) => [uniqueIndex("stores_user_name").on(t.userId, sql`lower(${t.name})`)],
);

/** Store names as printed on receipts ("LIDL DIENSTLEISTUNG GMBH & CO. KG") mapped to a store. */
export const storeAliases = pgTable(
  "store_aliases",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.alias] })],
);

export const categories = pgTable("categories", {
  id: smallint("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
});

export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    storeRaw: text("store_raw").notNull(),
    storeAddress: text("store_address"),
    purchasedOn: date("purchased_on", { mode: "string" }).notNull(),
    purchasedAt: time("purchased_at"),
    totalCents: integer("total_cents").notNull(),
    currency: char("currency", { length: 3 }).notNull().default("EUR"),
    paymentMethod: text("payment_method"),
    needsReview: boolean("needs_review").notNull().default(false),
    issues: text("issues").array().notNull().default(sql`'{}'::text[]`),
    model: text("model"),
    imageName: text("image_name"),
    /** Gemini's original answer, kept so receipts can be re-processed without rescanning. */
    rawExtraction: jsonb("raw_extraction"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("receipts_user_date").on(t.userId, t.purchasedOn.desc())],
);

export const receiptItems = pgTable(
  "receipt_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => receipts.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    rawText: text("raw_text").notNull(),
    name: text("name").notNull(),
    lineType: text("line_type").notNull(),
    quantity: numeric("quantity", { precision: 10, scale: 3, mode: "number" }),
    unit: text("unit"),
    unitPriceCents: integer("unit_price_cents"),
    totalCents: integer("total_cents").notNull(),
    vatCode: text("vat_code"),
    categoryId: smallint("category_id").references(() => categories.id),
    categorySource: text("category_source"),
  },
  (t) => [
    index("receipt_items_receipt").on(t.receiptId),
    check("receipt_items_line_type", sql`${t.lineType} IN ('product','deposit','deposit_return','discount','other')`),
    check("receipt_items_category_source", sql`${t.categorySource} IN ('model','memory','user')`),
  ],
);

/** Your category corrections, applied automatically the next time the same printed text appears. */
export const categoryMemory = pgTable(
  "category_memory",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    productKey: text("product_key").notNull(),
    categoryId: smallint("category_id")
      .notNull()
      .references(() => categories.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.storeId, t.productKey] }), index("category_memory_key").on(t.userId, t.productKey)],
);
