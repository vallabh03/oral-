// Runs once when the server starts (not during `next build`).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    // Retries queued patient messages in the background (they are also sent right after each decision).
    const { startNotificationWorker } = await import("./lib/server/notify");
    startNotificationWorker();
  }
}
