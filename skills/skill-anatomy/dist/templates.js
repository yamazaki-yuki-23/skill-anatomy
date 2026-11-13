import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ROOTS = ["../assets/templates/", "../skills/skill-anatomy/assets/templates/"];
export function templatePath(name) {
  for (const root of ROOTS) {
    const candidate = fileURLToPath(new URL(`${root}${name}`, import.meta.url));
    if (existsSync(candidate))
      return candidate;
  }
  throw new Error(`テンプレートが見つかりません: ${name}`);
}
export function readTemplate(name) {
  return readFileSync(templatePath(name), "utf8");
}
