import { Pool, type PoolClient } from "pg";

/**
 * Minimal database interface. Production uses `pg` against the Supabase Postgres
 * connection string; tests use an in-process PGlite instance with the same SQL.
 */
export interface Db {
  query<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<T[]>;
  tx<R>(fn: (db: Db) => Promise<R>): Promise<R>;
}

class PgClientDb implements Db {
  constructor(private client: PoolClient) {}
  async query<T>(sql: string, params: unknown[] = []) {
    return (await this.client.query(sql, params as any[])).rows as T[];
  }
  async tx<R>(fn: (db: Db) => Promise<R>): Promise<R> {
    // Already inside a transaction: run in the same one.
    return fn(this);
  }
}

class PgPoolDb implements Db {
  constructor(private pool: Pool) {}
  async query<T>(sql: string, params: unknown[] = []) {
    return (await this.pool.query(sql, params as any[])).rows as T[];
  }
  async tx<R>(fn: (db: Db) => Promise<R>): Promise<R> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await fn(new PgClientDb(client));
      await client.query("commit");
      return result;
    } catch (err) {
      await client.query("rollback").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}

const globalForDb = globalThis as unknown as { __db?: Db };

export function getDb(): Db {
  if (globalForDb.__db) return globalForDb.__db;
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    throw new Error(
      "SUPABASE_DB_URL is not set. Use the Postgres connection string from Supabase (Project Settings > Database).",
    );
  }
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX ?? 5),
    ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
  });
  globalForDb.__db = new PgPoolDb(pool);
  return globalForDb.__db;
}

export function setDbForTesting(db: Db | undefined) {
  globalForDb.__db = db;
}
