import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: true
});

export const db = drizzle(pool);

(async () => {
    try {
        await pool.connect();
        console.log('[database]:Connected to PostgreSQL database successfully!');
    } catch (error) {
        console.error('[database]:Failed to connect to the database:', error);
    }
})();