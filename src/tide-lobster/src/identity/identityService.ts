import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { settings } from '../config.js';

export interface PersonaInfo {
  path: string;
  name: string;
  description: string;
}

export class IdentityService {
  private identityDir: string;

  constructor() {
    this.identityDir = settings.identityDir;
  }

  loadSystemPrompt(personaPath?: string): string {
    const parts: string[] = [];

    const soulContent = this.readFileSafe(
      join(this.identityDir, 'runtime', 'soul.summary.md')
    );
    if (soulContent) parts.push(soulContent);

    const agentContent = this.readFileSafe(
      join(this.identityDir, 'runtime', 'agent.core.md')
    );
    if (agentContent) parts.push(agentContent);

    if (personaPath) {
      const personaContent = this.readFileSafe(
        join(this.identityDir, 'personas', personaPath)
      );
      if (personaContent) parts.push(personaContent);
    }

    return parts.join('\n\n---\n\n');
  }

  listPersonas(): PersonaInfo[] {
    const personasDir = join(this.identityDir, 'personas');
    if (!existsSync(personasDir)) return [];

    let files: string[];
    try {
      files = readdirSync(personasDir).filter((f) => f.endsWith('.md'));
    } catch {
      return [];
    }

    return files.map((file) => {
      const content = this.readFileSafe(join(personasDir, file)) ?? '';
      return {
        path: file,
        name: this.extractTitle(content) ?? file.replace(/\.md$/, ''),
        description: this.extractFirstParagraph(content),
      };
    });
  }

  private readFileSafe(filePath: string): string | null {
    if (!existsSync(filePath)) return null;
    try {
      return readFileSync(filePath, 'utf-8').trim();
    } catch {
      return null;
    }
  }

  private extractTitle(content: string): string | null {
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : null;
  }

  private extractFirstParagraph(content: string): string {
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        return trimmed.slice(0, 100);
      }
    }
    return '';
  }
}
