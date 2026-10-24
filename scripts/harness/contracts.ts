import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';

export interface Finding {
  path: string;
  message: string;
}

export function validateSkill(root: string): Finding[] {
  const findings: Finding[] = [];
  const skillRoot = path.join(root, 'skills/skill-anatomy');
  const report = (file: string, message: string) => findings.push({ path: file, message });
  const skillFile = 'skills/skill-anatomy/SKILL.md';
  const content = readFileSync(path.join(root, skillFile), 'utf8');
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!header) report(skillFile, 'YAML frontmatter is missing');
  else {
    const parsed = parseDocument(header[1]!);
    for (const error of parsed.errors) report(skillFile, error.message);
    const data = parsed.errors.length ? null : parsed.toJS();
    if (data?.name !== 'skill-anatomy')
      report(skillFile, 'Name must match the published directory');
    if (typeof data?.description !== 'string' || !data.description.trim())
      report(skillFile, 'Description is required');
    if (data?.license !== 'MIT') report(skillFile, 'License must agree with the repository');
    if (data?.metadata && typeof data.metadata === 'object') {
      for (const key of Object.keys(data.metadata)) {
        if (key.startsWith('github-'))
          report(skillFile, `Install metadata must not be committed: ${key}`);
      }
    }
  }
  const runtime = JSON.parse(readFileSync(path.join(skillRoot, 'package.json'), 'utf8'));
  if (runtime.type !== 'module')
    report('skills/skill-anatomy/package.json', 'Node distribution must declare ESM');
  if (
    Object.keys(runtime.dependencies ?? {}).length ||
    Object.keys(runtime.devDependencies ?? {}).length
  )
    report(
      'skills/skill-anatomy/package.json',
      'Installed skills must not require package installation',
    );
  for (const relative of [
    'LICENSE',
    'dist/cli.js',
    'references/research.md',
    'references/report-format.md',
    'references/writing.md',
    'assets/templates/skill-analysis.md',
    'assets/templates/repository-analysis.md',
    'agents/openai.yaml',
  ]) {
    if (!existsSync(path.join(skillRoot, relative)))
      report(`skills/skill-anatomy/${relative}`, 'Required distribution file is missing');
  }
  if (
    existsSync(path.join(skillRoot, 'LICENSE')) &&
    readFileSync(path.join(skillRoot, 'LICENSE'), 'utf8') !==
      readFileSync(path.join(root, 'LICENSE'), 'utf8')
  )
    report('skills/skill-anatomy/LICENSE', 'Distribution license differs from the repository');
  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      const relative = path.relative(root, file);
      if (entry.isSymbolicLink()) report(relative, 'Published files must not be symlinks');
      else if (entry.isDirectory()) {
        if (['node_modules', '.git', '.cache', 'src'].includes(entry.name))
          report(relative, 'Development files must not be published');
        else visit(file);
      }
    }
  }
  visit(skillRoot);
  return findings;
}

export function validateLinks(root: string): Finding[] {
  const findings: Finding[] = [];
  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || ['node_modules', 'dist'].includes(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
        for (const match of text.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
          const href = match[1]!;
          if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(href) || href.includes('{{')) continue;
          try {
            const target = path.resolve(
              path.dirname(file),
              decodeURIComponent(href.split(/[?#]/)[0]!),
            );
            const relative = path.relative(root, target);
            if (
              path.isAbsolute(relative) ||
              relative === '..' ||
              relative.startsWith(`..${path.sep}`) ||
              !existsSync(target) ||
              lstatSync(target).isSymbolicLink()
            )
              findings.push({
                path: path.relative(root, file),
                message: `Invalid local link: ${href}`,
              });
          } catch {
            findings.push({
              path: path.relative(root, file),
              message: `Invalid local link: ${href}`,
            });
          }
        }
      }
    }
  }
  visit(root);
  return findings;
}

if (import.meta.main) {
  const root = path.resolve(import.meta.dir, '../..');
  const findings = [...validateSkill(root), ...validateLinks(root)];
  for (const finding of findings) console.error(`${finding.path}: ${finding.message}`);
  if (findings.length) process.exitCode = 1;
  else console.log('Skill distribution and local documentation links are valid.');
}
