import { delegateTask } from '../../agents/delegateService.js';
import type { ToolDef } from '../types.js';

export const delegateTaskTool: ToolDef = {
  name: 'delegate_task',
  description:
    'Delegate a focused task to a child agent session, optionally using an agent template.',
  parameters: {
    task: {
      type: 'string',
      description: 'The concrete task to hand off to the child agent.',
      required: true,
    },
    templateId: {
      type: 'string',
      description: 'Optional agent template id for the child agent session.',
    },
    endpointName: {
      type: 'string',
      description: 'Optional endpoint name to use. Defaults to the parent session endpoint.',
    },
    timeoutSeconds: {
      type: 'number',
      description: 'Optional timeout in seconds. Defaults to 60 and is capped at 120.',
    },
  },
  async execute(args, context) {
    // 透传父会话 id，未显式指定 endpoint 时让子会话复用父会话端点。
    const result = await delegateTask({
      task: String(args.task ?? ''),
      templateId: typeof args.templateId === 'string' ? args.templateId : null,
      endpointName: typeof args.endpointName === 'string' ? args.endpointName : null,
      timeoutSeconds: args.timeoutSeconds,
      parentSessionId: context?.sessionId,
    });

    return JSON.stringify(result, null, 2);
  },
};
