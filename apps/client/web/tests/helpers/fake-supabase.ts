import { randomUUID } from "crypto";

// Minimal in-memory stand-in for the supabase-js query builder, covering just
// the chains the auth routes use: select/insert/upsert/update/delete with
// .eq()/.lt() filters, .select() returning, and .single()/.maybeSingle().
type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code: string; message: string } | null };
type Filter = [column: string, op: "eq" | "lt", value: unknown];

// Like Postgres, filtering a uuid column by a non-uuid value is an error, not
// an empty result.
const uuidColumns = new Set(["id", "signup_id"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const generatedColumns: Record<string, () => Row> = {
  users: () => ({ id: randomUUID() }),
};

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private filters: Filter[] = [];
  private payload: Row[] = [];
  private conflictKey = "id";

  constructor(private db: FakeSupabase, private table: string) {}

  select() {
    return this;
  }

  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  upsert(rows: Row | Row[], options?: { onConflict?: string }) {
    this.op = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.conflictKey = options?.onConflict ?? "id";
    return this;
  }

  update(patch: Row) {
    this.op = "update";
    this.payload = [patch];
    return this;
  }

  delete() {
    this.op = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, "eq", value]);
    return this;
  }

  lt(column: string, value: unknown) {
    this.filters.push([column, "lt", value]);
    return this;
  }

  async single(): Promise<Result> {
    const { data, error } = await this.run();
    const rows = data as Row[];
    if (error) return { data: null, error };
    if (rows.length !== 1) {
      return { data: null, error: { code: "PGRST116", message: `${rows.length} rows` } };
    }
    return { data: rows[0], error: null };
  }

  async maybeSingle(): Promise<Result> {
    const { data, error } = await this.run();
    const rows = data as Row[];
    if (error) return { data: null, error };
    if (rows.length > 1) {
      return { data: null, error: { code: "PGRST116", message: `${rows.length} rows` } };
    }
    return { data: rows[0] ?? null, error: null };
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return this.run().then(onfulfilled, onrejected);
  }

  private matches(row: Row) {
    return this.filters.every(([column, op, value]) =>
      op === "eq" ? row[column] === value : (row[column] as string) < (value as string)
    );
  }

  private async run(): Promise<Result> {
    for (const [column, , value] of this.filters) {
      if (uuidColumns.has(column) && !UUID.test(String(value))) {
        return {
          data: null,
          error: { code: "22P02", message: `invalid input syntax for type uuid: "${value}"` },
        };
      }
    }
    const rows = this.db.rows(this.table);
    const copy = (list: Row[]) => list.map((row) => ({ ...row }));

    switch (this.op) {
      case "select":
        return { data: copy(rows.filter((row) => this.matches(row))), error: null };
      case "insert": {
        const inserted = this.payload.map((row) => ({
          ...generatedColumns[this.table]?.(),
          ...row,
        }));
        rows.push(...inserted);
        return { data: copy(inserted), error: null };
      }
      case "upsert": {
        const written = this.payload.map((row) => {
          const existing = rows.find((r) => r[this.conflictKey] === row[this.conflictKey]);
          if (existing) return Object.assign(existing, row);
          const inserted = { ...generatedColumns[this.table]?.(), ...row };
          rows.push(inserted);
          return inserted;
        });
        return { data: copy(written), error: null };
      }
      case "update": {
        const updated = rows.filter((row) => this.matches(row));
        for (const row of updated) Object.assign(row, this.payload[0]);
        return { data: copy(updated), error: null };
      }
      case "delete": {
        const removed = rows.filter((row) => this.matches(row));
        this.db.tables[this.table] = rows.filter((row) => !this.matches(row));
        return { data: copy(removed), error: null };
      }
    }
  }
}

export class FakeSupabase {
  tables: Record<string, Row[]> = {};

  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }

  reset() {
    this.tables = {};
  }

  from(table: string) {
    return new Query(this, table);
  }
}

export const db = new FakeSupabase();
