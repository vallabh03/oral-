import { describe, it, expect } from "vitest";
import { db, getDbStats } from "@/lib/server/db";

describe("database connection pooling and concurrency stress test", () => {
  it("provides active connection pool metrics", async () => {
    const stats = await getDbStats();
    expect(stats).toBeDefined();
    expect(["pg", "pglite"]).toContain(stats.kind);
    expect(stats.totalCount).toBeGreaterThanOrEqual(1);
    expect(stats.max).toBeGreaterThanOrEqual(1);
  });

  it("handles high concurrent transaction bursts without connection leaks or starvation", async () => {
    const d = await db();
    const CONCURRENCY = 40;
    const startTime = Date.now();

    // Launch CONCURRENCY parallel database transactions
    const tasks = Array.from({ length: CONCURRENCY }, async (_, idx) => {
      return d.tx(async (q) => {
        // Query within transaction
        const r1 = await q.query<{ num: number }>("select $1::int as num", [idx]);
        expect(r1.rows[0]?.num).toBe(idx);

        // Perform a lightweight computation or lookup
        const r2 = await q.query<{ sum: number }>("select ($1::int + $2::int) as sum", [idx, 100]);
        expect(r2.rows[0]?.sum).toBe(idx + 100);

        return r2.rows[0]?.sum;
      });
    });

    const results = await Promise.all(tasks);
    const durationMs = Date.now() - startTime;

    expect(results).toHaveLength(CONCURRENCY);
    for (let i = 0; i < CONCURRENCY; i++) {
      expect(results[i]).toBe(i + 100);
    }

    // After all parallel queries complete, verify pool is in healthy state
    const statsAfter = await getDbStats();
    expect(statsAfter.waitingCount).toBe(0);
    expect(durationMs).toBeLessThan(15_000); // 40 transactions completed within 15s
  });

  it("safely rolls back failed transactions without poisoning subsequent pooled connections", async () => {
    const d = await db();

    // Intentionally trigger transaction failure
    await expect(
      d.tx(async (q) => {
        await q.query("select 1");
        throw new Error("Simulated transactional error under load");
      }),
    ).rejects.toThrow("Simulated transactional error under load");

    // Verify immediately subsequent queries succeed cleanly
    const followUp = await d.query<{ ok: number }>("select 42 as ok");
    expect(followUp.rows[0]?.ok).toBe(42);

    // Verify transaction rollback did not leave dangling open transactions
    const stats = await getDbStats();
    expect(stats.waitingCount).toBe(0);
  });
});
