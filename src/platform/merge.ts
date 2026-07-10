/** Plain-object deep merge used for layering configuration sources. */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Deep-merge `source` onto `target`, returning a new object.
 *
 * Semantics chosen for config layering:
 * - plain objects merge recursively,
 * - arrays and scalars from `source` replace `target` (later source wins),
 * - `undefined` values in `source` are skipped so a partial layer never
 *   clobbers a value set by a lower-precedence layer.
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>
): T {
  const out: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    const existing = out[key];
    if (isPlainObject(value) && isPlainObject(existing)) {
      out[key] = deepMerge(existing, value);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

/** Merge a list of partial layers in precedence order (later wins). */
export function mergeLayers(
  layers: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown> {
  let acc: Record<string, unknown> = {};
  for (const layer of layers) {
    if (layer) acc = deepMerge(acc, layer);
  }
  return acc;
}
