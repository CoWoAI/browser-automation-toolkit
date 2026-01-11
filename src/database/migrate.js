/**
 * Simple migration runner for PostgreSQL
 * Reads SQL files from migrations/ directory and applies them in order
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { db } from './postgres.js';
import config from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '../../migrations');

/**
 * Run pending migrations
 * @returns {Promise<string[]>} - List of applied migration filenames
 */
export async function runMigrations() {
  const applied = [];

  // Ensure migrations table exists
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Get already applied migrations
  const result = await db.query('SELECT version FROM schema_migrations ORDER BY version');
  const appliedSet = new Set(result.rows.map(r => r.version));

  // Read and sort migration files
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && f !== 'init.sql')
    .sort();

  for (const file of files) {
    if (appliedSet.has(file)) {
      continue;
    }

    console.log(`Applying migration: ${file}`);
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');

    // Extract "-- +migrate Up" section only
    const upMatch = sql.match(/-- \+migrate Up\s+([\s\S]*?)(?:-- \+migrate Down|$)/);
    if (upMatch) {
      await db.query(upMatch[1]);
      await db.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      console.log(`Applied: ${file}`);
      applied.push(file);
    } else {
      // No markers, run entire file
      await db.query(sql);
      await db.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      console.log(`Applied (no markers): ${file}`);
      applied.push(file);
    }
  }

  if (applied.length === 0) {
    console.log('No pending migrations');
  }

  return applied;
}

/**
 * Get list of applied migrations
 * @returns {Promise<string[]>}
 */
export async function getAppliedMigrations() {
  const result = await db.query('SELECT version FROM schema_migrations ORDER BY version');
  return result.rows.map(r => r.version);
}

// CLI entry point
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    try {
      const connected = await db.connect(config.databaseUrl);
      if (!connected) {
        console.error('Cannot run migrations: DATABASE_URL not set');
        process.exit(1);
      }

      await runMigrations();
      await db.close();
      process.exit(0);
    } catch (err) {
      console.error('Migration failed:', err);
      process.exit(1);
    }
  })();
}

export default { runMigrations, getAppliedMigrations };
