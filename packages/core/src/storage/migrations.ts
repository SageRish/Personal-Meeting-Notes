import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type Database from 'better-sqlite3';

export interface Migration {
  version: string;
  sql: string;
}

const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export function loadMigrations(): Migration[] {
  const files = readdirSync(migrationsDirectory)
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  return files.map((fileName) => ({
    version: fileName.replace(/\.sql$/, ''),
    sql: readFileSync(join(migrationsDirectory, fileName), 'utf8'),
  }));
}

export function runMigrations(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const appliedVersions = new Set(
    database
      .prepare<{ version: string }, { version: string }>('SELECT version FROM schema_migrations')
      .all()
      .map((row) => row.version),
  );

  const migrations = loadMigrations().filter((migration) => !appliedVersions.has(migration.version));

  const transaction = database.transaction(() => {
    for (const migration of migrations) {
      database.exec(migration.sql);
      database
        .prepare('INSERT INTO schema_migrations(version) VALUES (?)')
        .run(migration.version);
    }
  });

  transaction();
}
