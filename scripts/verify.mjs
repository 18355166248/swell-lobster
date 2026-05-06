import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const smokeOnly = args.includes('--smoke');

const tasks = [
  {
    label: 'repo:consistency',
    command: 'node',
    args: ['scripts/check-consistency.mjs'],
    cwd: '.',
  },
  {
    label: 'backend:typecheck',
    command: 'npm',
    args: ['run', 'typecheck'],
    cwd: 'src/tide-lobster',
  },
  {
    label: 'backend:test',
    command: 'npm',
    args: ['run', 'test'],
    cwd: 'src/tide-lobster',
  },
  {
    label: 'web:lint',
    command: 'npm',
    args: ['run', 'lint'],
    cwd: 'apps/web-ui',
  },
  {
    label: 'desktop:check',
    command: 'cargo',
    args: ['check', '--manifest-path', 'apps/desktop/src-tauri/Cargo.toml'],
    cwd: '.',
  },
  {
    label: 'desktop:sidecar',
    command: 'npm',
    args: ['run', 'check:sidecar'],
    cwd: 'apps/desktop',
  },
];

function runTask(task) {
  return new Promise((resolve, reject) => {
    console.log(`\n==> ${task.label}`);
    const child = spawn(task.command, task.args, {
      cwd: task.cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('error', (error) => {
      reject(new Error(`${task.label} failed to start: ${error.message}`));
    });

    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${task.label} exited with ${code ?? 'null'}${signal ? ` (signal: ${signal})` : ''}`
        )
      );
    });
  });
}

async function runSmokeTests(baseUrl = 'http://localhost:18900') {
  console.log(`\n==> smoke:start (${baseUrl})`);

  const checks = [
    { label: 'health', path: '/api/health', method: 'GET' },
    { label: 'observability:metrics', path: '/api/observability/metrics', method: 'GET' },
    { label: 'observability:events', path: '/api/observability/events?limit=1', method: 'GET' },
    { label: 'backup:list', path: '/api/backup/list', method: 'GET' },
  ];

  for (const check of checks) {
    process.stdout.write(`  [smoke] ${check.label}... `);
    const res = await fetch(`${baseUrl}${check.path}`, { method: check.method });
    if (!res.ok) {
      throw new Error(`${check.label} returned ${res.status}`);
    }
    const json = await res.json();
    if (check.label === 'health' && json.status !== 'healthy') {
      throw new Error(`health check returned status=${json.status}`);
    }
    console.log('ok');
  }

  console.log('\n  [smoke] backup:create...');
  const createRes = await fetch(`${baseUrl}/api/backup/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (!createRes.ok) {
    throw new Error(`backup:create returned ${createRes.status}`);
  }
  const createJson = await createRes.json();
  if (!createJson.ok) throw new Error('backup:create returned ok=false');
  console.log(`  [smoke] backup:create ok (${createJson.backup?.name})`);

  console.log('\nSmoke tests passed.');
}

if (smokeOnly) {
  const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://localhost:18900';
  await runSmokeTests(baseUrl);
} else {
  for (const task of tasks) {
    await runTask(task);
  }
  console.log('\nAll verification tasks passed.');
}
