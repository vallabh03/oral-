import { describe, expect, it } from "vitest";
import { db } from "@/lib/server/db";

describe("database", () => {
  it("migrates and enforces constraints", async () => {
    const d = await db();
    const t = await d.query<{ n: number }>("select count(*)::int as n from schema_migrations");
    expect(t.rows[0]!.n).toBeGreaterThan(0);
    await expect(d.query("insert into users (email, display_name, role) values ('UPPER@x.org','A','admin')")).rejects.toThrow();
  });
});
