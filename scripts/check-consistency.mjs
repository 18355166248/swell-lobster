import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);

function read(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

function requireFile(relativePath) {
  if (!existsSync(resolve(repoRoot, relativePath))) {
    throw new Error(`missing required file: ${relativePath}`);
  }
}

function addChecks(groupLabel, entries, checks) {
  for (const [label, fn] of entries) {
    checks.push({
      label: `${groupLabel}:${label}`,
      fn,
    });
  }
}

function buildGuideChecks() {
  const requiredGuidePaths = [
    'AGENTS.md',
    'apps/AGENTS.md',
    'apps/web-ui/AGENTS.md',
    'apps/desktop/AGENTS.md',
    'src/AGENTS.md',
    'src/tide-lobster/AGENTS.md',
    'docs/AGENTS.md',
    'identity/AGENTS.md',
    'scripts/AGENTS.md',
  ];

  return [
    [
      'required-guides-exist',
      () => {
        for (const path of requiredGuidePaths) {
          requireFile(path);
        }
      },
    ],
    [
      'root-agents-links-match-real-guides',
      () => {
        const rootAgents = read('AGENTS.md');
        for (const path of requiredGuidePaths.filter((path) => path !== 'AGENTS.md')) {
          if (!rootAgents.includes(path)) {
            throw new Error(`root AGENTS is missing sub-guide reference: ${path}`);
          }
        }
      },
    ],
    [
      'top-level-directories-have-guide-or-readme',
      () => {
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
      },
    ],
  ];
}

function buildDocChecks() {
  return [
    [
      'root-readme-documents-workspaces',
      () => {
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
      },
    ],
    [
      'storage-docs-do-not-claim-json-only',
      () => {
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
      },
    ],
    [
      'web-readme-is-project-specific',
      () => {
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
      },
    ],
    [
      'delivery-workflow-links-task-template',
      () => {
        const docsAgents = read('docs/AGENTS.md');
        const workflow = read('docs/delivery-workflow.md');
        requireFile('docs/task-templates.md');
        requireFile('docs/tasks/README.md');
        requireFile('docs/tasks/TEMPLATE.md');
        requireFile('docs/tasks/active/README.md');
        requireFile('docs/tasks/archive/README.md');

        if (!docsAgents.includes('task-templates.md')) {
          throw new Error('docs/AGENTS.md must link to docs/task-templates.md');
        }
        if (!workflow.includes('docs/tasks/')) {
          throw new Error('docs/delivery-workflow.md must describe docs/tasks/ usage');
        }
      },
    ],
    [
      'active-task-files-follow-naming-rule',
      () => {
        const taskFilePattern = /^\d{4}-\d{2}-\d{2}-.+\.md$/;
        const entries = readdirSync(resolve(repoRoot, 'docs/tasks/active'), { withFileTypes: true });

        for (const entry of entries) {
          if (!entry.isFile()) continue;
          if (entry.name === 'README.md') continue;
          if (!taskFilePattern.test(entry.name)) {
            throw new Error(
              `docs/tasks/active/${entry.name} must match YYYY-MM-DD-任务名.md`
            );
          }
        }
      },
    ],
  ];
}

function buildContractChecks() {
  return [
    [
      'root-scripts-expose-repo-entrypoints',
      () => {
        const pkg = JSON.parse(read('package.json'));
        for (const script of ['typecheck', 'test', 'build', 'verify:docs', 'verify']) {
          if (!pkg.scripts[script]) {
            throw new Error(`missing root script: ${script}`);
          }
        }
      },
    ],
    [
      'claude-compatibility-files-stay-thin',
      () => {
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
      },
    ],
  ];
}

const checks = [];
addChecks('guides', buildGuideChecks(), checks);
addChecks('docs', buildDocChecks(), checks);
addChecks('contracts', buildContractChecks(), checks);

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
