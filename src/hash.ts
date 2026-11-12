import { createHash } from 'node:crypto';
export function compareUtf8(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a), Buffer.from(b));
}
export function sorted(values: Iterable<string>): string[] {
  return [...values].sort(compareUtf8);
}

// Match serde_json's sorted map serialization, including integer-looking keys.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error('ハッシュ対象に未定義の値があります');
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${sorted(Object.keys(record))
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}
export function digest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
