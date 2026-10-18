/**
 * SEC-7: Value-masking serializer.
 * Strips valueCents (and related keys) for users without `values.view` permission.
 */

const VALUE_KEYS = new Set([
  'valueCents',
  'value_cents',
  'collected',
  'refundedCents',
  'refunded_cents',
  'totalValue',
  'total_value',
]);

type PlainObject = Record<string, unknown>;

/**
 * Returns a deep clone of `data` with all value-bearing keys removed
 * if the caller lacks the `values.view` permission.
 */
export function maskValues<T>(data: T, hasValuesView: boolean): T {
  if (hasValuesView) return data;
  return deepMask(data) as T;
}

function deepMask(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(deepMask);
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as PlainObject;
    const result: PlainObject = {};
    for (const [k, v] of Object.entries(obj)) {
      if (VALUE_KEYS.has(k)) continue;
      result[k] = deepMask(v);
    }
    return result;
  }
  return value;
}

/**
 * Mask audit diff fields: replace value entries with { field: key } only.
 */
export function maskAuditDiff(
  diff: Record<string, unknown> | null,
  hasValuesView: boolean,
): Record<string, unknown> | null {
  if (!diff || hasValuesView) return diff;
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(diff)) {
    if (VALUE_KEYS.has(k)) {
      result[k] = '[masked]';
    } else {
      result[k] = v;
    }
  }
  return result;
}
