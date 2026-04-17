import Database from 'better-sqlite3';

import { runMigrations } from './migrations.js';

export interface StorageOptions {
  dbPath: string;
}

export class StorageDatabase {
  private readonly database: Database;

  public constructor(options: StorageOptions) {
    this.database = new Database(options.dbPath);
    this.database.pragma('foreign_keys = ON');
    runMigrations(this.database);
  }

  public get connection(): Database {
    return this.database;
  }

  public close(): void {
    this.database.close();
  }
}
