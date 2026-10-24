import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isWithin } from './storage.js';
const PACKAGE_ROOT = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
export function defaultWorkspace(
  packageRoot = PACKAGE_ROOT,
  cwd = process.cwd(),
  configured = process.env.SKILL_ANATOMY_WORKSPACE,
): string {
  if (configured) return path.resolve(cwd, configured);
  if (existsSync(path.join(packageRoot, '.git'))) return packageRoot;
  const repositoryRoot = path.resolve(packageRoot, '../..');
  if (
    path.basename(path.dirname(packageRoot)) === 'skills' &&
    existsSync(path.join(repositoryRoot, '.git'))
  )
    return repositoryRoot;
  if (isWithin(packageRoot, cwd))
    throw new Error(
      'スキルのインストール先の外で実行するか、SKILL_ANATOMY_WORKSPACEで保存先を指定してください',
    );
  return cwd;
}
