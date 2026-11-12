import { createHash } from "node:crypto";
export function compareUtf8(a, b) {
  return Buffer.compare(Buffer.from(a), Buffer.from(b));
}
export function sorted(values) {
  return [...values].sort(compareUtf8);
}
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined)
      throw new Error("ハッシュ対象に未定義の値があります");
    return encoded;
  }
  if (Array.isArray(value))
    return `[${value.map(canonicalJson).join(",")}]`;
  const record = value;
  return `{${sorted(Object.keys(record)).map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}
export function digest(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
