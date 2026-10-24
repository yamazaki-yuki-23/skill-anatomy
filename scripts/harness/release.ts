import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function checkRelease(root: string, tag?: string): string {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (typeof manifest.version !== 'string' || !SEMVER.test(manifest.version))
    throw new Error('Invalid package version');
  if (tag && tag !== `v${manifest.version}`)
    throw new Error('Release tag and package version differ');
  const result = spawnSync(
    'node',
    [path.join(root, 'skills/skill-anatomy/dist/cli.js'), '--version'],
    { encoding: 'utf8' },
  );
  if (result.status !== 0 || result.stdout.trim() !== manifest.version)
    throw new Error('Distributed CLI and package versions differ');
  return manifest.version;
}

export function prepareRelease(root: string, version: string): void {
  if (!SEMVER.test(version)) throw new Error('Use a semantic version such as 0.3.1');
  const manifestPath = path.join(root, 'package.json');
  const cliPath = path.join(root, 'src/cli.ts');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const source = readFileSync(cliPath, 'utf8');
  const previous = `console.log('${manifest.version}');`;
  if (source.split(previous).length !== 2)
    throw new Error('CLI version does not match package.json; no files changed');
  if (version === manifest.version) throw new Error('Version is unchanged');
  const next = version.split('.').map(BigInt);
  const previousParts = String(manifest.version).split('.').map(BigInt);
  const changed = next.findIndex((part, index) => part !== previousParts[index]);
  if (changed < 0 || next[changed]! < previousParts[changed]!)
    throw new Error('Release version must increase');
  manifest.version = version;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(cliPath, source.replace(previous, `console.log('${version}');`));
}

if (import.meta.main) {
  const root = path.resolve(import.meta.dir, '../..');
  if (process.argv[2] === '--prepare') {
    const version = process.argv[3];
    if (!version || process.argv.length !== 4)
      throw new Error('Usage: bun run release:prepare VERSION');
    prepareRelease(root, version);
    const built = Bun.spawnSync([process.execPath, 'run', 'build'], {
      cwd: root,
      stdout: 'inherit',
      stderr: 'inherit',
    });
    if (built.exitCode !== 0)
      throw new Error('Build failed; review version files before committing');
  } else if (process.argv.length > 3) throw new Error('Usage: bun run release:check [TAG]');
  console.log(
    `Release version is consistent: ${checkRelease(root, process.argv[2] === '--prepare' ? undefined : process.argv[2])}`,
  );
}
