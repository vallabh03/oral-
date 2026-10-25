import "server-only";

/** An error that is safe to show to the user. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

export const Errors = {
  badRequest: (message = "The request could not be processed.", fields?: Record<string, string>) =>
    new AppError(400, "bad_request", message, fields),
  validation: (fields: Record<string, string>) => new AppError(422, "validation_failed", "Please correct the highlighted fields.", fields),
  unauthenticated: () => new AppError(401, "unauthenticated", "Please sign in to continue."),
  forbidden: () => new AppError(403, "forbidden", "You do not have permission to do that."),
  // Same response for "missing" and "not yours" so IDs cannot be probed (anti-enumeration).
  notFound: () => new AppError(404, "not_found", "We could not find that record."),
  conflict: (message: string, code = "conflict") => new AppError(409, code, message),
  rateLimited: (retryAfter: number) => new AppError(429, "rate_limited", "Too many attempts. Please wait and try again.", undefined, retryAfter),
  busy: (retryAfter = 2) => new AppError(503, "busy", "The service is busy. Please retry in a moment.", undefined, retryAfter),
  tooLarge: () => new AppError(413, "payload_too_large", "That upload is too large."),
  unsupported: (message = "Unsupported content type.") => new AppError(415, "unsupported_media_type", message),
  gated: (message: string) => new AppError(409, "workflow_gate", message),
  disabled: (message: string) => new AppError(503, "feature_disabled", message),
};
