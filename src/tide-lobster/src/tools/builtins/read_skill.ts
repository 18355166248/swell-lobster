import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { settings } from '../../config.js';
import { ToolRiskLevel, type ToolDef } from '../types.js';

function getAllowedRoots(): string[] {
  const roots = [
    join(settings.projectRoot, 'SKILLS'),
    join(settings.dataDir, 'skills'),
  ];
  return roots.map((r) => {
    try {
      return realpathSync(r);
    } catch {
      return resolve(r);
    }
  });
}

function isPathAllowed(filePath: string, roots: string[]): boolean {
  let real: string;
  try {
    real = realpathSync(filePath);
  } catch {
    return false;
  }
  return roots.some((root) => real === root || real.startsWith(root + sep));
}

export const readSkillTool: ToolDef = {
  name: 'read_skill',
  description:
    'Read the full content of a SKILL.md file. Only paths inside SKILLS/ or data/skills/ are allowed.',
  permission: {
    riskLevel: ToolRiskLevel.readonly,
    requiresApproval: true,
    pathScopes: ['SKILLS/', 'data/skills/'],
    sideEffectSummary: 'Reads skill definition files from the allowed skill directories.',
  },
  parameters: {
    path: {
      type: 'string',
      description: 'Absolute path to the SKILL.md file, as listed in <location>.',
      required: true,
    },
  },
  async execute({ path: filePath }) {
    const target = String(filePath ?? '').trim();
    if (!target) return 'Error: path is required.';

    const roots = getAllowedRoots();
    if (!isPathAllowed(target, roots)) {
      return 'Error: path is outside the allowed skills directories.';
    }

    if (!existsSync(target)) return `Error: file not found: ${target}`;

    try {
      return readFileSync(target, 'utf-8');
    } catch (e) {
      return `Error reading file: ${e instanceof Error ? e.message : String(e)}`;
    }
  },
};
