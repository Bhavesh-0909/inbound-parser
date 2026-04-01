import { integer, pgTable, varchar, text } from "drizzle-orm/pg-core";

export const emailTable = pgTable("email", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  from: varchar({ length: 255 }).notNull(),
  to: text().notNull(),
  raw: varchar({ length: 10000 }).notNull(),
  subject: varchar({ length: 255 }).notNull(),
  label: varchar().notNull()
});
