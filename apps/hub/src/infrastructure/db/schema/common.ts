import { timestamp, uuid } from "drizzle-orm/pg-core";

export function idColumn() {
  return uuid("id").primaryKey();
}

export function timestampColumns() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  };
}
