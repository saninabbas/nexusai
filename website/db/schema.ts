import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const licenses = sqliteTable("licenses", {
  id: text("id").primaryKey(),
  licenseHash: text("license_hash").notNull(),
  transactionHash: text("transaction_hash").notNull(),
  paymentAmount: text("payment_amount").notNull(),
  deviceId: text("device_id"),
  status: text("status").notNull().default("active"),
  issuedAt: integer("issued_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  activatedAt: integer("activated_at"),
  lastValidatedAt: integer("last_validated_at"),
}, (table) => [
  uniqueIndex("licenses_hash_unique").on(table.licenseHash),
  uniqueIndex("licenses_transaction_unique").on(table.transactionHash),
]);
