declare module 'better-sqlite3' {
  export interface RunResult {
    changes: number;
    lastInsertRowid: number;
  }

  export interface Statement<BindParameters = Record<string, unknown>, Row = Record<string, unknown>> {
    run(params?: BindParameters | unknown): RunResult;
    all(params?: BindParameters | unknown): Row[];
  }

  export interface SqliteDatabase {
    pragma(command: string): unknown;
    exec(sql: string): void;
    prepare<BindParameters = Record<string, unknown>, Row = Record<string, unknown>>(
      sql: string,
    ): Statement<BindParameters, Row>;
    transaction<T extends (...args: never[]) => unknown>(fn: T): T;
    close(): void;
  }

  export default class Database implements SqliteDatabase {
    public constructor(filename: string);
    public pragma(command: string): unknown;
    public exec(sql: string): void;
    public prepare<BindParameters = Record<string, unknown>, Row = Record<string, unknown>>(
      sql: string,
    ): Statement<BindParameters, Row>;
    public transaction<T extends (...args: never[]) => unknown>(fn: T): T;
    public close(): void;
  }
}

declare module 'node:fs' {
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: string): string;
}

declare module 'node:path' {
  export function dirname(path: string): string;
  export function join(...parts: string[]): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string): string;
}
