import { pgTable, timestamp, varchar, text, boolean, serial } from 'drizzle-orm/pg-core'

export const userTable = pgTable("users", {
    id: text("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).unique(),
    password: text("password"),
    profileImage: text("profile_image"),
    providerId: varchar("provider_id", { length: 255 }),
    providerUserId: varchar("provider_user_id", { length: 255 }).unique(),
    isVerified: boolean("is_verified").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});


export const sessionTable = pgTable("sessions", {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => userTable.id),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull()
})


export const passwordResetTokenTable = pgTable("password_reset_tokens", {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull().references(() => userTable.id),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull()
})

export const emailVerificationTokenTable = pgTable("email_verification_codes", {
    id: text("code").notNull(),
    userId: text("user_id").notNull().unique().references(() => userTable.id),
    email: text("email").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull()
})

