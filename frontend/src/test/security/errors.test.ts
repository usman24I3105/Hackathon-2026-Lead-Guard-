import { describe, expect, it } from "vitest";
import { ApiError, messageFor } from "../../api/errors";

describe("ApiError / messageFor", () => {
  it("maps known codes to user-facing copy", () => {
    expect(messageFor(new ApiError(401, "unauthenticated", "boom"))).toMatch(/sign in again/i);
    expect(messageFor(new ApiError(403, "forbidden", "boom"))).toMatch(/permission/i);
    expect(messageFor(new ApiError(403, "reauth_required", "boom"))).toMatch(/confirm your password/i);
  });

  it("honors Retry-After for 429s", () => {
    const withRetry = new ApiError(429, "rate_limited", "boom", { retryAfterSeconds: 30 });
    expect(messageFor(withRetry)).toBe("Too many requests. Please slow down and try again. Try again in 30s.");

    const withoutRetry = new ApiError(429, "rate_limited", "boom");
    expect(messageFor(withoutRetry)).toBe("Too many requests. Please slow down and try again.");
  });

  it("gives a friendly message for 413 regardless of code", () => {
    expect(messageFor(new ApiError(413, "payload_too_large", "boom"))).toMatch(/too large/i);
  });

  it("falls back to the raw message for unknown codes", () => {
    const err = new ApiError(500, "something_weird", "A specific server message");
    expect(messageFor(err)).toBe("A specific server message");
  });

  it("never leaks a stack trace through messageFor", () => {
    const err = new ApiError(500, "unknown", "boom");
    expect(messageFor(err)).not.toContain("at ");
    expect(messageFor(err)).not.toContain(".ts:");
  });

  it("carries the request id separately from the user-facing message", () => {
    const err = new ApiError(500, "unknown", "boom", { requestId: "req_123" });
    expect(err.requestId).toBe("req_123");
    expect(messageFor(err)).not.toContain("req_123");
  });
});
