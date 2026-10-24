import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const CHECKS = [
  'check:skill',
  'check',
  'lint',
  'format:check',
  'check:dist',
  'release:check',
  'test',
];
export interface CheckResult {
  name: string;
  exitCode: number;
  durationMs: number;
  log: string;
}

export function verify(
  root: string,
  checks = CHECKS,
): { passed: boolean; results: CheckResult[]; artifact: string } {
  if (!checks.length) throw new Error('No verification checks were selected');
  const artifact = path.join(root, '.cache/harness', `verify-${Date.now()}-${process.pid}`);
  mkdirSync(artifact, { recursive: true });
  const results: CheckResult[] = [];
  for (const name of checks) {
    if (!/^[a-z][a-z:-]*$/.test(name)) throw new Error('Invalid verification script');
    const start = performance.now();
    const result = Bun.spawnSync([process.execPath, 'run', name], {
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 120_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    const log = `${name.replaceAll(':', '-')}.log`;
    writeFileSync(path.join(artifact, log), Buffer.concat([result.stdout, result.stderr]));
    results.push({
      name,
      exitCode: result.exitCode,
      durationMs: Math.round(performance.now() - start),
      log,
    });
    console.log(
      `${result.exitCode === 0 ? 'PASS' : 'FAIL'} ${name} (${results.at(-1)!.durationMs}ms)`,
    );
  }
  const passed = results.every((result) => result.exitCode === 0);
  writeFileSync(
    path.join(artifact, 'summary.json'),
    JSON.stringify({ version: 1, passed, createdAt: new Date().toISOString(), results }, null, 2),
  );
  console.log(`Verification evidence: ${artifact}`);
  return { passed, results, artifact };
}

if (import.meta.main) {
  const result = verify(path.resolve(import.meta.dir, '../..'));
  if (!result.passed) process.exitCode = 1;
}
