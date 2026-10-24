import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dir, '..');

export function build(destination = path.join(root, 'skills/skill-anatomy/dist')): void {
  const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'node' });
  const sources = readdirSync(path.join(root, 'src')).filter((file) => file.endsWith('.ts'));
  const outputs = new Map(
    sources
      .map(
        (source) =>
          [
            source.replace(/\.ts$/, '.js'),
            transpiler.transformSync(readFileSync(path.join(root, 'src', source), 'utf8')),
          ] as const,
      )
      .filter(([, code]) => code.trim()),
  );
  mkdirSync(destination, { recursive: true });
  for (const file of readdirSync(destination)) {
    if (file.endsWith('.js') && !outputs.has(file)) unlinkSync(path.join(destination, file));
  }
  for (const [file, code] of outputs) writeFileSync(path.join(destination, file), code);
}

if (import.meta.main) build();
