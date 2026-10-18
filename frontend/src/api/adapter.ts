import type { StoreLike } from "../state/storeTypes";

/**
 * Chooses the data source. Mock fixtures (src/mock/**) are only ever reached
 * through this dynamic import, gated on a condition Vite can fold to a
 * compile-time constant — in a production build with VITE_API_MODE unset,
 * the branch below is dead code and the whole mock/ chunk is dropped from
 * the bundle. scripts/check-bundle.mjs verifies that after every build.
 */
export async function createStore(): Promise<StoreLike> {
  if (
    import.meta.env.VITE_API_MODE === "mock" ||
    import.meta.env.MODE === "test" ||
    (typeof process !== "undefined" && process.env.NODE_ENV === "test")
  ) {
    const mod = await import("../mock/store");
    return mod.store;
  }
  const mod = await import("./realStore");
  return mod.realStore;
}
