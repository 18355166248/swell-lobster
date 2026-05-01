import { spawn } from 'node:child_process';

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
    label: 'web:build',
    command: 'npm',
    args: ['run', 'build'],
    cwd: 'apps/web-ui',
  },
  {
    label: 'desktop:check',
    command: 'cargo',
    args: ['check', '--manifest-path', 'apps/desktop/src-tauri/Cargo.toml'],
    cwd: '.',
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

for (const task of tasks) {
  await runTask(task);
}

console.log('\nAll verification tasks passed.');
