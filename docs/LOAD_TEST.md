# Load test results

Command: `npm run load:photos` (local production build; 5,000 synthetic records, each with a photo).


Dataset: 5000 participants with photos · 50 concurrent sessions · 16 CPUs · PGlite (embedded, single-threaded) — production uses RDS PostgreSQL

| Workload | Requests | Errors | Req/s | p50 ms | p95 ms | p99 ms | MB |
|---|---|---|---|---|---|---|---|
| A. Photo uploads (burst) | 600 | 0% | 15.2 | 3111 | 4599 | 6120 | 128.9 |
| B. Record list pages | 156 | 0% | 4.9 | 632 | 1217 | 1365 | 2.1 |
| B. Thumbnails (first load) | 3336 | 0% | 103.9 | 2230 | 3158 | 4641 | 2.7 |
| B. Thumbnails (ETag revalidation) | 408 | 0% | 12.7 | 2188 | 2644 | 2707 | 0 |
| C. Uploads under mixed load | 300 | 0% | 9.9 | 1634 | 5911 | 7424 | 64.7 |
| C. List pages under mixed load | 75 | 0% | 3.8 | 350 | 511 | 555 | 1 |
| C. Thumbnails under mixed load | 1656 | 0% | 84 | 1526 | 1837 | 2080 | 1.4 |

Client retries after 503 backpressure: A=0, C=0. Payloads: 64 KB WebP (70%), 551 KB JPEG (30%).
Client-side connection errors: {}

Notes: measured on one local Node process with embedded single-threaded PGlite and local-disk storage — a conservative baseline. In production, RDS (connection pooling), S3 presigned thumbnail URLs (no app hop) and horizontally scaling Fargate tasks remove the main bottlenecks; re-run against staging before go-live (ADR-10). Upload latency is dominated by bounded image re-encoding (PHOTO_PROCESS_CONCURRENCY); the queue applies 503 backpressure instead of failing.
