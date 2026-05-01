import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
    'apps/AGENTS.md',
    'apps/web-ui/AGENTS.md',
    'apps/desktop/AGENTS.md',
    'src/AGENTS.md',
    'src/tide-lobster/AGENTS.md',
    'docs/AGENTS.md',
    'identity/AGENTS.md',
    'scripts/AGENTS.md',
  ]) {
    requireFile(path);
  }
});

addCheck('root AGENTS links match real guides', () => {
  const rootAgents = read('AGENTS.md');
  for (const path of [
    'apps/AGENTS.md',
    'apps/web-ui/AGENTS.md',
    'apps/desktop/AGENTS.md',
    'src/AGENTS.md',
    'src/tide-lobster/AGENTS.md',
    'docs/AGENTS.md',
    'identity/AGENTS.md',
    'scripts/AGENTS.md',
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

addCheck('repo-owned top-level directories have a guide', () => {
  const exemptDirs = new Set([
    '.git',
    '.github',
    '.husky',
    '.vscode',
    '.cursor',
    '.claude',
    '.trae',
    '.playwright-mcp',
    'node_modules',
    'data',
  ]);

  const entries = readdirSync(repoRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !exemptDirs.has(name));

  for (const dir of entries) {
    const hasGuide = existsSync(resolve(repoRoot, dir, 'AGENTS.md'));
    const hasReadme = existsSync(resolve(repoRoot, dir, 'README.md'));
    if (!hasGuide && !hasReadme) {
      throw new Error(`top-level directory ${dir} must contain AGENTS.md or README.md`);
    }
  }
});

addCheck('CLAUDE compatibility files stay thin', () => {
  for (const file of ['CLAUDE.md', 'apps/web-ui/CLAUDE.md', 'src/tide-lobster/CLAUDE.md']) {
    const content = read(file);
    if (!content.includes('兼容说明')) {
      throw new Error(`${file} must remain a compatibility note`);
    }
    if (!content.includes('AGENTS.md')) {
      throw new Error(`${file} must point readers to AGENTS.md`);
    }
    const extraSubHeading = content
      .split('\n')
      .filter((line) => line.startsWith('## ') || line.startsWith('### '));
    if (extraSubHeading.length > 0) {
      throw new Error(`${file} should not contain extra sections beyond the compatibility note`);
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
