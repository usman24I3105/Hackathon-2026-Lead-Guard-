export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;

  constructor(status: number, code: string, message: string, opts?: { requestId?: string; retryAfterSeconds?: number }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = opts?.requestId;
    this.retryAfterSeconds = opts?.retryAfterSeconds;
  }
}

const COPY: Record<string, string> = {
  unauthenticated: "Your session has ended. Please sign in again.",
  reauth_required: "Please confirm your password to continue.",
  forbidden: "You don't have permission to do that.",
  rate_limited: "Too many requests. Please slow down and try again.",
  payload_too_large: "That's too large to upload.",
  not_found: "We couldn't find that.",
  validation_failed: "Check the highlighted fields and try again.",
  not_configured: "This isn't connected to a backend yet.",
  network_error: "Couldn't reach the server. Check your connection and try again.",
  unknown: "Something went wrong.",
};

export function messageFor(error: ApiError): string {
  if (error.status === 429) {
    const wait = error.retryAfterSeconds ? ` Try again in ${error.retryAfterSeconds}s.` : "";
    return `${COPY.rate_limited}${wait}`;
  }
  if (error.status === 413) return COPY.payload_too_large;
  return COPY[error.code] ?? error.message ?? COPY.unknown;
}
