export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  systemPrompt: string;
  recommendedTools?: string[];
  recommendedPersona?: string;
  icon?: string;
}
