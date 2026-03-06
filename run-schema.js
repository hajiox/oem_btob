const { Client } = require('pg');
const fs = require('fs');

const client = new Client({
    connectionString: 'postgres://postgres:xUNXcPDxV8zDKesJ@db.zfhswguzqyagmhhlpksq.supabase.co:5432/postgres',
    ssl: {
        rejectUnauthorized: false
    }
});

async function main() {
    try {
        console.log('🔹 Connecting to Supabase...');
        await client.connect();
        console.log('🔹 Connected. Running SQL Schema...');
        const sql = fs.readFileSync('./sql/001_initial_schema.sql', 'utf8');
        await client.query(sql);
        console.log('✅ SQL schema executed successfully!');
    } catch (e) {
        console.error('❌ Error executing SQL:', e);
    } finally {
        await client.end();
    }
}
main();
