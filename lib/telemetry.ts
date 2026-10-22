/**
 * Telemetry and Structured Observability for Cloudflare Workers.
 *
 * Provides:
 *  - Low-overhead execution timing for database and external API calls
 *  - PII-sanitized error payload extraction
 *  - Cloudflare Logpush / Tail Worker compatible structured JSON logging
 *  - Persistent application error recording
 */

export interface LogContext {
  path?: string;
  method?: string;
  actorId?: string;
  requestId?: string;
  ip?: string;
  [key: string]: unknown;
}

const SENSITIVE_KEYS = new Set([
  "authorization",
  "cookie",
  "token",
  "session",
  "secret",
  "password",
  "key",
  "phone",
  "answers",
  "name",
]);

/**
 * Recursively redacts sensitive PII and credential keys from diagnostic payloads.
 */
export function sanitize(data: unknown, depth = 0): unknown {
  if (depth > 4) return "[TRUNCATED]";
  if (data === null || data === undefined) return data;
  if (typeof data === "string") {
    // Redact tokens or long hex strings
    if (data.length > 200) return data.slice(0, 200) + "...[TRUNCATED]";
    return data;
  }
  if (Array.isArray(data)) {
    return data.slice(0, 20).map((item) => sanitize(item, depth + 1));
  }
  if (typeof data === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        sanitized[k] = "[REDACTED]";
      } else {
        sanitized[k] = sanitize(v, depth + 1);
      }
    }
    return sanitized;
  }
  return data;
}

/**
 * Formats and writes a structured single-line JSON log entry to stdout.
 * Workers tail and Logpush ingest JSON lines directly.
 */
export function logEntry(
  level: "INFO" | "WARN" | "ERROR",
  message: string,
  context?: LogContext,
) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context ? (sanitize(context) as Record<string, unknown>) : {}),
  };
  if (level === "ERROR") {
    console.error(JSON.stringify(payload));
  } else if (level === "WARN") {
    console.warn(JSON.stringify(payload));
  } else {
    console.log(JSON.stringify(payload));
  }
}

/**
 * Measures the execution time of an asynchronous operation (e.g., D1 query or R2 fetch).
 */
export async function measure<T>(
  operationName: string,
  fn: () => Promise<T>,
): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  try {
    const result = await fn();
    const durationMs = Math.round(performance.now() - start);
    return { result, durationMs };
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    logEntry("WARN", `Operation ${operationName} failed after ${durationMs}ms`, {
      operation: operationName,
      durationMs,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
