import { bigint, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core'

export const userTable = pgTable("users", {
    id: bigint("id", { mode: "number" }).primaryKey(),
    name: varchar("name", { length: 256 }).notNull(),
    email: varchar("email", { length: 256 }).notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});