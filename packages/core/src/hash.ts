export function fnv1a(input: string, seed = 0x811c9dc5): number {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function hashKey(parts: readonly (string | number | boolean | null | undefined)[]): string {
  const joined = parts.map((part) => (part === undefined ? "" : String(part))).join("\u0001");
  const first = fnv1a(joined);
  const second = fnv1a(joined, 0x9e3779b9);
  return first.toString(36).padStart(7, "0") + second.toString(36).padStart(7, "0");
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}
