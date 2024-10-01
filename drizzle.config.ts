import { defineConfig } from 'drizzle-kit'
import "dotenv/config"

if (!process.env.DATABASE_URL) {
	throw new Error('Database url is missing')
}

export default defineConfig({
	strict: true,
	schema: "./src/db/schema.ts",
	out: "./src/db/migrations",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.DATABASE_URL!,
	},
})