import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);

const checks = [];

function read(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

function addCheck(label, fn) {
  checks.push({ label, fn });
}

function requireFile(relativePath) {
  if (!existsSync(resolve(repoRoot, relativePath))) {
    throw new Error(`missing required file: ${relativePath}`);
  }
}

addCheck('required guides exist', () => {
  for (const path of [
    'AGENTS.md',
    'apps/web-ui/AGENTS.md',
    'apps/desktop/AGENTS.md',
    'src/tide-lobster/AGENTS.md',
    'docs/AGENTS.md',
    'identity/AGENTS.md',
  ]) {
    requireFile(path);
  }
});

addCheck('root AGENTS links match real guides', () => {
  const rootAgents = read('AGENTS.md');
  for (const path of [
    'apps/web-ui/AGENTS.md',
    'apps/desktop/AGENTS.md',
    'src/tide-lobster/AGENTS.md',
    'docs/AGENTS.md',
    'identity/AGENTS.md',
  ]) {
    if (!rootAgents.includes(path)) {
      throw new Error(`root AGENTS is missing sub-guide reference: ${path}`);
    }
  }
});

addCheck('root README documents all workspaces', () => {
  const pkg = JSON.parse(read('package.json'));
  const readme = read('README.md');
  const expected = ['apps/web-ui', 'apps/desktop', 'src/tide-lobster'];

  for (const workspace of expected) {
    if (!pkg.workspaces.includes(workspace) && !pkg.workspaces.includes('apps/*')) {
      throw new Error(`package.json workspaces missing expected entry for ${workspace}`);
    }
    if (!readme.includes(workspace.split('/').pop())) {
      throw new Error(`README does not describe workspace: ${workspace}`);
    }
  }
});

addCheck('storage docs do not claim JSON-only persistence', () => {
  const disallowedPatterns = [
    { file: 'AGENTS.md', pattern: 'JSON files in `data/`' },
    { file: 'CLAUDE.md', pattern: 'JSON files in `data/`' },
    { file: 'src/tide-lobster/CLAUDE.md', pattern: 'No database — JSON files only' },
    { file: 'src/tide-lobster/CLAUDE.md', pattern: 'JSON file storage in `data/`' },
  ];

  for (const { file, pattern } of disallowedPatterns) {
    if (read(file).includes(pattern)) {
      throw new Error(`${file} still contains outdated storage statement: ${pattern}`);
    }
  }
});

addCheck('web README is project-specific', () => {
  const webReadme = read('apps/web-ui/README.md');
  const banned = [
    'This template provides a minimal setup to get React working in Vite',
    'Currently, two official plugins are available',
    'React Compiler is not enabled on this template',
  ];

  for (const text of banned) {
    if (webReadme.includes(text)) {
      throw new Error(`apps/web-ui/README.md still contains template text: ${text}`);
    }
  }
});

addCheck('root scripts expose repo entrypoints', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const script of ['typecheck', 'test', 'build', 'verify:docs', 'verify']) {
    if (!pkg.scripts[script]) {
      throw new Error(`missing root script: ${script}`);
    }
  }
});

let failures = 0;

for (const check of checks) {
  try {
    check.fn();
    console.log(`PASS ${check.label}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${check.label}`);
    console.error(error instanceof Error ? error.message : String(error));
  }
}

if (failures > 0) {
  process.exit(1);
}

console.log('All repo consistency checks passed.');
