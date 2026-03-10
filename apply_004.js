import { Client } from 'pg';
import fs from 'fs';

async function run() {
    const connectionString = "postgres://postgres:xUNXcPDxV8zDKesJ@db.zfhswguzqyagmhhlpksq.supabase.co:5432/postgres";
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log("Connected to Supabase PostgreSQL.");
        const sql = fs.readFileSync('sql/004_add_seo_fields.sql', 'utf8');
        await client.query(sql);
        console.log("Migration 004_add_seo_fields executed successfully.");
    } catch (e) {
        console.error("Migration failed:", e.message);
    } finally {
        await client.end();
    }
}

run();
