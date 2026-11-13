import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// The templates ship beside dist/ in the published skill; during development the same
// files live under skills/skill-anatomy/.
const ROOTS = ['../assets/templates/', '../skills/skill-anatomy/assets/templates/'];
export function templatePath(name: string): string {
  for (const root of ROOTS) {
    const candidate = fileURLToPath(new URL(`${root}${name}`, import.meta.url));
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`テンプレートが見つかりません: ${name}`);
}
export function readTemplate(name: string): string {
  return readFileSync(templatePath(name), 'utf8');
}
