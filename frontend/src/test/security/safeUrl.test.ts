import { describe, expect, it } from "vitest";
import { isAllowedExternalHost, isSafeReturnTo, isStripeCheckoutUrl } from "../../lib/safeUrl";

describe("isSafeReturnTo", () => {
  it("accepts a plain relative path", () => {
    expect(isSafeReturnTo("/relay")).toBe(true);
    expect(isSafeReturnTo("/contacts/c-001")).toBe(true);
  });

  it("rejects protocol-relative URLs", () => {
    expect(isSafeReturnTo("//evil.com")).toBe(false);
  });

  it("rejects absolute URLs", () => {
    expect(isSafeReturnTo("https://evil.com/relay")).toBe(false);
    expect(isSafeReturnTo("http://evil.com")).toBe(false);
  });

  it("rejects backslash tricks", () => {
    expect(isSafeReturnTo("/\\evil.com")).toBe(false);
  });

  it("rejects empty or missing values", () => {
    expect(isSafeReturnTo("")).toBe(false);
    expect(isSafeReturnTo(null)).toBe(false);
    expect(isSafeReturnTo(undefined)).toBe(false);
  });

  it("rejects a path that doesn't start with a slash", () => {
    expect(isSafeReturnTo("relay")).toBe(false);
  });
});

describe("isStripeCheckoutUrl", () => {
  it("accepts checkout.stripe.com", () => {
    expect(isStripeCheckoutUrl("https://checkout.stripe.com/pay/cs_test_123")).toBe(true);
  });

  it("rejects a look-alike host", () => {
    expect(isStripeCheckoutUrl("https://checkout.stripe.com.evil.com/pay")).toBe(false);
    expect(isStripeCheckoutUrl("https://evil.com/checkout.stripe.com")).toBe(false);
    expect(isStripeCheckoutUrl("https://stripe.com/pay")).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(isStripeCheckoutUrl("not a url")).toBe(false);
    expect(isStripeCheckoutUrl(null)).toBe(false);
  });
});

describe("isAllowedExternalHost", () => {
  it("allows the Stripe checkout host", () => {
    expect(isAllowedExternalHost("https://checkout.stripe.com/pay/cs_test_123")).toBe(true);
  });

  it("rejects anything not on the allowlist", () => {
    expect(isAllowedExternalHost("https://pay.leadguard.app/lnk/abc")).toBe(false);
    expect(isAllowedExternalHost("javascript:alert(1)")).toBe(false);
  });
});
