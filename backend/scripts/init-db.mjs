import fs from 'fs';
import path from 'path';
import pg from 'pg';

// Simple .env parser to read DATABASE_URL without extra dependencies
const possibleEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend/.env'),
  path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '../.env'),
];

for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
    break;
  }
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Error: DATABASE_URL is not set in backend/.env');
  process.exit(1);
}

const isSsl =
  connectionString.includes('sslmode=require') ||
  connectionString.includes('neon.tech') ||
  connectionString.includes('aws.') ||
  connectionString.includes('render.com');

const pool = new pg.Pool({
  connectionString,
  ssl: isSsl ? { rejectUnauthorized: false } : undefined,
});

async function main() {
  console.log('Connecting to PostgreSQL database...');
  console.log(`Host: ${connectionString.split('@')[1] ? connectionString.split('@')[1].split('/')[0] : 'localhost'}`);

  const client = await pool.connect();
  try {
    const schemaSql = fs.readFileSync(path.resolve(process.cwd(), 'db/schema.sql'), 'utf8');
    console.log('Executing db/schema.sql...');
    await client.query(schemaSql);
    console.log('✓ Schema created successfully (39 tables, enums, triggers, views).');

    const seedSql = fs.readFileSync(path.resolve(process.cwd(), 'db/seed.sql'), 'utf8');
    console.log('Executing db/seed.sql...');
    await client.query(seedSql);
    console.log('✓ Seed data loaded successfully (Shakti Home Appliances demo company).');

    console.log('\nDatabase initialization COMPLETE! All tables and seed data are ready.');
  } catch (err) {
    console.error('Database initialization failed:', err.message);
    if (err.detail) console.error('Detail:', err.detail);
    if (err.hint) console.error('Hint:', err.hint);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();

